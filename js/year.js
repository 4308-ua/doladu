// Рік — від дня народження до наступного дня народження.
// Над лінією — твоє: позначки (тег на ніжці) і періоди (дуги). Під лінією — щорічне: дні народження, річниці, свята.
// life: { birthday: 'YYYY-MM-DD'|null, marks: [{ id, title, note, start, end|null }],
//         dates: [{ id, name, kind: 'bday'|'anniv'|'other', md: 'MM-DD', year|null }], holidays: [ids] }
window.LP = window.LP || {};

(function (LP) {
  const u = LP.u;
  const DAY = 86400000;
  const pad = (n) => String(n).padStart(2, '0');

  function orthodoxEaster(y) {
    const a = y % 4, b = y % 7, c = y % 19;
    const d = (19 * c + 15) % 30, e = (2 * a + 4 * b - d + 34) % 7;
    const m = Math.floor((d + e + 114) / 31), day = ((d + e + 114) % 31) + 1;
    return u.addDays(`${y}-${pad(m)}-${pad(day)}`, 13);
  }
  const HOLIDAYS = [
    { id: 'newyear', name: 'Новий рік', md: '01-01' },
    { id: 'valentine', name: 'День закоханих', md: '02-14' },
    { id: 'women', name: '8 березня', md: '03-08' },
    { id: 'easter', name: 'Великдень', at: orthodoxEaster },
    { id: 'trinity', name: 'Трійця', at: (y) => u.addDays(orthodoxEaster(y), 49) },
    { id: 'constitution', name: 'День Конституції', md: '06-28' },
    { id: 'independence', name: 'День Незалежності', md: '08-24' },
    { id: 'defenders', name: 'День захисників', md: '10-01' },
    { id: 'halloween', name: 'Хелловін', md: '10-31' },
    { id: 'nicholas', name: 'День святого Миколая', md: '12-06' },
    { id: 'christmas', name: 'Різдво', md: '12-25' },
  ];
  LP.DEFAULT_HOLIDAYS = ['newyear', 'easter', 'halloween'];
  const KIND = { bday: 'День народження', anniv: 'Річниця', other: 'Інша дата' };

  const life = () => LP.data.life;
  const days = (a, b) => Math.round((u.parse(b) - u.parse(a)) / DAY);
  const mdIn = (y, md) => {
    let [m, d] = md.split('-').map(Number);
    if (m === 2 && d === 29 && !(y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0))) d = 28;
    return `${y}-${pad(m)}-${pad(d)}`;
  };

  // межі року: від останнього дня народження до наступного (без дати — календарний рік)
  function range(offset) {
    const t = u.today();
    const ty = Number(t.slice(0, 4));
    const bd = life().birthday;
    let from;
    if (bd) {
      from = mdIn(ty, bd.slice(5));
      if (from > t) from = mdIn(ty - 1, bd.slice(5));
    } else from = `${ty}-01-01`;
    const fy = Number(from.slice(0, 4)) + offset;
    from = bd ? mdIn(fy, bd.slice(5)) : `${fy}-01-01`;
    const to = bd ? mdIn(fy + 1, bd.slice(5)) : `${fy + 1}-01-01`;
    return { from, to, age: bd ? fy - Number(bd.slice(0, 4)) : null };
  }

  // щорічні дати й свята, що потрапляють у [from, to)
  function yearly(from, to) {
    const out = [];
    const y0 = Number(from.slice(0, 4)), y1 = Number(to.slice(0, 4));
    for (let y = y0; y <= y1; y++) {
      life().dates.forEach((d) => {
        const date = mdIn(y, d.md);
        if (date < from || date >= to) return;
        const n = d.year ? y - d.year : null;
        out.push({ type: 'date', id: d.id, date, kind: d.kind, label: d.name + (n > 0 ? ` · ${n}` : ''), title: `${KIND[d.kind]}: ${d.name}${n > 0 ? (d.kind === 'bday' ? ` — ${n} р.` : ` — ${n}-а`) : ''}` });
      });
      HOLIDAYS.filter((h) => life().holidays.includes(h.id)).forEach((h) => {
        const date = h.at ? h.at(y) : mdIn(y, h.md);
        if (date < from || date >= to) return;
        out.push({ type: 'holiday', id: h.id, date, label: h.name, title: h.name });
      });
    }
    return out.sort((a, b) => (a.date < b.date ? -1 : 1));
  }


  let justDragged = 0;
  function render(root) {
    const per = LP.view.yearPeriod && LP.lifeMark(LP.view.yearPeriod);
    if (per && per.end) return renderPeriod(root, per);
    LP.view.yearPeriod = null;
    const L = life();
    const off = LP.view.yearOffset || 0;
    const { from, to, age } = range(off);
    const total = days(from, to);
    const today = u.today();
    const mob = LP.isMobile && LP.isMobile();
    // місяць має вміщати колонку підписів — на вузькому екрані лінія гортається вбік
    // телефон: лінія — огляд року на ширину екрана, а місяці йдуть списком униз
    const W = mob ? Math.max(300, (root.clientWidth || document.documentElement.clientWidth) - 28) : Math.max(1180, (root.clientWidth || document.documentElement.clientWidth) - 64);
    const PADL = mob ? 12 : 28, PADR = mob ? 12 : 28;
    const span = W - PADL - PADR;
    const xOf = (date) => PADL + (days(from, date) / total) * span;
    const HMAX = mob ? 52 : 132; // вища дуга лише з'їдає місце над лінією
    const nowIn = today >= from && today < to;
    const WD = ['НД', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ'];
    const wd = (d) => WD[u.parse(d).getDay()];

    // --- мої позначки й періоди
    const marks = L.marks.filter((m) => (m.end || m.start) >= from && m.start < to);
    const points = marks.filter((m) => !m.end).sort((a, b) => (a.start < b.start ? -1 : 1));
    const spans = marks.filter((m) => m.end).sort((a, b) => days(b.start, b.end) - days(a.start, a.end));
    const geo = {};
    const autoH = (w) => u.clamp(w * 0.42, mob ? 14 : 26, HMAX);
    spans.forEach((m) => {
      const a = Math.max(PADL, xOf(m.start < from ? from : m.start));
      const b = Math.min(PADL + span, xOf(m.end >= to ? to : m.end));
      const w = Math.max(b - a, 6);
      geo[m.id] = { a, w, h: m.h ? u.clamp(m.h, 18, HMAX) : autoH(w) };
    });
    // лінія стоїть рівно настільки низько, щоб над нею вмістилися дуги
    const LY = mob ? 92 : spans.length ? u.clamp(Math.max(...spans.map((m) => geo[m.id].h)) + 58, 110, HMAX + 58) : 96;
    const nowX = nowIn ? xOf(today) : null;
    const arcD = (a, w, h) => `M${a},${LY} A${w / 2},${h} 0 0 1 ${a + w},${LY}`;
    let arcs = '', arcLabels = '', arcEnds = '';
    spans.forEach((m) => {
      const g = geo[m.id];
      const { a, w, h } = g;
      const past = m.end < today;
      arcs += `<path class="yr-arc ${past ? 'is-past' : ''}" data-arc="${m.id}" data-k="m:${m.id}" d="${arcD(a, w, h)}" data-mark="${m.id}"><title>${u.esc(m.title)} · ${u.fmtDay(m.start)} — ${u.fmtDay(m.end)}</title></path>`;
      arcEnds += `<circle class="yr-arc-end" data-arcend="${m.id}" data-end="s" cx="${a}" cy="${LY}" r="7"><title>Перетягни, щоб змінити початок</title></circle><circle class="yr-arc-end" data-arcend="${m.id}" data-end="e" cx="${a + w}" cy="${LY}" r="7"><title>Перетягни, щоб змінити кінець</title></circle>`;
      if (!mob) arcLabels += `<button type="button" class="yr-tag yr-arc-tag ${past ? 'is-past' : ''}" data-mark="${m.id}" data-k="m:${m.id}" data-drag="arc" data-key="${m.id}" style="left:${a + w / 2}px;top:${LY - h}px" title="${u.esc(m.title)}${m.note ? ' — ' + u.esc(m.note) : ''} · перетягни, щоб посунути період">${u.esc(m.title)}<small>${u.fmtDay(m.start)} — ${u.fmtDay(m.end)}</small></button>`;
    });

    // --- точки на лінії; підписи до них живуть у колонках місяців під лінією
    const yl = yearly(from, to);
    let dots = '';
    const entries = [];
    points.forEach((m) => {
      const x = xOf(m.start), past = m.start < today;
      dots += `<circle class="yr-pin ${past ? 'is-past' : ''}" data-pindot="${m.id}" data-k="m:${m.id}" cx="${x}" cy="${LY}" r="4.5"/><circle class="yr-pin-hit" data-pin="${m.id}" data-k="m:${m.id}" cx="${x}" cy="${LY}" r="9"><title>${u.esc(m.title)} · ${wd(m.start)} ${u.fmtDay(m.start)} · перетягни, щоб перенести</title></circle>`;
      entries.push({ date: m.start, k: 'm:' + m.id, cls: 't-mark', attr: `data-mark="${m.id}"`, text: m.title, tip: (m.note ? m.note + ' · ' : '') + 'натисни, щоб змінити' });
    });
    spans.forEach((m) => {
      const start = m.start < from ? from : m.start;
      entries.push({ date: start, k: 'm:' + m.id, cls: 't-span', attr: `data-mark="${m.id}"`, text: m.title, sub: `до ${u.fmtDay(m.end)}`, past: m.end < today, tip: 'натисни, щоб відкрити період' });
    });
    yl.forEach((it) => {
      const x = xOf(it.date), past = it.date < today;
      const k = (it.type === 'holiday' ? 'h:' : 'd:') + it.id + ':' + it.date;
      const cls = it.type === 'holiday' ? 'is-holiday' : 'k-' + it.kind;
      dots += `<circle class="yr-ddot ${cls} ${past ? 'is-past' : ''}" data-k="${k}" cx="${x}" cy="${LY}" r="3.2"/><circle class="yr-dhit" data-k="${k}" ${it.type === 'date' ? `data-date-id="${it.id}"` : ''} cx="${x}" cy="${LY}" r="7"><title>${u.esc(it.title)} · ${wd(it.date)} ${u.fmtDay(it.date)}</title></circle>`;
      entries.push({ date: it.date, k, cls: it.type === 'holiday' ? 't-hol' : 't-' + it.kind, attr: it.type === 'date' ? `data-date-id="${it.id}"` : '', text: it.label, tip: it.title });
    });
    entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    // --- місяці: відрізки лінії → колонки (закороткий край року приєднується до сусіда)
    const segs = [];
    for (let cur = from; cur < to;) {
      const y = Number(cur.slice(0, 4)), m = Number(cur.slice(5, 7));
      const nxt = m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`;
      const end = nxt < to ? nxt : to;
      segs.push({ ym: cur.slice(0, 7), y, m, from: cur, to: end, x0: xOf(cur), x1: xOf(end) });
      cur = nxt;
    }
    let ticks = '';
    segs.forEach((sg, i) => { if (i) ticks += `<line class="yr-tick" x1="${sg.x0}" y1="${LY - 7}" x2="${sg.x0}" y2="${LY + 7}"/>`; });
    const isPart = (sg) => sg.to !== (sg.m === 12 ? `${sg.y + 1}-01-01` : `${sg.y}-${pad(sg.m + 1)}-01`) || sg.from.slice(8) !== '01';
    const cols = [];
    let lead = [];
    segs.forEach((sg) => {
      // зливаємо лише неповний місяць на краю року, якщо йому тісно; повні місяці завжди мають свою колонку
      if (sg.x1 - sg.x0 >= 96 || !isPart(sg) || segs.length < 3) { cols.push({ x0: lead.length ? lead[0].x0 : sg.x0, x1: sg.x1, groups: lead.concat(sg) }); lead = []; }
      else if (cols.length) { const c = cols[cols.length - 1]; c.groups.push(sg); c.x1 = sg.x1; }
      else lead.push(sg);
    });
    const itemHtml = (e) => {
      const past = e.past != null ? e.past : e.date < today;
      return `<button type="button" class="yr-it ${e.cls} ${past ? 'is-past' : ''} ${e.date === today ? 'is-today' : ''}" data-k="${e.k}" ${e.attr} title="${wd(e.date)}, ${u.fmtDate(e.date)}${e.tip ? ' · ' + u.esc(e.tip) : ''}"><span class="yr-it-d">${Number(e.date.slice(8))}</span><span class="yr-it-t">${u.esc(e.text)}${e.sub ? `<small> · ${e.sub}</small>` : ''}</span></button>`;
    };
    const itemsOf = (sg) => entries.filter((e) => e.date >= sg.from && e.date < sg.to);
    const colsHtml = mob ? '' : cols.map((c) => `<div class="yr-mcol" style="left:${c.x0}px;width:${c.x1 - c.x0}px">${c.groups.map((sg) => {
      const cur = nowIn && today >= sg.from && today < sg.to, part = isPart(sg);
      return `<div class="yr-mgroup ${cur ? 'is-now' : ''} ${sg.to <= today ? 'is-past' : ''}"><div class="yr-mhead mono">${u.MONTHS[sg.m - 1].slice(0, 3).toUpperCase()}${sg.m === 1 || (sg === segs[0] && !part) ? ' ' + sg.y : ''}${part ? `<i>${sg === segs[0] ? 'з ' + Number(sg.from.slice(8)) : 'до ' + Number(u.addDays(sg.to, -1).slice(8))}</i>` : ''}</div>${itemsOf(sg).map(itemHtml).join('')}</div>`;
    }).join('')}</div>`).join('');
    // телефон: вертикальна лінія року — місяці один під одним, біля кожної дати точка на лінії
    const vRow = (e) => {
      const past = e.past != null ? e.past : e.date < today;
      return `<button type="button" class="yv-it ${e.cls} ${past ? 'is-past' : ''} ${e.date === today ? 'is-today' : ''}" data-k="${e.k}" data-date="${e.date}" ${e.attr}><span class="yv-d">${Number(e.date.slice(8))}<small>${wd(e.date)}</small></span><i class="yv-dot"></i><span class="yv-t">${u.esc(e.text)}${e.sub ? `<small> · ${e.sub}</small>` : ''}</span></button>`;
    };
    const nowRow = `<div class="yv-now" data-date="${today}"><span class="yv-d">${Number(today.slice(8))}<small>${wd(today)}</small></span><i class="yv-dot"></i><span class="yv-t">Сьогодні</span></div>`;
    const vMonth = (sg) => {
      const cur = nowIn && today >= sg.from && today < sg.to;
      let rows = '', nowDone = !cur;
      itemsOf(sg).forEach((e) => {
        if (!nowDone && e.date >= today) { if (e.date !== today) rows += nowRow; nowDone = true; }
        rows += vRow(e);
      });
      if (!nowDone) rows += nowRow;
      return `<section class="yv-month ${cur ? 'is-now' : ''} ${sg.to <= today ? 'is-past' : ''}" data-date="${sg.from}"><div class="yv-head"><span class="yv-d"></span><i class="yv-tick"></i><span class="mono yv-mname">${u.MONTHS[sg.m - 1].toUpperCase()} ${sg.y}</span><button type="button" class="yv-add" data-add-in="${cur ? today : sg.from}" aria-label="Додати позначку: ${u.MONTHS[sg.m - 1]}">+</button></div>${rows}</section>`;
    };
    const vPast = nowIn ? segs.filter((sg) => sg.to <= today) : [];
    const vline = !mob ? '' : `<div class="yv">${vPast.length ? `<details class="yv-past"><summary><span class="yv-d"></span><i class="yv-tick"></i><span class="mono">РАНІШЕ ЦЬОГО РОКУ · ${vPast.reduce((n, sg) => n + itemsOf(sg).length, 0)}</span></summary>${vPast.map(vMonth).join('')}</details>` : ''}${segs.filter((sg) => !vPast.includes(sg)).map(vMonth).join('')}<div class="yv-end"><span class="yv-d"></span><i class="yv-dot"></i><span class="yv-t mono">${L.birthday ? 'ДЕНЬ НАРОДЖЕННЯ · ' + u.fmtDay(to).toUpperCase() : 'КІНЕЦЬ РОКУ'}</span></div></div>`;

    // --- лінія: пройдене суцільне, попереду — крапками
    const splitX = nowIn ? nowX : today >= to ? PADL + span : PADL;
    const line = `
      <line class="yr-line is-done" x1="${PADL}" y1="${LY}" x2="${splitX}" y2="${LY}"/>
      <line class="yr-line is-ahead" x1="${splitX}" y1="${LY}" x2="${PADL + span}" y2="${LY}"/>
      <circle class="yr-end" cx="${PADL}" cy="${LY}" r="7"/><circle class="yr-end" cx="${PADL + span}" cy="${LY}" r="7"/>`;
    const now = nowIn ? `<circle class="yr-now-halo" cx="${nowX}" cy="${LY}" r="11"/><circle class="yr-now" cx="${nowX}" cy="${LY}" r="6"/>` : '';
    const pending = LP.view.yearPending && LP.view.yearPending.date >= from && LP.view.yearPending.date < to ? LP.view.yearPending : null;

    // --- найближче
    const ahead = [];
    yearly(today, u.addDays(today, 120)).forEach((it) => ahead.push({ date: it.date, text: it.title }));
    L.marks.filter((m) => m.start >= today && days(today, m.start) <= 120).forEach((m) => ahead.push({ date: m.start, text: m.title + (m.end ? ` (до ${u.fmtDay(m.end)})` : ''), mark: m.id }));
    if (L.birthday) {
      const nb = range(0).to;
      if (days(today, nb) <= 120) ahead.push({ date: nb, text: 'Твій день народження' });
    }
    ahead.sort((a, b) => (a.date < b.date ? -1 : 1));

    const bdLeft = L.birthday ? days(today, range(0).to) : null;
    root.innerHTML = `
      <section class="year">
        <div class="yr-head">
          <button type="button" class="sq-btn" data-yr="-1" aria-label="Попередній рік">‹</button>
          <div class="yr-title">
            <span class="label">${from.slice(0, 4)} → ${to.slice(0, 4)}</span>
            <span class="mono">${u.fmtDay(from).toUpperCase()} — ${u.fmtDay(to).toUpperCase()}${age != null ? ` · ТОБІ ${age}, ПОТІМ ${age + 1}` : ''}</span>
          </div>
          <button type="button" class="sq-btn" data-yr="1" aria-label="Наступний рік">›</button>
          ${off ? '<button type="button" class="btn btn-sm" data-yr="0">ЦЕЙ РІК</button>' : ''}
          <span class="yr-spacer"></span>
          <button type="button" class="btn btn-sm" data-add-mark>+ ПОЗНАЧКА</button>
          ${L.birthday
            ? `<button type="button" class="link-btn mono" data-bday>ДЕНЬ НАРОДЖЕННЯ ${u.fmtDate(L.birthday).toUpperCase()}${off === 0 ? ` · ЧЕРЕЗ ${bdLeft} ДН.` : ''}</button>`
            : '<button type="button" class="btn btn-primary" data-bday>ВКАЖИ СВІЙ ДЕНЬ НАРОДЖЕННЯ</button>'}
        </div>
        ${L.birthday ? '' : '<p class="hint yr-hint">Поки що лінія показує календарний рік. Вкажи день народження, і вона йтиме від нього до наступного.</p>'}
        <div class="yr-scroll"><div class="yr-stage" style="height:${LY + 120}px;width:${W}px">
          <svg class="yr-svg" width="${W}" height="${LY + 120}" viewBox="0 0 ${W} ${LY + 120}">
            <rect class="yr-hit" x="${PADL - 8}" y="${LY - 22}" width="${span + 16}" height="36"/>
            ${arcs}${ticks}${line}${dots}${arcEnds}${now}
            ${pending ? `<circle class="yr-pending" cx="${xOf(pending.date)}" cy="${LY}" r="6"/>` : ''}
            <path class="yr-temp" d="" hidden/>
            <line class="yr-guide" x1="0" y1="${LY - 22}" x2="0" y2="${LY + 14}" hidden/>
          </svg>
          ${arcLabels}
          ${mob ? '' : `<div class="yr-months ${span / 12 < 130 ? 'is-tight' : ''}" style="top:${LY + 16}px">${colsHtml}</div>`}
          ${nowIn ? `<span class="yr-now-label mono" style="left:${nowX}px;top:${LY - 30}px">ЗАРАЗ</span>` : ''}
          <span class="yr-tip mono" hidden></span>
          ${pending ? `
            <div class="yr-pop" style="left:${u.clamp(xOf(pending.date) - 130, 0, W - 270)}px;top:${LY + 22}px">
              <div class="yr-pop-day"><button type="button" class="sq-btn" data-pend-day="-1" aria-label="На день раніше">‹</button><span class="mono yr-pop-date">${wd(pending.date)}, ${u.fmtDate(pending.date).toUpperCase()}</span><button type="button" class="sq-btn" data-pend-day="1" aria-label="На день пізніше">›</button></div>
              <input type="text" class="yr-pop-input" maxlength="60" placeholder="Що тут буде?" aria-label="Назва позначки" value="${u.esc(pending.title || '')}">
              <div class="yr-pop-row"><button type="button" class="btn btn-primary btn-sm" data-pend-save>ПОЗНАЧКА</button><button type="button" class="btn btn-sm" data-pend-cancel>✕</button></div>
              <p class="hint">Натисни на лінію ще раз, і вийде період.</p>
            </div>` : ''}
        </div>
        </div>
        ${vline}
        <p class="hint yr-legend">${mob ? '«+» біля місяця додає позначку. Щоб додати період, вкажи у формі дату кінця.' : 'Натисни на лінію, щоб поставити позначку, і ще раз, щоб вийшов період. Точку й дугу можна перетягнути. Наведи на рядок, і підсвітиться його точка.'}</p>
        <div class="yr-cols">
          <div class="yr-col">
            <div class="side-head"><span class="label">НАЙБЛИЖЧЕ</span><span class="mono muted">120 ДН.</span></div>
            <ul class="yr-list">${ahead.slice(0, 10).map((a) => `<li><span class="mono">${u.fmtDay(a.date).toUpperCase()}</span><span>${u.esc(a.text)}</span><span class="mono muted">${a.date === today ? 'СЬОГОДНІ' : `ЧЕРЕЗ ${days(today, a.date)} ДН.`}</span></li>`).join('') || '<li class="muted">Нічого не заплановано.</li>'}</ul>
          </div>
          <div class="yr-col">
            <div class="side-head"><span class="label">ДНІ НАРОДЖЕННЯ Й РІЧНИЦІ</span><button type="button" class="btn btn-sm" data-add-date>+ ДОДАТИ</button></div>
            <ul class="yr-list">${L.dates.slice().sort((a, b) => (a.md < b.md ? -1 : 1)).map((d) => `<li><button type="button" class="yr-row" data-date-id="${d.id}"><span class="mono">${Number(d.md.slice(3))} ${u.fmtDay('2000-' + d.md).split(' ')[1].toUpperCase()}</span><span>${u.esc(d.name)}</span><span class="mono muted">${d.kind === 'bday' ? 'ДН' : d.kind === 'anniv' ? 'РІЧНИЦЯ' : ''}</span></button></li>`).join('') || '<li class="muted">Додай близьких, і їхні дні народження зʼявляться під лінією.</li>'}</ul>
          </div>
          <div class="yr-col">
            <div class="side-head"><span class="label">СВЯТА</span></div>
            <div class="yr-hols">${HOLIDAYS.map((h) => `<label class="check"><input type="checkbox" data-hol="${h.id}" ${L.holidays.includes(h.id) ? 'checked' : ''}> ${h.name}</label>`).join('')}</div>
          </div>
        </div>
      </section>`;

    const stage = root.querySelector('.yr-stage');
    const svg = stage.querySelector('svg');
    // колонки місяців: однакова висота (щоб розділювачі йшли до низу) і висота сцени під найдовшу
    const mcols = Array.from(stage.querySelectorAll('.yr-mcol'));
    const colH = mob ? 0 : Math.max(64, ...mcols.map((c) => c.offsetHeight));
    mcols.forEach((c) => { c.style.height = colH + 'px'; });
    const H = mob ? LY + (pending ? 150 : 22) : LY + 16 + colH + 6;
    // підпис дуги не вилазить за край сцени
    stage.querySelectorAll('.yr-arc-tag').forEach((el) => {
      const half = el.offsetWidth / 2;
      el.style.left = u.clamp(parseFloat(el.style.left), half + 2, W - half - 2) + 'px';
    });
    stage.style.height = H + 'px';
    svg.setAttribute('height', H); svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    // точка на лінії ↔ рядок у колонці: наводиш на одне — підсвічується друге
    let hot = null;
    const setHot = (k) => {
      if (k === hot) return;
      if (hot) root.querySelectorAll(`[data-k="${CSS.escape(hot)}"]`).forEach((el) => el.classList.remove('is-hot'));
      hot = k;
      if (hot) root.querySelectorAll(`[data-k="${CSS.escape(hot)}"]`).forEach((el) => el.classList.add('is-hot'));
    };
    stage.addEventListener('pointerover', (e) => { const el = e.target.closest('[data-k]'); setHot(el ? el.dataset.k : null); });
    stage.addEventListener('pointerleave', () => setHot(null));
    // періоди на вертикальній лінії: смуга від першого дня до останнього
    const yv = root.querySelector('.yv');
    if (yv) {
      const drawSpans = () => {
        yv.querySelectorAll('.yv-span').forEach((x) => x.remove());
        const base = yv.getBoundingClientRect().top;
        const marks = Array.from(yv.querySelectorAll('[data-date]')).filter((el) => el.getClientRects().length);
        const lanes = [];
        spans.forEach((m) => {
          const st = yv.querySelector(`.yv-it[data-k="m:${m.id}"]`);
          const r = st && st.getClientRects().length ? st.getBoundingClientRect() : null;
          const top = r ? r.top + r.height / 2 - base : 0;
          const nxt = marks.find((el) => el.dataset.date > m.end && el.getBoundingClientRect().top - base > top + 2);
          const bottom = nxt ? nxt.getBoundingClientRect().top - base : yv.offsetHeight;
          let l = lanes.findIndex((b) => b <= top);
          if (l < 0) { l = lanes.length; lanes.push(0); }
          lanes[l] = bottom;
          const bar = document.createElement('i');
          bar.className = 'yv-span' + (m.end < today ? ' is-past' : '');
          bar.style.cssText = `top:${top}px;height:${Math.max(bottom - top, 12)}px;--lane:${l}`;
          yv.appendChild(bar);
        });
      };
      drawSpans();
      const det = yv.querySelector('.yv-past');
      if (det) det.addEventListener('toggle', drawSpans);
    }
    const guide = svg.querySelector('.yr-guide');
    const temp = svg.querySelector('.yr-temp');
    const tip = stage.querySelector('.yr-tip');
    const hit = svg.querySelector('.yr-hit');
    const dateAt = (clientX) => {
      const r = stage.getBoundingClientRect();
      const k = u.clamp((clientX - r.left - PADL) / span, 0, 0.99999);
      return u.addDays(from, Math.floor(k * total));
    };
    const showGuide = (clientX) => {
      const d = dateAt(clientX);
      const x = xOf(d);
      guide.hidden = false;
      guide.setAttribute('x1', x); guide.setAttribute('x2', x);
      tip.hidden = false;
      tip.textContent = wd(d) + ' ' + u.fmtDay(d).toUpperCase();
      tip.style.left = x + 'px';
      tip.style.top = LY - 46 + 'px';
    };
    hit.addEventListener('pointermove', (e) => showGuide(e.clientX));
    hit.addEventListener('pointerleave', () => { guide.hidden = true; tip.hidden = true; });

    hit.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const a = dateAt(e.clientX);
      const x0 = e.clientX;
      let dragging = false, b = a;
      const move = (m) => {
        showGuide(m.clientX);
        if (!dragging && Math.abs(m.clientX - x0) < 6) return;
        dragging = true;
        b = dateAt(m.clientX);
        const [s, f] = a <= b ? [a, b] : [b, a];
        const xa = xOf(s), w = Math.max(xOf(f) - xa, 4);
        temp.hidden = false;
        temp.setAttribute('d', `M${xa},${LY} A${w / 2},${u.clamp(w * 0.42, 26, 200)} 0 0 1 ${xa + w},${LY}`);
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        temp.hidden = true;
        const p = LP.view.yearPending;
        if (dragging && a !== b) return openMarkForm(null, a <= b ? a : b, a <= b ? b : a);
        if (p && p.date !== a) {
          LP.view.yearPending = null;
          return openMarkForm(null, p.date < a ? p.date : a, p.date < a ? a : p.date);
        }
        LP.view.yearPending = { date: a };
        LP.render();
        const inp = root.querySelector('.yr-pop-input');
        if (inp) inp.focus();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });

    // --- тягати: теги, дуги (за підпис чи кінці), позначки по лінії
    const setArc = (id, a, w, h) => {
      svg.querySelector(`[data-arc="${id}"]`).setAttribute('d', arcD(a, w, h));
      const lab = stage.querySelector(`.yr-arc-tag[data-key="${id}"]`);
      lab.style.left = a + w / 2 + 'px'; lab.style.top = LY - h + 'px';
      const [es, ee] = svg.querySelectorAll(`[data-arcend="${id}"]`);
      es.setAttribute('cx', a); ee.setAttribute('cx', a + w);
    };
    stage.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const tag = e.target.closest('[data-drag="arc"]');
      const end = e.target.closest('[data-arcend]');
      const pin = e.target.closest('[data-pin]');
      if (!tag && !end && !pin) return;
      e.preventDefault();
      const x0 = e.clientX, y0 = e.clientY;
      let moved = false, apply, finish;
      if (tag && tag.dataset.drag === 'arc') {
        const m = LP.lifeMark(tag.dataset.key), g = geo[m.id];
        let shift = 0, h = g.h;
        apply = (mv) => {
          shift = Math.round(((mv.clientX - x0) / span) * total);
          h = u.clamp(g.h - (mv.clientY - y0), 18, LY - 24);
          setArc(m.id, g.a + (shift / total) * span, g.w, h);
        };
        finish = () => { m.start = u.addDays(m.start, shift); m.end = u.addDays(m.end, shift); m.h = Math.round(h); };
      } else if (end) {
        const m = LP.lifeMark(end.dataset.arcend), which = end.dataset.end;
        let ds = m.start, de = m.end;
        apply = (mv) => {
          const d = dateAt(mv.clientX);
          if (which === 's') ds = d < de ? d : u.addDays(de, -1);
          else de = d > ds ? d : u.addDays(ds, 1);
          const a = xOf(ds), w = Math.max(xOf(de) - a, 6);
          setArc(m.id, a, w, m.h ? u.clamp(m.h, 18, LY - 24) : autoH(w));
          showGuide(mv.clientX);
        };
        finish = () => { m.start = ds; m.end = de; };
      } else {
        const m = LP.lifeMark(pin.dataset.pin);
        const dot = svg.querySelector(`[data-pindot="${m.id}"]`);
        let d = m.start;
        apply = (mv) => {
          d = dateAt(mv.clientX);
          const nx = xOf(d);
          pin.setAttribute('cx', nx); dot.setAttribute('cx', nx);
          showGuide(mv.clientX);
        };
        finish = () => { m.start = d; };
      }
      const move = (mv) => {
        if (!moved && Math.hypot(mv.clientX - x0, mv.clientY - y0) < 4) return;
        if (!moved) stage.classList.add('is-dragging');
        moved = true;
        apply(mv);
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        stage.classList.remove('is-dragging');
        if (moved) { justDragged = Date.now(); finish(); LP.save(); }
        else if (pin) openMarkForm(LP.lifeMark(pin.dataset.pin));
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });

    const pop = stage.querySelector('.yr-pop');
    if (pop) {
      const save = () => {
        const title = pop.querySelector('input').value.trim();
        if (!title) return pop.querySelector('input').focus();
        L.marks.push({ id: u.uid(), title, note: '', start: LP.view.yearPending.date, end: null });
        LP.view.yearPending = null;
        LP.save();
      };
      pop.querySelector('[data-pend-save]').addEventListener('click', save);
      pop.querySelectorAll('[data-pend-day]').forEach((bt) => bt.addEventListener('click', () => {
        const p = LP.view.yearPending;
        const d = u.addDays(p.date, Number(bt.dataset.pendDay));
        if (d < from || d >= to) return;
        LP.view.yearPending = { date: d, title: pop.querySelector('input').value };
        LP.render();
        const inp = root.querySelector('.yr-pop-input');
        if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
      }));
      pop.querySelector('[data-pend-cancel]').addEventListener('click', () => { LP.view.yearPending = null; LP.render(); });
      pop.querySelector('input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); save(); }
        if (e.key === 'Escape') { e.stopPropagation(); LP.view.yearPending = null; LP.render(); }
      });
    }

    root.querySelector('.year').addEventListener('click', (e) => {
      const t = e.target;
      if (Date.now() - justDragged < 120) return;
      const yr = t.closest('[data-yr]');
      if (yr) {
        LP.view.yearOffset = yr.dataset.yr === '0' ? 0 : off + Number(yr.dataset.yr);
        LP.view.yearPending = null;
        return LP.render();
      }
      const mk = t.closest('[data-mark]');
      if (mk) {
        const m = LP.lifeMark(mk.dataset.mark);
        if (m && m.end) { LP.view.yearPeriod = m.id; window.scrollTo(0, 0); return LP.render(); }
        return openMarkForm(m);
      }
      const di = t.closest('[data-date-id]');
      if (di) return openDateForm(L.dates.find((d) => d.id === di.dataset.dateId));
      if (t.closest('[data-add-date]')) return openDateForm(null);
      if (t.closest('[data-add-mark]')) return openMarkForm(null, today >= from && today < to ? today : from);
      const addIn = t.closest('[data-add-in]');
      if (addIn) return openMarkForm(null, addIn.dataset.addIn);
      if (t.closest('[data-bday]')) return openBirthdayForm();
    });
    root.querySelectorAll('[data-hol]').forEach((cb) => cb.addEventListener('change', () => {
      const id = cb.dataset.hol;
      L.holidays = cb.checked ? L.holidays.concat(id) : L.holidays.filter((x) => x !== id);
      LP.save();
    }));
  }

  // Дати з «Року» на [from, to] — для нагадувань у Telegram (за день і в сам день).
  LP.yearDates = function (from, to) {
    const L = life(), out = [];
    const end = u.addDays(to, 1);
    yearly(from, end).forEach((it) => out.push({ date: it.date, text: it.title }));
    L.marks.forEach((m) => {
      if (m.start >= from && m.start <= to) out.push({ date: m.start, text: (m.title || 'Позначка') + (m.end ? ` (до ${u.fmtDay(m.end)})` : '') });
      const items = (m.plan && Array.isArray(m.plan.items)) ? m.plan.items : [];
      items.forEach((it) => {
        if (it.start >= from && it.start <= to && it.text) out.push({ date: it.start, text: it.text + (it.end && it.end !== it.start ? ` (до ${u.fmtDay(it.end)})` : '') });
      });
    });
    if (L.birthday) {
      for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) {
        const d = mdIn(y, L.birthday.slice(5));
        if (d >= from && d <= to) out.push({ date: d, text: `Твій день народження — ${y - Number(L.birthday.slice(0, 4))} р.` });
      }
    }
    return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  };
  LP.lifeMark = (id) => life().marks.find((m) => m.id === id) || null;

  function openMarkForm(m, start, end) {
    const isNew = !m;
    const L = life();
    m = m || { title: '', note: '', start, end: end || null };
    LP.modal({
      title: isNew ? (m.end ? 'Період' : 'Позначка') : m.end ? 'Період' : 'Позначка',
      submitText: isNew ? 'Додати' : 'Зберегти',
      body: `
        <label class="field"><span>Що це</span><input type="text" name="title" maxlength="60" value="${u.esc(m.title)}" placeholder="${m.end ? 'Подорож, навчання, проєкт…' : 'Подія, дедлайн, концерт…'}"></label>
        <div class="row">
          <label class="field"><span>${m.end ? 'Від' : 'Коли'}</span><input type="date" name="start" value="${m.start}"></label>
          <label class="field"><span>До${m.end ? '' : ' (якщо це період)'}</span><input type="date" name="end" value="${m.end || ''}"></label>
        </div>
        <label class="field"><span>Нотатка</span><textarea name="note" rows="3" maxlength="600">${u.esc(m.note || '')}</textarea></label>`,
      extra: isNew ? [] : [{ text: 'Видалити', className: 'btn-danger', onClick: () => { L.marks = L.marks.filter((x) => x.id !== m.id); LP.save(); } }],
      onSubmit: (form) => {
        const title = form.title.value.trim();
        const s = form.start.value, f = form.end.value || null;
        const errs = [];
        if (!title) errs.push('Назви позначку.');
        if (!s) errs.push('Вкажи дату.');
        if (s && f && f <= s) errs.push('Кінець має бути пізніше за початок.');
        if (errs.length) return LP.showErrors(form, errs), false;
        Object.assign(m, { title, start: s, end: f, note: form.note.value.trim() });
        if (isNew) L.marks.push(Object.assign({ id: u.uid() }, m));
        LP.save();
      },
    });
  }

  function openDateForm(d) {
    const isNew = !d;
    const L = life();
    d = d || { name: '', kind: 'bday', md: u.today().slice(5), year: null };
    const [mm, dd] = d.md.split('-').map(Number);
    LP.modal({
      title: isNew ? 'Щорічна дата' : d.name,
      submitText: isNew ? 'Додати' : 'Зберегти',
      body: `
        <label class="field"><span>Хто / що</span><input type="text" name="name" maxlength="50" value="${u.esc(d.name)}" placeholder="Мама, Оля, весілля…"></label>
        <div class="field"><span>Що за дата</span><div class="seg seg-sm">
          ${Object.keys(KIND).map((k) => `<label><input type="radio" name="kind" value="${k}" ${d.kind === k ? 'checked' : ''}><span>${KIND[k]}</span></label>`).join('')}
        </div></div>
        <div class="row">
          <label class="field"><span>День</span><select name="day">${Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}" ${i + 1 === dd ? 'selected' : ''}>${i + 1}</option>`).join('')}</select></label>
          <label class="field"><span>Місяць</span><select name="month">${u.MONTHS.map((n, i) => `<option value="${i + 1}" ${i + 1 === mm ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
          <label class="field"><span>Рік (якщо знаєш)</span><input type="number" name="year" min="1900" max="2100" value="${d.year || ''}" placeholder="—"></label>
        </div>`,
      extra: isNew ? [] : [{ text: 'Видалити', className: 'btn-danger', onClick: () => { L.dates = L.dates.filter((x) => x.id !== d.id); LP.save(); } }],
      onSubmit: (form) => {
        const name = form.name.value.trim();
        if (!name) return LP.showErrors(form, ['Напиши імʼя чи назву.']), false;
        const m = Number(form.month.value), day = Math.min(Number(form.day.value), [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]);
        const y = parseInt(form.year.value, 10);
        Object.assign(d, { name, kind: form.querySelector('input[name=kind]:checked').value, md: `${pad(m)}-${pad(day)}`, year: y > 1900 ? y : null });
        if (isNew) L.dates.push(Object.assign({ id: u.uid() }, d));
        LP.save();
      },
    });
  }

  function openBirthdayForm() {
    const L = life();
    LP.modal({
      title: 'Твій день народження',
      submitText: 'Зберегти',
      body: `
        <label class="field"><span>Дата</span><input type="date" name="bd" value="${L.birthday || ''}" max="${u.today()}"></label>
        <p class="hint">Лінія року почнеться в цей день і закінчиться в наступний день народження.</p>`,
      onSubmit: (form) => {
        if (!form.bd.value) return LP.showErrors(form, ['Вкажи дату.']), false;
        L.birthday = form.bd.value;
        LP.view.yearOffset = 0;
        LP.save();
      },
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && LP.view && LP.view.yearPending && !document.querySelector('.modal-backdrop:not(.is-leaving)')) {
      LP.view.yearPending = null;
      LP.render();
    }
  });
  let rt = null;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => { if (LP.view && LP.view.tab === 'year') LP.render(); }, 150);
  });

  LP.views = LP.views || {};
  // ================= Період: що й коли в ньому =================
  // mark.plan = { items: [{ id, start, end|null, text }], list: [{ id, text, done }], notes }
  // Не по годинах: «14–17 — Карпати», «21 — клуб», «25–27 — вдома, відпочиваю».
  function planOf(m) {
    const p = (m.plan = m.plan && typeof m.plan === 'object' ? m.plan : {});
    p.list = p.list || [];
    p.items = p.items || [];
    if (p.days) { // старий формат «по днях» → прості пункти
      Object.keys(p.days).sort().forEach((d) => (p.days[d] || []).forEach((it) => {
        p.items.push({ id: it.id || u.uid(), start: d, end: null, text: (it.time != null ? u.fmtTime(it.time) + ' ' : '') + (it.text || '') });
      }));
      delete p.days;
    }
    p.items.forEach((it) => { delete it._lane; delete it._a; delete it._b; });
    return p;
  }
  const rangeLabel = (a, b) => {
    if (!b || b === a) return u.fmtDay(a);
    const [da, ma] = [u.parse(a).getDate(), a.slice(5, 7)], [db, mb] = [u.parse(b).getDate(), b.slice(5, 7)];
    return ma === mb ? `${da}–${db} ${u.fmtDay(b).split(' ')[1]}` : `${u.fmtDay(a)} – ${u.fmtDay(b)}`;
  };
  function openItemForm(m, it) {
    const plan = planOf(m);
    LP.modal({
      title: 'У періоді',
      submitText: 'Зберегти',
      body: `
        <label class="field"><span>Що</span><input type="text" name="text" maxlength="80" value="${u.esc(it.text)}"></label>
        <div class="row">
          <label class="field"><span>Від</span><input type="date" name="start" value="${it.start}" min="${m.start}" max="${m.end}"></label>
          <label class="field"><span>До (якщо кілька днів)</span><input type="date" name="end" value="${it.end || ''}" min="${m.start}" max="${m.end}"></label>
        </div>`,
      extra: [{ text: 'Видалити', className: 'btn-danger', onClick: () => { plan.items = plan.items.filter((x) => x.id !== it.id); LP.save(); } }],
      onSubmit: (form) => {
        const text = form.text.value.trim(), a = form.start.value, b = form.end.value || null;
        if (!text || !a) return LP.showErrors(form, ['Напиши назву й вкажи дату.']), false;
        Object.assign(it, { text, start: a, end: b && b > a ? b : null });
        LP.save();
      },
    });
  }
  function renderPeriod(root, m) {
    const plan = planOf(m);
    const n = days(m.start, m.end) + 1;
    const today = u.today();
    const dayList = [];
    for (let i = 0; i < n; i++) dayList.push(u.addDays(m.start, i));
    const idx = (d) => u.clamp(days(m.start, d), 0, n - 1);
    const sel = LP.view.periodSel && LP.view.periodSel.id === m.id ? LP.view.periodSel : (LP.view.periodSel = { id: m.id, a: null, b: null });
    // доріжки, щоб смуги не налазили
    const items = plan.items.slice().sort((x, y) => (x.start < y.start ? -1 : x.start > y.start ? 1 : (y.end || y.start) < (x.end || x.start) ? -1 : 1));
    const lanes = [], pos = new Map();
    items.forEach((it) => {
      const a = idx(it.start), b = idx(it.end || it.start);
      // коротка смуга розтягується під текст (до 200px) — і займає місце на доріжці
      const need = Math.min(200, Math.round(String(it.text).length * 7.6 + 26));
      const occ = Math.max(b, a + Math.ceil(need / 44) - 1);
      let l = lanes.findIndex((end) => end < a);
      if (l < 0) { l = lanes.length; lanes.push(-1); }
      lanes[l] = occ;
      pos.set(it.id, { l, a, b, need });
    });
    const lab = (d, i) => {
      const dt = u.parse(d).getDate();
      if (n <= 45) return `<small>${u.DAYS_SHORT[u.weekday(d)]}</small><b>${dt}</b>`;
      return u.weekday(d) === 0 || dt === 1 || i === 0 ? `<b>${dt}</b>` : '';
    };
    const sa = sel.a, sb = sel.b || sel.a;
    root.innerHTML = `
      <section class="period">
        <div class="pp-head">
          <button type="button" class="btn btn-sm" data-pp="back">← РІК</button>
          <div class="pp-title">
            <h2>${u.esc(m.title)}</h2>
            <span class="mono">${u.fmtDate(m.start).toUpperCase()} — ${u.fmtDate(m.end).toUpperCase()} · ${n} ДН.${today >= m.start && today <= m.end ? ' · ЗАРАЗ ДЕНЬ ' + (days(m.start, today) + 1) : today < m.start ? ' · ЧЕРЕЗ ' + days(today, m.start) + ' ДН.' : ''}</span>
          </div>
          <span class="yr-spacer"></span>
          <button type="button" class="btn btn-sm" data-pp="edit">ЗМІНИТИ ПЕРІОД</button>
        </div>
        ${m.note ? `<p class="pp-note">${u.esc(m.note)}</p>` : ''}

        <div class="pl-scroll"><div class="pl-line" style="--n:${n};min-width:${Math.max(n * (n <= 45 ? 34 : 12), 300)}px">
          <div class="pl-days">${dayList.map((d, i) => `<button type="button" class="pl-day ${d === today ? 'is-today' : ''} ${u.weekday(d) >= 5 ? 'is-we' : ''} ${sa && d >= (sa < sb ? sa : sb) && d <= (sa < sb ? sb : sa) ? 'is-sel' : ''}" data-d="${d}" title="${u.fmtDate(d)}">${lab(d, i)}</button>`).join('')}</div>
          <div class="pl-bars" style="height:${Math.max(lanes.length, 1) * 34 + 6}px">${items.map((it) => `
            <button type="button" class="pl-bar ${it.end ? '' : 'is-one'} ${(it.end || it.start) < today ? 'is-past' : ''}" data-it="${it.id}" style="left:calc(${pos.get(it.id).a} / var(--n) * 100%);width:calc(${pos.get(it.id).b - pos.get(it.id).a + 1} / var(--n) * 100% - 4px);min-width:${pos.get(it.id).need}px;top:${pos.get(it.id).l * 34 + 4}px" title="${u.esc(rangeLabel(it.start, it.end))} · ${u.esc(it.text)}">${u.esc(it.text)}</button>`).join('')}
            ${!items.length ? '<span class="pl-empty">Тут зʼявляться смуги. Натисни на дні вгорі або додай нижче.</span>' : ''}
          </div>
        </div></div>

        <form class="pl-add" autocomplete="off">
          <input type="date" name="a" value="${sa || m.start}" min="${m.start}" max="${m.end}" aria-label="Від">
          <span class="pl-dash">—</span>
          <input type="date" name="b" value="${sel.b && sel.b !== sel.a ? (sel.a < sel.b ? sel.b : sel.a) : ''}" min="${m.start}" max="${m.end}" aria-label="До">
          <input type="text" name="t" maxlength="80" placeholder="що: «Карпати», «клуб», «вдома, відпочиваю»" aria-label="Що">
          <button type="submit" class="btn btn-primary btn-sm">ДОДАТИ</button>
        </form>
        <p class="hint pl-hint">Натисни на перший день, потім на останній. Натисни на смугу, щоб змінити її.</p>

        <div class="pp-grid">
          <ol class="pl-list">${items.map((it) => `<li><button type="button" data-it="${it.id}"><span class="mono">${u.esc(rangeLabel(it.start, it.end)).toUpperCase()}</span><span>${u.esc(it.text)}</span></button></li>`).join('') || ''}</ol>
          <aside class="pp-side">
            <div class="pp-box">
              <div class="label">СПИСОК</div>
              <p class="hint">Що взяти, купити, забронювати.</p>
              <ul class="pp-items">${plan.list.map((it) => `
                <li class="pp-item ${it.done ? 'is-done' : ''}" data-litem="${it.id}">
                  <button type="button" class="pp-check" data-pp="ltoggle" aria-label="Позначити"></button>
                  <input class="pp-text" value="${u.esc(it.text)}" aria-label="Пункт">
                  <button type="button" class="icon-btn small" data-pp="ldel" aria-label="Прибрати">✕</button>
                </li>`).join('')}</ul>
              <input class="pp-add" data-list="1" placeholder="+ додати пункт">
              ${plan.list.length ? `<p class="mono muted pp-count">${plan.list.filter((x) => x.done).length} / ${plan.list.length}</p>` : ''}
            </div>
            <div class="pp-box">
              <div class="label">НОТАТКИ</div>
              <textarea class="pp-notes" rows="6" placeholder="Адреси, бронювання, ідеї…">${u.esc(plan.notes || '')}</textarea>
            </div>
          </aside>
        </div>
      </section>`;

    const sec = root.querySelector('.period');
    const save = () => LP.save({ render: false });
    const form = sec.querySelector('.pl-add');
    sec.addEventListener('click', (e) => {
      const day = e.target.closest('.pl-day');
      if (day) {
        const d = day.dataset.d;
        if (!sel.a || sel.b) { sel.a = d; sel.b = null; } else sel.b = d;
        LP.render();
        const t = document.querySelector('.pl-add [name=t]');
        if (t) t.focus();
        return;
      }
      const it = e.target.closest('[data-it]');
      if (it) return openItemForm(m, plan.items.find((x) => x.id === it.dataset.it));
      const b = e.target.closest('[data-pp]');
      if (!b) return;
      const a = b.dataset.pp;
      if (a === 'back') { LP.view.yearPeriod = null; LP.view.periodSel = null; return LP.render(); }
      if (a === 'edit') return openMarkForm(m);
      const li = b.closest('.pp-item');
      if (a === 'ltoggle') { const x = plan.list.find((q) => q.id === li.dataset.litem); x.done = !x.done; return LP.save(); }
      if (a === 'ldel') { plan.list = plan.list.filter((q) => q.id !== li.dataset.litem); return LP.save(); }
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const t = form.t.value.trim(), a = form.a.value, b = form.b.value;
      if (!t) return form.t.focus();
      if (!a) return;
      const [x, y] = b && b < a ? [b, a] : [a, b];
      plan.items.push({ id: u.uid(), start: x, end: y && y !== x ? y : null, text: t });
      LP.view.periodSel = { id: m.id, a: null, b: null };
      LP.save();
      const nt = document.querySelector('.pl-add [name=t]');
      if (nt) nt.focus();
    });
    sec.addEventListener('change', (e) => {
      const li = e.target.closest('.pp-item');
      if (li && li.dataset.litem) { plan.list.find((x) => x.id === li.dataset.litem).text = e.target.value.trim(); save(); }
    });
    const ladd = sec.querySelector('.pp-add[data-list]');
    ladd.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || !ladd.value.trim()) return;
      e.preventDefault();
      plan.list.push({ id: u.uid(), text: ladd.value.trim(), done: false });
      save(); LP.render();
      const el = document.querySelector('.pp-add[data-list]'); if (el) el.focus();
    });
    let nt = null;
    sec.querySelector('.pp-notes').addEventListener('input', (e) => { clearTimeout(nt); nt = setTimeout(() => { plan.notes = e.target.value; save(); }, 500); });
  }

  LP.views.year = { render };
})(window.LP);
