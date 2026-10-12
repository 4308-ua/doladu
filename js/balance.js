// Баланс: колесо життєвого балансу з історією оцінок, карта стосунків і соціальна обсерваторія
// (карта й 7 видів підтримки — за книгою «Щасливе життя» Вальдінгера і Шульца).
window.LP = window.LP || {};

(function (LP) {
  const u = LP.u;
  const W = 440, C = W / 2, R = 170;

  // ---------------- Колесо ----------------
  const pt = (a, r) => [C + r * Math.cos(a), C + r * Math.sin(a)];
  const f = (n) => n.toFixed(1);
  const wedge = (a0, a1, r) => {
    if (r <= 0) return '';
    const [x0, y0] = pt(a0, r), [x1, y1] = pt(a1, r);
    return `M${C},${C} L${f(x0)},${f(y0)} A${r},${r} 0 0 1 ${f(x1)},${f(y1)} Z`;
  };

  // Заливка колеса — завжди поточні оцінки; контур — одна з попередніх дат (не сьогоднішня)
  const pastSnaps = () => LP.data.balance.snapshots.filter((s) => s.date < u.today());
  function compareSnap() {
    const snaps = pastSnaps();
    if (!snaps.length) return null;
    return snaps.find((s) => s.id === LP.view.compareSnap) || snaps[snaps.length - 1];
  }
  const snapLabel = (s) => u.fmtDay(s.date).toUpperCase() + (s.time ? ' ' + s.time : '');

  function wheelSvg() {
    const areas = LP.data.balance.areas;
    const n = areas.length;
    const prev = compareSnap();
    const step = (2 * Math.PI) / n;
    const a = (i) => -Math.PI / 2 + i * step;
    let s = '';
    for (let k = 1; k <= 10; k++) s += `<circle cx="${C}" cy="${C}" r="${(R * k) / 10}" class="w-ring ${k === 10 ? 'w-ring-out' : k % 5 === 0 ? 'w-ring-5' : ''}"/>`;
    areas.forEach((ar, i) => {
      const score = LP.areaScore(ar.id);
      s += `<path d="${wedge(a(i) + 0.012, a(i + 1) - 0.012, (R * score) / 10)}" class="w-fill"><title>${u.esc(ar.name)}: ${score}/10</title></path>`;
    });
    areas.forEach((ar, i) => {
      const [x, y] = pt(a(i), R);
      s += `<line x1="${C}" y1="${C}" x2="${f(x)}" y2="${f(y)}" class="w-spoke"/>`;
    });
    if (prev) {
      const pts = areas.map((ar, i) => pt(a(i) + step / 2, (R * (prev.scores[ar.id] || 0)) / 10).map(f).join(',')).join(' ');
      s += `<polygon points="${pts}" class="w-prev"><title>Оцінка ${u.fmtDate(prev.date)}</title></polygon>`;
    }
    areas.forEach((ar, i) => {
      const mid = a(i) + step / 2;
      const [x, y] = pt(mid, R + 22);
      const anchor = Math.abs(Math.cos(mid)) < 0.25 ? 'middle' : Math.cos(mid) > 0 ? 'start' : 'end';
      s += `<text x="${f(x)}" y="${f(y)}" text-anchor="${anchor}" dominant-baseline="middle" class="w-label">${u.esc(ar.name.toUpperCase())} <tspan class="w-score">${LP.areaScore(ar.id)}</tspan></text>`;
    });
    return `<svg viewBox="-150 -10 ${W + 300} ${W + 20}" class="wheel" role="img" aria-label="Колесо балансу">${s}</svg>`;
  }

  function areaRows() {
    return LP.data.balance.areas.map((ar) => {
      const score = LP.areaScore(ar.id);
      let cells = '';
      for (let k = 1; k <= 10; k++) cells += `<button type="button" class="sc ${k <= score ? 'on' : ''}" data-area="${ar.id}" data-score="${k}" aria-label="${u.esc(ar.name)}: ${k}"></button>`;
      return `<div class="area-row"><span class="area-name">${u.esc(ar.name)}</span><span class="sc-row">${cells}</span><b class="area-val">${score}</b></div>`;
    }).join('');
  }

  function dipsHtml() {
    const rated = LP.data.balance.areas.filter((a) => LP.areaScore(a.id) > 0).sort((a, b) => LP.areaScore(a.id) - LP.areaScore(b.id));
    if (!rated.length) return '<p class="empty-note">Постав оцінки 1–10: клікни по колесу або по шкалі.</p>';
    const avg = rated.reduce((s, a) => s + LP.areaScore(a.id), 0) / rated.length;
    // Просадка — оцінка нижче 7. Показуємо 3 найнижчі; але все, що нижче 5, — завжди, скільки б їх не було.
    const below7 = rated.filter((a) => LP.areaScore(a.id) < 7);
    const below5 = below7.filter((a) => LP.areaScore(a.id) < 5);
    const shown = below5.length > 3 ? below5 : below7.slice(0, 3);
    return `
      <div class="mono">СЕРЕДНЯ ОЦІНКА ${avg.toFixed(1).replace('.', ',')}</div>
      ${shown.length
        ? `<ol class="dips">${shown.map((a) => `<li><span>${u.esc(a.name)}</span><b>${LP.areaScore(a.id)}</b></li>`).join('')}</ol>`
        : '<p class="dips-none">Просадок немає — усі напрями від 7 і вище.</p>'}`;
  }

  // Історія: напрями × дати оцінок + міні-графік тенденції
  function spark(values, w = 96, h = 26) {
    const pts = values.map((v, i) => [values.length > 1 ? (i / (values.length - 1)) * (w - 6) + 3 : w / 2, h - 3 - (v / 10) * (h - 6)]);
    if (!pts.length) return '';
    const first = values[0], last = values[values.length - 1];
    const cls = last > first ? 'up' : last < first ? 'down' : '';
    const [lx, ly] = pts[pts.length - 1];
    return `<svg class="spark ${cls}" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">
      <polyline points="${pts.map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ')}"/><circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="3"/></svg>`;
  }

  function historyTable(limit, sparkW) {
    const all = LP.data.balance.snapshots;
    const snaps = limit ? all.slice(-limit) : all;
    const cols = snaps.map((s) => ({ id: s.id, label: snapLabel(s), scores: s.scores }));
    cols.push({ id: null, label: 'ЗАРАЗ', scores: LP.data.balance.current });
    const cell = (v, prev) => {
      if (typeof v !== 'number') return '<td class="muted">—</td>';
      const d = typeof prev === 'number' ? v - prev : 0;
      return `<td><b>${v}</b>${d ? `<span class="delta ${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : ''}${d}</span>` : ''}</td>`;
    };
    const avg = (sc) => {
      const vals = LP.data.balance.areas.map((a) => sc[a.id]).filter((v) => typeof v === 'number' && v > 0);
      return vals.length ? vals.reduce((x, v) => x + v, 0) / vals.length : null;
    };
    const trend = (a) => all.map((x) => x.scores[a.id]).concat([LP.data.balance.current[a.id]]).filter((v) => typeof v === 'number');
    const avgTrend = all.map((x) => avg(x.scores)).concat([avg(LP.data.balance.current)]).filter((v) => v !== null);
    return `
      <table class="history">
        <thead><tr><th>НАПРЯМ</th><th>ТЕНДЕНЦІЯ</th>${cols.map((c) => `<th>${c.label}${c.id ? ` <button type="button" class="icon-btn small" data-del-snap="${c.id}" aria-label="Видалити оцінку ${c.label}">✕</button>` : ''}</th>`).join('')}</tr></thead>
        <tbody>
          ${LP.data.balance.areas.map((a) => `<tr><td class="area-name">${u.esc(a.name)}</td><td>${spark(trend(a), sparkW)}</td>${cols.map((c, i) => cell(c.scores[a.id], i ? cols[i - 1].scores[a.id] : undefined)).join('')}</tr>`).join('')}
          <tr class="avg-row"><td>СЕРЕДНЄ</td><td>${spark(avgTrend, sparkW)}</td>${cols.map((c) => {
            const v = avg(c.scores);
            return `<td>${v === null ? '—' : v.toFixed(1).replace('.', ',')}</td>`;
          }).join('')}</tr>
        </tbody>
      </table>`;
  }

  function historyHtml() {
    const snaps = LP.data.balance.snapshots;
    const open = !!LP.view.historyOpen;
    return `
      <div class="history-box ${open ? 'is-open' : ''}">
        <div class="history-head">
          <button type="button" class="toggle history-toggle" data-history aria-expanded="${open}">${open ? '▾' : '▸'} ІСТОРІЯ ОЦІНОК · ${snaps.length}</button>
          ${snaps.length > 10 ? `<span class="mono muted">ОСТАННІ 10</span>` : ''}
          ${snaps.length ? `<button type="button" class="btn" data-history-all>ПОКАЗАТИ ВСЕ</button>` : ''}
        </div>
        ${open ? (snaps.length
          ? `<div class="table-scroll">${historyTable(10, 96)}</div>`
          : '<p class="empty-note">Історії ще немає. Змінюй оцінки — зріз за день зберігається сам, і з часом побачиш, як змінюється баланс.</p>') : ''}
      </div>`;
  }

  function openHistoryAll() {
    LP.modal({
      title: 'Уся історія оцінок',
      wide: true,
      submitText: 'Закрити',
      body: `<div class="table-scroll history-all">${historyTable(0, 140)}</div>`,
      onSubmit: () => true,
    });
  }

  // ---------------- Карта стосунків ----------------
  function mapHtml() {
    const people = LP.data.people.map((p) => `
      <button type="button" class="person ${p.ok ? '' : 'wants-change'}" data-person="${p.id}" style="left:${p.x * 100}%;top:${(1 - p.y) * 100}%"
        title="${u.esc(p.name)}${p.note ? ' — ' + u.esc(p.note) : ''}">
        <span class="dot"></span><span class="pname">${u.esc(p.name)}</span>
      </button>
      ${!p.ok && p.tx != null ? `<span class="arrow-handle" data-handle="${p.id}" style="left:${p.tx * 100}%;top:${(1 - p.ty) * 100}%" title="Куди хочу рухати стосунки з ${u.esc(p.name)} — перетягни"></span>` : ''}`).join('');
    return `
      <div class="rel-map">
        <div class="quad quad-bad"></div>
        <div class="quad quad-tl"></div>
        <div class="quad quad-br"></div>
        <div class="axis-v"></div><div class="axis-h"></div>
        <span class="ax-label ax-top">ЗАРЯДЖАЮТЬ</span>
        <span class="ax-label ax-bottom">ВИСНАЖУЮТЬ</span>
        <span class="ax-label ax-left">РІДКО</span>
        <span class="ax-label ax-right">ЧАСТО</span>
        <div class="rel-area"><svg class="arrows" aria-hidden="true"></svg>${people}</div>
      </div>`;
  }

  function drawArrows(root) {
    const area = root.querySelector('.rel-area');
    const svg = area.querySelector('.arrows');
    const w = area.clientWidth, h = area.clientHeight;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    let s = `<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 Z" class="ah"/></marker></defs>`;
    LP.data.people.forEach((p) => {
      if (p.ok || p.tx == null) return;
      const x1 = p.x * w, y1 = (1 - p.y) * h, x2 = p.tx * w, y2 = (1 - p.ty) * h;
      const len = Math.hypot(x2 - x1, y2 - y1);
      if (len < 12) return;
      const k = (len - 8) / len;
      s += `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x1 + (x2 - x1) * k)}" y2="${f(y1 + (y2 - y1) * k)}" class="arrow" marker-end="url(#ah)"/>`;
    });
    svg.innerHTML = s;
  }

  // ---------------- Соціальна обсерваторія ----------------
  function supportHtml() {
    const people = LP.data.people;
    if (!people.length) return '<p class="empty-note">Люди зʼявляться тут автоматично, щойно додаси їх на карту стосунків.</p>';
    const sym = { '+': '+', '-': '−', '±': '±' };
    return `
      <div class="table-scroll"><table class="support">
        <thead><tr><th>ВИД ПІДТРИМКИ</th>${people.map((p) => `<th class="p-col">${u.esc(p.name)}</th>`).join('')}</tr></thead>
        <tbody>${LP.SUPPORT.map((k, i) => {
          const row = LP.data.support[k.id] || {};
          const hasPlus = people.some((p) => row[p.id] === '+' || row[p.id] === '±');
          return `<tr class="${hasPlus ? '' : 'gap'}">
            <td><div class="k-title"><span class="num">${String(i + 1).padStart(2, '0')}</span> ${k.title}</div><div class="k-q">${k.q}</div></td>
            ${people.map((p) => {
              const v = row[p.id] || '';
              return `<td class="p-col"><button type="button" class="pm pm-${v === '+' ? 'plus' : v === '-' ? 'minus' : v === '±' ? 'both' : 'none'}" data-pm="${k.id}|${p.id}"
                aria-label="${u.esc(p.name)}: ${k.title}">${sym[v] || ''}</button></td>`;
            }).join('')}
          </tr>`;
        }).join('')}</tbody>
      </table></div>`;
  }

  function render(root) {
    const snaps = LP.data.balance.snapshots;
    const cmp = compareSnap();
    root.innerHTML = `
      <div class="page">
        <section>
          <div class="section-head">
            <h2>КОЛЕСО БАЛАНСУ</h2>
            <span class="mono">ЗАЛИВКА — ЗАРАЗ${cmp ? ` · КОНТУР — ${snapLabel(cmp)}` : ''}</span>
            ${pastSnaps().length ? `<label class="mono cmp">ПОРІВНЯТИ З <select data-compare>${pastSnaps().slice().reverse().map((s) => `<option value="${s.id}" ${cmp && s.id === cmp.id ? 'selected' : ''}>${snapLabel(s)}</option>`).join('')}</select></label>` : ''}
            <button type="button" class="btn" data-areas>НАПРЯМИ</button>
            <span class="mono muted snap-auto">${LP.data.balance.snapshots.some((x) => x.date === u.today()) ? 'ЗРІЗ ЗА СЬОГОДНІ ЗБЕРЕЖЕНО АВТОМАТИЧНО · ЗАВТРА ПОЧНЕТЬСЯ НОВИЙ' : 'ЗМІНИ ОЦІНКУ — І ЗРІЗ ЗА СЬОГОДНІ ЗБЕРЕЖЕТЬСЯ САМ'}</span>
          </div>
          <div class="balance-grid">
            <div class="wheel-wrap">${wheelSvg()}</div>
            <div>
              <div class="areas">${areaRows()}</div>
              <div class="dips-box"><div class="label">ПРОСАДКИ</div>${dipsHtml()}</div>
            </div>
          </div>
          ${historyHtml()}
        </section>

        <section>
          <div class="section-head">
            <h2>КАРТА СТОСУНКІВ</h2>
            <span class="mono"></span>
            <button type="button" class="btn" data-add-person>+ ЛЮДИНА</button>
          </div>
          ${mapHtml()}
        </section>

        <section>
          <div class="section-head">
            <h2>СОЦІАЛЬНА ОБСЕРВАТОРІЯ</h2>
            <span class="mono"></span>
          </div>
          ${supportHtml()}
        </section>
      </div>`;
    drawArrows(root);
    bind(root);
  }

  function bind(root) {
    const svg = root.querySelector('.wheel');
    svg.addEventListener('click', (e) => {
      const p0 = svg.createSVGPoint();
      p0.x = e.clientX;
      p0.y = e.clientY;
      const p = p0.matrixTransform(svg.getScreenCTM().inverse());
      const dx = p.x - C, dy = p.y - C;
      const dist = Math.hypot(dx, dy);
      if (dist > R + 4) return;
      const areas = LP.data.balance.areas;
      let ang = Math.atan2(dy, dx) + Math.PI / 2;
      if (ang < 0) ang += 2 * Math.PI;
      const i = Math.floor(ang / ((2 * Math.PI) / areas.length)) % areas.length;
      LP.setAreaScore(areas[i].id, u.clamp(Math.ceil((dist / R) * 10), 1, 10));
    });
    root.querySelectorAll('.sc').forEach((b) => b.addEventListener('click', () => LP.setAreaScore(b.dataset.area, parseInt(b.dataset.score, 10))));
    root.querySelector('[data-areas]').addEventListener('click', openAreasForm);
    const cmp = root.querySelector('[data-compare]');
    if (cmp) cmp.addEventListener('change', () => {
      LP.view.compareSnap = cmp.value;
      LP.render();
    });
    root.querySelector('[data-history]').addEventListener('click', () => {
      LP.view.historyOpen = !LP.view.historyOpen;
      LP.render();
    });
    const all = root.querySelector('[data-history-all]');
    if (all) all.addEventListener('click', openHistoryAll);
    root.querySelectorAll('[data-del-snap]').forEach((b) =>
      b.addEventListener('click', () => {
        if (confirm('Видалити цю оцінку з історії?')) LP.deleteSnapshot(b.dataset.delSnap);
      })
    );

    // карта: перетягування людей і кінців стрілок
    const area = root.querySelector('.rel-area');
    const dragPoint = (el, onMove, onClick) => {
      el.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        const r = area.getBoundingClientRect();
        const x0 = e.clientX, y0 = e.clientY;
        let moved = false;
        document.body.classList.add('is-grabbing');
        el.classList.add('is-dragging');
        const move = (m) => {
          if (!moved && Math.hypot(m.clientX - x0, m.clientY - y0) < 4) return;
          moved = true;
          const x = u.clamp((m.clientX - r.left) / r.width, 0, 1);
          const y = u.clamp(1 - (m.clientY - r.top) / r.height, 0, 1);
          el.style.left = x * 100 + '%';
          el.style.top = (1 - y) * 100 + '%';
          onMove(x, y);
          drawArrows(root);
        };
        const up = () => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          document.body.classList.remove('is-grabbing');
          el.classList.remove('is-dragging');
          if (moved) LP.save();
          else if (onClick) onClick();
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      });
    };
    area.querySelectorAll('.person').forEach((el) => {
      const p = LP.person(el.dataset.person);
      dragPoint(el, (x, y) => Object.assign(p, { x, y }), () => LP.openPersonForm(p));
    });
    area.querySelectorAll('.arrow-handle').forEach((el) => {
      const p = LP.person(el.dataset.handle);
      dragPoint(el, (x, y) => Object.assign(p, { tx: x, ty: y }));
    });
    root.querySelector('[data-add-person]').addEventListener('click', () => LP.openPersonForm({}));

    root.querySelectorAll('[data-pm]').forEach((b) =>
      b.addEventListener('click', () => {
        const [k, p] = b.dataset.pm.split('|');
        LP.cycleSupport(k, p);
      })
    );
  }

  function openAreasForm() {
    const areas = LP.data.balance.areas;
    LP.modal({
      title: 'Напрями життя',
      body: `
        <label class="field"><span>Один напрям на рядок (від 3 до 12)</span>
          <textarea name="areas" rows="10">${areas.map((a) => u.esc(a.name)).join('\n')}</textarea></label>
        <p class="hint">Оцінки й історія збережуться для напрямів, назва яких не змінилась.</p>`,
      onSubmit: (form) => {
        const names = form.areas.value.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 12);
        if (names.length < 3) {
          LP.showErrors(form, ['Потрібно щонайменше 3 напрями.']);
          return false;
        }
        LP.data.balance.areas = names.map((name) => areas.find((a) => a.name === name) || { id: u.uid(), name });
        LP.save();
      },
    });
  }

  LP.views = LP.views || {};
  LP.views.balance = { render };
})(window.LP);
