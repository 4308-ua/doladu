// Акаунт, синхронізація й шифрування.
// • Без входу планер закритий: замість нього — екран входу / реєстрації / відновлення пароля.
// • Дані шифруються на пристрої (AES-GCM) випадковим ключем даних. Цей ключ лежить у хмарі лише загорнутим:
//   паролем (kp) і кодом відновлення (kr). Власник бази бачить тільки шифр — ні справ, ні цілей.
// • Для нагадувань у Telegram у хмару йде розклад на 3 тижні вперед (назва й час справ) — лише якщо вказано Telegram ID.
// • Скинув пароль через пошту — дані відкриває код відновлення (або пристрій, де ти вже був у акаунті).
window.LP = window.LP || {};

(function (LP) {
  const URL_ = 'https://ngxtrzjdpqmozhjeqgqw.supabase.co';
  const KEY = 'sb_publishable_-gbCnhm5ctROcfFnyURH1g_8muJWeOy';
  const AUTH_KEY = 'life-planner.auth';
  const META_KEY = 'life-planner.sync';
  const DATA_KEY = 'life-planner.v1';
  const DEK_KEY = 'life-planner.dek';
  const PBKDF2_ITER = 250000;

  const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const write = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const esc = (s) => LP.u.esc(s);

  let auth = read(AUTH_KEY);          // { access_token, refresh_token, expires_at, user: { id, email } }
  let meta = read(META_KEY) || {};    // { remoteAt, dirty, editAt, lastOk, keys: { kp, kr } }
  let dekRaw = null, dek = null;      // ключ даних: байти й CryptoKey
  let status = 'off';                 // off | ok | busy | offline | error
  let pushTimer = null, busy = false, applying = false;

  const saveMeta = () => write(META_KEY, meta);
  const setStatus = (s) => { status = s; paint(); };

  // ================= шифрування =================
  const enc = new TextEncoder(), dec = new TextDecoder();
  const b64 = (bytes) => { let s = ''; const a = new Uint8Array(bytes); for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = (str) => Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
  const rnd = (n) => crypto.getRandomValues(new Uint8Array(n));

  async function kdf(secret, salt, iter) {
    const base = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function wrapWith(secret) {
    const salt = rnd(16), iv = rnd(12);
    const kek = await kdf(secret, salt, PBKDF2_ITER);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, kek, dekRaw);
    return { salt: b64(salt), iter: PBKDF2_ITER, iv: b64(iv), ct: b64(ct) };
  }
  async function unwrapWith(secret, w) {
    const kek = await kdf(secret, unb64(w.salt), w.iter || PBKDF2_ITER);
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(w.iv) }, kek, unb64(w.ct)));
  }
  async function setDek(raw, remember = true) {
    dekRaw = raw;
    dek = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
    if (remember) write(DEK_KEY, b64(raw));
  }
  async function pack(obj) {
    let bytes = enc.encode(JSON.stringify(obj));
    let z = 0;
    if (window.CompressionStream) {
      bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
      z = 1;
    }
    const iv = rnd(12);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, dek, bytes);
    return { iv: b64(iv), ct: b64(ct), z };
  }
  async function unpack(env) {
    let bytes = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(env.iv) }, dek, unb64(env.ct)));
    if (env.z) bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
    return JSON.parse(dec.decode(bytes));
  }
  // код відновлення: 20 випадкових байтів → 32 символи A–Z2–7 групами по 4
  function newCode() {
    const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const b = rnd(20);
    let bits = 0, val = 0, out = '';
    for (const x of b) { val = (val << 8) | x; bits += 8; while (bits >= 5) { out += A[(val >>> (bits - 5)) & 31]; bits -= 5; } }
    return out.match(/.{4}/g).join('-');
  }
  const normCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z2-7]/g, '');

  // ================= запити =================
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
      err.code = json && (json.error_code || json.code);
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
      if (e.status === 400 || e.status === 401) { forget(); gate('login', { note: 'Сесія завершилась — увійди ще раз.' }); }
      throw e;
    }
  }
  const redirect = () => (/^https?:/.test(location.protocol) ? '?redirect_to=' + encodeURIComponent(location.origin + location.pathname) : '');
  const passwordGrant = (email, password) => api('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } });

  // ================= хмара =================
  async function fetchRow() {
    const rows = await api('/rest/v1/planner?select=data,updated_at', { token: await token() });
    return rows && rows[0] ? rows[0] : null;
  }
  const isEncrypted = (row) => !!(row && row.data && row.data.enc);
  // розклад для нагадувань (не зашифрований — інакше сервер не знатиме, коли писати)
  function tgPayload() {
    const s = LP.data.settings;
    if (!s.tgChat) return null;
    const today = LP.u.today();
    const events = LP.occurrences(today, LP.u.addDays(today, 21)).map((o) => ({
      id: o.ev.id, title: o.ev.title, date: o.date, start: o.ev.start, end: o.ev.end, doneDates: o.done ? [o.date] : [],
    }));
    return { settings: { tgChat: s.tgChat, remindBefore: s.remindBefore, morningAt: s.morningAt }, events };
  }
  async function decodeRow(row) {
    if (!row) return null;
    if (row.data && row.data.kp) meta.keys = { kp: row.data.kp, kr: row.data.kr };
    return { data: isEncrypted(row) ? await unpack(row.data.enc) : row.data, at: row.updated_at };
  }
  async function upload() {
    const at = new Date().toISOString();
    const body = { user_id: auth.user.id, updated_at: at, data: { v: 2, enc: await pack(LP.data), kp: meta.keys.kp, kr: meta.keys.kr, tg: tgPayload() } };
    const rows = await api('/rest/v1/planner?on_conflict=user_id', {
      method: 'POST', token: await token(),
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body,
    });
    void rows;
    meta.remoteAt = at; meta.dirty = false; meta.lastOk = Date.now(); saveMeta();
  }
  async function push() {
    if (!auth || !dek || busy) return;
    if (!navigator.onLine) return setStatus('offline');
    busy = true; setStatus('busy');
    try {
      const row = await fetchRow();
      if (row && meta.remoteAt && row.updated_at > meta.remoteAt && new Date(row.updated_at).getTime() > (meta.editAt || 0)) {
        const r = await decodeRow(row);
        busy = false;
        return apply(r, 'З ІНШОГО ПРИСТРОЮ ПРИЙШЛА НОВІША ВЕРСІЯ');
      }
      await upload();
      setStatus('ok');
    } catch (e) { failed(e); } finally { busy = false; }
  }
  async function pull(manual) {
    if (!auth || !dek || busy) return;
    if (!navigator.onLine) return setStatus('offline');
    busy = true; setStatus('busy');
    try {
      const row = await fetchRow();
      if (!row) { busy = false; return push(); }
      if (row.updated_at !== meta.remoteAt) {
        if (!meta.dirty || new Date(row.updated_at).getTime() > (meta.editAt || 0)) {
          const r = await decodeRow(row);
          busy = false;
          return apply(r, manual ? 'ОНОВЛЕНО З ХМАРИ' : 'ПІДТЯГНУТО ЗМІНИ З ІНШОГО ПРИСТРОЮ');
        }
        busy = false;
        return push();
      }
      busy = false;
      if (meta.dirty || !isEncrypted(row)) return push();
      meta.lastOk = Date.now(); saveMeta();
      setStatus('ok');
      if (manual) spin(900);
    } catch (e) { busy = false; failed(e); }
  }
  function failed(e) {
    // ключ з цього пристрою не підходить до хмари (напр. на іншому пристрої почали з нуля) — просимо пароль
    if (e && e.name === 'OperationError') { dekRaw = dek = null; write(DEK_KEY, null); return gate('unlock'); }
    setStatus(navigator.onLine ? 'error' : 'offline');
    console.warn('Синхронізація:', e);
  }
  function apply(r, msg) {
    applying = true;
    try {
      localStorage.setItem(DATA_KEY, JSON.stringify(r.data));
      LP.reload();
    } finally { applying = false; }
    meta.remoteAt = r.at; meta.dirty = false; meta.lastOk = Date.now(); saveMeta();
    setStatus('ok');
    if (msg) spin(1400);
  }

  // ================= після входу: ключ і дані =================
  // Повертає, чи все готово; інакше сам показує потрібний екран (код відновлення тощо).
  async function afterLogin(password) {
    const row = await fetchRow();
    if (isEncrypted(row)) {
      try { await setDek(await unwrapWith(password, row.data.kp)); } catch (e) { return gate('code', { why: 'wrongkey', password }); }
      return finishSync(row);
    }
    // ще не зашифровано (новий акаунт або дані з попередньої версії): створюємо ключ і код відновлення
    await setDek(rnd(32));
    const code = newCode();
    meta.keys = { kp: await wrapWith(password), kr: await wrapWith(normCode(code)) };
    saveMeta();
    gate('showcode', { code, row });
    return false;
  }
  async function finishSync(row) {
    ungate();
    setStatus('busy');
    const r = await decodeRow(row);
    const hasLocal = LP.data.events.length || LP.data.goals.length || LP.data.tasks.length;
    if (!r) { meta.dirty = true; meta.editAt = Date.now(); saveMeta(); await push(); return afterReady(); }
    if (!hasLocal || JSON.stringify(r.data) === JSON.stringify(LP.data)) { apply(r, null); if (!isEncrypted(row)) await push(); return afterReady(); }
    setStatus('ok');
    const when = new Date(r.at);
    LP.modal({
      title: 'Що лишити?',
      submitText: 'Взяти з хмари',
      body: `<p>У хмарі вже є планер (збережено ${when.toLocaleDateString('uk-UA')} о ${when.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}), а на цьому пристрої — свої дані.</p>
        <p class="hint">«Взяти з хмари» — цей пристрій отримає дані з хмари. «Відправити ці» — дані з цього пристрою замінять хмарні. Про всяк випадок спершу можна зробити ЕКСПОРТ.</p>`,
      extra: [{ text: 'Відправити ці', onClick: () => { meta.remoteAt = r.at; meta.dirty = true; meta.editAt = Date.now(); saveMeta(); push().then(afterReady); } }],
      onSubmit: () => { apply(r, 'ДАНІ З ХМАРИ НА МІСЦІ'); if (!isEncrypted(row)) push(); afterReady(); },
    });
  }
  function afterReady() {
    if (LP.maybeTour) setTimeout(LP.maybeTour, 400);
  }
  function forget() {
    auth = null; write(AUTH_KEY, null);
    dekRaw = dek = null; write(DEK_KEY, null);
    meta = {}; saveMeta();
    setStatus('off');
  }

  // кожне збереження → «є невідправлене» і відправка за пару секунд
  LP.storage.afterSave = function () {
    if (applying || !auth) return;
    meta.dirty = true; meta.editAt = Date.now(); saveMeta();
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, 1500);
  };

  // ================= екран входу (замість планера) =================
  let screen = null;
  function ungate() {
    document.body.classList.remove('is-locked');
    if (screen) { screen.classList.add('is-leaving'); const s = screen; setTimeout(() => s.remove(), 220); screen = null; }
  }
  const field = (name, label, type = 'text', extra = '') => `<label class="field"><span>${label}</span><input type="${type}" name="${name}" ${extra}></label>`;
  const EMAIL = (v = '') => field('email', 'Пошта', 'text', `inputmode="email" autocomplete="username" autocapitalize="off" spellcheck="false" placeholder="you@gmail.com" value="${esc(v)}"`);
  function gate(kind, opts = {}) {
    document.body.classList.add('is-locked');
    if (LP.closeModal) LP.closeModal();
    if (!screen) {
      screen = document.createElement('div');
      screen.className = 'auth-screen';
      document.body.appendChild(screen);
    }
    const V = {
      login: {
        h: 'Вхід',
        p: 'Особистий планер: день, тиждень, рік, цілі й баланс. Твої дані шифруються на твоєму пристрої — їх не бачить ніхто, крім тебе.',
        f: `${EMAIL(opts.email)}${field('password', 'Пароль', 'password', 'autocomplete="current-password"')}`,
        b: '<button type="submit" class="btn btn-primary" data-act="in">УВІЙТИ</button><button type="button" class="btn" data-go="signup">СТВОРИТИ АКАУНТ</button>',
        l: '<button type="button" class="link-btn" data-go="forgot">Забув пароль?</button>',
      },
      signup: {
        h: 'Новий акаунт',
        p: 'Пароль — від 8 символів. Він же відкриває твої зашифровані дані, тож обери надійний і запамʼятай.',
        f: `${EMAIL(opts.email)}${field('password', 'Пароль', 'password', 'autocomplete="new-password"')}${field('password2', 'Ще раз пароль', 'password', 'autocomplete="new-password"')}`,
        b: '<button type="submit" class="btn btn-primary" data-act="up">СТВОРИТИ</button><button type="button" class="btn" data-go="login">У МЕНЕ Є АКАУНТ</button>',
      },
      forgot: {
        h: 'Відновити пароль',
        p: 'Надішлю на пошту посилання для нового пароля. Відкрий його на будь-якому пристрої.',
        f: EMAIL(opts.email),
        b: '<button type="submit" class="btn btn-primary" data-act="forgot">НАДІСЛАТИ ЛИСТ</button><button type="button" class="btn" data-go="login">НАЗАД</button>',
      },
      newpass: {
        h: 'Новий пароль',
        p: `Для ${esc(auth ? auth.user.email : '')}. Від 8 символів.`,
        f: `${field('password', 'Новий пароль', 'password', 'autocomplete="new-password"')}${field('password2', 'Ще раз', 'password', 'autocomplete="new-password"')}`,
        b: '<button type="submit" class="btn btn-primary" data-act="newpass">ЗБЕРЕГТИ ПАРОЛЬ</button>',
      },
      unlock: {
        h: 'Розблокувати',
        p: `Введи пароль від ${esc(auth ? auth.user.email : '')} — ним відкриваються твої зашифровані дані на цьому пристрої.`,
        f: field('password', 'Пароль', 'password', 'autocomplete="current-password"'),
        b: '<button type="submit" class="btn btn-primary" data-act="unlock">ВІДКРИТИ</button><button type="button" class="btn" data-act="out">ВИЙТИ</button>',
        l: '<button type="button" class="link-btn" data-go="forgot">Забув пароль?</button>',
      },
      code: {
        h: 'Код відновлення',
        p: opts.why === 'wrongkey'
          ? 'Пароль правильний, але ключ даних у хмарі загорнутий іншим паролем. Введи код відновлення, який ти зберіг при створенні акаунта.'
          : 'Пароль змінено через пошту, тож старий ключ ним не відкрити. Введи код відновлення, який ти зберіг при створенні акаунта.',
        f: field('code', 'Код (32 символи)', 'text', 'autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="ABCD-EFGH-…"'),
        b: '<button type="submit" class="btn btn-primary" data-act="code">ВІДКРИТИ ДАНІ</button>',
        l: '<button type="button" class="link-btn danger" data-act="fresh">Немає коду — почати з нуля</button>',
      },
      showcode: {
        h: 'Твій код відновлення',
        p: 'Твої дані зашифровані: без пароля їх не прочитає ніхто, навіть адміністратор. Якщо забудеш пароль — дані відкриє тільки цей код. Збережи його (у нотатки, менеджер паролів чи на папір) і нікому не показуй.',
        f: `<div class="code-box mono">${esc(opts.code || '')}</div>
            <div class="code-acts"><button type="button" class="btn btn-sm" data-act="copy">КОПІЮВАТИ</button></div>
            <label class="check"><input type="checkbox" name="saved"> Я зберіг код</label>`,
        b: '<button type="submit" class="btn btn-primary" data-act="saved">ДАЛІ</button>',
      },
      msg: { h: opts.h || '', p: opts.p || '', f: '', b: '<button type="button" class="btn btn-primary" data-go="login">ДО ВХОДУ</button>' },
    }[kind];
    screen.innerHTML = `
      <div class="auth-card">
        <div class="auth-brand"><svg viewBox='0 0 32 32' aria-hidden='true'><rect x='4' y='3.5' width='24' height='2.8' fill='currentColor'/><rect x='4' y='8.3' width='24' height='2.8' fill='currentColor'/><rect x='4' y='13.1' width='24' height='2.8' fill='currentColor'/><rect x='4' y='22.7' width='24' height='2.8' fill='currentColor'/><rect x='4' y='27.5' width='24' height='2.8' fill='currentColor'/><rect x='4' y='17.9' width='24' height='2.8' fill='var(--red)' transform='rotate(-11 16 19.3)'/></svg>НА СВІЙ ЛАД</div>
        <form class="auth-form" novalidate autocomplete="on">
          <h1>${V.h}</h1>
          <p class="auth-lead">${V.p}</p>
          ${V.f}
          <p class="auth-note${opts.warn ? ' warn' : ''}">${esc(opts.note || '')}</p>
          <div class="auth-btns">${V.b}</div>
          ${V.l ? `<div class="auth-links">${V.l}</div>` : ''}
        </form>
      </div>`;
    const form = screen.querySelector('form');
    const first = form.querySelector('input:not([type=checkbox])');
    if (first) setTimeout(() => (opts.email && form.password ? form.password : first).focus(), 40);
    screen.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => gate(b.dataset.go, { email: form.email ? form.email.value.trim() : opts.email })));
    form.addEventListener('submit', (e) => { e.preventDefault(); act(form.querySelector('[type=submit]').dataset.act, form, opts); });
    form.querySelectorAll('button[type=button][data-act]').forEach((b) => b.addEventListener('click', () => act(b.dataset.act, form, opts)));
  }
  function say(form, text, warn = true) {
    const n = form.querySelector('.auth-note');
    n.textContent = text;
    n.classList.toggle('warn', warn);
  }
  function human(err) {
    const m = (err && err.message) || '';
    if (/invalid login|invalid_credentials|invalid grant/i.test(m)) return 'Пошта або пароль не підходять.';
    if (/not confirmed/i.test(m)) return 'Пошту ще не підтверджено — натисни посилання в листі, потім увійди.';
    if (/already registered|already exists/i.test(m)) return 'Такий акаунт уже є — просто увійди.';
    if (/rate|limit|seconds/i.test(m)) return 'Забагато спроб — зачекай хвилину.';
    if (/same.*password|different from the old/i.test(m)) return 'Новий пароль має відрізнятися від старого.';
    if (/weak|short|at least/i.test(m)) return 'Пароль заслабкий — довший, з цифрами чи символами.';
    if (m === 'Failed to fetch') return 'Немає звʼязку з сервером. Перевір інтернет.';
    return m || 'Щось пішло не так.';
  }
  async function act(a, form, opts) {
    const btns = form.querySelectorAll('button');
    const email = form.email ? form.email.value.trim().toLowerCase() : auth && auth.user.email;
    const pw = form.password ? form.password.value : '';
    const lock = (on) => btns.forEach((b) => (b.disabled = on));
    try {
      if ((a === 'in' || a === 'up' || a === 'forgot') && !/^\S+@\S+\.\S+$/.test(email)) return say(form, 'Перевір пошту.');
      if (a === 'up' || a === 'newpass') {
        if (pw.length < 8) return say(form, 'Пароль — щонайменше 8 символів.');
        if (pw !== form.password2.value) return say(form, 'Паролі не збігаються.');
      }
      if ((a === 'in' || a === 'unlock') && !pw) return say(form, 'Введи пароль.');
      lock(true);
      if (a === 'in') {
        say(form, 'Входжу…', false);
        keepSession(await passwordGrant(email, pw));
        meta = {}; saveMeta();
        await afterLogin(pw);
      } else if (a === 'up') {
        say(form, 'Створюю акаунт…', false);
        const r = await api('/auth/v1/signup' + redirect(), { method: 'POST', body: { email, password: pw } });
        if (r && r.access_token) { keepSession(r); meta = {}; saveMeta(); await afterLogin(pw); }
        else gate('msg', { h: 'Перевір пошту', p: `На ${esc(email)} прийшов лист. Натисни в ньому посилання, а потім увійди з паролем.` });
      } else if (a === 'forgot') {
        await api('/auth/v1/recover' + redirect(), { method: 'POST', body: { email } });
        gate('msg', { h: 'Лист надіслано', p: `Якщо акаунт ${esc(email)} існує, туди прийшов лист із посиланням. Відкрий його й задай новий пароль. Не бачиш листа — глянь у «Спам».` });
      } else if (a === 'unlock') {
        keepSession(await passwordGrant(email, pw));
        await afterLogin(pw);
      } else if (a === 'newpass') {
        await api('/auth/v1/user', { method: 'PUT', token: await token(), body: { password: pw } });
        await rewrapAfterReset(pw);
      } else if (a === 'code') {
        const row = await fetchRow();
        try { await setDek(await unwrapWith(normCode(form.code.value), row.data.kr)); } catch (e) { lock(false); return say(form, 'Код не підходить. Перевір літери й цифри.'); }
        await rekeyAndSync(row, opts.password);
      } else if (a === 'fresh') {
        if (!confirm('Почати з нуля? Зашифровані дані в хмарі буде замінено порожнім планером. Їх уже не відновити.')) return lock(false);
        if (!confirm('Точно? Це назавжди.')) return lock(false);
        localStorage.removeItem(DATA_KEY);
        LP.reload();
        await setDek(rnd(32));
        const code = newCode();
        meta.keys = { kp: await wrapWith(opts.password), kr: await wrapWith(normCode(code)) };
        meta.remoteAt = null; saveMeta();
        gate('showcode', { code, row: null, fresh: true });
      } else if (a === 'copy') {
        try { await navigator.clipboard.writeText(opts.code); say(form, 'Скопійовано.', false); } catch (e) { say(form, 'Не вдалося скопіювати — виділи код і скопіюй вручну.'); }
      } else if (a === 'saved') {
        if (!form.saved.checked) { lock(false); return say(form, 'Спершу збережи код і постав галочку.'); }
        if (opts.fresh) { ungate(); meta.dirty = true; meta.editAt = Date.now(); saveMeta(); await upload(); setStatus('ok'); afterReady(); }
        else if (opts.rekey) { ungate(); await upload(); setStatus('ok'); if (LP.toast) LP.toast('НОВИЙ КОД ЗБЕРЕЖЕНО'); }
        else await finishSync(opts.row);
      } else if (a === 'out') {
        await signOut();
      }
    } catch (err) {
      say(form, human(err));
    } finally { lock(false); }
  }
  // пароль після скидання: ключ є на цьому пристрої — перезагортаємо; немає — потрібен код відновлення
  async function rewrapAfterReset(pw) {
    const row = await fetchRow();
    if (!isEncrypted(row)) return afterLogin(pw);
    const local = read(DEK_KEY);
    if (local) {
      await setDek(unb64(local));
      try { await unpack(row.data.enc); } catch (e) { return gate('code', { password: pw }); }
      await rekeyAndSync(row, pw);
      if (LP.toast) LP.toast('ПАРОЛЬ ЗМІНЕНО');
      return;
    }
    gate('code', { password: pw });
  }

  // ключ даних той самий, але тепер загорнутий новим паролем: беремо дані з хмари й одразу відправляємо з новим kp
  async function rekeyAndSync(row, pw) {
    const kp = await wrapWith(pw);
    const r = await decodeRow(row);
    meta.keys = { kp, kr: row.data.kr };
    ungate();
    apply(r, null);
    await upload();
    setStatus('ok');
    afterReady();
  }

  async function signOut() {
    if (meta.dirty && dek) { try { await upload(); } catch (e) { if (!confirm('Не всі зміни встигли піти в хмару. Все одно вийти? Невідправлене пропаде.')) return; } }
    try { await api('/auth/v1/logout', { method: 'POST', token: await token() }); } catch (e) {}
    forget();
    localStorage.removeItem(DATA_KEY);
    location.reload();
  }

  // ================= кнопка в шапці й вікно акаунта =================
  // значок синхронізації: стрілочки крутяться, поки йде обмін; ! — помилка; сірий — немає інтернету
  let spinUntil = 0;
  function paint() {
    const b = document.getElementById('btn-sync');
    if (!b) return;
    const spinning = status === 'busy' || Date.now() < spinUntil;
    b.classList.remove('is-off', 'is-ok', 'is-busy', 'is-offline', 'is-error');
    b.classList.add('is-' + status);
    b.classList.toggle('is-spin', spinning);
    b.title = status === 'error' ? 'Не вдалося синхронізувати — натисни, щоб спробувати ще' : status === 'offline' ? 'Немає інтернету — відправлю, щойно зʼявиться' : 'Акаунт і синхронізація · ' + (auth ? auth.user.email : '');
    b.setAttribute('aria-label', b.title);
  }
  function spin(ms = 1200) { spinUntil = Date.now() + ms; paint(); setTimeout(paint, ms + 30); }
  function fmtAgo(ms) {
    if (!ms) return 'ще ні разу';
    const s = Math.round((Date.now() - ms) / 1000);
    if (s < 60) return 'щойно';
    if (s < 3600) return Math.round(s / 60) + ' хв тому';
    return new Date(ms).toLocaleString('uk-UA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
  LP.openSync = function () {
    if (!auth) return gate('login');
    LP.modal({
      title: 'Акаунт',
      submitText: 'Синхронізувати зараз',
      body: `<p class="mono sync-who">${esc(auth.user.email)}</p>
        <p>Синхронізовано: <b>${fmtAgo(meta.lastOk)}</b>${status === 'error' ? ' · <span class="warn">остання спроба не вдалася</span>' : status === 'offline' ? ' · немає інтернету' : ''}.</p>
        <p class="hint">🔒 Дані шифруються на пристрої — у хмарі лише шифр. ${LP.data.settings.tgChat ? 'Для нагадувань у Telegram у хмару йде розклад на 3 тижні (назви й час справ).' : ''}</p>
        <div class="acc-acts">
          <button type="button" class="btn btn-sm" data-acc="pass">ЗМІНИТИ ПАРОЛЬ</button>
          <button type="button" class="btn btn-sm" data-acc="code">НОВИЙ КОД ВІДНОВЛЕННЯ</button>
        </div>`,
      extra: [{ text: 'Вийти', className: 'btn-danger', onClick: () => { signOut(); } }],
      onOpen: (form) => {
        form.querySelector('[data-acc=pass]').addEventListener('click', changePassword);
        form.querySelector('[data-acc=code]').addEventListener('click', async () => {
          if (!dek) return;
          const code = newCode();
          meta.keys = { kp: meta.keys.kp, kr: await wrapWith(normCode(code)) }; saveMeta();
          gate('showcode', { code, rekey: true });
        });
      },
      onSubmit: () => { pull(true); },
    });
  };
  function changePassword() {
    LP.modal({
      title: 'Змінити пароль',
      submitText: 'Змінити',
      body: `${field('old', 'Поточний пароль', 'password', 'autocomplete="current-password"')}
        ${field('password', 'Новий пароль (від 8 символів)', 'password', 'autocomplete="new-password"')}
        ${field('password2', 'Ще раз новий', 'password', 'autocomplete="new-password"')}
        <p class="hint sync-note"></p>`,
      onSubmit: (form) => {
        const note = form.querySelector('.sync-note');
        const pw = form.password.value;
        if (pw.length < 8) { note.textContent = 'Пароль — щонайменше 8 символів.'; return false; }
        if (pw !== form.password2.value) { note.textContent = 'Паролі не збігаються.'; return false; }
        note.textContent = 'Змінюю…';
        (async () => {
          try {
            keepSession(await passwordGrant(auth.user.email, form.old.value));
            await api('/auth/v1/user', { method: 'PUT', token: await token(), body: { password: pw } });
            meta.keys = { kp: await wrapWith(pw), kr: meta.keys.kr }; saveMeta();
            await upload();
            LP.closeModal();
            if (LP.toast) LP.toast('ПАРОЛЬ ЗМІНЕНО');
          } catch (e) { note.textContent = /invalid/i.test(e.message) ? 'Поточний пароль не підходить.' : human(e); note.classList.add('warn'); }
        })();
        return false;
      },
    });
  }

  // посилання з листа: підтвердження пошти або скидання пароля — токени в хеші адреси
  function fromHash() {
    const h = location.hash;
    if (/error_description=/.test(h)) {
      const p = new URLSearchParams(h.slice(1));
      history.replaceState(null, '', location.pathname + location.search);
      return { error: p.get('error_description') };
    }
    if (!/access_token=/.test(h)) return null;
    const p = new URLSearchParams(h.slice(1));
    history.replaceState(null, '', location.pathname + location.search);
    const access = p.get('access_token');
    try {
      const payload = JSON.parse(atob(access.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      keepSession({ access_token: access, refresh_token: p.get('refresh_token'), expires_in: Number(p.get('expires_in')) || 3600, user: { id: payload.sub, email: payload.email } });
      return { type: p.get('type') || 'magiclink' };
    } catch (e) { return null; }
  }

  async function start() {
    const btn = document.getElementById('btn-sync');
    if (btn) btn.addEventListener('click', () => (status === 'error' ? pull(true) : LP.openSync()));
    const link = fromHash();
    if (link && link.error) return gate('login', { note: /expired|invalid/i.test(link.error) ? 'Посилання застаріло — надішли новий лист.' : link.error });
    if (link && link.type === 'recovery') return gate('newpass');
    if (!auth) return gate('login', link && link.type === 'signup' ? { note: 'Пошту підтверджено — тепер увійди.', warn: false } : {});
    const local = read(DEK_KEY);
    if (!local || (link && link.type === 'signup')) return gate('unlock');
    await setDek(unb64(local), false);
    setStatus('ok');
    pull();
    afterReady();
  }
  // посилання з листа відкрили у вкладці, де планер уже був відкритий
  window.addEventListener('hashchange', () => { if (/access_token=|error_description=/.test(location.hash)) location.reload(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pull(); else if (meta.dirty) push(); });
  window.addEventListener('online', () => pull());
  window.addEventListener('offline', () => { if (auth) setStatus('offline'); });
  setInterval(() => { if (document.visibilityState === 'visible') pull(); }, 60000);

  // на час завантаження ховаємо планер, щоб без входу він не блимав
  document.documentElement.classList.add('auth-pending');
  const go = () => start().catch((e) => { console.error(e); gate('login', { note: human(e) }); }).finally(() => document.documentElement.classList.remove('auth-pending'));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go);
  else setTimeout(go, 0);

  LP.sync = { get signedIn() { return !!auth; }, get email() { return auth && auth.user.email; }, now: () => pull(true) };
})(window.LP);
