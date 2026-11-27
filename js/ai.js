// Голосовий ввід і помічник.
// Голос: розпізнавання мови браузера (uk-UA), безкоштовно. Помічник: текст іде у функцію ai-plan (Claude),
// повертається список дій; планер показує їх і виконує лише те, що людина підтвердила.
(function (LP) {
  const u = LP.u;
  const SR0 = window.SpeechRecognition || window.webkitSpeechRecognition;
  const UA = navigator.userAgent || '';
  // Opera, Brave, Vivaldi, Яндекс мають кнопку розпізнавання, але без сервера Google вона мовчить
  const BROKEN = /OPR\/|Opera|Vivaldi|YaBrowser|SamsungBrowser\/[0-9]\./i.test(UA) || !!navigator.brave;
  const SR = BROKEN ? null : SR0;
  // запис звуку для розпізнавання на сервері: працює майже скрізь, зокрема в Opera
  const CAN_REC = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  let srFailed = false; // вбудоване розпізнавання вже раз не спрацювало: далі пишемо звук
  let sttOff = false;  // сервер сказав, що розпізнавання не ввімкнене: більше туди не йдемо
  const recReady = () => CAN_REC && !sttOff && !!(LP.sync && LP.sync.signedIn);
  LP.voiceSupported = !!SR || CAN_REC;

  // як надиктувати без браузера: системний голосовий ввід пише в будь-яке поле
  LP.dictationHint = function () {
    const mobile = /Android|iPhone|iPad|iPod/i.test(UA) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(UA));
    const tail = mobile ? 'Натисни на поле й скористайся мікрофоном на клавіатурі телефону.'
      : /Mac/i.test(UA) && !/Windows/i.test(UA) ? 'Натисни на поле й двічі натисни Fn або 🌐: диктування macOS пише прямо в нього.'
      : 'Відкрий планер у Chrome чи Edge або напиши текст.';
    return `${BROKEN ? 'Цей браузер не розпізнає голос.' : 'Голос тут не спрацював.'} ${tail} Голос браузера працює в Chrome, Edge і Safari.`;
  };

  const MIC_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/></svg>`;
  // кнопку показуємо завжди: де голосу браузера немає, натиск підкаже системне диктування
  LP.micHtml = (cls = '') => `<button type="button" class="mic-btn ${cls} ${LP.voiceSupported ? '' : 'is-off'}" data-mic aria-label="Говорити" title="${LP.voiceSupported ? 'Натисни й говори. Ще раз, щоб зупинити' : 'Як надиктувати'}">${MIC_SVG}</button>`;

  // ---------- Голос ----------
  let active = null; // { btn, stop(), done: Promise } — done виконується, коли текст уже в полі
  LP.stopListening = () => { if (!active) return Promise.resolve(); const d = active.done; active.stop(); return d; };
  LP.isListening = () => !!active;

  // btn — кнопка мікрофона, field — input/textarea, куди дописується текст
  // status(text, kind) — куди писати стан ('' прибирає); без нього — короткі сповіщення
  LP.bindMic = function (btn, field, { onDone, status } = {}) {
    if (!btn || !field) return;
    const say = status || ((t) => { if (t) LP.toast(t); });
    btn.addEventListener('click', () => {
      if (active && active.btn === btn) return active.stop();
      if (btn.disabled) return;
      LP.stopListening();
      // запис цілком і розпізнавання на сервері: не губить довгих фраз і краще знає українську.
      // Вбудоване розпізнавання браузера — коли сервер недоступний або людина не ввійшла.
      if (recReady()) return record(btn, field, say, !!status, onDone);
      if (!SR || srFailed) {
        say(CAN_REC ? 'Запис голосу працює з акаунтом. Увійди або напиши текст.' : LP.dictationHint(), 'err');
        field.focus();
        return;
      }
      let rec;
      try { rec = new SR(); } catch (e) { say(LP.dictationHint(), 'err'); return; }
      rec.lang = 'uk-UA';
      rec.interimResults = true;
      rec.continuous = true;
      const base = field.value.trim();
      let finals = '';
      let committed = '';      // сказане в попередніх «сесіях» (Safari після паузи починає результати заново)
      let sessText = '', sessLen = 0, sessFirstFinal = '';
      let userStop = false;
      let resolveDone;
      const done = new Promise((r) => { resolveDone = r; });
      let stopped = false;
      let heard = false;
      let failed = '';
      const t0 = Date.now();
      const show = (interim) => {
        const said = (finals + ' ' + interim).replace(/\s+/g, ' ').trim();
        field.value = base && said ? base + (/[.!?,;:]$/.test(base) ? ' ' : ', ') + said : base || said;
        field.dispatchEvent(new Event('input', { bubbles: true }));
      };
      // Safari на iPhone повідомляє лише onstart (без onaudiostart), тож «почав слухати» — будь-яка з подій
      let started = false;
      const listening = () => { if (!started && status && !heard) say('Слухаю. Говори, а потім натисни мікрофон ще раз.', 'on'); started = true; };
      rec.onstart = listening;
      rec.onaudiostart = listening;
      rec.onsoundstart = listening;
      rec.onspeechstart = () => { started = true; if (status && !heard) say('Чую…', 'on'); };
      rec.onresult = (e) => {
        heard = started = true;
        let interim = '', fin = '';
        for (let i = 0; i < e.results.length; i++) {
          const t = e.results[i][0].transcript;
          if (e.results[i].isFinal) fin += ' ' + t; else interim += ' ' + t;
        }
        const first = e.results.length ? e.results[0][0].transcript : '';
        const restarted = e.results.length < sessLen || (sessFirstFinal && first.slice(0, 8) !== sessFirstFinal.slice(0, 8));
        if (restarted && sessText) committed += ' ' + sessText;
        sessText = (fin + ' ' + interim).trim();
        sessLen = e.results.length;
        sessFirstFinal = e.results.length && e.results[0].isFinal ? first : '';
        finals = committed + ' ' + fin;
        show(interim);
        if (status) say(stopped ? '' : 'Слухаю. Натисни мікрофон, коли закінчиш.', stopped ? '' : 'on');
      };
      rec.onerror = (e) => { failed = e.error || 'error'; };
      const finish = () => {
        if (stopped) return;
        stopped = true;
        finals = (committed + ' ' + sessText).trim();
        btn.classList.remove('is-on');
        btn.setAttribute('aria-label', 'Говорити');
        if (active && active.rec === rec) active = null;
        show('');
        if (failed === 'not-allowed') say('Браузер не дав доступ до мікрофона. Дозволь його в налаштуваннях сайту (значок ліворуч від адреси) і спробуй ще раз.', 'err');
        else if (failed === 'audio-capture') say('Не бачу мікрофона. Перевір, чи він підключений і чи не зайнятий іншою програмою.', 'err');
        else if (failed === 'language-not-supported') say('Цей браузер не розпізнає українську. ' + LP.dictationHint(), 'err');
        else if (failed === 'service-not-allowed' && /iPhone|iPad|iPod|Macintosh/.test(UA)) say('Розпізнавання мови вимкнене в системі. На iPhone увімкни: Параметри → Загальні → Клавіатура → «Увімкнути диктування», а також Siri. Потім онови сторінку.', 'err');
        else if (failed && failed !== 'no-speech' && failed !== 'aborted') fallback();
        else if (!heard) say('Нічого не почув. Натисни мікрофон, скажи фразу й натисни ще раз.', 'err');
        else say('');
        if (onDone) onDone(field.value);
        resolveDone();
      };
      // вбудоване не працює: перемикаємось на запис і розпізнавання на сервері
      function fallback() {
        if (!recReady()) return say(LP.dictationHint(), 'err');
        if (['network', 'service-not-allowed', 'language-not-supported', 'silent'].includes(failed)) srFailed = true;
        say(`Розпізнавання браузера не спрацювало${failed ? ` (${failed})` : ''}. Натисни мікрофон ще раз: запишу голос і розпізнаю на сервері.`, 'err');
      }
      // браузер сам закінчив слухати після паузи: якщо людина ще не натиснула «стоп», слухаємо далі
      rec.onend = () => {
        if (!userStop && !stopped && heard && !failed && Date.now() - t0 < 180000) {
          if (sessText) { committed += ' ' + sessText; sessText = ''; sessLen = 0; sessFirstFinal = ''; }
          try { rec.start(); return; } catch (e) { /* не вийшло — закінчуємо */ }
        }
        finish();
      };
      active = { rec, btn, done, stop: () => { userStop = true; try { rec.stop(); } catch (e) { /* уже зупинено */ } setTimeout(finish, 2500); } };
      try { rec.start(); } catch (e) { active = null; return say(LP.dictationHint(), 'err'); }
      btn.classList.add('is-on');
      btn.setAttribute('aria-label', 'Зупинити');
      if (status) say('Вмикаю мікрофон…', 'on');
      // буває, що браузер мовчки нічого не робить: тоді за кілька секунд зупиняємо й підказуємо інший спосіб
      setTimeout(() => {
        if (started || stopped) return;
        failed = 'silent';
        try { rec.abort(); } catch (e) { /* немає */ }
        finish();
      }, 6000);
      field.focus({ preventScroll: true });
    });
  };

  // ---------- Запис і розпізнавання на сервері ----------
  const STT_ERR = {
    nokey: 'Розпізнавання голосу на сервері ще не ввімкнене.',
    timeout: 'Сервер довго не відповідав. Спробуй ще раз або скажи коротше.',
    limit: 'На сьогодні записи голосу скінчились. Завтра знову, а поки можна написати.',
    busy: 'Сервер розпізнавання зараз зайнятий. Спробуй за хвилину.',
    auth: 'Увійди в акаунт ще раз.',
    net: 'Немає звʼязку з сервером.',
    short: 'Запис надто короткий.',
    big: 'Запис задовгий. Скажи коротше.',
  };
  async function record(btn, field, say, live, onDone) {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      if (e && e.name === 'NotAllowedError') say('Браузер не дав доступ до мікрофона. Дозволь його в налаштуваннях сайту (значок ліворуч від адреси) і спробуй ще раз.', 'err');
      else if (e && e.name === 'NotFoundError') say('Не бачу мікрофона. Перевір, чи він підключений.', 'err');
      else say('Мікрофон зараз недоступний.', 'err');
      return;
    }
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find((t) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '';
    let mr;
    try { mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined); } catch (e) { stream.getTracks().forEach((t) => t.stop()); return say('Цей браузер не вміє записувати звук.', 'err'); }
    const chunks = [];
    mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    // рівень звуку: тишу не відправляємо (Whisper на тиші вигадує фрази)
    let peak = 0, ac = null, levelTimer = 0;
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === 'suspended') ac.resume().catch(() => {});
      const an = ac.createAnalyser();
      an.fftSize = 1024;
      ac.createMediaStreamSource(stream).connect(an);
      const data = new Uint8Array(an.fftSize);
      levelTimer = setInterval(() => {
        an.getByteTimeDomainData(data);
        let m = 0;
        for (let i = 0; i < data.length; i++) m = Math.max(m, Math.abs(data[i] - 128));
        if (peak >= 0) peak = Math.max(peak, m);
      }, 80);
    } catch (e) { peak = -1; }
    setTimeout(() => { if (ac && ac.state !== 'running') peak = -1; }, 400);
    const t0 = Date.now();
    let tick = 0, limit = 0, done = false;
    const sec = () => Math.floor((Date.now() - t0) / 1000);
    const cleanup = () => {
      clearInterval(levelTimer); clearInterval(tick); clearTimeout(limit);
      stream.getTracks().forEach((t) => t.stop());
      if (ac) ac.close().catch(() => {});
      btn.classList.remove('is-on');
      btn.setAttribute('aria-label', 'Говорити');
      if (active && active.btn === btn) active = null;
    };
    let resolveDone;
    const donePromise = new Promise((r) => { resolveDone = r; });
    mr.onstop = async () => {
      if (done) return;
      done = true;
      cleanup();
      try { await transcribe(); } finally { resolveDone(); }
    };
    const transcribe = async () => {
      const dur = Date.now() - t0;
      if (dur < 800) return say('Запис надто короткий. Натисни мікрофон, скажи фразу й натисни ще раз.', 'err');
      if (peak > 0 && peak < 3) return say('Нічого не почув. Перевір мікрофон і говори трохи голосніше.', 'err');
      const blob = new Blob(chunks, { type: mr.mimeType || mime || 'audio/webm' });
      btn.disabled = true;
      say('Розпізнаю…', 'on');
      const res = await LP.sync.stt(blob);
      btn.disabled = false;
      if (res.error === 'nokey') { sttOff = true; srFailed = false; }
      if (res.error) {
        const msg = res.error === 'limit' && res.limit ? `На сьогодні записи голосу скінчились (${res.limit} на день). Завтра знову, а поки можна написати.` : STT_ERR[res.error] || 'Не вийшло розпізнати. Спробуй ще раз.';
        const mobile = /Android|iPhone|iPad|iPod/i.test(UA);
        return say(res.error === 'nokey' || res.error === 'net' || res.error === 'timeout' ? msg + (mobile ? ' Поки що натисни на поле й скористайся мікрофоном на клавіатурі телефону.' : ' Поки що відкрий планер у Chrome чи Edge або напиши текст.') : msg, 'err');
      }
      const said = String(res.text || '').trim();
      if (!said) return say('Нічого не розібрав. Спробуй ще раз, ближче до мікрофона.', 'err');
      const base = field.value.trim();
      field.value = base ? base + (/[.!?,;:]$/.test(base) ? ' ' : ', ') + said : said;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      say('');
      if (onDone) onDone(field.value);
    };
    active = { btn, done: donePromise, stop: () => { try { if (mr.state !== 'inactive') mr.stop(); else mr.onstop(); } catch (e) { mr.onstop(); } } };
    mr.start(250);
    btn.classList.add('is-on');
    btn.setAttribute('aria-label', 'Зупинити');
    const MAX_S = 180;
    const show = () => say(`Записую ${Math.floor(sec() / 60)}:${String(sec() % 60).padStart(2, '0')}. ${sec() >= MAX_S - 15 ? `Ще ${MAX_S - sec()} с, потім зупиню сам.` : 'Натисни мікрофон або «Розібрати», коли закінчиш.'}`, 'on');
    if (live) { show(); tick = setInterval(show, 500); } else say('Записую. Натисни мікрофон ще раз, коли закінчиш.');
    limit = setTimeout(() => active && active.btn === btn && active.stop(), MAX_S * 1000);
    field.focus({ preventScroll: true });
  }

  // ---------- Контекст для помічника: лише дата, назви цілей і періодів, зайняті години (без назв справ) ----------
  // основи слів: «зубного» і «Зубний» мають спільне «зубн». Так шукаємо справи, про які йдеться у фразі,
  // і в Claude йдуть назви лише цих справ, а не всього розкладу.
  const stems = (s) => (String(s).toLowerCase().replace(/[ʼ'’`]/g, '').match(/[a-zа-яіїєґ0-9]{3,}/gi) || []).map((w) => w.slice(0, Math.min(4, w.length - (w.length > 3 ? 1 : 0))));
  function matchesPhrase(title, phraseStems) {
    const words = String(title).toLowerCase().replace(/[ʼ'’`]/g, '').match(/[a-zа-яіїєґ0-9]{3,}/gi) || [];
    return words.some((w) => phraseStems.some((st) => st.length >= 3 && w.startsWith(st)));
  }

  function context(text = '') {
    const today = u.today();
    const now = new Date();
    const { dayStart, dayEnd } = LP.data.settings;
    const goals = LP.bigGoals().filter((g) => LP.goalProgress(g) < 1).slice(0, 40).map((g) => {
      const hasSubs = (g.subgoals || []).some((s) => s.title && s.title.trim());
      return Object.assign({ id: g.id, title: g.title, level: g.level, kind: hasSubs ? 'has_subgoals' : g.kind }, g.unit ? { unit: g.unit } : {});
    });
    const L = LP.data.life || { marks: [] };
    const periods = L.marks.filter((m) => (m.end || m.start) >= today && m.start <= u.addDays(today, 400)).slice(0, 30)
      .map((m) => Object.assign({ id: m.id, title: m.title, start: m.start }, m.end ? { end: m.end } : {}));
    const to = u.addDays(today, 13);
    const busy = {};
    const add = (d, s, e) => { (busy[d] = busy[d] || []).push([u.fmtTime(s), u.fmtTime(Math.min(e, 1439))]); };
    LP.occurrences(today, to).forEach((o) => add(o.date, o.ev.start, o.ev.end));
    if (LP.calItemsOn) for (let d = today; d <= to; d = u.addDays(d, 1)) LP.calItemsOn(d).filter((x) => !x.all).forEach((x) => add(d, x.s, x.e));
    Object.values(busy).forEach((list) => list.sort());
    const yesterday = u.addDays(today, -1);
    const habits = LP.data.habits.filter((h) => !h.timed).slice(0, 30).map((h) => {
      const d = LP.habitDates(h);
      return { id: h.id, title: h.title, per_week: h.perWeek, done_today: d.has(today), done_yesterday: d.has(yesterday) };
    });
    const areas = LP.data.balance.areas.map((a) => ({ id: a.id, name: a.name }));
    // справи: лише ті, чия назва схожа на слова з фрази (від позавчора до двох тижнів уперед)
    const ph = stems(text);
    // для щотижневих справ — лише три найближчі до сьогодні рази, щоб «Робота» не забила весь список
    const dist = (d) => Math.abs((u.parse(d) - u.parse(today)) / 864e5);
    const perEv = {};
    const events = ph.length ? LP.occurrences(u.addDays(today, -2), to)
      .filter((o) => matchesPhrase(o.ev.title, ph))
      .sort((a, b) => dist(a.date) - dist(b.date) || (a.date < b.date ? 1 : -1))
      .filter((o) => (perEv[o.ev.title] = (perEv[o.ev.title] || 0) + 1) <= 3)
      .slice(0, 15)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.ev.start - b.ev.start))
      .map((o) => ({ id: o.ev.id, title: o.ev.title, date: o.date, start: u.fmtTime(o.ev.start), end: u.fmtTime(Math.min(o.ev.end, 1439)), done: o.done, weekly: o.ev.repeat === 'weekly' })) : [];
    return {
      today, weekday: u.DAYS_LONG[u.weekday(today)], now: u.fmtTime(now.getHours() * 60 + now.getMinutes()),
      day_start: u.fmtTime(dayStart * 60), day_end: u.fmtTime(Math.min(dayEnd * 60, 1439)), goals, periods, busy,
      habits, areas, states: LP.STATES, events,
    };
  }
  LP.aiContext = context;

  // ---------- Перевірка того, що повернула модель ----------
  const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + 'T12:00:00'));
  const toMin = (s) => (typeof s === 'string' && /^\d{1,2}:\d{2}$/.test(s) ? u.clamp(u.parseTime(s), 0, 1440) : null);
  const str = (s, n = 120) => (typeof s === 'string' ? s.trim().slice(0, n) : '');
  const mood = (m) => (LP.MOODS[m] ? m : 'mid');
  const bigGoal = (id) => { const g = id && LP.goal(id); return g && g.level !== 'week' ? g : null; };
  const markOf = (id) => (id && (LP.data.life.marks || []).find((m) => m.id === id)) || null;

  function clean(a) {
    if (!a || typeof a !== 'object') return null;
    const title = str(a.title);
    const goal = bigGoal(a.goal_id);
    switch (a.type) {
      case 'event': {
        const start = toMin(a.start);
        if (!title || !isDate(a.date) || start == null || start >= 1440) return null;
        let end = toMin(a.end);
        if (end == null || end <= start) end = Math.min(start + 60, 1440);
        return { type: 'event', title, date: a.date, start, end, repeat: a.repeat === 'weekly' ? 'weekly' : 'none', mood: mood(a.mood), bonus: str(a.bonus, 80), goalId: goal ? goal.id : null };
      }
      case 'task':
        if (!title) return null;
        return { type: 'task', title, mood: mood(a.mood), duration: u.clamp(Math.round(Number(a.minutes) || 60), 5, 600), bonus: str(a.bonus, 80), goalId: goal ? goal.id : null };
      case 'goal': {
        if (!title) return null;
        const level = ['long', 'short', 'week'].includes(a.level) ? a.level : 'short';
        const kind = ['once', 'count', 'hours', 'amount'].includes(a.kind) ? a.kind : 'once';
        const target = Number(a.target) > 0 ? Number(a.target) : null;
        return { type: 'goal', title, level, kind, target, unit: str(a.unit, 12), deadline: isDate(a.deadline) ? a.deadline : null, description: str(a.text, 600) };
      }
      case 'progress': {
        if (!goal) return null;
        if ((goal.subgoals || []).some((s) => s.title && s.title.trim())) return null; // прогрес підцілей вносять вручну
        const value = Number(a.value) || (goal.kind === 'once' ? 1 : 0);
        if (!value) return null;
        return { type: 'progress', title: goal.title, goalId: goal.id, value, note: str(a.text, 120) };
      }
      case 'mark': {
        if (!title || !isDate(a.date)) return null;
        const end = isDate(a.end_date) && a.end_date > a.date ? a.end_date : null;
        return { type: 'mark', title, start: a.date, end };
      }
      case 'date':
        if (!title || !isDate(a.date)) return null;
        return { type: 'date', title, md: a.date.slice(5), year: Number(a.date.slice(0, 4)) < new Date().getFullYear() ? Number(a.date.slice(0, 4)) : null, kind: ['bday', 'anniv', 'other'].includes(a.date_kind) ? a.date_kind : 'other' };
      case 'note': {
        const text = str(a.text, 600) || title;
        if (!text) return null;
        const m = markOf(a.mark_id);
        return { type: 'note', title: text, markId: m ? m.id : null, list: !!(m && a.list) };
      }
      case 'journal': {
        const state = LP.STATES.includes(a.state) ? a.state : '';
        const score = Number(a.score) >= 1 && Number(a.score) <= 10 ? Math.round(Number(a.score)) : null;
        const note = str(a.text, 600), gratitude = str(a.gratitude, 300);
        if (!state && !score && !note && !gratitude) return null;
        // назва рядка у списку = нотатка (або вдячність, якщо нотатки немає); її можна виправити
        return { type: 'journal', title: note || gratitude || (state ? state[0].toUpperCase() + state.slice(1) : `День на ${score}`), field: note ? 'note' : gratitude ? 'gratitude' : '', state, score, gratitude };
      }
      case 'habit_done': {
        const h = LP.habit(a.habit_id);
        if (!h || h.timed) return null;
        const date = a.date === u.addDays(u.today(), -1) ? a.date : u.today();
        if (LP.habitDates(h).has(date)) return null;
        return { type: 'habit_done', title: h.title, habitId: h.id, date };
      }
      case 'habit':
        if (!title) return null;
        return { type: 'habit', title, perWeek: u.clamp(Math.round(Number(a.per_week) || 7), 1, 7) };
      case 'balance': {
        const ar = LP.data.balance.areas.find((x) => x.id === a.area_id);
        const score = Number(a.score);
        if (!ar || !(score >= 0 && score <= 10)) return null;
        return { type: 'balance', title: ar.name, areaId: ar.id, score: Math.round(score) };
      }
      case 'sleep': {
        const wake = toMin(a.wake), bed = toMin(a.bed);
        if (!isDate(a.date) || (wake == null && bed == null) || a.date > u.today()) return null;
        return { type: 'sleep', title: 'Сон', date: a.date, wake, bed };
      }
      case 'done': case 'move': {
        const ev = LP.event(a.event_id);
        if (!ev || !isDate(a.date)) return null;
        const occ = LP.occurrences(a.date, a.date).find((o) => o.ev.id === ev.id);
        if (!occ) return null;
        if (a.type === 'done') return occ.done ? null : { type: 'done', title: ev.title, eventId: ev.id, date: a.date };
        if (!isDate(a.new_date)) return null;
        let start = toMin(a.start); let end = toMin(a.end);
        if (start == null) { start = ev.start; end = ev.end; } else if (end == null || end <= start) end = Math.min(start + (ev.end - ev.start), 1440);
        if (a.new_date === a.date && start === ev.start && end === ev.end) return null;
        return { type: 'move', title: ev.title, eventId: ev.id, date: a.date, newDate: a.new_date, start, end, weekly: ev.repeat === 'weekly' };
      }
      default: return null;
    }
  }

  // ---------- Як показати дію ----------
  const dayLabel = (d) => {
    const today = u.today();
    if (d === today) return 'СЬОГОДНІ';
    if (d === u.addDays(today, 1)) return 'ЗАВТРА';
    return `${u.DAYS_SHORT[u.weekday(d)]} ${u.fmtDay(d)}`.toUpperCase();
  };
  const range = (a, b) => (!b ? u.fmtDay(a) : a.slice(0, 7) === b.slice(0, 7) ? `${u.parse(a).getDate()}–${u.fmtDay(b)}` : `${u.fmtDay(a)} — ${u.fmtDay(b)}`);
  const DATE_KIND = { bday: 'ДЕНЬ НАРОДЖЕННЯ', anniv: 'РІЧНИЦЯ', other: 'ДАТА' };
  const LEVEL = { long: 'ДОВГА ЦІЛЬ', short: 'КОРОТКА ЦІЛЬ', week: 'ЦІЛЬ ТИЖНЯ' };
  const fmtVal = (g, v) => (g.kind === 'hours' ? `+${LP.fmtNum(v)} год` : g.kind === 'amount' ? `+${LP.fmtNum(v)}${g.unit ? ' ' + g.unit : ''}` : g.kind === 'once' ? 'виконано' : `+${LP.fmtNum(v)}`);
  const goalTag = (id) => { const g = LP.goal(id); return g ? ` · ДЛЯ ЦІЛІ ${u.esc(g.tag || g.title)}` : ''; };

  const bonusTag = (a) => (a.bonus && LP.bonusAllowed(a.mood) ? ` · БОНУС: ${u.esc(a.bonus).toUpperCase()}` : '');

  function needsForm(a) {
    if (a.type !== 'goal' || a.level === 'week') return false;
    return LP.validateGoal(goalFields(a)).length > 0;
  }
  function goalFields(a) {
    return { title: a.title, tag: LP.makeTag(a.title), level: a.level, kind: a.kind, target: a.kind === 'once' ? null : a.target, unit: a.kind === 'amount' ? a.unit : '',
      deadline: a.deadline, start: u.today(), description: a.description, subgoals: [] };
  }

  function meta(a) {
    switch (a.type) {
      case 'event': return `СПРАВА · ${dayLabel(a.date)} · ${u.fmtTime(a.start)}–${u.fmtTime(a.end)}${a.repeat === 'weekly' ? ' · ЩОТИЖНЯ' : ''}${goalTag(a.goalId)}${bonusTag(a)}`;
      case 'task': return `У БЕКЛОГ · ${u.fmtHours ? u.fmtHours(a.duration).toUpperCase() : a.duration + ' ХВ'}${goalTag(a.goalId)}${bonusTag(a)}`;
      case 'goal': return `${LEVEL[a.level]}${a.kind !== 'once' && a.target ? ` · ${LP.fmtNum(a.target)} ${a.kind === 'hours' ? 'ГОД' : a.kind === 'amount' ? u.esc(a.unit || '').toUpperCase() : 'РАЗІВ'}` : ''}${a.deadline ? ' · ДО ' + u.fmtDay(a.deadline).toUpperCase() : ''}`;
      case 'progress': { const g = LP.goal(a.goalId); return `ПРОГРЕС · ${u.esc(fmtVal(g, a.value)).toUpperCase()}`; }
      case 'mark': return `НА «РОЦІ» · ${range(a.start, a.end).toUpperCase()}`;
      case 'date': { const d = `2000-${a.md}`; return `ЩОРОКУ · ${u.fmtDay(d).toUpperCase()} · ${DATE_KIND[a.kind]}`; }
      case 'note': { const m = markOf(a.markId); return m ? `${a.list ? 'У СПИСОК' : 'НОТАТКА'} · ${u.esc(m.title).toUpperCase()}` : 'НОТАТКА · ЩОДЕННИК, СЬОГОДНІ'; }
      case 'journal': return `ЩОДЕННИК · СЬОГОДНІ${a.state ? ' · ' + u.esc(a.state).toUpperCase() : ''}${a.score ? ` · ${a.score}/10` : ''}${a.field === 'note' && a.gratitude ? ' · ВДЯЧНІСТЬ: ' + u.esc(a.gratitude).toUpperCase() : a.field === 'gratitude' ? ' · ВДЯЧНІСТЬ' : ''}`;
      case 'habit_done': return `ЗВИЧКА · ВИКОНАНО ${a.date === u.today() ? 'СЬОГОДНІ' : 'ВЧОРА'}`;
      case 'habit': return `НОВА ЗВИЧКА · ${a.perWeek === 7 ? 'ЩОДНЯ' : a.perWeek + ' РАЗ' + (a.perWeek > 1 && a.perWeek < 5 ? 'И' : 'ІВ') + ' НА ТИЖДЕНЬ'}`;
      case 'balance': { const old = LP.areaScore ? LP.areaScore(a.areaId) : null; return `БАЛАНС · ${typeof old === 'number' ? old + ' → ' : ''}${a.score}/10`; }
      case 'sleep': return `СОН · ${a.bed != null ? 'ВІДБІЙ ' + u.fmtTime(a.bed % 1440) : ''}${a.bed != null && a.wake != null ? ' · ' : ''}${a.wake != null ? 'ПІДЙОМ ' + u.fmtTime(a.wake) : ''} · ${dayLabel(a.date)}`;
      case 'done': return `ВИКОНАНО · ${dayLabel(a.date)}`;
      case 'move': return `ПЕРЕНЕСТИ · ${dayLabel(a.date)} → ${dayLabel(a.newDate)}, ${u.fmtTime(a.start)}–${u.fmtTime(a.end)}${a.weekly ? ' · ЛИШЕ ЦЕЙ РАЗ' : ''}`;
      default: return '';
    }
  }

  function rowHtml(a, i) {
    const hasMood = a.type === 'event' || a.type === 'task';
    const needBonus = hasMood && LP.bonusRequired(a.mood) && !a.bonus;
    const editable = !['progress', 'habit_done', 'balance', 'sleep', 'done', 'move'].includes(a.type) && !(a.type === 'journal' && !a.field);
    return `
      <li class="ai-row" data-i="${i}">
        <label class="ai-check"><input type="checkbox" name="on${i}" checked><span aria-hidden="true"></span></label>
        <div class="ai-main">
          <div class="ai-meta mono">${meta(a)}</div>
          ${editable ? `<input type="text" class="ai-title" name="t${i}" maxlength="${a.type === 'note' ? 600 : 120}" value="${u.esc(a.title)}" aria-label="Назва">`
            : `<div class="ai-title is-static">${u.esc(a.title)}</div>`}
          ${hasMood ? `<div class="ai-bonus ${needBonus ? '' : 'is-hidden'}"><input type="text" name="b${i}" maxlength="80" value="${u.esc(a.bonus || '')}" placeholder="Бонус після важкої справи: що отримаєш"></div>` : ''}
          ${needsForm(a) ? `<p class="ai-hint">Після «Додати» відкрию форму цілі: там треба дописати опис${a.kind !== 'once' && !a.target ? ' і мету' : ''}.</p>` : ''}
        </div>
        ${hasMood ? `<button type="button" class="ai-mood" data-ai-mood="${i}" title="Змінити: приємна, нейтральна, важка">${LP.moodDot(a.mood)}</button>` : ''}
      </li>`;
  }

  // ---------- Виконання ----------
  function apply(list) {
    const forms = [];
    let n = 0;
    const L = LP.data.life;
    list.forEach((a) => {
      switch (a.type) {
        case 'event':
          LP.addEvent({ title: a.title, date: a.date, start: a.start, end: a.end, repeat: a.repeat, mood: a.mood, bonus: LP.bonusAllowed(a.mood) ? a.bonus : '', goalId: a.goalId });
          break;
        case 'task':
          LP.saveTask({ title: a.title, mood: a.mood, duration: a.duration, bonus: LP.bonusAllowed(a.mood) ? a.bonus : '', goalId: a.goalId, stage: 'backlog' }, true);
          break;
        case 'goal':
          if (a.level === 'week') LP.saveGoal({ level: 'week', title: a.title, week: u.weekStart(u.today()), parentId: null, done: false });
          else if (needsForm(a)) { forms.push(goalFields(a)); return; }
          else LP.saveGoal(goalFields(a));
          break;
        case 'progress': {
          const g = LP.goal(a.goalId);
          if (!g) return;
          if (g.kind === 'amount') LP.addEntry(g.id, null, a.value, a.note);
          else if (g.kind === 'once') { if (LP.ownProgress(g).ratio < 1) LP.toggleOnce(g.id, null); }
          else LP.bump(g.id, null, a.value);
          break;
        }
        case 'mark':
          L.marks.push({ id: u.uid(), title: a.title, note: '', start: a.start, end: a.end });
          break;
        case 'date':
          L.dates.push({ id: u.uid(), name: a.title, kind: a.kind, md: a.md, year: a.year });
          break;
        case 'note': {
          const m = markOf(a.markId);
          if (m) {
            const p = (m.plan = m.plan && typeof m.plan === 'object' ? m.plan : {});
            p.items = p.items || []; p.list = p.list || [];
            if (a.list) p.list.push({ id: u.uid(), text: a.title, done: false });
            else p.notes = (p.notes ? p.notes.replace(/\s+$/, '') + '\n' : '') + a.title;
          } else {
            const today = u.today();
            const e = Object.assign({}, LP.journal(today) || {});
            e.note = (e.note ? e.note.replace(/\s+$/, '') + '\n' : '') + a.title;
            LP.saveJournal(today, e);
          }
          break;
        }
        case 'journal': {
          const today = u.today();
          const e = Object.assign({}, LP.journal(today) || {});
          if (a.state) e.state = a.state;
          if (a.score) e.score = a.score;
          const add = (k, t) => { if (t) e[k] = (e[k] ? e[k].replace(/\s+$/, '') + '\n' : '') + t; };
          if (a.field === 'note') { add('note', a.title); add('gratitude', a.gratitude); }
          else if (a.field === 'gratitude') add('gratitude', a.title);
          LP.saveJournal(today, e);
          break;
        }
        case 'habit_done':
          if (!LP.habitDates(LP.habit(a.habitId)).has(a.date)) LP.toggleHabit(a.habitId, a.date);
          break;
        case 'habit':
          LP.saveHabit({ title: a.title, perWeek: a.perWeek });
          break;
        case 'balance':
          LP.setAreaScore(a.areaId, a.score);
          break;
        case 'sleep':
          if (a.wake != null) LP.setSleep(a.date, { wake: a.wake });
          // відбій належить до попереднього вечора; «ліг о першій» — це вже після опівночі (24:00 + 1 год)
          if (a.bed != null) LP.setSleep(u.addDays(a.date, -1), { bed: a.bed < 12 * 60 ? a.bed + 1440 : a.bed });
          break;
        case 'done': {
          const occ = LP.occurrences(a.date, a.date).find((o) => o.ev.id === a.eventId);
          if (occ && !occ.done) LP.toggleDone(a.eventId, a.date);
          break;
        }
        case 'move': {
          const ev = LP.event(a.eventId);
          if (!ev) return;
          if (ev.repeat === 'weekly') {
            // повторювану справу переносимо лише цього разу: пропуск у серії + окрема справа на новий день
            ev.skipDates.push(a.date);
            const copy = Object.assign({}, ev, { id: u.uid(), date: a.newDate, start: a.start, end: a.end, repeat: 'none', until: null, doneDates: [], skipDates: [] });
            delete copy.group;
            LP.data.events.push(copy);
          } else LP.rescheduleEvent(a.eventId, a.date, { date: a.newDate, start: a.start, end: a.end });
          break;
        }
        default: return;
      }
      n++;
    });
    LP.save();
    return { n, forms };
  }

  const ERR = {
    nokey: 'Помічник ще не ввімкнений: на сервері немає ключа.',
    limit: 'На сьогодні запити скінчились. Завтра знову.',
    busy: 'Помічник зараз перевантажений. Спробуй трохи пізніше.',
    badkey: 'Помічник тимчасово не працює.',
    money: 'Помічник тимчасово не працює.',
    auth: 'Увійди в акаунт ще раз.',
    net: 'Немає звʼязку з сервером.',
    timeout: 'Сервер не відповів за 45 секунд. Текст лишився в полі, спробуй ще раз.',
    empty: 'Скажи або напиши, що запланувати.',
  };
  const EXAMPLE = 'Наприклад: завтра о 10 зубний, у четвер ввечері подзвонити мамі хвилин на 15, відклав 2000 на синтезатор';

  // ---------- Згода і прозорість ----------
  const PRIVACY = `
    <div class="label">ЩО ЙДЕ НА СЕРВЕР ПІД ЧАС ЗАПИТУ</div>
    <ul class="ai-ul">
      <li>Те, що ти сказав або написав.</li>
      <li>Сьогоднішня дата, назви незакритих цілей, звичок, сфер балансу й майбутніх періодів.</li>
      <li>Зайняті години на два тижні без назв і назви лише тих справ, про які, схоже, йдеться у фразі.</li>
    </ul>
    <div class="label">ЧОГО НЕ ЙДЕ</div>
    <ul class="ai-ul"><li>Записи щоденника, оцінки, нотатки й люди, які вже є в планері, і решта розкладу. Вони лишаються зашифрованими.</li></ul>
    <p class="hint">Помічник працює на Claude від Anthropic. Anthropic не навчає моделі на цих даних і видаляє їх протягом 30 днів. Наш сервер нічого з цього не зберігає. Голос у Chrome розпізнає Google, у Safari — Apple, в інших браузерах — Groq.</p>`;
  function openConsent() {
    LP.modal({
      title: 'Помічник',
      body: `<p>Скажи або напиши кількома словами, що треба: справи, цілі, звички, сон, стан, баланс. Помічник покаже, що зрозумів, і додасть лише те, що ти підтвердиш.</p>${PRIVACY}
        <p class="hint">Вимкнути можна будь-коли в налаштуваннях.</p>`,
      submitText: 'Увімкнути',
      onSubmit: () => { LP.data.settings.aiOk = true; LP.save({ render: false }); setTimeout(() => LP.openAssistant(), 200); },
    });
  }
  // те, що справді піде з цією фразою, людською мовою
  function whatHtml(text) {
    const c = context(text);
    const list = (arr) => (arr.length ? arr.map((x) => `«${u.esc(x)}»`).join(', ') : 'немає');
    const busyN = Object.values(c.busy).reduce((s, l) => s + l.length, 0);
    return `<ul class="ai-ul">
      <li><b>Фраза:</b> ${text.trim() ? `«${u.esc(text.trim())}»` : 'поки порожньо'}</li>
      <li><b>Сьогодні:</b> ${u.esc(c.weekday)}, ${u.fmtDay(c.today)}, ${c.now}</li>
      <li><b>Цілі:</b> ${list(c.goals.map((g) => g.title))}</li>
      <li><b>Звички:</b> ${list(c.habits.map((h) => h.title))}</li>
      <li><b>Сфери балансу:</b> ${list(c.areas.map((a) => a.name))}</li>
      <li><b>Періоди на «Році»:</b> ${list(c.periods.map((p) => p.title))}</li>
      <li><b>Справи, схожі на слова з фрази:</b> ${list(c.events.map((e) => e.title))}</li>
      <li><b>Зайняті проміжки без назв:</b> ${busyN} на два тижні</li>
    </ul>${PRIVACY.replace(/[\s\S]*?<p class="hint">/, '<p class="hint">')}`;
  }

  // ---------- Вікно помічника ----------
  const DRAFT_KEY = 'life-planner.aiDraft';
  let draft = (() => { try { return localStorage.getItem(DRAFT_KEY) || ''; } catch (e) { return ''; } })();
  const keepDraft = (t) => { draft = t; try { if (t) localStorage.setItem(DRAFT_KEY, t); else localStorage.removeItem(DRAFT_KEY); } catch (e) { /* приватний режим */ } };
  LP.openAssistant = function ({ listen = false } = {}) {
    if (!LP.sync || !LP.sync.signedIn) {
      return LP.modal({
        title: 'Помічник',
        body: '<p>Помічник розбирає сказане через сервер, тому працює лише з акаунтом. Увійди, і можна починати.</p>',
        submitText: 'Увійти',
        onSubmit: () => { setTimeout(() => LP.openSync && LP.openSync(), 0); },
      });
    }
    if (!LP.data.settings.aiOk) return openConsent();
    let step = 'say';
    let actions = [];
    let say = '';
    let left = null;
    let busy = false;

    const sayBody = () => `
      <div class="ai-input">
        <textarea name="aitext" rows="4" maxlength="1500" placeholder="${u.esc(EXAMPLE)}">${u.esc(draft)}</textarea>
        ${LP.micHtml('mic-big')}
      </div>
      <p class="ai-status" role="status" aria-live="polite" hidden></p>
      <p class="hint">${LP.voiceSupported ? 'Натисни мікрофон і говори або напиши.' : 'Напиши або надиктуй (як саме, підкаже мікрофон).'} Справи, цілі, позначки на «Році», нотатки. Перед тим як щось додати, покажу, що зрозумів.</p>
      <details class="ai-what"><summary class="mono">ЩО САМЕ ПІДЕ В CLAUDE</summary><div class="ai-what-body"></div></details>`;

    const listBody = () => `
      ${say ? `<p class="ai-say-msg">${u.esc(say)}</p>` : ''}
      ${actions.length ? `<ul class="ai-list">${actions.map((a, i) => { try { return rowHtml(a, i); } catch (e) { console.warn('ai: рядок', a, e); return ''; } }).join('')}</ul>
        <p class="hint">Зніми галочку з того, що не треба. Назву можна виправити.</p>`
        : `<p class="ai-say-msg">${say ? '' : 'Не знайшов, що додати. Спробуй сказати інакше: що, коли й на скільки.'}</p>`}
      ${left != null ? `<p class="hint ai-left mono">СЬОГОДНІ ЛИШИЛОСЬ ЗАПИТІВ: ${left}</p>` : ''}`;

    LP.modal({
      title: 'Помічник',
      body: '<div class="ai-body"></div>',
      submitText: 'Розібрати',
      extra: [{ text: '‹ Змінити текст', className: 'ai-back', onClick: (form) => { step = 'say'; draw(form); return false; } }],
      onOpen: (form) => {
        form.classList.add('ai-modal');
        draw(form);
        if (listen) { const b = form.querySelector('[data-mic]'); if (b) b.click(); }
        form.addEventListener('click', (e) => {
          const mb = e.target.closest('[data-ai-mood]');
          if (!mb) return;
          const i = Number(mb.dataset.aiMood);
          const order = ['good', 'mid', 'bad'];
          actions[i].mood = order[(order.indexOf(actions[i].mood) + 1) % 3];
          mb.innerHTML = LP.moodDot(actions[i].mood);
          const box = form.querySelector(`.ai-row[data-i="${i}"] .ai-bonus`);
          if (box) box.classList.toggle('is-hidden', !LP.bonusRequired(actions[i].mood) || !!actions[i].bonus);
        });
      },
      onSubmit: (form) => {
        if (busy) return false;
        if (step === 'say') { ask(form); return false; }
        return confirm(form);
      },
    });

    function errors(form, msg) {
      const box = form.querySelector('.form-errors');
      box.hidden = !msg;
      box.textContent = msg || '';
    }
    function draw(form) {
      errors(form, '');
      LP.stopListening();
      form.querySelector('.ai-body').innerHTML = step === 'say' ? sayBody() : listBody();
      form.querySelector('.ai-back').hidden = step === 'say';
      const sub = form.querySelector('button[type=submit]');
      sub.textContent = step === 'say' ? 'Розібрати' : actions.length ? 'Додати' : 'Розібрати ще раз';
      sub.disabled = false;
      if (step === 'say') {
        const ta = form.elements.aitext;
        ta.addEventListener('input', () => keepDraft(ta.value));
        const what = form.querySelector('.ai-what');
        what.addEventListener('toggle', () => { if (what.open) what.querySelector('.ai-what-body').innerHTML = whatHtml(ta.value); });
        ta.addEventListener('input', () => { if (what.open) what.querySelector('.ai-what-body').innerHTML = whatHtml(ta.value); });
        const st = form.querySelector('.ai-status');
        LP.bindMic(form.querySelector('[data-mic]'), ta, { status: (t, kind) => { st.hidden = !t; st.textContent = t || ''; st.className = 'ai-status' + (kind ? ' is-' + kind : ''); } });
        if (!LP.isMobile()) setTimeout(() => ta.focus(), 30);
      }
    }
    async function ask(form) {
      const sub = form.querySelector('button[type=submit]');
      if (LP.isListening()) {
        // спершу дочекатися, поки сказане зʼявиться в полі
        busy = true;
        sub.disabled = true;
        sub.textContent = 'Дописую…';
        await LP.stopListening();
        busy = false;
        if (!document.body.contains(form)) return;
      }
      const ta = form.elements.aitext;
      const text = ((ta && ta.value) || draft).trim();
      keepDraft(text);
      if (!text) return errors(form, ERR.empty);
      busy = true;
      sub.disabled = true;
      sub.textContent = 'Розбираю…';
      errors(form, '');
      const t0 = Date.now();
      const tick = setInterval(() => { const s = Math.round((Date.now() - t0) / 1000); if (s >= 3) sub.textContent = `Розбираю… ${s} с`; }, 1000);
      const reset = (msg) => { clearInterval(tick); busy = false; sub.disabled = false; sub.textContent = 'Розібрати'; if (msg) errors(form, msg); };
      let res;
      try {
        // без відповіді за 45 секунд — чесно кажемо й даємо спробувати ще раз (текст лишається в полі)
        res = await Promise.race([LP.sync.aiPlan(text, context(text)), new Promise((r) => setTimeout(() => r({ error: 'timeout' }), 45000))]);
      } catch (e) { res = { error: 'net' }; }
      if (!document.body.contains(form)) { clearInterval(tick); busy = false; return; }
      if (res.error) return reset(res.error === 'limit' && res.limit ? `На сьогодні запити скінчились (${res.limit} на день). Завтра знову.` : ERR[res.error] || 'Не вийшло розібрати. Спробуй ще раз.');
      try {
        const seen = new Set();
        actions = (res.actions || []).map((a) => { try { return clean(a); } catch (e) { console.warn('ai: дія', a, e); return null; } }).filter((a) => {
          if (!a) return false;
          const key = JSON.stringify(a);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        say = typeof res.say === 'string' ? res.say : '';
        left = typeof res.left === 'number' ? res.left : null;
        step = 'list';
        clearInterval(tick);
        busy = false;
        draw(form);
      } catch (e) {
        console.error('ai: показ відповіді', e);
        step = 'say';
        reset('Відповідь прийшла, але не вийшло її показати. Спробуй ще раз, а якщо повториться — напиши відгук.');
      }
    }
    function confirm(form) {
      if (!actions.length) { step = 'say'; draw(form); return false; }
      const chosen = [];
      const errs = [];
      actions.forEach((a, i) => {
        const on = form.elements['on' + i];
        if (!on || !on.checked) return;
        const b = Object.assign({}, a);
        const t = form.elements['t' + i];
        if (t) b.title = t.value.trim();
        if (!b.title) return errs.push('Назва не може бути порожньою.');
        const bonus = form.elements['b' + i];
        if (bonus) b.bonus = bonus.value.trim() || a.bonus || '';
        if ((b.type === 'event' || b.type === 'task') && LP.bonusRequired(b.mood) && !b.bonus) {
          form.querySelector(`.ai-row[data-i="${i}"] .ai-bonus`).classList.remove('is-hidden');
          return errs.push(`«${b.title}»: важкій справі потрібен бонус. Або натисни на кружечок і зміни, яка це справа.`);
        }
        chosen.push(b);
      });
      if (errs.length) { errors(form, errs[0]); return false; }
      if (!chosen.length) { errors(form, 'Не вибрано нічого.'); return false; }
      const { n, forms } = apply(chosen);
      keepDraft('');
      if (n) LP.toast(n === 1 ? 'Додано' : `Додано: ${n}`);
      if (forms.length) setTimeout(() => LP.openGoalForm(forms[0]), 0);
      return true;
    }
  };

  const bindBtn = () => {
    const b = document.getElementById('btn-ai');
    if (b && !b.dataset.bound) { b.dataset.bound = '1'; b.addEventListener('click', () => LP.openAssistant()); }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindBtn); else bindBtn();
})(window.LP);
