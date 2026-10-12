// Прийоми їжі: сніданок, обід, вечеря й перекуси — тихою смугою в кожному дні розкладу.
// Це не задачі: не рахуються у виконаному й не впливають на статистику.
// meals: [{ id, name, start, duration, date: null (щодня) | 'YYYY-MM-DD' (лише цей день), skipDates: [] }]
window.LP = window.LP || {};

(function (LP) {
  const u = LP.u;
  const DURS = [10, 15, 20, 30, 45, 60, 90];

  LP.meal = (id) => (LP.data.meals || []).find((m) => m.id === id) || null;
  // Прийоми їжі й дорога поки вимкнені (дані лишаються — увімкнути: true)
  LP.FEATURES = Object.assign({ meals: false, travel: false }, LP.FEATURES);
  LP.mealsOn = function (date) {
    if (!LP.FEATURES.meals || LP.data.settings.showMeals === false) return [];
    return (LP.data.meals || [])
      .filter((m) => (m.date ? m.date === date : true) && !m.skipDates.includes(date))
      .sort((a, b) => a.start - b.start);
  };

  // Прийом їжі розрізає справу: частина до їжі, їжа, решта після — справа стає довшою на час їжі.
  // (справа, що починається під час їжі, зсувається на після неї)
  LP.eventSegments = function (ev, date) {
    const meals = LP.data.settings.mealsCut === false ? [] : LP.mealsOn(date);
    const segs = [];
    let t = ev.start, left = ev.end - ev.start, added = 0;
    for (const m of meals) {
      const me = m.start + m.duration;
      if (me <= t || m.start >= t + left) continue;
      if (m.start <= t) { // справа починається під час їжі — зсувається на після їжі
        added += me - t;
        t = me;
        continue;
      }
      segs.push({ s: t, e: m.start });
      left -= m.start - t;
      added += Math.max(0, me - m.start);
      t = me;
    }
    segs.push({ s: t, e: t + left });
    return { segs, end: t + left, added };
  };
  // Перетягнули прийом їжі в розкладі. Щоденний — змінюється лише для цього дня.
  LP.moveMeal = function (id, fromDate, toDate, start, duration) {
    const m = LP.meal(id);
    if (!m) return;
    if (m.date) Object.assign(m, { date: toDate, start, duration });
    else {
      m.skipDates.push(fromDate);
      LP.data.meals.push({ id: u.uid(), name: m.name, start, duration, date: toDate, skipDates: [], from: m.id });
    }
    LP.save();
  };

  const timeOpts = (sel) => {
    let o = '';
    for (let m = 0; m < 24 * 60; m += 15) o += `<option value="${m}" ${m === sel ? 'selected' : ''}>${u.fmtTime(m)}</option>`;
    return o;
  };
  const durOpts = (sel) => DURS.concat(DURS.includes(sel) ? [] : [sel]).sort((a, b) => a - b)
    .map((d) => `<option value="${d}" ${d === sel ? 'selected' : ''}>${d} хв</option>`).join('');

  // Клік по прийому їжі в розкладі
  LP.openMealForm = function (id, date) {
    const m = LP.meal(id);
    if (!m) return;
    const everyDay = !m.date;
    LP.modal({
      title: m.name,
      submitText: 'Зберегти',
      body: `
        <label class="field"><span>Назва</span><input type="text" name="name" maxlength="40" value="${u.esc(m.name)}"></label>
        <div class="row">
          <label class="field"><span>Початок</span><select name="start">${timeOpts(m.start)}</select></label>
          <label class="field"><span>Скільки часу</span><select name="duration">${durOpts(m.duration)}</select></label>
        </div>
        ${everyDay ? `<div class="field"><span>Змінити</span>
          <div class="seg seg-sm">
            <label><input type="radio" name="scope" value="day" checked><span>Лише ${u.fmtDay(date)}</span></label>
            <label><input type="radio" name="scope" value="all"><span>В усі дні</span></label>
          </div></div>` : `<p class="hint">Лише ${u.fmtDate(m.date)}.</p>`}
        <p class="hint"><button type="button" class="link-btn" data-meals-all>УСІ ПРИЙОМИ ЇЖІ →</button></p>`,
      extra: [
        ...(everyDay ? [{ text: 'Прибрати в цей день', className: 'btn-danger', onClick: () => { m.skipDates.push(date); LP.save(); } }] : []),
        { text: everyDay ? 'Видалити з усіх днів' : 'Видалити', className: 'btn-danger', onClick: () => { LP.data.meals = LP.data.meals.filter((x) => x !== m); LP.save(); } },
        { text: '+ Перекус у цей день', onClick: () => { LP.closeModal(); openSnackForm(date); return false; } },
      ],
      onOpen: (form) => form.querySelector('[data-meals-all]').addEventListener('click', () => { LP.closeModal(); LP.openMealsManager(); }),
      onSubmit: (form) => {
        const name = form.name.value.trim();
        if (!name) return LP.showErrors(form, ['Назви прийом їжі.']), false;
        const vals = { name, start: parseInt(form.start.value, 10), duration: parseInt(form.duration.value, 10) };
        if (everyDay && form.querySelector('input[name=scope]:checked').value === 'day') {
          // лише цей день: щоденний прийом у цей день ховаємо, а замість нього — окремий на цю дату
          if (vals.name === m.name && vals.start === m.start && vals.duration === m.duration) return;
          m.skipDates.push(date);
          LP.data.meals.push(Object.assign({ id: u.uid(), date, skipDates: [], from: m.id }, vals));
        } else Object.assign(m, vals);
        LP.save();
      },
    });
  };

  function openSnackForm(date) {
    LP.modal({
      title: 'Перекус',
      submitText: 'Додати',
      body: `
        <label class="field"><span>Назва</span><input type="text" name="name" maxlength="40" value="Перекус"></label>
        <div class="row">
          <label class="field"><span>Початок</span><select name="start">${timeOpts(16 * 60)}</select></label>
          <label class="field"><span>Скільки часу</span><select name="duration">${durOpts(15)}</select></label>
        </div>
        <label class="check"><input type="checkbox" name="every"> Щодня, а не лише ${u.fmtDay(date)}</label>`,
      onSubmit: (form) => {
        LP.data.meals.push({
          id: u.uid(), name: form.name.value.trim() || 'Перекус', start: parseInt(form.start.value, 10),
          duration: parseInt(form.duration.value, 10), date: form.every.checked ? null : date, skipDates: [],
        });
        LP.save();
      },
    });
  }

  // Усі прийоми їжі, що стоять щодня: змінити, видалити, додати перекус
  LP.openMealsManager = function () {
    const rows = (list) => list.map((m) => `
      <div class="meal-row" data-id="${m.id}">
        <input type="text" name="n-${m.id}" value="${u.esc(m.name)}" maxlength="40" aria-label="Назва">
        <select name="s-${m.id}" aria-label="Початок">${timeOpts(m.start)}</select>
        <select name="d-${m.id}" aria-label="Скільки часу">${durOpts(m.duration)}</select>
        <button type="button" class="icon-btn" data-rm="${m.id}" aria-label="Видалити">✕</button>
      </div>`).join('');
    const daily = () => LP.data.meals.filter((m) => !m.date).sort((a, b) => a.start - b.start);
    const draft = daily().map((m) => Object.assign({}, m));
    LP.modal({
      title: 'Прийоми їжі',
      body: `
        <label class="check"><input type="checkbox" name="show" ${LP.data.settings.showMeals !== false ? 'checked' : ''}> Показувати в розкладі</label>
        <div class="meal-head mono"><span>НАЗВА</span><span>ПОЧАТОК</span><span>СКІЛЬКИ</span><span></span></div>
        <div class="meal-list">${rows(draft)}</div>
        <div class="row"><button type="button" class="btn" data-add="snack">+ ПЕРЕКУС</button><button type="button" class="btn" data-add="meal">+ ПРИЙОМ ЇЖІ</button>
          <button type="button" class="btn" data-reset>СНІДАНОК · ОБІД · ВЕЧЕРЯ</button></div>
        <p class="hint">Стоять щодня тихою смугою під задачами. Прибрати в окремий день чи додати разовий перекус — клік по смузі в розкладі.</p>`,
      onOpen: (form) => {
        const list = form.querySelector('.meal-list');
        const read = () => draft.forEach((m) => {
          if (!form['n-' + m.id]) return;
          m.name = form['n-' + m.id].value.trim() || m.name;
          m.start = parseInt(form['s-' + m.id].value, 10);
          m.duration = parseInt(form['d-' + m.id].value, 10);
        });
        form.addEventListener('click', (e) => {
          const rm = e.target.closest('[data-rm]');
          const add = e.target.closest('[data-add]');
          if (rm) {
            read();
            draft.splice(draft.findIndex((m) => m.id === rm.dataset.rm), 1);
          } else if (add) {
            read();
            draft.push(add.dataset.add === 'snack'
              ? { id: u.uid(), name: 'Перекус', start: 16 * 60, duration: 15, date: null, skipDates: [] }
              : { id: u.uid(), name: 'Прийом їжі', start: 12 * 60, duration: 30, date: null, skipDates: [] });
          } else if (e.target.closest('[data-reset]')) {
            draft.splice(0, draft.length, ...LP.defaultMeals());
          } else return;
          list.innerHTML = rows(draft);
        });
      },
      onSubmit: (form) => {
        draft.forEach((m) => {
          m.name = form['n-' + m.id].value.trim() || m.name;
          m.start = parseInt(form['s-' + m.id].value, 10);
          m.duration = parseInt(form['d-' + m.id].value, 10);
        });
        LP.data.meals = LP.data.meals.filter((m) => m.date).concat(draft);
        LP.data.settings.showMeals = form.show.checked;
        LP.save();
      },
    });
  };
})(window.LP);
