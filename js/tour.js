// Короткий тур для новачка: по картці на кожен розділ. «Пропустити» — у будь-який момент.
// Показується раз на акаунт (settings.tourDone); повторити — «Налаштування» → «Показати тур ще раз».
window.LP = window.LP || {};

(function (LP) {
  const STEPS = [
    { tab: 'week', h: 'Привіт!', p: 'Це «На свій лад» — планер, де розклад, цілі й баланс життя живуть разом. Пройдемося по розділах за хвилину — або пропусти, якщо хочеш розібратись сам.' },
    { tab: 'week', h: 'Тиждень', p: 'Головний екран. Протягни мишкою чи пальцем по сітці — зʼявиться справа. Вибери, яка вона: приємна, нейтральна чи важка — від цього залежить форма й бонуси. Квадратик на справі — виконано. Справу можна повторювати щотижня.' },
    { tab: 'board', h: 'День', p: 'Дошка-помічник: накидай задачі на день, зʼєднай стрілками в ланцюжок із перервами й приємностями. Коли все розставлено — «Усе в беклог →», а потім перетягни план у потрібний день на «Тижні».' },
    { tab: 'year', h: 'Рік', p: 'Лінія від твого дня народження до наступного. Клік — позначка, ще клік — період; відкрий період і познач, що коли: «14–17 — Карпати». Під лінією — усе по місяцях: позначки, дні народження, свята.' },
    { tab: 'goals', h: 'Цілі', p: 'Довгострокові й короткострокові, з підцілями. Мірило — галочка, рази, години чи своє число (наприклад, гроші). Привʼяжи справу до цілі — і виконані години самі зарахуються.' },
    { tab: 'balance', h: 'Баланс', p: 'Колесо сфер життя: оціни кожну, постав рівень, до якого прагнеш, і запиши, що робиш і що змінити. Тут же — люди поруч і звички.' },
    { tab: 'stats', h: 'Статистика', p: 'Стан за тиждень, цілі, звички й баланс — щоб бачити свій ритм.' },
    { tab: 'week', h: 'І ще', p: '«?» на кожній сторінці — підказки саме для неї. На телефоні: Safari → «Поділитися» → «На екран „Додому“». Значки вгорі: синхронізація (крутиться, коли обмінюється), радіо, імпорт, експорт і налаштування — там же нагадування в Telegram і погода.' },
  ];
  let el = null, i = 0;

  function goTab(tab) {
    const b = document.querySelector(`.mast-nav [data-tab="${tab}"]`);
    if (b && LP.view.tab !== tab) b.click();
    document.querySelectorAll('.mast-nav button').forEach((x) => x.classList.toggle('tour-hl', x.dataset.tab === tab && i > 0 && i < STEPS.length - 1));
  }
  function show() {
    const s = STEPS[i];
    goTab(s.tab);
    const last = i === STEPS.length - 1;
    el.innerHTML = `
      <div class="tour-card" role="dialog" aria-label="Тур">
        <div class="tour-top"><span class="mono tour-n">${i + 1} / ${STEPS.length}</span><button type="button" class="link-btn" data-t="skip">Пропустити</button></div>
        <h2>${s.h}</h2>
        <p>${s.p}</p>
        <div class="tour-dots">${STEPS.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>
        <div class="tour-btns">
          ${i ? '<button type="button" class="btn" data-t="back">НАЗАД</button>' : ''}
          <button type="button" class="btn btn-primary" data-t="next">${last ? 'ПОЧАТИ' : i ? 'ДАЛІ' : 'ПОКАЖИ'}</button>
        </div>
      </div>`;
    el.querySelector('[data-t=next]').focus();
  }
  function finish() {
    if (!el) return;
    document.querySelectorAll('.tour-hl').forEach((x) => x.classList.remove('tour-hl'));
    el.classList.add('is-leaving');
    const e = el;
    setTimeout(() => e.remove(), 200);
    el = null;
    document.removeEventListener('keydown', keys, true);
    goTab('week');
    if (!LP.data.settings.tourDone) { LP.data.settings.tourDone = true; LP.save({ render: false }); }
  }
  function keys(e) {
    if (!el) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(); }
    if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    if (e.key === 'ArrowLeft' && i) { e.preventDefault(); step(-1); }
  }
  function step(d) {
    i += d;
    if (i >= STEPS.length) return finish();
    show();
  }

  LP.startTour = function () {
    if (el) return;
    if (LP.closeModal) LP.closeModal();
    i = 0;
    el = document.createElement('div');
    el.className = 'tour';
    el.addEventListener('click', (e) => {
      const t = e.target.closest('[data-t]');
      if (!t) return;
      if (t.dataset.t === 'skip') finish();
      else step(t.dataset.t === 'back' ? -1 : 1);
    });
    document.body.appendChild(el);
    document.addEventListener('keydown', keys, true);
    show();
  };
  LP.maybeTour = function () {
    if (LP.data.settings.tourDone || el) return;
    if (document.body.classList.contains('is-locked') || document.querySelector('.modal-backdrop:not(.is-leaving)')) return;
    LP.startTour();
  };
})(window.LP);
