// Точка входу: шапка, вкладки, тижні, експорт/імпорт, налаштування (кольори й фон).
window.LP = window.LP || {};

(function (LP) {
  const u = LP.u;
  const main = document.getElementById('main');
  const TITLES = { board: 'ДЕНЬ', year: 'РІК', goals: 'ЦІЛІ', habits: 'ЗВИЧКИ', balance: 'БАЛАНС' };

  // основний колір
  let accentNow = null;
  function applyAccent() {
    const a = LP.ACCENTS[LP.data.settings.accent] || LP.ACCENTS.red;
    if (accentNow === a.c) return;
    accentNow = a.c;
    const root = document.documentElement.style;
    root.setProperty('--bad', a.c);
    root.setProperty('--on-accent', a.on);
    // свої курсори: чорний / білий / основний колір — з контуром, щоб було видно на будь-якому фоні
    const cur = (svg, x, y, fb) => `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${x} ${y}, ${fb}`;
    const w = (inner) => `<svg xmlns='http://www.w3.org/2000/svg' width='26' height='26' viewBox='0 0 26 26'>${inner}</svg>`;
    const arrow = 'M3,2 L3,19.5 L7.6,15.4 L10.6,22.4 L13.8,21 L10.9,14.3 L16.8,14.3 Z';
    root.setProperty('--c-arrow', cur(w(`<path d='${arrow}' fill='#0a0a0a' stroke='#fff' stroke-width='1.6' stroke-linejoin='round'/>`), 3, 2, 'default'));
    root.setProperty('--c-pointer', cur(w(`<path d='${arrow}' fill='${a.c}' stroke='#0a0a0a' stroke-width='1.6' stroke-linejoin='round'/>`), 3, 2, 'pointer'));
    root.setProperty('--c-grab', cur(w(`<circle cx='13' cy='13' r='8' fill='#fff' stroke='#0a0a0a' stroke-width='2.2'/><circle cx='13' cy='13' r='2.6' fill='${a.c}'/>`), 13, 13, 'grab'));
    root.setProperty('--c-grabbing', cur(w(`<circle cx='13' cy='13' r='7' fill='#0a0a0a' stroke='${a.c}' stroke-width='3'/><circle cx='13' cy='13' r='10.5' fill='none' stroke='#fff' stroke-width='1.2'/>`), 13, 13, 'grabbing'));
    root.setProperty('--c-cross', cur(w(`<path d='M13,2 V24 M2,13 H24' stroke='#fff' stroke-width='4.5'/><path d='M13,2 V24 M2,13 H24' stroke='#0a0a0a' stroke-width='2'/><circle cx='13' cy='13' r='3' fill='${a.c}' stroke='#0a0a0a' stroke-width='1'/>`), 13, 13, 'crosshair'));
    root.setProperty('--c-text', cur(`<svg xmlns='http://www.w3.org/2000/svg' width='20' height='26' viewBox='0 0 20 26'><path d='M6,3 H14 M10,3 V23 M6,23 H14' stroke='#fff' stroke-width='4.2' stroke-linecap='square'/><path d='M6,3 H14 M10,3 V23 M6,23 H14' stroke='#0a0a0a' stroke-width='1.8' stroke-linecap='square'/><rect x='8.6' y='11.5' width='2.8' height='3' fill='${a.c}'/></svg>`, 10, 13, 'text'));
    root.setProperty('--c-resize', cur(w(`<path d='M13,2 L18,8 H15 V18 H18 L13,24 L8,18 H11 V8 H8 Z' fill='#0a0a0a' stroke='#fff' stroke-width='1.4' stroke-linejoin='round'/>`), 13, 13, 'ns-resize'));
  }

  function weekTitle(ws) {
    const a = u.parse(ws), b = u.parse(u.addDays(ws, 6));
    const dd = (d) => String(d.getDate()).padStart(2, '0');
    const mm = (d) => String(d.getMonth() + 1).padStart(2, '0');
    return a.getMonth() === b.getMonth() ? `${dd(a)}—${dd(b)}.${mm(b)}` : `${dd(a)}.${mm(a)}—${dd(b)}.${mm(b)}`;
  }

  // Плавність: перед перемальовуванням запамʼятовуємо, де стояли справи й картки,
  // після — нові плавно доїжджають на місце, нові зʼявляються, прибрані тануть.
  const FLIP_SEL = '.cal-col .ev, .wg-card, .bl-item, .scard, .bl-row, .reward, .nn-row';
  const keyOf = (el) => {
    if (el.classList.contains('ev')) return 'ev' + el.dataset.id + el.dataset.date + (el.dataset.seg || '');
    if (el.classList.contains('wg-card')) return 'wg' + el.dataset.wgid;
    if (el.classList.contains('bl-item')) return 'bl' + el.dataset.task;
    if (el.classList.contains('scard')) return 'sc' + el.dataset.task;
    if (el.classList.contains('bl-row')) { const b = el.querySelector('[data-edit]'); return b ? 'br' + b.dataset.edit : null; }
    if (el.classList.contains('reward')) { const b = el.querySelector('[data-use-reward]'); return b ? 'rw' + b.dataset.useReward : null; }
    if (el.classList.contains('nn-row')) return 'nn' + (el.dataset.nn || el.textContent.slice(0, 12));
    return null;
  };
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let lastTab = null, lastWs = null;
  function flip(run) {
    const main = document.getElementById('main');
    const sameTab = lastTab === LP.view.tab && lastWs === LP.view.weekStart;
    if (reduced() || !main.animate) return run();
    const before = new Map();
    if (sameTab) main.querySelectorAll(FLIP_SEL).forEach((el) => {
      const k = keyOf(el);
      if (k) before.set(k, { r: el.getBoundingClientRect(), el });
    });
    run();
    if (!sameTab) {
      main.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.2,.7,.2,1)' });
      return;
    }
    const seen = new Set();
    main.querySelectorAll(FLIP_SEL).forEach((el) => {
      const k = keyOf(el);
      if (!k) return;
      seen.add(k);
      const old = before.get(k);
      const r = el.getBoundingClientRect();
      if (!old) {
        if (before.size) el.animate([{ opacity: 0, transform: 'scale(0.97)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.2,.7,.2,1)' });
        return;
      }
      const dx = old.r.left - r.left, dy = old.r.top - r.top;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2,.7,.2,1)' });
      }
    });
    // прибране — тане на старому місці
    before.forEach((v, k) => {
      if (seen.has(k) || !v.r.width) return;
      const ghost = v.el.cloneNode(true);
      Object.assign(ghost.style, { position: 'fixed', left: v.r.left + 'px', top: v.r.top + 'px', width: v.r.width + 'px', height: v.r.height + 'px', margin: 0, pointerEvents: 'none', zIndex: 50 });
      document.body.appendChild(ghost);
      ghost.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.96)' }], { duration: 200, easing: 'ease-out' }).onfinish = () => ghost.remove();
    });
  }

  LP.render = function () {
    flip(renderNow);
    lastTab = LP.view.tab;
    lastWs = LP.view.weekStart;
  };
  function renderNow() {
    applyAccent();
    document.body.classList.toggle('no-grain', LP.data.settings.grain === false);
    if (LP.view.tab === 'habits') LP.view.tab = 'stats';
    const tab = LP.view.tab;
    document.querySelectorAll('.mast-nav [data-tab]').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === tab));
    const weekish = tab === 'week' || tab === 'stats';
    document.getElementById('page-title').textContent = weekish ? weekTitle(LP.view.weekStart) : TITLES[tab];
    document.getElementById('week-ctrl').hidden = !weekish;
    document.getElementById('btn-today').disabled = LP.view.weekStart === u.weekStart(u.today());
    const ws = LP.view.weekStart;
    document.getElementById('mast-issue').textContent = `КНИГА ${u.parse(u.addDays(ws, 3)).getFullYear()} — РОЗДІЛ ${u.isoWeek(ws)}`;
    document.body.dataset.view = tab;
    LP.views[tab].render(main);
  }

  document.querySelectorAll('.mast-nav [data-tab]').forEach((b) =>
    b.addEventListener('click', () => {
      if (LP.view.tab !== b.dataset.tab) { main.scrollTop = 0; window.scrollTo(0, 0); }
      LP.view.tab = b.dataset.tab;
      try { localStorage.setItem('life-planner.tab', LP.view.tab); } catch (e) {}
      LP.render();
    })
  );
  try {
    const t = localStorage.getItem('life-planner.tab');
    if (t && LP.views[t]) LP.view.tab = t === 'habits' ? 'week' : t;
  } catch (e) {}

  const shiftWeek = (n) => {
    LP.view.weekStart = u.addDays(LP.view.weekStart, 7 * n);
    LP.render();
  };
  document.getElementById('btn-prev').addEventListener('click', () => shiftWeek(-1));
  document.getElementById('btn-next').addEventListener('click', () => shiftWeek(1));
  document.getElementById('btn-today').addEventListener('click', () => {
    LP.view.weekStart = u.weekStart(u.today());
    LP.render();
  });
  // Ctrl+Z — відкотити, Ctrl+Shift+Z або Ctrl+Y — повернути (за кодом клавіші, тож працює і в українській розкладці)
  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    if (e.code !== 'KeyZ' && e.code !== 'KeyY') return;
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return; // у полях — звичайний відкат тексту
    if (document.querySelector('.modal-backdrop:not(.is-leaving)')) return;
    e.preventDefault();
    const redo = e.code === 'KeyY' || e.shiftKey;
    const ok = redo ? LP.redo() : LP.undo();
    LP.toast(ok ? (redo ? 'ПОВЕРНУТО ↷' : 'ВІДКОТИВ ↶') : redo ? 'НЕМАЄ ЩО ПОВЕРТАТИ' : 'НЕМАЄ ЩО ВІДКОЧУВАТИ');
  });

  document.addEventListener('keydown', (e) => {
    if (document.querySelector('.modal-backdrop:not(.is-leaving)')) return;
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    if (LP.view.tab !== 'week' && LP.view.tab !== 'stats') return;
    if (e.key === 'ArrowLeft') shiftWeek(-1);
    if (e.key === 'ArrowRight') shiftWeek(1);
  });

  // календар: клік по «Книга … — Розділ …» або по датах тижня
  const title = document.getElementById('page-title');
  title.addEventListener('click', () => {
    if (LP.view.tab === 'week' || LP.view.tab === 'stats') LP.openCalendar(title);
  });
  const helpBtn = document.getElementById('btn-help');
  helpBtn.addEventListener('click', () => LP.openPageHelp(LP.view.tab, helpBtn));
  const radioBtn = document.getElementById('btn-radio');
  radioBtn.addEventListener('click', () => LP.openRadio(radioBtn));

  document.getElementById('btn-export').addEventListener('click', () => {
    if (!LP.embedded) return LP.storage.exportFile(LP.data);
    // на сторінці за посиланням файли не завантажуються — показуємо дані текстом, щоб скопіювати
    const json = JSON.stringify(LP.data);
    LP.modal({
      title: 'Експорт',
      submitText: 'Закрити',
      body: `<p class="hint">Тут файл не завантажується. Скопіюй текст нижче й збережи його в нотатках чи надішли собі — це повна копія твоїх даних.</p>
        <textarea name="dump" rows="8" readonly>${u.esc(json)}</textarea>
        <button type="button" class="btn" data-copy>КОПІЮВАТИ</button>
        <p class="hint">Щоб перенести дані сюди з компʼютера: там — «Експорт», тут — «Імпорт» і вибери збережений файл або встав текст:</p>
        <textarea name="paste" rows="3" placeholder="Встав сюди скопійований текст експорту"></textarea>
        <button type="button" class="btn" data-paste>ІМПОРТУВАТИ З ТЕКСТУ</button>`,
      onOpen: (form) => {
        form.querySelector('[data-copy]').addEventListener('click', () => {
          const done = () => LP.toast('СКОПІЙОВАНО');
          navigator.clipboard && navigator.clipboard.writeText(json).then(done).catch(() => { form.dump.select(); LP.toast('ВИДІЛЕНО — СКОПІЮЙ ВРУЧНУ'); });
        });
        form.querySelector('[data-paste]').addEventListener('click', () => {
          try {
            const d = JSON.parse(form.paste.value);
            LP.closeModal();
            LP.replaceData(d);
            LP.toast('ДАНІ ІМПОРТОВАНО');
          } catch (e) { LP.showErrors(form, ['Це не схоже на текст експорту — скопіюй його повністю.']); }
        });
      },
      onSubmit: () => {},
    });
  });
  const fileInput = document.getElementById('file-import');
  document.getElementById('btn-import').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files[0];
    fileInput.value = '';
    if (!f) return;
    try {
      const d = await LP.storage.readFile(f);
      if (!LP.embedded && !confirm('Замінити всі поточні дані даними з файлу? Поточні дані буде втрачено (зроби експорт, якщо вони потрібні).')) return;
      LP.replaceData(d);
    } catch (e) {
      alert('Не вдалося прочитати файл: ' + e.message);
    }
  });

  document.getElementById('btn-settings').addEventListener('click', () => {
    const s = LP.data.settings;
    const hourOpts = (sel, from, to) => {
      let o = '';
      for (let h = from; h <= to; h++) o += `<option value="${h}" ${h === sel ? 'selected' : ''}>${String(h).padStart(2, '0')}:00</option>`;
      return o;
    };
    LP.modal({
      title: 'Налаштування',
      body: `
        <div class="row">
          <label class="field"><span>День у розкладі починається</span><select name="dayStart">${hourOpts(s.dayStart, 0, 12)}</select></label>
          <label class="field"><span>і закінчується</span><select name="dayEnd">${hourOpts(s.dayEnd, 13, 24)}</select></label>
        </div>
        <div class="field"><span>Основний колір</span><div class="accent-row">${Object.entries(LP.ACCENTS).map(([k, a]) =>
          `<label class="accent-opt"><input type="radio" name="accent" value="${k}" ${k === (s.accent || 'red') ? 'checked' : ''}><span><i style="background:${a.c}"></i>${a.name}</span></label>`).join('')}</div></div>
        <label class="check"><input type="checkbox" name="grain" ${s.grain !== false ? 'checked' : ''}> Зернистість — плівкове зерно поверх усього</label>
        <label class="check"><input type="checkbox" name="orderWarnings" ${s.orderWarnings !== false ? 'checked' : ''}> Попереджати про важкі задачі підряд</label>
        <label class="check"><input type="checkbox" name="fitDay" ${s.fitDay !== false ? 'checked' : ''}> Весь день на екрані без прокрутки (масштаб підлаштовується під вікно)</label>
        <div class="field tg-set"><span>Нагадування в Telegram</span>
          <div class="row">
            <label class="field"><span>Твій Telegram ID</span><input type="text" name="tgChat" inputmode="numeric" value="${LP.u.esc(s.tgChat || '')}" placeholder="123456789"></label>
            <label class="field"><span>Нагадувати</span><select name="remindBefore">${[[-1, 'не нагадувати'], [0, 'на початку'], [5, 'за 5 хв'], [10, 'за 10 хв'], [15, 'за 15 хв'], [30, 'за 30 хв'], [60, 'за годину']].map(([v, t]) => `<option value="${v}" ${v === s.remindBefore ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
            <label class="field"><span>План на день</span><select name="morningAt">${[[-1, 'не надсилати']].concat([6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10].map((h) => [h * 60, LP.u.fmtTime(h * 60)])).map(([v, t]) => `<option value="${v}" ${v === s.morningAt ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
          </div>
          <p class="hint">ID дізнаєшся в Telegram у боті @userinfobot (рядок «Id»). Потім напиши своєму боту /start — інакше він не зможе тобі писати. Працює, коли ввімкнено вхід (синхронізація).</p>
        </div>
        <div class="storage-meter"><span class="label">ДАНІ</span>
          <p class="hint">Зберігаються в цьому браузері, а після входу — ще й у хмарі (синхронізуються між пристроями). Зайнято ${(JSON.stringify(LP.data).length * 2 / 1024).toFixed(0)} КБ з приблизно 5 000 КБ. Найбільше місця беруть картинки цілей.</p></div>
        <p class="hint">Ctrl+Z — відкотити останню дію, Ctrl+Y — повернути. Історія дій живе, поки відкрита сторінка.</p>
        <p class="hint">Регулярно роби «Експорт» — це твоя резервна копія у файл.</p>`,
      extra: [{
        text: 'Стерти всі дані',
        className: 'btn-danger',
        onClick: () => {
          if (!confirm('Точно стерти ВСІ цілі, справи, задачі, звички й оцінки? Це не можна скасувати.')) return false;
          LP.replaceData({ settings: Object.assign({}, LP.data.settings) });
        },
      }],
      onOpen: (form) => {
      },
      onSubmit: (form) => {

        s.dayStart = parseInt(form.dayStart.value, 10);
        s.dayEnd = parseInt(form.dayEnd.value, 10);
        s.fitDay = form.fitDay.checked;
        s.grain = form.grain.checked;
        s.orderWarnings = form.orderWarnings.checked;
        s.accent = form.querySelector('input[name=accent]:checked').value;
        s.tgChat = form.tgChat.value.trim();
        s.remindBefore = parseInt(form.remindBefore.value, 10);
        s.morningAt = parseInt(form.morningAt.value, 10);
        LP.view.calScroll = null;
        LP.save();
      },
    });
  });

  window.addEventListener('storage', (e) => {
    if (e.key === 'life-planner.v1' && !document.querySelector('.modal-backdrop:not(.is-leaving)')) LP.reload();
  });

  LP.render();
})(window.LP);

// Робота без інтернету й «Додати на головний екран» (лише коли планер відкрито з сайту, не з файлу)
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
