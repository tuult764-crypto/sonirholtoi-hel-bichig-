/* Суралцагчдад: Гэрийн даалгавар, дадлын 7 хоногийн хуваарь + сэрүүлэг. Өгөгдөл зөвхөн энэ төхөөрөмжид (localStorage). */
(function () {
  'use strict';
  const H = window.HomeworkCore, KEY = 'shb_hw_v1', $ = id => document.getElementById(id);
  const todayStr = () => H.iso(new Date());
  const load = () => { try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && s.tasks) return Object.assign({ done: {}, settings: {} }, s); } catch (e) { /* */ } return { tasks: [], done: {}, settings: {} }; };
  let S = load(), weekOf = H.weekStart(todayStr());
  const set = () => Object.assign({ cap: 120, remind: false, time: '18:00', second: false, time2: '20:30', last: '', last2: '' }, S.settings);
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* */ } };
  const uid = () => 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const el = (t, o, ...k) => { const e = document.createElement(t); for (const x in (o || {})) { if (x.includes('-')) e.setAttribute(x, o[x]); else e[x] = o[x]; } k.forEach(c => c != null && e.append(c)); return e; };
  const dm = d => { const x = H.parse(d); return (x.getMonth() + 1) + '.' + String(x.getDate()).padStart(2, '0'); };
  const dayName = d => H.DAYS[(H.parse(d).getDay() + 6) % 7];
  const titleOf = id => (S.tasks.find(t => t.id === id) || { title: '(устгагдсан)' }).title;
  const kindOf = id => (S.tasks.find(t => t.id === id) || {}).kind || 'hw';
  const sched = () => H.schedule(S.tasks, S.done, todayStr());

  /* ── сэрүүлэг ── */
  let ctx = null;
  function beep() { try { ctx = ctx || new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume(); [660, 880].forEach((f, i) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = f; g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.22); g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + i * 0.22 + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.22 + 0.3); o.connect(g); g.connect(ctx.destination); o.start(ctx.currentTime + i * 0.22); o.stop(ctx.currentTime + i * 0.22 + 0.32); }); } catch (e) { /* */ } }
  function fire(second) {
    const r = sched(), t = todayStr(), open = (r.byDate[t] || []).filter(b => !b.done), mins = open.reduce((s, b) => s + b.minutes, 0);
    if (second && !open.length) return;
    const msg = open.length ? `Өнөөдөр ${open.length} даалгавар, ${mins} минут үлдсэн: ` + open.slice(0, 3).map(b => titleOf(b.taskId)).join(', ') : 'Өнөөдрийн даалгавар бүгд дууссан. Сайн байна!';
    const title = second ? 'Даалгавар дуусаагүй байна' : 'Даалгавраа хийх цаг боллоо';
    beep();
    try { if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body: msg, icon: '/anir.png', tag: 'hw-' + (second ? '2' : '1') }); } catch (e) { /* */ }
    banner(title + ' — ' + msg);
  }
  function banner(text) { const p = $('hwPanel'); if (!p) return; let b = $('hwAlert'); if (!b) { b = el('div', { id: 'hwAlert', className: 'hw-alert', role: 'alert' }); p.prepend(b); } b.textContent = text; }
  function tick() {
    const s = set(); if (!s.remind) return;
    const now = new Date(), hm = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0'), t = todayStr();
    if (s.last !== t && hm >= s.time) { S.settings = Object.assign({}, S.settings, { last: t }); save(); fire(false); }
    if (s.second && s.last2 !== t && hm >= s.time2) { S.settings = Object.assign({}, S.settings, { last2: t }); save(); fire(true); }
  }

  /* ── харагдац ── */
  function blockRow(b, date, compact) {
    const t = todayStr(), canTick = date <= t;
    const row = el('div', { className: 'hw-block' + (b.done ? ' done' : '') + (b.late ? ' late' : '') });
    const cb = el('input', { type: 'checkbox', checked: !!b.done, title: canTick ? 'Дууссан гэж тэмдэглэх' : 'Энэ өдөр болоогүй байна', disabled: !canTick, 'aria-label': titleOf(b.taskId) + ' ' + b.minutes + ' минут' });
    cb.onchange = () => { const k = b.instKey + '|' + date; if (cb.checked) S.done[k] = b.minutes; else delete S.done[k]; save(); render(); };
    [cb, el('span', {}, titleOf(b.taskId)), compact ? null : el('span', { className: 'hw-badge' + (kindOf(b.taskId) === 'practice' ? ' p' : '') }, kindOf(b.taskId) === 'practice' ? 'Дадлага' : 'Гэрийн даалгавар'), b.late ? el('span', { className: 'hw-badge l' }, 'Хоцорсон') : null, el('span', { className: 'm' }, b.minutes + ' мин')].forEach(x => { if (x) row.append(x); });
    return row;
  }
  function render() {
    const root = $('hwPanel'); if (!root) return;
    const keepAlert = $('hwAlert') ? $('hwAlert').textContent : '';
    root.textContent = ''; if (keepAlert) banner(keepAlert);
    const st = set(), t = todayStr(), r = sched();
    // 1. Өнөөдөр
    const tb = r.byDate[t] || [], tot = tb.reduce((s, b) => s + b.minutes, 0), dn = tb.filter(b => b.done).reduce((s, b) => s + b.minutes, 0);
    const c1 = el('div', { className: 'hw-card hw-today' }, el('h3', {}, `Өнөөдөр · ${dayName(t)}, ${dm(t)}`),
      el('div', { className: 'hw-muted' }, tb.length ? `${tb.length} даалгавар · ${tot} минут · ${dn} минут хийгдсэн` : 'Өнөөдөр хуваарьт даалгавар алга. Доороос нэмээрэй.'),
      el('div', { className: 'hw-bar' + (tot > st.cap ? ' over' : '') }, el('i', { style: 'width:' + (tot ? Math.round(100 * dn / tot) : 0) + '%' })));
    tb.forEach(b => c1.append(blockRow(b, t)));
    root.append(c1);
    // 2. Нэмэх
    const f = el('form', { className: 'hw-form' });
    const kind = el('select', { id: 'hwKind' }, el('option', { value: 'hw' }, 'Гэрийн даалгавар'), el('option', { value: 'practice' }, 'Дадлага'));
    const title = el('input', { id: 'hwTitle', placeholder: 'Жишээ: Монгол хэл, х.45 дасгал 3', maxLength: 80, required: true });
    const mins = el('input', { id: 'hwMin', type: 'number', min: 10, max: 600, step: 5, value: 60 });
    const due = el('input', { id: 'hwDue', type: 'date', value: H.addDays(H.weekStart(t), 6), min: t });
    const rec = el('input', { id: 'hwRec', type: 'checkbox' });
    const days = el('div', { className: 'hw-days', id: 'hwDays', hidden: true }); H.DAYS.forEach((d, i) => days.append(el('label', {}, el('input', { type: 'checkbox', checked: true, value: i }), d.slice(0, 2))));
    rec.onchange = () => { days.hidden = !rec.checked; due.disabled = rec.checked; };
    f.append(el('label', {}, 'Төрөл', kind), el('label', { className: 'wide' }, 'Даалгавар', title), el('label', {}, 'Нийт хугацаа (минут)', mins), el('label', {}, 'Дуусгах өдөр', due),
      el('label', { className: 'wide', style: 'flex-direction:row;align-items:center;gap:8px' }, rec, '7 хоног бүр давтагддаг (дадлага)'), el('div', { className: 'wide' }, days), el('button', { className: 'hw-btn', type: 'submit' }, '＋ Нэмж, өдрүүдэд хуваарилах'));
    f.onsubmit = e => {
      e.preventDefault();
      const m = Math.max(10, Math.min(600, parseInt(mins.value) || 0)), recurring = rec.checked;
      if (!title.value.trim()) return;
      const sel = [...days.querySelectorAll('input:checked')].map(x => +x.value);
      if (recurring && !sel.length) { banner('Дор хаяж нэг өдөр сонгоно уу.'); return; }
      S.tasks.push({ id: uid(), kind: kind.value, title: title.value.trim(), minutes: m, created: todayStr(), due: recurring ? null : (due.value || H.addDays(todayStr(), 6)), recurring, days: recurring ? sel : null });
      save(); render();
    };
    root.append(el('div', { className: 'hw-card' }, el('h3', {}, 'Даалгавар бүртгэх'), el('div', { className: 'hw-muted', style: 'margin-bottom:8px' }, 'Нийт хугацааг дуусгах өдөр хүртэлх өдрүүдэд тэнцүү хувааж, өдөр бүрийн ачааллыг жигдрүүлнэ.'), f));
    // 3. 7 хоног
    const nav = el('div', { className: 'hw-nav' }, el('button', { className: 'hw-btn sec', type: 'button', onclick() { weekOf = H.addDays(weekOf, -7); render(); } }, '‹ Өмнөх 7 хоног'),
      el('b', {}, `${dm(weekOf)} – ${dm(H.addDays(weekOf, 6))}` + (weekOf === H.weekStart(t) ? ' (энэ 7 хоног)' : '')),
      el('button', { className: 'hw-btn sec', type: 'button', onclick() { weekOf = H.addDays(weekOf, 7); render(); } }, 'Дараагийн 7 хоног ›'));
    const grid = el('div', { className: 'hw-week' });
    for (let i = 0; i < 7; i++) {
      const d = H.addDays(weekOf, i), bl = r.byDate[d] || [], sum = bl.reduce((s, b) => s + b.minutes, 0);
      const card = el('div', { className: 'hw-day' + (d === t ? ' hw-now' : '') }, el('h4', {}, H.DAYS[i]), el('small', {}, dm(d) + (sum ? ' · ' + sum + ' мин' : '')), el('div', { className: 'hw-bar' + (sum > st.cap ? ' over' : '') }, el('i', { style: 'width:' + Math.min(100, Math.round(100 * sum / st.cap)) + '%' })));
      bl.forEach(b => card.append(blockRow(b, d, true)));
      if (!bl.length) card.append(el('div', { className: 'hw-muted' }, 'Чөлөөтэй'));
      grid.append(card);
    }
    root.append(el('div', { className: 'hw-card' }, el('h3', {}, '7 хоногийн хуваарь'), nav, grid, el('div', { className: 'hw-muted', style: 'margin-top:8px' }, `Өдрийн дээд ачаалал: ${st.cap} минут. Хийж амжаагүй хэсэг маргаашийн хуваарьт автоматаар шилжинэ.`)));
    // 4. Бүх даалгавар
    const tbl = el('table', { className: 'hw-tasks' });
    S.tasks.forEach(x => tbl.append(el('tr', {}, el('td', {}, x.title), el('td', {}, el('span', { className: 'hw-badge' + (x.kind === 'practice' ? ' p' : '') }, x.kind === 'practice' ? 'Дадлага' : 'Гэрийн даалгавар')),
      el('td', {}, x.minutes + ' мин' + (x.recurring ? ' / 7 хоног' : '')), el('td', {}, x.recurring ? '7 хоног бүр' : 'Дуусах: ' + dm(x.due)),
      el('td', {}, el('button', { className: 'hw-btn del', type: 'button', onclick() { if (confirm('«' + x.title + '» даалгаврыг устгах уу?')) { S.tasks = S.tasks.filter(y => y.id !== x.id); Object.keys(S.done).forEach(k => { if (k.startsWith(x.id)) delete S.done[k]; }); save(); render(); } } }, 'Устгах')))));
    root.append(el('div', { className: 'hw-card' }, el('h3', {}, 'Миний бүх даалгавар'), S.tasks.length ? tbl : el('div', { className: 'hw-muted' }, 'Одоогоор бүртгэсэн даалгавар алга.')));
    // 5. Сэрүүлэг
    const rm = el('input', { type: 'checkbox', checked: st.remind }), tm = el('input', { type: 'time', value: st.time }), sc = el('input', { type: 'checkbox', checked: st.second }), t2 = el('input', { type: 'time', value: st.time2 }), cap = el('input', { type: 'number', min: 30, max: 480, step: 10, value: st.cap });
    const upd = () => { S.settings = Object.assign({}, S.settings, { remind: rm.checked, time: tm.value || '18:00', second: sc.checked, time2: t2.value || '20:30', cap: Math.max(30, Math.min(480, parseInt(cap.value) || 120)) }); save(); };
    [rm, tm, sc, t2, cap].forEach(x => x.onchange = () => { upd(); if (x === rm && rm.checked && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission().then(() => render()); else if (x === cap) render(); });
    const perm = 'Notification' in window ? Notification.permission : 'unsupported';
    const bt = el('button', { className: 'hw-btn sec', type: 'button', onclick() { beep(); if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().then(() => render()); fire(false); } }, '🔔 Туршиж сонсох');
    const ib = el('button', { className: 'hw-btn', type: 'button', onclick() {
      const r2 = sched(), items = []; for (let i = 0; i < 14; i++) { const d = H.addDays(todayStr(), i); items.push({ date: d, blocks: (r2.byDate[d] || []).filter(b => !b.done).map(b => ({ title: titleOf(b.taskId), minutes: b.minutes })) }); }
      const blob = new Blob([H.ics(items, set().time)], { type: 'text/calendar;charset=utf-8' }), a = el('a', { href: URL.createObjectURL(blob), download: 'geriin-daalgavar.ics' }); document.body.append(a); a.click(); a.remove();
    } }, '📅 Утасны хуанлид нэмэх (.ics)');
    root.append(el('div', { className: 'hw-card' }, el('h3', {}, 'Сэрүүлэг'),
      el('div', { className: 'hw-set' }, el('label', { className: 'row' }, rm, 'Өдөр бүр сануулах'), el('label', {}, 'Сануулах цаг', tm), el('label', { className: 'row' }, sc, 'Дуусаагүй бол дахин сануулах'), el('label', {}, 'Дахин сануулах цаг', t2), el('label', {}, 'Өдрийн дээд ачаалал (мин)', cap)),
      el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-top:10px' }, bt, ib),
      el('div', { className: 'hw-muted', style: 'margin-top:8px' }, perm === 'granted' ? 'Мэдэгдэл зөвшөөрөгдсөн.' : perm === 'denied' ? 'Хөтөч мэдэгдлийг хориглосон байна (хөтчийн тохиргооноос зөвшөөрнө үү). Дуу, зурвас гарна.' : perm === 'unsupported' ? 'Энэ хөтөч мэдэгдэл дэмжихгүй. Дуу, зурвас гарна.' : 'Сэрүүлгийг асаахад мэдэгдэл зөвшөөрөх асуулт гарна.'),
      el('div', { className: 'hw-muted' }, 'Анхаар: сэрүүлэг нь энэ сайтыг нээлттэй (хөтөч ажиллаж) байхад л дуугарна. Утас хаалттай байсан ч сануулахын тулд «Утасны хуанлид нэмэх» файлыг татаж хуанлидаа оруулаарай — хуанлийн сэрүүлэг өөрөө дуугарна.')));
  }

  /* ── цэс (таб) ── */
  function init() {
    const sec = $('trainingSection'); if (!sec || $('hwPanel')) return;
    const tabs = el('div', { className: 'hw-tabs', role: 'tablist' });
    const t1 = el('button', { className: 'hw-tab', type: 'button', role: 'tab', 'aria-selected': 'true', id: 'hwTabCourses' }, '🏫 Сургалтууд'), t2 = el('button', { className: 'hw-tab', type: 'button', role: 'tab', 'aria-selected': 'false', id: 'hwTabHw' }, '📚 Гэрийн даалгавар ба сэрүүлэг');
    tabs.append(t1, t2);
    const panel = el('div', { id: 'hwPanel', hidden: true });
    const anchor = sec.querySelector('.training-filter'); if (!anchor) return;
    anchor.before(tabs, panel);
    const toggle = hw => { t1.setAttribute('aria-selected', !hw); t2.setAttribute('aria-selected', hw); panel.hidden = !hw; [sec.querySelector('.training-filter'), $('courseGrid')].forEach(x => { if (x) x.style.display = hw ? 'none' : ''; }); if (hw) render(); };
    t1.onclick = () => toggle(false); t2.onclick = () => toggle(true);
    window.openHomeworkTab = () => { if (typeof window.showSec === 'function') window.showSec('training'); toggle(true); };
    if (location.hash === '#homework') document.addEventListener('DOMContentLoaded', () => window.openHomeworkTab());
    setInterval(tick, 20000); setTimeout(tick, 1500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
