// Дрібні допоміжні функції: дати, час, екранування тексту.
// Усі дати в застосунку зберігаються як рядки 'YYYY-MM-DD' (локальний час),
// час — як кількість хвилин від початку доби (570 = 09:30).
window.LP = window.LP || {};

(function (LP) {
  const pad = (n) => String(n).padStart(2, '0');

  // мова інтерфейсу (English вмикається в налаштуваннях)
  const en = () => {
    try {
      if (LP.data && LP.data.settings) return LP.data.settings.lang === 'en';
      const raw = JSON.parse(localStorage.getItem('life-planner.v1') || '{}');
      return !!(raw.settings && raw.settings.lang === 'en');
    } catch (e) { return false; }
  };
  const L = {
    uk: {
      short: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'],
      long: ['Понеділок', 'Вівторок', 'Середа', 'Четвер', 'Пʼятниця', 'Субота', 'Неділя'],
      gen: ['січ', 'лют', 'бер', 'квіт', 'трав', 'черв', 'лип', 'серп', 'вер', 'жовт', 'лист', 'груд'],
      months: ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'],
      h: ' год',
    },
    en: {
      short: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'],
      long: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      gen: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
      h: ' h',
    },
  };
  const T = () => (en() ? L.en : L.uk);
  const MONTHS_GEN = new Proxy([], { get: (_, k) => T().gen[k] });

  const u = {
    get DAYS_SHORT() { return T().short; },
    get DAYS_LONG() { return T().long; },
    get MONTHS() { return T().months; },

    uid() {
      return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    },

    // ---- дати ----
    iso(d) {
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    },
    parse(s) {
      const [y, m, d] = s.split('-').map(Number);
      return new Date(y, m - 1, d);
    },
    today() {
      return u.iso(new Date());
    },
    addDays(s, n) {
      const d = u.parse(s);
      d.setDate(d.getDate() + n);
      return u.iso(d);
    },
    // 0 = понеділок … 6 = неділя
    weekday(s) {
      return (u.parse(s).getDay() + 6) % 7;
    },
    // понеділок тижня, в якому лежить дата
    weekStart(s) {
      return u.addDays(s, -u.weekday(s));
    },
    weekDays(ws) {
      return [0, 1, 2, 3, 4, 5, 6].map((i) => u.addDays(ws, i));
    },
    // номер тижня за ISO 8601
    isoWeek(s) {
      const d = u.parse(s);
      d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
      const w1 = new Date(d.getFullYear(), 0, 4);
      return 1 + Math.round(((d - w1) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7);
    },
    fmtDay(s) {
      const d = u.parse(s);
      return d.getDate() + ' ' + MONTHS_GEN[d.getMonth()];
    },
    fmtWeek(ws) {
      const we = u.addDays(ws, 6);
      const a = u.parse(ws), b = u.parse(we);
      if (a.getMonth() === b.getMonth()) {
        return a.getDate() + '–' + b.getDate() + ' ' + MONTHS_GEN[b.getMonth()] + ' ' + b.getFullYear();
      }
      return u.fmtDay(ws) + ' – ' + u.fmtDay(we) + ' ' + b.getFullYear();
    },
    fmtDate(s) {
      if (!s) return '';
      const d = u.parse(s);
      return d.getDate() + ' ' + MONTHS_GEN[d.getMonth()] + ' ' + d.getFullYear();
    },

    // ---- час ----
    fmtTime(min) {
      return pad(Math.floor(min / 60)) + ':' + pad(min % 60);
    },
    parseTime(str) {
      const [h, m] = String(str).split(':').map(Number);
      return h * 60 + (m || 0);
    },
    fmtHours(min) {
      const h = Math.round((min / 60) * 10) / 10;
      return (en() ? String(h) : String(h).replace('.', ',')) + T().h;
    },

    // ---- інше ----
    esc(s) {
      return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    },
    clamp(v, a, b) {
      return Math.max(a, Math.min(b, v));
    },
    pct(a, b) {
      return b ? Math.round((a / b) * 100) : 0;
    },
  };

  LP.u = u;

  // Сторінка відкрита за посиланням (всередині Claude) — там немає системних діалогів.
  // Підтвердження: перше натискання показує підказку, друге за 4 с — підтверджує.
  LP.embedded = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();
  if (LP.embedded) {
    let last = { msg: null, at: 0 };
    window.confirm = (msg) => {
      const now = Date.now();
      if (last.msg === msg && now - last.at < 4000) { last = { msg: null, at: 0 }; return true; }
      last = { msg, at: now };
      if (LP.toast) LP.toast((LP.tr ? LP.tr('Натисни ще раз, щоб підтвердити') : 'Натисни ще раз, щоб підтвердити').toUpperCase());
      return false;
    };
    window.alert = (msg) => LP.toast && LP.toast(String(msg).toUpperCase());
  }
})(window.LP);
