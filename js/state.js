// Модель даних і всі операції над нею (версія 3).
//
// data = {
//   version: 3,
//   settings: { dayStart, dayEnd },
//   journal: { 'YYYY-MM-DD': { state, score, note, gratitude } },   // щоденник стану
//   rewards: [{ id, text, source, eventId, date, used }],             // заслужені приємності
//   links:   [{ id, from, to, gap }],                                 // стрілки між задачами на дошці (gap — перерва, хв)
//   goals: [{
//     id, title, level: 'long'|'short'|'week', tag, description, start, deadline, image, createdAt,
//     // довгі й короткі цілі. Мірило: години або повторення; підцілі — необовʼязкові.
//     kind: 'count'|'hours', target, extra,          // використовується, коли підцілей немає
//     subgoals: [{ id, title, kind, target, weight, extra }],
//     // цілі тижня:
//     week, done, parentId, eventId, eventDate       // eventId — ціль тижня «з часом», створена з розкладу
//   }],
//   events: [{ id, title, date, start, end, repeat: 'none'|'weekly', group (серія на кілька днів), until, doneDates:[], skipDates:[], note,
//              goalId, subgoalId, customGoal, habitId,
//              mood: 'good'|'mid'|'bad'|null,   // колір задачі: приємна / нейтральна / важка
//              bonus,                            // винагорода за виконання (обовʼязкова для 'bad')
//              taskId }],                        // з якої задачі беклогу створено
//   tasks: [{ id, title, mood, stage: 'board'|'backlog'|'scheduled', x, y,
//             goalId, subgoalId, duration, bonus, note, createdAt }],
//   habits: [{ id, title, perWeek, timed, checks:[], createdAt }],   // timed — виконується лише через розклад
//   balance: { areas:[{id,name}], current:{areaId:score}, snapshots:[{id, date, scores}] },
//   people:  [{ id, name, x, y, note, ok, tx, ty }],  // ok=false → хочу змінити; (tx,ty) — куди хочу рухати
//   support: { keystoneId: { personId: '+'|'-'|'±' } }
// }
window.LP = window.LP || {};

