/* Анирын өдрийн тэмдэглэл — жинхэнэ дэвтэр шиг уншигдах ном.
   • Хуудас эргэхэд цаасны чимээ гарна (WebAudio, файл хэрэггүй). Хуудсыг чирж, захаас нь товшиж,
     хулганы дугуйгаар эсвэл ←/→ товчоор эргүүлнэ. Тусдаа «Дараагийн» товч хэрэггүй.
   • Нийтэлсэн тэмдэглэлийг /api/diary-аас уншиж, дэлгэцэнд багтахаар хуудаслана.
   • Админы бичвэрт ==ийм== гэж тэмдэглэвэл шар маркераар тодруулна. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const RATIO = 0.8;                       // нэг хуудасны өргөн / өндөр
  const FLIP_MS = 950;
  const reduce = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ── Чимэглэлийн зургууд (SVG) ── */
  const SVG = {
    flower: '<svg class="nb-deco nb-flower" viewBox="0 0 100 150" fill="none" stroke="#a08a63" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M52 148C50 112 46 82 40 42"/><path d="M50 122C62 102 70 80 76 58"/><path d="M47 104C36 90 28 72 22 54"/><g fill="#f4e7cc" stroke="#b39d76"><circle cx="40" cy="34" r="6"/><circle cx="31" cy="42" r="5"/><circle cx="49" cy="40" r="5"/><circle cx="36" cy="24" r="4.5"/><circle cx="76" cy="50" r="6"/><circle cx="68" cy="58" r="5"/><circle cx="84" cy="58" r="4.5"/><circle cx="22" cy="46" r="5.5"/><circle cx="14" cy="55" r="4.5"/><circle cx="29" cy="55" r="4"/></g><g fill="#d7bb86" stroke="none"><circle cx="40" cy="34" r="2"/><circle cx="76" cy="50" r="2"/><circle cx="22" cy="46" r="2"/></g></svg>',
    heart: '<svg class="nb-deco nb-heart" viewBox="0 0 60 56" aria-hidden="true"><path fill="#2c2924" d="M30 52C9 37 1 25 6 14 10 4 24 3 30 14 36 3 50 4 54 14 59 25 51 37 30 52Z"/><path d="M14 16c3-4 8-4 11 0" fill="none" stroke="#f1e7d0" stroke-width="2" stroke-linecap="round"/></svg>',
    cup: '<svg class="nb-deco nb-cup" viewBox="0 0 120 130" fill="none" stroke="#3a352e" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M26 62H88C88 92 78 107 57 107 36 107 26 92 26 62Z"/><path d="M88 70C106 68 106 93 86 93"/><ellipse cx="57" cy="62" rx="31" ry="6"/><path d="M14 114H100"/><path d="M52 44c-4-5-11 0-6 6l6 5 6-5c5-6-2-11-6-6Z" stroke-width="1.6"/><path d="M71 26c-3-4-8 0-4 4l4 4 4-4c4-4-1-8-4-4Z" stroke-width="1.5"/><path d="M40 28c-2-3-6 0-3 3l3 3 3-3c3-3-1-6-3-3Z" stroke-width="1.4"/></svg>',
    clip: '<svg class="nb-deco nb-clip" viewBox="0 0 30 80" fill="none" stroke="#9aa0a6" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M10 28V60C10 70 22 70 22 60V16C22 6 8 6 8 18V56"/></svg>',
    mini: '<svg class="nb-mini" viewBox="0 0 24 22" width="1em" height="1em" aria-hidden="true" style="vertical-align:-.1em;margin-left:.15em"><path fill="#5d7a54" d="M12 21C4 15 1 10 3 6c2-4 7-3 9 1 2-4 7-5 9-1 2 4-1 9-9 15Z"/></svg>'
  };
  const tape = k => `<i class="nb-tape ${k}" aria-hidden="true"></i>`;

  /* ── Нэг хуудасны HTML ── */
  function textHtml(s) {
    return esc(s).replace(/==([^=]+?)==/g, '<span class="hl">$1</span>').replace(/==/g, '');
  }
  const SIGN = `<span class="nb-sign">— Анир${SVG.mini}</span>`;
  function entryInner(e, part, text, last) {
    const head = part === 0
      ? `<div class="nb-head"><span class="nb-hn">${e.no}.</span><span class="nb-ht">${esc(e.title)}</span></div>${e.date ? `<div class="nb-date">${esc(e.date)}</div>` : ''}`
      : `<div class="nb-head"><span class="nb-ht">${esc(e.title)} <small>(үргэлжлэл)</small></span></div>`;
    const photo = part === 0 && e.imageUrl ? `<figure class="nb-photo"><img src="${esc(e.imageUrl)}" alt="" onerror="this.closest('figure').remove()"></figure>` : '';
    return `${head}${photo}<div class="nb-text">${textHtml(text)}${last && e.kind !== 'intro' ? SIGN : ''}</div>`;
  }
  // n — хуудасны дугаар (1-ээс); чимэглэл хуудасны дугаараас хамаарч тогтмол байна
  function decorOf(n, e) {
    const k = n % 4;
    if (e.kind === 'intro') return { cls: 'has-cup', html: tape('a') + SVG.cup + SVG.flower };
    if (k === 1) return { cls: 'has-flower', html: tape('c') + SVG.flower };
    if (k === 2) return { cls: '', html: tape('b') + SVG.heart };
    if (k === 3) return { cls: '', html: tape('a') };
    return { cls: '', html: tape('c') + SVG.clip };
  }
  const pageShell = (side, n, inner, deco) =>
    `<div class="nb-page ${side} ${deco.cls || ''}">${deco.html || ''}<div class="nb-inner">${inner}</div>${n ? `<span class="nb-pn">${n}</span>` : ''}</div><div class="nb-shade"></div>`;

  /* ── Бэлэн (тогтмол) хуудсууд ── */
  const INSIDE = side => pageShell(side, 0,
    `<div class="nb-head"><span class="nb-ht">Анирын тэмдэглэл</span></div><div class="nb-lead">Энэ дэвтэр миний.</div>`,
    { html: tape('b') + SVG.heart + `<div class="nb-note n2"><div>Энэ дэвтэрт миний өдөр хоног, бодол, асуулт, жижигхэн нээлтүүд үлдэнэ.</div></div>` });
  const PAD = (side, n) => pageShell(side, n, `<div class="nb-lead">Бичих хэсэг:</div><div class="nb-lines"></div>`, { html: tape('a') + SVG.heart.replace('nb-heart', 'nb-heart" style="top:auto;bottom:5%;right:9%') });
  const END = (side, n, hasEntries) => pageShell(side, n,
    `<div class="nb-head"><span class="nb-ht">${hasEntries ? 'Үргэлжлэл бий...' : 'Удахгүй...'}</span></div>`,
    { html: tape('d') + SVG.heart + `<div class="nb-note n1"><div>${hasEntries ? 'Анир долоо хоног бүр шинэ тэмдэглэлээ энд нэмнэ.' : 'Анир эхний тэмдэглэлээ бичиж байна. Удахгүй уулзацгаая!'}</div></div>` });
  const COVER = '<div class="nb-cover" aria-label="Дэвтрийг нээх"><div class="nb-cover-in"><small>МИНИЙ НУУЦХАН ЕРТӨНЦ</small><img src="/anir-cover.png" alt="Анир"><h3>Анирын<br>өдрийн тэмдэглэл</h3><p>Бодол · Дурсамж · Найзууд</p><span class="tap">Товшиж нээгээрэй</span></div></div>';

  const INTRO = { kind: 'intro', title: 'Сайн уу, уншигч минь...', date: '', no: 1,
    body: 'Намайг Анир гэдэг. Би заримдаа олон зүйл боддог ч тэр бүр чангаар хэлж чаддаггүй.\n\n==Тиймээс бодлоо энэ дэвтэрт бичиж үлдээхээр шийдлээ.== Магадгүй миний туулсан зүйлс чамд ч танил санагдах байх.\n\nХамтдаа миний ертөнцөөр аялцгаая.' };

  /* ── Төлөв ── */
  const S = { entries: [], pages: [], leaves: [], idx: 0, single: false, W: 0, H: 0, busy: false, sound: true, ctx: null, hinted: false, wheel: 0, wheelAt: 0 };
  try { S.sound = localStorage.getItem('nb_sound') !== '0'; } catch (e) { /* хадгалах боломжгүй */ }
  let book, wrap, measure, built = false;

  /* ── Цаасны чимээ ── */
  function unlockAudio() {
    try {
      if (!S.ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; S.ctx = new AC(); }
      if (S.ctx.state === 'suspended') S.ctx.resume();
    } catch (e) { /* дууг дэмжихгүй */ }
  }
  function paperSound(strength) {
    if (!S.sound || !S.ctx || S.ctx.state !== 'running') return;
    try {
      const c = S.ctx, dur = 0.5 * (strength || 1), n = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
      let crackle = 0;
      for (let i = 0; i < n; i++) {
        const t = i / n, env = Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.15)), 1.6) * (1 - t * 0.35);
        if (Math.random() < 0.0016) crackle = 1; crackle *= 0.97;
        d[i] = (Math.random() * 2 - 1) * (0.35 * env + 0.7 * crackle * env);
      }
      const src = c.createBufferSource(); src.buffer = buf;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.8;
      bp.frequency.setValueAtTime(1500, c.currentTime); bp.frequency.exponentialRampToValueAtTime(5200, c.currentTime + dur * 0.8);
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 500;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, c.currentTime); g.gain.exponentialRampToValueAtTime(0.5, c.currentTime + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
      src.connect(bp); bp.connect(hp); hp.connect(g); g.connect(c.destination); src.start();
      // хуудас буухад гарах зөөлөн «шаг»
      const t0 = c.currentTime + dur * 0.78, o = c.createOscillator(), og = c.createGain(); o.type = 'sine';
      o.frequency.setValueAtTime(130, t0); o.frequency.exponentialRampToValueAtTime(60, t0 + 0.09);
      og.gain.setValueAtTime(0.0001, t0); og.gain.exponentialRampToValueAtTime(0.16, t0 + 0.01); og.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
      o.connect(og); og.connect(c.destination); o.start(t0); o.stop(t0 + 0.14);
    } catch (e) { /* чимээгүй үргэлжилнэ */ }
  }

  /* ── Хэмжээс: дэлгэцэнд ЯГ багтана ── */
  function navHeight() { const n = document.querySelector('nav'); if (!n) return 0; const p = getComputedStyle(n).position; return (p === 'fixed' || p === 'sticky') ? n.offsetHeight : 0; }
  function measureSize() {
    const stage = $('nbStage'); if (!stage || !stage.clientWidth) return null;
    const Wa = stage.clientWidth - 20, vh = window.innerHeight;
    const single = Wa < 700;
    let H = Math.max(340, Math.min(vh - navHeight() - 96, 800)), W = H * RATIO;
    if (single) { if (W > Wa - 14) { W = Wa - 14; H = W / RATIO; } }
    else if (2 * W > Wa - 24) { W = (Wa - 24) / 2; H = W / RATIO; }
    return { single, W: Math.round(W), H: Math.round(H) };
  }
  function applySize(m) {
    S.single = m.single; S.W = m.W; S.H = m.H;
    const u = m.H / 740;
    wrap.style.setProperty('--bw', (m.single ? m.W : 2 * m.W) + 'px');
    wrap.style.setProperty('--ph', m.H + 'px');
    wrap.style.setProperty('--fu', Math.max(u, 0.72).toFixed(3));
    wrap.classList.toggle('single', m.single); book.classList.toggle('single', m.single);
    measure.style.width = m.W + 'px'; measure.style.height = m.H + 'px';   // хуудаслалтын хэмжих хайрцаг = жинхэнэ хуудасны хэмжээ
  }

  /* ── Хуудаслалт: бичвэрийг хуудасны өндөрт тааруулж хуваана ── */
  function fits(e, part, text, last, n) {
    const d = decorOf(n, e);
    measure.innerHTML = `<div class="nb-page r ${d.cls}"><div class="nb-inner">${entryInner(e, part, text, last)}</div></div>`;
    const t = measure.querySelector('.nb-text');
    return t.scrollHeight <= t.clientHeight + 1;
  }
  function splitEntry(e, startN) {
    const out = []; let rest = String(e.body || '').replace(/\r/g, '').trim(), part = 0, n = startN;
    if (!rest) rest = ' ';
    while (rest.length) {
      let lo = 0, hi = rest.length, last = false;
      if (fits(e, part, rest, true, n)) { lo = rest.length; last = true; }
      else {
        while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (fits(e, part, rest.slice(0, mid), false, n)) lo = mid; else hi = mid - 1; }
        if (lo === 0) lo = Math.min(rest.length, 24);            // хамгаалалт: хязгааргүй давталтаас сэргийлнэ
        if (lo < rest.length) {                                    // үгийн зааг дээр таслана
          const cut = Math.max(rest.lastIndexOf('\n', lo), rest.lastIndexOf(' ', lo));
          if (cut > lo * 0.5) lo = cut;
          const slice = rest.slice(0, lo), marks = (slice.match(/==/g) || []).length;
          if (marks % 2) { const m = slice.lastIndexOf('=='); if (m > 0) lo = m; }  // маркерын дундуур таслахгүй
        }
      }
      const text = rest.slice(0, lo).replace(/\s+$/, '');
      out.push({ e, part, text, n });
      rest = rest.slice(lo).replace(/^\s+/, ''); part++; n++;
      if (last) { out[out.length - 1].last = true; break; }
    }
    return out;
  }
  function paginate() {
    const items = [INTRO].concat(S.entries.map((x, i) => ({ kind: 'entry', no: i + 2, id: x.id, title: x.title, date: x.dateLabel, body: x.body, imageUrl: x.imageUrl })));
    const pages = []; let n = 1;
    items.forEach(e => { splitEntry(e, n).forEach(p => { pages.push(p); n++; }); });
    if (!S.single && (pages.length + 1) % 2) pages.push({ kind: 'pad', n: n++ });   // хоёр хуудастай хөндийг тэгш болгоно
    pages.push({ kind: 'end', n: n++ });
    return pages;
  }
  function pageFace(p, side) {
    if (p.kind === 'pad') return PAD(side, p.n);
    if (p.kind === 'end') return END(side, p.n, S.entries.length > 0);
    return pageShell(side, p.n, entryInner(p.e, p.part, p.text, p.last), decorOf(p.n, p.e));
  }

  /* ── Номыг босгох ── */
  function key(p) { return p ? (p.e ? (p.e.id || p.e.kind) + ':' + p.part : p.kind) : ''; }
  function build() {
    if (!book) return;
    const m = measureSize(); if (!m) return;
    const wasOpen = S.idx > 0;
    const prevKey = wasOpen && S.pages.length ? key(S.pages[Math.max(0, S.single ? S.idx - 1 : (S.idx - 1) * 2)]) : '';
    applySize(m);
    S.pages = paginate();
    const leaves = [{ front: `<div class="nb-face front">${COVER}<div class="nb-shade"></div></div>`, back: S.single ? '' : `<div class="nb-face back">${INSIDE('l')}</div>` }];
    if (S.single) S.pages.forEach(p => leaves.push({ front: `<div class="nb-face front">${pageFace(p, 'r')}</div>`, back: '' }));
    else for (let i = 0; i < S.pages.length; i += 2) leaves.push({ front: `<div class="nb-face front">${pageFace(S.pages[i], 'r')}</div>`, back: S.pages[i + 1] ? `<div class="nb-face back">${pageFace(S.pages[i + 1], 'l')}</div>` : '<div class="nb-face back"></div>' });
    S.leaves = leaves;
    book.innerHTML = '<div class="nb-board"></div>';
    leaves.forEach((l, i) => { const el = document.createElement('div'); el.className = 'nb-leaf'; el.dataset.i = i; el.innerHTML = l.front + l.back; book.appendChild(el); });
    book.appendChild(measure); measure.innerHTML = '';
    let idx = 0;
    if (wasOpen && prevKey) { const pi = S.pages.findIndex(p => key(p) === prevKey); if (pi >= 0) idx = S.single ? pi + 1 : Math.floor(pi / 2) + 1; }
    S.idx = Math.min(idx, leaves.length);
    built = true; paint();
  }
  function paint() {
    const els = book.querySelectorAll('.nb-leaf'), L = els.length;
    els.forEach((el, i) => {
      el.classList.remove('flipping', 'drag'); el.style.transform = '';
      const turned = i < S.idx; el.classList.toggle('turned', turned);
      el.style.zIndex = turned ? i + 1 : L - i;
    });
    state();
  }
  function curPage() {
    if (S.idx <= 0) return 0;
    const L = S.leaves.length;
    if (S.single) return Math.min(S.pages.length, S.idx);
    return S.idx >= L ? S.pages.length : Math.min(S.pages.length, (S.idx - 1) * 2 + 1);
  }
  function state() {
    const L = S.leaves.length, open = S.idx > 0, st = open ? 'open' : 'closed';
    book.dataset.state = st; wrap.dataset.state = st;
    wrap.classList.toggle('can-next', S.idx < L); wrap.classList.toggle('can-prev', S.idx > 0);
    const pager = $('nbPager'); if (pager) pager.textContent = open ? `${curPage()} / ${S.pages.length}` : '';
    const hint = $('nbHint'); if (hint) hint.classList.toggle('off', S.hinted);
    const prev = $('diaryPrevBtn'), next = $('diaryNextBtn');
    if (prev) prev.disabled = S.idx <= 0;
    if (next) next.disabled = S.idx >= L;
  }
  function announce() { const live = $('nbLive'); if (live) live.textContent = S.idx > 0 ? 'Хуудас ' + curPage() + ' / ' + S.pages.length : 'Дэвтэр хаалттай'; }

  /* ── Хуудас эргүүлэх ── */
  const leafEl = i => book.querySelector(`.nb-leaf[data-i="${i}"]`);
  function go(dir, opts) {
    opts = opts || {};
    const L = S.leaves.length;
    if (S.busy) return false;
    const target = dir > 0 ? S.idx : S.idx - 1;
    if (target < 0 || target >= L) return false;
    const el = leafEl(target); if (!el) return false;
    S.busy = true; S.hinted = true;
    el.style.zIndex = 999; el.classList.add('flipping');
    el.classList.toggle('turned', dir > 0);
    S.idx += dir; state(); paperSound(opts.soft ? 0.75 : 1);
    const done = () => { S.busy = false; paint(); announce(); };
    if (reduce()) done(); else setTimeout(done, FLIP_MS + 30);
    return true;
  }
  function jumpTo(target) {                                       // архивын картаас шууд нээх
    target = Math.max(0, Math.min(S.leaves.length, target));
    if (target === S.idx) return;
    S.idx = target; S.hinted = true; paint(); paperSound(1.1); announce();
  }

  /* ── Чирж эргүүлэх ── */
  let drag = null;
  function onDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    unlockAudio();
    if (S.busy || !built) return;
    const r = book.getBoundingClientRect(), x = e.clientX - r.left;
    drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, dir: S.single ? 0 : (S.idx === 0 ? 1 : (x > r.width / 2 ? 1 : -1)), moved: false, el: null, p: 0 };
    try { book.setPointerCapture(e.pointerId); } catch (_) { /* */ }
  }
  function onMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (!drag.moved) {
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) return;            // босоо гүйлгэлтийг тасалдуулахгүй
      const dir = S.single || !drag.dir ? (dx < 0 ? 1 : -1) : drag.dir;
      const target = dir > 0 ? S.idx : S.idx - 1;
      if (target < 0 || target >= S.leaves.length) return;
      drag.dir = dir; drag.el = leafEl(target); if (!drag.el) return;
      drag.moved = true; S.hinted = true; drag.el.classList.add('drag'); drag.el.style.zIndex = 999;
    }
    if (!drag.el) return;
    const p = Math.max(0, Math.min(1, (drag.dir > 0 ? -dx : dx) / (S.W * 1.05)));
    drag.p = p;
    drag.el.style.transform = `rotateY(${drag.dir > 0 ? -180 * p : -180 + 180 * p}deg)`;
    drag.el.querySelectorAll('.nb-shade').forEach(s => { s.style.opacity = (Math.sin(Math.PI * p) * 0.55).toFixed(2); });
    e.preventDefault();
  }
  function onUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag; drag = null;
    try { book.releasePointerCapture(e.pointerId); } catch (_) { /* */ }
    if (!d.moved) { tap(e); return; }
    const el = d.el, commit = d.p > 0.28;
    el.querySelectorAll('.nb-shade').forEach(s => { s.style.opacity = ''; });
    el.classList.remove('drag'); el.classList.add('flipping');
    el.style.transform = '';
    el.classList.toggle('turned', d.dir > 0 ? commit : !commit);
    S.busy = true;
    if (commit) { S.idx += d.dir; S.hinted = true; paperSound(0.9); state(); }
    setTimeout(() => { S.busy = false; paint(); announce(); }, reduce() ? 0 : FLIP_MS + 30);
  }
  function tap(e) {
    const r = book.getBoundingClientRect(), x = (e.clientX - r.left) / r.width;
    if (S.idx === 0) { openBook(); return; }
    if (S.single) { go(x > 0.35 ? 1 : -1); return; }
    if (x > 0.62) go(1); else if (x < 0.38) go(-1);
  }
  function onCancel(e) { if (drag && e.pointerId === drag.id) { drag = null; paint(); } }

  function onWheel(e) {
    if (S.idx === 0 || !built) return;                                // хаалттай үед хуудсыг хэвийн гүйлгэнэ
    const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (!dx) return;
    const dir = dx > 0 ? 1 : -1, L = S.leaves.length;
    if ((dir > 0 && S.idx >= L) || (dir < 0 && S.idx <= 0)) return;
    e.preventDefault(); unlockAudio();
    const now = Date.now(); if (now - S.wheelAt > 300) S.wheel = 0;
    S.wheelAt = now; S.wheel += dx;
    if (Math.abs(S.wheel) > 40 && !S.busy) { S.wheel = 0; go(dir, { soft: true }); }
  }
  function onKey(e) {
    const sec = $('diarySection'); if (!sec || !sec.classList.contains('active')) return;
    if (/^(input|textarea|select)$/i.test(e.target.tagName || '')) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { unlockAudio(); if (S.idx === 0) openBook(); else go(1); e.preventDefault(); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { unlockAudio(); go(-1); e.preventDefault(); }
    else if ((e.key === 'Enter' || e.key === ' ') && e.target === book) { unlockAudio(); if (S.idx === 0) openBook(); else go(1); e.preventDefault(); }
    else if (e.key === 'Home' && S.idx > 0) { jumpTo(0); e.preventDefault(); }
  }
  function scrollToBook() {
    const st = $('nbStage'); if (!st) return;
    const top = st.getBoundingClientRect().top + window.scrollY - navHeight() - 6;
    try { window.scrollTo({ top: Math.max(0, top), behavior: reduce() ? 'auto' : 'smooth' }); } catch (_) { window.scrollTo(0, Math.max(0, top)); }
  }
  function openBook() { if (!built) return; scrollToBook(); go(1); }

  /* ── Өгөгдөл ── */
  const dateLabel = v => v ? String(v).slice(0, 10).replace(/-/g, '.') : '';
  function renderArchive() {
    const archive = document.querySelector('.diary-archive'); if (!archive) return;
    const old = archive.querySelector('.diary-empty, .diary-entry-list');
    if (!S.entries.length) return;
    const list = document.createElement('div'); list.className = 'diary-entry-list';
    S.entries.forEach((e, i) => {
      const card = document.createElement('article'); card.className = 'diary-entry-card';
      const h = document.createElement('h4'); h.textContent = e.title;
      const date = document.createElement('small'); date.textContent = e.dateLabel;
      const p = document.createElement('p'); p.textContent = e.excerpt || String(e.body || '').replace(/==/g, '').slice(0, 180);
      const btn = document.createElement('button'); btn.type = 'button'; btn.textContent = 'Дэвтрээс унших'; btn.addEventListener('click', () => window.openAnirDiary(i + 1));
      card.append(date, h, p, btn); list.append(card);
    });
    if (old) old.replaceWith(list); else archive.append(list);
  }
  async function load() {
    try {
      const r = await fetch('/api/diary', { headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error('Тэмдэглэл ачаалж чадсангүй');
      const arr = await r.json();
      S.entries = (Array.isArray(arr) ? arr : []).map(x => ({ id: x.id, title: String(x.title || ''), body: String(x.body || ''), excerpt: x.excerpt || '', imageUrl: x.imageUrl || '', dateLabel: dateLabel(x.date) }));
    } catch (e) { console.warn('Анирын тэмдэглэл:', e.message); }
    renderArchive();
    if (built) build();
  }

  /* ── Эхлүүлэлт ── */
  function init() {
    book = $('nbBook'); wrap = $('nbWrap'); if (!book || !wrap) return;
    measure = document.createElement('div'); measure.className = 'nb-measure'; book.appendChild(measure);
    book.addEventListener('pointerdown', onDown); book.addEventListener('pointermove', onMove);
    book.addEventListener('pointerup', onUp); book.addEventListener('pointercancel', onCancel);
    book.addEventListener('wheel', onWheel, { passive: false });
    document.addEventListener('keydown', onKey);
    ['pointerdown', 'keydown', 'touchend'].forEach(t => document.addEventListener(t, unlockAudio, { passive: true }));
    const snd = $('nbSound');
    if (snd) {
      const sync = () => { snd.setAttribute('aria-pressed', S.sound ? 'true' : 'false'); snd.title = S.sound ? 'Цаасны чимээг хаах' : 'Цаасны чимээг асаах'; };
      sync();
      snd.addEventListener('click', () => { S.sound = !S.sound; try { localStorage.setItem('nb_sound', S.sound ? '1' : '0'); } catch (_) { /* */ } sync(); unlockAudio(); if (S.sound) paperSound(0.8); });
    }
    const pb = $('diaryPrevBtn'), nb = $('diaryNextBtn');
    if (pb) pb.addEventListener('click', () => go(-1));
    if (nb) nb.addEventListener('click', () => (S.idx === 0 ? openBook() : go(1)));
    let t = 0;
    const relayout = () => { clearTimeout(t); t = setTimeout(() => { const m = measureSize(); if (!m) return; if (!built || m.single !== S.single || Math.abs(m.W - S.W) > 2 || Math.abs(m.H - S.H) > 2) build(); }, 120); };
    if ('ResizeObserver' in window) new ResizeObserver(relayout).observe($('nbStage')); else window.addEventListener('resize', relayout);
    window.addEventListener('orientationchange', relayout);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (built) build(); });
    build();                                                          // хэмжээ олдохгүй (нууцлагдсан) бол ResizeObserver дараа нь дуудна
    load();
  }

  /* ── Хуучин нэртэй функцүүд (архивын карт, бусад код) ── */
  window.openAnirDiary = function (entryNo) {
    if (!built) build(); if (!built) return;
    unlockAudio(); scrollToBook();
    const ent = Number.isInteger(entryNo) && entryNo > 0 ? S.entries[entryNo - 1] : null;
    if (ent) {
      const pi = S.pages.findIndex(p => p.e && p.e.kind === 'entry' && p.e.id === ent.id && p.part === 0);
      if (pi >= 0) { jumpTo(S.single ? pi + 1 : Math.floor(pi / 2) + 1); return; }
    }
    if (S.idx === 0) go(1);
  };
  window.closeAnirDiary = function () { jumpTo(0); };
  window.turnDiaryPage = function (dir) { if (S.idx === 0 && dir > 0) openBook(); else go(dir > 0 ? 1 : -1); };
  window.__nb = S;   // шалгалтад

  // Дэвтрийн хэсэг нээгдэх үед дэвтэр дэлгэцэнд яг багтахаар байрлуулна
  document.addEventListener('DOMContentLoaded', () => {
    const sec = $('diarySection'); if (!sec || !('MutationObserver' in window)) return;
    let was = sec.classList.contains('active');
    new MutationObserver(() => { const now = sec.classList.contains('active'); if (now && !was) setTimeout(() => { const st = $('nbStage'); if (st) window.scrollTo(0, Math.max(0, st.getBoundingClientRect().top + window.scrollY - navHeight() - 6)); }, 60); was = now; }).observe(sec, { attributes: true, attributeFilter: ['class'] });
  });
  if (location.hash === '#diary') document.addEventListener('DOMContentLoaded', () => { if (typeof window.showSec === 'function') window.showSec('diary'); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
