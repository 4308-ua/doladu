// Звички: норма на тиждень, серія тижнів і календар відміток за 12 тижнів (вихідні виділені).
// Звичка «з часом» зараховується лише через виконані справи в розкладі.
window.LP = window.LP || {};

(function (LP) {
  const u = LP.u;
  const WEEKS = 12;

  function grid(h) {
    const today = u.today();
    const lastWs = u.weekStart(today);
    const dates = LP.habitDates(h);
    let cols = '';
    for (let i = WEEKS - 1; i >= 0; i--) {
      const ws = u.addDays(lastWs, -7 * i);
      const met = LP.habitWeekCount(h, ws) >= h.perWeek;
      const cells = u.weekDays(ws).map((d, k) => {
        const on = dates.has(d);
        return `<button type="button" class="hm-cell ${on ? 'on' : ''} ${d === today ? 'today' : ''} ${k >= 5 ? 'weekend' : ''}" data-habit="${h.id}" data-date="${d}"
          ${d > today || h.timed ? 'disabled' : ''} title="${u.DAYS_SHORT[k]}, ${u.fmtDate(d)}${on ? ' — виконано' : ''}" aria-label="${u.fmtDate(d)}"></button>`;
      }).join('');
      cols += `<div class="hm-col ${met ? 'met' : ''}" title="Тиждень з ${u.fmtDay(ws)}${met ? ' — норму виконано' : ''}">${cells}</div>`;
    }
    return `<div class="hm"><div class="hm-days">${u.DAYS_SHORT.map((d, i) => `<span class="${i >= 5 ? 'weekend' : ''}">${d.toUpperCase()}</span>`).join('')}</div>${cols}</div>`;
  }

  // Секція «Звички» — тепер живе у «Статистиці» (відмічати й додавати — у тижні)
  function sectionHtml() {
    const ws = u.weekStart(u.today());
    const habits = LP.data.habits;
    return `
      <section class="habits-section">
        <div class="section-head">
          <h2>ЗВИЧКИ</h2>
          <span class="mono">12 ТИЖНІВ</span>
          <button type="button" class="btn" data-habit-add>+ ЗВИЧКА</button>
        </div>
        ${habits.length ? `<div class="habit-list">${habits.map((h) => {
          const cnt = LP.habitWeekCount(h, ws);
          return `
            <article class="habit">
              <div class="habit-info">
                <button type="button" class="goal-title" data-habit-edit="${h.id}">${u.esc(h.title)}</button>
                <div class="mono">${h.perWeek}× НА ТИЖДЕНЬ${h.timed ? ' · ⏱ З ЧАСОМ' : ''}</div>
                <div class="habit-nums">
                  <div><b class="${cnt >= h.perWeek ? 'ok' : ''}">${cnt}/${h.perWeek}</b><span>ЦЬОГО ТИЖНЯ</span></div>
                  <div><b>${LP.habitStreak(h)}</b><span>ТИЖНІВ ПОСПІЛЬ</span></div>
                  <div><b>${LP.habitDates(h).size}</b><span>УСЬОГО</span></div>
                </div>
              </div>
              ${grid(h)}
            </article>`;
        }).join('')}</div>` : `<p class="empty-note">Звичок поки немає. Додай тут або в тижні (+ біля «Звички»).</p>`}
      </section>`;
  }
  function bind(root) {
    root.querySelectorAll('[data-habit-add]').forEach((b) => b.addEventListener('click', () => LP.openHabitForm({})));
    root.querySelectorAll('[data-habit-edit]').forEach((b) => b.addEventListener('click', () => LP.openHabitForm(LP.habit(b.dataset.habitEdit))));
    root.querySelectorAll('.hm-cell').forEach((b) => b.addEventListener('click', () => LP.toggleHabit(b.dataset.habit, b.dataset.date)));
  }
  LP.habitsSection = { html: sectionHtml, bind };
  function render(root) {
    root.innerHTML = `<div class="page">${sectionHtml()}</div>`;
    bind(root);
  }

  LP.views = LP.views || {};
  LP.views.habits = { render };
})(window.LP);
