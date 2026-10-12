// Свій календар замість системного для всіх <input type="date">.
// Справжнє поле лишається (з нього читають форми), поверх — кнопка й календар у стилі планера.
// Клік по місяцю — сітка місяців, по року — сітка років (швидко дійти до року народження).
window.LP = window.LP || {};

(function (LP) {
  const u = LP.u;
  const pad = (n) => String(n).padStart(2, '0');
  const MONTHS = () => u.MONTHS;
  const WD = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'НД'];
  let open = null;

  const label = (inp) => (inp.value ? u.fmtDate(inp.value) : '');

  function close() {
    if (!open) return;
    const { pop, btn } = open;
    pop.classList.add('is-leaving');
    setTimeout(() => pop.remove(), 120);
    btn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', open.outside, true);
    document.removeEventListener('keydown', open.keys, true);
    window.removeEventListener('resize', close);
    open = null;
  }

  function choose(inp, value) {
    if (inp.value !== value) {
      inp.value = value;
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
    }
    close();
    inp._dp.btn.focus();
  }

  function openPicker(inp) {
    const btn = inp._dp.btn;
    if (open && open.inp === inp) return close();
    close();
    if (LP.closeSelect) LP.closeSelect();
    const today = u.today();
    const base = inp.value || (inp.max && inp.max < today ? inp.max : today);
    const st = { y: Number(base.slice(0, 4)), m: Number(base.slice(5, 7)), mode: 'days', active: inp.value || today, yPage: 0 };
    const min = inp.min || '', max = inp.max || '';
    const ok = (d) => (!min || d >= min) && (!max || d <= max);

    const pop = document.createElement('div');
    pop.className = 'dp-pop';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Обрати дату');
    document.body.appendChild(pop);

    function draw() {
      let body = '';
      if (st.mode === 'days') {
        const first = `${st.y}-${pad(st.m)}-01`;
        const start = u.addDays(first, -u.weekday(first));
        body = `<div class="dp-grid dp-days">${WD.map((w, i) => `<span class="dp-wd ${i > 4 ? 'is-we' : ''}">${w}</span>`).join('')}`;
        for (let i = 0; i < 42; i++) {
          const d = u.addDays(start, i);
          const cls = [
            Number(d.slice(5, 7)) !== st.m ? 'is-out' : '',
            d === today ? 'is-today' : '',
            d === inp.value ? 'is-current' : '',
            d === st.active ? 'is-active' : '',
            !ok(d) ? 'is-disabled' : '',
          ].join(' ');
          body += `<button type="button" class="dp-cell ${cls}" data-d="${d}" ${ok(d) ? '' : 'disabled'}>${Number(d.slice(8))}</button>`;
        }
        body += '</div>';
      } else if (st.mode === 'months') {
        body = `<div class="dp-grid dp-months">${MONTHS().map((n, i) => {
          const cur = inp.value && Number(inp.value.slice(0, 4)) === st.y && Number(inp.value.slice(5, 7)) === i + 1;
          return `<button type="button" class="dp-cell ${cur ? 'is-current' : ''} ${i + 1 === st.m ? 'is-active' : ''}" data-m="${i + 1}">${n.slice(0, 3).toUpperCase()}</button>`;
        }).join('')}</div>`;
      } else {
        const y0 = st.y - 7 + st.yPage * 16;
        body = '<div class="dp-grid dp-years">';
        for (let y = y0; y < y0 + 16; y++) {
          const cur = inp.value && Number(inp.value.slice(0, 4)) === y;
          body += `<button type="button" class="dp-cell ${cur ? 'is-current' : ''} ${y === Number(today.slice(0, 4)) ? 'is-today' : ''}" data-y="${y}">${y}</button>`;
        }
        body += '</div>';
      }
      const yTitle = st.mode === 'years' ? `${st.y - 7 + st.yPage * 16}–${st.y + 8 + st.yPage * 16}` : st.y;
      pop.innerHTML = `
        <div class="dp-head">
          <button type="button" class="dp-nav" data-step="-1" aria-label="Назад">‹</button>
          <button type="button" class="dp-title ${st.mode === 'months' ? 'is-on' : ''}" data-mode="months">${MONTHS()[st.m - 1].toUpperCase()}</button>
          <button type="button" class="dp-title ${st.mode === 'years' ? 'is-on' : ''}" data-mode="years">${yTitle}</button>
          <button type="button" class="dp-nav" data-step="1" aria-label="Вперед">›</button>
        </div>
        ${body}
        <div class="dp-foot">
          ${ok(today) ? '<button type="button" class="link-btn mono" data-today>СЬОГОДНІ</button>' : '<span></span>'}
          ${inp.required ? '' : '<button type="button" class="link-btn mono" data-clear>ОЧИСТИТИ</button>'}
        </div>`;
    }
    draw();

    const r = btn.getBoundingClientRect();
    const ph = pop.offsetHeight, pw = pop.offsetWidth;
    const below = window.innerHeight - r.bottom - 12;
    pop.style.top = (below < ph && r.top > below ? Math.max(8, r.top - ph - 6) : r.bottom + 6) + 'px';
    pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - pw - 8)) + 'px';
    btn.setAttribute('aria-expanded', 'true');

    const go = (dm) => {
      let m = st.m + dm, y = st.y;
      while (m < 1) { m += 12; y--; }
      while (m > 12) { m -= 12; y++; }
      st.m = m; st.y = y;
    };
    pop.addEventListener('click', (e) => {
      const t = e.target.closest('button');
      if (!t || t.disabled) return;
      if (t.dataset.d) return choose(inp, t.dataset.d);
      if (t.dataset.m) { st.m = Number(t.dataset.m); st.mode = 'days'; }
      else if (t.dataset.y) { st.y = Number(t.dataset.y); st.yPage = 0; st.mode = 'months'; }
      else if (t.dataset.mode) st.mode = st.mode === t.dataset.mode ? 'days' : t.dataset.mode, st.yPage = 0;
      else if (t.dataset.step) {
        const k = Number(t.dataset.step);
        if (st.mode === 'days') go(k);
        else if (st.mode === 'months') st.y += k;
        else st.yPage += k;
      } else if (t.hasAttribute('data-today')) return choose(inp, today);
      else if (t.hasAttribute('data-clear')) return choose(inp, '');
      draw();
    });
    pop.addEventListener('pointerover', (e) => {
      const c = e.target.closest('.dp-cell');
      const a = pop.querySelector('.dp-cell.is-active');
      if (c && a && a !== c) a.classList.remove('is-active');
    });

    const outside = (e) => { if (!pop.contains(e.target) && !btn.contains(e.target)) close(); };
    const keys = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); btn.focus(); return; }
      if (e.key === 'Tab') return close();
      if (st.mode !== 'days') return;
      const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
      if (step) {
        e.preventDefault();
        st.active = u.addDays(st.active, step);
        st.y = Number(st.active.slice(0, 4)); st.m = Number(st.active.slice(5, 7));
        draw();
      } else if (e.key === 'PageUp' || e.key === 'PageDown') {
        e.preventDefault(); go(e.key === 'PageUp' ? -1 : 1); draw();
      } else if (e.key === 'Enter' && ok(st.active)) { e.preventDefault(); choose(inp, st.active); }
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', keys, true);
    window.addEventListener('resize', close);
    open = { pop, btn, inp, outside, keys };
  }

  function enhance(inp) {
    if (inp._dp) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dp-btn';
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.setAttribute('aria-expanded', 'false');
    const lab = inp.closest('label');
    if (lab && lab.querySelector('span')) btn.setAttribute('aria-label', lab.querySelector('span').textContent);
    inp.classList.add('dp-native');
    inp.tabIndex = -1;
    inp.after(btn);
    const refresh = () => {
      btn.innerHTML = `<span class="${inp.value ? '' : 'dp-empty'}">${u.esc(label(inp) || 'обрати дату')}</span><svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="3" width="13" height="11.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M1.5 6.5h13M5 1.2v3.4M11 1.2v3.4" stroke="currentColor" stroke-width="1.4"/></svg>`;
      btn.disabled = inp.disabled;
    };
    inp._dp = { btn, refresh };
    refresh();
    btn.addEventListener('click', (e) => { e.preventDefault(); openPicker(inp); });
    btn.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown') { e.preventDefault(); openPicker(inp); } });
    inp.addEventListener('change', refresh);
    inp.addEventListener('input', refresh);
  }

  // значення, виставлене з коду, теж оновлює кнопку
  const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  Object.defineProperty(HTMLInputElement.prototype, 'value', {
    configurable: true,
    get() { return desc.get.call(this); },
    set(v) { desc.set.call(this, v); if (this._dp) this._dp.refresh(); },
  });

  const scan = (root) => {
    if (root.nodeType !== 1) return;
    if (root.matches('input[type=date]')) enhance(root);
    root.querySelectorAll && root.querySelectorAll('input[type=date]').forEach(enhance);
  };
  const start = () => {
    scan(document.body);
    new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach(scan))).observe(document.body, { childList: true, subtree: true });
  };
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
  LP.closeDatePicker = close;
})(window.LP);
