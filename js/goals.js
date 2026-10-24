// Сторінка цілей: компактні картки; клік «підцілі» розгортає деталі й велику картинку.
window.LP = window.LP || {};

(function (LP) {
  const u = LP.u;

  function datesHtml(g) {
    const parts = [];
    if (g.start) parts.push(`СТАРТ ${u.fmtDate(g.start).toUpperCase()}`);
    if (g.deadline) {
      const days = Math.round((u.parse(g.deadline) - u.parse(u.today())) / 86400000);
      const late = days < 0 && LP.goalProgress(g) < 1;
      const hint = days < 0 ? 'ПРОСТРОЧЕНО' : days === 0 ? 'СЬОГОДНІ' : `${days} ДН.`;
      parts.push(`<span class="${late ? 'warn' : ''}">ДО ${u.fmtDate(g.deadline).toUpperCase()} — ${hint}</span>`);
    }
    return parts.join(' · ');
  }

  // Рядок прогресу з кнопками ручної відмітки (для зробленого поза планером)
  function metricRow(g, s, i, totalWeight) {
    const p = s ? LP.subProgress(g, s) : LP.ownProgress(g);
    const kind = s ? s.kind : g.kind;
    const step = kind === 'hours' ? 0.5 : 1;
    const key = `${g.id}|${s ? s.id : ''}`;
    return `
      <li class="sub ${p.ratio >= 1 ? 'is-done' : ''}">
        <span class="num">${s ? String(i + 1).padStart(2, '0') : '—'}</span>
        <span class="sub-name">${s ? u.esc(s.title) : 'Мета цілі'}</span>
        <span class="mono sub-prog">${u.esc(p.label.toUpperCase())}${kind === 'count' ? ' РАЗ' : ''}</span>
        <span class="mono sub-w">${s ? `×${totalWeight ? Math.round((s.weight / totalWeight) * 100) : 0}%` : ''}</span>
        ${LP.progressBar(p.ratio, 'bar-sm')}
        <span class="sub-ctl">${kind === 'once'
          ? `<button type="button" class="once-check ${p.ratio >= 1 ? 'on' : ''}" data-once="${key}" aria-label="${p.ratio >= 1 ? 'Зняти' : 'Позначити зробленим'}"></button>`
          : kind === 'amount'
            ? `<button type="button" class="mini-btn mini-wide" data-entry="${key}" title="Додати суму (можна й мінус)">+ ВНЕСОК</button>`
            : `<button type="button" class="mini-btn" data-bump="${key}|-${step}" aria-label="Мінус">−</button>
          <button type="button" class="mini-btn" data-bump="${key}|${step}" aria-label="Плюс">+</button>`}
        </span>
      </li>`;
  }

  function card(g) {
    const p = LP.goalProgress(g);
    const subs = g.subgoals.filter((s) => s.title);
    const total = subs.reduce((s, x) => s + (Number(x.weight) || 0), 0);
    const open = !!LP.view.openGoals[g.id];
    const problems = LP.validateGoal(g);
    const weekGoals = LP.data.goals.filter((w) => w.level === 'week' && w.parentId === g.id);
    const gt = LP.goalTime(g);
    const spent = gt.minutes ? `<span title="Усі виконані справи, привʼязані до цілі">ВИТРАЧЕНО ${u.fmtHours(gt.minutes).toUpperCase()}</span>` : '';
    const looseHtml = gt.loose.length ? `
      <div class="goal-loose">
        <div class="label">ЗАГАЛОМ ДЛЯ ЦІЛІ — БЕЗ ПІДЦІЛІ</div>
        <ul>${gt.loose.map((it) => `<li><span class="gl-title">${u.esc(it.title)}</span><span class="mono">${it.count > 1 ? '×' + it.count + ' · ' : ''}${u.fmtHours(it.minutes).toUpperCase()}</span><span class="mono muted">${u.fmtDay(it.last).toUpperCase()}</span></li>`).join('')}</ul>
      </div>` : '';
    const summary = subs.length
      ? `ПІДЦІЛІ ${subs.filter((s) => LP.subProgress(g, s).ratio >= 1).length}/${subs.length}`
      : LP.ownProgress(g).label.toUpperCase();
    return `
      <article class="goal ${p >= 1 ? 'is-done' : ''} ${open ? 'is-open' : ''}">
        <header class="goal-head">
          ${g.image ? `<button type="button" class="goal-thumb" data-lightbox="${g.id}" aria-label="Відкрити картинку"><img src="${g.image}" alt=""></button>` : ''}
          <div class="goal-main">
            <div class="mono">${LP.tagHtml(g.tag)} ${datesHtml(g)}</div>
            <button type="button" class="goal-title" data-edit="${g.id}">${u.esc(g.title)}</button>
          </div>
          <div class="goal-pct">${Math.round(p * 100)}<small>%</small></div>
        </header>
        ${LP.progressBar(p)}
        <div class="goal-bar-row mono">
          <button type="button" class="toggle" data-toggle="${g.id}" aria-expanded="${open}">${open ? '▾' : '▸'} ${summary}</button>
          ${spent}
          ${weekGoals.length ? `<span>ЦІЛЕЙ ТИЖНЯ ${weekGoals.filter(LP.weekGoalDone).length}/${weekGoals.length}</span>` : ''}
          ${problems.length ? `<span class="warn">ПОТРЕБУЄ УВАГИ</span>` : ''}
          <button type="button" class="link-btn" data-edit="${g.id}">ЗМІНИТИ</button>
        </div>
        ${open ? `
          <div class="goal-body">
            ${g.description ? `<p class="goal-desc">${u.esc(g.description)}</p>` : ''}
            ${problems.length ? `<p class="warn-note">${problems.map(u.esc).join(' ')} <button type="button" class="link-btn" data-edit="${g.id}">Виправити</button></p>` : ''}
            <ul class="sub-list-view">${subs.length ? subs.map((s, i) => metricRow(g, s, i, total)).join('') : metricRow(g, null, 0, 0)}</ul>
            ${looseHtml}
          </div>` : ''}
      </article>`;
  }

  // Внесок у «своє число»: сума (можна мінус) + нотатка; нижче — історія внесків
  function openEntryForm(g, sid) {
    const t = sid ? LP.subgoal(g, sid) : g;
    const p = sid ? LP.subProgress(g, t) : LP.ownProgress(g);
    const unit = t.unit || '';
    const log = (t.log || []).slice().reverse();
    LP.modal({
      title: sid ? t.title : g.title,
      submitText: 'Додати',
      body: `
        <p class="entry-total mono">${u.esc(p.label.toUpperCase())}${p.target ? ` · ЛИШИЛОСЬ ${LP.fmtNum(Math.max(0, p.target - p.done))}${unit ? ' ' + u.esc(unit.toUpperCase()) : ''}` : ''}</p>
        <div class="row">
          <label class="field field-narrow"><span>Сума${unit ? ', ' + u.esc(unit) : ''}</span><input type="number" name="v" step="any" placeholder="1000" inputmode="decimal"></label>
          <label class="field"><span>Нотатка (необовʼязково)</span><input type="text" name="note" maxlength="80" placeholder="зарплата, повернув борг…"></label>
        </div>
        <p class="hint">Мінус — якщо зняв або витратив.</p>
        ${log.length ? `<div class="entry-log"><span class="label">ІСТОРІЯ</span><ul>${log.map((e) => `
          <li><span class="mono">${u.fmtDay(e.date).toUpperCase()}</span><span class="${e.v < 0 ? 'neg' : ''}">${e.v > 0 ? '+' : ''}${LP.fmtNum(e.v)}${unit ? ' ' + u.esc(unit) : ''}</span><span class="muted">${u.esc(e.note || '')}</span>
          <button type="button" class="icon-btn small" data-del-entry="${e.id}" aria-label="Прибрати внесок">✕</button></li>`).join('')}</ul></div>` : ''}`,
      onOpen: (form) => {
        setTimeout(() => form.v.focus(), 30);
        form.querySelectorAll('[data-del-entry]').forEach((b) => b.addEventListener('click', () => {
          LP.removeEntry(g.id, sid, b.dataset.delEntry);
          openEntryForm(LP.goal(g.id), sid);
        }));
      },
      onSubmit: (form) => {
        const v = parseFloat(String(form.v.value).replace(',', '.'));
        if (!v) return LP.showErrors(form, ['Напиши суму.']), false;
        LP.addEntry(g.id, sid, v, form.note.value.trim());
      },
    });
  }

  function section(title, level, list) {
    return `
      <section class="goal-section">
        <div class="section-head">
          <h2>${title}</h2>
          <span class="mono">${list.length}</span>
          <button type="button" class="btn" data-add="${level}">+ ${level === 'long' ? 'ДОВГОСТРОКОВА' : 'КОРОТКОСТРОКОВА'}</button>
        </div>
        ${list.length ? `<div class="goal-grid">${list.map(card).join('')}</div>` : `<p class="empty-note">Поки порожньо.</p>`}
      </section>`;
  }

  function render(root) {
    const longs = LP.data.goals.filter((g) => g.level === 'long');
    const shorts = LP.data.goals.filter((g) => g.level === 'short');
    root.innerHTML = `
      <div class="page">
        ${!longs.length && !shorts.length ? `
          <div class="intro">
            <p>Ціль — це опис (мінімум ${LP.MIN_DESCRIPTION} символів) і мета: один раз (галочка), скільки разів, годин чи свого числа — гривень, сторінок, кілометрів. Підцілі — за бажанням, кожна зі своєю метою й вагою 1–100.
            Справи в планері, привʼязані до цілі чи підцілі, рухають прогрес.</p>
            <button type="button" class="link-btn" data-sample>Завантажити приклад</button>
          </div>` : ''}
        ${section('ДОВГОСТРОКОВІ', 'long', longs)}
        ${section('КОРОТКОСТРОКОВІ', 'short', shorts)}
      </div>`;

    root.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => LP.openGoalForm(LP.goal(b.dataset.edit))));
    root.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => LP.openGoalForm({ level: b.dataset.add })));
    root.querySelectorAll('[data-toggle]').forEach((b) =>
      b.addEventListener('click', () => {
        const id = b.dataset.toggle;
        LP.view.openGoals[id] = !LP.view.openGoals[id];
        LP.render();
      })
    );
    root.querySelectorAll('[data-lightbox]').forEach((b) => b.addEventListener('click', () => LP.lightbox(LP.goal(b.dataset.lightbox).image)));
    root.querySelectorAll('[data-once]').forEach((b) => b.addEventListener('click', () => {
      const [gid, sid] = b.dataset.once.split('|');
      LP.toggleOnce(gid, sid || null);
    }));
    root.querySelectorAll('[data-entry]').forEach((b) => b.addEventListener('click', () => {
      const [gid, sid] = b.dataset.entry.split('|');
      openEntryForm(LP.goal(gid), sid || null);
    }));
    root.querySelectorAll('[data-bump]').forEach((b) =>
      b.addEventListener('click', () => {
        const [gid, sid, delta] = b.dataset.bump.split('|');
        LP.bump(gid, sid || null, parseFloat(delta));
      })
    );
    const sample = root.querySelector('[data-sample]');
    if (sample) sample.addEventListener('click', () => LP.loadSample());
  }

  LP.views = LP.views || {};
  LP.views.goals = { render };
})(window.LP);