(function (LP) {
  const u = LP.u;

  LP.LEVELS = { long: 'Довгострокова', short: 'Короткострокова', week: 'На тиждень' };
  LP.MIN_DESCRIPTION = 50;
  LP.KINDS = { once: 'один раз', count: 'разів', hours: 'годин', amount: 'своє число' };
  LP.fmtNum = (n) => (Math.round(n * 100) / 100).toLocaleString('uk-UA').replace(/,/g, ',');
  LP.MOODS = { good: 'Приємна', mid: 'Нейтральна', bad: 'Важка' };
  // Бонус: для приємної не потрібен, для нейтральної — за бажанням, для важкої — обовʼязково
  LP.bonusAllowed = (mood) => mood === 'mid' || mood === 'bad';
  LP.bonusRequired = (mood) => mood === 'bad';
  LP.STATES = ['спокійно', 'нормально', 'радісно', 'натхненно', 'ексайтед', 'втомлено', 'тривожно', 'сумно', 'пригнічено', 'роздратовано'];
  LP.BREAK_AFTER = 45; // після задачі від 45 хв пропонується перерва
  LP.SPLIT_BREAK = 10; // перерва між частинами довгої задачі
  // Довга задача (понад годину) ділиться на рівні частини по 30–60 хв: 90 → 45+45, 180 → 60+60+60, 150 → 50+50+50
  LP.splitDuration = function (d) {
    if (d <= 60) return [d];
    const n = Math.ceil(d / 60);
    const base = Math.round(d / n / 5) * 5;
    const parts = Array(n - 1).fill(base);
    parts.push(d - base * (n - 1));
    return parts;
  };
  // Частини задачі з перервами між ними, від заданого старту
  LP.taskParts = function (task, start) {
    const durs = task.split === false ? [task.duration] : LP.splitDuration(task.duration);
    let t = start;
    return durs.map((d, i) => {
      const p = { start: t, end: t + d };
      t += d + (i < durs.length - 1 ? LP.SPLIT_BREAK : 0);
      return p;
    });
  };

  // Види підтримки з книги «Щасливе життя» (Вальдінгер, Шульц)
  LP.SUPPORT = [
    { id: 'safety', title: 'Безпека й захищеність', q: 'До кого ти звернешся в кризі — навіть посеред ночі?' },
    { id: 'growth', title: 'Навчання й розвиток', q: 'Хто заохочує тебе пробувати нове, ризикувати й іти до цілей?' },
    { id: 'closeness', title: 'Емоційна близькість і довіра', q: 'Кому можна подзвонити, коли тобі погано, і чесно сказати, що відчуваєш?' },
    { id: 'identity', title: 'Спільний досвід і ідентичність', q: 'Хто пройшов з тобою багато всього й допомагає відчувати, хто ти є?' },
    { id: 'romance', title: 'Романтична близькість', q: 'Чи задоволений ти тим, скільки романтичної близькості у твоєму житті?' },
    { id: 'help', title: 'Допомога: порада і справа', q: 'До кого ти йдеш по експертизу чи практичну допомогу (наприклад, полагодити Wi-Fi)?' },
    { id: 'fun', title: 'Розвага й відпочинок', q: 'З ким ти підеш у кіно чи на прогулянку, з ким легко й хто тебе смішить?' },
  ];

  // Основний (акцентний) колір: значення й колір тексту поверх нього
  LP.ACCENTS = {
    red: { name: 'Червоний', c: '#d10a00', on: '#ffffff' },
    acid: { name: 'Кислотно-зелений', c: '#3ddc00', on: '#0a0a0a' },
    cyan: { name: 'Ціан', c: '#00b4d8', on: '#0a0a0a' },
    magenta: { name: 'Маджента', c: '#e0007a', on: '#ffffff' },
    orange: { name: 'Помаранчевий', c: '#ff5c00', on: '#0a0a0a' },
  };

  // Прийоми їжі за замовчуванням (щодня)
  LP.defaultMeals = () => [
    { id: u.uid(), name: 'Сніданок', start: 8 * 60, duration: 30, date: null, skipDates: [] },
    { id: u.uid(), name: 'Обід', start: 13 * 60, duration: 45, date: null, skipDates: [] },
    { id: u.uid(), name: 'Вечеря', start: 19 * 60, duration: 45, date: null, skipDates: [] },
  ];

  const DEFAULT_AREAS = ['Здоровʼя', 'Робота й карʼєра', 'Фінанси', 'Сімʼя', 'Друзі', 'Кохання', 'Саморозвиток', 'Відпочинок і хобі'];

  function emptyData() {
    return {
      version: 3,
      settings: { dayStart: 6, dayEnd: 24 },
      goals: [], events: [], tasks: [], habits: [], journal: {}, rewards: [], links: [],
      balance: { areas: DEFAULT_AREAS.map((name) => ({ id: u.uid(), name })), current: {}, snapshots: [] },
      people: [], support: {}, relAxis2: true, meals: LP.defaultMeals(), life: normLife(null),
    };
  }

  LP.makeTag = function (title) {
    const words = String(title || '').trim().split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
    if (!words.length) return '';
    if (words.length === 1) return words[0].replace(/[^\p{L}\p{N}]/gu, '').slice(0, 3).toUpperCase();
    return words.slice(0, 3).map((w) => w.replace(/[^\p{L}\p{N}]/gu, '')[0] || '').join('').toUpperCase();
  };

  const withId = (o) => (o.id ? o : Object.assign({}, o, { id: u.uid() }));
  const kindOf = (k) => (['once', 'hours', 'amount'].includes(k) ? k : 'count');

  function normLife(l0) {
    const l = l0 && typeof l0 === 'object' ? l0 : {};
    return {
      birthday: typeof l.birthday === 'string' ? l.birthday : null,
      marks: (Array.isArray(l.marks) ? l.marks : []).filter((m) => m && m.start).map((m) => Object.assign({ title: '', note: '', end: null }, withId(m))),
      dates: (Array.isArray(l.dates) ? l.dates : []).filter((d) => d && d.md).map((d) => Object.assign({ name: '', kind: 'bday', year: null }, withId(d))),
      holidays: Array.isArray(l.holidays) ? l.holidays : ['newyear', 'easter', 'halloween'],
      holPos: l.holPos && typeof l.holPos === 'object' ? l.holPos : {},
    };
  }

  function normalize(d) {
    const base = emptyData();
    if (!d || typeof d !== 'object') return base;

    const goals = (Array.isArray(d.goals) ? d.goals : []).map((g0) => {
      const g = Object.assign({ description: '', start: null, deadline: null, image: null, createdAt: u.today() }, withId(g0));
      if (g.level === 'week') {
        g.done = !!g.done;
        g.parentId = g.parentId || null;
        g.eventId = g.eventId || null;
        g.eventDate = g.eventDate || null;
        delete g.tag;
        return g;
      }
      if (!g.description && g.note) g.description = g.note;
      ['parentId', 'progress', 'color', 'note'].forEach((k) => delete g[k]);
      g.kind = kindOf(g.kind);
      g.target = Number(g.target) || 0;
      g.extra = Number(g.extra) || 0;
      if (!Array.isArray(g.log)) g.log = [];
      g.unit = g.unit || '';
      // з v2: «один раз» → 1 повторення
      g.subgoals = (Array.isArray(g.subgoals) ? g.subgoals : []).map((s0) => {
        const s = Object.assign({ title: '', target: 1, weight: 10, extra: 0 }, withId(s0));
        if (s.kind === 'once') s.target = 1;
        if (!Array.isArray(s.log)) s.log = [];
        s.kind = kindOf(s.kind);
        return s;
      });
      if (!g.tag) g.tag = LP.makeTag(g.title);
      return g;
    });

    // обсерваторія з v2: { people:[ids], level } → { personId: '+' }
    const support = {};
    Object.entries(d.support && typeof d.support === 'object' ? d.support : {}).forEach(([k, v]) => {
      if (v && Array.isArray(v.people)) {
        support[k] = {};
        v.people.forEach((pid) => (support[k][pid] = '+'));
      } else if (v && typeof v === 'object') support[k] = Object.assign({}, v);
    });

    const settings = {
      dayStart: d.settings && Number.isFinite(d.settings.dayStart) ? d.settings.dayStart : base.settings.dayStart,
      dayEnd: d.settings && Number.isFinite(d.settings.dayEnd) ? d.settings.dayEnd : base.settings.dayEnd,
      fitDay: !(d.settings && d.settings.fitDay === false),
      orderWarnings: !(d.settings && d.settings.orderWarnings === false),
      grain: !(d.settings && d.settings.grain === false),
      // Telegram: куди писати, за скільки хвилин нагадувати (-1 — ні), о котрій надсилати план дня (-1 — ні)
      tgChat: d.settings && d.settings.tgChat ? String(d.settings.tgChat).trim() : '',
      remindBefore: d.settings && Number.isFinite(d.settings.remindBefore) ? d.settings.remindBefore : 10,
      morningAt: d.settings && Number.isFinite(d.settings.morningAt) ? d.settings.morningAt : 8 * 60,
      mealsCut: !(d.settings && d.settings.mealsCut === false),
      showSleep: !(d.settings && d.settings.showSleep === false),
      wake: d.settings && Number.isFinite(d.settings.wake) ? d.settings.wake : 8 * 60,
      bed: d.settings && Number.isFinite(d.settings.bed) ? d.settings.bed : 23 * 60 + 30,
      fallAsleep: d.settings && Number.isFinite(d.settings.fallAsleep) ? d.settings.fallAsleep : 30,
      accent: d.settings && LP.ACCENTS[d.settings.accent] ? d.settings.accent : 'red',
      showMeals: !(d.settings && d.settings.showMeals === false),
      lang: 'uk', // англійську версію зробимо наприкінці, одним разом
    };
    const tasks = (Array.isArray(d.tasks) ? d.tasks : []).map((t) =>
      Object.assign({ title: '', mood: 'mid', stage: 'board', x: 0.1, y: 0.1, goalId: null, subgoalId: null, duration: 60, bonus: '', note: '', start: null, createdAt: u.today() }, withId(t))
    );
    tasks.forEach((t) => { if (t.mood === 'good') t.bonus = ''; });
    const taskIds = new Set(tasks.map((t) => t.id));

    return {
      version: 3,
      settings,
      goals,
      events: (Array.isArray(d.events) ? d.events : []).map((e) =>
        Object.assign({ repeat: 'none', until: null, doneDates: [], skipDates: [], note: '', goalId: null, subgoalId: null,
          customGoal: '', habitId: null, mood: null, bonus: '', taskId: null }, withId(e))
      ),
      tasks,
      links: (Array.isArray(d.links) ? d.links : []).map(withId).filter((l) => taskIds.has(l.from) && taskIds.has(l.to)),
      journal: d.journal && typeof d.journal === 'object' ? d.journal : {},
      rewards: (Array.isArray(d.rewards) ? d.rewards : []).map((r) => Object.assign({ used: false, source: '', date: u.today() }, withId(r))),
      habits: (Array.isArray(d.habits) ? d.habits : []).map((h) => {
        const out = Object.assign({ perWeek: 7, timed: false, checks: [], createdAt: u.today() }, withId(h));
        delete out.goalId;
        return out;
      }),
      balance: d.balance && Array.isArray(d.balance.areas)
        ? Object.assign({ current: {}, snapshots: [] }, d.balance, {
            snapshots: (d.balance.snapshots || []).map(withId),
          })
        : base.balance,
      // v6: вісь частоти перевернута (ліворуч — рідко, праворуч — часто) — дзеркалимо старі позиції
      people: (Array.isArray(d.people) ? d.people : []).map((p0) => {
        const p = Object.assign({ note: '', ok: true, tx: null, ty: null }, withId(p0));
        if (!d.relAxis2) {
          if (typeof p.x === 'number') p.x = 1 - p.x;
          if (typeof p.tx === 'number') p.tx = 1 - p.tx;
        }
        return p;
      }),
      relAxis2: true,
      sleepDays: d.sleepDays && typeof d.sleepDays === 'object' ? d.sleepDays : {},
      weekNotes: d.weekNotes && typeof d.weekNotes === 'object' ? d.weekNotes : {},
      life: normLife(d.life),
      meals: Array.isArray(d.meals)
        ? d.meals.map((m) => Object.assign({ name: '', start: 12 * 60, duration: 30, date: null, skipDates: [] }, withId(m)))
        : LP.defaultMeals(),
      support,
    };
  }

  // English: стандартні назви напрямів і прийомів їжі — англійською
  const localizeDefaults = (d) => {
    if (d.settings.lang === 'en' && LP.localizeName) {
      d.balance.areas.forEach((a) => (a.name = LP.localizeName(a.name, 'en')));
      d.meals.forEach((m) => (m.name = LP.localizeName(m.name, 'en')));
    }
    return d;
  };
  LP.data = localizeDefaults(normalize(LP.storage.load()));
  LP.view = { tab: 'week', weekStart: u.weekStart(u.today()), openGoals: {} };

  // ---------- Історія змін для Ctrl+Z / Ctrl+Y (живе, поки відкрита сторінка) ----------
  const undoStack = [], redoStack = [];
  let lastSaved = JSON.stringify(LP.data);

  LP.replaceData = function (d) {
    LP.data = localizeDefaults(normalize(d));
    LP.save();
  };
  LP.reload = function () {
    // English: стандартні назви напрямів і прийомів їжі — англійською
  const localizeDefaults = (d) => {
    if (d.settings.lang === 'en' && LP.localizeName) {
      d.balance.areas.forEach((a) => (a.name = LP.localizeName(a.name, 'en')));
      d.meals.forEach((m) => (m.name = LP.localizeName(m.name, 'en')));
    }
    return d;
  };
  LP.data = localizeDefaults(normalize(LP.storage.load()));
    lastSaved = JSON.stringify(LP.data);
    if (LP.render) LP.render();
  };
  // render: false — зберегти без перемальовування (напр. після перетягування)
  LP.save = function ({ render = true } = {}) {
    const now = JSON.stringify(LP.data);
    if (now !== lastSaved) {
      undoStack.push(lastSaved);
      if (undoStack.length > 80) undoStack.shift();
      redoStack.length = 0;
      lastSaved = now;
      LP.storage.save(LP.data);
    }
    if (render && LP.render) LP.render();
  };
  function restore(json) {
    lastSaved = json;
    LP.data = normalize(JSON.parse(json));
    LP.storage.save(LP.data);
    if (LP.render) LP.render();
  }
  LP.undo = function () {
    if (!undoStack.length) return false;
    redoStack.push(lastSaved);
    restore(undoStack.pop());
    return true;
  };
  LP.redo = function () {
    if (!redoStack.length) return false;
    undoStack.push(lastSaved);
    restore(redoStack.pop());
    return true;
  };

  const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

  // ================= Цілі =================
  LP.goal = (id) => LP.data.goals.find((g) => g.id === id) || null;
  LP.bigGoals = () => LP.data.goals.filter((g) => g.level === 'long' || g.level === 'short');
  LP.subgoal = (g, sid) => (g && g.subgoals ? g.subgoals.find((s) => s.id === sid) : null) || null;

  LP.validateGoal = function (g) {
    const errors = [];
    if (!g.title || !g.title.trim()) errors.push('Назви ціль.');
    if (g.level === 'week') return errors;
    const len = (g.description || '').trim().length;
    if (len < LP.MIN_DESCRIPTION) errors.push(`Опиши ціль детальніше: ще ${LP.MIN_DESCRIPTION - len} симв. (мінімум ${LP.MIN_DESCRIPTION}).`);
    if (g.start && g.deadline && g.deadline < g.start) errors.push('Дедлайн не може бути раніше за старт.');
    const subs = (g.subgoals || []).filter((s) => s.title.trim());
    if (!subs.length && g.kind !== 'once' && !(g.target > 0)) errors.push('Вкажи мету цілі (скільки разів, годин чи свого числа) — або додай підцілі.');
    subs.forEach((s) => {
      if (s.kind !== 'once' && !(s.target > 0)) errors.push(`Підціль «${s.title}»: мета має бути більше нуля.`);
      if (!(s.weight >= 1 && s.weight <= 100)) errors.push(`Підціль «${s.title}»: вага від 1 до 100.`);
    });
    return errors;
  };

  LP.saveGoal = function (fields) {
    fields = clean(fields);
    const existing = fields.id ? LP.goal(fields.id) : null;
    if (existing) Object.assign(existing, fields);
    else LP.data.goals.push(Object.assign({ id: u.uid(), createdAt: u.today(), description: '', start: null, deadline: null, image: null, extra: 0 }, fields));
    LP.save();
  };

  LP.deleteGoal = function (id) {
    LP.data.events.forEach((e) => {
      if (e.goalId === id) { e.goalId = null; e.subgoalId = null; }
    });
    LP.data.tasks.forEach((t) => {
      if (t.goalId === id) { t.goalId = null; t.subgoalId = null; }
    });
    LP.data.goals.forEach((g) => {
      if (g.parentId === id) g.parentId = null;
    });
    LP.data.goals = LP.data.goals.filter((g) => g.id !== id);
    LP.save();
  };

  // Скільки зроблено за мірилом: справи, привʼязані до (цілі, підцілі) + ручні відмітки
  function measure(goalId, subId, kind, target, extra, unit) {
    let count = 0, minutes = 0;
    for (const e of LP.data.events) {
      if (e.goalId !== goalId || (e.subgoalId || null) !== (subId || null)) continue;
      count += e.doneDates.length;
      minutes += e.doneDates.length * (e.end - e.start);
    }
    const t = Number(target) || 0;
    const x = Number(extra) || 0;
    if (kind === 'once') {
      const ok = count + x >= 1;
      return { done: ok ? 1 : 0, target: 1, ratio: ok ? 1 : 0, label: ok ? 'зроблено' : 'ще ні' };
    }
    if (kind === 'amount') {
      return { done: x, target: t, ratio: t ? Math.max(0, Math.min(1, x / t)) : 0, label: `${LP.fmtNum(x)} / ${LP.fmtNum(t)}${unit ? ' ' + unit : ''}` };
    }
    if (kind === 'hours') {
      const h = Math.round((minutes / 60 + x) * 10) / 10;
      return { done: h, target: t, ratio: t ? Math.min(1, h / t) : 0, label: `${String(h).replace('.', ',')} / ${t} год` };
    }
    const n = count + x;
    return { done: n, target: t, ratio: t ? Math.min(1, n / t) : 0, label: `${n} / ${t}` };
  }

  // Скільки часу пішло на ціль загалом (усі виконані справи, з підціллю й без) і що зроблено без підцілі
  LP.goalTime = function (g) {
    let minutes = 0, planned = 0;
    const loose = new Map();
    const today = u.today();
    const add = (e, m, plan, date) => {
      if (e.subgoalId && LP.subgoal(g, e.subgoalId)) return;
      const name = e.title.replace(/ · \d+\/\d+$/, '').trim();
      const key = name.toLowerCase();
      const it = loose.get(key) || { title: name, count: 0, minutes: 0, planned: 0, last: '', next: '' };
      if (plan) { it.planned += m; if (!it.next || date < it.next) it.next = date; } else { it.count += 1; it.minutes += m; if (date > it.last) it.last = date; }
      loose.set(key, it);
    };
    for (const e of LP.data.events) {
      if (e.goalId !== g.id) continue;
      const len = e.end - e.start;
      e.doneDates.forEach((d) => { minutes += len; add(e, len, false, d); });
    }
    // заплановане й ще не виконане: від сьогодні до кінця тижня (щотижневі) і всі майбутні разові
    const we = u.addDays(u.weekStart(today), 6);
    LP.occurrences(today, we).forEach((o) => {
      if (o.ev.goalId !== g.id || o.done || o.ev.repeat !== 'weekly') return;
      planned += o.ev.end - o.ev.start; add(o.ev, o.ev.end - o.ev.start, true, o.date);
    });
    LP.data.events.forEach((e) => {
      if (e.goalId !== g.id || e.repeat === 'weekly' || e.date < today || e.doneDates.includes(e.date)) return;
      planned += e.end - e.start; add(e, e.end - e.start, true, e.date);
    });
    return { minutes, planned, loose: Array.from(loose.values()).sort((a, b) => ((a.last || a.next) < (b.last || b.next) ? 1 : -1)) };
  };
  LP.subProgress = (g, s) => measure(g.id, s.id, s.kind, s.target, s.extra, s.unit);
  LP.ownProgress = (g) => measure(g.id, null, g.kind, g.target, g.extra, g.unit);

  LP.goalProgress = function (g) {
    if (!g) return 0;
    if (g.level === 'week') return LP.weekGoalDone(g) ? 1 : 0;
    const subs = (g.subgoals || []).filter((s) => s.title);
    if (!subs.length) return LP.ownProgress(g).ratio;
    const total = subs.reduce((s, x) => s + (Number(x.weight) || 0), 0);
    if (!total) return 0;
    return subs.reduce((s, x) => s + (Number(x.weight) || 0) * LP.subProgress(g, x).ratio, 0) / total;
  };

  // Ручна відмітка (для того, що зроблено поза планером); subId = null → сама ціль
  LP.bump = function (goalId, subId, delta) {
    const g = LP.goal(goalId);
    const target = subId ? LP.subgoal(g, subId) : g;
    if (!target) return;
    target.extra = Math.max(0, Math.round(((Number(target.extra) || 0) + delta) * 10) / 10);
    LP.save();
  };
  // Одноразова: позначити / зняти
  LP.toggleOnce = function (goalId, subId) {
    const g = LP.goal(goalId);
    const target = subId ? LP.subgoal(g, subId) : g;
    if (!target) return;
    target.extra = (Number(target.extra) || 0) >= 1 ? 0 : 1;
    LP.save();
  };
  // Своє число (гроші, сторінки, км): внески з датою; сума внесків — прогрес
  LP.addEntry = function (goalId, subId, value, note) {
    const g = LP.goal(goalId);
    const target = subId ? LP.subgoal(g, subId) : g;
    if (!target || !value) return;
    target.log = Array.isArray(target.log) ? target.log : [];
    target.log.push({ id: u.uid(), date: u.today(), v: value, note: note || '' });
    target.extra = Math.round(target.log.reduce((s, e) => s + e.v, 0) * 100) / 100;
    LP.save();
  };
  LP.removeEntry = function (goalId, subId, entryId) {
    const g = LP.goal(goalId);
    const target = subId ? LP.subgoal(g, subId) : g;
    if (!target) return;
    target.log = (target.log || []).filter((e) => e.id !== entryId);
    target.extra = Math.round(target.log.reduce((s, e) => s + e.v, 0) * 100) / 100;
    LP.save();
  };

  // ---------- Цілі тижня ----------
  // «З часом» — привʼязані до справи в розкладі: виконана, коли виконана справа.
  LP.weekGoalDone = function (g) {
    if (g.eventId) {
      const ev = LP.event(g.eventId);
      if (ev) return ev.doneDates.includes(g.eventDate);
    }
    return !!g.done;
  };
  // Невиконані цілі минулих тижнів переносяться на поточний тиждень (у кінець списку).
  // Ціль з часом у розкладі при перенесенні стає звичайною — час на новий тиждень ставиш сам.
  LP.carryOverWeekGoals = function () {
    const ws = u.weekStart(u.today());
    let moved = 0;
    const maxOrder = () => {
      // спершу закріплюємо поточний порядок, щоб перенесене стало в кінець
      LP.weekGoalsOf(ws).forEach((g, k) => { if (g.order == null) g.order = k + 1; });
      return Math.max(0, ...LP.data.goals.filter((g) => g.level === 'week' && g.week === ws).map((g) => g.order || 0));
    };
    LP.data.goals.forEach((g) => {
      if (g.level !== 'week' || !g.week || g.week >= ws || LP.weekGoalDone(g)) return;
      g.week = ws;
      g.carried = (g.carried || 0) + 1;
      g.eventId = null;
      g.eventDate = null;
      g.done = false;
      g.order = maxOrder() + 1;
      moved++;
    });
    if (moved) LP.save({ render: false });
    return moved;
  };
  // Порядок цілей тижня (пріоритет / що за чим)
  LP.weekGoalsOf = (ws) => LP.data.goals
    .filter((g) => g.level === 'week' && g.week === ws)
    .map((g, i) => ({ g, i }))
    .sort((a, b) => (a.g.order ?? 1e9 + a.i) - (b.g.order ?? 1e9 + b.i))
    .map((x) => x.g);
  LP.reorderWeekGoals = function (ids) {
    ids.forEach((id, k) => { const g = LP.goal(id); if (g) g.order = k + 1; });
    LP.save();
  };
  LP.toggleWeekGoal = function (id) {
    const g = LP.goal(id);
    if (!g) return;
    const ev = g.eventId ? LP.event(g.eventId) : null;
    if (ev) return LP.toggleDone(ev.id, g.eventDate);
    g.done = !g.done;
    LP.save();
  };
  LP.weekGoalFor = (evId, date) => LP.data.goals.find((g) => g.level === 'week' && g.eventId === evId && g.eventDate === date) || null;

  // ================= Справи =================
  LP.event = (id) => LP.data.events.find((e) => e.id === id) || null;

  LP.eventTag = function (ev) {
    if (ev.habitId) return '↻';
    const g = ev.goalId ? LP.goal(ev.goalId) : null;
    return g ? g.tag || LP.makeTag(g.title) : '';
  };
  LP.eventKind = function (ev) {
    if (ev.habitId && LP.habit(ev.habitId)) return 'habit';
    if (ev.goalId && LP.goal(ev.goalId)) return 'goal';
    if (ev.customGoal) return 'custom';
    return 'none';
  };

  LP.occurrences = function (from, to) {
    const out = [];
    for (const ev of LP.data.events) {
      if (ev.repeat === 'weekly') {
        const last = ev.until && ev.until < to ? ev.until : to;
        let d = ev.date > from ? ev.date : from;
        d = u.addDays(d, (u.weekday(ev.date) - u.weekday(d) + 7) % 7);
        while (d <= last) {
          if (!ev.skipDates.includes(d)) out.push({ ev, date: d, done: ev.doneDates.includes(d) });
          d = u.addDays(d, 7);
        }
      } else if (ev.date >= from && ev.date <= to) {
        out.push({ ev, date: ev.date, done: ev.doneDates.includes(ev.date) });
      }
    }
    return out;
  };

  // Коли справу з бонусом виконано — бонус потрапляє в «Заслужене»; якщо відмітку знято — зникає (якщо ще не використаний)
  LP.syncReward = function (ev, date, done) {
    const has = LP.data.rewards.find((r) => r.eventId === ev.id && r.date === date);
    if (done && ev.bonus && LP.bonusAllowed(ev.mood) && !has) {
      LP.data.rewards.push({ id: u.uid(), text: ev.bonus, source: ev.title, eventId: ev.id, date, used: false });
      return true;
    }
    if (!done && has && !has.used) LP.data.rewards = LP.data.rewards.filter((r) => r !== has);
    return false;
  };

  // Позначка виконання. Якщо щойно виконано задачу з бонусом — святкуємо.
  LP.toggleDone = function (evId, date) {
    const ev = LP.event(evId);
    if (!ev) return;
    const i = ev.doneDates.indexOf(date);
    if (i >= 0) ev.doneDates.splice(i, 1);
    else ev.doneDates.push(date);
    const earned = LP.syncReward(ev, date, i < 0);
    LP.save();
    if (earned && LP.celebrate) LP.celebrate(ev);
  };
  LP.toggleRewardUsed = function (id) {
    const r = LP.data.rewards.find((x) => x.id === id);
    if (r) r.used = !r.used;
    LP.save();
  };
  LP.deleteReward = function (id) {
    LP.data.rewards = LP.data.rewards.filter((x) => x.id !== id);
    LP.save();
  };

  LP.addEvent = function (fields) {
    const ev = Object.assign(
      { id: u.uid(), title: '', repeat: 'none', until: null, doneDates: [], skipDates: [], note: '', goalId: null, subgoalId: null,
        customGoal: '', habitId: null, mood: null, bonus: '', taskId: null },
      clean(fields)
    );
    LP.data.events.push(ev);
    if (ev.taskId) {
      const t = LP.task(ev.taskId);
      if (t) t.stage = 'scheduled';
    }
    LP.save();
    return ev;
  };

  LP.rescheduleEvent = function (evId, occDate, { date, start, end }) {
    const ev = LP.event(evId);
    if (!ev) return;
    const moveWeekGoal = (fromDate, toDate, newId) => {
      const wg = LP.weekGoalFor(evId, fromDate);
      if (wg) Object.assign(wg, { eventDate: toDate, week: u.weekStart(toDate) }, newId ? { eventId: newId } : {});
    };
    if (ev.repeat !== 'weekly') {
      moveWeekGoal(occDate, date);
      Object.assign(ev, { date, start, end });
      if (ev.doneDates.length) ev.doneDates = ev.doneDates.includes(occDate) ? [date] : [];
      LP.save();
      return;
    }
    const occWeek = u.weekStart(occDate);
    const shift = u.weekday(date) - u.weekday(occDate);
    if (ev.date >= occWeek) {
      moveWeekGoal(occDate, date);
      ev.date = u.addDays(ev.date, shift);
      ev.doneDates = ev.doneDates.map((d) => u.addDays(d, shift));
      ev.skipDates = ev.skipDates.map((d) => u.addDays(d, shift));
      Object.assign(ev, { start, end });
    } else {
      const copy = Object.assign({}, ev, {
        id: u.uid(), date, start, end,
        doneDates: ev.doneDates.filter((d) => d >= occWeek).map((d) => u.addDays(d, shift)),
        skipDates: ev.skipDates.filter((d) => d >= occWeek).map((d) => u.addDays(d, shift)),
      });
      moveWeekGoal(occDate, date, copy.id);
      ev.until = u.addDays(occWeek, -1);
      ev.doneDates = ev.doneDates.filter((d) => d < occWeek);
      ev.skipDates = ev.skipDates.filter((d) => d < occWeek);
      LP.data.events.push(copy);
    }
    LP.save();
  };

  // ---------- Серії на кілька днів тижня (одна задача в той самий час у вибрані дні) ----------
  // Кожен день — окрема щотижнева справа; спільний ідентифікатор group звʼязує їх.
  LP.eventGroup = function (ev, occDate) {
    if (!ev.group) return [ev];
    return LP.data.events.filter((x) => x.group === ev.group && x.repeat === 'weekly' && (!x.until || x.until >= occDate));
  };
  // Нова серія: додати решту днів у тому ж тижні (дні, що вже минули, — з наступного тижня)
  LP.addGroupDays = function (base, days, date) {
    const ws = u.weekStart(date);
    days.forEach((k) => {
      if (k === u.weekday(base.date)) return;
      let d = u.addDays(ws, k);
      if (d < u.today()) d = u.addDays(d, 7);
      LP.data.events.push(Object.assign({}, base, { id: u.uid(), date: d, doneDates: [], skipDates: [], until: null, taskId: null }));
    });
    LP.save();
  };
  // propagate: true — назва/тип/час змінюються в усіх днях серії; false — лише цей день
  LP.setGroupDays = function (target, occDate, days, fields, time, propagate = true) {
    const ws = u.weekStart(occDate);
    const sibs = LP.eventGroup(target, occDate);
    const have = new Map(sibs.map((x) => [u.weekday(x.date), x]));
    if (days.length > 1 && !target.group) target.group = u.uid();
    // прибрані дні: з цього тижня більше не стоять
    sibs.forEach((x) => {
      if (x === target || days.includes(u.weekday(x.date))) return;
      if (x.date >= ws) LP.data.events = LP.data.events.filter((e) => e !== x);
      else {
        x.until = u.addDays(ws, -1);
        x.doneDates = x.doneDates.filter((dd) => dd < ws);
      }
    });
    // додані дні
    days.forEach((k) => {
      if (have.has(k) || k === u.weekday(target.date)) return;
      let d = u.addDays(ws, k);
      if (d < u.today()) d = u.addDays(d, 7);
      LP.data.events.push(Object.assign({}, target, fields, time || {}, { id: u.uid(), date: d, repeat: 'weekly', group: target.group, doneDates: [], skipDates: [], until: null, taskId: null }));
    });
    // спільні поля для всіх днів серії
    if (propagate) sibs.forEach((x) => {
      if (x === target || !LP.data.events.includes(x)) return;
      Object.assign(x, fields, time || {});
    });
    if (days.length <= 1 && target.group && !LP.data.events.some((e) => e !== target && e.group === target.group)) delete target.group;
  };

  LP.deleteEvent = function (evId, occDate, mode = 'all') {
    const ev = LP.event(evId);
    if (!ev) return;
    // «цю й наступні» для серії на кілька днів — зупиняє всі дні серії з цієї дати
    if (mode === 'following' && ev.group) {
      LP.data.events.filter((x) => x.group === ev.group && x !== ev).forEach((x) => {
        if (x.date >= occDate) LP.data.events = LP.data.events.filter((e) => e !== x);
        else if (!x.until || x.until >= occDate) {
          x.until = u.addDays(occDate, -1);
          x.doneDates = x.doneDates.filter((dd) => dd < occDate);
        }
      });
    }
    const detach = (pred) =>
      LP.data.goals.forEach((g) => {
        if (g.level === 'week' && g.eventId === evId && pred(g.eventDate)) {
          g.done = ev.doneDates.includes(g.eventDate);
          g.eventId = null;
        }
      });
    if (ev.repeat === 'weekly' && mode === 'one') {
      ev.skipDates.push(occDate);
      detach((d) => d === occDate);
    } else if (ev.repeat === 'weekly' && mode === 'following' && occDate > ev.date) {
      ev.until = u.addDays(occDate, -1);
      ev.doneDates = ev.doneDates.filter((d) => d < occDate);
      detach((d) => d >= occDate);
    } else {
      detach(() => true);
      LP.data.events = LP.data.events.filter((e) => e.id !== evId);
      // задача повертається в беклог, якщо ще не виконана
      // (якщо задача була поділена на частини — лише коли прибрано всі її частини)
      if (ev.taskId && !ev.doneDates.length && !LP.data.events.some((e) => e.taskId === ev.taskId)) {
        const t = LP.task(ev.taskId);
        if (t) t.stage = 'backlog';
      }
    }
    LP.save();
  };

  // Правило «не ставити важке підряд»: повертає Map(eventId|date → 'bad'|'mid')
  LP.sequenceWarnings = function (occ) {
    const warn = new Map();
    const byDay = {};
    occ.forEach((o) => (byDay[o.date] = byDay[o.date] || []).push(o));
    const list = [];
    if (LP.data.settings.orderWarnings === false) { warn.list = list; return warn; }
    const rank = { good: 0, mid: 1, bad: 2 };
    Object.entries(byDay).forEach(([date, arr]) => {
      // однаковий старт: спершу приємна (напр. 15 хв кави між двома важкими)
      const withMood = arr.filter((o) => o.ev.mood).sort((a, b) => a.ev.start - b.ev.start || rank[a.ev.mood] - rank[b.ev.mood]);
      for (let i = 1; i < withMood.length; i++) {
        // пауза від 2 годин між задачами — це вже не «підряд»
        if (withMood[i].ev.start - withMood[i - 1].ev.end >= 120) continue;
        // «робота / обовʼязкове» — не попереджати
        if (withMood[i].ev.noWarn || withMood[i - 1].ev.noWarn) continue;
        const a = withMood[i - 1].ev.mood, b = withMood[i].ev.mood;
        let level = null;
        if (a === 'bad' && b === 'bad') level = 'bad';
        else if ((a === 'bad' && b === 'mid') || (a === 'mid' && b === 'bad') || (a === 'mid' && b === 'mid')) level = 'mid';
        if (level) {
          warn.set(withMood[i].ev.id + '|' + date, level);
          list.push({ date, level, a: withMood[i - 1].ev.title, b: withMood[i].ev.title, gapAt: withMood[i - 1].ev.end, bId: withMood[i].ev.id });
        }
      }
    });
    warn.list = list;
    return warn;
  };

  // ================= Задачі (дошка й беклог) =================
  LP.task = (id) => LP.data.tasks.find((t) => t.id === id) || null;
  LP.saveTask = function (fields, silent) {
    fields = clean(fields);
    const t = fields.id ? LP.task(fields.id) : null;
    if (t) Object.assign(t, fields);
    else LP.data.tasks.push(Object.assign({ id: u.uid(), title: '', mood: 'mid', stage: 'board', x: 0.1, y: 0.1, goalId: null, subgoalId: null, duration: 60, bonus: '', note: '', start: null, createdAt: u.today() }, fields));
    const t2 = fields.id ? LP.task(fields.id) : LP.data.tasks[LP.data.tasks.length - 1];
    if (t2 && t2.stage !== 'board') unlinkTask(t2.id); // зі стрілок прибираємо все, що пішло з дошки
    LP.save({ render: !silent });
  };
  function unlinkTask(id) {
    LP.data.links = LP.data.links.filter((l) => l.from !== id && l.to !== id);
  }
  LP.deleteTask = function (id) {
    LP.data.tasks = LP.data.tasks.filter((t) => t.id !== id);
    unlinkTask(id);
    LP.save();
  };

  // ---------- Стрілки між задачами на дошці: ланцюжки з часом ----------
  // Кожна задача має щонайбільше одну вхідну й одну вихідну стрілку — виходить ланцюжок.
  LP.link = function (from, to) {
    if (from === to) return;
    // не замикаємо коло
    let cur = to;
    const seen = new Set();
    while (cur && !seen.has(cur)) {
      if (cur === from) return;
      seen.add(cur);
      const next = LP.data.links.find((l) => l.from === cur);
      cur = next ? next.to : null;
    }
    LP.data.links = LP.data.links.filter((l) => l.from !== from && l.to !== to);
    const t = LP.task(from);
    LP.data.links.push({ id: u.uid(), from, to, gap: t && t.duration >= LP.BREAK_AFTER ? 10 : 0 });
    LP.save();
  };
  LP.unlink = function (id) {
    LP.data.links = LP.data.links.filter((l) => l.id !== id);
    LP.save();
  };
  LP.setGap = function (id, gap) {
    const l = LP.data.links.find((x) => x.id === id);
    if (l) l.gap = gap;
    LP.save();
  };
  // Ланцюжки: [{ items: [{ task, start, end }], links: [link] }]; час рахується від старту першої задачі
  LP.chains = function () {
    const links = LP.data.links;
    const heads = LP.data.tasks.filter((t) => t.stage === 'board' && links.some((l) => l.from === t.id) && !links.some((l) => l.to === t.id));
    return heads.map((head) => {
      const items = [], chainLinks = [];
      let t = head, time = head.start != null ? head.start : 9 * 60;
      const seen = new Set();
      while (t && !seen.has(t.id)) {
        seen.add(t.id);
        const parts = LP.taskParts(t, time);
        const end = parts[parts.length - 1].end;
        items.push({ task: t, start: time, end, parts });
        time = end;
        const l = links.find((x) => x.from === t.id);
        if (!l) break;
        chainLinks.push(l);
        time += l.gap || 0;
        t = LP.task(l.to);
      }
      return { head, items, links: chainLinks };
    });
  };
  LP.taskTimes = function () {
    const map = new Map();
    LP.chains().forEach((c) => c.items.forEach((it, i) => map.set(it.task.id, Object.assign({ first: i === 0, chain: c }, it))));
    return map;
  };
  // Ланцюжок у розклад на обраний день
  LP.chainToWeek = function (headId, date) {
    const c = LP.chains().find((x) => x.head.id === headId);
    if (!c) return;
    c.items.forEach(({ task, parts }) => {
      LP.addTaskEvents(task, date, parts, true);
      task.stage = 'scheduled';
      unlinkTask(task.id);
    });
    LP.save();
  };

  // Задача → справи в розкладі: кожна частина — окрема справа «Назва · 1/3»; бонус — лише за останню частину
  LP.addTaskEvents = function (task, date, parts, silent) {
    const created = [];
    parts.forEach((p, i) => {
      if (p.start >= 24 * 60) return;
      const last = i === parts.length - 1;
      const ev = {
        id: u.uid(), title: parts.length > 1 ? `${task.title} · ${i + 1}/${parts.length}` : task.title,
        date, start: p.start, end: Math.min(p.end, 24 * 60), repeat: 'none', until: null, doneDates: [], skipDates: [],
        note: task.note || '', goalId: task.goalId || null, subgoalId: task.subgoalId || null, customGoal: '', habitId: null,
        mood: task.mood, bonus: last && LP.bonusAllowed(task.mood) ? task.bonus || '' : '', taskId: task.id,
      };
      LP.data.events.push(ev);
      created.push(ev);
    });
    task.stage = 'scheduled';
    if (!silent) LP.save();
    return created;
  };

  // ---------- Сон: підйом і відбій у кожному дні ----------
  // bed може бути після опівночі: 24:30 = 1470 хв. Сон дня D = від відбою D-1 до підйому D мінус час на засинання.
  LP.sleepOn = function (date) {
    const s = LP.data.settings;
    const o = (LP.data.sleepDays || {})[date] || {};
    return { wake: o.wake != null ? o.wake : s.wake, bed: o.bed != null ? o.bed : s.bed, custom: o.wake != null || o.bed != null };
  };
  LP.sleepHours = function (date) {
    const prev = LP.sleepOn(u.addDays(date, -1)), cur = LP.sleepOn(date);
    const min = cur.wake + 24 * 60 - prev.bed - (LP.data.settings.fallAsleep || 0);
    return Math.max(0, min) / 60;
  };
  LP.setSleep = function (date, fields) {
    LP.data.sleepDays = LP.data.sleepDays || {};
    const o = Object.assign({}, LP.data.sleepDays[date], fields);
    Object.keys(o).forEach((k) => o[k] == null && delete o[k]);
    if (Object.keys(o).length) LP.data.sleepDays[date] = o;
    else delete LP.data.sleepDays[date];
    LP.save();
  };

  // ---------- Щоденник стану ----------
  LP.journal = (date) => LP.data.journal[date] || null;
  LP.saveJournal = function (date, entry) {
    // виділення маркером живуть, поки текст поля не змінено
    const prev = LP.data.journal[date];
    if (prev && prev.marks && !entry.marks) {
      const marks = {};
      ['note', 'gratitude'].forEach((k) => {
        if (prev.marks[k] && prev.marks[k].length && prev[k] === entry[k]) marks[k] = prev.marks[k];
      });
      if (Object.keys(marks).length) entry.marks = marks;
    }
    const empty = !entry.state && !entry.score && !entry.note && !entry.gratitude;
    if (empty) delete LP.data.journal[date];
    else LP.data.journal[date] = entry;
    LP.save();
  };
  // Виділити / зняти виділення фрагмента [a, b) у полі запису щоденника
  LP.markJournal = function (date, field, a, b) {
    const e = LP.data.journal[date];
    if (!e || b <= a) return;
    e.marks = e.marks || {};
    const list = (e.marks[field] || []).concat([[a, b]]).sort((x, y) => x[0] - y[0]);
    const merged = [];
    list.forEach(([x, y]) => {
      const last = merged[merged.length - 1];
      if (last && x <= last[1]) last[1] = Math.max(last[1], y);
      else merged.push([x, y]);
    });
    e.marks[field] = merged;
    LP.save({ render: false });
  };
  LP.unmarkJournal = function (date, field, index) {
    const e = LP.data.journal[date];
    if (!e || !e.marks || !e.marks[field]) return;
    e.marks[field].splice(index, 1);
    LP.save({ render: false });
  };
  LP.backlog = () => LP.data.tasks.filter((t) => t.stage === 'backlog');

  // ---------- Плани: розкладена дошка, що переїхала в беклог цілою ----------
  // task.plan = { id, i, at, gap }: порядок у ланцюжку, запланований старт, перерва після задачі
  LP.boardToBacklog = function () {
    let n = 0;
    LP.chains().sort((a, b) => a.items[0].start - b.items[0].start).forEach((c) => {
      const pid = u.uid();
      c.items.forEach((it, i) => {
        it.task.plan = { id: pid, i, at: it.start, gap: c.links[i] ? c.links[i].gap || 0 : 0 };
        it.task.stage = 'backlog';
        n++;
      });
      c.items.forEach((it) => unlinkTask(it.task.id));
    });
    LP.data.tasks.filter((t) => t.stage === 'board').forEach((t) => { t.plan = null; t.stage = 'backlog'; n++; });
    LP.save();
    return n;
  };
  // Час кожної задачі плану від старту (рахується наново — якщо задачу змінили, план підлаштується)
  LP.planTimes = function (items, start) {
    let time = start;
    return items.map((t) => {
      const parts = LP.taskParts(t, time);
      const it = { task: t, start: time, end: parts[parts.length - 1].end, parts, gap: t.plan.gap || 0 };
      time = it.end + it.gap;
      return it;
    });
  };
  LP.backlogPlans = function () {
    const by = new Map();
    LP.backlog().filter((t) => t.plan && t.plan.id).forEach((t) => {
      if (!by.has(t.plan.id)) by.set(t.plan.id, []);
      by.get(t.plan.id).push(t);
    });
    return Array.from(by.entries()).filter(([, items]) => items.length > 1).map(([id, items]) => {
      items.sort((a, b) => a.plan.i - b.plan.i);
      const timed = LP.planTimes(items, items[0].plan.at);
      return { id, items: timed, start: timed[0].start, end: timed[timed.length - 1].end };
    }).sort((a, b) => a.start - b.start);
  };
  LP.looseBacklog = () => {
    const inPlan = new Set();
    LP.backlogPlans().forEach((p) => p.items.forEach((it) => inPlan.add(it.task.id)));
    return LP.backlog().filter((t) => !inPlan.has(t.id));
  };
  LP.planToWeek = function (planId, date, start) {
    const plan = LP.backlogPlans().find((p) => p.id === planId);
    if (!plan) return;
    LP.planTimes(plan.items.map((it) => it.task), start).forEach(({ task, parts }) => {
      const fit = parts.filter((p) => p.start < 24 * 60);
      if (fit.length) LP.addTaskEvents(task, date, fit, true);
      task.plan = null;
    });
    LP.save();
  };
  LP.planToBoard = function (planId) {
    const plan = LP.backlogPlans().find((p) => p.id === planId);
    if (!plan) return;
    const ts = plan.items.map((it) => it.task);
    ts.forEach((t, k) => {
      t.stage = 'board';
      if (k < ts.length - 1) LP.data.links.push({ id: u.uid(), from: t.id, to: ts[k + 1].id, gap: t.plan.gap || 0 });
    });
    ts[0].start = plan.start;
    ts.forEach((t) => (t.plan = null));
    LP.save();
  };

  // ================= Звички =================
  LP.habit = (id) => LP.data.habits.find((h) => h.id === id) || null;

  LP.saveHabit = function (fields) {
    fields = clean(fields);
    if (fields.id) Object.assign(LP.habit(fields.id), fields);
    else LP.data.habits.push(Object.assign({ id: u.uid(), perWeek: 7, timed: false, checks: [], createdAt: u.today() }, fields));
    LP.save();
  };

  LP.deleteHabit = function (id) {
    LP.data.events.forEach((e) => {
      if (e.habitId === id) e.habitId = null;
    });
    LP.data.habits = LP.data.habits.filter((h) => h.id !== id);
    LP.save();
  };

  // Дні виконання: для звички «з часом» — лише виконані справи в розкладі; інакше ще й ручні відмітки
  LP.habitDates = function (h) {
    const set = new Set(h.timed ? [] : h.checks);
    for (const e of LP.data.events) {
      if (e.habitId === h.id) e.doneDates.forEach((d) => set.add(d));
    }
    return set;
  };

  LP.toggleHabit = function (id, date) {
    const h = LP.habit(id);
    if (!h || h.timed) return;
    const i = h.checks.indexOf(date);
    if (i >= 0) {
      h.checks.splice(i, 1);
    } else {
      const fromEvents = LP.data.events.filter((e) => e.habitId === id && e.doneDates.includes(date));
      if (fromEvents.length) fromEvents.forEach((e) => e.doneDates.splice(e.doneDates.indexOf(date), 1));
      else h.checks.push(date);
    }
    LP.save();
  };

  LP.habitWeekCount = (h, ws) => {
    const we = u.addDays(ws, 6);
    let n = 0;
    LP.habitDates(h).forEach((d) => {
      if (d >= ws && d <= we) n++;
    });
    return n;
  };

  LP.habitStreak = function (h) {
    let ws = u.weekStart(u.today());
    let streak = LP.habitWeekCount(h, ws) >= h.perWeek ? 1 : 0;
    ws = u.addDays(ws, -7);
    while (LP.habitWeekCount(h, ws) >= h.perWeek) {
      streak++;
      ws = u.addDays(ws, -7);
    }
    return streak;
  };

  // ================= Статистика =================
  LP.weekStats = function (ws) {
    const we = u.addDays(ws, 6);
    const occ = LP.occurrences(ws, we);
    const doneOcc = occ.filter((o) => o.done);
    const dur = (o) => o.ev.end - o.ev.start;
    const weekGoals = LP.data.goals.filter((g) => g.level === 'week' && g.week === ws);
    const habits = LP.data.habits.filter((h) => !h.createdAt || h.createdAt <= we);
    return {
      planned: occ.length,
      done: doneOcc.length,
      minPlanned: occ.reduce((s, o) => s + dur(o), 0),
      minDone: doneOcc.reduce((s, o) => s + dur(o), 0),
      weekGoals: weekGoals.length,
      weekGoalsDone: weekGoals.filter(LP.weekGoalDone).length,
      habitTarget: habits.reduce((s, h) => s + h.perWeek, 0),
      habitDone: habits.reduce((s, h) => s + Math.min(h.perWeek, LP.habitWeekCount(h, ws)), 0),
      occ,
    };
  };

  // ================= Баланс і стосунки =================
  LP.areaScore = (areaId) => {
    const v = LP.data.balance.current[areaId];
    return typeof v === 'number' ? v : 0;
  };
  LP.setAreaScore = function (areaId, score) {
    LP.data.balance.current[areaId] = u.clamp(score, 0, 10);
    LP.saveSnapshot(); // зріз дня оновлюється сам: зберігається останній стан, поки не мине день
  };
  LP.saveSnapshot = function () {
    const snaps = LP.data.balance.snapshots;
    const scores = Object.assign({}, LP.data.balance.current);
    const n = new Date();
    const time = u.fmtTime(n.getHours() * 60 + n.getMinutes());
    const same = snaps.find((s) => s.date === u.today());
    if (same) Object.assign(same, { scores, time }); // одна оцінка на день — оновлюємо сьогоднішню
    else snaps.push({ id: u.uid(), date: u.today(), time, scores });
    snaps.sort((a, b) => (a.date < b.date ? -1 : 1));
    LP.save();
  };
  LP.deleteSnapshot = function (id) {
    LP.data.balance.snapshots = LP.data.balance.snapshots.filter((s) => s.id !== id);
    LP.save();
  };

  LP.person = (id) => LP.data.people.find((p) => p.id === id) || null;
  LP.savePerson = function (fields) {
    fields = clean(fields);
    if (fields.id && LP.person(fields.id)) Object.assign(LP.person(fields.id), fields);
    else LP.data.people.push(Object.assign({ id: u.uid(), x: 0.5, y: 0.5, note: '', ok: true, tx: null, ty: null }, fields));
    LP.save();
  };
  LP.deletePerson = function (id) {
    LP.data.people = LP.data.people.filter((p) => p.id !== id);
    Object.values(LP.data.support).forEach((row) => delete row[id]);
    LP.save();
  };
  LP.cycleSupport = function (keyId, personId) {
    const order = ['', '+', '-', '±'];
    const row = LP.data.support[keyId] || (LP.data.support[keyId] = {});
    const next = order[(order.indexOf(row[personId] || '') + 1) % order.length];
    if (next) row[personId] = next;
    else delete row[personId];
    LP.save();
  };

  // ================= Приклад даних =================
  // приклад англійською, якщо ввімкнено English
  function localizeSample(d) {
    const lang = d.settings && d.settings.lang;
    if (!LP.lang || LP.lang() !== 'en') return d;
    const keys = new Set(['title', 'name', 'description', 'note', 'text', 'source', 'state', 'gratitude', 'customGoal', 'bonus']);
    const walk = (o) => {
      if (Array.isArray(o)) return o.forEach(walk);
      if (!o || typeof o !== 'object') return;
      Object.keys(o).forEach((k) => {
        if (typeof o[k] === 'string' && keys.has(k)) o[k] = LP.localizeName(o[k], 'en');
        else if (typeof o[k] === 'object') walk(o[k]);
      });
    };
    walk(d);
    (d.goals || []).forEach((g) => { if (g.level !== 'week' && g.tag) g.tag = LP.makeTag(g.title); });
    return d;
  }

  LP.loadSample = function () {
    const ws = u.weekStart(u.today());
    const lw = u.addDays(ws, -7);
    const id = () => u.uid();
    const [gP, gR, gE] = [id(), id(), id()];
    const s = { ep: id(), mix: id(), studio: id(), runs: id(), less: id(), talk: id() };
    const [hAlb, hEng, hYoga] = [id(), id(), id()];
    const ev = (o) => Object.assign({ id: id(), repeat: 'none', until: null, doneDates: [], skipDates: [], note: '', goalId: null, subgoalId: null, customGoal: '', habitId: null, mood: null, bonus: '', taskId: null }, o);
    const areas = DEFAULT_AREAS.map((name) => ({ id: id(), name }));
    const scores = [7, 6, 4, 8, 5, 3, 7, 4];
    const cur = {}, s1 = {}, s2 = {};
    areas.forEach((a, i) => {
      cur[a.id] = scores[i];
      s1[a.id] = u.clamp(scores[i] - 2 + (i % 3), 1, 10);
      s2[a.id] = u.clamp(scores[i] - 1 + (i % 2), 1, 10);
    });
    const people = [
      { id: id(), name: 'Мама', x: 0.3, y: 0.8, ok: true },
      { id: id(), name: 'Оля', x: 0.12, y: 0.9, ok: true },
      { id: id(), name: 'Андрій', x: 0.75, y: 0.78, ok: false, tx: 0.35, ty: 0.82, note: 'хочу бачитися частіше' },
      { id: id(), name: 'Колега Ігор', x: 0.15, y: 0.22, ok: false, tx: 0.55, ty: 0.3, note: 'менше контакту поза роботою' },
      { id: id(), name: 'Брат', x: 0.85, y: 0.55, ok: true },
    ];
    const P = (n) => people.find((p) => p.name === n).id;
    const studioEv = id();
    const [bt1, bt2, bt3] = [id(), id(), id()];

    LP.replaceData(localizeSample({
      version: 3,
      settings: LP.data.settings,
      goals: [
        {
          id: gP, level: 'long', title: 'Стати музичним продюсером', tag: 'ПРОД', start: u.addDays(ws, -60), deadline: u.addDays(ws, 700), createdAt: lw,
          description: 'Випускати власну електронну музику на лейблах, зводити треки самостійно й регулярно виступати.',
          kind: 'hours', target: 0, extra: 0,
          subgoals: [
            { id: s.ep, title: 'Треки для EP', kind: 'count', target: 4, weight: 40, extra: 1 },
            { id: s.mix, title: 'Вивчити зведення', kind: 'hours', target: 30, weight: 20, extra: 4 },
            { id: s.studio, title: 'Години в студії', kind: 'hours', target: 50, weight: 40, extra: 6 },
          ],
        },
        {
          id: gR, level: 'short', title: 'Пробігти 10 км', tag: '10К', start: lw, deadline: u.addDays(ws, 60), createdAt: lw,
          description: 'Підготуватися до забігу на 10 км до кінця листопада: регулярні пробіжки й нормальне спорядження.',
          kind: 'count', target: 12, extra: 2, subgoals: [],
        },
        {
          id: gE, level: 'short', title: 'Англійська: курс граматики', tag: 'EN', start: lw, deadline: u.addDays(ws, 45), createdAt: lw,
          description: 'Закрити прогалини в граматиці, щоб вільно читати статті й говорити на робочих дзвінках англійською.',
          kind: 'count', target: 0, extra: 0,
          subgoals: [
            { id: s.less, title: '20 уроків граматики', kind: 'count', target: 20, weight: 70, extra: 4 },
            { id: s.talk, title: 'Розмовна практика', kind: 'hours', target: 10, weight: 30, extra: 1 },
          ],
        },
        { id: id(), level: 'week', title: 'Дописати трек №2', week: ws, done: false, parentId: gP, createdAt: ws },
        { id: id(), level: 'week', title: 'Студія в четвер', week: ws, done: false, parentId: gP, eventId: studioEv, eventDate: u.addDays(ws, 3), createdAt: ws },
        { id: id(), level: 'week', title: 'Уроки 4–6 граматики', week: ws, done: true, parentId: gE, createdAt: ws },
      ],
      events: [
        ev({ title: 'Граматика', goalId: gE, subgoalId: s.less, mood: 'mid', date: lw, start: 8 * 60, end: 9 * 60, repeat: 'weekly', doneDates: [lw, ws] }),
        ev({ title: 'Студія: трек №2', goalId: gP, subgoalId: s.studio, mood: 'good', date: lw, start: 19 * 60, end: 21 * 60 + 30, repeat: 'weekly', doneDates: [lw, ws] }),
        ev({ title: 'Пробіжка', goalId: gR, mood: 'mid', date: u.addDays(lw, 1), start: 7 * 60, end: 8 * 60, repeat: 'weekly', doneDates: [u.addDays(lw, 1), u.addDays(ws, 1)] }),
        ev({ title: 'Податкова декларація', mood: 'bad', bonus: 'Замовити піцу й дивитися фільм', customGoal: 'Здати декларацію', date: u.addDays(ws, 2), start: 16 * 60, end: 17 * 60 + 30 }),
        ev({ title: 'Дзвінок з банком', mood: 'bad', bonus: 'Кава в улюбленому місці', customGoal: 'Закрити стару картку', date: u.addDays(ws, 2), start: 17 * 60 + 30, end: 18 * 60 + 15 }),
        ev({ title: 'Урок зведення', goalId: gP, subgoalId: s.mix, mood: 'good', date: u.addDays(ws, 2), start: 18 * 60 + 30, end: 20 * 60 }),
        ev({ id: studioEv, title: 'Студія: трек №2', goalId: gP, subgoalId: s.studio, mood: 'good', date: u.addDays(ws, 3), start: 19 * 60, end: 21 * 60 }),
        ev({ title: 'Розмовний клуб', goalId: gE, subgoalId: s.talk, mood: 'mid', date: u.addDays(ws, 4), start: 9 * 60, end: 10 * 60 + 30 }),
        ev({ title: 'Йога', habitId: hYoga, mood: 'good', date: lw, start: 7 * 60, end: 7 * 60 + 45, repeat: 'weekly', doneDates: [lw, ws] }),
        ev({ title: 'Планування тижня', mood: 'good', date: u.addDays(ws, 6), start: 11 * 60, end: 12 * 60 }),
        ...[0, 1, 2, 3, 4].map((i) => ev({ title: 'Робота', date: u.addDays(lw, i), start: 10 * 60, end: 15 * 60 + 30, repeat: 'weekly' })),
      ],
      tasks: [
        { id: id(), title: 'Розібрати пошту', mood: 'bad', stage: 'backlog', duration: 45, bonus: 'Серія улюбленого серіалу', createdAt: ws },
        { id: id(), title: 'Записати вокальні семпли', mood: 'good', stage: 'backlog', goalId: gP, subgoalId: s.ep, duration: 120, createdAt: ws },
        { id: id(), title: 'Купити бігові кросівки', mood: 'mid', stage: 'backlog', goalId: gR, duration: 60, createdAt: ws },
        { id: bt1, title: 'Прибрати в шафі', mood: 'bad', stage: 'board', x: 0.04, y: 0.1, duration: 60, start: 10 * 60, bonus: 'Кава з тістечком', createdAt: ws },
        { id: bt2, title: 'Прогулянка в парку', mood: 'good', stage: 'board', x: 0.36, y: 0.34, duration: 45, createdAt: ws },
        { id: bt3, title: 'Оновити резюме', mood: 'mid', stage: 'board', x: 0.66, y: 0.1, duration: 90, bonus: 'Серія серіалу', createdAt: ws },
        { id: id(), title: 'Сходити на виставку', mood: 'good', stage: 'board', x: 0.1, y: 0.66, duration: 120, createdAt: ws },
      ],
      links: [{ id: id(), from: bt1, to: bt2, gap: 10 }, { id: id(), from: bt2, to: bt3, gap: 0 }],
      journal: {
        [u.addDays(ws, -3)]: { state: 'втомлено', score: 5, note: 'Довгий робочий тиждень.', gratitude: 'Друзі покликали на каву' },
        [u.addDays(ws, -1)]: { state: 'спокійно', score: 7, note: 'Вихідний, багато спав.', gratitude: '' },
        [ws]: { state: 'натхненно', score: 8, note: 'Дописав біт для другого треку!', gratitude: 'Тиша вранці' },
        [u.addDays(ws, 1)]: { state: 'нормально', score: 6, note: '', gratitude: '' },
        [u.addDays(ws, 2)]: { state: 'тривожно', score: 4, note: 'Податкова й дзвінок з банком.', gratitude: 'Піца ввечері' },
      },
      rewards: [
        { id: id(), text: 'Нові струни для гітари', source: 'Розібрати документи', date: u.addDays(ws, -2), used: false },
        { id: id(), text: 'Кава в улюбленому місці', source: 'Дзвінок з банком', date: u.addDays(ws, -5), used: true },
      ],
      habits: [
        { id: hAlb, title: 'Слухати 1 новий альбом', perWeek: 5, timed: false, checks: [lw, u.addDays(lw, 1), u.addDays(lw, 3), u.addDays(lw, 4), u.addDays(lw, 6), ws, u.addDays(ws, 1)], createdAt: lw },
        { id: hEng, title: '20 хв англійської', perWeek: 7, timed: false, checks: [u.addDays(lw, 1), u.addDays(lw, 2), ws, u.addDays(ws, 1)], createdAt: lw },
        { id: hYoga, title: 'Йога', perWeek: 3, timed: true, checks: [], createdAt: lw },
      ],
      balance: {
        areas, current: cur,
        snapshots: [{ id: id(), date: u.addDays(ws, -56), scores: s1 }, { id: id(), date: u.addDays(ws, -21), scores: s2 }],
      },
      people,
      support: {
        safety: { [P('Мама')]: '+', [P('Оля')]: '+' },
        growth: { [P('Андрій')]: '+', [P('Колега Ігор')]: '±' },
        closeness: { [P('Оля')]: '+', [P('Мама')]: '±' },
        identity: { [P('Андрій')]: '+', [P('Брат')]: '+' },
        romance: { [P('Оля')]: '+' },
        help: { [P('Колега Ігор')]: '+', [P('Брат')]: '+' },
        fun: { [P('Колега Ігор')]: '-' },
      },
    }));
  };
})(window.LP);
