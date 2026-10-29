/* ══════════════════════════════════════════════════════
   НҮҮР ХУУДАС — Шинэ мэдлэг, мэдлэгийн сэдвүүд, миний ахиц, хайлт
   Мэдлэгийн өгөгдөл: knowledge-data.js
   ══════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const K = window.Knowledge;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const today = () => K.todayStr();
  const dayNo = s => Math.round(Date.parse(s + 'T00:00:00Z') / 864e5);


  /* ── 0. ДҮРЭЭ СОНГОХ (тухайн төхөөрөмж дээр хадгална) ───── */
  const CHARACTER_KEY = 'shb_selected_character_v1';
  function renderCharacters() {
    const grid = $('characterPickGrid');
    const note = $('characterSelectedNote');
    if (!grid || !Array.isArray(window.SHCharacters)) return;
    let selected = '';
    try { selected = localStorage.getItem(CHARACTER_KEY) || ''; } catch (e) { /* private mode */ }
    grid.innerHTML = window.SHCharacters.map(c => `
      <button type="button" class="character-card ${selected === c.id ? 'selected' : ''}" data-character="${esc(c.id)}" aria-pressed="${selected === c.id}">
        <span class="character-portrait"><img src="${esc(c.image)}" alt="${esc(c.name)}" loading="lazy"><span aria-hidden="true">${esc(c.name.charAt(0))}</span></span>
        <span class="character-card-copy"><b>${esc(c.name)}</b><small>${esc(c.personality)}</small><em>${esc(c.role)}</em></span>
        <span class="character-check" aria-hidden="true">${selected === c.id ? '✓ Сонгосон' : 'Сонгох'}</span>
      </button>`).join('');
    grid.querySelectorAll('.character-card').forEach(card => {
      const img = card.querySelector('img');
      if (img) img.addEventListener('error', () => { img.style.display = 'none'; }, { once: true });
      card.addEventListener('click', () => {
        const id = card.dataset.character;
        try { localStorage.setItem(CHARACTER_KEY, id); } catch (e) { toast('Энэ төхөөрөмж дээр сонголтыг хадгалах боломжгүй байна.', 'error'); }
        renderCharacters();
      });
    });
    if (note) {
      const c = window.getSHCharacter ? window.getSHCharacter(selected) : null;
      note.textContent = c ? 'Миний найз: ' + c.name : 'Дүр сонгоогүй байна';
    }
  }

  /* ── 1. ӨДӨР ТУТМЫН ДААЛГАВАР (Судоку) ─────────────────── */
  const TODAY_TASK = { tag: 'Судоку', title: 'Өнөөдрийн судоког бод', text: 'Тоогоор дасгалжиж, анхаарлаа хөгжүүл.', button: 'Даалгавар эхлүүлэх', section: 'sudoku' };

  /* ── 2. СЭДВИЙН ДҮРС (SVG) ─────────────────────────────── */
  const S = (d, extra) => `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}${extra || ''}</svg>`;
  const ICON = {
    author:   S('<path d="M2 5.5c3-1.2 6-1 10 1 4-2 7-2.2 10-1v13c-3-1.2-6-1-10 1-4-2-7-2.200-10-1z"/><path d="M12 6.500v13"/>'),
    idiom:    S('<path d="M20 4c-8 0-13 4-14.500 11L4 20l4.500-1.500C15.500 17 20 12 20 4z"/><path d="M9 15c2-3 5-5.500 8-7"/>'),
    proverb:  S('<path d="M5 19c0-8 4-13 14-14 0 9-4 14-12 14"/><path d="M5 19c2-4 5-7 9-9"/>'),
    script:   '<span class="mn-glyph" aria-hidden="true">ᠮ</span>',
    history:  S('<path d="M3 9.500 12 4l9 5.500"/><path d="M5 10v8M9.500 10v8M14.500 10v8M19 10v8"/><path d="M3 20h18"/>'),
    world:    S('<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>'),
    creative: S('<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.500 10.900c.6.500 1 1.200 1 2.100h5c0-.9.4-1.600 1-2.100A6 6 0 0 0 12 3z"/>'),
    quiz:     S('<path d="m12 3 2.700 5.600 6.100.9-4.400 4.300 1 6.100L12 17l-5.400 2.900 1-6.100L3.200 9.500l6.100-.9z"/>')
  };
  const CAL = S('<rect x="3.500" y="5" width="17" height="15" rx="2.500"/><path d="M8 3v4M16 3v4M3.500 10h17"/><path d="m9 15 2 2 4-4"/>');
  const ARROW = S('<path d="M5 12h14M13 6l6 6-6 6"/>').replace('width="30" height="30"', 'width="20" height="20"');
  const CHEV = S('<path d="m9 5 7 7-7 7"/>').replace('width="30" height="30"', 'width="22" height="22"');

  /* Зураг оронд харагдах дүрслэл: сэдвийн өнгөтэй хавтан + том тэмдэг */
  function artTile(entry, size) {
    const t = K.topic(entry.topics[0]) || K.TOPICS[0];
    const g = entry.glyph || '';
    const isMn = /[\u1800-\u18AF]/.test(g);
    return `<div class="art-tile ${size || ''}" style="--tc:${t.color};--tb:${t.bg}" aria-hidden="true"><span class="${isMn ? 'mn-glyph big' : 'glyph'}">${esc(g || t.short.charAt(0))}</span></div>`;
  }
  const rel = n => (n === 1 ? 'Өчигдөр' : n === 2 ? 'Уржигдар' : n + ' өдрийн өмнө');

  /* ── 3. ШИНЭ МЭДЛЭГ (нүүр хуудасны гол карт) ───────────── */
  function renderToday() {
    const box = $('todayCard'); if (!box) return;
    const e = K.today();
    if (!e) { box.innerHTML = '<p class="empty">Өнөөдрийн мэдлэг бэлтгэгдэж байна.</p>'; return; }
    const t = K.topic(e.topics[0]);
    box.innerHTML = `
      <div class="today-head">
        <span class="today-ico" aria-hidden="true">${CAL}</span>
        <h2>Шинэ мэдлэг</h2>
        <time class="date-chip" datetime="${today()}">${K.fmtDate(today())}</time>
      </div>
      <div class="today-body">
        ${artTile(e, 'lg')}
        <div class="today-text">
          <span class="tag" style="--tc:${t.color};--tb:${t.bg}">${esc(e.label)}</span>
          <h3>${esc(e.title)}</h3>
          <p>${esc(e.summary)}</p>
          <button class="btn-blue" type="button" data-open="${esc(e.id)}">Дэлгэрэнгүй үзэх ${ARROW}</button>
        </div>
      </div>`;
  }
  function renderPrev() {
    const box = $('prevList'); if (!box) return;
    const items = K.previous(3).filter(x => x.entry);
    box.innerHTML = items.map((x, i) => {
      const e = x.entry, t = K.topic(e.topics[0]);
      return `<button class="prev-item" type="button" data-open="${esc(e.id)}" data-date="${x.date}">
        ${artTile(e, 'sm')}
        <span class="prev-txt"><small style="--tc:${t.color}">${rel(i + 1)}, ${esc(e.label)}</small><b>${esc(e.title)}</b></span>
        <span class="prev-go" aria-hidden="true">${CHEV}</span>
      </button>`;
    }).join('') + `<button class="prev-all" type="button" data-open-all="1">Өмнөх өдрүүдийн мэдлэг ${ARROW}</button>`;
  }
  function renderTopics() {
    const box = $('topicGrid'); if (!box) return;
    box.innerHTML = K.TOPICS.map(t => {
      const n = K.byTopic(t.key).length;
      const sub = t.section === 'games' ? 'Тоглоом руу' : (n + ' мэдлэг');
      return `<button class="topic" type="button" data-topic="${t.key}" style="--tc:${t.color};--tb:${t.bg}">
        <span class="topic-ico">${ICON[t.key]}</span>
        <b>${esc(t.short)}</b><small>${sub}</small>
      </button>`;
    }).join('');
  }

  /* ── 4. МЭДЛЭГИЙН ХУУДАС ───────────────────────────────── */
  const KNOWN_KEY = 'shb_known_v1';
  const loadKnown = () => { try { const a = JSON.parse(localStorage.getItem(KNOWN_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
  const saveKnown = a => { try { localStorage.setItem(KNOWN_KEY, JSON.stringify(a)); } catch (e) { /* хадгалах боломжгүй */ } };
  const state = { topic: 'all', id: null };

  function toast(msg, type) { if (typeof window.showToast === 'function') window.showToast(msg, type || 'success'); }

  function renderDetail() {
    const box = $('knDetail'); if (!box) return;
    const e = (state.id && K.get(state.id)) || K.today();
    if (!e) { box.innerHTML = ''; return; }
    state.id = e.id;
    const t = K.topic(e.topics[0]), d = K.dateOf(e.id), known = loadKnown().includes(e.id);
    box.innerHTML = `
      <div class="kd-art">${artTile(e, 'xl')}</div>
      <div class="kd-main">
        <div class="kd-meta"><span class="tag" style="--tc:${t.color};--tb:${t.bg}">${esc(e.label)}</span>${d ? `<time class="date-chip" datetime="${d}">${K.fmtDate(d)}</time>` : ''}</div>
        <h3>${esc(e.title)}</h3>
        ${e.body.map(p => `<p>${esc(p)}</p>`).join('')}
        ${e.think ? `<div class="kd-think"><b>Бодоорой</b><p>${esc(e.think)}</p></div>` : ''}
        <div class="kd-actions">
          <button class="btn-blue ${known ? 'on' : ''}" type="button" id="knKnown" aria-pressed="${known}">${known ? '✓ Мэдлээ' : 'Би үүнийг мэдлээ'}</button>
          <button class="btn-line" type="button" id="knShare">Хуваалцах</button>
        </div>
        ${e.source ? `<p class="kd-src">Эх сурвалж: ${e.source.url ? `<a href="${esc(e.source.url)}" target="_blank" rel="noopener">${esc(e.source.name)}</a>` : esc(e.source.name)}</p>` : '<p class="kd-src">Энэ бол сэтгэн бодох даалгавар. Хариулт нь чиний өөрийнх.</p>'}
      </div>`;
    $('knKnown').addEventListener('click', () => {
      let a = loadKnown();
      a = a.includes(e.id) ? a.filter(x => x !== e.id) : a.concat(e.id);
      saveKnown(a); renderDetail(); renderGrid(); renderProgress();
    });
    $('knShare').addEventListener('click', async () => {
      const text = e.title + ' — ' + e.summary, url = location.origin + location.pathname;
      try {
        if (navigator.share) { await navigator.share({ title: e.title, text: e.summary, url }); return; }
        await navigator.clipboard.writeText(text + ' ' + url); toast('Хуулагдлаа. Найздаа илгээгээрэй!');
      } catch (err) { /* хэрэглэгч цуцалсан */ }
    });
  }
  function renderFilter() {
    const box = $('knFilter'); if (!box) return;
    const tabs = [{ key: 'all', short: 'Бүгд' }].concat(K.TOPICS.filter(t => !t.section));
    box.innerHTML = tabs.map(t => `<button type="button" class="chip ${state.topic === t.key ? 'active' : ''}" data-f="${t.key}" aria-pressed="${state.topic === t.key}">${esc(t.short)}</button>`).join('');
  }
  function renderGrid() {
    const box = $('knGrid'); if (!box) return;
    const list = (state.topic === 'all' ? K.published() : K.byTopic(state.topic))
      .slice().sort((a, b) => (K.dateOf(b.id) || '').localeCompare(K.dateOf(a.id) || ''));
    const known = loadKnown();
    $('knCount') && ($('knCount').textContent = list.length + ' мэдлэг' + (known.length ? ', ' + known.length + ' нь тэмдэглэгдсэн' : ''));
    box.innerHTML = list.length ? list.map(e => {
      const t = K.topic(e.topics[0]), d = K.dateOf(e.id);
      return `<button type="button" class="kn-card ${e.id === state.id ? 'current' : ''}" data-open="${esc(e.id)}">
        ${artTile(e, 'sm')}
        <span class="kn-card-txt"><small style="--tc:${t.color}">${esc(e.label)}${known.includes(e.id) ? ', мэдсэн' : ''}</small><b>${esc(e.title)}</b>${d ? `<em>${K.fmtDate(d)}</em>` : ''}</span>
      </button>`;
    }).join('') : '<p class="empty">Энэ сэдвээр мэдлэг бэлтгэгдэж байна.</p>';
  }
  function showKnowledge(opts) {
    opts = opts || {};
    if (opts.topic) state.topic = opts.topic;
    if (opts.id) state.id = opts.id;
    if (!opts.id && !opts.keep) state.id = null;
    window.showSec('knowledge');
    renderDetail(); renderFilter(); renderGrid();
    if (opts.id) { const d = $('knDetail'); d && d.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  }
  function openTopic(key) {
    const t = K.topic(key); if (!t) return;
    if (t.section) { window.showSec(t.section); return; }
    // Сэдвийн хуудас: тухайн сэдвийн хамгийн сүүлийн мэдлэгийг нээнэ
    const list = K.byTopic(key).slice().sort((a, b) => (K.dateOf(b.id) || '').localeCompare(K.dateOf(a.id) || ''));
    const first = list.find(e => e.kind === 'fact') || list[0];
    showKnowledge({ topic: key, id: first && first.id });
  }

  /* ── 5. АХИЦ (энэ төхөөрөмж дээр хадгална) ─────────────── */
  const KEY = 'shb_progress_v1';
  function load() {
    try { const p = JSON.parse(localStorage.getItem(KEY) || '{}'); return { points: p.points | 0, done: p.done | 0, lastSig: p.lastSig || '', lastDay: p.lastDay || '', days: Array.isArray(p.days) ? p.days : [] }; }
    catch (e) { return { points: 0, done: 0, lastSig: '', lastDay: '', days: [] }; }
  }
  function save(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* хадгалах боломжгүй */ } }
  function streak(days) { const set = new Set(days.map(dayNo)); let n = 0, d = dayNo(today()); while (set.has(d)) { n++; d--; } return n; }
  const level = pts => 1 + Math.floor(pts / 50);
  function markVisit() { const p = load(), t = today(); if (!p.days.includes(t)) { p.days.push(t); p.days = p.days.slice(-60); save(p); } }

  function renderProgress() {
    const p = load(), set = (id, v) => { const e = $(id); if (e) e.textContent = v; };
    set('hpPoints', p.points); set('hpLevel', level(p.points)); set('hpDone', p.done); set('hpStreak', streak(p.days)); set('hpKnown', loadKnown().length);
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
  function buildTask() {
    const set = (id, v) => { const e = $(id); if (e) e.textContent = v; };
    set('htTag', TODAY_TASK.tag); set('htTitle', TODAY_TASK.title); set('htText', TODAY_TASK.text);
    const b = $('htBtn'); if (b && !b.dataset.ready) { b.dataset.ready = '1'; b.addEventListener('click', () => window.showSec(TODAY_TASK.section)); }
  }

  /* ── 6. ХАЙЛТ: Сургалтын материалаас хайна ─────────────── */
  function search(q) {
    q = String(q || '').trim().toLowerCase();
    window.showSec('shop');
    if (typeof allProducts === 'undefined' || typeof renderProducts !== 'function') return;
    const list = q ? allProducts.filter(p => ((p.title || '') + ' ' + (p.desc || '') + ' ' + (p.cat || '')).toLowerCase().includes(q)) : allProducts;
    renderProducts(list, 'shopGrid');
  }
  function bindSearch() {
    [['navSearch', 'navSearchBtn'], ['mobileSearch', 'mobileSearchBtn']].forEach(([iid, bid]) => {
      const i = $(iid); if (!i || i.dataset.ready) return; i.dataset.ready = '1';
      i.addEventListener('keydown', e => { if (e.key === 'Enter') { search(i.value); i.blur(); if (typeof closeMobileNav === 'function') closeMobileNav(); } });
      const b = $(bid); if (b) b.addEventListener('click', () => { search(i.value); if (typeof closeMobileNav === 'function') closeMobileNav(); });
    });
  }

  /* ── 7. Үйлдлүүдийг холбох ─────────────────────────────── */
  function bindClicks() {
    document.addEventListener('click', ev => {
      const open = ev.target.closest('[data-open]');
      if (open) { showKnowledge({ id: open.dataset.open, topic: 'all' }); return; }
      if (ev.target.closest('[data-open-all]')) { showKnowledge({ topic: 'all', id: null, keep: false }); return; }
      const topic = ev.target.closest('[data-topic]');
      if (topic) { openTopic(topic.dataset.topic); return; }
      const f = ev.target.closest('[data-f]');
      if (f) { state.topic = f.dataset.f; renderFilter(); renderGrid(); }
    });
  }

  function init() {
    renderCharacters();
    renderToday(); renderPrev(); renderTopics(); buildTask(); bindSearch(); bindClicks(); markVisit(); renderProgress();
  }
  window.HomeProgress = { sudokuSolved, render: renderProgress, search };
  window.KnowledgePage = { show: showKnowledge, openTopic, refresh: () => { renderToday(); renderPrev(); renderTopics(); } };
  window.openKnowledge = showKnowledge;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
