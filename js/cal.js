// Календарі: події з Google Calendar / Outlook / iCloud показуються в «Тижні» (за секретним iCal-посиланням),
// а розклад із планера можна віддати в календар як підписку. Обидва напрямки — лише читання.
window.LP = window.LP || {};

(function (LP) {
  const u = LP.u;
  const PAST = 7, AHEAD = 45; // вікно подій із зовнішніх календарів, днів
  const FEED_AHEAD = 56;      // на скільки днів уперед віддаємо свій розклад
  const FEED_URL = 'https://ngxtrzjdpqmozhjeqgqw.supabase.co/functions/v1/cal-feed?t=';
  const cals = () => {
    const c = (LP.data.cals = LP.data.cals && typeof LP.data.cals === 'object' ? LP.data.cals : {});
    if (!Array.isArray(c.sources)) c.sources = [];
    if (!Array.isArray(c.items)) c.items = [];
    return c;
  };

  // ---------- розбір iCalendar ----------
  const WIN_TZ = {
    'FLE Standard Time': 'Europe/Kyiv', 'E. Europe Standard Time': 'Europe/Chisinau', 'GTB Standard Time': 'Europe/Bucharest',
    'Central European Standard Time': 'Europe/Warsaw', 'Central Europe Standard Time': 'Europe/Budapest', 'W. Europe Standard Time': 'Europe/Berlin',
    'Romance Standard Time': 'Europe/Paris', 'GMT Standard Time': 'Europe/London', 'Greenwich Standard Time': 'UTC', UTC: 'UTC',
    'Eastern Standard Time': 'America/New_York', 'Central Standard Time': 'America/Chicago', 'Mountain Standard Time': 'America/Denver', 'Pacific Standard Time': 'America/Los_Angeles',
    'Turkey Standard Time': 'Europe/Istanbul', 'Israel Standard Time': 'Asia/Jerusalem',
  };
  function tzOffset(tz, t) {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
    const p = {};
    f.formatToParts(new Date(t)).forEach((x) => (p[x.type] = x.value));
    return Date.UTC(+p.year, p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - t;
  }
  // значення DTSTART/DTEND → { all: true, date } або { t: Date } у місцевому часі пристрою
  function parseWhen(value, params) {
    const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
    if (!m) return null;
    const [, y, mo, d, h, mi, s, z] = m;
    if (h == null) return { all: true, date: `${y}-${mo}-${d}` };
    if (z) return { t: new Date(Date.UTC(+y, mo - 1, +d, +h, +mi, +(s || 0))) };
    let tz = (params.TZID || '').replace(/^"|"$/g, '');
    tz = WIN_TZ[tz] || tz;
    if (tz) {
      try {
        const wall = Date.UTC(+y, mo - 1, +d, +h, +mi, +(s || 0));
        let t = wall - tzOffset(tz, wall);
        t = wall - tzOffset(tz, t);
        return { t: new Date(t) };
      } catch (e) { /* невідомий пояс — рахуємо як місцевий час */ }
    }
    return { t: new Date(+y, mo - 1, +d, +h, +mi, +(s || 0)) };
  }
  const unesc = (s) => s.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();

  LP.parseICS = function (text) {
    const lines = String(text).replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
    const out = [];
    let ev = null, depth = 0;
    for (const line of lines) {
      if (line === 'BEGIN:VEVENT') { ev = { ex: [] }; depth = 0; continue; }
      if (!ev) continue;
      if (line.startsWith('BEGIN:')) { depth++; continue; }        // VALARM тощо
      if (line.startsWith('END:') && depth) { depth--; continue; }
      if (line === 'END:VEVENT') { if (ev.start) out.push(ev); ev = null; continue; }
      if (depth) continue;
      const k = line.indexOf(':');
      if (k < 0) continue;
      const [name, ...ps] = line.slice(0, k).split(';');
      const value = line.slice(k + 1);
      const params = {};
      ps.forEach((p) => { const i = p.indexOf('='); if (i > 0) params[p.slice(0, i).toUpperCase()] = p.slice(i + 1); });
      switch (name.toUpperCase()) {
        case 'UID': ev.uid = value; break;
        case 'SUMMARY': ev.title = unesc(value); break;
        case 'STATUS': ev.status = value.toUpperCase(); break;
        case 'TRANSP': ev.transp = value.toUpperCase(); break;
        case 'DTSTART': ev.start = parseWhen(value, params); break;
        case 'DTEND': ev.end = parseWhen(value, params); break;
        case 'DURATION': ev.dur = value; break;
        case 'RRULE': ev.rrule = Object.fromEntries(value.split(';').map((x) => x.split('=')).filter((x) => x.length === 2).map(([a, b]) => [a.toUpperCase(), b])); break;
        case 'EXDATE': value.split(',').forEach((v) => { const w = parseWhen(v, params); if (w) ev.ex.push(w); }); break;
        case 'RECURRENCE-ID': ev.rid = parseWhen(value, params); break;
        default:
      }
    }
    return out;
  };

  const DAY = 864e5;
  const dayKey = (t) => u.iso(t);
  const whenKey = (w) => (w.all ? w.date : w.t.getTime());
  const WD = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
  function durMs(ev) {
    if (ev.end && ev.start) return ev.start.all ? (u.parse(ev.end.date) - u.parse(ev.start.date)) : ev.end.t - ev.start.t;
    const m = ev.dur && /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(ev.dur);
    if (m) return ((+m[1] || 0) * 7 + (+m[2] || 0)) * DAY + (+m[3] || 0) * 36e5 + (+m[4] || 0) * 6e4 + (+m[5] || 0) * 1e3;
    return ev.start.all ? DAY : 36e5;
  }
  // усі початки події (Date у місцевому часі) у вікні [from, to]
  function starts(ev, from, to) {
    const first = ev.start.all ? u.parse(ev.start.date) : ev.start.t;
    const r = ev.rrule;
    if (!r || !r.FREQ) return first <= to ? [first] : [];
    const out = [];
    const step = Math.max(1, +r.INTERVAL || 1);
    const count = +r.COUNT || Infinity;
    let until = to;
    if (r.UNTIL) { const w = parseWhen(r.UNTIL, {}); if (w) until = new Date(Math.min(to, w.all ? u.parse(w.date).getTime() + DAY - 1 : w.t.getTime())); }
    const at = (y, m, d) => new Date(y, m, d, first.getHours(), first.getMinutes(), first.getSeconds());
    let made = 0, guard = 0;
    const push = (t) => { if (t < first) return true; made++; if (made > count || t > until) return false; out.push(t); return true; };
    const byday = (r.BYDAY || '').split(',').filter(Boolean);
    if (r.FREQ === 'DAILY') {
      for (let t = new Date(first); guard++ < 4000; t = at(t.getFullYear(), t.getMonth(), t.getDate() + step)) if (!push(t)) break;
    } else if (r.FREQ === 'WEEKLY') {
      const days = byday.length ? byday.map((x) => WD[x.slice(-2)]).filter((x) => x != null).sort() : [first.getDay()];
      const wkst = WD[r.WKST] != null ? WD[r.WKST] : 1;
      const w0 = at(first.getFullYear(), first.getMonth(), first.getDate() - ((first.getDay() - wkst + 7) % 7));
      outer: for (let w = new Date(w0); guard++ < 2000; w = at(w.getFullYear(), w.getMonth(), w.getDate() + 7 * step)) {
        for (const d of days.map((x) => (x - wkst + 7) % 7).sort((a, b) => a - b)) if (!push(at(w.getFullYear(), w.getMonth(), w.getDate() + d))) break outer;
      }
    } else if (r.FREQ === 'MONTHLY') {
      const nth = byday.length === 1 && /^(-?\d)([A-Z]{2})$/.exec(byday[0]);
      const md = +(r.BYMONTHDAY || '').split(',')[0] || first.getDate();
      for (let i = 0; guard++ < 1200; i += step) {
        const y = first.getFullYear(), m = first.getMonth() + i;
        let t;
        if (nth) {
          const n = +nth[1], wd = WD[nth[2]];
          if (n > 0) { const f = new Date(y, m, 1).getDay(); t = at(y, m, 1 + ((wd - f + 7) % 7) + (n - 1) * 7); }
          else { const l = new Date(y, m + 1, 0); t = at(y, m, l.getDate() - ((l.getDay() - wd + 7) % 7)); }
        } else t = at(y, m, md);
        if (t.getMonth() !== ((m % 12) + 12) % 12) { if (at(y, m, 1) > until) break; continue; } // 31-го в короткому місяці немає
        if (!push(t)) break;
      }
    } else if (r.FREQ === 'YEARLY') {
      for (let i = 0; guard++ < 200; i += step) if (!push(at(first.getFullYear() + i, first.getMonth(), first.getDate()))) break;
    } else if (first <= to) out.push(first);
    return out.filter((t) => t.getTime() + durMs(ev) >= from.getTime());
  }

  // події одного календаря → рядки по днях у вікні
  LP.icsToItems = function (text, src) {
    const today = u.today();
    const from = u.parse(u.addDays(today, -PAST)), to = new Date(u.parse(u.addDays(today, AHEAD)).getTime() + DAY - 1);
    const evs = LP.parseICS(text).filter((e) => e.status !== 'CANCELLED');
    const moved = new Set(evs.filter((e) => e.rid).map((e) => e.uid + '|' + whenKey(e.rid)));
    const items = [];
    evs.forEach((ev) => {
      const dur = durMs(ev);
      const skip = new Set(ev.ex.map(whenKey));
      starts(ev, from, to).forEach((t) => {
        const key = ev.start.all ? dayKey(t) : t.getTime();
        if (!ev.rid && (skip.has(key) || moved.has(ev.uid + '|' + key))) return;
        const title = ev.title || 'Без назви';
        if (ev.start.all) {
          for (let d = new Date(t), n = Math.max(1, Math.round(dur / DAY)); n-- > 0 && d <= to; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
            if (d >= from) items.push({ src, t: title, d: dayKey(d), all: 1 });
          }
        } else {
          let s = t;
          const end = new Date(t.getTime() + dur);
          for (let k = 0; k < 8 && s < end; k++) {
            const midnight = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 1);
            const e = end < midnight ? end : midnight;
            const sm = s.getHours() * 60 + s.getMinutes(), em = e === midnight ? 1440 : e.getHours() * 60 + e.getMinutes();
            if (s >= from && s <= to && em > sm) items.push({ src, t: title, d: dayKey(s), s: sm, e: em });
            s = midnight;
          }
        }
      });
    });
    return items;
  };

  // ---------- оновлення ----------
  let busy = null;
  LP.calRefresh = function () {
    const c = cals();
    if (!c.sources.length) return Promise.resolve({ ok: 0, bad: [] });
    if (busy) return busy;
    if (!LP.sync || !LP.sync.signedIn) return Promise.reject(new Error('auth'));
    busy = (async () => {
      const bad = [];
      let all = [];
      for (const s of c.sources) {
        try {
          all = all.concat(LP.icsToItems(await LP.sync.calFetch(s.url), s.id));
          s.err = null;
        } catch (e) {
          bad.push(s);
          s.err = String((e && e.message) || 'error').slice(0, 60);
          all = all.concat(c.items.filter((x) => x.src === s.id)); // не вдалося — лишаємо, що було
        }
      }
      all.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : (a.s || 0) - (b.s || 0)));
      all = all.slice(0, 800);
      const changed = JSON.stringify(all) !== JSON.stringify(c.items);
      c.items = all;
      c.at = Date.now();
      LP.save({ render: changed });
      return { ok: c.sources.length - bad.length, bad };
    })().finally(() => { busy = null; });
    return busy;
  };
  // тихе оновлення: раз на годину, коли планер відкритий
  LP.calAuto = function () {
    const c = cals();
    if (!c.sources.length || !navigator.onLine || !LP.sync || !LP.sync.signedIn) return;
    if (document.querySelector('.modal-backdrop:not(.is-leaving)')) return;
    if (c.at && Date.now() - c.at < 60 * 60 * 1000) return;
    LP.calRefresh().catch(() => {});
  };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(LP.calAuto, 1500); });
  setTimeout(LP.calAuto, 6000);
  setInterval(LP.calAuto, 10 * 60 * 1000);

  // події зовнішніх календарів на день (для «Тижня»)
  LP.calItemsOn = function (date) {
    const c = LP.data.cals;
    return c && Array.isArray(c.items) ? c.items.filter((x) => x.d === date) : [];
  };

  // ---------- свій розклад → календар ----------
  const stamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  LP.calFeed = function () {
    const tok = LP.data.settings.calToken;
    if (!tok) return null;
    const today = u.today(), from = u.addDays(today, -7), to = u.addDays(today, FEED_AHEAD);
    const items = LP.occurrences(from, to).map((o) => {
      const [y, m, d] = o.date.split('-').map(Number);
      return { u: `${o.ev.id}-${o.date}`, a: stamp(new Date(y, m - 1, d, 0, o.ev.start)), b: stamp(new Date(y, m - 1, d, 0, o.ev.end)), t: o.ev.title };
    });
    let dates = [];
    try { dates = LP.yearDates ? LP.yearDates(from, to) : []; } catch (e) { dates = []; }
    dates.forEach((x, i) => items.push({ u: `d-${x.date}-${i}`, d: x.date.replace(/-/g, ''), t: x.text }));
    return { token: tok, name: 'На свій лад', items: items.slice(0, 1500) };
  };

  // ---------- вікно «Календарі» ----------
  const hostName = (url) => {
    try {
      const h = new URL(url.replace(/^webcal:/i, 'https:')).hostname;
      return /google/.test(h) ? 'Google Calendar' : /outlook|office/.test(h) ? 'Outlook' : /icloud/.test(h) ? 'iCloud' : h;
    } catch (e) { return 'Календар'; }
  };
  LP.openCalendars = function () {
    const c = cals(), s = LP.data.settings;
    const ago = c.at ? (Date.now() - c.at < 9e4 ? 'щойно' : `${Math.round((Date.now() - c.at) / 6e4)} хв тому`) : 'ще ні';
    LP.modal({
      title: 'Календарі',
      submitText: 'Готово',
      body: `
        <div class="label">ПОДІЇ З КАЛЕНДАРЯ В ПЛАНЕРІ</div>
        <p class="hint">Події з Google Calendar, Outlook чи iCloud зʼявляться в «Тижні» поруч зі справами. Їх видно, але змінити звідси не можна.</p>
        <ul class="cal-src">${c.sources.map((x) => `<li><span><b>${u.esc(x.name)}</b><small class="${x.err ? 'is-err' : ''}">${x.err ? 'не вдалося оновити' : `${c.items.filter((i) => i.src === x.id).length} подій`}</small></span><button type="button" class="icon-btn" data-cal-del="${x.id}" aria-label="Прибрати календар">✕</button></li>`).join('') || '<li class="is-none">Поки жодного календаря.</li>'}</ul>
        <div class="cal-add"><input type="url" name="calurl" placeholder="Секретна адреса у форматі iCal (https://…ics)" autocomplete="off"><button type="button" class="btn" data-cal-add>Додати</button></div>
        <p class="hint cal-msg" hidden></p>
        ${c.sources.length ? `<p class="hint">Оновлено: ${ago}. Оновлюється само раз на годину. <button type="button" class="link-btn" data-cal-refresh>Оновити зараз</button></p>` : ''}
        <details class="cal-how"><summary class="mono">ДЕ ВЗЯТИ АДРЕСУ</summary>
          <p><b>Google Calendar</b> (з компʼютера): Налаштування → обери календар ліворуч → «Інтеграція календаря» → «Секретна адреса у форматі iCal».</p>
          <p><b>Outlook</b>: Налаштування → Календар → «Спільні календарі» → «Опублікувати календар» → посилання ICS.</p>
          <p><b>iCloud</b>: Календар → значок поруч із назвою → «Загальнодоступний календар» → скопіюй посилання.</p>
          <p>Ця адреса як ключ: хто її має, бачить календар. Планер зберігає її разом з іншими даними в зашифрованому вигляді.</p>
        </details>

        <div class="label cal-sep">РОЗКЛАД ІЗ ПЛАНЕРА В КАЛЕНДАРІ</div>
        ${s.calToken ? `
          <p class="hint">Додай цю адресу у свій календар як підписку: у Google це «Інші календарі» → «+» → «За URL-адресою», в Outlook — «Додати календар» → «Підписатися з інтернету».</p>
          <div class="cal-add"><input type="text" readonly value="${FEED_URL}${s.calToken}" data-cal-url><button type="button" class="btn" data-cal-copy>Копіювати</button></div>
          <p class="hint">Календар сам перечитує адресу раз на кілька годин, тож зміни зʼявляються не одразу. Віддаються справи на 8 тижнів уперед і дати з «Року». <button type="button" class="link-btn" data-cal-off>Вимкнути й стерти</button></p>`
        : `
          <p class="hint">Планер створить адресу-підписку, і справи зʼявляться у твоєму календарі. Для цього назви й час справ на 8 тижнів уперед зберігатимуться в хмарі відкрито (як і для нагадувань у Telegram), і їх побачить кожен, хто має адресу.</p>
          <button type="button" class="btn" data-cal-on>Створити адресу</button>`}`,
      onOpen: (form) => {
        const msg = form.querySelector('.cal-msg');
        const say = (t) => { msg.textContent = t; msg.hidden = !t; };
        const reopen = () => { LP.closeModal(); setTimeout(LP.openCalendars, 220); };
        const add = form.querySelector('[data-cal-add]');
        add.addEventListener('click', async () => {
          const url = form.calurl.value.trim().replace(/^webcal:/i, 'https:');
          if (!/^https:\/\/\S+$/i.test(url)) return say('Встав адресу, яка починається з https://');
          if (c.sources.some((x) => x.url === url)) return say('Цей календар уже додано.');
          if (!LP.sync || !LP.sync.signedIn) return say('Спершу увійди в акаунт.');
          add.disabled = true; add.textContent = 'Читаю…'; say('');
          try {
            const text = await LP.sync.calFetch(url);
            if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error('format');
            const name = (/^X-WR-CALNAME:(.+)$/m.exec(text.replace(/\r/g, '')) || [])[1];
            const src = { id: u.uid(), name: (name ? unesc(name) : hostName(url)).slice(0, 40), url };
            c.sources.push(src);
            c.items = c.items.concat(LP.icsToItems(text, src.id)).slice(0, 800);
            c.at = Date.now();
            LP.save();
            reopen();
          } catch (e) {
            add.disabled = false; add.textContent = 'Додати';
            const m = String((e && e.message) || '');
            say(m === 'host' ? 'Поки підтримуються адреси Google Calendar, Outlook та iCloud.' : m === 'format' ? 'За цією адресою немає календаря. Перевір, що це саме адреса у форматі iCal.' : 'Не вдалося прочитати календар. Перевір адресу й інтернет.');
          }
        });
        form.querySelectorAll('[data-cal-del]').forEach((b) => b.addEventListener('click', () => {
          c.sources = c.sources.filter((x) => x.id !== b.dataset.calDel);
          c.items = c.items.filter((x) => x.src !== b.dataset.calDel);
          LP.save();
          reopen();
        }));
        const rf = form.querySelector('[data-cal-refresh]');
        if (rf) rf.addEventListener('click', () => { rf.disabled = true; rf.textContent = 'Оновлюю…'; LP.calRefresh().then(reopen, () => { say('Не вдалося оновити. Перевір інтернет.'); rf.disabled = false; rf.textContent = 'Оновити зараз'; }); });
        const on = form.querySelector('[data-cal-on]');
        if (on) on.addEventListener('click', () => {
          s.calToken = Array.from(crypto.getRandomValues(new Uint8Array(18)), (x) => x.toString(16).padStart(2, '0')).join('');
          LP.save({ render: false });
          reopen();
        });
        const off = form.querySelector('[data-cal-off]');
        if (off) off.addEventListener('click', () => { s.calToken = ''; LP.save({ render: false }); reopen(); });
        const copy = form.querySelector('[data-cal-copy]');
        if (copy) copy.addEventListener('click', () => {
          const inp = form.querySelector('[data-cal-url]');
          inp.select();
          (navigator.clipboard ? navigator.clipboard.writeText(inp.value) : Promise.reject()).catch(() => document.execCommand('copy')).finally(() => { copy.textContent = 'Скопійовано'; });
        });
      },
      onSubmit: () => true,
    });
  };
})(window.LP);
