// Дошка — помічник планування.
// Форма картки показує, яка це задача: важка — гостра зірка, нейтральна — хвиляста, приємна — овал.
// Картки можна зʼєднувати стрілками (тягни кружечок на краю картки до іншої) — виходить ланцюжок із часом:
// на початку стрілки — коли закінчується попередня задача, на кінці — коли починається наступна.
// Після довгої задачі (від 45 хв) у стрілку додається перерва; після важкої чи нейтральної — її бонус.
// Готовий ланцюжок одним кліком іде в розклад на обраний день.
window.LP = window.LP || {};

(function (LP) {
  const u = LP.u;
  const ORDER = ['good', 'mid', 'bad'];
  const CW = 220, CH = 120;          // розмір картки, px
  const RX = 104, RY = 54;           // півосі форми (для точок стрілок)
  let lastMood = 'mid';

  // ---------- Форми ----------
  // заливка за «вагою»: приємна — біла, нейтральна — світло-сіра, важка — сіра
  const TINT = { good: '#ffffff', mid: '#f0f0f0', bad: '#d9d9d9' };
  function shapePath(mood) {
    const cx = CW / 2, cy = CH / 2;
    const P = (a, kx, ky) => [cx + RX * kx * Math.cos(a), cy + RY * ky * Math.sin(a)];
    const f = (n) => n.toFixed(1);
    if (mood === 'good') return `M${cx - RX},${cy} a${RX},${RY} 0 1,0 ${RX * 2},0 a${RX},${RY} 0 1,0 ${-RX * 2},0 Z`;
    if (mood === 'mid') {
      // хвилястий контур
      let d = '';
      const n = 160;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        const w = 1 + 0.045 * Math.sin(a * 14);
        const [x, y] = P(a, 0.97 * w, 0.95 * w);
        d += (i ? 'L' : 'M') + f(x) + ',' + f(y);
      }
      return d + 'Z';
    }
    // важка — гостра зірка: лише прямі відрізки й гострі кути
    const n = 18;
    let d = '';
    for (let i = 0; i < n * 2; i++) {
      const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
      const k = i % 2 ? 0.8 : 1.06;
      const [x, y] = P(a, k, k);
      d += (i ? 'L' : 'M') + f(x) + ',' + f(y);
    }
    return d + 'Z';
  }

  // Позиція картки на полотні (px у «світі» дошки). Старі дані зберігали частки ширини — переводимо.
  function pos(t) {
    if (t.bx == null) {
      t.bx = Math.round((t.x || 0) * 900);
      t.by = Math.round((t.y || 0) * 560);
    }
    return [t.bx, t.by];
  }
  const view = () => (LP.view.board = LP.view.board || { x: 20, y: 20, z: 1 });

  function partsLabel(t) {
    const parts = t.split === false ? [t.duration] : LP.splitDuration(t.duration);
    if (parts.length < 2) return u.fmtHours(t.duration).toUpperCase();
    const same = parts.every((p) => p === parts[0]);
    return same ? `${parts.length}×${parts[0]} ХВ` : parts.map((p) => p).join('+') + ' ХВ';
  }

  function cardHtml(t, times) {
    const tm = times.get(t.id);
    const [x, y] = pos(t);
    const meta = [partsLabel(t)];
    if (tm) meta.unshift(`${u.fmtTime(tm.start)}—${u.fmtTime(tm.end)}`);
    const g = t.goalId ? LP.goal(t.goalId) : null;
    if (g) meta.push(`[${g.tag}]`);
    return `
      <div class="scard mood-card-${t.mood}" data-task="${t.id}" style="left:${x}px;top:${y}px" tabindex="0"
           title="${u.esc(t.title)} — ${LP.MOODS[t.mood]}${t.bonus ? ' · бонус: ' + u.esc(t.bonus) : ''} · клік — змінити, видалити або в беклог">
        <svg class="scard-shape" viewBox="0 0 ${CW} ${CH}" aria-hidden="true"><path d="${shapePath(t.mood)}" fill="${TINT[t.mood]}"/></svg>
        <div class="scard-body">
          <div class="scard-title">${u.esc(t.title)}</div>
          <div class="scard-meta">${meta.join(' · ')}${t.bonus ? ' ★' : ''}</div>
        </div>
        ${tm && tm.first ? `<button type="button" class="start-chip" data-start="${t.id}" title="Час початку ланцюжка">▶ ${u.fmtTime(tm.start)}</button>` : ''}
        ${tm && tm.first ? `<button type="button" class="to-week" data-chain="${t.id}" title="Поставити весь ланцюжок у розклад">У РОЗКЛАД →</button>` : ''}
        <span class="connector" data-connect="${t.id}" title="Потягни до іншої картки, щоб зʼєднати стрілкою"></span>
      </div>`;
  }

  // План: розкладена дошка в тому ж порядку, з часом і перервами
  LP.planHtml = function (plan, dragTag) {
    const rows = plan.items.map((it, k) => `
      <li class="pl-row ${dragTag ? 'bl-item' : ''}" data-task="${it.task.id}" ${dragTag ? 'title="Перетягни лише цю задачу · клік — змінити"' : ''}>
        <span class="mono pl-time">${u.fmtTime(it.start)}</span>${LP.moodDot(it.task.mood)}<span class="pl-title" ${dragTag ? '' : `data-edit="${it.task.id}"`}>${u.esc(it.task.title)}</span>
        <span class="tag">${u.fmtHours(it.end - it.start).toUpperCase()}${it.task.bonus ? ' ★' : ''}</span>
      </li>${k < plan.items.length - 1 && it.gap ? `<li class="pl-gap mono">перерва ${it.gap} хв</li>` : ''}`).join('');
    return `<div class="bl-plan" data-plan="${plan.id}">
      <div class="pl-head" ${dragTag ? 'data-plan-drag="' + plan.id + '" title="Перетягни в день — стане весь план з тим самим порядком і перервами"' : ''}>
        <span class="label">ПЛАН · ${u.fmtTime(plan.start)}—${u.fmtTime(plan.end)}</span>
        <span class="mono muted">${plan.items.length} ЗАДАЧ${plan.items.length < 5 ? 'І' : ''}</span>
        ${dragTag ? '<span class="pl-grip mono">⠿ ТЯГНИ</span>' : `<button type="button" class="icon-btn small" data-plan-board="${plan.id}" title="Повернути план на дошку" aria-label="Повернути план на дошку">↩</button>`}
      </div>
      <ol class="pl-list">${rows}</ol>
    </div>`;
  };

  function backlogHtml() {
    const list = LP.looseBacklog();
    const plans = LP.backlogPlans();
    if (!list.length && !plans.length) return '<p class="empty-note">Порожньо. Розклади дошку й натисни «Усе в беклог →» — або відкрий картку й «В беклог →».</p>';
    return plans.map((p) => LP.planHtml(p, false)).join('') + ORDER.map((m) => {
      const items = list.filter((t) => t.mood === m);
      if (!items.length) return '';
      return `<div class="bl-group">
        <div class="label">${LP.MOODS[m].toUpperCase()} · ${items.length}</div>
        <ul class="bl-list">${items.map((t) => {
          const g = t.goalId ? LP.goal(t.goalId) : null;
          return `<li class="bl-row">
            ${LP.moodDot(t.mood)}
            <button type="button" class="bl-title-btn" data-edit="${t.id}">${u.esc(t.title)}</button>
            <span class="tag">${u.fmtHours(t.duration).toUpperCase()}${g ? ' [' + u.esc(g.tag) + ']' : ''}${t.bonus ? ' ★' : ''}</span>
            <button type="button" class="icon-btn small" data-to-board="${t.id}" title="Повернути на дошку" aria-label="Повернути на дошку">↩</button>
          </li>`;
        }).join('')}</ul>
      </div>`;
    }).join('');
  }

  function render(root) {
    const onBoard = LP.data.tasks.filter((t) => t.stage === 'board');
    const scheduled = LP.data.tasks.filter((t) => t.stage === 'scheduled').length;
    const times = LP.taskTimes();
    const v = view();
    root.innerHTML = `
      <div class="board-page">
        <div class="board-main">
          <form class="composer" autocomplete="off">
            <input type="text" name="title" maxlength="120" placeholder="Що хочеш зробити? Enter — на дошку">
            <div class="composer-moods">
              ${ORDER.map((m) => `<button type="button" class="btn mood-btn ${m === lastMood ? 'on' : ''}" data-mood="${m}">${LP.moodDot(m)} ${LP.MOODS[m].toUpperCase()}</button>`).join('')}
            </div>
            <button type="button" class="btn" data-group ${onBoard.length ? '' : 'disabled'}>ЗГРУПУВАТИ</button>
            <button type="button" class="btn btn-primary" data-all-backlog ${onBoard.length ? '' : 'disabled'} title="Усі картки — у беклог; ланцюжки — планами в тому ж порядку, з часом і перервами">УСЕ В БЕКЛОГ →</button>
          </form>
          <div class="canvas" aria-label="Дошка задач">
            <div class="world" style="transform:translate(${v.x}px,${v.y}px) scale(${v.z})">
              <svg class="links" aria-hidden="true"></svg>
              ${onBoard.map((t) => cardHtml(t, times)).join('')}
              <div class="link-labels"></div>
            </div>
            ${!onBoard.length ? '<p class="canvas-empty">Полотно порожнє. Пиши все підряд — великі й дрібні справи, приємні й ті, що відкладаєш.</p>' : ''}
            <div class="zoom-ctl mono">
              <button type="button" data-zoom="-1" title="Віддалити (Ctrl + коліщатко)" aria-label="Віддалити">−</button>
              <button type="button" data-zoom="0" title="Масштаб 100%" class="zoom-val">${Math.round(v.z * 100)}%</button>
              <button type="button" data-zoom="1" title="Наблизити (Ctrl + коліщатко)" aria-label="Наблизити">+</button>
              <button type="button" data-fit title="Показати всі картки">ВСЕ</button>
            </div>
          </div>
        </div>
        <aside class="board-side">
          <div class="side-head"><span class="label">БЕКЛОГ</span><span class="mono muted">${scheduled ? `У РОЗКЛАДІ: ${scheduled}` : ''}</span></div>
          ${backlogHtml()}
        </aside>
      </div>`;
    drawLinks(root);
    bind(root);
  }

  // ---------- Стрілки ----------
  function cardCenter(t) {
    const [x, y] = pos(t);
    return [x + CW / 2, y + CH / 2];
  }
  // точка на краю овалу в напрямку (dx, dy)
  function edge([cx, cy], dx, dy, pad = 8) {
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const k = 1 / Math.sqrt((ux / (RX + pad)) ** 2 + (uy / (RY + pad)) ** 2);
    return [cx + ux * k, cy + uy * k];
  }

  // Усі підписи стрілки — одним блоком посередині, тож вони не налазять один на одного:
  // ★ бонус / [кінець попередньої] [перерва] [початок наступної] ✕
  function drawLinks(root, temp) {
    const canvas = root.querySelector('.canvas');
    const svg = canvas.querySelector('.links');
    const labels = canvas.querySelector('.link-labels');
    const times = LP.taskTimes();
    let s = `<defs>
      <marker id="lh" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 Z" fill="#0a0a0a"/></marker>
      <marker id="lh-bad" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 Z" style="fill:var(--red)"/></marker>
    </defs>`;
    let lab = '';
    const f = (n) => n.toFixed(1);
    LP.data.links.forEach((l) => {
      const a = LP.task(l.from), b = LP.task(l.to);
      if (!a || !b || a.stage !== 'board' || b.stage !== 'board') return;
      const ca = cardCenter(a), cb = cardCenter(b);
      const [x1, y1] = edge(ca, cb[0] - ca[0], cb[1] - ca[1]);
      const [x2, y2] = edge(cb, ca[0] - cb[0], ca[1] - cb[1]);
      const warn = a.mood === 'bad' && b.mood === 'bad';
      s += `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" class="link-line ${warn ? 'warn' : ''}" marker-end="url(#${warn ? 'lh-bad' : 'lh'})"/>`;
      const ta = times.get(a.id), tb = times.get(b.id);
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      const needBreak = a.duration >= LP.BREAK_AFTER;
      const bonus = LP.bonusAllowed(a.mood) && a.bonus;
      lab += `<div class="lt-group" style="left:${f(mx)}px;top:${f(my)}px">
        ${bonus ? `<span class="lt-bonus" title="Бонус за «${u.esc(a.title)}»">★ ${u.esc(a.bonus)}</span>` : ''}
        <span class="lt-row">
          ${ta ? `<span class="lt" title="Кінець «${u.esc(a.title)}»">${u.fmtTime(ta.end)}</span>` : ''}
          <button type="button" class="lt-break ${l.gap ? 'on' : needBreak ? 'suggest' : ''}" data-gap="${l.id}" title="Перерва між задачами — клік змінює: 0 / 5 / 10 / 15 хв">${l.gap ? `☕ ${l.gap} ХВ` : needBreak ? '+ ПЕРЕРВА' : '+'}</button>
          ${tb && l.gap ? `<span class="lt lt-end" title="Початок «${u.esc(b.title)}»">${u.fmtTime(tb.start)}</span>` : ''}
          ${warn ? '<span class="lt-warn" title="Дві важкі задачі підряд — встав між ними приємну">!</span>' : ''}
          <button type="button" class="lt-del" data-unlink="${l.id}" title="Прибрати стрілку" aria-label="Прибрати стрілку">✕</button>
        </span>
      </div>`;
    });
    if (temp) s += `<line x1="${f(temp[0])}" y1="${f(temp[1])}" x2="${f(temp[2])}" y2="${f(temp[3])}" class="link-line temp" marker-end="url(#lh)"/>`;
    svg.innerHTML = s;
    labels.innerHTML = lab;
    labels.querySelectorAll('[data-gap]').forEach((b) =>
      b.addEventListener('click', () => {
        const l = LP.data.links.find((x) => x.id === b.dataset.gap);
        const steps = [0, 5, 10, 15];
        LP.setGap(l.id, steps[(steps.indexOf(l.gap || 0) + 1) % steps.length]);
      })
    );
    labels.querySelectorAll('[data-unlink]').forEach((b) => b.addEventListener('click', () => LP.unlink(b.dataset.unlink)));
  }

  function bind(root) {
    const form = root.querySelector('.composer');
    const canvas = root.querySelector('.canvas');
    const world = canvas.querySelector('.world');
    const v = view();
    const applyView = () => {
      world.style.transform = `translate(${v.x}px,${v.y}px) scale(${v.z})`;
      const z = canvas.querySelector('.zoom-val');
      if (z) z.textContent = Math.round(v.z * 100) + '%';
      canvas.style.backgroundPosition = `${v.x}px ${v.y}px`;
      canvas.style.backgroundSize = `${32 * v.z}px ${32 * v.z}px`;
    };
    applyView();
    // екранні координати → координати полотна
    const toWorld = (cx, cy) => {
      const r = canvas.getBoundingClientRect();
      return [(cx - r.left - v.x) / v.z, (cy - r.top - v.y) / v.z];
    };
    const zoomAt = (z, cx, cy) => {
      const r = canvas.getBoundingClientRect();
      const nz = u.clamp(Math.round(z * 100) / 100, 0.3, 2);
      const px = cx - r.left, py = cy - r.top;
      v.x = px - ((px - v.x) * nz) / v.z;
      v.y = py - ((py - v.y) * nz) / v.z;
      v.z = nz;
      applyView();
    };

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const title = form.title.value.trim();
      if (!title) return form.title.focus();
      // нова картка — у видимій частині полотна
      const r = canvas.getBoundingClientRect();
      const [wx, wy] = toWorld(r.left + r.width / 2, r.top + r.height / 2);
      LP.saveTask({
        title, mood: lastMood, stage: 'board',
        bx: Math.round(wx - CW / 2 + (Math.random() - 0.5) * Math.min(r.width / v.z - CW, 500)),
        by: Math.round(wy - CH / 2 + (Math.random() - 0.5) * Math.min(r.height / v.z - CH, 300)),
      });
      const input = document.querySelector('.composer input[name=title]');
      if (input) input.focus();
    });
    form.querySelectorAll('.mood-btn').forEach((b) =>
      b.addEventListener('click', () => {
        lastMood = b.dataset.mood;
        form.querySelectorAll('.mood-btn').forEach((x) => x.classList.toggle('on', x === b));
        if (form.title.value.trim()) form.requestSubmit();
        else form.title.focus();
      })
    );
    root.querySelector('[data-group]').addEventListener('click', () => groupCards(canvas, toWorld));
    root.querySelector('[data-all-backlog]').addEventListener('click', () => {
      const n = LP.boardToBacklog();
      if (n && LP.toast) LP.toast(`У БЕКЛОЗІ: ${n} · CTRL+Z — ВІДКОТИТИ`);
    });
    root.querySelectorAll('[data-plan-board]').forEach((b) => b.addEventListener('click', () => LP.planToBoard(b.dataset.planBoard)));

    root.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => LP.openTaskForm(LP.task(b.dataset.edit))));
    root.querySelectorAll('[data-to-board]').forEach((b) =>
      b.addEventListener('click', () => {
        const t = LP.task(b.dataset.toBoard);
        t.stage = 'board';
        const r = canvas.getBoundingClientRect();
        const [wx, wy] = toWorld(r.left + 40, r.top + 40);
        t.bx = Math.round(wx);
        t.by = Math.round(wy);
        LP.save();
      })
    );
    root.querySelectorAll('[data-start]').forEach((b) => b.addEventListener('click', () => openStartForm(LP.task(b.dataset.start))));
    root.querySelectorAll('[data-chain]').forEach((b) => b.addEventListener('click', () => openChainForm(b.dataset.chain)));

    // масштаб
    canvas.querySelectorAll('[data-zoom]').forEach((b) =>
      b.addEventListener('click', () => {
        const r = canvas.getBoundingClientRect();
        const k = +b.dataset.zoom;
        zoomAt(k ? v.z * (k > 0 ? 1.2 : 1 / 1.2) : 1, r.left + r.width / 2, r.top + r.height / 2);
      })
    );
    canvas.querySelector('[data-fit]').addEventListener('click', () => fitAll(canvas, v, applyView));
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        zoomAt(v.z * Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
      } else {
        v.x -= e.shiftKey ? e.deltaY : e.deltaX;
        v.y -= e.shiftKey ? 0 : e.deltaY;
        applyView();
      }
    }, { passive: false });

    // рух полотна: тягни порожнє місце
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.button !== 1) return;
      if (e.target.closest('.scard, .lt-group, .zoom-ctl, button')) return;
      e.preventDefault();
      const x0 = e.clientX, y0 = e.clientY, vx = v.x, vy = v.y;
      canvas.classList.add('is-panning');
      const move = (m) => {
        v.x = vx + m.clientX - x0;
        v.y = vy + m.clientY - y0;
        applyView();
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        canvas.classList.remove('is-panning');
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });

    // перетягування карток
    canvas.querySelectorAll('.scard').forEach((card) => {
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') LP.openTaskForm(LP.task(card.dataset.task));
      });
      card.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || e.target.closest('button') || e.target.closest('.connector')) return;
        e.preventDefault();
        e.stopPropagation();
        const t = LP.task(card.dataset.task);
        const [bx0, by0] = pos(t);
        const x0 = e.clientX, y0 = e.clientY;
        let moved = false;
        const move = (m) => {
          if (!moved && Math.hypot(m.clientX - x0, m.clientY - y0) < 4) return;
          moved = true;
          card.classList.add('is-dragging');
          t.bx = Math.round(bx0 + (m.clientX - x0) / v.z);
          t.by = Math.round(by0 + (m.clientY - y0) / v.z);
          card.style.left = t.bx + 'px';
          card.style.top = t.by + 'px';
          drawLinks(root);
        };
        const up = () => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          card.classList.remove('is-dragging');
          if (moved) LP.save({ render: false });
          else LP.openTaskForm(t);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      });
    });

    // зʼєднання: тягни кружечок до іншої картки
    canvas.querySelectorAll('.connector').forEach((c) => {
      c.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        const from = LP.task(c.dataset.connect);
        const [cx, cy] = cardCenter(from);
        const move = (m) => {
          const [x, y] = toWorld(m.clientX, m.clientY);
          const [sx, sy] = edge([cx, cy], x - cx, y - cy);
          drawLinks(root, [sx, sy, x, y]);
        };
        const up = (m) => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          const target = document.elementsFromPoint(m.clientX, m.clientY).map((el) => el.closest && el.closest('.scard')).find((el) => el && el.dataset.task !== from.id);
          if (target) LP.link(from.id, target.dataset.task);
          else drawLinks(root);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      });
    });
  }

  // Показати всі картки: підбираємо масштаб і зсув
  function fitAll(canvas, v, applyView) {
    const list = LP.data.tasks.filter((t) => t.stage === 'board');
    if (!list.length) return;
    const xs = list.map((t) => pos(t)[0]), ys = list.map((t) => pos(t)[1]);
    const minX = Math.min(...xs) - 30, minY = Math.min(...ys) - 40;
    const maxX = Math.max(...xs) + CW + 30, maxY = Math.max(...ys) + CH + 40;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    v.z = u.clamp(Math.floor(Math.min(w / (maxX - minX), h / (maxY - minY), 1.2) * 100) / 100, 0.3, 2);
    v.x = (w - (maxX - minX) * v.z) / 2 - minX * v.z;
    v.y = (h - (maxY - minY) * v.z) / 2 - minY * v.z;
    applyView();
  }

  // Згрупувати: три колонки за типом, у видимій частині полотна
  function groupCards(canvas, toWorld) {
    const r = canvas.getBoundingClientRect();
    const [ox, oy] = toWorld(r.left + 20, r.top + 20);
    ORDER.forEach((m, col) => {
      LP.data.tasks.filter((t) => t.stage === 'board' && t.mood === m).forEach((t, i) => {
        t.bx = Math.round(ox + col * (CW + 90));
        t.by = Math.round(oy + i * (CH + 30));
      });
    });
    LP.save();
  }

  function timeSelect(name, selected) {
    let o = '';
    for (let m = 0; m < 24 * 60; m += 15) o += `<option value="${m}" ${m === selected ? 'selected' : ''}>${u.fmtTime(m)}</option>`;
    return `<select name="${name}">${o}</select>`;
  }

  function openStartForm(task) {
    LP.modal({
      title: 'Початок ланцюжка',
      body: `<label class="field"><span>«${u.esc(task.title)}» починається о</span>${timeSelect('start', task.start != null ? task.start : 9 * 60)}</label>
        <p class="hint">Час наступних задач рахується автоматично: тривалість кожної + перерви на стрілках.</p>`,
      onSubmit: (form) => {
        task.start = parseInt(form.start.value, 10);
        LP.save();
      },
    });
  }

  function openChainForm(headId) {
    const c = LP.chains().find((x) => x.head.id === headId);
    if (!c) return;
    LP.modal({
      title: 'Ланцюжок у розклад',
      submitText: 'У розклад',
      body: `
        <label class="field"><span>На який день</span><input type="date" name="date" value="${u.today()}"></label>
        <ol class="chain-list">${c.items.map((it) => `<li>${LP.moodDot(it.task.mood)}<b>${u.fmtTime(it.start)}—${u.fmtTime(it.end)}</b> ${u.esc(it.task.title)}${it.parts.length > 1 ? ` <span class="mono muted">· ${it.parts.length} частини з перервами</span>` : ''}</li>`).join('')}</ol>
        <p class="hint">Задачі стануть справами в розкладі з тими самими часом, типом і бонусами, а з дошки зникнуть.</p>`,
      onSubmit: (form) => {
        if (!form.date.value) return false;
        LP.chainToWeek(headId, form.date.value);
        LP.toast('Ланцюжок у розкладі');
      },
    });
  }

  LP.views = LP.views || {};
  LP.views.board = { render };
})(window.LP);
