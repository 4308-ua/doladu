// Свої випадні списки замість системних: поточне значення — чорним, те, на що наводиш, — у кольорі акценту.
// Справжній <select> лишається (його читають форми), а поверх нього — кнопка й список.
window.LP = window.LP || {};

(function (LP) {
  let open = null;

  function label(sel) {
    const o = sel.options[sel.selectedIndex];
    return o ? o.textContent : '';
  }

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

  function choose(sel, value) {
    if (sel.value !== value) {
      sel.value = value;
      sel.dispatchEvent(new Event('input', { bubbles: true }));
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
    close();
    sel._csel.btn.focus();
  }

  function openList(sel) {
    const btn = sel._csel.btn;
    if (open && open.sel === sel) return close();
    close();
    const pop = document.createElement('div');
    pop.className = 'csel-pop';
    pop.setAttribute('role', 'listbox');
    let html = '';
    Array.from(sel.children).forEach((ch) => {
      if (ch.tagName === 'OPTGROUP') {
        html += `<div class="csel-group">${LP.u.esc(ch.label)}</div>`;
        Array.from(ch.children).forEach((o) => (html += optHtml(o, sel)));
      } else if (ch.tagName === 'OPTION') html += optHtml(ch, sel);
    });
    pop.innerHTML = html;
    document.body.appendChild(pop);
    const r = btn.getBoundingClientRect();
    pop.style.minWidth = r.width + 'px';
    const below = window.innerHeight - r.bottom - 12;
    const h = Math.min(pop.scrollHeight, 300);
    if (below < h && r.top > below) pop.style.top = Math.max(8, r.top - h - 4) + 'px';
    else pop.style.top = r.bottom + 4 + 'px';
    pop.style.left = Math.min(r.left, window.innerWidth - pop.offsetWidth - 8) + 'px';
    const cur = pop.querySelector('.is-current');
    if (cur) pop.scrollTop = cur.offsetTop - pop.clientHeight / 2 + cur.offsetHeight / 2;
    btn.setAttribute('aria-expanded', 'true');

    let active = cur;
    const setActive = (el) => {
      if (active) active.classList.remove('is-active');
      active = el;
      if (el) {
        el.classList.add('is-active');
        el.scrollIntoView({ block: 'nearest' });
      }
    };
    pop.addEventListener('pointerover', (e) => {
      const o = e.target.closest('.csel-opt');
      if (o && active && active !== o) active.classList.remove('is-active');
    });
    pop.addEventListener('click', (e) => {
      const o = e.target.closest('.csel-opt');
      if (o && !o.classList.contains('is-disabled')) choose(sel, o.dataset.value);
    });
    const outside = (e) => { if (!pop.contains(e.target) && e.target !== btn && !btn.contains(e.target)) close(); };
    const keys = (e) => {
      const opts = Array.from(pop.querySelectorAll('.csel-opt:not(.is-disabled)'));
      const i = opts.indexOf(active);
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); btn.focus(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(opts[Math.min(opts.length - 1, i + 1)]); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(opts[Math.max(0, i - 1)]); }
      else if (e.key === 'Enter' || e.key === ' ') { if (active) { e.preventDefault(); choose(sel, active.dataset.value); } }
      else if (e.key === 'Tab') close();
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', keys, true);
    window.addEventListener('resize', close);
    open = { pop, btn, sel, outside, keys };
  }

  function optHtml(o, sel) {
    const cur = o.value === sel.value && o.selected;
    return `<div class="csel-opt ${cur ? 'is-current' : ''} ${o.disabled ? 'is-disabled' : ''}" role="option" data-value="${LP.u.esc(o.value)}" aria-selected="${cur}">${LP.u.esc(o.textContent)}</div>`;
  }

  function enhance(sel) {
    if (sel._csel || sel.multiple || sel.size > 1) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'csel';
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    if (sel.getAttribute('aria-label')) btn.setAttribute('aria-label', sel.getAttribute('aria-label'));
    sel.classList.add('csel-native');
    sel.tabIndex = -1;
    sel.after(btn);
    const refresh = () => {
      btn.innerHTML = `<span>${LP.u.esc(label(sel))}</span>`;
      btn.disabled = sel.disabled;
    };
    sel._csel = { btn, refresh };
    refresh();
    btn.addEventListener('click', () => openList(sel));
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); openList(sel); }
    });
    sel.addEventListener('change', refresh);
  }

  // значення, виставлене з коду (form.end.value = …), теж оновлює кнопку
  const desc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  Object.defineProperty(HTMLSelectElement.prototype, 'value', {
    configurable: true,
    get() { return desc.get.call(this); },
    set(v) { desc.set.call(this, v); if (this._csel) this._csel.refresh(); },
  });

  const scan = (root) => {
    if (root.nodeType !== 1) return;
    if (root.tagName === 'SELECT') enhance(root);
    root.querySelectorAll && root.querySelectorAll('select').forEach(enhance);
  };
  const start = () => {
    scan(document.body);
    new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach(scan))).observe(document.body, { childList: true, subtree: true });
  };
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
  LP.closeSelect = close;
})(window.LP);
