/* Суралцагчийн гэрийн даалгавар, дадлын 7 хоногийн хуваарь (цэвэр логик, DOM-гүй).
   Даалгавар бүрийн үлдсэн хугацааг дуусгах өдөр хүртэлх өдрүүдэд ТЭНЦҮҮ хувааж, өдөр бүрийн ачааллыг тэнцвэржүүлнэ. */
(function (g) {
  'use strict';
  const pad = n => String(n).padStart(2, '0');
  const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parse = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
  const weekStart = s => { const d = parse(s), k = (d.getDay() + 6) % 7; d.setDate(d.getDate() - k); return iso(d); };   // Даваа
  const DAYS = ['Даваа', 'Мягмар', 'Лхагва', 'Пүрэв', 'Баасан', 'Бямба', 'Ням'];
  const MIN = 5;                                                  // хуваарилах хамгийн бага нэгж (минут)

  // Нэг даалгаврын «тохиолдол»: ганц удаагийн, эсвэл 7 хоног бүрийн (долоо хоног бүр тусдаа)
  function instances(tasks, from, to) {
    const out = [];
    tasks.forEach(t => {
      if (!t.recurring) { out.push({ id: t.id, key: t.id, task: t, start: t.start || t.created, due: t.due, minutes: t.minutes }); return; }
      for (let w = weekStart(from < (t.start || t.created) ? (t.start || t.created) : from); w <= to; w = addDays(w, 7)) {
        const days = t.days && t.days.length ? t.days : [0, 1, 2, 3, 4, 5, 6];
        const due = addDays(w, Math.max(...days));
        out.push({ id: t.id, key: t.id + '@' + w, task: t, start: w < (t.start || t.created) ? (t.start || t.created) : w, due, minutes: t.minutes, allowed: days.map(i => addDays(w, i)), week: w });
      }
    });
    return out;
  }
  // Хэсэг хуваах: нийт минутыг n хэсэгт тэнцүү (5 минутын нэгжээр) хуваана
  function split(total, n) {
    const base = Math.floor(total / n / MIN) * MIN, parts = Array(n).fill(base);
    let rest = total - base * n, i = 0;
    while (rest > 0) { const add = Math.min(MIN, rest); parts[i % n] += add; rest -= add; i++; }
    return parts;
  }
  /* tasks: [{id,kind,title,minutes,due,created,recurring,days}], done: {"<instKey>|<date>": minutes}
     today: 'YYYY-MM-DD'. Буцаах: {byDate: {date: [{instKey,taskId,minutes,done,late}]}, load: {date: minutes}} */
  function schedule(tasks, done, today, horizon) {
    horizon = horizon || 60;
    const end = addDays(today, horizon), from = addDays(today, -28);
    const insts = instances(tasks, from, end);
    const byDate = {}, load = {};
    const put = (date, b) => { (byDate[date] = byDate[date] || []).push(b); if (!b.done || date >= today) load[date] = (load[date] || 0) + b.minutes; };
    // 1) Хийгдсэн хэсгүүд (түүх) — хэвээр харуулна
    const doneSum = {};
    Object.keys(done || {}).forEach(k => {
      const [ik, date] = k.split('|'); const inst = insts.find(x => x.key === ik); if (!inst) return;
      doneSum[ik] = (doneSum[ik] || 0) + done[k];
      put(date, { instKey: ik, taskId: inst.id, minutes: done[k], done: true });
    });
    // 2) Үлдсэн хугацааг тэнцүү хуваарилна. Хамгийн хязгаарлагдмал (өдөр цөөн, хугацаа их) даалгаврыг түрүүлж.
    const todo = insts.map(x => ({ x, remaining: Math.max(0, x.minutes - (doneSum[x.key] || 0)) })).filter(o => o.remaining > 0);
    const windowOf = o => {
      const x = o.x, s0 = x.start > today ? x.start : today;
      let days = [];
      for (let d = s0; d <= x.due && d <= end; d = addDays(d, 1)) days.push(d);
      if (x.allowed) days = days.filter(d => x.allowed.includes(d));
      return days;
    };
    todo.forEach(o => { o.days = windowOf(o); });
    todo.sort((a, b) => (a.days.length - b.days.length) || (b.remaining - a.remaining));
    todo.forEach(o => {
      if (o.x.due < today && !o.x.allowed) { put(today, { instKey: o.x.key, taskId: o.x.id, minutes: o.remaining, done: false, late: true }); return; }
      if (!o.days.length) return;                                  // 7 хоног бүрийн, энэ долоо хоногт өнгөрсөн
      const n = Math.max(1, Math.min(o.days.length, Math.floor(o.remaining / 10) || 1));
      const parts = split(o.remaining, n);
      const pick = o.days.map((d, i) => ({ d, i, l: load[d] || 0 })).sort((a, b) => (a.l - b.l) || (a.i - b.i)).slice(0, n).sort((a, b) => a.i - b.i);
      pick.forEach((p, k) => put(p.d, { instKey: o.x.key, taskId: o.x.id, minutes: parts[k], done: false }));
    });
    Object.keys(byDate).forEach(d => byDate[d].sort((a, b) => (a.done - b.done)));
    return { byDate, load };
  }
  const total = (byDate, date, onlyOpen) => (byDate[date] || []).reduce((s, b) => s + (onlyOpen && b.done ? 0 : b.minutes), 0);

  /* .ics: өдөр бүрийн сануулга (утасны хуанли сэрүүлэг болгоно) */
  function ics(items, time, days) {
    const esc = s => String(s).replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
    const [hh, mm] = String(time || '18:00').split(':').map(Number);
    const now = new Date(), stamp = now.getUTCFullYear() + pad(now.getUTCMonth() + 1) + pad(now.getUTCDate()) + 'T' + pad(now.getUTCHours()) + pad(now.getUTCMinutes()) + '00Z';
    const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Sonirholtoi hel bichig//Gerin daalgavar//MN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Гэрийн даалгавар'];
    items.forEach(it => {
      if (!it.blocks.length) return;
      const d = it.date.replace(/-/g, ''), st = d + 'T' + pad(hh) + pad(mm) + '00', en = d + 'T' + pad(hh + (mm + 30 >= 60 ? 1 : 0)) + pad((mm + 30) % 60) + '00';
      const sum = it.blocks.reduce((s, b) => s + b.minutes, 0);
      L.push('BEGIN:VEVENT', 'UID:hw-' + it.date + '@sonirholtoi', 'DTSTAMP:' + stamp, 'DTSTART:' + st, 'DTEND:' + en, 'SUMMARY:' + esc('Гэрийн даалгавар · ' + sum + ' мин'),
        'DESCRIPTION:' + esc(it.blocks.map(b => '• ' + b.title + ' — ' + b.minutes + ' мин').join('\n')), 'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc('Даалгавраа хийх цаг боллоо'), 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT');
    });
    L.push('END:VCALENDAR'); return L.join('\r\n');
  }
  g.HomeworkCore = { iso, parse, addDays, diffDays, weekStart, DAYS, schedule, total, split, ics, instances };
  if (typeof module !== 'undefined') module.exports = g.HomeworkCore;
})(typeof window !== 'undefined' ? window : globalThis);
