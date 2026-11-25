// «Опора»: що робити, коли важко. Якір (спокійний екран із текстом), розбір переживання,
// дистанціювання від думки і короткі правила для тіла. Записи про переживання лишаються в історії.
window.LP = window.LP || {};

(function (LP) {
  const u = LP.u;
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ANCHOR_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="4.6" r="2.1"/><path d="M12 6.7V21"/><path d="M7.5 10.5h9"/><path d="M4 13.5c.4 4.4 3.6 7.5 8 7.5s7.6-3.1 8-7.5"/></svg>';

  // ---------------- 1. Кинути якір ----------------
  // [текст, скільки секунд тримати після появи]
  const ANCHOR = [
    ['Зупинись на хвилину.', 2.5],
    ['Нічого не треба виправляти. Просто побудь тут.', 3],
    ['Про що ти зараз думаєш?', 2],
    ['Назви ці думки подумки. Без оцінок.', 7],
    ['Що ти зараз відчуваєш?', 2],
    ['Назви це словом: тривога, втома, злість, сум.', 7],
    ['Тепер пройдися увагою по тілу.', 3],
    ['Від маківки до стоп. Де напруга? Де тепло чи холод?', 9],
    ['Скажи собі: «Я помічаю, що відчуваю…»', 7],
    ['Порухайся так, як хочеться.', 2],
    ['Потягнись. Розправ плечі. Натисни стопами в підлогу.', 10],
    ['Тепер подивись навколо.', 2],
    ['Знайди пʼять речей, які бачиш.', 9],
    ['Послухай. Які три звуки ти чуєш?', 9],
    ['Чим тут пахне?', 6],
    ['Чого ти торкаєшся? Яке воно на дотик?', 7],
    ['Який смак у роті?', 5],
    ['Думки й почуття нікуди не зникли. Але ти тут, і ти тримаєшся.', 5],
    ['Якір кинуто.', 3],
  ];
  const FADE_MS = 1100;

  // ---- голос: найприємніший український голос, який є на пристрої ----
  const VOICE_KEY = 'life-planner.anchorVoice';
  const synth = window.speechSynthesis || null;
  const ukVoices = () => (synth ? synth.getVoices().filter((v) => /^uk(-|_|$)/i.test(v.lang)) : []);
  function bestVoice() {
    const score = (v) => (/natural|neural|online/i.test(v.name) ? 4 : 0) + (/enhanced|premium|покращ|розшир/i.test(v.name) ? 3 : 0)
      + (/polina|поліна|lesya|леся/i.test(v.name) ? 1 : 0) + (/google/i.test(v.name) ? 1 : 0);
    return ukVoices().sort((a, b) => score(b) - score(a))[0] || null;
  }
  const voiceOn = () => { try { return localStorage.getItem(VOICE_KEY) !== '0'; } catch (e) { return true; } };
  // голоси в браузері підвантажуються не одразу
  const voicesReady = () => new Promise((res) => {
    if (!synth) return res();
    if (synth.getVoices().length) return res();
    const done = () => { synth.removeEventListener && synth.removeEventListener('voiceschanged', done); res(); };
    if (synth.addEventListener) synth.addEventListener('voiceschanged', done);
    setTimeout(done, 1200);
  });

  let scene = null;
  function closeScene(fast) {
    if (!scene) return;
    const s = scene;
    scene = null;
    s.timers.forEach(clearTimeout);
    if (synth) synth.cancel();
    document.removeEventListener('keydown', s.onKey, true);
    if (s.lock && s.lock.release) s.lock.release().catch(() => {});
    document.body.classList.remove('calm-on');
    s.el.classList.add('is-leaving');
    if (fast) s.el.classList.add('is-fast');
    setTimeout(() => s.el.remove(), fast ? 300 : 1150);
  }

  const SPEAKER_ON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>';
  const SPEAKER_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>';

  LP.dropAnchor = function () {
    if (scene) return;
    if (LP.closeModal) LP.closeModal();
    const el = document.createElement('div');
    el.className = 'calm-scene';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Кинути якір');
    el.innerHTML = `<div class="calm-blobs" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
      <p class="calm-line" aria-live="polite"></p>
      ${synth ? `<button type="button" class="calm-voice" hidden aria-pressed="${voiceOn()}"></button>` : ''}
      <div class="calm-progress" aria-hidden="true"><i></i></div><p class="calm-exit">Натисни будь-де, щоб повернутись</p>`;
    document.body.appendChild(el);
    document.body.classList.add('calm-on');
    const line = el.querySelector('.calm-line'), bar = el.querySelector('.calm-progress i'), vbtn = el.querySelector('.calm-voice');
    const s = { el, timers: [], lock: null, voice: null, speak: voiceOn() };
    scene = s;
    const later = (fn, ms) => s.timers.push(setTimeout(fn, ms));
    if (navigator.wakeLock && navigator.wakeLock.request) navigator.wakeLock.request('screen').then((l) => { if (scene === s) s.lock = l; else l.release(); }).catch(() => {});

    // iPhone дозволяє говорити лише після дотику: «тихе» слово просто зараз відкриває голос на всю сцену
    if (synth) { try { synth.cancel(); const u0 = new SpeechSynthesisUtterance(' '); u0.volume = 0; synth.speak(u0); } catch (e) { /* без голосу */ } }
    const drawVoice = () => {
      if (!vbtn) return;
      vbtn.innerHTML = `${s.speak ? SPEAKER_ON : SPEAKER_OFF}<span>${s.speak ? 'Голос' : 'Без голосу'}</span>`;
      vbtn.setAttribute('aria-pressed', String(s.speak));
      vbtn.setAttribute('aria-label', s.speak ? 'Вимкнути голос' : 'Увімкнути голос');
    };
    voicesReady().then(() => {
      if (scene !== s) return;
      s.voice = bestVoice();
      if (vbtn && s.voice) { vbtn.hidden = false; drawVoice(); }
    });
    if (vbtn) vbtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      s.speak = !s.speak;
      try { localStorage.setItem(VOICE_KEY, s.speak ? '1' : '0'); } catch (err) { /* приватний режим */ }
      if (!s.speak && synth) synth.cancel();
      drawVoice();
    });

    const still = reduced();
    const readMs = (t) => 700 + t.split(' ').length * 300;     // скільки читати без голосу
    const speechMs = (t) => 600 + t.split(' ').length * 430;   // приблизна тривалість голосу
    const total = ANCHOR.reduce((n, [t, hold]) => n + readMs(t) + hold * 1000 + FADE_MS, 0);
    let spent = 0;
    const show = (i) => {
      if (scene !== s) return;
      if (i >= ANCHOR.length) return closeScene();
      const [text, hold] = ANCHOR[i];
      line.classList.remove('is-out', 'is-in');
      line.textContent = text;
      void line.offsetWidth;            // перезапустити появу
      line.classList.add('is-in');
      let moved = false;
      const next = () => {
        if (moved || scene !== s) return;
        moved = true;
        later(() => line.classList.add('is-out'), hold * 1000);
        later(() => show(i + 1), hold * 1000 + FADE_MS);
      };
      const step = readMs(text) + hold * 1000 + FADE_MS;
      spent += step;
      bar.style.transitionDuration = step + 'ms';
      bar.style.width = Math.min(100, (spent / total) * 100) + '%';
      if (s.speak && s.voice && synth) {
        // речення з'являється разом із голосом; далі — пауза, як і без голосу
        const ut = new SpeechSynthesisUtterance(text.replace(/[«»]/g, ''));
        ut.voice = s.voice;
        ut.lang = s.voice.lang;
        ut.rate = 0.86;
        ut.pitch = 1;
        ut.onend = next;
        ut.onerror = next;
        synth.speak(ut);
        later(next, speechMs(text) * 1.8 + 1500); // запобіжник: деякі браузери не повідомляють про кінець
      } else later(next, still ? 400 : readMs(text));
    };
    later(() => show(0), 1400);
    // будь-який клік чи клавіша одразу повертає назад (з невеликою затримкою, щоб не спрацювало від кліку, який відкрив)
    s.onKey = (e) => { e.preventDefault(); e.stopPropagation(); closeScene(true); };
    later(() => {
      if (scene !== s) return;
      el.addEventListener('pointerdown', (e) => { if (!e.target.closest('.calm-voice')) closeScene(true); });
      document.addEventListener('keydown', s.onKey, true);
    }, 500);
  };

  // ---------------- 2. Розібрати переживання ----------------
  // корисний варіант завжди перший у даних, на екрані порядок як у даних
  const QUESTIONS = [
    { q: 'Про що це переживання?', a: 'Про проблему, яка є насправді', b: 'Про те, що може статися. «А що, як…»' },
    { q: 'Як ти бачиш ситуацію?', a: 'Тверезо: є ризики, є і шанси', b: 'Здається, що все скінчиться катастрофою' },
    { q: 'До чого ведуть ці думки?', a: 'До дій: я бачу, що можу зробити', b: 'Ні до чого. Або до перевірок і уникання' },
    { q: 'Скільки це триває?', a: 'Подумав і можу відкласти', b: 'Крутиться довго, не можу зупинити' },
    { q: 'Чи можеш ти на це вплинути?', a: 'Так, хоча б частково', b: 'Ні, це від мене не залежить' },
  ];
  const OUTCOME = { now: 'зробити зараз', planned: 'є план', letgo: 'відпустити' };
  const worries = () => (LP.data.worries = LP.data.worries || []);

  let flow = null;
  function closeFlow() {
    if (!flow) return;
    const f = flow;
    flow = null;
    document.removeEventListener('keydown', f.onKey, true);
    f.el.classList.add('is-leaving');
    setTimeout(() => f.el.remove(), 260);
    if (LP.view.tab === 'calm') LP.render();
  }
  // спільна оболонка для покрокових технік: спокійний екран, один крок за раз
  function openFlow(title, start) {
    closeFlow();
    const el = document.createElement('div');
    el.className = 'calm-flow';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', title);
    el.innerHTML = `<div class="calm-glow" aria-hidden="true"></div>
      <header class="cf-head"><span class="mono cf-title">${u.esc(title.toUpperCase())}</span><button type="button" class="cf-close" aria-label="Закрити">✕</button></header>
      <div class="cf-body"></div>`;
    document.body.appendChild(el);
    const body = el.querySelector('.cf-body');
    const f = { el, body };
    flow = f;
    f.onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeFlow(); } };
    document.addEventListener('keydown', f.onKey, true);
    el.querySelector('.cf-close').addEventListener('click', closeFlow);
    // step(html, bind): малює крок із плавною зміною
    f.step = (html, bind) => {
      body.classList.remove('is-in');
      setTimeout(() => {
        if (flow !== f) return;
        body.innerHTML = `<div class="cf-step">${html}</div>`;
        body.scrollTop = 0;
        requestAnimationFrame(() => body.classList.add('is-in'));
        if (bind) bind(body);
        const auto = body.querySelector('[autofocus]');
        if (auto && !LP.isMobile()) auto.focus();
      }, body.innerHTML ? 180 : 0);
    };
    start(f);
  }
  const dots = (n, of) => `<div class="cf-dots" aria-hidden="true">${Array.from({ length: of }, (_, k) => `<i class="${k < n ? 'on' : ''}"></i>`).join('')}</div>`;

  LP.openWorry = function () {
    openFlow('Розібрати переживання', (f) => {
      const w = { id: u.uid(), date: u.today(), text: '', answers: [], useful: null, real: null, step: '', when: null, outcome: null };
      const save = () => {
        const list = worries();
        if (!list.includes(w)) list.push(w);
        LP.save({ render: false });
      };
      const write = () => f.step(`
          <h2>Що тебе турбує?</h2>
          <p class="cf-sub">Запиши одним-двома реченнями, як є.</p>
          <textarea class="cf-input" rows="3" maxlength="400" autofocus placeholder="Наприклад: боюся, що не встигну здати проєкт">${u.esc(w.text)}</textarea>
          <div class="cf-actions"><button type="button" class="btn btn-primary" data-next>Далі</button></div>`, (b) => {
        const go = () => {
          const t = b.querySelector('textarea').value.trim();
          if (!t) return b.querySelector('textarea').focus();
          w.text = t;
          ask(0);
        };
        b.querySelector('[data-next]').addEventListener('click', go);
        b.querySelector('textarea').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) go(); });
      });
      const ask = (i) => {
        if (i >= QUESTIONS.length) return verdict();
        const q = QUESTIONS[i];
        f.step(`${dots(i + 1, QUESTIONS.length)}
          <p class="cf-quote">«${u.esc(w.text)}»</p>
          <h2>${q.q}</h2>
          <div class="cf-choices"><button type="button" class="cf-choice" data-a="1">${q.a}</button><button type="button" class="cf-choice" data-a="0">${q.b}</button></div>
          <div class="cf-actions"><button type="button" class="link-btn" data-back>← Назад</button></div>`, (b) => {
          b.querySelectorAll('[data-a]').forEach((bt) => bt.addEventListener('click', () => { w.answers[i] = bt.dataset.a === '1'; ask(i + 1); }));
          b.querySelector('[data-back]').addEventListener('click', () => (i ? ask(i - 1) : write()));
        });
      };
      const verdict = () => {
        const good = w.answers.filter(Boolean).length;
        w.useful = good >= 3;
        save();
        f.step(`
          <p class="cf-quote">«${u.esc(w.text)}»</p>
          <h2>${w.useful ? 'Схоже, це корисне переживання' : 'Схоже, це некорисне переживання'}</h2>
          <p class="cf-sub">${w.useful
            ? 'Воно про справжню проблему, і з ним можна щось зробити. Такому переживанню потрібен план.'
            : 'Воно забирає сили, але не веде до дій. Таке переживання не треба вирішувати, його можна відпустити.'}</p>
          <div class="cf-marks">${QUESTIONS.map((q, k) => `<span class="${w.answers[k] ? 'is-good' : 'is-bad'}">${w.answers[k] ? q.a : q.b}</span>`).join('')}</div>
          <h3>Це справжня проблема, і ти можеш щось зробити, щоб її вирішити?</h3>
          <div class="cf-choices is-row"><button type="button" class="cf-choice ${w.useful ? 'is-hint' : ''}" data-real="1">Так</button><button type="button" class="cf-choice ${w.useful ? '' : 'is-hint'}" data-real="0">Ні</button></div>`, (b) => {
          b.querySelectorAll('[data-real]').forEach((bt) => bt.addEventListener('click', () => {
            w.real = bt.dataset.real === '1';
            save();
            if (w.real) plan(); else letgo();
          }));
        });
      };
      const plan = () => f.step(`
          <h2>Який перший крок?</h2>
          <p class="cf-sub">Не весь план, а одна дія, з якої можна почати.</p>
          <input type="text" class="cf-input" maxlength="140" autofocus value="${u.esc(w.step)}" placeholder="Наприклад: написати керівнику про терміни">
          <div class="cf-actions"><button type="button" class="link-btn" data-back>← Назад</button><button type="button" class="btn btn-primary" data-next>Далі</button></div>`, (b) => {
        const go = () => {
          const t = b.querySelector('input').value.trim();
          if (!t) return b.querySelector('input').focus();
          w.step = t;
          save();
          nowOrLater();
        };
        b.querySelector('[data-next]').addEventListener('click', go);
        b.querySelector('input').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
        b.querySelector('[data-back]').addEventListener('click', verdict);
      });
      const nowOrLater = () => f.step(`
          <p class="cf-quote">${u.esc(w.step)}</p>
          <h2>Можеш зробити це просто зараз?</h2>
          <div class="cf-choices is-row"><button type="button" class="cf-choice" data-now="1">Так</button><button type="button" class="cf-choice" data-now="0">Ні</button></div>
          <div class="cf-actions"><button type="button" class="link-btn" data-back>← Назад</button></div>`, (b) => {
        b.querySelector('[data-back]').addEventListener('click', plan);
        b.querySelectorAll('[data-now]').forEach((bt) => bt.addEventListener('click', () => {
          if (bt.dataset.now === '1') {
            w.outcome = 'now';
            save();
            done('Тоді зроби це', 'Закрий цю сторінку і зроби. Переживання свою роботу вже виконало.');
          } else later();
        }));
      });
      const later = () => f.step(`
          <p class="cf-quote">${u.esc(w.step)}</p>
          <h2>Коли ти це зробиш?</h2>
          <p class="cf-sub">Коли є день, думка перестає крутитися: вона вже в плані.</p>
          <input type="date" class="cf-input cf-date" value="${w.when || u.addDays(u.today(), 1)}" min="${u.today()}">
          <label class="cf-check"><input type="checkbox" checked data-task> Додати цей крок у беклог</label>
          <div class="cf-actions"><button type="button" class="link-btn" data-back>← Назад</button><button type="button" class="btn btn-primary" data-next>Готово</button></div>`, (b) => {
        b.querySelector('[data-back]').addEventListener('click', nowOrLater);
        b.querySelector('[data-next]').addEventListener('click', () => {
          w.when = b.querySelector('input[type=date]').value || null;
          w.outcome = 'planned';
          const toTask = b.querySelector('[data-task]').checked;
          if (toTask) LP.saveTask({ title: w.step, stage: 'backlog', note: `Із переживання: ${w.text}` + (w.when ? ` · зробити ${u.fmtDay(w.when)}` : '') }, true);
          save();
          done('Є план', `${toTask ? 'Крок лежить у беклозі. ' : ''}До ${w.when ? u.fmtDay(w.when) : 'того дня'} про це можна не думати.`);
        });
      });
      const letgo = () => {
        w.outcome = 'letgo';
        save();
        f.step(`
          <h2>Тоді це переживання можна відпустити</h2>
          <p class="cf-sub">Воно нічого не вирішить, а сили забере. Переключи увагу на те, що справді корисне.</p>
          <div class="cf-choices"><button type="button" class="cf-choice" data-go="defuse">Відпустити думку<small>коротка вправа на хвилину</small></button><button type="button" class="cf-choice" data-go="anchor">Кинути якір<small>повернутись у тут і зараз</small></button></div>
          <div class="cf-actions"><button type="button" class="btn" data-go="done">Готово</button></div>`, (b) => {
          b.querySelectorAll('[data-go]').forEach((bt) => bt.addEventListener('click', () => {
            const go = bt.dataset.go, text = w.text;
            closeFlow();
            if (go === 'defuse') LP.openDefuse(text);
            if (go === 'anchor') LP.dropAnchor();
          }));
        });
      };
      const done = (h, p) => f.step(`<h2>${h}</h2><p class="cf-sub">${u.esc(p)}</p><div class="cf-actions"><button type="button" class="btn btn-primary" data-done autofocus>Готово</button></div>`,
        (b) => b.querySelector('[data-done]').addEventListener('click', closeFlow));
      write();
    });
  };

  // ---------------- 3. Відпустити думку (дистанціювання) ----------------
  const WAYS = [
    { id: 'balloon', name: 'Кулька', hint: 'думка летить угору', say: 'Думка написана на повітряній кульці. Розтисни пальці.' },
    { id: 'stream', name: 'Струмок', hint: 'кораблик пливе геть', say: 'Думка лежить у паперовому кораблику. Пусти його за водою.' },
    { id: 'tram', name: 'Трамвай', hint: 'це не мій трамвай', say: 'Підʼїхав трамвай із цією думкою. Це не твій трамвай. Тобі на інший.' },
  ];
  LP.openDefuse = function (preset) {
    openFlow('Відпустити думку', (f) => {
      let thought = preset || '';
      const write = () => f.step(`
          <h2>Яка думка зараз крутиться?</h2>
          <p class="cf-sub">Запиши її так, як вона звучить у голові.</p>
          <textarea class="cf-input" rows="2" maxlength="200" autofocus placeholder="Наприклад: у мене нічого не вийде">${u.esc(thought)}</textarea>
          <div class="cf-actions"><button type="button" class="btn btn-primary" data-next>Далі</button></div>`, (b) => {
        const go = () => {
          const t = b.querySelector('textarea').value.trim();
          if (!t) return b.querySelector('textarea').focus();
          thought = t;
          name();
        };
        b.querySelector('[data-next]').addEventListener('click', go);
        b.querySelector('textarea').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); go(); } });
      });
      const name = () => f.step(`${dots(1, 4)}
          <p class="cf-kicker mono">1. ВПІЗНАЙ І НАЗВИ</p>
          <h2>Я помічаю думку:</h2>
          <p class="cf-thought">«${u.esc(thought)}»</p>
          <p class="cf-sub">Це думка. Не факт і не наказ. Можна навіть із гумором: «О, знову ввімкнулась ця хвиля».</p>
          <div class="cf-actions"><button type="button" class="link-btn" data-back>← Назад</button><button type="button" class="btn btn-primary" data-next autofocus>Далі</button></div>`, (b) => {
        b.querySelector('[data-next]').addEventListener('click', remind);
        b.querySelector('[data-back]').addEventListener('click', write);
      });
      const remind = () => f.step(`${dots(2, 4)}
          <p class="cf-kicker mono">2. НАГАДАЙ СОБІ</p>
          <h2>Ця думка зараз не допомагає</h2>
          <p class="cf-sub">Від неї опускаються руки. Сперечатися з нею теж не варто: це як розмова з аферистом, тільки час забирає.</p>
          <p class="cf-sub">Проганяти її не треба. Проганяти означає боротися, а що більше борешся з думкою, то частіше вона вертається.</p>
          <div class="cf-actions"><button type="button" class="link-btn" data-back>← Назад</button><button type="button" class="btn btn-primary" data-next autofocus>Далі</button></div>`, (b) => {
        b.querySelector('[data-next]').addEventListener('click', choose);
        b.querySelector('[data-back]').addEventListener('click', name);
      });
      const choose = () => f.step(`${dots(3, 4)}
          <p class="cf-kicker mono">3. ВІДПУСТИ</p>
          <h2>Як її відпустити?</h2>
          <div class="cf-choices is-row">${WAYS.map((w) => `<button type="button" class="cf-choice" data-way="${w.id}">${w.name}<small>${w.hint}</small></button>`).join('')}</div>
          <p class="cf-sub cf-tip">Ще працює: проспівати думку на мотив «Happy Birthday» або сказати її вголос смішним голосом.</p>
          <div class="cf-actions"><button type="button" class="link-btn" data-back>← Назад</button></div>`, (b) => {
        b.querySelector('[data-back]').addEventListener('click', remind);
        b.querySelectorAll('[data-way]').forEach((bt) => bt.addEventListener('click', () => release(WAYS.find((w) => w.id === bt.dataset.way))));
      });
      const release = (way) => f.step(`
          <p class="cf-sub cf-say">${way.say}</p>
          <div class="cf-stage way-${way.id}" aria-hidden="true">
            ${way.id === 'stream' ? '<i class="cf-water"></i><i class="cf-water w2"></i>' : ''}${way.id === 'tram' ? '<i class="cf-rail"></i>' : ''}
            <div class="cf-carrier"><span>${u.esc(thought)}</span></div>
          </div>
          <div class="cf-actions cf-after"><button type="button" class="link-btn" data-again>Ще раз</button><button type="button" class="btn btn-primary" data-next>Далі</button></div>`, (b) => {
        b.querySelector('[data-again]').addEventListener('click', choose);
        b.querySelector('[data-next]').addEventListener('click', attention);
        setTimeout(() => { const a = b.querySelector('.cf-after'); if (a) a.classList.add('is-on'); }, reduced() ? 0 : 6500);
      });
      const attention = () => f.step(`${dots(4, 4)}
          <p class="cf-kicker mono">4. ПЕРЕВЕДИ УВАГУ</p>
          <h2>Чим займешся зараз?</h2>
          <p class="cf-sub">Обери щось корисне або приємне і зроби це одразу.</p>
          <div class="cf-tags">${['Музика', 'Прогулянка', 'Подзвонити комусь', 'Душ', 'Книга', 'Прибрати на столі', 'Справа з беклогу', 'Просто подивитись у вікно'].map((t) => `<span>${t}</span>`).join('')}</div>
          <p class="cf-sub">Якщо думка повернеться, відпусти її ще раз. Думки приходитимуть завжди, тож і відпускати їх можна завжди.</p>
          <div class="cf-actions"><button type="button" class="btn btn-primary" data-done autofocus>Готово</button></div>`, (b) => b.querySelector('[data-done]').addEventListener('click', closeFlow));
      if (thought) name(); else write();
    });
  };

  // ---------------- 4. База ----------------
  const BASICS = [
    { t: 'Сон', items: [
      'Ліжко тільки для сну. Їжа, соцмережі, відео й робота не в ліжку.',
      'Без денного сну: він збиває нічний.',
      'Лягай і вставай в один і той самий час.',
      'Без гаджетів годину перед сном і годину після.',
      'Кофеїн: до 5 чашок еспресо на добу і нічого за 4 години до сну.',
      'Рух потрібен, але не пізніше ніж за 2 години до сну.',
      'Остання їжа за 2 години до сну, без важкого й жирного.',
    ] },
    { t: 'Рух', items: [
      'Орієнтир: 150 хвилин помірного руху на тиждень. Це пів години ходьби пʼять днів.',
      'Краще потроху щодня, ніж багато раз на тиждень.',
      'Засидівся? Встань і пройдись кілька хвилин.',
    ] },
    { t: 'Їжа й вода', items: [
      'Їж регулярно. На голодний шлунок усе здається гіршим.',
      'Пий воду протягом дня.',
      'Алкоголь погіршує сон, а наступного дня додає тривоги.',
    ] },
    { t: 'Світло й повітря', items: [
      'Вийди на денне світло в першій половині дня хоча б на 15–20 хвилин. Це допомагає сну.',
      'Провітрюй кімнату, особливо перед сном.',
    ] },
    { t: 'Люди', items: [
      'Поговори з кимось наживо хоча б раз на день. Не обовʼязково про проблеми.',
      'Коли важко, не зникай. Напиши одній людині.',
    ] },
    { t: 'Паузи', items: [
      'Між справами роби перерву хоча б на 5–10 хвилин.',
      'Лиши один вечір на тиждень без справ і планів.',
    ] },
  ];

  // ---------------- сторінка ----------------
  function historyHtml() {
    const list = worries().slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    if (!list.length) return '<p class="empty-note">Тут зʼявляться переживання, які ти розбереш. З часом видно, що турбує найчастіше і скільки з цього справді варте сил.</p>';
    const judged = list.filter((w) => w.useful != null);
    const bad = judged.filter((w) => !w.useful).length;
    const open = LP.view.worriesAll || list.length <= 6;
    return `
      ${judged.length >= 3 ? `<p class="cw-sum">Із ${judged.length} переживань <b>${bad}</b> ${bad === 1 ? 'було некорисне' : 'були некорисні'}: вони забирали сили, але нічого не вирішували.</p>` : ''}
      <ul class="cw-list">${(open ? list : list.slice(0, 6)).map((w) => `
        <li class="cw-item">
          <span class="mono cw-date">${u.fmtDay(w.date).toUpperCase()}</span>
          <span class="cw-text">${u.esc(w.text)}${w.step ? `<small>→ ${u.esc(w.step)}${w.when ? ` · ${u.fmtDay(w.when)}` : ''}</small>` : ''}</span>
          <span class="cw-tags">${w.useful == null ? '' : `<i class="cw-tag ${w.useful ? 'is-good' : 'is-bad'}">${w.useful ? 'корисне' : 'некорисне'}</i>`}${w.outcome ? `<i class="cw-tag">${OUTCOME[w.outcome]}</i>` : ''}</span>
          <button type="button" class="icon-btn cw-del" data-worry-del="${w.id}" aria-label="Видалити запис">✕</button>
        </li>`).join('')}</ul>
      ${list.length > 6 ? `<button type="button" class="link-btn" data-worries-all>${open ? 'Згорнути' : `Показати всі (${list.length})`}</button>` : ''}`;
  }

  function render(root) {
    root.innerHTML = `
      <div class="page calm-page">
        <section class="calm-hero">
          <p class="calm-lead">Коли важко, почни звідси.</p>
          <button type="button" class="anchor-btn" data-anchor>${ANCHOR_ICON}<span><b>Кинути якір</b><small>три хвилини, щоб повернутись у тут і зараз</small></span></button>
          <p class="hint">Екран стане спокійним, текст поведе крок за кроком. Будь-який клік чи клавіша повертає назад.</p>
        </section>

        <section>
          <div class="section-head"><h2>ДУМКИ</h2></div>
          <div class="calm-cards">
            <button type="button" class="calm-card" data-worry><b>Розібрати переживання</b><span>Запиши, що турбує. Пʼять питань покажуть, корисне воно чи ні, і що з ним робити далі.</span><i class="mono">2 ХВИЛИНИ →</i></button>
            <button type="button" class="calm-card" data-defuse><b>Відпустити думку</b><span>Коли думка крутиться і не допомагає. Назви її, відпусти й переведи увагу.</span><i class="mono">1 ХВИЛИНА →</i></button>
          </div>
        </section>

        <section>
          <div class="section-head"><h2>МОЇ ПЕРЕЖИВАННЯ</h2><span class="mono muted">${worries().length || ''}</span></div>
          ${historyHtml()}
        </section>

        <section>
          <div class="section-head"><h2>БАЗА</h2><span class="mono muted">СПЕРШУ ТІЛО</span></div>
          <p class="hint calm-base-lead">З думками легше працювати, коли тіло в порядку. Якщо важко, спершу перевір це.</p>
          <div class="calm-basics">${BASICS.map((g, i) => `<details class="cb" ${i === 0 ? 'open' : ''}><summary>${g.t}<span class="mono">${g.items.length}</span></summary><ul>${g.items.map((x) => `<li>${x}</li>`).join('')}</ul></details>`).join('')}</div>
        </section>

        <p class="calm-note">Ці техніки допомагають пережити важкий момент, але не замінюють фахівця. Якщо важко вже кілька тижнів і це заважає жити, звернися до психолога чи лікаря.</p>
      </div>`;
    root.querySelector('[data-anchor]').addEventListener('click', LP.dropAnchor);
    root.querySelector('[data-worry]').addEventListener('click', LP.openWorry);
    root.querySelector('[data-defuse]').addEventListener('click', () => LP.openDefuse(''));
    const all = root.querySelector('[data-worries-all]');
    if (all) all.addEventListener('click', () => { LP.view.worriesAll = !LP.view.worriesAll; LP.render(); });
    root.querySelectorAll('[data-worry-del]').forEach((b) => b.addEventListener('click', () => {
      LP.data.worries = worries().filter((w) => w.id !== b.dataset.worryDel);
      LP.save();
    }));
  }

  LP.views = LP.views || {};
  LP.views.calm = { render };
})(window.LP);
