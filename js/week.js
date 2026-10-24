// Тижневий розклад.
// - протягни мишкою по порожньому місцю — нова справа; перетягни справу — перенести;
//   потягни за нижній край — тривалість; квадратик у куті — виконано;
// - задачу з беклогу (панель праворуч) можна перетягнути прямо в сітку.
window.LP = window.LP || {};

(function (LP) {
  const u = LP.u;
  let HOUR_PX = 50;   // перераховується: у режимі «весь день на екрані» — під висоту вікна
  const SNAP = 15;
  const nowMin = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); };

  // Скільки пікселів на годину: або весь день влазить у екран, або стандартні 50
  // телефон: один день на екрані, дні — чипами зверху, свайп — сусідній день
  LP.isMobile = () => window.matchMedia('(max-width: 760px)').matches;
  function hourPx(root, withHint) {
    const { dayStart, dayEnd } = LP.data.settings;
    if (LP.isMobile()) {
      const mh = (document.querySelector('.masthead') || {}).offsetHeight || 140;
      const nav = (document.querySelector('.mast-nav') || {}).offsetHeight || 60;
      return u.clamp(Math.floor(((window.innerHeight - mh - nav - 112) / (dayEnd - dayStart)) * 4) / 4, 30, 70);
    }
    if (LP.data.settings.fitDay === false) return 50;
    const avail = root.clientHeight - 40 - (withHint ? 56 : 0) - 2;
    return u.clamp(Math.floor((avail / (dayEnd - dayStart)) * 4) / 4, 24, 90);
  }

  const px = (min) => ((min - LP.data.settings.dayStart * 60) / 60) * HOUR_PX;
  const shortTime = (m) => (m % 60 ? u.fmtTime(m) : String(Math.floor(m / 60)).padStart(2, '0'));

  // Контур справи — такий самий «характер», як на дошці, але в прямокутнику клітинки:
  // приємна — мʼяко заокруглена, нейтральна — хвиляста, важка — гостра пилка, без типу — простий прямокутник.
  function shapePath(w, h, mood) {
    const f = (n) => n.toFixed(1);
    if (mood === 'good') {
      const r = Math.max(2, Math.min(14, h / 2 - 2, w / 2 - 2));
      const x0 = 1.5, y0 = 1.5, x1 = w - 1.5, y1 = h - 1.5;
      return `M${f(x0 + r)},${f(y0)} H${f(x1 - r)} Q${f(x1)},${f(y0)} ${f(x1)},${f(y0 + r)} V${f(y1 - r)} Q${f(x1)},${f(y1)} ${f(x1 - r)},${f(y1)} H${f(x0 + r)} Q${f(x0)},${f(y1)} ${f(x0)},${f(y1 - r)} V${f(y0 + r)} Q${f(x0)},${f(y0)} ${f(x0 + r)},${f(y0)} Z`;
    }
    if (mood !== 'mid' && mood !== 'bad') return `M1,1 H${f(w - 1)} V${f(h - 1)} H1 Z`;
    const A = mood === 'bad' ? Math.min(4, h / 5) : Math.min(2.2, h / 9);
    const x0 = A + 1, y0 = A + 1, x1 = w - A - 1, y1 = h - A - 1;
    // обхід чотирьох сторін; зміщення вздовж зовнішньої нормалі
    const edges = [
      [x0, y0, x1, y0, 0, -1], [x1, y0, x1, y1, 1, 0], [x1, y1, x0, y1, 0, 1], [x0, y1, x0, y0, -1, 0],
    ];
    let d = '';
    edges.forEach(([ax, ay, bx, by, nx, ny], ei) => {
      const len = Math.hypot(bx - ax, by - ay);
      if (mood === 'bad') {
        const n = Math.max(1, Math.round(len / 8));
        for (let i = 0; i < n * 2; i++) {
          const t = i / (n * 2);
          const k = i % 2 ? A : -A * 0.15;
          const x = ax + (bx - ax) * t + nx * k, y = ay + (by - ay) * t + ny * k;
          d += (d ? 'L' : 'M') + f(x) + ',' + f(y);
        }
      } else {
        const n = Math.max(1, Math.round(len / 22));
        const steps = n * 8;
        for (let i = 0; i < steps; i++) {
          const t = i / steps;
          const k = A * Math.sin(t * n * Math.PI * 2);
          const x = ax + (bx - ax) * t + nx * k, y = ay + (by - ay) * t + ny * k;
          d += (d ? 'L' : 'M') + f(x) + ',' + f(y);
        }
      }
    });
    return d + 'Z';
  }
  function drawShape(el) {
    const w = el.offsetWidth, h = el.offsetHeight;
    if (!w || !h) return;
    let svg = el.querySelector(':scope > .ev-shape');
    if (!svg) {
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'ev-shape');
      svg.setAttribute('aria-hidden', 'true');
      el.prepend(svg);
    }
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.innerHTML = `<path d="${shapePath(w, h, el.dataset.mood)}"/>`;
  }
  LP.drawEventShape = drawShape;

  // Усі підказки по розкладу — в одному вікні за кнопкою «?», щоб не шуміли на екрані
  function openHelp(btn) {
    const sample = (mood, cls, text) => `<span class="sample ${cls}"><svg viewBox="0 0 64 26" aria-hidden="true"><path d="${shapePath(64, 26, mood)}"/></svg><b>${text}</b></span>`;
    const el = LP.popover(btn, 'help-pop', (pop) => {
      pop.innerHTML = `
        <h3>ЯК ЧИТАТИ РОЗКЛАД</h3>
        <div class="help-sec"><div class="label">ФОРМА — ЯКА ЦЕ ЗАДАЧА</div>
          <div class="help-shapes">
            ${sample('good', '', 'ЧИТАТИ')}<span><b>Приємна</b> — мʼяко заокруглена. Бонус не потрібен.</span>
            ${sample('mid', '', 'ПОШТА')}<span><b>Нейтральна</b> — хвиляста. Бонус за бажанням.</span>
            ${sample('bad', '', 'ПОДАТКИ')}<span><b>Важка</b> — гостра пилка. Бонус обовʼязковий.</span>
          </div></div>
        <div class="help-sec"><div class="label">КОНТУР І СТАН</div>
          <div class="help-shapes">
            ${sample('', 'thick', 'ЗАДАЧА')}<span><b>Товстий контур</b> — веде до цілі. Звичайний — без цілі.</span>
            ${sample('', 'dash', 'ЗАДАЧА')}<span><b>Пунктир</b> — своя разова ціль.</span>
            ${sample('', 'dots', 'ЗАДАЧА')}<span><b>Крапки</b> — звичка.</span>
            ${sample('', 'done', 'ЗАДАЧА')}<span><b>Закреслено</b> — виконано.</span>
            ${sample('', 'past', 'ЗАДАЧА')}<span><b>Сіре</b> — час минув.</span>
          </div></div>
        <div class="help-sec"><div class="label">МИШКОЮ</div><ul>
          <li>Протягни по порожній сітці — нова справа. Просто клік — справа на годину.</li>
          <li>Перетягни справу — інший день чи час. Нижній край — тривалість.</li>
          <li>Квадратик у куті — виконано. Клік по справі — змінити.</li>
          <li>Задачу з беклогу (праворуч унизу) тягни прямо в сітку. Довга ділиться на частини з перервами.</li>
        </ul></div>
        <div class="help-sec"><div class="label">ЩЕ</div><ul>
          <li><b>«+ ЯК ТИ?»</b> у шапці сьогоднішнього дня — щоденник. Минулі дні лише читаються.</li>
          <li><b>!</b> на справі — дві важкі задачі підряд (чи важка з нейтральною). Розбав їх приємною.</li>
          <li>Виконав задачу з бонусом — бонус зʼявиться праворуч у «Заслужено ★».</li>
          <li>Клік по датах тижня вгорі — календар тижнів. ← → на клавіатурі — сусідні тижні.</li>
          <li>Чорні лінії — підйом і відбій; від них ніч мʼяко розсіюється. Тягни лінію — змінити цей день, клік — звичний час для всіх днів.</li>
          <li>Робота з важкими задачами підряд: у справі — «Не попереджати про порядок», або в попередженні — «+ 15 хв приємного» (кава з колегами).</li>
          <li><b>Ctrl+C</b> над справою — скопіювати; наведи на іншу клітинку й <b>Ctrl+V</b> — вставити туди копію.</li>
          <li>Задача на кілька днів («Повторювати» → «Кожного дня» / «Вибрані дні»): кожен день можна змінювати окремо — у формі «Лише цей день» або «Усі дні серії».</li>
          <li>Праворуч угорі — що зараз і що далі сьогодні (клік — відкрити справу). Цілі тижня тягни вгору-вниз — пріоритет і черговість; невиконані самі переходять на наступний тиждень. </li>
          <li>Ctrl+Z — відкотити, Ctrl+Y — повернути.</li>
        </ul></div>`;
    });
    if (el) btn.setAttribute('aria-expanded', 'true');
    else btn.setAttribute('aria-expanded', 'false');
  }

  function layoutLanes(items) {
    items.sort((a, b) => a.s - b.s || b.e - a.e);
    const clusters = [];
    let cur = [], curEnd = -1;
    for (const it of items) {
      if (cur.length && it.s >= curEnd) {
        clusters.push(cur);
        cur = [];
        curEnd = -1;
      }
      cur.push(it);
      curEnd = Math.max(curEnd, it.e);
    }
    if (cur.length) clusters.push(cur);
    for (const c of clusters) {
      const lanes = [];
      for (const it of c) {
        let i = lanes.findIndex((end) => end <= it.s);
        if (i < 0) {
          i = lanes.length;
          lanes.push(0);
        }
        lanes[i] = it.e;
        it.lane = i;
      }
      c.forEach((it) => (it.lanes = lanes.length));
    }
    return items;
  }

  // Дорога: туди (перед справою) і/або назад (після) — справа стає довшою, цей шматок сірий з машинкою
  const CAR = '<svg class="car" viewBox="0 0 24 12" aria-hidden="true"><path d="M2 8.5 L4.5 3.5 Q5 2.5 6.5 2.5 H14.5 Q15.5 2.5 16.3 3.3 L19 6 H21 Q22.5 6 22.5 7.5 V9 H2Z"/><circle cx="7" cy="9.5" r="2"/><circle cx="17.5" cy="9.5" r="2"/></svg>';
  LP.travelOf = (ev) => (!LP.FEATURES || !LP.FEATURES.travel ? { before: 0, after: 0 } : { before: ev.travelBefore != null ? ev.travelBefore : ev.travel || 0, after: ev.travelAfter != null ? ev.travelAfter : ev.travel || 0 });
  const tband = (min, pos) => `<div class="tband tband-${pos}" style="height:${(min / 60) * HOUR_PX}px">${CAR}${(min / 60) * HOUR_PX >= 13 ? `<span>${min} ХВ</span>` : ''}</div>`;

  function eventHtml(it, warnings) {
    const { ev, date, done } = it.o;
    const { dayStart, dayEnd } = LP.data.settings;
    const cut = it.cut || { segs: [{ s: ev.start, e: ev.end }], end: ev.end, added: 0 };
    const kind = LP.eventKind(ev);
    const tag = LP.eventTag(ev);
    const w = 100 / it.lanes;
    const warn = warnings.get(ev.id + '|' + date);
    let hint = '';
    if (kind === 'goal') {
      const g = LP.goal(ev.goalId);
      const sg = LP.subgoal(g, ev.subgoalId);
      hint = g.title + (sg ? ' › ' + sg.title : '');
    } else if (kind === 'custom') hint = 'Своя ціль: ' + ev.customGoal;
    else if (kind === 'habit') hint = 'Звичка: ' + LP.habit(ev.habitId).title;
    if (ev.mood) hint = LP.MOODS[ev.mood] + (hint ? ' · ' + hint : '');
    if (ev.bonus) hint += (hint ? ' · ' : '') + 'Бонус: ' + ev.bonus;
    if (cut.added) hint += (hint ? ' · ' : '') + `+${cut.added} хв на їжу`;
    const tr = LP.travelOf(ev);
    if (tr.before || tr.after) hint += (hint ? ' · ' : '') + `Дорога: ${[tr.before ? `туди ${tr.before} хв` : '', tr.after ? `назад ${tr.after} хв` : ''].filter(Boolean).join(', ')}`;
    if (warn) hint += ` · ${warn === 'bad' ? 'Дві важкі задачі підряд' : 'Важка й нейтральна підряд'} — розбав приємною`;
    const tagText = kind === 'habit' ? '↻' : tag ? `[${u.esc(tag)}]` : kind === 'custom' ? '[СВОЯ]' : '';
    const isWeekGoal = !!LP.weekGoalFor(ev.id, date);
    const today = u.today();
    const n = cut.segs.length;
    return cut.segs.map((seg, i) => {
      const tb0 = i === 0 ? tr.before : 0, ta0 = i === n - 1 ? tr.after : 0;
      const s = u.clamp(seg.s - tb0, dayStart * 60, dayEnd * 60);
      const e = u.clamp(seg.e + ta0, dayStart * 60, dayEnd * 60);
      if (e <= s) return '';
      const h = Math.max(((e - s) / 60) * HOUR_PX - 3, 16);
      const past = date < today || (date === today && seg.e <= nowMin());
      const first = i === 0, last = i === n - 1;
      const tb = first ? tr.before : 0, ta = last ? tr.after : 0;
      const trBefore = tb ? tband(tb, 'before') : '';
      const trAfter = ta ? tband(ta, 'after') : '';
      return `
      <div class="ev k-${kind} ${done ? 'is-done' : ''} ${past ? 'is-past' : ''} ${tb || ta ? 'has-travel' : ''} ${h - ((tb + ta) / 60) * HOUR_PX < 36 ? 'is-short' : ''} ${h < 24 ? 'is-tiny' : ''} ${warn ? 'warn-' + warn : ''} ${n > 1 ? 'is-seg' : ''} ${first ? '' : 'seg-cont'}"
           data-id="${ev.id}" data-date="${date}" data-mood="${ev.mood || ''}" ${n > 1 ? `data-seg="${i}"` : ''}
           style="top:${px(s) + 1}px;height:${h}px;${tb ? `--tb:${(tb / 60) * HOUR_PX}px;` : ''}${ta ? `--ta:${(ta / 60) * HOUR_PX}px;` : ''}left:calc(${it.lane * w}% + 3px);width:calc(${w}% - 6px)"
           title="${u.esc(ev.title)}${hint ? ' — ' + u.esc(hint) : ''}">
        ${trBefore}
        ${first ? '<div class="ev-resize is-top"></div>' : ''}
        ${first ? `<button type="button" class="ev-check" aria-label="${done ? 'Зняти відмітку' : 'Позначити виконаним'}"></button>` : ''}
        ${first && warn ? `<span class="ev-warn" aria-hidden="true">!</span>` : ''}
        <div class="ev-title">${first ? '' : '↳ '}${ev.repeat === 'weekly' && first ? '<span class="ev-repeat">↺</span>' : ''}${u.esc(ev.title)}</div>
        <div class="ev-meta">${first ? `${shortTime(seg.s)}—${shortTime(cut.end)} ${tagText}${isWeekGoal ? ' ◆' : ''}${ev.bonus ? ' ★' : ''}${cut.added ? ` · +${cut.added} ХВ ЇЖА` : ''}` : `${shortTime(seg.s)}—${shortTime(seg.e)} · ПРОДОВЖЕННЯ`}</div>
        ${last ? '<div class="ev-resize"></div>' : ''}
        ${trAfter}
      </div>`;
    }).join('');
  }

  function hourTip() {
    let t = document.querySelector('.hour-tip');
    if (!t) {
      t = document.createElement('div');
      t.className = 'hour-tip';
      t.hidden = true;
      document.body.appendChild(t);
    }
    return t;
  }

  // ---------------- Зараз і далі ----------------
  // Найвидніше місце — не метрики, а що відбувається зараз і що наступне (лише на поточному тижні).
  const dur = (m) => (m >= 60 ? `${Math.floor(m / 60)} год${m % 60 ? ' ' + (m % 60) + ' хв' : ''}` : `${m} хв`);
  function nowNextHtml(ws) {
    const today = u.today();
    if (u.weekStart(today) !== ws) return '';
    const t = nowMin();
    const list = LP.occurrences(today, today)
      .map((o) => ({ o, s: o.ev.start, e: LP.eventSegments(o.ev, today).end }))
      .sort((a, b) => a.s - b.s);
    const now = list.find((x) => x.s <= t && t < x.e);
    const next = list.find((x) => x.s > t && (!now || x.o.ev.id !== now.o.ev.id));
    const row = (label, x, sub) => x
      ? `<button type="button" class="nn-row" data-nn="${x.o.ev.id}" data-nndate="${today}">
          <span class="nn-label">${label}</span>
          <span class="nn-title ${x.o.done ? 'is-done' : ''}">${u.esc(x.o.ev.title)}</span>
          <span class="nn-sub">${sub}</span></button>`
      : '';
    return `<section class="side-block nownext">
      ${now ? row('ЗАРАЗ', now, `${u.fmtTime(now.s)}—${u.fmtTime(now.e)} · ЩЕ ${dur(now.e - t).toUpperCase()}`)
            : `<div class="nn-row nn-free"><span class="nn-label">ЗАРАЗ</span><span class="nn-title">Вільний час</span>${next ? `<span class="nn-sub">ДО ${u.fmtTime(next.s)}</span>` : ''}</div>`}
      ${next ? row('ДАЛІ', next, `О ${u.fmtTime(next.s)} · ЧЕРЕЗ ${dur(next.s - t).toUpperCase()}`)
             : `<div class="nn-row nn-free"><span class="nn-label">ДАЛІ</span><span class="nn-title">На сьогодні все</span></div>`}
    </section>`;
  }

  // ---------------- Бічна панель ----------------
  function sideHtml(ws, stats, warnings) {
    const days = u.weekDays(ws);
    const today = u.today();
    const weekGoals = LP.weekGoalsOf(ws);
    // огляд тижня без «відсотка виконання»: фокус, зроблене, час на цілі, сон, навантаження
    const focus = ((LP.data.weekNotes || {})[ws] || {}).focus || '';
    const load = { good: 0, mid: 0, bad: 0 };
    let goalMin = 0;
    const perGoal = {};
    stats.occ.forEach((o) => {
      const dur = o.ev.end - o.ev.start;
      if (o.ev.mood) load[o.ev.mood] += dur;
      if (o.ev.goalId && LP.goal(o.ev.goalId)) {
        goalMin += dur;
        perGoal[o.ev.goalId] = (perGoal[o.ev.goalId] || 0) + dur;
      }
    });
    const topId = Object.keys(perGoal).sort((a, b) => perGoal[b] - perGoal[a])[0];
    const goalTop = topId ? '[' + LP.goal(topId).tag + '] ' + LP.goal(topId).title : '';
    const loadTotal = load.good + load.mid + load.bad;
    const sleepDays = days.filter((d) => d <= today);
    const sleepAvg = sleepDays.length && LP.data.settings.showSleep !== false
      ? (Math.round((sleepDays.reduce((a, d) => a + LP.sleepHours(d), 0) / sleepDays.length) * 10) / 10).toString().replace('.', ',')
      : '—';

    const goalsList = weekGoals.length
      ? weekGoals.map((g, i) => {
          const parent = g.parentId ? LP.goal(g.parentId) : null;
          const ev = g.eventId ? LP.event(g.eventId) : null;
          const done = LP.weekGoalDone(g);
          const meta = [
            ev ? `${u.DAYS_SHORT[u.weekday(g.eventDate)].toUpperCase()} ${u.fmtTime(ev.start)}` : '',
            parent ? `[${u.esc(parent.tag)}]` : '',
            g.carried ? `↷ ПЕРЕНЕСЕНО${g.carried > 1 ? ' ×' + g.carried : ''}` : '',
          ].filter(Boolean).join(' · ');
          return `
            <li class="wg-card ${done ? 'is-done' : ''}" data-wgid="${g.id}" title="Тягни — змінити порядок · клік — змінити">
              <span class="wg-num">${String(i + 1).padStart(2, '0')}</span>
              <button type="button" class="wg-check ${done ? 'on' : ''}" data-wg="${g.id}" aria-label="${done ? 'Зняти відмітку' : 'Виконано'}"></button>
              <div class="wg-body">
                <div class="wg-name">${u.esc(g.title)}</div>
                ${meta ? `<div class="wg-meta">${meta}</div>` : ''}
              </div>
            </li>`;
        }).join('')
      : `<li class="empty-note">Цілей на тиждень ще немає</li>`;

    const habitRows = LP.data.habits.map((h) => {
      const dates = LP.habitDates(h);
      const cnt = LP.habitWeekCount(h, ws);
      const cells = days.map((d, i) => {
        const on = dates.has(d);
        const lock = h.timed || d > today;
        return `<button type="button" class="hb-cell ${on ? 'on' : ''} ${d === today ? 'today' : ''} ${i >= 5 ? 'weekend' : ''} ${h.timed ? 'timed' : ''}"
          data-habit="${h.id}" data-date="${d}" ${lock ? 'disabled' : ''}
          title="${u.DAYS_LONG[i]}, ${u.fmtDay(d)}${h.timed ? ' — зараховується через розклад' : ''}" aria-label="${u.esc(h.title)}, ${u.DAYS_LONG[i]}"></button>`;
      }).join('');
      return `<button type="button" class="hb-name" data-edit-habit="${h.id}" title="${h.timed ? 'З часом — через розклад' : 'Без часу — відмічай вручну'} · клік — змінити">${h.timed ? '⏱ ' : ''}${u.esc(h.title)}</button>${cells}<div class="hb-count ${cnt >= h.perWeek ? 'ok' : ''}">${cnt}/${h.perWeek}</div>`;
    }).join('');

    const backlog = LP.looseBacklog();
    const plans = LP.backlogPlans();
    const order = { bad: 0, mid: 1, good: 2 };
    const plansHtml = plans.map((p) => `<li class="bl-plan-li">${LP.planHtml(p, true)}</li>`).join('');
    const backlogHtml = plansHtml + (backlog.length
      ? backlog.slice().sort((a, b) => order[a.mood] - order[b.mood]).map((t) => {
          const g = t.goalId ? LP.goal(t.goalId) : null;
          return `<li class="bl-item" data-task="${t.id}" title="Перетягни в розклад · клік — змінити">
            ${LP.moodDot(t.mood)}<span class="bl-title">${u.esc(t.title)}</span>
            <span class="tag">${u.fmtHours(t.duration).toUpperCase()}${g ? ' [' + u.esc(g.tag) + ']' : ''}${t.bonus ? ' ★' : ''}</span>
          </li>`;
        }).join('')
      : plans.length ? '' : `<li class="empty-note">Порожньо. Задачі потрапляють сюди з «Дня».</li>`);

    const rewards = LP.data.rewards.filter((r) => !r.used);
    const rewardsHtml = rewards.length
      ? rewards.map((r) => `<li class="reward">
          <button type="button" class="reward-use" data-use-reward="${r.id}" title="Позначити, що вже отримав" aria-label="Використав"></button>
          <span class="reward-text">${u.esc(r.text)}<small>за «${u.esc(r.source)}» · ${u.fmtDay(r.date)}</small></span>
        </li>`).join('')
      : '<li class="empty-note">Тут зʼявляються бонуси за виконані важкі й нейтральні задачі.</li>';
    const usedCount = LP.data.rewards.length - rewards.length;
    const warnList = warnings.list;
    return `
      ${nowNextHtml(ws)}

      ${warnList.length ? `
      <section class="side-block">
        <div class="label warn">ПОРЯДОК ЗАДАЧ</div>
        <ul class="warn-list">${warnList.map((w) => `<li class="w-${w.level}"><span class="mono">${u.DAYS_SHORT[u.weekday(w.date)].toUpperCase()}</span> ${u.esc(w.a)} → ${u.esc(w.b)}
          <span class="warn-acts"><button type="button" class="link-btn" data-breather="${w.date}|${w.gapAt}">+ 15 ХВ ПРИЄМНОГО</button><button type="button" class="link-btn" data-nowarn="${w.bId}">ЦЕ НЕ ЗМІНИТИ</button></span></li>`).join('')}</ul>
      </section>` : ''}
      <section class="side-block">
        <div class="side-head"><span class="label">ЗАСЛУЖЕНО ★</span>${usedCount ? `<span class="mono muted">ОТРИМАНО: ${usedCount}</span>` : ''}</div>
        <ul class="reward-list">${rewardsHtml}</ul>
      </section>
      <section class="side-block">
        <div class="side-head"><span class="label">ЦІЛІ ТИЖНЯ</span><button type="button" class="icon-btn" data-add-week-goal aria-label="Додати ціль тижня">+</button></div>
        <ul class="wg-list wg-cards">${goalsList}</ul>
      </section>
      <section class="side-block">
        <div class="side-head"><span class="label">ЗВИЧКИ</span><button type="button" class="icon-btn" data-add-habit aria-label="Додати звичку" title="Нова звичка">+</button></div>
        ${LP.data.habits.length ? `<div class="hb-grid">${habitRows}</div>` : '<p class="empty-note">Звичок поки немає — натисни +.</p>'}
      </section>
      <section class="side-block side-last">
        <div class="side-head"><span class="label">БЕКЛОГ — ПЕРЕТЯГНИ В РОЗКЛАД</span></div>
        <ul class="bl-list">${backlogHtml}</ul>
      </section>`;
  }

  // ---------------- Розклад ----------------
  function render(root) {
    LP.carryOverWeekGoals();
    const ws = LP.view.weekStart;
    const days = u.weekDays(ws);
    const today = u.today();
    const { dayStart, dayEnd } = LP.data.settings;
    const stats = LP.weekStats(ws);
    const warnings = LP.sequenceWarnings(stats.occ);

    const byDay = {};
    days.forEach((d) => (byDay[d] = []));
    stats.occ.forEach((o) => {
      if (!byDay[o.date]) return;
      const cut = LP.eventSegments(o.ev, o.date);
      const trv = LP.travelOf(o.ev);
      byDay[o.date].push({ o, s: cut.segs[0].s - trv.before, e: cut.end + trv.after, cut });
    });

    const empty = !LP.data.events.length && !LP.data.goals.length;
    const mobile = LP.isMobile();
    const mday = LP.view.mday && days.includes(LP.view.mday) ? LP.view.mday : days.includes(today) ? today : days[0];
    HOUR_PX = hourPx(root, empty);
    const fits = LP.data.settings.fitDay !== false;
    const hours = [];
    for (let h = dayStart + 1; h < dayEnd; h++) hours.push(h);

    // щоденник: сьогодні — записати/змінити; минулі дні із записом — лише прочитати
    const head = days.map((d, i) => {
      const list = byDay[d];
      const done = list.filter((x) => x.o.done).length;
      const isToday = d === today;
      const j = LP.journal(d);
      const action = isToday ? `data-journal="${d}"` : j && d < today ? `data-jread="${d}"` : 'disabled';
      const tip = isToday ? (j ? 'Щоденник дня — змінити запис' : 'Щоденник дня — як ти?') : j ? 'Прочитати запис дня' : '';
      return `<button type="button" class="dayhead ${isToday ? 'is-today' : ''} ${d < today ? 'is-past' : ''} ${i >= 5 ? 'weekend' : ''}" ${action} ${tip ? `title="${tip}"` : ''}>
        <span class="dh-label">${u.DAYS_SHORT[i].toUpperCase()} ${u.parse(d).getDate()}${isToday ? ' · СЬОГОДНІ' : ''}</span>
        <span class="dh-right">
          ${LP.data.settings.showSleep !== false ? `<span class="dh-sleep" title="Сон цієї ночі">☾ ${(Math.round(LP.sleepHours(d) * 10) / 10).toString().replace('.', ',')}</span>` : ''}
          ${j && j.score ? `<span class="dh-mood" aria-label="Стан ${j.score} з 10">${j.score}</span>` : j ? '<span class="dh-mood">✎</span>' : isToday ? '<span class="dh-add" aria-label="Записати, як ти">+ ЯК ТИ?</span>' : ''}
        </span>
      </button>`;
    }).join('');
    // сьогоднішній день — ширший за інші
    const colTpl = mobile ? 'minmax(0, 1fr)' : days.map((d) => (d === today ? 'minmax(0, 1.45fr)' : 'minmax(0, 1fr)')).join(' ');
    // телефон: чипи днів і рядок обраного дня замість широкої шапки
    let mobileHead = '';
    if (mobile) {
      const j = LP.journal(mday);
      const list = byDay[mday];
      const jBtn = mday === today
        ? `<button type="button" class="m-journal" data-journal="${mday}">${j && j.score ? `✎ ${j.score}/10` : '+ ЯК ТИ?'}</button>`
        : j && mday < today ? `<button type="button" class="m-journal" data-jread="${mday}">${j.score ? `${j.score}/10` : '✎'}</button>` : '';
      mobileHead = `
        <div class="m-days">${days.map((d, k) => `<button type="button" class="m-day ${d === mday ? 'on' : ''} ${d === today ? 'is-today' : ''} ${k >= 5 ? 'weekend' : ''}" data-mday="${d}">
          <small>${u.DAYS_SHORT[k].toUpperCase()}</small><b>${u.parse(d).getDate()}</b><i>·</i></button>`).join('')}</div>
        <div class="m-daybar">
          <span>${u.DAYS_LONG[u.weekday(mday)].toUpperCase()}, ${u.fmtDay(mday).toUpperCase()}${mday === today ? ' · СЬОГОДНІ' : ''}</span>
${jBtn}</div>`;
    }

    const cols = (mobile ? [mday] : days).map((d) => {
      const i = u.weekday(d);
      const items = layoutLanes(byDay[d]);
      let nowLine = '';
      if (d === today) {
        const n = new Date();
        const m = n.getHours() * 60 + n.getMinutes();
        if (m >= dayStart * 60 && m <= dayEnd * 60) nowLine = `<div class="now-line" style="top:${px(m)}px"></div>`;
      }
      // прийоми їжі — тиха смуга під задачами
      const meals = LP.mealsOn(d).filter((m) => m.start < dayEnd * 60 && m.start + m.duration > dayStart * 60).map((m) => {
        const ms = Math.max(m.start, dayStart * 60), me = Math.min(m.start + m.duration, dayEnd * 60);
        return `<div class="meal" data-meal="${m.id}" style="top:${px(ms)}px;height:${Math.max(((me - ms) / 60) * HOUR_PX, 8)}px" title="${u.esc(m.name)} · ${u.fmtTime(m.start)}—${u.fmtTime(m.start + m.duration)} · тягни — перенести, клік — змінити"><span>${u.esc(m.name.toUpperCase())} ${u.fmtTime(m.start)}—${u.fmtTime(m.start + m.duration)}</span><i class="meal-resize"></i></div>`;
      }).join('');
      // сон: межа підйому й відбою, від неї — мʼяке розсіювання в ніч
      let night = '';
      if (LP.data.settings.showSleep !== false) {
        const sl = LP.sleepOn(d);
        const hrs = LP.sleepHours(d);
        const hTxt = (Math.round(hrs * 10) / 10).toString().replace('.', ',');
        if (sl.wake > dayStart * 60 && sl.wake < dayEnd * 60) {
          night += `<div class="night night-am" style="height:${px(sl.wake)}px"></div>
            <div class="sleep-line is-wake ${sl.custom ? 'is-custom' : ''}" data-sleep="wake" style="top:${px(sl.wake)}px" title="Підйом ${u.fmtTime(sl.wake)} · сон ${hTxt} год · тягни — змінити цей день, клік — налаштувати"></div>`;
        }
        if (sl.bed > dayStart * 60 && sl.bed < dayEnd * 60) {
          night += `<div class="night night-pm" style="top:${px(sl.bed)}px"></div>
            <div class="sleep-line is-bed ${sl.custom ? 'is-custom' : ''}" data-sleep="bed" style="top:${px(sl.bed)}px" title="Відбій ${u.fmtTime(sl.bed)} · тягни — змінити цей день, клік — налаштувати"></div>`;
        }
      }
      return `<div class="cal-col ${d === today ? 'is-today' : ''} ${d < today ? 'is-past' : ''} ${i >= 5 ? 'weekend' : ''}" data-date="${d}">${night}${meals}${items.map((it) => eventHtml(it, warnings)).join('')}${nowLine}</div>`;
    }).join('');


    root.innerHTML = `
      <div class="week-layout">
        <section class="cal">
          ${empty ? `<div class="cal-hint">Протягни мишкою по сітці, щоб додати справу — або <button type="button" class="link-btn" data-sample>завантаж приклад</button>.</div>` : ''}
          ${mobile ? mobileHead : `<div class="cal-head" style="grid-template-columns:44px ${colTpl}"><div class="cal-corner"></div>${head}</div>`}
          <div class="cal-body ${fits ? 'is-fit' : ''}">
            <div class="cal-inner" style="height:${(dayEnd - dayStart) * HOUR_PX}px">
              <div class="cal-times">${hours.map((h) => `<span style="top:${px(h * 60)}px">${String(h).padStart(2, '0')}</span>`).join('')}</div>
              <div class="cal-cols" style="--hour:${HOUR_PX}px;grid-template-columns:${colTpl}">${cols}</div>
            </div>
          </div>
        </section>
        <aside class="side">${sideHtml(ws, stats, warnings)}</aside>
      </div>`;

    const body = root.querySelector('.cal-body');
    body.scrollTop = fits ? 0 : LP.view.calScroll ?? Math.max(0, (8 - dayStart) * HOUR_PX);
    body.addEventListener('scroll', () => (LP.view.calScroll = body.scrollTop));
    const ch = root.querySelector('.cal-head');
    if (ch) ch.style.setProperty('--sbw', body.offsetWidth - body.clientWidth + 'px');
    root.querySelectorAll('[data-mday]').forEach((b) => b.addEventListener('click', () => { LP.view.mday = b.dataset.mday; LP.render(); }));
    if (mobile) {
      // свайп ліворуч/праворуч по розкладу — сусідній день (і тиждень, якщо треба)
      let sx = null, sy = null;
      body.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; });
      body.addEventListener('pointerup', (e) => {
        if (sx == null) return;
        const dx = e.clientX - sx, dy = e.clientY - sy;
        sx = null;
        if (Math.abs(dx) < 60 || Math.abs(dx) < 2 * Math.abs(dy)) return;
        const next = u.addDays(mday, dx < 0 ? 1 : -1);
        LP.view.mday = next;
        LP.view.weekStart = u.weekStart(next);
        LP._swiped = true;
        setTimeout(() => (LP._swiped = false), 0);
        LP.render();
      });
    }
    root.querySelectorAll('.cal-col .ev').forEach(drawShape);
    const side = root.querySelector('.side');
    side.scrollTop = LP.view.sideScroll || 0;
    side.addEventListener('scroll', () => (LP.view.sideScroll = side.scrollTop));

    bindSide(root);
    bindGrid(root);
  }

  function bindSide(root) {
    root.querySelectorAll('[data-wg]').forEach((cb) => cb.addEventListener('click', () => LP.toggleWeekGoal(cb.dataset.wg)));
    // цілі тижня: тягни картку вгору-вниз — пріоритет / що за чим; клік — змінити
    const list = root.querySelector('.wg-cards');
    if (list) list.querySelectorAll('.wg-card').forEach((card) => {
      card.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || e.target.closest('.wg-check')) return;
        e.preventDefault();
        const y0 = e.clientY;
        let moved = false;
        const cards = () => Array.from(list.querySelectorAll('.wg-card'));
        const move = (m) => {
          if (!moved && Math.abs(m.clientY - y0) < 4) return;
          moved = true;
          card.classList.add('is-dragging');
          card.style.transform = `translateY(${m.clientY - y0}px)`;
          const others = cards().filter((c) => c !== card);
          const before = others.find((c) => { const r = c.getBoundingClientRect(); return m.clientY < r.top + r.height / 2; });
          others.forEach((c) => c.classList.toggle('drop-before', c === before));
          list.classList.toggle('drop-end', !before);
        };
        const up = () => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          if (!moved) return LP.openGoalForm(LP.goal(card.dataset.wgid));
          const others = cards().filter((c) => c !== card);
          const before = others.find((c) => c.classList.contains('drop-before'));
          const ids = others.map((c) => c.dataset.wgid);
          ids.splice(before ? ids.indexOf(before.dataset.wgid) : ids.length, 0, card.dataset.wgid);
          LP.reorderWeekGoals(ids);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      });
    });

    const add = root.querySelector('[data-add-week-goal]');
    if (add) add.addEventListener('click', () => LP.openWeekGoalForm({ week: LP.view.weekStart }));
    root.querySelectorAll('[data-nn]').forEach((b) => b.addEventListener('click', () => {
      const ev = LP.event(b.dataset.nn);
      if (ev) openEventForm({ ev, occDate: b.dataset.nndate });
    }));
    const fb = root.querySelector('[data-focus]');
    if (fb) fb.addEventListener('click', () => {
      const ws = LP.view.weekStart;
      const cur = ((LP.data.weekNotes || {})[ws] || {}).focus || '';
      LP.modal({
        title: 'Фокус тижня',
        body: `<label class="field"><span>Що для тебе головне цього тижня</span><input type="text" name="focus" maxlength="140" value="${u.esc(cur)}" placeholder="Наприклад: дописати трек і не перепрацювати"></label>
          <p class="hint">Не план і не відсоток — орієнтир, до якого повертаєшся, коли щось іде не так.</p>`,
        onSubmit: (form) => {
          LP.data.weekNotes = LP.data.weekNotes || {};
          const v = form.focus.value.trim();
          if (v) LP.data.weekNotes[ws] = Object.assign({}, LP.data.weekNotes[ws], { focus: v });
          else if (LP.data.weekNotes[ws]) delete LP.data.weekNotes[ws].focus;
          LP.save();
        },
      });
    });
    const addH = root.querySelector('[data-add-habit]');
    if (addH) addH.addEventListener('click', () => LP.openHabitForm({}));
    root.querySelectorAll('[data-edit-habit]').forEach((b) => b.addEventListener('click', () => LP.openHabitForm(LP.habit(b.dataset.editHabit))));
    root.querySelectorAll('.hb-cell').forEach((b) => b.addEventListener('click', () => LP.toggleHabit(b.dataset.habit, b.dataset.date)));
    root.querySelectorAll('[data-use-reward]').forEach((b) => b.addEventListener('click', () => LP.toggleRewardUsed(b.dataset.useReward)));
    root.querySelectorAll('[data-journal]').forEach((b) => b.addEventListener('click', () => LP.openJournal(b.dataset.journal)));
    root.querySelectorAll('.dayhead[data-jread], .m-journal[data-jread]').forEach((b) => b.addEventListener('click', () => LP.readJournal(b.dataset.jread)));
    // між двома важкими — 15 хв приємного (кава з колегами тощо)
    root.querySelectorAll('[data-breather]').forEach((b) => b.addEventListener('click', () => {
      const [date, at] = b.dataset.breather.split('|');
      const t = parseInt(at, 10);
      openEventForm({ date, start: t, end: t + 15, preset: { title: 'Кава з колегами', mood: 'good' } });
    }));
    root.querySelectorAll('[data-nowarn]').forEach((b) => b.addEventListener('click', () => {
      const ev = LP.event(b.dataset.nowarn);
      if (ev) { ev.noWarn = true; LP.save(); LP.toast('БІЛЬШЕ НЕ ПОПЕРЕДЖАТИМУ ПРО ЦЮ СПРАВУ'); }
    }));
    root.querySelectorAll('.cal-help').forEach((help) => help.addEventListener('click', () => openHelp(help)));
    const sample = root.querySelector('[data-sample]');
    if (sample) sample.addEventListener('click', () => LP.loadSample());
  }

  // ---------------- Мишка ----------------
  function bindGrid(root) {
    const colsEl = root.querySelector('.cal-cols');
    const cols = Array.from(colsEl.querySelectorAll('.cal-col'));
    const { dayStart, dayEnd } = LP.data.settings;
    const minStart = dayStart * 60, minEnd = dayEnd * 60;

    const minAt = (y) => minStart + ((y - cols[0].getBoundingClientRect().top) / HOUR_PX) * 60;
    const snap = (m) => Math.round(m / SNAP) * SNAP;
    const colAt = (x, y) => cols.find((c) => {
      const r = c.getBoundingClientRect();
      return x >= r.left && x < r.right && (y === undefined || (y >= r.top && y <= r.bottom));
    });

    function drag(onMove, onUp) {
      const move = (e) => onMove(e);
      const stop = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', cancel);
        document.body.classList.remove('is-dragging');
      };
      const up = (e) => {
        stop();
        if (LP._swiped) return; // це був свайп на інший день
        onUp(e);
      };
      // на телефоні прокрутка перериває жест — просто скасовуємо
      const cancel = () => { stop(); LP.render(); };
      document.body.classList.add('is-dragging');
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', cancel);
    }

    // куди дивиться курсор: для Ctrl+C (справа під курсором) і Ctrl+V (вставити в цю клітинку)
    colsEl.addEventListener('pointermove', (e) => {
      const col = e.target.closest('.cal-col');
      if (!col) return;
      const evEl = e.target.closest('.ev');
      LP.view.hover = { date: col.dataset.date, min: u.clamp(Math.floor(minAt(e.clientY) / SNAP) * SNAP, minStart, minEnd - SNAP), evId: evEl ? evEl.dataset.id : null };
      // біля лінії рівної години — маленька підказка часу біля курсора, миттєво
      const raw = minAt(e.clientY);
      const hr = Math.round(raw / 60);
      const near = Math.abs(raw - hr * 60) / 60 * HOUR_PX <= 4 && hr > LP.data.settings.dayStart && hr < LP.data.settings.dayEnd;
      const tip = hourTip();
      if (near) {
        tip.textContent = String(hr).padStart(2, '0') + ':00';
        tip.style.left = e.clientX + 12 + 'px';
        tip.style.top = e.clientY - 18 + 'px';
        tip.hidden = false;
      } else tip.hidden = true;
    });
    colsEl.addEventListener('pointerleave', () => { LP.view.hover = null; hourTip().hidden = true; });

    colsEl.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const check = e.target.closest('.ev-check');
      if (check) {
        const el = check.closest('.ev');
        LP.toggleDone(el.dataset.id, el.dataset.date);
        return;
      }
      const col = e.target.closest('.cal-col');
      if (!col) return;
      e.preventDefault();
      const evEl = e.target.closest('.ev');
      if (evEl) startMove(e, evEl, e.target.closest('.ev-resize.is-top') ? 'resize-top' : e.target.closest('.ev-resize') ? 'resize' : 'move');
      else if (e.target.closest('.sleep-line')) startSleepMove(e, e.target.closest('.sleep-line'), col);
      else if (e.target.closest('.meal')) startMealMove(e, e.target.closest('.meal'), col, e.target.closest('.meal-resize') ? 'resize' : 'move');
      else startCreate(e, col);
    });

    function startCreate(e, col, meal) {
      const a = u.clamp(Math.floor(minAt(e.clientY) / SNAP) * SNAP, minStart, minEnd - SNAP);
      const y0 = e.clientY;
      let lo = a, hi = a + 60, moved = false;
      const ghost = document.createElement('div');
      ghost.className = 'ev ev-ghost';
      col.appendChild(ghost);
      const paint = () => {
        ghost.style.top = px(lo) + 'px';
        ghost.style.height = ((hi - lo) / 60) * HOUR_PX + 'px';
        ghost.textContent = u.fmtTime(lo) + '—' + u.fmtTime(hi);
      };
      paint();
      drag(
        (ev) => {
          if (Math.abs(ev.clientY - y0) > 4) moved = true;
          if (!moved) return;
          const b = minAt(ev.clientY);
          lo = u.clamp(Math.min(a, Math.floor(b / SNAP) * SNAP), minStart, minEnd - SNAP);
          hi = u.clamp(Math.max(a + SNAP, Math.ceil(b / SNAP) * SNAP), lo + SNAP, minEnd);
          paint();
        },
        () => {
          ghost.remove();
          if (!moved && meal) return LP.openMealForm(meal.dataset.meal, col.dataset.date);
          if (!moved) {
            lo = u.clamp(Math.floor(a / 30) * 30, minStart, minEnd - 60);
            hi = lo + 60;
          }
          openEventForm({ date: col.dataset.date, start: lo, end: hi });
        }
      );
    }

    // Межу сну тягнемо вгору-вниз — змінюється лише цей день; клік — вікно з налаштуваннями сну
    function startSleepMove(e, el, col) {
      const kind = el.dataset.sleep;
      const date = col.dataset.date;
      const sl = LP.sleepOn(date);
      const y0 = e.clientY;
      let moved = false, t = sl[kind];
      const label = null;
      const fade = col.querySelector(kind === 'wake' ? '.night-am' : '.night-pm');
      drag(
        (mv) => {
          if (!moved && Math.abs(mv.clientY - y0) < 4) return;
          moved = true;
          t = u.clamp(snap(minAt(mv.clientY)), minStart + SNAP, minEnd - SNAP);
          el.style.top = px(t) + 'px';
          if (fade) {
            if (kind === 'wake') fade.style.height = px(t) + 'px';
            else fade.style.top = px(t) + 'px';
          }
          if (label) label.textContent = (kind === 'wake' ? 'ПІДЙОМ ' : 'ВІДБІЙ ') + u.fmtTime(t);
        },
        () => {
          if (!moved) return openSleepForm(date);
          LP.setSleep(date, { [kind]: t });
        }
      );
    }

    // Прийом їжі можна тягати по розкладу й розтягувати; щоденний змінюється лише в цей день
    function startMealMove(e, el, col, mode) {
      const m = LP.meal(el.dataset.meal);
      if (!m) return;
      const fromDate = col.dataset.date;
      const offset = minAt(e.clientY) - m.start;
      const x0 = e.clientX, y0 = e.clientY;
      let moved = false, date = fromDate, start = m.start, dur = m.duration;
      const label = el.querySelector('span');
      drag(
        (mv) => {
          if (!moved && Math.hypot(mv.clientX - x0, mv.clientY - y0) < 5) return;
          moved = true;
          el.classList.add('is-dragging');
          if (mode === 'move') {
            start = u.clamp(snap(minAt(mv.clientY) - offset), minStart, minEnd - dur);
            const c = colAt(mv.clientX);
            if (c) {
              date = c.dataset.date;
              if (el.parentElement !== c) c.appendChild(el);
            }
            el.style.top = px(start) + 'px';
          } else {
            dur = Math.max(5, snap(minAt(mv.clientY)) - start);
            el.style.height = (dur / 60) * HOUR_PX + 'px';
          }
          if (label) label.textContent = `${m.name.toUpperCase()} ${u.fmtTime(start)}—${u.fmtTime(start + dur)}`;
        },
        () => {
          if (!moved) return LP.openMealForm(m.id, fromDate);
          if (date === fromDate && start === m.start && dur === m.duration) return LP.render();
          LP.moveMeal(m.id, fromDate, date, start, dur);
        }
      );
    }

    function startMove(e, el, mode) {
      const ev = LP.event(el.dataset.id);
      if (!ev) return;
      const occDate = el.dataset.date;
      const dur = ev.end - ev.start;
      const cut0 = LP.eventSegments(ev, el.dataset.date);
      const trv0 = LP.travelOf(ev);
      const offset = minAt(e.clientY) - cut0.segs[0].s;
      const x0 = e.clientX, y0 = e.clientY;
      let moved = false;
      let date = occDate, start = ev.start, end = ev.end;
      const meta = el.querySelector('.ev-meta');
      // справа, розрізана прийомом їжі: тягнемо як одне ціле; тягнемо нижній край — лише остання частина
      const cut = LP.eventSegments(ev, occDate);
      const lastSeg = cut.segs[cut.segs.length - 1];
      drag(
        (m) => {
          if (!moved && Math.hypot(m.clientX - x0, m.clientY - y0) < 5) return;
          if (!moved && mode === 'move' && el.dataset.seg !== undefined) {
            colsEl.querySelectorAll(`.ev[data-id="${ev.id}"][data-date="${occDate}"]`).forEach((x) => { if (x !== el) x.style.display = 'none'; });
            el.style.height = ((dur + trv0.before + trv0.after) / 60) * HOUR_PX - 3 + 'px';
          }
          moved = true;
          el.classList.add('is-dragging');
          if (mode === 'move') {
            start = u.clamp(snap(minAt(m.clientY) - offset), minStart, minEnd - dur);
            end = start + dur;
            const col = colAt(m.clientX);
            if (col) {
              date = col.dataset.date;
              if (el.parentElement !== col) col.appendChild(el);
            }
            el.style.left = '3px';
            el.style.width = 'calc(100% - 6px)';
            el.style.top = px(start - trv0.before) + 1 + 'px';
          } else if (mode === 'resize-top') {
            const firstSeg = cut.segs[0];
            start = u.clamp(snap(minAt(m.clientY)), minStart, firstSeg.e - SNAP);
            end = ev.end;
            const extra = trv0.before + (cut.segs.length === 1 ? trv0.after : 0);
            el.style.top = px(start - trv0.before) + 1 + 'px';
            el.style.height = ((firstSeg.e - start + extra) / 60) * HOUR_PX - 3 + 'px';
          } else {
            const segEnd = u.clamp(snap(minAt(m.clientY)), lastSeg.s + SNAP, minEnd);
            end = ev.end + (segEnd - cut.end);
            const extra = trv0.after + (cut.segs.length === 1 ? trv0.before : 0);
            el.style.height = ((segEnd - lastSeg.s + extra) / 60) * HOUR_PX - 3 + 'px';
          }
          if (meta) meta.textContent = u.fmtTime(start) + '—' + u.fmtTime(end);
          drawShape(el);
        },
        () => {
          if (!moved) {
            if (mode === 'move') openEventForm({ ev, occDate });
            return;
          }
          if (date === occDate && start === ev.start && end === ev.end) return LP.render();
          LP.rescheduleEvent(ev.id, occDate, { date, start, end });
        }
      );
    }

    // Перетягування задачі з беклогу в сітку
    // Цілий план із беклогу — у день, у тому ж порядку й з тими ж перервами
    root.querySelectorAll('[data-plan-drag]').forEach((head) => {
      head.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        const plan = LP.backlogPlans().find((p) => p.id === head.dataset.planDrag);
        if (!plan) return;
        const span = plan.end - plan.start;
        const x0 = e.clientX, y0 = e.clientY;
        let moved = false, ghost = null, target = null, start = plan.start;
        drag(
          (m) => {
            if (!moved && Math.hypot(m.clientX - x0, m.clientY - y0) < 5) return;
            moved = true;
            const col = colAt(m.clientX, m.clientY);
            if (col) {
              start = u.clamp(snap(minAt(m.clientY) - 15), minStart, Math.max(minStart, minEnd - span));
              if (!ghost) {
                ghost = document.createElement('div');
                ghost.className = 'ev ev-ghost ev-ghost-plan';
              }
              if (ghost.parentElement !== col) col.appendChild(ghost);
              ghost.style.top = px(start) + 'px';
              ghost.style.height = (Math.min(span, minEnd - start) / 60) * HOUR_PX + 'px';
              const shift = start - plan.start;
              ghost.innerHTML = plan.items.map((it) => `<span style="top:${((it.start - plan.start) / 60) * HOUR_PX}px;height:${((it.end - it.start) / 60) * HOUR_PX}px">${u.fmtTime(it.start + shift)} ${u.esc(it.task.title)}</span>`).join('');
              target = col;
            } else if (ghost) {
              ghost.remove();
              target = null;
            }
          },
          () => {
            if (ghost) ghost.remove();
            if (!moved || !target) return;
            LP.planToWeek(plan.id, target.dataset.date, start);
          }
        );
      });
    });

    root.querySelectorAll('.bl-item').forEach((item) => {
      item.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        const task = LP.task(item.dataset.task);
        const partsAt = (st) => LP.taskParts(task, st);
        const span = (() => { const p = partsAt(0); return p[p.length - 1].end; })();
        const x0 = e.clientX, y0 = e.clientY;
        let moved = false, ghost = null, target = null, start = 0;
        drag(
          (m) => {
            if (!moved && Math.hypot(m.clientX - x0, m.clientY - y0) < 5) return;
            moved = true;
            const col = colAt(m.clientX, m.clientY);
            if (col) {
              start = u.clamp(snap(minAt(m.clientY) - span / 2), minStart, minEnd - Math.min(span, minEnd - minStart));
              if (!ghost) {
                ghost = document.createElement('div');
                ghost.className = 'ev ev-ghost';
              }
              if (ghost.parentElement !== col) col.appendChild(ghost);
              ghost.style.top = px(start) + 'px';
              ghost.style.height = (Math.min(span, minEnd - start) / 60) * HOUR_PX + 'px';
              const n = LP.taskParts(task, 0).length;
              ghost.textContent = `${u.fmtTime(start)} ${task.title}${n > 1 ? ` — ${n} ЧАСТИНИ З ПЕРЕРВАМИ` : ''}`;
              target = col;
            } else if (ghost) {
              ghost.remove();
              target = null;
            }
          },
          () => {
            if (ghost) ghost.remove();
            if (!moved) return LP.openTaskForm(task);
            if (!target) return;
            LP.addTaskEvents(task, target.dataset.date, partsAt(start).filter((p) => p.start < minEnd).map((p) => ({ start: p.start, end: Math.min(p.end, minEnd) })));
          }
        );
      });
    });
  }

  // ---------------- Сон ----------------
  function openSleepForm(date) {
    const st = LP.data.settings;
    const sl = LP.sleepOn(date);
    const opts = (sel, from, to) => {
      let o = '';
      for (let m = from; m <= to; m += 15) o += `<option value="${m}" ${m === sel ? 'selected' : ''}>${u.fmtTime(m % (24 * 60))}${m >= 24 * 60 ? ' (ніч)' : ''}</option>`;
      return o;
    };
    LP.modal({
      title: 'Сон',
      body: `
        <p class="hint">${u.DAYS_LONG[u.weekday(date)]}, ${u.fmtDay(date)}. Сон рахується від відбою напередодні до підйому мінус час на засинання.</p>
        <div class="row">
          <label class="field"><span>Підйом</span><select name="wake">${opts(sl.wake, 3 * 60, 14 * 60)}</select></label>
          <label class="field"><span>Відбій</span><select name="bed">${opts(sl.bed, 18 * 60, 27 * 60)}</select></label>
          <label class="field"><span>На засинання</span><select name="fall">${[0, 10, 15, 20, 30, 45, 60].map((m) => `<option value="${m}" ${m === st.fallAsleep ? 'selected' : ''}>${m} хв</option>`).join('')}</select></label>
        </div>
        <div class="field"><span>Для яких днів</span>
          <div class="seg seg-sm">
            <label><input type="radio" name="scope" value="day" checked><span>Лише ${u.fmtDay(date)}</span></label>
            <label><input type="radio" name="scope" value="all"><span>Звично для всіх днів</span></label>
          </div></div>
        <p class="hint">Сон цієї ночі: ${(Math.round(LP.sleepHours(date) * 10) / 10).toString().replace('.', ',')} год. Межу можна просто тягнути мишкою в розкладі.</p>`,
      extra: sl.custom ? [{ text: 'Як звично', onClick: () => LP.setSleep(date, { wake: null, bed: null }) }] : [],
      onSubmit: (form) => {
        const wake = parseInt(form.wake.value, 10), bed = parseInt(form.bed.value, 10);
        st.fallAsleep = parseInt(form.fall.value, 10);
        if (form.querySelector('input[name=scope]:checked').value === 'all') {
          st.wake = wake;
          st.bed = bed;
          LP.setSleep(date, { wake: null, bed: null });
        } else LP.setSleep(date, { wake, bed });
      },
    });
  }
  LP.openSleepForm = openSleepForm;
  LP.openWeekHelp = (btn) => openHelp(btn);

  // ---------------- Форма справи ----------------
  function timeOptions(selected, from, to) {
    let out = '';
    for (let m = from; m <= to; m += SNAP) out += `<option value="${m}" ${m === selected ? 'selected' : ''}>${u.fmtTime(m)}</option>`;
    return out;
  }

  function linkValue(d) {
    if (d.habitId && LP.habit(d.habitId)) return 'h:' + d.habitId;
    if (d.goalId && LP.goal(d.goalId)) return 'g:' + d.goalId;
    if (d.customGoal) return 'custom';
    return '';
  }

  function linkSelectHtml(selected) {
    const opt = (v, label) => `<option value="${v}" ${v === selected ? 'selected' : ''}>${u.esc(label)}</option>`;
    const group = (label, list) => (list.length ? `<optgroup label="${label}">${list.join('')}</optgroup>` : '');
    return `<select name="link">
      ${opt('', '— без цілі —')}
      ${group('Довгострокові цілі', LP.data.goals.filter((g) => g.level === 'long').map((g) => opt('g:' + g.id, `[${g.tag}] ${g.title}`)))}
      ${group('Короткострокові цілі', LP.data.goals.filter((g) => g.level === 'short').map((g) => opt('g:' + g.id, `[${g.tag}] ${g.title}`)))}
      ${group('Звички', LP.data.habits.map((h) => opt('h:' + h.id, (h.timed ? '⏱ ' : '↻ ') + h.title)))}
      ${opt('custom', '✎ Своя разова ціль…')}
    </select>`;
  }

  function openEventForm({ ev, occDate, date, start, end, preset }) {
    const isNew = !ev;
    const d = isNew
      ? Object.assign({ title: '', goalId: null, subgoalId: null, customGoal: '', habitId: null, mood: null, bonus: '', taskId: null, date, start, end, repeat: 'none', note: '', noWarn: false, travel: 0 }, preset || {})
      : Object.assign({}, ev, { date: occDate });
    const wg = isNew ? null : LP.weekGoalFor(ev.id, occDate);
    const backlog = LP.backlog();
    // дні тижня, в які вже стоїть ця серія (для задачі, розставленої на кілька днів)
    const siblings = isNew ? [] : LP.eventGroup(ev, occDate);
    const trF = LP.travelOf(d);
    const trDir = trF.before && trF.after ? 'both' : trF.before ? 'before' : trF.after ? 'after' : 'both';
    const trMin = trF.before || trF.after || 30;
    const curDays = isNew ? [u.weekday(date)] : d.repeat === 'weekly' ? [...new Set(siblings.map((x) => u.weekday(x.date)))].sort() : [u.weekday(occDate)];

    const body = `
      ${isNew && backlog.length ? `
        <label class="field"><span>Взяти задачу з беклогу</span>
          <select name="task"><option value="">— нова справа —</option>
            ${backlog.map((t) => `<option value="${t.id}">${t.mood === 'bad' ? '● ' : t.mood === 'good' ? '○ ' : '◐ '}${u.esc(t.title)} · ${u.fmtHours(t.duration)}</option>`).join('')}
          </select></label>` : ''}
      <label class="field"><span>Що робиш</span>
        <input type="text" name="title" maxlength="120" value="${u.esc(d.title)}" placeholder="Наприклад: пробіжка 5 км"></label>
      <div class="field"><span>Як тобі ця задача</span>${LP.moodPicker(d.mood)}</div>
      ${LP.bonusField(d.bonus)}
      <label class="field"><span>До чого веде</span>${linkSelectHtml(linkValue(d))}</label>
      <label class="field field-sub"><span>Підціль</span><div class="sub-slot"></div></label>
      <label class="field field-custom"><span>Своя ціль (тільки для цієї справи)</span>
        <input type="text" name="customGoal" maxlength="120" value="${u.esc(d.customGoal || '')}" placeholder="Наприклад: подарунок мамі на ДН"></label>
      <div class="row">
        <label class="field"><span>День</span><input type="date" name="date" value="${d.date}"></label>
        <label class="field field-narrow"><span>Початок</span><select name="start">${timeOptions(d.start, 0, 24 * 60 - SNAP)}</select></label>
        <label class="field field-narrow"><span>Кінець</span><select name="end">${timeOptions(d.end, SNAP, 24 * 60)}</select></label>
      </div>
      <div class="field"><span>Повторення</span>
        <div class="seg seg-sm">
          <label><input type="radio" name="rep" value="none" ${d.repeat !== 'weekly' ? 'checked' : ''}><span>Один раз</span></label>
          <label><input type="radio" name="rep" value="weekly" ${d.repeat === 'weekly' ? 'checked' : ''}><span>Повторювати</span></label>
        </div></div>
      <div class="field rep-step2" hidden><span>Коли</span>
        <div class="seg seg-sm">
          <label><input type="radio" name="repWhen" value="this" ${curDays.length <= 1 ? 'checked' : ''}><span>Щотижня в цей день</span></label>
          <label><input type="radio" name="repWhen" value="all" ${curDays.length === 7 ? 'checked' : ''}><span>Кожного дня</span></label>
          <label><input type="radio" name="repWhen" value="pick" ${curDays.length > 1 && curDays.length < 7 ? 'checked' : ''}><span>Вибрані дні</span></label>
        </div></div>
      <div class="field rep-step3" hidden><span>Дні — у той самий час</span>
        <div class="day-picks">${u.DAYS_SHORT.map((dn, i) => `<label class="day-pick"><input type="checkbox" name="repDay" value="${i}" ${curDays.includes(i) ? 'checked' : ''}><span>${dn}</span></label>`).join('')}</div></div>
      ${!isNew && siblings.length > 1 ? `<div class="field"><span>Зміни застосувати</span>
        <div class="seg seg-sm">
          <label><input type="radio" name="applyTo" value="day" checked><span>Лише цей день</span></label>
          <label><input type="radio" name="applyTo" value="all"><span>Усі дні серії (${siblings.length})</span></label>
        </div></div>` : ''}
      <div class="checks">
        <label class="check" ${LP.FEATURES.travel ? '' : 'hidden'}><input type="checkbox" name="away" ${trF.before || trF.after ? 'checked' : ''}> Не вдома — додати дорогу</label>
      </div>
      <div class="travel-box" ${trF.before || trF.after ? '' : 'hidden'}>
        <div class="seg seg-sm">
          ${[['both', 'Туди й назад'], ['before', 'Лише туди'], ['after', 'Лише назад']].map(([v, t]) => `<label><input type="radio" name="trDir" value="${v}" ${v === trDir ? 'checked' : ''}><span>${t}</span></label>`).join('')}
        </div>
        <div class="tr-mins">
          ${[10, 15, 20, 30, 45, 60].map((m) => `<label class="chip-opt"><input type="radio" name="trMin" value="${m}" ${m === trMin ? 'checked' : ''}><span>${m} хв</span></label>`).join('')}
          <label class="tr-custom"><input type="number" name="trCustom" min="1" max="240" step="1" value="${[10, 15, 20, 30, 45, 60].includes(trMin) ? '' : trMin}" placeholder="своє"><span>хв</span></label>
        </div>
      </div>
      <div class="checks">
        <label class="check"><input type="checkbox" name="noWarn" ${d.noWarn ? 'checked' : ''}> Не попереджати про порядок (робота, обовʼязкове)</label>
      </div>
      <div class="checks">
        <label class="check"><input type="checkbox" name="weekGoal" ${wg ? 'checked' : ''}> Ціль тижня ◆</label>
        ${!isNew ? `<label class="check"><input type="checkbox" name="done" ${ev.doneDates.includes(occDate) ? 'checked' : ''}> Виконано</label>` : ''}
      </div>
      <label class="field"><span>Нотатка</span><textarea name="note" rows="2">${u.esc(d.note || '')}</textarea></label>
      ${!isNew && ev.repeat === 'weekly' ? `<p class="hint">Зміни діятимуть з цього тижня; минулі тижні лишаться як були. Кожен день серії можна змінювати окремо.</p>` : ''}`;

    const extra = [];
    if (!isNew) {
      if (ev.repeat === 'weekly') {
        extra.push({ text: 'Видалити лише цю', className: 'btn-danger', onClick: () => LP.deleteEvent(ev.id, occDate, 'one') });
        extra.push({
          text: 'Цю й наступні',
          className: 'btn-danger',
          onClick: () => {
            if (!confirm(siblings.length > 1 ? `Прибрати «${ev.title}» з цього дня й далі — в усі дні серії?` : `Прибрати «${ev.title}» з цього дня й усіх наступних тижнів?`)) return false;
            LP.deleteEvent(ev.id, occDate, 'following');
          },
        });
      } else {
        extra.push({ text: 'Видалити', className: 'btn-danger', onClick: () => LP.deleteEvent(ev.id, occDate, 'all') });
      }
    }

    const moodOf = (form) => form.querySelector('input[name=mood]:checked').value || null;
    const sync = (form) => {
      const v = form.link.value;
      const goal = v.startsWith('g:') ? LP.goal(v.slice(2)) : null;
      const slot = form.querySelector('.sub-slot');
      const current = form.subgoalId ? form.subgoalId.value : d.subgoalId;
      const subs = goal ? goal.subgoals.filter((s) => s.title) : [];
      slot.innerHTML = subs.length
        ? `<select name="subgoalId"><option value="">— уся ціль, без підцілі —</option>${subs.map((s) =>
            `<option value="${s.id}" ${s.id === current ? 'selected' : ''}>${u.esc(s.title)} · ${u.esc(LP.subProgress(goal, s).label)}</option>`).join('')}</select>`
        : '';
      form.querySelector('.field-sub').hidden = !subs.length;
      form.querySelector('.field-custom').hidden = v !== 'custom';
      LP.syncBonusField(form);
      form.querySelector('.travel-box').hidden = !form.away.checked;
      // повторення відкривається крок за кроком
      const rep = form.querySelector('input[name=rep]:checked').value;
      const when = form.querySelector('input[name=repWhen]:checked');
      form.querySelector('.rep-step2').hidden = rep !== 'weekly';
      form.querySelector('.rep-step3').hidden = rep !== 'weekly' || !when || when.value !== 'pick';
      // день самої справи в «вибраних днях» — завжди відмічений
      const own = form.date.value ? u.weekday(form.date.value) : null;
      form.querySelectorAll('input[name=repDay]').forEach((c) => {
        const isOwn = +c.value === own;
        if (isOwn) c.checked = true;
        c.disabled = isOwn;
      });
    };

    LP.modal({
      title: isNew ? 'Нова справа' : 'Справа',
      body,
      extra,
      onOpen: (form) => {
        if (!form.querySelector('input[name=repWhen]:checked')) form.querySelector('input[name=repWhen][value=this]').checked = true;
        sync(form);
        form.addEventListener('input', (e) => {
          if (e.target.name === 'trCustom' && e.target.value) form.querySelectorAll('input[name=trMin]').forEach((r) => (r.checked = false));
        });
        form.addEventListener('change', (e) => {
          if (e.target.name === 'trMin') form.trCustom.value = '';
          if (e.target.name === 'link' && form.link.value.startsWith('h:') && !form.title.value.trim()) {
            form.title.value = LP.habit(form.link.value.slice(2)).title;
          }
          if (e.target.name === 'task') {
            const t = LP.task(form.task.value);
            if (t) {
              form.title.value = t.title;
              form.bonus.value = t.bonus || '';
              form.note.value = t.note || '';
              form.querySelector(`input[name=mood][value="${t.mood}"]`).checked = true;
              form.link.value = t.goalId && LP.goal(t.goalId) ? 'g:' + t.goalId : '';
              d.subgoalId = t.subgoalId;
              if (form.subgoalId) form.subgoalId.remove();
              const s = parseInt(form.start.value, 10);
              form.end.value = String(Math.min(s + t.duration, 24 * 60));
            }
          }
          sync(form);
        });
      },
      onSubmit: (form) => {
        const errors = [];
        const title = form.title.value.trim();
        const s = parseInt(form.start.value, 10);
        const e = parseInt(form.end.value, 10);
        const v = form.link.value;
        const mood = moodOf(form);
        const bonus = LP.bonusAllowed(mood) ? form.bonus.value.trim() : '';
        if (!title) errors.push('Напиши, що робиш.');
        if (!form.date.value) errors.push('Обери день.');
        if (e <= s) errors.push('Кінець має бути пізніше за початок.');
        if (LP.bonusRequired(mood) && !bonus) errors.push('Важка задача потребує бонусу — придумай, що отримаєш після виконання.');
        const link = { goalId: null, subgoalId: null, customGoal: '', habitId: null };
        if (v.startsWith('g:')) {
          link.goalId = v.slice(2);
          link.subgoalId = form.subgoalId ? form.subgoalId.value || null : null;
        } else if (v.startsWith('h:')) {
          link.habitId = v.slice(2);
        } else if (v === 'custom') {
          link.customGoal = form.customGoal.value.trim();
          if (!link.customGoal) errors.push('Опиши свою ціль для цієї справи.');
        }
        LP.showErrors(form, errors);
        if (errors.length) return false;

        // дорога: напрям і хвилини (свої хвилини мають перевагу над кнопками)
        let trB = 0, trA = 0;
        if (form.away.checked) {
          const custom = parseInt(form.trCustom.value, 10);
          const mins = custom > 0 ? Math.min(custom, 240) : parseInt((form.querySelector('input[name=trMin]:checked') || { value: 30 }).value, 10);
          const dir = form.querySelector('input[name=trDir]:checked').value;
          trB = dir !== 'after' ? mins : 0;
          trA = dir !== 'before' ? mins : 0;
        }
        const fields = Object.assign({ title, note: form.note.value.trim(), mood, bonus, noWarn: form.noWarn.checked, travel: 0, travelBefore: trB, travelAfter: trA }, link);
        const repeat = form.querySelector('input[name=rep]:checked').value === 'weekly';
        const newDate = form.date.value;
        const when = form.querySelector('input[name=repWhen]:checked').value;
        const days = !repeat ? [] : when === 'all' ? [0, 1, 2, 3, 4, 5, 6] : when === 'pick'
          ? [...new Set([u.weekday(newDate), ...[...form.querySelectorAll('input[name=repDay]:checked')].map((c) => +c.value)])]
          : [u.weekday(newDate)];
        const wantWeekGoal = form.weekGoal.checked;

        if (isNew) {
          const taskId = form.task ? form.task.value || null : null;
          const group = days.length > 1 ? u.uid() : null;
          const created = LP.addEvent(Object.assign({}, fields, { date: newDate, start: s, end: e, repeat: repeat ? 'weekly' : 'none', taskId, group }));
          if (group) LP.addGroupDays(created, days, newDate);
          if (wantWeekGoal) {
            LP.saveGoal({ level: 'week', title, week: u.weekStart(newDate), parentId: link.goalId, eventId: created.id, eventDate: newDate, done: false });
          }
          return;
        }

        let target = ev;
        if (ev.repeat === 'weekly' && !repeat) {
          const wasDone = ev.doneDates.includes(occDate);
          if (occDate > ev.date) {
            ev.until = u.addDays(occDate, -1);
            ev.doneDates = ev.doneDates.filter((x) => x < occDate);
            target = Object.assign({}, ev, { id: u.uid(), date: occDate, repeat: 'none', until: null, doneDates: wasDone ? [occDate] : [], skipDates: [] });
            LP.data.events.push(target);
            if (wg) wg.eventId = target.id;
          } else {
            Object.assign(ev, { repeat: 'none', until: null, doneDates: wasDone ? [occDate] : [], skipDates: [] });
          }
        } else if (ev.repeat !== 'weekly' && repeat) {
          ev.repeat = 'weekly';
          ev.until = null;
        }
        Object.assign(target, fields);

        const done = form.done.checked;
        const i = target.doneDates.indexOf(occDate);
        if (done && i < 0) target.doneDates.push(occDate);
        if (!done && i >= 0) target.doneDates.splice(i, 1);
        const earned = LP.syncReward(target, occDate, done);

        // ціль тижня з часом
        const existingWg = LP.weekGoalFor(target.id, occDate);
        if (wantWeekGoal && !existingWg) {
          LP.data.goals.push({ id: u.uid(), level: 'week', title, week: u.weekStart(occDate), parentId: link.goalId, eventId: target.id, eventDate: occDate, done: false, createdAt: u.today() });
        } else if (!wantWeekGoal && existingWg) {
          LP.data.goals = LP.data.goals.filter((g) => g !== existingWg);
        }

        // серія на кілька днів: ті самі назва, тип, ціль і час; додані дні — зʼявляються, прибрані — зникають з цього тижня
        if (target.repeat === 'weekly') {
          const timeChanged = s !== target.start || e !== target.end;
          const applyAll = !!form.querySelector('input[name=applyTo][value=all]:checked');
          LP.setGroupDays(target, occDate, days, fields, timeChanged && applyAll ? { start: s, end: e } : null, applyAll);
        } else if (siblings.length > 1) {
          LP.setGroupDays(target, occDate, [], fields, null);
          delete target.group;
        }
        if (newDate !== occDate || s !== target.start || e !== target.end) LP.rescheduleEvent(target.id, occDate, { date: newDate, start: s, end: e });
        else LP.save();
        if (earned) LP.celebrate(target);
      },
    });
  }

  LP.views = LP.views || {};
  LP.views.week = { render };
  LP.openEventForm = openEventForm;

  // Ctrl+C — скопіювати справу під курсором; Ctrl+V — вставити її в клітинку під курсором (той самий тип, ціль, тривалість)
  document.addEventListener('keydown', (e) => {
    if (LP.view.tab !== 'week' || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
    if (e.code !== 'KeyC' && e.code !== 'KeyV') return;
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) || document.querySelector('.modal-backdrop:not(.is-leaving)')) return;
    if (window.getSelection && String(window.getSelection())) return;
    const h = LP.view.hover;
    if (e.code === 'KeyC') {
      const ev = h && h.evId && LP.event(h.evId);
      if (!ev) return;
      e.preventDefault();
      LP.clip = {
        title: ev.title, mood: ev.mood, bonus: ev.bonus, goalId: ev.goalId, subgoalId: ev.subgoalId, customGoal: ev.customGoal,
        habitId: ev.habitId, note: ev.note, travel: 0, travelBefore: LP.travelOf(ev).before, travelAfter: LP.travelOf(ev).after, noWarn: !!ev.noWarn, dur: ev.end - ev.start,
      };
      LP.toast(`СКОПІЙОВАНО «${ev.title.toUpperCase()}» · CTRL+V — ВСТАВИТИ`);
    } else {
      if (!LP.clip || !h) return;
      e.preventDefault();
      const c = LP.clip;
      const end = Math.min(h.min + c.dur, 24 * 60);
      const fields = Object.assign({}, c, { date: h.date, start: h.min, end, repeat: 'none' });
      delete fields.dur;
      LP.addEvent(fields);
      LP.toast(`ВСТАВЛЕНО: ${u.DAYS_SHORT[u.weekday(h.date)].toUpperCase()} ${u.fmtTime(h.min)}`);
    }
  });

  // у режимі «весь день на екрані» перебудовуємо сітку, коли змінюється розмір вікна
  let resizeT = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => {
      if (LP.view.tab === 'week' && LP.data.settings.fitDay !== false && !document.querySelector('.modal-backdrop:not(.is-leaving)') && !document.body.classList.contains('is-dragging')) LP.render();
    }, 150);
  });

  setInterval(() => {
    const nn = document.querySelector('.nownext');
    if (nn && LP.view.tab === 'week' && !document.body.classList.contains('is-dragging')) {
      nn.outerHTML = nowNextHtml(LP.view.weekStart) || '<span hidden></span>';
      document.querySelectorAll('[data-nn]').forEach((b) => b.addEventListener('click', () => {
        const ev = LP.event(b.dataset.nn);
        if (ev) openEventForm({ ev, occDate: b.dataset.nndate });
      }));
    }
    if (LP.view.tab === 'week' && !document.body.classList.contains('is-dragging')) {
      const line = document.querySelector('.now-line');
      if (line) {
        const n = new Date();
        line.style.top = px(n.getHours() * 60 + n.getMinutes()) + 'px';
      }
    }
  }, 60000);
})(window.LP);
