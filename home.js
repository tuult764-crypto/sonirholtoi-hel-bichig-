/* ══════════════════════════════════════════════════════
   НҮҮР ХУУДАС — дүрүүд, өнөөдрийн даалгавар, мэдээ, миний ахиц
   Энэ файлын дээд талын 3 тохиргоог (CHARACTERS, TODAY_TASK, HOME_NEWS) өөрөө засаж болно.
   ══════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── 1. ДҮРҮҮД ─────────────────────────────────────────
     Жинхэнэ зургаа images/characters/ хавтсанд яг эдгээр нэрээр хийвэл
     түр орлуулах дүрс автоматаар солигдоно. Зураг байхгүй бол нэрийн
     эхний үсэгтэй дугуй дүрс харагдана. plush = зараа чихмэл тоглоомын
     зураг (заавал биш; байхгүй бол харуулахгүй).
     Дараалал: эхнийх нь зүүн талд том, бусад нь баруун талд харагдана. */
  const CHARACTERS = [
    { key: 'tsovoo',  name: 'Цовоо',  color: '#f6c9a0', img: 'images/characters/tsovoo.png',  plush: 'images/characters/tsovoo-plush.png',  say: 'Хамтдаа сонирхолтойгоор сурцгаая!' },
    { key: 'todoo',   name: 'Тодоо',  color: '#f4b7a8', img: 'images/characters/todoo.png',   plush: 'images/characters/todoo-plush.png',   say: 'Суръя!' },
    { key: 'enkhrii', name: 'Энхрий', color: '#cfe3c8', img: 'images/characters/enkhrii.png', plush: 'images/characters/enkhrii-plush.png', say: 'Уншъя!' },
    { key: 'ajaa',    name: 'Ажаа',   color: '#c7dcef', img: 'images/characters/ajaa.png',    plush: 'images/characters/ajaa-plush.png',    say: 'Тоглоё!' },
    { key: 'anir',    name: 'Анир',   color: '#d9cdee', img: 'images/characters/anir.png',    plush: 'images/characters/anir-plush.png',    say: 'Бүтээе!' }
  ];
  const PROGRESS_CHARACTER = 'tsovoo';           // "Миний ахиц" картын дүр
  const PROGRESS_SAY = 'Маш сайн байна! Өнөөдөр ч бас хичээлээ үргэлжлүүлээрэй!';

  /* ── 2. ӨНӨӨДРИЙН ДААЛГАВАР ───────────────────────────── */
  const TODAY_TASK = {
    tag: 'Судоку',
    title: 'Өнөөдрийн судоког бод',
    text: 'Тоогоор дасгалжиж, анхаарлаа хөгжүүл.',
    button: 'Даалгавар эхлүүлэх',
    section: 'sudoku'
  };

  /* ── 3. МЭДЭЭ, МЭДЭЭЛЭЛ ──────────────────────────────── */
  const HOME_NEWS = [
    { icon: '📝', text: 'Ээлжит хичээл боловсруулах хэсэг нэмэгдлээ', date: '2026.10.27', isNew: true },
    { icon: '🎮', text: 'Судоку: өдөрт 1 хуудас үнэгүй хэвлэнэ', date: '2026.10.27' },
    { icon: '🏠', text: 'Нүүр хуудас шинэчлэгдлээ', date: '2026.10.28' }
  ];

  /* ── туслахууд ── */
  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const today = () => { try { return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ulaanbaatar' }); } catch (e) { return new Date().toISOString().slice(0, 10); } };
  const dayNo = s => Math.round(Date.parse(s + 'T00:00:00Z') / 864e5);

  /* ── дүр үүсгэх (зураг байхгүй бол түр орлуулах дүрс) ── */
  function placeholder(c) {
    const d = el('div', 'char-ph', c.name.charAt(0));
    d.style.setProperty('--ph', c.color);
    d.setAttribute('role', 'img'); d.setAttribute('aria-label', c.name);
    return d;
  }
  function characterEl(c, opts) {
    opts = opts || {};
    const wrap = el('div', 'char' + (opts.cls ? ' ' + opts.cls : ''));
    wrap.dataset.char = c.key;
    if (opts.bubble) wrap.append(el('div', 'bubble', c.say));
    const frame = el('div', 'char-frame');
    const img = new Image(); img.className = 'char-img'; img.alt = c.name; img.loading = 'lazy';
    img.addEventListener('error', () => img.replaceWith(placeholder(c)));
    img.src = c.img;
    frame.append(img);
    if (opts.plush !== false && c.plush) {
      const p = new Image(); p.className = 'char-plush'; p.alt = c.name + ' — чихмэл тоглоом';
      p.style.display = 'none';
      p.addEventListener('load', () => { p.style.display = ''; });
      p.addEventListener('error', () => p.remove());
      p.src = c.plush; frame.append(p);
    }
    wrap.append(frame);
    if (opts.name !== false) wrap.append(el('div', 'char-name', c.name));
    return wrap;
  }

  /* ── ахиц (энэ төхөөрөмж дээр хадгална) ── */
  const KEY = 'shb_progress_v1';
  function load() {
    try { const p = JSON.parse(localStorage.getItem(KEY) || '{}'); return { points: p.points | 0, done: p.done | 0, lastSig: p.lastSig || '', lastDay: p.lastDay || '', days: Array.isArray(p.days) ? p.days : [] }; }
    catch (e) { return { points: 0, done: 0, lastSig: '', lastDay: '', days: [] }; }
  }
  function save(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* хадгалах боломжгүй */ } }
  function streak(days) {
    const set = new Set(days.map(dayNo)); let n = 0, d = dayNo(today());
    while (set.has(d)) { n++; d--; }
    return n;
  }
  const level = pts => 1 + Math.floor(pts / 50);

  function markVisit() {
    const p = load(), t = today();
    if (!p.days.includes(t)) { p.days.push(t); p.days = p.days.slice(-60); save(p); }
  }

  function renderProgress() {
    const box = $('homeProgress'); if (!box) return;
    const p = load();
    const set = (id, v) => { const e = $(id); if (e) e.textContent = v; };
    set('hpPoints', p.points); set('hpLevel', level(p.points)); set('hpDone', p.done); set('hpStreak', streak(p.days));
    // өнөөдрийн даалгавар
    const solved = p.lastDay === today();
    const bar = $('htFill'), pct = $('htPct'), btn = $('htBtn');
    if (bar) bar.style.width = (solved ? 100 : 0) + '%';
    if (pct) pct.textContent = (solved ? 100 : 0) + '%';
    if (btn) btn.textContent = solved ? 'Дахин бодох' : TODAY_TASK.button;
  }

  // Судоку зөв бодогдсон үед (script.js дуудна). Нэг бодлогод нэг л удаа оноо өгнө.
  function sudokuSolved(sig) {
    const p = load();
    if (sig && p.lastSig === sig) return;
    p.lastSig = sig || ''; p.lastDay = today(); p.points += 10; p.done += 1;
    save(p); renderProgress();
  }

  /* ── нүүр хуудсыг бүрдүүлэх ── */
  function buildHero() {
    const left = $('hbLeft'), right = $('hbRight');
    if (!left || !right || left.dataset.ready) return;
    left.dataset.ready = right.dataset.ready = '1';
    left.append(characterEl(CHARACTERS[0], { cls: 'lead', bubble: true }));
    CHARACTERS.slice(1).forEach(c => right.append(characterEl(c, { bubble: true })));
    const pc = CHARACTERS.find(c => c.key === PROGRESS_CHARACTER) || CHARACTERS[0];
    const say = $('hpSay'); if (say) say.textContent = PROGRESS_SAY;
    const slot = $('hpChar');
    if (slot && !slot.dataset.ready) { slot.dataset.ready = '1'; slot.append(characterEl(pc, { name: false, plush: false })); }
  }
  function buildTask() {
    const set = (id, v) => { const e = $(id); if (e) e.textContent = v; };
    set('htTag', TODAY_TASK.tag); set('htTitle', TODAY_TASK.title); set('htText', TODAY_TASK.text);
    const b = $('htBtn'); if (b && !b.dataset.ready) { b.dataset.ready = '1'; b.addEventListener('click', () => window.showSec(TODAY_TASK.section)); }
  }
  function buildNews() {
    const list = $('homeNews'); if (!list || list.dataset.ready) return; list.dataset.ready = '1';
    HOME_NEWS.forEach(n => {
      const row = el('li', 'news-row');
      row.append(el('span', 'news-ico', n.icon), el('span', 'news-text', n.text), el('span', 'news-date', n.date));
      list.append(row);
    });
    const badge = $('homeNewsBadge'); if (badge) badge.hidden = !HOME_NEWS.some(n => n.isNew);
  }

  /* ── цэсний хайлт: Сургалтын материалаас хайна ── */
  function search(q) {
    q = String(q || '').trim().toLowerCase();
    window.showSec('shop');
    if (typeof allProducts === 'undefined' || typeof renderProducts !== 'function') return;
    const list = q ? allProducts.filter(p => ((p.title || '') + ' ' + (p.desc || '') + ' ' + (p.cat || '')).toLowerCase().includes(q)) : allProducts;
    renderProducts(list, 'shopGrid');
  }
  function bindSearch() {
    const i = $('navSearch'); if (!i || i.dataset.ready) return; i.dataset.ready = '1';
    i.addEventListener('keydown', e => { if (e.key === 'Enter') { search(i.value); i.blur(); } });
    const b = $('navSearchBtn'); if (b) b.addEventListener('click', () => search(i.value));
  }

  function init() { buildHero(); buildTask(); buildNews(); bindSearch(); markVisit(); renderProgress(); }
  window.HomeProgress = { sudokuSolved, render: renderProgress, search };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
