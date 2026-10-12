// Статистика: виконані справи по тижнях, звички по тижнях, зрізи балансу, прогрес цілей.
window.LP = window.LP || {};

(function (LP) {
  const u = LP.u;
  const WEEKS = 12;

  const tile = (label, value, sub) =>
    `<div class="tile"><div class="label">${label}</div><div class="tile-value">${value}</div><div class="mono">${sub}</div></div>`;
  const wlabel = (ws) => {
    const d = u.parse(ws);
    return d.getDate() + '.' + String(d.getMonth() + 1).padStart(2, '0');
  };

  // Стовпчики: темна частина — виконано, світла — заплановано
  function doneBars(series, selected) {
    // лише зроблене — без порівняння з планом
    const max = Math.max(1, ...series.map((r) => r.st.done));
    const bars = series.map(({ ws, st }) => {
      const sel = ws === selected;
      const tip = `${u.fmtWeek(ws)}\nзроблено ${st.done} · ${u.fmtHours(st.minDone)}`;
      return `<button type="button" class="bar-col ${sel ? 'is-sel' : ''}" data-tip="${u.esc(tip)}" data-ws="${ws}" aria-label="${u.esc(tip)}">
        <span class="bar-area">
          ${st.done ? `<span class="bar-label">${st.done}</span>
          <span class="vbar" style="height:${(st.done / max) * 100}%"></span>` : '<span class="vbar-empty"></span>'}
        </span>
        <span class="bar-x">${wlabel(ws)}</span>
      </button>`;
    }).join('');
    return `<section class="chart">
      <div class="label">ЗРОБЛЕНО ПО ТИЖНЯХ</div>
      <div class="bars"><div class="bars-grid"><span style="bottom:100%">${max}</span><span style="bottom:50%">${Math.round(max / 2)}</span><span style="bottom:0">0</span></div>${bars}</div>
    </section>`;
  }

  function pctBars(title, rows, selected) {
    const bars = rows.map((r) => {
      const sel = r.ws === selected;
      return `<button type="button" class="bar-col ${sel ? 'is-sel' : ''}" data-tip="${u.esc(r.tip)}" data-ws="${r.ws}" aria-label="${u.esc(r.tip)}">
        <span class="bar-area">${r.pct !== null ? `<span class="bar-label">${r.pct}%</span><span class="vbar" style="height:${Math.max(r.pct, 1)}%"></span>` : '<span class="vbar-empty"></span>'}</span>
        <span class="bar-x">${wlabel(r.ws)}</span>
      </button>`;
    }).join('');
    return `<section class="chart">
      <div class="label">${title}</div>
      <div class="bars"><div class="bars-grid"><span style="bottom:100%">100</span><span style="bottom:50%">50</span><span style="bottom:0">0</span></div>${bars}</div>
    </section>`;
  }

  // Зрізи балансу: кожен — маленьке колесо в квадратику з датою; стрічку гортаєш убік
  function miniWheel(scores, size = 132) {
    const areas = LP.data.balance.areas;
    const n = areas.length || 1;
    const c = size / 2, R = size / 2 - 6;
    const step = (2 * Math.PI) / n;
    const pt = (a, r) => [c + r * Math.cos(a), c + r * Math.sin(a)];
    const f = (x) => x.toFixed(1);
    let s = `<circle cx="${c}" cy="${c}" r="${R}" class="mw-ring"/><circle cx="${c}" cy="${c}" r="${R / 2}" class="mw-ring mw-half"/>`;
    areas.forEach((ar, i) => {
      const v = scores[ar.id];
      const a0 = -Math.PI / 2 + i * step + 0.02, a1 = a0 + step - 0.04;
      if (typeof v === 'number' && v > 0) {
        const r = (R * v) / 10;
        const [x0, y0] = pt(a0, r), [x1, y1] = pt(a1, r);
        s += `<path d="M${c},${c} L${f(x0)},${f(y0)} A${f(r)},${f(r)} 0 0,1 ${f(x1)},${f(y1)} Z" class="mw-fill ${v < 5 ? 'low' : ''}"><title>${u.esc(ar.name)}: ${v}</title></path>`;
      }
      const [sx, sy] = pt(-Math.PI / 2 + i * step, R);
      s += `<line x1="${c}" y1="${c}" x2="${f(sx)}" y2="${f(sy)}" class="mw-spoke"/>`;
    });
    return `<svg viewBox="0 0 ${size} ${size}" class="mini-wheel" aria-hidden="true">${s}</svg>`;
  }
  function balanceWheels() {
    const areas = LP.data.balance.areas;
    const snaps = LP.data.balance.snapshots.slice().reverse();
    const avg = (sc) => {
      const v = areas.map((a) => sc[a.id]).filter((x) => typeof x === 'number' && x > 0);
      return v.length ? (v.reduce((p, x) => p + x, 0) / v.length).toFixed(1).replace('.', ',') : '—';
    };
    const card = (sc, label, sub, now) => `<figure class="snap-card ${now ? 'is-now' : ''}">
        ${miniWheel(sc)}
        <figcaption><b>${label}</b><span class="mono">${sub}</span></figcaption>
      </figure>`;
    // ключ: номери напрямів по колу (за годинниковою стрілкою від 12-ї)
    const key = `<ol class="snap-key">${areas.map((a) => `<li>${u.esc(a.name)}</li>`).join('')}</ol>`;
    const today = u.today();
    const hasToday = snaps.length && snaps[0].date === today;
    const cards = (hasToday ? '' : card(LP.data.balance.current, 'ЗАРАЗ', 'СЕРЕДНЯ ' + avg(LP.data.balance.current), true)) +
      snaps.map((s) => card(s.scores, u.fmtDate(s.date).toUpperCase(), 'СЕРЕДНЯ ' + avg(s.scores), s.date === today)).join('');
    return `<section class="chart chart-wide">
      <div class="label">ЗРІЗИ БАЛАНСУ</div>
      ${snaps.length ? '' : '<p class="empty-note">Збережи оцінку на сторінці «Баланс» — тут накопичуватимуться зрізи.</p>'}
      <div class="snap-strip">${cards}</div>
      ${key}
    </section>`;
  }

  // Стан по днях (щоденник): лінія оцінок 1–10 за 30 днів; клік по точці — запис дня
  function moodChart(ws) {
    const weekEnd = u.addDays(ws, 6);
    const end = weekEnd < u.today() ? weekEnd : u.today();
    const days = [];
    for (let i = 29; i >= 0; i--) days.push(u.addDays(end, -i));
    const W = 1000, H = 190, L = 34, R = 12, T = 14, B = 26;
    const x = (i) => L + (i / (days.length - 1)) * (W - L - R);
    const y = (v) => T + (1 - v / 10) * (H - T - B);
    const pts = days.map((d, i) => ({ d, i, e: LP.journal(d) })).filter((p) => p.e && p.e.score);
    const withEntry = days.map((d) => ({ d, e: LP.journal(d) })).filter((p) => p.e);
    if (!withEntry.length) {
      return `<section class="chart chart-wide"><div class="label">СТАН ПО ДНЯХ</div>
        <p class="empty-note">Натисни на шапку дня в тижні й запиши, як ти, — тут зʼявиться графік стану.</p></section>`;
    }
    let svg = '';
    [2, 4, 6, 8, 10].forEach((v) => (svg += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="mc-grid"/><text x="${L - 8}" y="${y(v) + 4}" class="mc-y">${v}</text>`));
    days.forEach((d, i) => {
      if (i % 5 === 0 || i === days.length - 1) {
        const anchor = i === 0 ? 'start' : i === days.length - 1 ? 'end' : 'middle';
        svg += `<text x="${x(i)}" y="${H - 6}" class="mc-x" text-anchor="${anchor}">${u.fmtDay(d)}</text>`;
      }
    });
    if (pts.length > 1) svg += `<polyline class="mc-line" points="${pts.map((p) => `${x(p.i).toFixed(1)},${y(p.e.score).toFixed(1)}`).join(' ')}"/>`;
    const pick = LP.view.journalPick && LP.journal(LP.view.journalPick) ? LP.view.journalPick : withEntry[withEntry.length - 1].d;
    pts.forEach((p) => {
      svg += `<circle cx="${x(p.i).toFixed(1)}" cy="${y(p.e.score).toFixed(1)}" r="${p.d === pick ? 9 : 6}" class="mc-dot ${p.d === pick ? 'on' : ''}" data-jday="${p.d}"
        data-tip="${u.esc(`${u.fmtDate(p.d)} — ${p.e.score}/10${p.e.state ? ', ' + p.e.state : ''}`)}"/>`;
    });
    const e = LP.journal(pick);
    return `<section class="chart chart-wide">
      <div class="label chart-label-row"><span>СТАН ПО ДНЯХ</span><button type="button" class="link-btn" data-mood-all>ВЕСЬ ГРАФІК →</button></div>
      <div class="mood-wrap">
        <svg class="mood-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Графік стану за 30 днів">${svg}</svg>
        <div class="journal-card">
          <div class="mono">${u.DAYS_LONG[u.weekday(pick)].toUpperCase()}, ${u.fmtDate(pick).toUpperCase()}</div>
          <div class="jc-head">${e.score ? `<b>${e.score}</b><small>/10</small>` : ''}${e.state ? `<span>${u.esc(e.state)}</span>` : ''}</div>
          ${e.note || e.gratitude ? `<div class="jc-text">
            ${e.note ? `<p>${LP.markedHtml(e.note, e.marks && e.marks.note)}</p>` : ''}
            ${e.gratitude ? `<p class="jc-grat"><span class="mono">ВДЯЧНИЙ ЗА</span> ${LP.markedHtml(e.gratitude, e.marks && e.marks.gratitude)}</p>` : ''}
          </div>` : ''}
          <div class="jc-actions">
            ${e.note || e.gratitude ? `<button type="button" class="link-btn" data-jread="${pick}">ЧИТАТИ Й ВИДІЛЯТИ →</button>` : ''}
            ${pick === u.today() ? `<button type="button" class="link-btn" data-jedit="${pick}">ЗМІНИТИ</button>` : ''}
          </div>
        </div>
      </div>
    </section>`;
  }

  // Весь графік стану: період на вибір (30 днів, 3 місяці, рік, окремий рік, усе, свої дати)
  function historySvg(from, to) {
    const n = Math.round((u.parse(to) - u.parse(from)) / 864e5);
    const W = 1100, H = 260, L = 34, R = 14, T = 16, B = 30;
    const x = (d) => L + (n ? Math.round((u.parse(d) - u.parse(from)) / 864e5) / n : 0.5) * (W - L - R);
    const y = (v) => T + (1 - v / 10) * (H - T - B);
    const pts = Object.keys(LP.data.journal).filter((d) => d >= from && d <= to && LP.data.journal[d].score).sort();
    let svg = '';
    [2, 4, 6, 8, 10].forEach((v) => (svg += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="mc-grid"/><text x="${L - 8}" y="${y(v) + 4}" class="mc-y">${v}</text>`));
    // підписи осі: дні (коротко) або місяці (довго)
    if (n <= 45) {
      for (let i = 0; i <= n; i += Math.max(1, Math.round(n / 7))) {
        const d = u.addDays(from, i);
        svg += `<text x="${x(d)}" y="${H - 8}" class="mc-x" text-anchor="middle">${u.fmtDay(d)}</text>`;
      }
    } else {
      const d0 = u.parse(from);
      let cur = new Date(d0.getFullYear(), d0.getMonth() + 1, 1);
      const step = n > 800 ? 6 : n > 400 ? 2 : 1;
      let k = 0;
      while (u.iso(cur) <= to) {
        if (k % step === 0) {
          const lbl = LP.MONTHS[cur.getMonth()].slice(0, 3).toUpperCase() + (cur.getMonth() === 0 ? ' ' + cur.getFullYear() : '');
          svg += `<line x1="${x(u.iso(cur))}" x2="${x(u.iso(cur))}" y1="${T}" y2="${H - B}" class="mc-grid"/><text x="${x(u.iso(cur))}" y="${H - 8}" class="mc-x" text-anchor="middle">${lbl}</text>`;
        }
        k++;
        cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
      }
    }
    if (pts.length > 1) svg += `<polyline class="mc-line" points="${pts.map((d) => `${x(d).toFixed(1)},${y(LP.data.journal[d].score).toFixed(1)}`).join(' ')}"/>`;
    const r = pts.length > 120 ? 3 : pts.length > 40 ? 4.5 : 6;
    pts.forEach((d) => {
      const e = LP.data.journal[d];
      svg += `<circle cx="${x(d).toFixed(1)}" cy="${y(e.score).toFixed(1)}" r="${r}" class="mc-dot" data-hday="${d}"><title>${u.fmtDate(d)} — ${e.score}/10${e.state ? ', ' + u.esc(e.state) : ''}</title></circle>`;
    });
    const avg = pts.length ? (pts.reduce((a, d) => a + LP.data.journal[d].score, 0) / pts.length).toFixed(1).replace('.', ',') : '—';
    return { svg: `<svg class="mood-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Графік стану">${svg}</svg>`, count: pts.length, avg };
  }
  LP.openMoodHistory = function () {
    const today = u.today();
    const all = Object.keys(LP.data.journal).sort();
    const firstDay = all[0] || today;
    const years = [...new Set(all.map((d) => d.slice(0, 4)))];
    const presets = [
      ['30', '30 ДНІВ', () => [u.addDays(today, -29), today]],
      ['90', '3 МІСЯЦІ', () => [u.addDays(today, -89), today]],
      ['365', 'РІК', () => [u.addDays(today, -364), today]],
      ...years.map((yy) => ['y' + yy, yy, () => [yy + '-01-01', yy + '-12-31' < today ? yy + '-12-31' : today]]),
      ['all', 'УСЕ', () => [firstDay < today ? firstDay : u.addDays(today, -29), today]],
    ];
    let sel = '90', range = presets[1][2]();
    const box = document.createElement('div');
    box.className = 'modal-backdrop';
    const paint = () => {
      const h = historySvg(range[0], range[1]);
      box.innerHTML = `
        <div class="modal modal-wide mood-history" role="dialog" aria-modal="true">
          <div class="modal-head"><h2>Стан по днях</h2><button type="button" class="icon-btn" data-close aria-label="Закрити">✕</button></div>
          <div class="mh-tools">
            <div class="mh-presets">${presets.map(([k, t]) => `<button type="button" class="tool ${k === sel ? 'on' : ''}" data-p="${k}">${t}</button>`).join('')}</div>
            <div class="mh-range mono"><input type="date" name="from" value="${range[0]}"> — <input type="date" name="to" value="${range[1]}"></div>
          </div>
          <div class="mh-body">
            <div class="mono muted">${u.fmtDate(range[0]).toUpperCase()} — ${u.fmtDate(range[1]).toUpperCase()} · ЗАПИСІВ: ${h.count} · СЕРЕДНЯ ${h.avg}</div>
            ${h.svg}
          </div>
        </div>`;
    };
    const close = () => { box.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => e.key === 'Escape' && close();
    box.addEventListener('click', (e) => {
      if (e.target === box || e.target.closest('[data-close]')) return close();
      const p = e.target.closest('[data-p]');
      if (p) {
        sel = p.dataset.p;
        range = presets.find((x) => x[0] === sel)[2]();
        return paint();
      }
      const dot = e.target.closest('[data-hday]');
      if (dot) {
        close();
        LP.readJournal(dot.dataset.hday);
      }
    });
    box.addEventListener('change', (e) => {
      if (e.target.name !== 'from' && e.target.name !== 'to') return;
      const f = box.querySelector('[name=from]').value, t = box.querySelector('[name=to]').value;
      if (f && t && f <= t) {
        range = [f, t];
        sel = '';
        paint();
      }
    });
    document.addEventListener('keydown', onKey);
    paint();
    document.body.appendChild(box);
  };

  // Сон по днях: з меж підйому й відбою в розкладі (14 днів до кінця обраного тижня)
  function sleepChart(ws) {
    if (LP.data.settings.showSleep === false) return '';
    const end = u.addDays(ws, 6);
    const days = [];
    for (let i = 13; i >= 0; i--) days.push(u.addDays(end, -i));
    const vals = days.map((d) => LP.sleepHours(d));
    const W = 1000, H = 170, L = 34, R = 10, T = 18, B = 26;
    const max = Math.max(10, ...vals);
    const bw = (W - L - R) / days.length;
    const y = (v) => T + (1 - v / max) * (H - T - B);
    let svg = '';
    [4, 6, 8, 10].filter((v) => v <= max).forEach((v) => (svg += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="mc-grid ${v === 8 ? 'sl-norm' : ''}"/><text x="${L - 8}" y="${y(v) + 4}" class="mc-y">${v}</text>`));
    const today = u.today();
    days.forEach((d, i) => {
      const v = vals[i], x = L + i * bw + bw * 0.18, w = bw * 0.64;
      const cls = d > today ? 'sl-bar future' : v < 7 ? 'sl-bar low' : 'sl-bar';
      const txt = (Math.round(v * 10) / 10).toString().replace('.', ',');
      svg += `<rect x="${x.toFixed(1)}" y="${y(v).toFixed(1)}" width="${w.toFixed(1)}" height="${(H - B - y(v)).toFixed(1)}" class="${cls}"><title>${u.fmtDate(d)} — ${txt} год</title></rect>`;
      svg += `<text x="${(x + w / 2).toFixed(1)}" y="${(y(v) - 5).toFixed(1)}" class="sl-val" text-anchor="middle">${txt}</text>`;
      svg += `<text x="${(x + w / 2).toFixed(1)}" y="${H - 8}" class="mc-x" text-anchor="middle">${u.DAYS_SHORT[u.weekday(d)]} ${u.parse(d).getDate()}</text>`;
    });
    const past = days.filter((d) => d <= today).map((d) => LP.sleepHours(d));
    const avg = past.length ? (past.reduce((a, b) => a + b, 0) / past.length).toFixed(1).replace('.', ',') : '—';
    return `<section class="chart chart-wide">
      <div class="label chart-label-row"><span>СОН ПО ДНЯХ · СЕРЕДНЄ ${avg} ГОД</span><button type="button" class="link-btn" data-sleep-set>НАЛАШТУВАТИ СОН →</button></div>
      <svg class="mood-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Сон по днях">${svg}</svg>
    </section>`;
  }

  function render(root) {
    const ws = LP.view.weekStart;
    const s = LP.weekStats(ws);
    const weeks = [];
    for (let i = WEEKS - 1; i >= 0; i--) weeks.push(u.addDays(ws, -7 * i));
    const series = weeks.map((w) => ({ ws: w, st: LP.weekStats(w) }));
    const habitRows = series.map(({ ws: w, st }) => ({
      ws: w,
      pct: st.habitTarget ? u.pct(st.habitDone, st.habitTarget) : null,
      tip: `${u.fmtWeek(w)}\n${st.habitTarget ? `${st.habitDone} з ${st.habitTarget} відміток (${u.pct(st.habitDone, st.habitTarget)}%)` : 'звичок не було'}`,
    }));
    const goals = LP.bigGoals();
    const goalRows = goals.length
      ? goals.map((g) => {
          const p = LP.goalProgress(g);
          return `<div class="hbar-row">
            <div class="hbar-name">[${u.esc(g.tag)}] ${u.esc(g.title)}</div>
            <div class="hbar-track" style="width:100%"><div class="hbar-fill" style="width:${Math.round(p * 100)}%"></div></div>
            <div class="mono">${Math.round(p * 100)}%</div>
          </div>`;
        }).join('')
      : '<p class="empty-note">Цілей ще немає.</p>';

    root.innerHTML = `
      <div class="page">
        <div class="tiles">
          ${tile('ЗРОБЛЕНО ЗА ТИЖДЕНЬ', `${s.done}`, `${u.fmtHours(s.minDone).toUpperCase()} СПРАВ`)}
          ${tile('ЦІЛІ ТИЖНЯ', `${s.weekGoalsDone}/${s.weekGoals}`, s.weekGoals ? `${u.pct(s.weekGoalsDone, s.weekGoals)}% ДОСЯГНУТО` : 'НЕ ПОСТАВЛЕНО')}
          ${tile('ЗВИЧКИ', `${u.pct(s.habitDone, s.habitTarget)}%`, `${s.habitDone} З ${s.habitTarget} ВІДМІТОК`)}
          ${tile('БЕКЛОГ', `${LP.backlog().length}`, 'ЗАДАЧ ЧЕКАЮТЬ НА ЧАС')}
        </div>
        ${moodChart(ws)}
        ${sleepChart(ws)}
        <div class="chart-row">
          ${doneBars(series, ws)}
          ${pctBars('ВИКОНАННЯ ЗВИЧОК ПО ТИЖНЯХ, %', habitRows, ws)}
        </div>
        ${LP.habitsSection.html()}
        ${balanceWheels()}
        <section class="chart chart-wide"><div class="label">ПРОГРЕС ЦІЛЕЙ</div><div class="hbars">${goalRows}</div></section>
      </div>
      <div class="tip" hidden></div>`;

    const tip = root.querySelector('.tip');
    root.querySelectorAll('[data-tip]').forEach((el) => {
      el.addEventListener('pointerenter', () => {
        tip.textContent = el.dataset.tip;
        tip.hidden = false;
      });
      el.addEventListener('pointermove', (e) => {
        const w = tip.offsetWidth;
        tip.style.left = (e.clientX + 14 + w > window.innerWidth ? e.clientX - w - 14 : e.clientX + 14) + 'px';
        tip.style.top = e.clientY + 14 + 'px';
      });
      el.addEventListener('pointerleave', () => (tip.hidden = true));
    });
    root.querySelectorAll('[data-jday]').forEach((el) =>
      el.addEventListener('click', () => {
        LP.view.journalPick = el.dataset.jday;
        LP.render();
      })
    );
    LP.habitsSection.bind(root);
    const ss = root.querySelector('[data-sleep-set]');
    if (ss) ss.addEventListener('click', () => LP.openSleepForm(u.today()));
    const ma = root.querySelector('[data-mood-all]');
    if (ma) ma.addEventListener('click', LP.openMoodHistory);
    root.querySelectorAll('[data-jread]').forEach((el) => el.addEventListener('click', () => LP.readJournal(el.dataset.jread)));
    root.querySelectorAll('[data-jedit]').forEach((el) => el.addEventListener('click', () => LP.openJournal(el.dataset.jedit)));
    root.querySelectorAll('.bar-col').forEach((el) =>
      el.addEventListener('click', () => {
        LP.view.weekStart = el.dataset.ws;
        LP.render();
      })
    );
  }

  LP.views = LP.views || {};
  LP.views.stats = { render };
})(window.LP);
