// Спільні елементи інтерфейсу: модальне вікно, форми, бонус-спалах.
window.LP = window.LP || {};

(function (LP) {
  const u = LP.u;

  // ---------------- Модальне вікно ----------------
  LP.modal = function ({ title, body, submitText = 'Зберегти', onSubmit, extra = [], onOpen, wide = false }) {
    LP.closeModal();
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = `
      <form class="modal ${wide ? 'modal-wide' : ''}" autocomplete="off" novalidate>
        <header class="modal-head">
          <h2>${u.esc(title)}</h2>
          <button type="button" class="icon-btn" data-close aria-label="Закрити">✕</button>
        </header>
        <div class="modal-body">${body}<div class="form-errors" hidden></div></div>
        <footer class="modal-foot">
          <div class="modal-extra"></div>
          <div class="modal-main">
            <button type="button" class="btn" data-close>Скасувати</button>
            <button type="submit" class="btn btn-primary">${u.esc(submitText)}</button>
          </div>
        </footer>
      </form>`;
    const form = wrap.querySelector('form');
    const extraBox = wrap.querySelector('.modal-extra');
    extra.forEach((b) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn ' + (b.className || '');
      btn.textContent = b.text;
      btn.addEventListener('click', () => {
        if (b.onClick(form) !== false) LP.closeModal();
      });
      extraBox.appendChild(btn);
    });
    wrap.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', LP.closeModal));
    wrap.addEventListener('pointerdown', (e) => {
      if (e.target === wrap) LP.closeModal();
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (onSubmit(form) !== false) LP.closeModal();
    });
    document.body.appendChild(wrap);
    if (onOpen) onOpen(form);
    const first = form.querySelector('input[type=text]:not([readonly]), textarea');
    if (first) setTimeout(() => first.focus(), 0);
  };

  // вікно зникає плавно (≈0,16 с), а для решти коду воно закрите одразу
  LP.closeModal = () => document.querySelectorAll('.modal-backdrop:not(.is-leaving)').forEach((m) => {
    m.classList.add('is-leaving');
    m.style.pointerEvents = 'none';
    setTimeout(() => m.remove(), 170);
  });

  LP.showErrors = function (form, errors) {
    const box = form.querySelector('.form-errors');
    if (!errors.length) {
      box.hidden = true;
      return;
    }
    box.innerHTML = errors.map((e) => `<div>— ${u.esc(e)}</div>`).join('');
    box.hidden = false;
    box.scrollIntoView({ block: 'nearest' });
  };

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      LP.closeModal();
      document.querySelectorAll('.celebrate').forEach((c) => c.remove());
    }
  });

  LP.progressBar = function (ratio, cls = '') {
    const p = Math.round(u.clamp(ratio, 0, 1) * 100);
    return `<div class="bar ${cls}" title="${p}%"><div class="bar-fill" style="width:${p}%"></div></div>`;
  };
  LP.tagHtml = (tag) => (tag ? `<span class="tag">[${u.esc(tag)}]</span>` : '');
  LP.moodDot = (mood) => (mood ? `<span class="mood mood-${mood}" title="${LP.MOODS[mood]}"></span>` : '');

  // Перемикач кольору задачі
  LP.moodPicker = function (selected, allowNone = true) {
    const opts = Object.entries(LP.MOODS).map(([k, v]) =>
      `<label class="mood-opt"><input type="radio" name="mood" value="${k}" ${selected === k ? 'checked' : ''}><span><i class="mood mood-${k}"></i>${v}</span></label>`);
    if (allowNone) opts.push(`<label class="mood-opt"><input type="radio" name="mood" value="" ${!selected ? 'checked' : ''}><span>Без типу</span></label>`);
    return `<div class="mood-picker">${opts.join('')}</div>`;
  };

  // Стиснення картинки до ~800 px (щоб влізла в памʼять браузера)
  LP.readImage = function (file, max = 800) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k);
        c.height = Math.round(img.height * k);
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => reject(new Error('Не вдалося відкрити картинку'));
      img.src = url;
    });
  };

  // ---------------- Бонус за виконану задачу ----------------
  LP.celebrate = function (ev) {
    document.querySelectorAll('.celebrate').forEach((c) => c.remove());
    const el = document.createElement('div');
    el.className = 'celebrate';
    el.innerHTML = `
      <div class="celebrate-card" role="dialog" aria-label="Бонус">
        <div class="label">ЗРОБЛЕНО: ${u.esc(ev.title.toUpperCase())}</div>
        <div class="celebrate-title">ТВІЙ БОНУС</div>
        <div class="celebrate-bonus">${u.esc(ev.bonus)}</div>
        <button type="button" class="btn btn-primary">ЗАБРАТИ</button>
      </div>`;
    el.addEventListener('click', (e) => {
      if (e.target === el || e.target.closest('button')) el.remove();
    });
    document.body.appendChild(el);
  };

  // ---------------- Довга / коротка ціль ----------------
  function subRowHtml(s) {
    return `
      <div class="sub-row" data-id="${s.id || ''}" data-extra="${Number(s.extra) || 0}">
        <input type="text" class="sub-title" placeholder="Підціль" value="${u.esc(s.title || '')}" maxlength="100">
        <select class="sub-kind" aria-label="Мірило">
          ${Object.entries(LP.KINDS).map(([k, v]) => `<option value="${k}" ${k === (s.kind || 'count') ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
        <span class="sub-tgt"><input type="number" class="sub-target" min="0" step="any" value="${s.kind === 'once' ? '' : s.target || ''}" aria-label="Мета" placeholder="скільки" ${s.kind === 'once' ? 'hidden' : ''}><input type="text" class="sub-unit" maxlength="10" value="${u.esc(s.unit || '')}" placeholder="грн" aria-label="Одиниця" ${s.kind === 'amount' ? '' : 'hidden'}>${s.kind === 'once' ? '<span class="sub-once mono">✓ ГАЛОЧКА</span>' : ''}</span>
        <input type="number" class="sub-weight" min="1" max="100" value="${s.weight || 10}" aria-label="Вага 1–100">
        <span class="sub-share"></span>
        <button type="button" class="icon-btn sub-del" aria-label="Прибрати підціль">✕</button>
      </div>`;
  }

  LP.openGoalForm = function (goal) {
    if (goal.level === 'week') return LP.openWeekGoalForm(goal);
    const isNew = !goal.id;
    const g = Object.assign({ title: '', tag: '', level: 'long', description: '', start: '', deadline: '', subgoals: [], kind: 'count', target: '', image: null }, goal);
    let image = g.image;

    const body = `
      <div class="seg" role="radiogroup" aria-label="Рівень">
        <label><input type="radio" name="level" value="long" ${g.level === 'long' ? 'checked' : ''}><span>Довгострокова</span></label>
        <label><input type="radio" name="level" value="short" ${g.level === 'short' ? 'checked' : ''}><span>Короткострокова</span></label>
      </div>
      <div class="row">
        <label class="field"><span>Назва</span><input type="text" name="title" maxlength="120" value="${u.esc(g.title)}" placeholder="Наприклад: Пробігти 10 км"></label>
        <label class="field field-tag"><span>Мітка</span><input type="text" name="tag" maxlength="5" value="${u.esc(g.tag)}" placeholder="10К"></label>
      </div>
      <div class="row">
        <label class="field"><span>Старт</span><input type="date" name="start" value="${u.esc(g.start || '')}"></label>
        <label class="field"><span>Дедлайн</span><input type="date" name="deadline" value="${u.esc(g.deadline || '')}"></label>
      </div>
      <label class="field"><span>Опис — навіщо ця ціль і як зрозуміти, що її досягнуто <b class="desc-count"></b></span>
        <textarea name="description" rows="3" placeholder="Мінімум ${LP.MIN_DESCRIPTION} символів">${u.esc(g.description || '')}</textarea></label>
      <div class="field">
        <span>Картинка для мотивації (необовʼязково)</span>
        <div class="img-field">
          <div class="img-preview">${image ? `<img src="${image}" alt="">` : '<span class="muted">немає</span>'}</div>
          <label class="btn file-btn">ОБРАТИ<input type="file" accept="image/*" name="image" hidden></label>
          <button type="button" class="btn img-remove" ${image ? '' : 'hidden'}>ПРИБРАТИ</button>
        </div>
      </div>
      <div class="field own-metric">
        <span>Мета цілі — коли підцілей немає</span>
        <div class="row">
          <label class="field"><select name="kind" aria-label="Мірило">${Object.entries(LP.KINDS).map(([k, v]) => `<option value="${k}" ${k === g.kind ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
          <label class="field field-narrow own-target"><input type="number" name="target" min="0" step="any" value="${g.target || ''}" placeholder="скільки" aria-label="Мета"></label>
          <label class="field field-narrow own-unit"><input type="text" name="unit" maxlength="10" value="${u.esc(g.unit || '')}" placeholder="грн, км, сторінок" aria-label="Одиниця"></label>
        </div>
        <p class="hint">«Один раз» — просто галочка. «Разів» і «годин» — рахують виконані справи, привʼязані до цілі. «Своє число» — для грошей, сторінок, кілометрів: вносиш суми вручну, кнопкою «+ ВНЕСОК» на сторінці цілей.</p>
      </div>
      <div class="field">
        <span>Підцілі — за бажанням <b class="sub-count ok"></b></span>
        <div class="sub-head" ${g.subgoals.length ? '' : 'hidden'}><span>Що зробити</span><span>Мірило</span><span>Мета</span><span>Вага 1–100</span><span>Частка</span><span></span></div>
        <div class="sub-list">${g.subgoals.map(subRowHtml).join('')}</div>
        <button type="button" class="link-btn add-sub">+ Підціль</button>
        <p class="hint">З підцілями прогрес цілі — середнє зважене: вага показує, наскільки підціль важлива.</p>
      </div>`;

    const readSubs = (form) =>
      Array.from(form.querySelectorAll('.sub-row')).map((r) => ({
        id: r.dataset.id || u.uid(),
        title: r.querySelector('.sub-title').value.trim(),
        kind: r.querySelector('.sub-kind').value,
        target: r.querySelector('.sub-kind').value === 'once' ? 1 : parseFloat(r.querySelector('.sub-target').value) || 0,
        unit: r.querySelector('.sub-unit').value.trim(),
        log: ((g.subgoals || []).find((x) => x.id === r.dataset.id) || {}).log || [],
        weight: parseInt(r.querySelector('.sub-weight').value, 10) || 0,
        extra: parseFloat(r.dataset.extra) || 0,
      }));

    const sync = (form) => {
      const len = form.description.value.trim().length;
      const dc = form.querySelector('.desc-count');
      dc.textContent = `${len}/${LP.MIN_DESCRIPTION}`;
      dc.classList.toggle('ok', len >= LP.MIN_DESCRIPTION);
      const rows = form.querySelectorAll('.sub-row');
      const subs = readSubs(form).filter((s) => s.title);
      form.querySelector('.sub-count').textContent = subs.length ? `${subs.length}` : '';
      form.querySelector('.sub-head').hidden = !rows.length;
      form.querySelector('.own-metric').hidden = subs.length > 0;
      const ok = form.kind.value;
      form.querySelector('.own-target').hidden = ok === 'once';
      form.querySelector('.own-unit').hidden = ok !== 'amount';
      rows.forEach((r) => {
        const k = r.querySelector('.sub-kind').value;
        r.querySelector('.sub-target').hidden = k === 'once';
        r.querySelector('.sub-unit').hidden = k !== 'amount';
        let mark = r.querySelector('.sub-once');
        if (k === 'once' && !mark) r.querySelector('.sub-tgt').insertAdjacentHTML('beforeend', '<span class="sub-once mono">✓ ГАЛОЧКА</span>');
        if (k !== 'once' && mark) mark.remove();
      });
      const total = subs.reduce((s, x) => s + x.weight, 0) || 1;
      rows.forEach((r) => {
        const title = r.querySelector('.sub-title').value.trim();
        const w = parseInt(r.querySelector('.sub-weight').value, 10) || 0;
        r.querySelector('.sub-share').textContent = title ? Math.round((w / total) * 100) + '%' : '';
      });
    };

    LP.modal({
      title: isNew ? 'Нова ціль' : 'Ціль',
      body,
      wide: true,
      extra: isNew ? [] : [{
        text: 'Видалити ціль',
        className: 'btn-danger',
        onClick: () => {
          if (!confirm(`Видалити «${g.title}»? Справи в планері залишаться, але відвʼяжуться від цілі.`)) return false;
          LP.deleteGoal(g.id);
        },
      }],
      onOpen: (form) => {
        let tagTouched = !!g.tag;
        form.tag.addEventListener('input', () => (tagTouched = true));
        form.title.addEventListener('input', () => {
          if (!tagTouched) form.tag.value = LP.makeTag(form.title.value);
        });
        form.addEventListener('input', () => sync(form));
        form.addEventListener('change', () => sync(form));
        form.querySelector('.add-sub').addEventListener('click', () => {
          form.querySelector('.sub-list').insertAdjacentHTML('beforeend', subRowHtml({ kind: 'once', weight: 10 }));
          sync(form);
          const rows = form.querySelectorAll('.sub-title');
          rows[rows.length - 1].focus();
        });
        form.querySelector('.sub-list').addEventListener('click', (e) => {
          const del = e.target.closest('.sub-del');
          if (!del) return;
          del.closest('.sub-row').remove();
          sync(form);
        });
        const preview = form.querySelector('.img-preview');
        const removeBtn = form.querySelector('.img-remove');
        form.image.addEventListener('change', async () => {
          const f = form.image.files[0];
          if (!f) return;
          try {
            image = await LP.readImage(f);
            preview.innerHTML = `<img src="${image}" alt="">`;
            removeBtn.hidden = false;
          } catch (err) {
            LP.showErrors(form, [err.message]);
          }
        });
        removeBtn.addEventListener('click', () => {
          image = null;
          preview.innerHTML = '<span class="muted">немає</span>';
          removeBtn.hidden = true;
        });
        sync(form);
      },
      onSubmit: (form) => {
        const fields = {
          id: g.id,
          level: form.querySelector('input[name=level]:checked').value,
          title: form.title.value.trim(),
          tag: (form.tag.value.trim() || LP.makeTag(form.title.value)).toUpperCase(),
          start: form.start.value || null,
          deadline: form.deadline.value || null,
          description: form.description.value.trim(),
          kind: form.kind.value,
          target: form.kind.value === 'once' ? 1 : parseFloat(form.target.value) || 0,
          unit: form.unit.value.trim(),
          subgoals: readSubs(form).filter((s) => s.title),
          image,
        };
        const errors = LP.validateGoal(fields);
        LP.showErrors(form, errors);
        if (errors.length) return false;
        LP.saveGoal(fields);
      },
    });
  };

  // ---------------- Ціль тижня ----------------
  LP.openWeekGoalForm = function (goal) {
    const isNew = !goal.id;
    const g = Object.assign({ title: '', parentId: null, week: LP.view.weekStart, done: false }, goal);
    const ev = g.eventId ? LP.event(g.eventId) : null;
    LP.modal({
      title: isNew ? 'Ціль на тиждень' : 'Ціль тижня',
      body: `
        <label class="field"><span>Що хочу зробити цього тижня</span>
          <input type="text" name="title" maxlength="120" value="${u.esc(g.title)}" placeholder="Наприклад: три пробіжки"></label>
        <div class="row">
          <label class="field"><span>Стосується цілі (необовʼязково)</span>
            <select name="parentId"><option value="">— ні —</option>
              ${LP.bigGoals().map((o) => `<option value="${o.id}" ${o.id === g.parentId ? 'selected' : ''}>[${u.esc(o.tag)}] ${u.esc(o.title)}</option>`).join('')}
            </select></label>
          ${ev ? '' : `<label class="field field-date"><span>Тиждень</span><input type="date" name="week" value="${g.week}"></label>`}
        </div>
        ${ev
          ? `<p class="hint">Ціль з часом: привʼязана до справи «${u.esc(ev.title)}» ${u.fmtDay(g.eventDate)}, ${u.fmtTime(ev.start)}. Виконана — коли виконана справа.</p>`
          : `<label class="check"><input type="checkbox" name="done" ${g.done ? 'checked' : ''}> Виконано</label>
             <p class="hint">Це ціль без часу — відмічаєш вручну. Щоб ціль мала час, створи її з розкладу: у справі постав галочку «Ціль тижня».</p>`}`,
      extra: isNew ? [] : [{ text: 'Видалити', className: 'btn-danger', onClick: () => LP.deleteGoal(g.id) }],
      onSubmit: (form) => {
        const title = form.title.value.trim();
        if (!title) {
          LP.showErrors(form, ['Напиши, що хочеш зробити.']);
          return false;
        }
        const fields = { id: g.id, level: 'week', title, parentId: form.parentId.value || null };
        if (!ev) {
          fields.week = u.weekStart(form.week.value || LP.view.weekStart);
          fields.done = form.done.checked;
        }
        LP.saveGoal(fields);
      },
    });
  };

  // ---------------- Звичка ----------------
  LP.openHabitForm = function (habit) {
    const isNew = !habit.id;
    const h = Object.assign({ title: '', perWeek: 7, timed: false }, habit);
    LP.modal({
      title: isNew ? 'Нова звичка' : 'Звичка',
      body: `
        <div class="row">
          <label class="field"><span>Звичка</span><input type="text" name="title" maxlength="100" value="${u.esc(h.title)}" placeholder="Наприклад: йога"></label>
          <label class="field field-narrow"><span>Разів на тиждень</span><input type="number" name="perWeek" min="1" max="7" value="${h.perWeek}"></label>
        </div>
        <div class="seg" role="radiogroup" aria-label="Тип звички">
          <label><input type="radio" name="timed" value="0" ${!h.timed ? 'checked' : ''}><span>Без часу — відмічаю вручну</span></label>
          <label><input type="radio" name="timed" value="1" ${h.timed ? 'checked' : ''}><span>З часом — тільки через розклад</span></label>
        </div>
        <p class="hint">Звичка з часом зараховується лише тоді, коли ти поставив її в розклад як справу і позначив виконаною. Звичку без часу відмічаєш кліком по клітинці дня.</p>`,
      extra: isNew ? [] : [{
        text: 'Видалити',
        className: 'btn-danger',
        onClick: () => {
          if (!confirm(`Видалити звичку «${h.title}» разом з історією відміток?`)) return false;
          LP.deleteHabit(h.id);
        },
      }],
      onSubmit: (form) => {
        const title = form.title.value.trim();
        if (!title) {
          LP.showErrors(form, ['Назви звичку.']);
          return false;
        }
        LP.saveHabit({
          id: h.id, title,
          perWeek: u.clamp(parseInt(form.perWeek.value, 10) || 7, 1, 7),
          timed: form.querySelector('input[name=timed]:checked').value === '1',
        });
      },
    });
  };

  // ---------------- Задача (дошка / беклог) ----------------
  LP.goalLinkFields = function (goalId, subgoalId) {
    return `
      <div class="row">
        <label class="field"><span>До якої цілі веде (необовʼязково)</span>
          <select name="goalId"><option value="">— без цілі —</option>
            ${LP.bigGoals().map((g) => `<option value="${g.id}" ${g.id === goalId ? 'selected' : ''}>[${u.esc(g.tag)}] ${u.esc(g.title)}</option>`).join('')}
          </select></label>
        <label class="field field-sub"><span>Підціль</span><div class="sub-slot" data-selected="${subgoalId || ''}"></div></label>
      </div>`;
  };
  LP.syncGoalLink = function (form) {
    const g = LP.goal(form.goalId.value);
    const slot = form.querySelector('.sub-slot');
    const current = form.subgoalId ? form.subgoalId.value : slot.dataset.selected;
    const subs = g ? g.subgoals.filter((s) => s.title) : [];
    slot.innerHTML = subs.length
      ? `<select name="subgoalId"><option value="">— обери підціль —</option>${subs.map((s) =>
          `<option value="${s.id}" ${s.id === current ? 'selected' : ''}>${u.esc(s.title)} · ${u.esc(LP.subProgress(g, s).label)}</option>`).join('')}</select>`
      : '';
    form.querySelector('.field-sub').hidden = !subs.length;
  };

  // Поле бонусу залежить від кольору задачі: приємна — без бонусу, нейтральна — за бажанням, важка — обовʼязково
  LP.syncBonusField = function (form) {
    const checked = form.querySelector('input[name=mood]:checked');
    const mood = checked ? checked.value : '';
    const field = form.querySelector('.field-bonus');
    field.hidden = !LP.bonusAllowed(mood);
    field.classList.toggle('required', LP.bonusRequired(mood));
    field.querySelector('span').textContent = LP.bonusRequired(mood)
      ? 'Бонус після виконання — обовʼязково для важкої'
      : 'Бонус після виконання — за бажанням';
  };
  LP.bonusField = (value) => `
    <label class="field field-bonus"><span>Бонус після виконання</span>
      <input type="text" name="bonus" maxlength="120" value="${u.esc(value || '')}" placeholder="Наприклад: кава в улюбленому місці"></label>`;

  LP.openTaskForm = function (task, { toBacklog = false } = {}) {
    const t = Object.assign({ title: '', mood: 'mid', duration: 60, bonus: '', note: '', goalId: null, subgoalId: null, stage: 'board' }, task);
    const onBoard = t.stage === 'board';
    const durOpts = [15, 30, 45, 60, 90, 120, 180, 240].map((m) => `<option value="${m}" ${m === t.duration ? 'selected' : ''}>${u.fmtHours(m)}</option>`).join('');

    const collect = (form, stage) => {
      const mood = form.querySelector('input[name=mood]:checked').value;
      const bonus = LP.bonusAllowed(mood) ? form.bonus.value.trim() : '';
      const errors = [];
      if (!form.title.value.trim()) errors.push('Назви задачу.');
      if (LP.bonusRequired(mood) && !bonus) errors.push('Для важкої задачі придумай бонус — що отримаєш після виконання.');
      if (form.subgoalId && !form.subgoalId.value) errors.push('Обери підціль.');
      LP.showErrors(form, errors);
      if (errors.length) return false;
      LP.saveTask({
        id: t.id,
        title: form.title.value.trim(),
        mood,
        bonus,
        goalId: form.goalId.value || null,
        subgoalId: form.subgoalId ? form.subgoalId.value || null : null,
        duration: parseInt(form.duration.value, 10),
        split: form.split.checked,
        note: form.note.value.trim(),
        stage,
      });
    };

    const extra = [];
    if (t.id) extra.push({ text: 'Видалити', className: 'btn-danger', onClick: () => LP.deleteTask(t.id) });
    if (onBoard && !toBacklog) extra.push({ text: 'В беклог →', className: 'btn-primary', onClick: (form) => collect(form, 'backlog') });

    LP.modal({
      title: toBacklog ? 'В беклог' : 'Задача',
      submitText: toBacklog ? 'В беклог' : 'Зберегти',
      body: `
        <label class="field"><span>Задача</span><input type="text" name="title" maxlength="120" value="${u.esc(t.title)}"></label>
        <div class="field"><span>Як тобі ця задача</span>${LP.moodPicker(t.mood, false)}</div>
        ${LP.bonusField(t.bonus)}
        ${LP.goalLinkFields(t.goalId, t.subgoalId)}
        <div class="row">
          <label class="field field-narrow"><span>Скільки часу</span><select name="duration">${durOpts}</select></label>
          <label class="field"><span>Контекст</span><input type="text" name="note" maxlength="200" value="${u.esc(t.note || '')}" placeholder="Що саме, де, з ким, що потрібно"></label>
        </div>
        <label class="check split-check"><input type="checkbox" name="split" ${t.split !== false ? 'checked' : ''}> Ділити на частини по 30–60 хв з перервами <span class="mono muted split-hint"></span></label>`,
      extra,
      onOpen: (form) => {
        const syncSplit = () => {
          const d = parseInt(form.duration.value, 10);
          const parts = LP.splitDuration(d);
          form.querySelector('.split-check').hidden = parts.length < 2;
          form.querySelector('.split-hint').textContent = parts.length > 1 ? `→ ${parts.map((p) => p + ' хв').join(' + ')}, між ними ${LP.SPLIT_BREAK} хв перерви` : '';
        };
        syncSplit();
        form.addEventListener('change', () => { LP.syncBonusField(form); syncSplit(); });
        form.goalId.addEventListener('change', () => LP.syncGoalLink(form));
        LP.syncGoalLink(form);
        LP.syncBonusField(form);
      },
      onSubmit: (form) => collect(form, toBacklog ? 'backlog' : t.stage || 'board'),
    });
  };

  // ---------------- Картинка на весь екран ----------------
  LP.lightbox = function (src) {
    const el = document.createElement('div');
    el.className = 'lightbox';
    el.innerHTML = `<img src="${src}" alt=""><button type="button" class="icon-btn" aria-label="Закрити">✕</button>`;
    el.addEventListener('click', () => el.remove());
    document.body.appendChild(el);
  };

  // ---------------- Підказка внизу екрана ----------------
  LP.toast = function (text) {
    document.querySelectorAll('.toast').forEach((t) => t.remove());
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1800);
  };

  // ---------------- Текст із виділеннями маркером ----------------
  LP.markedHtml = function (text, marks) {
    text = text || '';
    let out = '', pos = 0;
    (marks || []).forEach(([a, b], i) => {
      if (a < pos || a >= text.length) return;
      out += u.esc(text.slice(pos, a)) + `<mark data-mark="${i}">${u.esc(text.slice(a, b))}</mark>`;
      pos = b;
    });
    return out + u.esc(text.slice(pos));
  };

  // ---------------- Читання запису щоденника з маркером ----------------
  // Маркер: виділи мишкою слово чи фразу — вона підсвітиться й збережеться. Гумка: клік по виділеному — прибрати.
  LP.readJournal = function (date) {
    const e = LP.journal(date);
    if (!e) return;
    let tool = 'marker';
    const box = document.createElement('div');
    box.className = 'modal-backdrop';
    const paint = () => {
      const j = LP.journal(date);
      box.innerHTML = `
        <div class="modal modal-wide reader" role="dialog" aria-modal="true">
          <div class="modal-head">
            <h2>${u.DAYS_LONG[u.weekday(date)]}, ${u.fmtDate(date)}</h2>
            <button type="button" class="icon-btn" data-close aria-label="Закрити">✕</button>
          </div>
          <div class="reader-tools">
            <button type="button" class="tool ${tool === 'marker' ? 'on' : ''}" data-tool="marker"><i class="tool-swatch"></i>МАРКЕР</button>
            <button type="button" class="tool ${tool === 'eraser' ? 'on' : ''}" data-tool="eraser">ГУМКА</button>
            <span class="mono muted">${tool === 'marker' ? 'Виділи мишкою слово чи фразу — вона залишиться підсвіченою' : 'Клікни по виділеному, щоб прибрати'}</span>
          </div>
          <div class="reader-body tool-${tool}">
            <div class="jc-head">${j.score ? `<b>${j.score}</b><small>/10</small>` : ''}${j.state ? `<span>${u.esc(j.state)}</span>` : ''}</div>
            ${j.note ? `<div class="reader-text" data-field="note">${LP.markedHtml(j.note, j.marks && j.marks.note)}</div>` : '<p class="muted">Нотаток немає.</p>'}
            ${j.gratitude ? `<div class="mono muted reader-label">ВДЯЧНИЙ ЗА</div><div class="reader-text" data-field="gratitude">${LP.markedHtml(j.gratitude, j.marks && j.marks.gratitude)}</div>` : ''}
            ${marksList(j)}
          </div>
          <div class="modal-foot"><div class="modal-main">
            ${date === u.today() ? '<button type="button" class="btn" data-edit>ЗМІНИТИ ЗАПИС</button>' : ''}
            <button type="button" class="btn btn-primary" data-close>ГОТОВО</button>
          </div></div>
        </div>`;
    };
    const marksList = (j) => {
      const items = [];
      ['note', 'gratitude'].forEach((k) => ((j.marks && j.marks[k]) || []).forEach(([a, b]) => items.push(j[k].slice(a, b))));
      return items.length ? `<div class="reader-marks"><div class="mono muted reader-label">ВИДІЛЕНЕ</div><ul>${items.map((t) => `<li>${u.esc(t)}</li>`).join('')}</ul></div>` : '';
    };
    const close = () => {
      box.remove();
      document.removeEventListener('keydown', onKey);
      LP.render();
    };
    const onKey = (ev) => ev.key === 'Escape' && close();
    // зсув виділення від початку поля (враховуючи вже підсвічені шматки)
    const offset = (field, node, off) => {
      const r = document.createRange();
      r.setStart(field, 0);
      r.setEnd(node, off);
      return r.toString().length;
    };
    box.addEventListener('mouseup', () => {
      if (tool !== 'marker') return;
      const sel = window.getSelection();
      if (!sel.rangeCount || sel.isCollapsed) return;
      const range = sel.getRangeAt(0);
      const field = range.commonAncestorContainer.nodeType === 1 && range.commonAncestorContainer.closest
        ? range.commonAncestorContainer.closest('[data-field]')
        : range.commonAncestorContainer.parentElement.closest('[data-field]');
      if (!field) return;
      let a = offset(field, range.startContainer, range.startOffset);
      let b = offset(field, range.endContainer, range.endOffset);
      const text = LP.journal(date)[field.dataset.field];
      while (a < b && /\s/.test(text[a])) a++;
      while (b > a && /\s/.test(text[b - 1])) b--;
      sel.removeAllRanges();
      if (b > a) {
        LP.markJournal(date, field.dataset.field, a, b);
        paint();
      }
    });
    box.addEventListener('click', (ev) => {
      if (ev.target === box || ev.target.closest('[data-close]')) return close();
      const t = ev.target.closest('[data-tool]');
      if (t) {
        tool = t.dataset.tool;
        return paint();
      }
      if (ev.target.closest('[data-edit]')) {
        box.remove();
        document.removeEventListener('keydown', onKey);
        return LP.openJournal(date);
      }
      const m = ev.target.closest('mark');
      if (m && tool === 'eraser') {
        LP.unmarkJournal(date, m.closest('[data-field]').dataset.field, +m.dataset.mark);
        paint();
      }
    });
    document.addEventListener('keydown', onKey);
    paint();
    document.body.appendChild(box);
  };

  // ---------------- Щоденник дня ----------------
  // Щоденник пишеться лише за сьогодні; минулі дні — тільки для читання
  LP.openJournal = function (date) {
    if (date !== u.today()) {
      if (LP.journal(date)) LP.readJournal(date);
      return;
    }
    const e = Object.assign({ state: '', score: 0, note: '', gratitude: '' }, LP.journal(date));
    let scores = '';
    for (let k = 1; k <= 10; k++) scores += `<label class="score-opt"><input type="radio" name="score" value="${k}" ${e.score === k ? 'checked' : ''}><span>${k}</span></label>`;
    LP.modal({
      title: `${u.DAYS_LONG[u.weekday(date)]}, ${u.fmtDay(date)}`,
      body: `
        <label class="field"><span>Як ти зараз</span>
          <input type="text" name="state" maxlength="40" value="${u.esc(e.state)}" placeholder="Своїми словами"></label>
        <div class="field"><span>Оцінка стану 1–10</span><div class="score-row">${scores}</div></div>
        <label class="field"><span>Нотатки</span><textarea name="note" rows="5">${u.esc(e.note)}</textarea></label>
        <label class="field"><span>Вдячний за</span><input type="text" name="gratitude" maxlength="200" value="${u.esc(e.gratitude)}"></label>`,
      extra: LP.journal(date) ? [{ text: 'Очистити', className: 'btn-danger', onClick: () => LP.saveJournal(date, {}) }] : [],
      onSubmit: (form) => {
        const score = form.querySelector('input[name=score]:checked');
        LP.saveJournal(date, {
          state: form.state.value.trim(),
          score: score ? parseInt(score.value, 10) : 0,
          note: form.note.value.trim(),
          gratitude: form.gratitude.value.trim(),
        });
      },
    });
  };

  // ---------------- Людина ----------------
  LP.openPersonForm = function (person) {
    const isNew = !person.id;
    const p = Object.assign({ name: '', note: '', x: 0.5, y: 0.5, ok: true }, person);
    LP.modal({
      title: isNew ? 'Людина' : p.name,
      body: `
        <label class="field"><span>Імʼя</span><input type="text" name="name" maxlength="40" value="${u.esc(p.name)}"></label>
        <div class="seg" role="radiogroup" aria-label="Чи все ок">
          <label><input type="radio" name="ok" value="1" ${p.ok ? 'checked' : ''}><span>Мені ок, як є</span></label>
          <label><input type="radio" name="ok" value="0" ${!p.ok ? 'checked' : ''}><span>Хочу щось змінити</span></label>
        </div>
        <p class="hint">Якщо хочеш змінити — імʼя на карті буде в рамці, а зі точки виходить стрілка. Перетягни її кінець туди, куди хочеш, щоб рухались стосунки.</p>
        <label class="field"><span>Нотатка</span><input type="text" name="note" maxlength="120" value="${u.esc(p.note || '')}" placeholder="Напр. хочу бачитися частіше"></label>`,
      extra: isNew ? [] : [{
        text: 'Видалити',
        className: 'btn-danger',
        onClick: () => {
          if (!confirm(`Прибрати ${p.name} з карти й обсерваторії?`)) return false;
          LP.deletePerson(p.id);
        },
      }],
      onSubmit: (form) => {
        const name = form.name.value.trim();
        if (!name) {
          LP.showErrors(form, ['Вкажи імʼя.']);
          return false;
        }
        const ok = form.querySelector('input[name=ok]:checked').value === '1';
        const fields = { id: p.id, name, note: form.note.value.trim(), ok };
        if (!ok && p.tx == null) {
          fields.tx = u.clamp(p.x - 0.2, 0.05, 0.95);
          fields.ty = u.clamp(p.y + 0.1, 0.05, 0.95);
        }
        LP.savePerson(fields);
      },
    });
  };
})(window.LP);
