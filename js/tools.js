// Дрібні інструменти шапки: календар для швидкого переходу до тижня і радіо.
window.LP = window.LP || {};

(function (LP) {
  const u = LP.u;
  Object.defineProperty(LP, 'MONTHS', { get: () => u.MONTHS, configurable: true });
  const MONTHS = new Proxy([], { get: (_, k) => u.MONTHS[k] });

  // ---------------- Спливаюче вікно під кнопкою ----------------
  let openPop = null;
  function closePop() {
    if (!openPop) return;
    openPop.el.remove();
    document.removeEventListener('pointerdown', openPop.outside, true);
    document.removeEventListener('keydown', openPop.esc);
    openPop = null;
  }
  function popover(anchor, cls, paint) {
    const same = openPop && openPop.anchor === anchor;
    closePop();
    if (same) return null;
    const el = document.createElement('div');
    el.className = 'pop ' + cls;
    document.body.appendChild(el);
    const place = () => {
      const r = anchor.getBoundingClientRect();
      el.style.top = r.bottom + 8 + 'px';
      el.style.left = Math.max(8, Math.min(r.left, window.innerWidth - el.offsetWidth - 8)) + 'px';
    };
    const outside = (e) => { if (!el.contains(e.target) && !anchor.contains(e.target)) closePop(); };
    const esc = (e) => { if (e.key === 'Escape') closePop(); };
    openPop = { el, anchor, outside, esc };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', esc);
    paint(el);
    place();
    return el;
  }
  LP.closePop = closePop;
  LP.popover = popover;

  // ---------------- Календар: клік по «Книга … — Розділ …» або по датах тижня ----------------
  LP.openCalendar = function (anchor) {
    const sel = LP.view.weekStart;
    const d0 = u.parse(sel);
    let y = d0.getFullYear(), m = d0.getMonth();
    popover(anchor, 'cal-pop', function paint(el) {
      const first = new Date(y, m, 1);
      let ws = u.weekStart(u.iso(first));
      const today = u.today();
      let rows = '';
      for (let r = 0; r < 6; r++) {
        const days = u.weekDays(ws);
        if (r > 0 && u.parse(days[0]).getMonth() !== m) break;
        const hasJournal = days.some((d) => LP.journal(d));
        rows += `<button type="button" class="cp-week ${ws === sel ? 'is-sel' : ''}" data-ws="${ws}" title="Тиждень ${u.fmtWeek(ws)}">
          <span class="cp-num">${u.isoWeek(ws)}</span>
          ${days.map((d) => {
            const dt = u.parse(d);
            return `<span class="cp-day ${dt.getMonth() !== m ? 'out' : ''} ${d === today ? 'today' : ''} ${LP.journal(d) ? 'has-j' : ''}">${dt.getDate()}</span>`;
          }).join('')}
          ${hasJournal ? '' : ''}
        </button>`;
        ws = u.addDays(ws, 7);
      }
      el.innerHTML = `
        <div class="cp-head">
          <button type="button" class="cp-nav" data-y="-1" title="Попередній рік" aria-label="Попередній рік">«</button>
          <button type="button" class="cp-nav" data-m="-1" title="Попередній місяць" aria-label="Попередній місяць">‹</button>
          <b>${MONTHS[m].toUpperCase()} ${y}</b>
          <button type="button" class="cp-nav" data-m="1" title="Наступний місяць" aria-label="Наступний місяць">›</button>
          <button type="button" class="cp-nav" data-y="1" title="Наступний рік" aria-label="Наступний рік">»</button>
        </div>
        <div class="cp-dow"><span class="cp-num">РОЗ</span>${u.DAYS_SHORT.map((d) => `<span>${d.toUpperCase()}</span>`).join('')}</div>
        ${rows}
        <div class="cp-foot"><button type="button" class="link-btn" data-now>ЦЕЙ ТИЖДЕНЬ</button><span class="mono muted">КЛІК ПО РЯДКУ — ВІДКРИТИ ТИЖДЕНЬ</span></div>`;
      el.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => {
        m += +b.dataset.m;
        if (m < 0) { m = 11; y--; }
        if (m > 11) { m = 0; y++; }
        paint(el);
      }));
      el.querySelectorAll('[data-y]').forEach((b) => b.addEventListener('click', () => { y += +b.dataset.y; paint(el); }));
      const go = (w) => {
        LP.view.weekStart = w;
        if (LP.view.tab !== 'week' && LP.view.tab !== 'stats') LP.view.tab = 'week';
        LP.view.calScroll = null;
        closePop();
        LP.render();
      };
      el.querySelectorAll('[data-ws]').forEach((b) => b.addEventListener('click', () => go(b.dataset.ws)));
      el.querySelector('[data-now]').addEventListener('click', () => go(u.weekStart(u.today())));
    });
  };

  // ---------------- Радіо ----------------
  // Прямі потоки інтернет-радіо. Якщо якийсь перестане працювати — додай своє посилання в списку.
  const STATIONS = [
    { id: 'minimal', group: 'ТЕХНО', name: 'Minimal Mix Radio', url: 'http://orion.shoutca.st:8750/stream' },
    { id: 'igfm', group: 'ТЕХНО', name: 'Intergalactic FM · CBS', url: 'http://radio.intergalactic.fm:80/1' },
    { id: 'deeper', group: 'ТЕХНО', name: 'Deeper Shades of House', url: 'https://andromeda.housejunkie.ca/radio/8000/radio.mp3' },
    { id: 'lofi', group: 'ЛОУФАЙ', name: 'Lofi Radio', url: 'https://boxradio-edge-00.streamafrica.net/lofi' },
    { id: 'fluid', group: 'ЛОУФАЙ', name: 'SomaFM · Fluid (інструментальний хіп-хоп)', url: 'https://ice2.somafm.com/fluid-128-mp3' },
    { id: 'groove', group: 'ЛОУФАЙ', name: 'SomaFM · Groove Salad (даунтемпо)', url: 'https://ice2.somafm.com/groovesalad-128-mp3' },
    { id: 'drone', group: 'ЕМБІЄНТ', name: 'SomaFM · Drone Zone', url: 'https://ice2.somafm.com/dronezone-128-mp3' },
  ];
  const RKEY = 'life-planner.radio';
  const radio = { station: null, volume: 0.6, custom: [], playing: false, status: '' };
  try { Object.assign(radio, JSON.parse(localStorage.getItem(RKEY) || '{}'), { playing: false, status: '' }); } catch (e) {}
  const saveRadio = () => {
    try { localStorage.setItem(RKEY, JSON.stringify({ station: radio.station, volume: radio.volume, custom: radio.custom })); } catch (e) {}
  };
  const audio = new Audio();
  audio.preload = 'none';
  audio.volume = radio.volume;
  const all = () => STATIONS.concat(radio.custom.map((c) => Object.assign({ group: 'СВОЄ' }, c)));
  const current = () => all().find((s) => s.id === radio.station) || null;

  function updateButton() {
    const b = document.getElementById('btn-radio');
    if (!b) return;
    const s = current();
    b.classList.toggle('is-on', radio.playing);
    b.textContent = radio.playing && s ? `♪ ${s.name.toUpperCase()}` : '♪ РАДІО';
  }
  function play(id) {
    const s = all().find((x) => x.id === id);
    if (!s) return;
    radio.station = id;
    radio.status = 'ПІДКЛЮЧАЮСЬ…';
    audio.src = s.url;
    audio.play().then(() => {
      radio.playing = true;
      radio.status = '';
      refresh();
    }).catch(() => {
      radio.playing = false;
      radio.status = 'НЕ ВДАЛОСЯ ПІДКЛЮЧИТИСЬ — СПРОБУЙ ІНШЕ';
      refresh();
    });
    saveRadio();
    refresh();
  }
  function stop() {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    radio.playing = false;
    radio.status = '';
    refresh();
  }
  audio.addEventListener('error', () => {
    if (!audio.getAttribute('src')) return;
    radio.playing = false;
    radio.status = 'ПОТІК НЕДОСТУПНИЙ — СПРОБУЙ ІНШЕ РАДІО';
    refresh();
  });
  let paintRadio = null;
  function refresh() {
    updateButton();
    if (paintRadio && openPop && openPop.el.classList.contains('radio-pop')) paintRadio(openPop.el);
  }

  LP.openRadio = function (anchor) {
    paintRadio = function paint(el) {
      const groups = {};
      all().forEach((s) => (groups[s.group] = groups[s.group] || []).push(s));
      el.innerHTML = `
        <div class="rp-head"><b>РАДІО</b>
          ${radio.playing ? '<button type="button" class="btn rp-stop" data-stop>■ СТОП</button>' : ''}
        </div>
        ${radio.status ? `<div class="rp-status mono">${radio.status}</div>` : ''}
        ${Object.entries(groups).map(([g, list]) => `
          <div class="rp-group"><div class="label">${g}</div>
            ${list.map((s) => `<div class="rp-row">
              <button type="button" class="rp-st ${s.id === radio.station && radio.playing ? 'on' : ''}" data-play="${s.id}">
                <span class="rp-ic">${s.id === radio.station && radio.playing ? '■' : '▶'}</span>${u.esc(s.name)}</button>
              ${g === 'СВОЄ' ? `<button type="button" class="icon-btn small" data-rm="${s.id}" aria-label="Прибрати">✕</button>` : ''}
            </div>`).join('')}
          </div>`).join('')}
        <label class="rp-vol mono">ГУЧНІСТЬ <input type="range" min="0" max="1" step="0.05" value="${radio.volume}" data-vol></label>
        <form class="rp-add" autocomplete="off">
          <input type="text" name="name" placeholder="Назва" maxlength="40">
          <input type="text" name="url" placeholder="Посилання на потік (mp3 / aac)">
          <button type="submit" class="btn">+ ДОДАТИ</button>
        </form>
        <p class="hint">Грає, поки відкрита сторінка. Посилання на потік можна знайти на сайті радіостанції (часто закінчується на /stream, .mp3 або /listen).</p>`;
      el.querySelectorAll('[data-play]').forEach((b) => b.addEventListener('click', () => {
        if (b.dataset.play === radio.station && radio.playing) stop();
        else play(b.dataset.play);
      }));
      const st = el.querySelector('[data-stop]');
      if (st) st.addEventListener('click', stop);
      el.querySelector('[data-vol]').addEventListener('input', (e) => {
        radio.volume = +e.target.value;
        audio.volume = radio.volume;
        saveRadio();
      });
      el.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => {
        if (radio.station === b.dataset.rm) stop();
        radio.custom = radio.custom.filter((c) => c.id !== b.dataset.rm);
        saveRadio();
        paint(el);
      }));
      el.querySelector('.rp-add').addEventListener('submit', (e) => {
        e.preventDefault();
        const f = e.target;
        const url = f.url.value.trim();
        if (!/^https?:\/\//.test(url)) return f.url.focus();
        radio.custom.push({ id: 'c' + u.uid(), name: f.name.value.trim() || url.replace(/^https?:\/\//, '').slice(0, 30), url });
        saveRadio();
        paint(el);
      });
    };
    popover(anchor, 'radio-pop', paintRadio);
  };

  document.addEventListener('DOMContentLoaded', updateButton);
  LP.updateRadioButton = updateButton;
})(window.LP);
