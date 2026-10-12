// Синхронізація між пристроями через Supabase.
// Вхід — кодом з пошти (на iPhone посилання відкрилось би в Safari, а не в застосунку з головного екрана).
// Усі дані — один документ у таблиці planner: перемагає новіша зміна; при першому вході на пристрої — питаємо.
window.LP = window.LP || {};

(function (LP) {
  const URL_ = 'https://ngxtrzjdpqmozhjeqgqw.supabase.co';
  const KEY = 'sb_publishable_-gbCnhm5ctROcfFnyURH1g_8muJWeOy';
  const AUTH_KEY = 'life-planner.auth';
  const META_KEY = 'life-planner.sync';
  const DATA_KEY = 'life-planner.v1';

  const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const write = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

  let auth = read(AUTH_KEY);          // { access_token, refresh_token, expires_at, user: { id, email } }
  let meta = read(META_KEY) || {};    // { remoteAt, dirty, editAt, lastOk }
  let status = 'off';                 // off | ok | busy | offline | error
  let pushTimer = null, busy = false, applying = false;

  const saveMeta = () => write(META_KEY, meta);
  const setStatus = (s) => { status = s; paint(); };

  // ---------- запити ----------
  async function api(path, { method = 'GET', body, token, headers = {} } = {}) {
    const h = Object.assign({ apikey: KEY, 'Content-Type': 'application/json' }, headers);
    if (token) h.Authorization = 'Bearer ' + token;
    const r = await fetch(URL_ + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
    const text = await r.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch (e) {}
    if (!r.ok) {
      const err = new Error((json && (json.msg || json.message || json.error_description || json.error)) || 'HTTP ' + r.status);
      err.status = r.status;
      throw err;
    }
    return json;
  }
  function keepSession(s) {
    auth = { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: Date.now() + (s.expires_in || 3600) * 1000, user: { id: s.user.id, email: s.user.email } };
    write(AUTH_KEY, auth);
  }
  async function token() {
    if (!auth) return null;
    if (Date.now() < auth.expires_at - 60000) return auth.access_token;
    try {
      keepSession(await api('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: auth.refresh_token } }));
      return auth.access_token;
    } catch (e) {
      if (e.status === 400 || e.status === 401) { auth = null; write(AUTH_KEY, null); setStatus('off'); }
      throw e;
    }
  }

  LP.sync = {
    get signedIn() { return !!auth; },
    get email() { return auth && auth.user.email; },
    get status() { return status; },
    get lastOk() { return meta.lastOk || null; },
    async sendCode(email) {
      const redirect = /^https?:/.test(location.protocol) ? '?redirect_to=' + encodeURIComponent(location.origin + location.pathname) : '';
      await api('/auth/v1/otp' + redirect, { method: 'POST', body: { email, create_user: true } });
    },
    async verify(email, code) {
      keepSession(await api('/auth/v1/verify', { method: 'POST', body: { type: 'email', email, token: code.trim() } }));
      meta = {}; saveMeta();
    },
    firstSync: () => firstSync(),
    async signOut() {
      try { await api('/auth/v1/logout', { method: 'POST', token: await token() }); } catch (e) {}
      auth = null; write(AUTH_KEY, null);
      meta = {}; saveMeta();
      setStatus('off');
    },
    now: () => pull(true),
  };

  // ---------- хмара ----------
  async function fetchRemote() {
    const rows = await api('/rest/v1/planner?select=data,updated_at', { token: await token() });
    return rows && rows[0] ? rows[0] : null;
  }
  async function push() {
    if (!auth || busy) return;
    if (!navigator.onLine) return setStatus('offline');
    busy = true; setStatus('busy');
    try {
      // хтось (інший пристрій) встиг змінити хмару, поки ми тут правили — беремо новіше
      const remote = await fetchRemote();
      if (remote && meta.remoteAt && remote.updated_at > meta.remoteAt && new Date(remote.updated_at).getTime() > (meta.editAt || 0)) {
        busy = false;
        return apply(remote, 'З ІНШОГО ПРИСТРОЮ ПРИЙШЛА НОВІША ВЕРСІЯ');
      }
      const at = new Date().toISOString();
      const rows = await api('/rest/v1/planner?on_conflict=user_id', {
        method: 'POST', token: await token(),
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: { user_id: auth.user.id, data: LP.data, updated_at: at },
      });
      meta.remoteAt = (rows && rows[0] && rows[0].updated_at) || at;
      meta.dirty = false; meta.lastOk = Date.now(); saveMeta();
      setStatus('ok');
    } catch (e) {
      setStatus(navigator.onLine ? 'error' : 'offline');
      console.warn('Синхронізація: не вдалося відправити', e);
    } finally { busy = false; }
  }
  async function pull(manual) {
    if (!auth || busy) return;
    if (!navigator.onLine) return setStatus('offline');
    busy = true; setStatus('busy');
    try {
      const remote = await fetchRemote();
      busy = false;
      if (!remote) return push();
      if (remote.updated_at !== meta.remoteAt) {
        // у хмарі нове: якщо тут нічого не правили — просто беремо; якщо правили — новіша зміна виграє
        if (!meta.dirty || new Date(remote.updated_at).getTime() > (meta.editAt || 0)) return apply(remote, manual ? 'ОНОВЛЕНО З ХМАРИ' : 'ПІДТЯГНУТО ЗМІНИ З ІНШОГО ПРИСТРОЮ');
        return push();
      }
      if (meta.dirty) return push();
      meta.lastOk = Date.now(); saveMeta();
      setStatus('ok');
      if (manual && LP.toast) LP.toast('УСЕ ВЖЕ СИНХРОНІЗОВАНО');
    } catch (e) {
      busy = false;
      setStatus(navigator.onLine ? 'error' : 'offline');
      console.warn('Синхронізація: не вдалося отримати', e);
    }
  }
  function apply(remote, msg) {
    applying = true;
    try {
      localStorage.setItem(DATA_KEY, JSON.stringify(remote.data));
      LP.reload();
    } finally { applying = false; }
    meta.remoteAt = remote.updated_at; meta.dirty = false; meta.lastOk = Date.now(); saveMeta();
    setStatus('ok');
    if (msg && LP.toast) LP.toast(msg);
  }

  // перший вхід на цьому пристрої: у хмарі вже щось є — питаємо, що лишити
  async function firstSync() {
    setStatus('busy');
    const remote = await fetchRemote();
    const hasLocal = LP.data.events.length || LP.data.goals.length || LP.data.tasks.length;
    if (!remote) { meta.dirty = true; meta.editAt = Date.now(); saveMeta(); return push(); }
    if (!hasLocal || JSON.stringify(remote.data) === JSON.stringify(LP.data)) return apply(remote, 'ДАНІ З ХМАРИ НА МІСЦІ');
    setStatus('ok');
    const when = new Date(remote.updated_at);
    LP.modal({
      title: 'Що лишити?',
      submitText: 'Взяти з хмари',
      body: `<p>У хмарі вже є планер (збережено ${when.toLocaleDateString('uk-UA')} о ${when.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}), а на цьому пристрої — свої дані.</p>
        <p class="hint">«Взяти з хмари» — цей пристрій отримає дані з хмари. «Відправити ці» — дані з цього пристрою замінять хмарні на всіх пристроях. Про всяк випадок спершу можна зробити ЕКСПОРТ.</p>`,
      extra: [{ text: 'Відправити ці', onClick: () => { meta.remoteAt = remote.updated_at; meta.dirty = true; meta.editAt = Date.now(); saveMeta(); push(); } }],
      onSubmit: () => { apply(remote, 'ДАНІ З ХМАРИ НА МІСЦІ'); },
    });
  }

  // кожне збереження → позначка «є невідправлене» і відправка за пару секунд
  LP.storage.afterSave = function () {
    if (applying || !auth) return;
    meta.dirty = true; meta.editAt = Date.now(); saveMeta();
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, 1500);
  };

  // ---------- кнопка в шапці й вікно ----------
  const LABEL = { off: 'ВХІД', ok: 'СИНХР.', busy: 'СИНХР…', offline: 'ОФЛАЙН', error: 'СИНХР. !' };
  function paint() {
    const b = document.getElementById('btn-sync');
    if (!b) return;
    b.className = 'sync-btn is-' + status;
    b.textContent = (status === 'off' ? '' : '● ') + LABEL[status];
    b.title = status === 'off' ? 'Увійти, щоб синхронізувати комп і телефон'
      : status === 'error' ? 'Не вдалося синхронізувати — натисни, щоб спробувати ще' : status === 'offline' ? 'Немає інтернету — відправлю, щойно зʼявиться' : 'Синхронізовано · ' + (auth ? auth.user.email : '');
  }
  function fmtAgo(ms) {
    if (!ms) return 'ще ні разу';
    const s = Math.round((Date.now() - ms) / 1000);
    if (s < 60) return 'щойно';
    if (s < 3600) return Math.round(s / 60) + ' хв тому';
    return new Date(ms).toLocaleString('uk-UA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
  LP.openSync = function () {
    if (auth) {
      return LP.modal({
        title: 'Синхронізація',
        submitText: 'Синхронізувати зараз',
        body: `<p class="mono sync-who">${LP.u.esc(auth.user.email)}</p>
          <p>Останній раз: <b>${fmtAgo(meta.lastOk)}</b>${status === 'error' ? ' · <span class="warn">остання спроба не вдалася</span>' : status === 'offline' ? ' · немає інтернету' : ''}.</p>
          <p class="hint">Зміни відправляються самі за пару секунд, а з інших пристроїв підтягуються, коли повертаєшся в планер. Увійди цією ж поштою на телефоні й на компі.</p>`,
        extra: [{ text: 'Вийти', className: 'btn-danger', onClick: () => { LP.sync.signOut(); } }],
        onSubmit: () => { pull(true); },
      });
    }
    let email = '';
    LP.modal({
      title: 'Вхід',
      submitText: 'Надіслати код',
      body: `<p>Один акаунт — ті самі дані на компі й на телефоні. Пароль не потрібен: прийде лист із кодом.</p>
        <label class="field"><span>Пошта</span><input type="text" name="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" placeholder="you@gmail.com"></label>
        <label class="field sync-code" hidden><span>Код із листа</span><input type="text" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="123456"></label>
        <p class="hint sync-note"></p>`,
      onOpen: (form) => {
        const btn = form.querySelector('button[type=submit]');
        form.addEventListener('submit', async (e) => {
          // перехоплюємо: вікно не закривається, поки не ввели код
          e.preventDefault(); e.stopImmediatePropagation();
          const note = form.querySelector('.sync-note');
          const codeBox = form.querySelector('.sync-code');
          try {
            btn.disabled = true;
            if (codeBox.hidden) {
              email = form.email.value.trim().toLowerCase();
              if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Перевір пошту.');
              await LP.sync.sendCode(email);
              codeBox.hidden = false;
              form.email.readOnly = true;
              btn.textContent = 'Увійти';
              note.textContent = 'Лист надіслано на ' + email + '. Введи код із нього (на компі можна просто натиснути посилання в листі).';
              setTimeout(() => form.code.focus(), 30);
            } else {
              if (!form.code.value.trim()) throw new Error('Введи код із листа.');
              await LP.sync.verify(email, form.code.value);
              LP.closeModal();
              if (LP.toast) LP.toast('ВХІД ВИКОНАНО');
              setTimeout(() => firstSync().catch(() => setStatus('error')), 200);
            }
          } catch (err) {
            note.textContent = /rate|limit|seconds/i.test(err.message) ? 'Забагато спроб — зачекай хвилину й спробуй ще.' : /expired|invalid|token/i.test(err.message) ? 'Код не підходить або застарів. Перевір чи надішли новий.' : err.message === 'Failed to fetch' ? 'Немає звʼязку з сервером. Перевір інтернет.' : err.message;
            note.classList.add('warn');
          } finally { btn.disabled = false; }
        }, true);
      },
      onSubmit: () => false,
    });
  };

  // вхід за посиланням із листа (на компі): токени приходять у хеші адреси
  function fromHash() {
    if (!/access_token=/.test(location.hash)) return false;
    const p = new URLSearchParams(location.hash.slice(1));
    history.replaceState(null, '', location.pathname + location.search);
    const access = p.get('access_token');
    try {
      const payload = JSON.parse(atob(access.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      keepSession({ access_token: access, refresh_token: p.get('refresh_token'), expires_in: Number(p.get('expires_in')) || 3600, user: { id: payload.sub, email: payload.email } });
      meta = {}; saveMeta();
      return true;
    } catch (e) { return false; }
  }

  function start() {
    const btn = document.getElementById('btn-sync');
    if (btn) btn.addEventListener('click', () => (status === 'error' ? pull(true) : LP.openSync()));
    const fresh = fromHash();
    setStatus(auth ? 'ok' : 'off');
    if (fresh) firstSync().catch(() => setStatus('error'));
    else if (auth) pull();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pull(); else if (meta.dirty) push(); });
    window.addEventListener('online', () => pull());
    window.addEventListener('offline', () => { if (auth) setStatus('offline'); });
    setInterval(() => { if (document.visibilityState === 'visible') pull(); }, 60000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else setTimeout(start, 0);
})(window.LP);
