// Рік — від дня народження до наступного дня народження.
// Над лінією — твоє: позначки (тег на ніжці) і періоди (дуги). Під лінією — щорічне: дні народження, річниці, свята.
// life: { birthday: 'YYYY-MM-DD'|null, marks: [{ id, title, note, start, end|null }],
//         dates: [{ id, name, kind: 'bday'|'anniv'|'other', md: 'MM-DD', year|null }], holidays: [ids] }
window.LP = window.LP || {};

(function (LP) {
  const u = LP.u;
  const DAY = 86400000;
  const pad = (n) => String(n).padStart(2, '0');

  function orthodoxEaster(y) {
    const a = y % 4, b = y % 7, c = y % 19;
    const d = (19 * c + 15) % 30, e = (2 * a + 4 * b - d + 34) % 7;
    const m = Math.floor((d + e + 114) / 31), day = ((d + e + 114) % 31) + 1;
    return u.addDays(`${y}-${pad(m)}-${pad(day)}`, 13);
  }
  const HOLIDAYS = [
    { id: 'newyear', name: 'Новий рік', md: '01-01' },
    { id: 'valentine', name: 'День закоханих', md: '02-14' },
    { id: 'women', name: '8 березня', md: '03-08' },
    { id: 'easter', name: 'Великдень', at: orthodoxEaster },
    { id: 'trinity', name: 'Трійця', at: (y) => u.addDays(orthodoxEaster(y), 49) },
    { id: 'constitution', name: 'День Конституції', md: '06-28' },
    { id: 'independence', name: 'День Незалежності', md: '08-24' },
    { id: 'defenders', name: 'День захисників', md: '10-01' },
    { id: 'halloween', name: 'Хелловін', md: '10-31' },
    { id: 'nicholas', name: 'День святого Миколая', md: '12-06' },
    { id: 'christmas', name: 'Різдво', md: '12-25' },
  ];
  LP.DEFAULT_HOLIDAYS = ['newyear', 'easter', 'halloween'];
  const KIND = { bday: 'День народження', anniv: 'Річниця', other: 'Інша дата' };

  const life = () => LP.data.life;
  function posOf(key) {
    const [t, id] = [key.slice(0, 1), key.slice(2)];
    const L = life();
    const o = t === 'm' ? L.marks.find((m) => m.id === id) : t === 'd' ? L.dates.find((d) => d.id === id) : L.holPos[id];
    return o && o.tx != null ? { tx: o.tx, ty: o.ty } : null;
  }
  function savePos(key, tx, ty) {
    const [t, id] = [key.slice(0, 1), key.slice(2)];
    const L = life();
    const o = t === 'm' ? L.marks.find((m) => m.id === id) : t === 'd' ? L.dates.find((d) => d.id === id) : (L.holPos[id] = L.holPos[id] || {});
    if (o) Object.assign(o, { tx: Math.round(tx), ty: Math.round(ty) });
  }
  const days = (a, b) => Math.round((u.parse(b) - u.parse(a)) / DAY);
  const mdIn = (y, md) => {
    let [m, d] = md.split('-').map(Number);
    if (m === 2 && d === 29 && !(y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0))) d = 28;
    return `${y}-${pad(m)}-${pad(d)}`;
  };

  // межі року: від останнього дня народження до наступного (без дати — календарний рік)
  function range(offset) {
    const t = u.today();
    const ty = Number(t.slice(0, 4));
    const bd = life().birthday;
    let from;
    if (bd) {
      from = mdIn(ty, bd.slice(5));
      if (from > t) from = mdIn(ty - 1, bd.slice(5));
    } else from = `${ty}-01-01`;
    const fy = Number(from.slice(0, 4)) + offset;
    from = bd ? mdIn(fy, bd.slice(5)) : `${fy}-01-01`;
    const to = bd ? mdIn(fy + 1, bd.slice(5)) : `${fy + 1}-01-01`;
    return { from, to, age: bd ? fy - Number(bd.slice(0, 4)) : null };
  }

  // щорічні дати й свята, що потрапляють у [from, to)
  function yearly(from, to) {
    const out = [];
    const y0 = Number(from.slice(0, 4)), y1 = Number(to.slice(0, 4));
    for (let y = y0; y <= y1; y++) {
      life().dates.forEach((d) => {
        const date = mdIn(y, d.md);
        if (date < from || date >= to) return;
        const n = d.year ? y - d.year : null;
        out.push({ type: 'date', id: d.id, date, kind: d.kind, label: d.name + (n > 0 ? ` · ${n}` : ''), title: `${KIND[d.kind]}: ${d.name}${n > 0 ? (d.kind === 'bday' ? ` — ${n} р.` : ` — ${n}-а`) : ''}` });
      });
      HOLIDAYS.filter((h) => life().holidays.includes(h.id)).forEach((h) => {
        const date = h.at ? h.at(y) : mdIn(y, h.md);
        if (date < from || date >= to) return;
        out.push({ type: 'holiday', id: h.id, date, label: h.name, title: h.name });
      });
    }
    return out.sort((a, b) => (a.date < b.date ? -1 : 1));
  }

  // ширина підпису (моно 10–11px)
  const textW = (s, k = 6.7) => Math.ceil(String(s).length * k) + 14;

  let justDragged = 0;
  function render(root) {
    const L = life();
    const off = LP.view.yearOffset || 0;
    const { from, to, age } = range(off);
    const total = days(from, to);
    const today = u.today();
    const mob = LP.isMobile && LP.isMobile();
    const W = mob ? 980 : Math.max(640, (root.clientWidth || document.documentElement.clientWidth) - 64);
    const PADL = 28, PADR = 28;
    const span = W - PADL - PADR;
    const xOf = (date) => PADL + (days(from, date) / total) * span;
    const LY = 250; // лінія
    const nowIn = today >= from && today < to;
    const nowX = nowIn ? xOf(today) : null;

    // --- над лінією: мої позначки й періоди
    const marks = L.marks.filter((m) => (m.end || m.start) >= from && m.start < to);
    const points = marks.filter((m) => !m.end).sort((a, b) => (a.start < b.start ? -1 : 1));
    const spans = marks.filter((m) => m.end).sort((a, b) => days(b.start, b.end) - days(a.start, a.end));
    let arcs = '', arcLabels = '', arcEnds = '';
    const geo = {};
    const arcD = (a, w, h) => `M${a},${LY} A${w / 2},${h} 0 0 1 ${a + w},${LY}`;
    const autoH = (w) => u.clamp(w * 0.42, 26, 200);
    spans.forEach((m) => {
      const a = Math.max(PADL, xOf(m.start < from ? from : m.start));
      const b = Math.min(PADL + span, xOf(m.end >= to ? to : m.end));
      const w = Math.max(b - a, 6);
      const h = m.h ? u.clamp(m.h, 18, LY - 24) : autoH(w);
      geo[m.id] = { a, w, h };
      const past = m.end < today;
      arcs += `<path class="yr-arc ${past ? 'is-past' : ''}" data-arc="${m.id}" d="${arcD(a, w, h)}" data-mark="${m.id}"><title>${u.esc(m.title)} · ${u.fmtDay(m.start)} — ${u.fmtDay(m.end)}</title></path>`;
      arcEnds += `<circle class="yr-arc-end" data-arcend="${m.id}" data-end="s" cx="${a}" cy="${LY}" r="7"><title>Тягни — змінити початок</title></circle><circle class="yr-arc-end" data-arcend="${m.id}" data-end="e" cx="${a + w}" cy="${LY}" r="7"><title>Тягни — змінити кінець</title></circle>`;
      arcLabels += `<button type="button" class="yr-tag yr-arc-tag ${past ? 'is-past' : ''}" data-mark="${m.id}" data-drag="arc" data-key="${m.id}" style="left:${a + w / 2}px;top:${LY - h}px" title="${u.esc(m.title)}${m.note ? ' — ' + u.esc(m.note) : ''} · тягни — посунути період і висоту дуги">${u.esc(m.title)}<small>${u.fmtDay(m.start)} — ${u.fmtDay(m.end)}</small></button>`;
    });
    // ніжка від точки на лінії до найближчого кута тегу
    const anchor = (left, top, th) => (top + th / 2 < LY ? [left + 1, top + th] : [left + 1, top]);
    // позначки: ніжки різної висоти, щоб підписи не налазили
    const upLevels = [];
    let stems = '', pointTags = '';
    points.forEach((m) => {
      const x = xOf(m.start);
      const w = Math.max(textW(m.title, 7.4), 64);
      let lv = upLevels.findIndex((r) => r < x - 6);
      if (lv < 0) { lv = upLevels.length; upLevels.push(0); }
      upLevels[lv] = x + w;
      const own = m.tx != null;
      const left = own ? x + m.tx : x - 1;
      const top = own ? LY + m.ty : LY - 46 - lv * 40;
      const [sx, sy] = anchor(left, top, 36);
      const past = m.start < today;
      stems += `<line class="yr-stem ${past ? 'is-past' : ''}" data-stem="m:${m.id}" x1="${x}" y1="${LY}" x2="${sx}" y2="${sy}"/><circle class="yr-pin ${past ? 'is-past' : ''}" data-pindot="${m.id}" cx="${x}" cy="${LY}" r="4.5"/><circle class="yr-pin-hit" data-pin="${m.id}" cx="${x}" cy="${LY}" r="8"><title>Тягни — перенести дату</title></circle>`;
      pointTags += `<button type="button" class="yr-tag yr-point ${past ? 'is-past' : ''}" data-mark="${m.id}" data-drag="tag" data-key="m:${m.id}" data-ax="${x}" data-ay="${LY}" style="left:${left}px;top:${top}px" title="${u.esc(m.title)}${m.note ? ' — ' + u.esc(m.note) : ''} · тягни — відсунути тег">${u.esc(m.title)}<small>${u.fmtDay(m.start)}</small></button>`;
    });

    // --- під лінією: щорічне
    const yl = yearly(from, to);
    const downLevels = [];
    let dStems = '', dTags = '';
    yl.forEach((it) => {
      const x = xOf(it.date);
      const w = textW(it.label);
      let lv = downLevels.findIndex((r) => r < x - 4);
      if (lv < 0) { lv = downLevels.length; downLevels.push(0); }
      downLevels[lv] = x + w;
      const key = (it.type === 'holiday' ? 'h:' : 'd:') + it.id;
      const pos = posOf(key);
      const left = pos ? x + pos.tx : x - 1;
      const y = pos ? LY + pos.ty : LY + 30 + lv * 26;
      const [sx, sy] = anchor(left, y, 20);
      const past = it.date < today;
      const cls = `${it.type === 'holiday' ? 'is-holiday' : 'k-' + it.kind} ${past ? 'is-past' : ''}`;
      dStems += `<line class="yr-dstem ${cls}" data-stem="${key}" x1="${x}" y1="${LY}" x2="${sx}" y2="${sy}"/><circle class="yr-ddot ${cls}" cx="${x}" cy="${LY}" r="3"/>`;
      dTags += `<button type="button" class="yr-dtag ${cls}" ${it.type === 'date' ? `data-date-id="${it.id}"` : ''} data-drag="tag" data-key="${key}" data-ax="${x}" data-ay="${LY}" style="left:${left}px;top:${y}px" title="${u.esc(it.title)} · ${u.fmtDate(it.date)} · тягни — відсунути тег">${u.esc(it.label)}</button>`;
    });
    let H = LY + 46 + Math.max(downLevels.length, 2) * 26 + 10;
    yl.forEach((it) => { const p = posOf((it.type === 'holiday' ? 'h:' : 'd:') + it.id); if (p) H = Math.max(H, LY + p.ty + 34); });

    // --- місяці
    let months = '';
    const y0 = Number(from.slice(0, 4));
    for (let y = y0; y <= y0 + 1; y++) {
      for (let m = 1; m <= 12; m++) {
        const d = `${y}-${pad(m)}-01`;
        if (d <= from || d >= to) continue;
        const x = xOf(d);
        const nxt = m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`;
        const mid = xOf(nxt < to ? nxt : to);
        months += `<line class="yr-tick" x1="${x}" y1="${LY - 7}" x2="${x}" y2="${LY + 7}"/>`;
        if (mid - x > 34) months += `<text class="yr-month" x="${x + 5}" y="${LY - 9}">${u.MONTHS[m - 1].slice(0, 3).toUpperCase()}${m === 1 ? ' ' + y : ''}</text>`;
      }
    }

    // --- лінія: пройдене суцільне, попереду — крапками
    const splitX = nowIn ? nowX : today >= to ? PADL + span : PADL;
    const line = `
      <line class="yr-line is-done" x1="${PADL}" y1="${LY}" x2="${splitX}" y2="${LY}"/>
      <line class="yr-line is-ahead" x1="${splitX}" y1="${LY}" x2="${PADL + span}" y2="${LY}"/>
      <circle class="yr-end" cx="${PADL}" cy="${LY}" r="7"/><circle class="yr-end" cx="${PADL + span}" cy="${LY}" r="7"/>`;
    const now = nowIn ? `<circle class="yr-now-halo" cx="${nowX}" cy="${LY}" r="11"/><circle class="yr-now" cx="${nowX}" cy="${LY}" r="6"/>` : '';
    const pending = LP.view.yearPending && LP.view.yearPending.date >= from && LP.view.yearPending.date < to ? LP.view.yearPending : null;

    // --- найближче
    const ahead = [];
    yearly(today, u.addDays(today, 120)).forEach((it) => ahead.push({ date: it.date, text: it.title }));
    L.marks.filter((m) => m.start >= today && days(today, m.start) <= 120).forEach((m) => ahead.push({ date: m.start, text: m.title + (m.end ? ` (до ${u.fmtDay(m.end)})` : ''), mark: m.id }));
    if (L.birthday) {
      const nb = range(0).to;
      if (days(today, nb) <= 120) ahead.push({ date: nb, text: 'Твій день народження' });
    }
    ahead.sort((a, b) => (a.date < b.date ? -1 : 1));

    const bdLeft = L.birthday ? days(today, range(0).to) : null;
    root.innerHTML = `
      <section class="year">
        <div class="yr-head">
          <button type="button" class="sq-btn" data-yr="-1" aria-label="Попередній рік">‹</button>
          <div class="yr-title">
            <span class="label">${from.slice(0, 4)} → ${to.slice(0, 4)}</span>
            <span class="mono">${u.fmtDay(from).toUpperCase()} — ${u.fmtDay(to).toUpperCase()}${age != null ? ` · ТОБІ ${age}, ПОТІМ ${age + 1}` : ''}</span>
          </div>
          <button type="button" class="sq-btn" data-yr="1" aria-label="Наступний рік">›</button>
          ${off ? '<button type="button" class="btn btn-sm" data-yr="0">ЦЕЙ РІК</button>' : ''}
          <span class="yr-spacer"></span>
          ${L.birthday
            ? `<button type="button" class="link-btn mono" data-bday>ДЕНЬ НАРОДЖЕННЯ ${u.fmtDate(L.birthday).toUpperCase()}${off === 0 ? ` · ЧЕРЕЗ ${bdLeft} ДН.` : ''}</button>`
            : '<button type="button" class="btn btn-primary" data-bday>ВКАЖИ СВІЙ ДЕНЬ НАРОДЖЕННЯ</button>'}
        </div>
        ${L.birthday ? '' : '<p class="hint yr-hint">Поки лінія — це календарний рік. З днем народження вона почнеться й закінчиться в нього.</p>'}
        <div class="yr-scroll"><div class="yr-stage" style="height:${H}px;width:${W}px">
          <svg class="yr-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
            <rect class="yr-hit" x="${PADL - 8}" y="${LY - 26}" width="${span + 16}" height="52"/>
            ${arcs}${months}${line}${dStems}${stems}${arcEnds}${now}
            ${pending ? `<circle class="yr-pending" cx="${xOf(pending.date)}" cy="${LY}" r="6"/>` : ''}
            <path class="yr-temp" d="" hidden/>
            <line class="yr-guide" x1="0" y1="${LY - 22}" x2="0" y2="${LY + 22}" hidden/>
          </svg>
          ${arcLabels}${pointTags}${dTags}
          ${nowIn ? `<span class="yr-now-label mono" style="left:${nowX}px;top:${LY + 12}px">ЗАРАЗ</span>` : ''}
          <span class="yr-tip mono" hidden></span>
          ${pending ? `
            <div class="yr-pop" style="left:${u.clamp(xOf(pending.date) - 130, 0, W - 270)}px;top:${LY + 22}px">
              <div class="mono yr-pop-date">${u.fmtDate(pending.date).toUpperCase()}</div>
              <input type="text" class="yr-pop-input" maxlength="60" placeholder="Що тут буде?" aria-label="Назва позначки">
              <div class="yr-pop-row"><button type="button" class="btn btn-primary btn-sm" data-pend-save>ПОЗНАЧКА</button><button type="button" class="btn btn-sm" data-pend-cancel>✕</button></div>
              <p class="hint">Або клікни ще раз на лінії — вийде період.</p>
            </div>` : ''}
        </div>
        </div>
        <p class="hint yr-legend">${mob ? 'Гортай лінію вбік. Тап по лінії — позначка, ще один тап — період. Тап по тегу — змінити.' : 'Клік по лінії — позначка, ще один клік — період (або протягни). Теги тягаються, дуга — за підпис чи кінці. Клік по тегу — змінити.'}</p>
        <div class="yr-cols">
          <div class="yr-col">
            <div class="side-head"><span class="label">НАЙБЛИЖЧЕ</span><span class="mono muted">120 ДН.</span></div>
            <ul class="yr-list">${ahead.slice(0, 10).map((a) => `<li><span class="mono">${u.fmtDay(a.date).toUpperCase()}</span><span>${u.esc(a.text)}</span><span class="mono muted">${a.date === today ? 'СЬОГОДНІ' : `ЧЕРЕЗ ${days(today, a.date)} ДН.`}</span></li>`).join('') || '<li class="muted">Нічого не заплановано.</li>'}</ul>
          </div>
          <div class="yr-col">
            <div class="side-head"><span class="label">ДНІ НАРОДЖЕННЯ Й РІЧНИЦІ</span><button type="button" class="btn btn-sm" data-add-date>+ ДОДАТИ</button></div>
            <ul class="yr-list">${L.dates.slice().sort((a, b) => (a.md < b.md ? -1 : 1)).map((d) => `<li><button type="button" class="yr-row" data-date-id="${d.id}"><span class="mono">${Number(d.md.slice(3))} ${u.fmtDay('2000-' + d.md).split(' ')[1].toUpperCase()}</span><span>${u.esc(d.name)}</span><span class="mono muted">${d.kind === 'bday' ? 'ДН' : d.kind === 'anniv' ? 'РІЧНИЦЯ' : ''}</span></button></li>`).join('') || '<li class="muted">Додай близьких — їхні дні народження стануть під лінією.</li>'}</ul>
          </div>
          <div class="yr-col">
            <div class="side-head"><span class="label">СВЯТА</span></div>
            <div class="yr-hols">${HOLIDAYS.map((h) => `<label class="check"><input type="checkbox" data-hol="${h.id}" ${L.holidays.includes(h.id) ? 'checked' : ''}> ${h.name}</label>`).join('')}</div>
          </div>
        </div>
      </section>`;

    const stage = root.querySelector('.yr-stage');
    // телефон: лінія ширша за екран — гортається вбік, на старті показує «зараз»
    const scroller = root.querySelector('.yr-scroll');
    if (mob && scroller) {
      const keep = LP.view.yearScroll;
      scroller.scrollLeft = keep != null ? keep : Math.max(0, (nowIn ? nowX : 0) - scroller.clientWidth / 2);
      scroller.addEventListener('scroll', () => { LP.view.yearScroll = scroller.scrollLeft; }, { passive: true });
    }
    const svg = stage.querySelector('svg');
    const guide = svg.querySelector('.yr-guide');
    const temp = svg.querySelector('.yr-temp');
    const tip = stage.querySelector('.yr-tip');
    const hit = svg.querySelector('.yr-hit');
    const dateAt = (clientX) => {
      const r = stage.getBoundingClientRect();
      const k = u.clamp((clientX - r.left - PADL) / span, 0, 0.99999);
      return u.addDays(from, Math.floor(k * total));
    };
    const showGuide = (clientX) => {
      const d = dateAt(clientX);
      const x = xOf(d);
      guide.hidden = false;
      guide.setAttribute('x1', x); guide.setAttribute('x2', x);
      tip.hidden = false;
      tip.textContent = u.fmtDay(d).toUpperCase();
      tip.style.left = x + 'px';
      tip.style.top = LY - 44 + 'px';
    };
    hit.addEventListener('pointermove', (e) => showGuide(e.clientX));
    hit.addEventListener('pointerleave', () => { guide.hidden = true; tip.hidden = true; });

    hit.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const a = dateAt(e.clientX);
      const x0 = e.clientX;
      let dragging = false, b = a;
      const move = (m) => {
        showGuide(m.clientX);
        if (!dragging && Math.abs(m.clientX - x0) < 6) return;
        dragging = true;
        b = dateAt(m.clientX);
        const [s, f] = a <= b ? [a, b] : [b, a];
        const xa = xOf(s), w = Math.max(xOf(f) - xa, 4);
        temp.hidden = false;
        temp.setAttribute('d', `M${xa},${LY} A${w / 2},${u.clamp(w * 0.42, 26, 200)} 0 0 1 ${xa + w},${LY}`);
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        temp.hidden = true;
        const p = LP.view.yearPending;
        if (dragging && a !== b) return openMarkForm(null, a <= b ? a : b, a <= b ? b : a);
        if (p && p.date !== a) {
          LP.view.yearPending = null;
          return openMarkForm(null, p.date < a ? p.date : a, p.date < a ? a : p.date);
        }
        LP.view.yearPending = { date: a };
        LP.render();
        const inp = root.querySelector('.yr-pop-input');
        if (inp) inp.focus();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });

    // --- тягати: теги, дуги (за підпис чи кінці), позначки по лінії
    const stemOf = (key) => svg.querySelector(`[data-stem="${CSS.escape(key)}"]`);
    const setStem = (key, x1, left, top, th) => {
      const st = stemOf(key);
      if (!st) return;
      const [ax, ay] = anchor(left, top, th);
      if (x1 != null) st.setAttribute('x1', x1);
      st.setAttribute('x2', ax); st.setAttribute('y2', ay);
    };
    const setArc = (id, a, w, h) => {
      svg.querySelector(`[data-arc="${id}"]`).setAttribute('d', arcD(a, w, h));
      const lab = stage.querySelector(`.yr-arc-tag[data-key="${id}"]`);
      lab.style.left = a + w / 2 + 'px'; lab.style.top = LY - h + 'px';
      const [es, ee] = svg.querySelectorAll(`[data-arcend="${id}"]`);
      es.setAttribute('cx', a); ee.setAttribute('cx', a + w);
    };
    stage.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const tag = e.target.closest('[data-drag]');
      const end = e.target.closest('[data-arcend]');
      const pin = e.target.closest('[data-pin]');
      if (!tag && !end && !pin) return;
      e.preventDefault();
      const x0 = e.clientX, y0 = e.clientY;
      let moved = false, apply, finish;
      if (tag && tag.dataset.drag === 'arc') {
        const m = LP.lifeMark(tag.dataset.key), g = geo[m.id];
        let shift = 0, h = g.h;
        apply = (mv) => {
          shift = Math.round(((mv.clientX - x0) / span) * total);
          h = u.clamp(g.h - (mv.clientY - y0), 18, LY - 24);
          setArc(m.id, g.a + (shift / total) * span, g.w, h);
        };
        finish = () => { m.start = u.addDays(m.start, shift); m.end = u.addDays(m.end, shift); m.h = Math.round(h); };
      } else if (tag) {
        const key = tag.dataset.key, ax = Number(tag.dataset.ax);
        const l0 = parseFloat(tag.style.left), t0 = parseFloat(tag.style.top);
        let left = l0, top = t0;
        apply = (mv) => {
          left = u.clamp(l0 + mv.clientX - x0, -20, W - 40);
          top = u.clamp(t0 + mv.clientY - y0, 0, H + 160);
          tag.style.left = left + 'px'; tag.style.top = top + 'px';
          setStem(key, null, left, top, tag.offsetHeight);
        };
        finish = () => savePos(key, left - ax, top - LY);
      } else if (end) {
        const m = LP.lifeMark(end.dataset.arcend), which = end.dataset.end;
        let ds = m.start, de = m.end;
        apply = (mv) => {
          const d = dateAt(mv.clientX);
          if (which === 's') ds = d < de ? d : u.addDays(de, -1);
          else de = d > ds ? d : u.addDays(ds, 1);
          const a = xOf(ds), w = Math.max(xOf(de) - a, 6);
          setArc(m.id, a, w, m.h ? u.clamp(m.h, 18, LY - 24) : autoH(w));
          showGuide(mv.clientX);
        };
        finish = () => { m.start = ds; m.end = de; };
      } else {
        const m = LP.lifeMark(pin.dataset.pin);
        const tagEl = stage.querySelector(`.yr-point[data-key="m:${m.id}"]`);
        const dot = svg.querySelector(`[data-pindot="${m.id}"]`);
        const x00 = xOf(m.start), l0 = parseFloat(tagEl.style.left);
        let d = m.start;
        apply = (mv) => {
          d = dateAt(mv.clientX);
          const nx = xOf(d);
          pin.setAttribute('cx', nx); dot.setAttribute('cx', nx);
          tagEl.style.left = l0 + nx - x00 + 'px';
          setStem('m:' + m.id, nx, l0 + nx - x00, parseFloat(tagEl.style.top), tagEl.offsetHeight);
          showGuide(mv.clientX);
        };
        finish = () => { m.start = d; };
      }
      const move = (mv) => {
        if (!moved && Math.hypot(mv.clientX - x0, mv.clientY - y0) < 4) return;
        if (!moved) stage.classList.add('is-dragging');
        moved = true;
        apply(mv);
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        stage.classList.remove('is-dragging');
        if (moved) { justDragged = Date.now(); finish(); LP.save(); }
        else if (pin) openMarkForm(LP.lifeMark(pin.dataset.pin));
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });

    const pop = stage.querySelector('.yr-pop');
    if (pop) {
      const save = () => {
        const title = pop.querySelector('input').value.trim();
        if (!title) return pop.querySelector('input').focus();
        L.marks.push({ id: u.uid(), title, note: '', start: LP.view.yearPending.date, end: null });
        LP.view.yearPending = null;
        LP.save();
      };
      pop.querySelector('[data-pend-save]').addEventListener('click', save);
      pop.querySelector('[data-pend-cancel]').addEventListener('click', () => { LP.view.yearPending = null; LP.render(); });
      pop.querySelector('input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); save(); }
        if (e.key === 'Escape') { e.stopPropagation(); LP.view.yearPending = null; LP.render(); }
      });
    }

    root.querySelector('.year').addEventListener('click', (e) => {
      const t = e.target;
      if (Date.now() - justDragged < 120) return;
      const yr = t.closest('[data-yr]');
      if (yr) {
        LP.view.yearOffset = yr.dataset.yr === '0' ? 0 : off + Number(yr.dataset.yr);
        LP.view.yearPending = null;
        return LP.render();
      }
      const mk = t.closest('[data-mark]');
      if (mk) return openMarkForm(LP.lifeMark(mk.dataset.mark));
      const di = t.closest('[data-date-id]');
      if (di) return openDateForm(L.dates.find((d) => d.id === di.dataset.dateId));
      if (t.closest('[data-add-date]')) return openDateForm(null);
      if (t.closest('[data-bday]')) return openBirthdayForm();
    });
    root.querySelectorAll('[data-hol]').forEach((cb) => cb.addEventListener('change', () => {
      const id = cb.dataset.hol;
      L.holidays = cb.checked ? L.holidays.concat(id) : L.holidays.filter((x) => x !== id);
      LP.save();
    }));
  }

  LP.lifeMark = (id) => life().marks.find((m) => m.id === id) || null;

  function openMarkForm(m, start, end) {
    const isNew = !m;
    const L = life();
    m = m || { title: '', note: '', start, end: end || null };
    LP.modal({
      title: isNew ? (m.end ? 'Період' : 'Позначка') : m.end ? 'Період' : 'Позначка',
      submitText: isNew ? 'Додати' : 'Зберегти',
      body: `
        <label class="field"><span>Що це</span><input type="text" name="title" maxlength="60" value="${u.esc(m.title)}" placeholder="${m.end ? 'Подорож, навчання, проєкт…' : 'Подія, дедлайн, концерт…'}"></label>
        <div class="row">
          <label class="field"><span>${m.end ? 'Від' : 'Коли'}</span><input type="date" name="start" value="${m.start}"></label>
          <label class="field"><span>До${m.end ? '' : ' (якщо це період)'}</span><input type="date" name="end" value="${m.end || ''}"></label>
        </div>
        <label class="field"><span>Нотатка</span><textarea name="note" rows="3" maxlength="600">${u.esc(m.note || '')}</textarea></label>`,
      extra: isNew ? [] : [{ text: 'Видалити', className: 'btn-danger', onClick: () => { L.marks = L.marks.filter((x) => x.id !== m.id); LP.save(); } }],
      onSubmit: (form) => {
        const title = form.title.value.trim();
        const s = form.start.value, f = form.end.value || null;
        const errs = [];
        if (!title) errs.push('Назви позначку.');
        if (!s) errs.push('Вкажи дату.');
        if (s && f && f <= s) errs.push('Кінець має бути пізніше за початок.');
        if (errs.length) return LP.showErrors(form, errs), false;
        Object.assign(m, { title, start: s, end: f, note: form.note.value.trim() });
        if (isNew) L.marks.push(Object.assign({ id: u.uid() }, m));
        LP.save();
      },
    });
  }

  function openDateForm(d) {
    const isNew = !d;
    const L = life();
    d = d || { name: '', kind: 'bday', md: u.today().slice(5), year: null };
    const [mm, dd] = d.md.split('-').map(Number);
    LP.modal({
      title: isNew ? 'Щорічна дата' : d.name,
      submitText: isNew ? 'Додати' : 'Зберегти',
      body: `
        <label class="field"><span>Хто / що</span><input type="text" name="name" maxlength="50" value="${u.esc(d.name)}" placeholder="Мама, Оля, весілля…"></label>
        <div class="field"><span>Що за дата</span><div class="seg seg-sm">
          ${Object.keys(KIND).map((k) => `<label><input type="radio" name="kind" value="${k}" ${d.kind === k ? 'checked' : ''}><span>${KIND[k]}</span></label>`).join('')}
        </div></div>
        <div class="row">
          <label class="field"><span>День</span><select name="day">${Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}" ${i + 1 === dd ? 'selected' : ''}>${i + 1}</option>`).join('')}</select></label>
          <label class="field"><span>Місяць</span><select name="month">${u.MONTHS.map((n, i) => `<option value="${i + 1}" ${i + 1 === mm ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
          <label class="field"><span>Рік (як знаєш)</span><input type="number" name="year" min="1900" max="2100" value="${d.year || ''}" placeholder="—"></label>
        </div>`,
      extra: isNew ? [] : [{ text: 'Видалити', className: 'btn-danger', onClick: () => { L.dates = L.dates.filter((x) => x.id !== d.id); LP.save(); } }],
      onSubmit: (form) => {
        const name = form.name.value.trim();
        if (!name) return LP.showErrors(form, ['Напиши імʼя чи назву.']), false;
        const m = Number(form.month.value), day = Math.min(Number(form.day.value), [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]);
        const y = parseInt(form.year.value, 10);
        Object.assign(d, { name, kind: form.querySelector('input[name=kind]:checked').value, md: `${pad(m)}-${pad(day)}`, year: y > 1900 ? y : null });
        if (isNew) L.dates.push(Object.assign({ id: u.uid() }, d));
        LP.save();
      },
    });
  }

  function openBirthdayForm() {
    const L = life();
    LP.modal({
      title: 'Твій день народження',
      submitText: 'Зберегти',
      body: `
        <label class="field"><span>Дата</span><input type="date" name="bd" value="${L.birthday || ''}" max="${u.today()}"></label>
        <p class="hint">Лінія року почнеться в цей день і закінчиться в наступний день народження.</p>`,
      onSubmit: (form) => {
        if (!form.bd.value) return LP.showErrors(form, ['Вкажи дату.']), false;
        L.birthday = form.bd.value;
        LP.view.yearOffset = 0;
        LP.save();
      },
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && LP.view && LP.view.yearPending && !document.querySelector('.modal-backdrop:not(.is-leaving)')) {
      LP.view.yearPending = null;
      LP.render();
    }
  });
  let rt = null;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => { if (LP.view && LP.view.tab === 'year') LP.render(); }, 150);
  });

  LP.views = LP.views || {};
  LP.views.year = { render };
})(window.LP);
