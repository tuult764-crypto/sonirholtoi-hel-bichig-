/* Ажлын хуудасны нэгдсэн дизайн: нэг тохиргооноос (загвар) урьдчилан харах, хэвлэх HTML гаргана.
   Word (docx) нь серверт ижил тохиргоогоор гарна (worksheet.js). A4, захын зай: дээд 20 / доод 20 / зүүн 30 / баруун 15 мм. */
(function (g) {
  'use strict';
  const e = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const FONT = { sans: "Arial,'Noto Sans',sans-serif", serif: "'Times New Roman','Noto Serif',serif", rounded: "Calibri,Nunito,'Segoe UI',sans-serif", hand: "'Comic Sans MS','Caveat','Segoe Print',cursive" };
  const OPTIONS = {
    font: [['sans', 'Энгийн (Arial)'], ['serif', 'Сонгодог (Times)'], ['rounded', 'Зөөлөн (Calibri)'], ['hand', 'Гар бичмэл']],
    header: [['banner', 'Өнгөт тууз'], ['box', 'Хүрээтэй'], ['underline', 'Доогуур зураастай'], ['badge', 'Өнгөт нэрс']],
    numbering: [['circle', '① дугуй'], ['square', '[1] дөрвөлжин'], ['plain', '1) энгийн']],
    lines: [['solid', 'Тасралтгүй'], ['dotted', 'Цэгтэй'], ['dashed', 'Тасархай'], ['none', 'Шугамгүй']],
    border: [['none', 'Хүрээгүй'], ['frame', 'Нэг хүрээ'], ['double', 'Давхар хүрээ']],
    levelStyle: [['pill', 'Өнгөт тууз'], ['bar', 'Хажуугийн зураас'], ['plain', 'Энгийн']]
  };
  const num = (st, n) => st === 'circle' ? (n <= 20 ? String.fromCharCode(0x2460 + n - 1) : '(' + n + ')') : st === 'square' ? '[' + n + ']' : n + ')';
  function css(T) {
    const lineStyle = T.lines === 'none' ? 'none' : T.lines;
    const bd = T.border === 'none' ? '' : (T.border === 'double' ? `border:3.5pt double ${T.primary};` : `border:1.5pt solid ${T.primary};`);
    return `@page{size:A4;margin:20mm 15mm 20mm 30mm}*{box-sizing:border-box}html,body{margin:0}body{font:12pt/1.4 ${FONT[T.font]};color:#111}
.sheet{${bd}${bd ? 'padding:4mm;-webkit-box-decoration-break:clone;box-decoration-break:clone;' : ''}}@media screen{body{padding:20mm 15mm 20mm 30mm}}.school{text-align:center;color:${T.primary};font-size:11pt;margin:0 0 3pt}
.hd{margin:0 0 8pt}.hd h1{margin:0;font-size:20pt;line-height:1.15}.hd p{margin:2pt 0 0;font-size:11pt;color:#555}
.hd.banner{background:${T.primary};color:#fff;padding:7pt 10pt}.hd.banner p{color:#fff}
.hd.box{border:1.5pt solid ${T.primary};background:${T.tint};text-align:center;padding:6pt}.hd.box h1{color:${T.primary}}
.hd.badge{background:${T.accent};text-align:center;padding:6pt}.hd.badge h1{color:${T.primary}}
.hd.underline{border-bottom:2.2pt solid ${T.accent};padding-bottom:3pt}.hd.underline h1{color:${T.primary}}
.stu{font-size:11pt;margin:0 0 10pt}.lv{font-weight:bold;font-size:13pt;margin:10pt 0 5pt;break-after:avoid;page-break-after:avoid}
.lv.pill{background:${T.primary};color:#fff;padding:2pt 8pt}.lv.bar{color:${T.primary};border-left:3.5pt solid ${T.accent};padding-left:7pt}
.lv.plain{color:${T.primary};border-bottom:.75pt solid ${T.primary};padding-bottom:1pt}
.q{break-inside:avoid;page-break-inside:avoid;margin:0 0 6pt}.q .t{margin:0 0 2pt;white-space:pre-wrap;overflow-wrap:anywhere}
.ln{height:8mm;border-bottom:.75pt ${lineStyle} #8a8a8a}.ans{page-break-before:always}.ans h2{color:${T.primary};font-size:15pt;margin:0 0 8pt}.ans p{margin:0 0 3pt}
.ft{margin-top:10pt;text-align:center;font-size:9pt;color:#777}`;
  }
  // d: {title, subtitle, levels:[{level, questions:[{q,a,lines}]}]}, T: загварын тохиргоо, o: {school, footer, studentFields, answerKey}
  function html(d, T, o) {
    o = Object.assign({ studentFields: true, answerKey: true, school: '', footer: '' }, o || {});
    let n = 0;
    const body = d.levels.map((l, i) => `<div class="lv ${T.levelStyle}">${i + 1}. ${e(l.level)}</div>` + l.questions.map(x => {
      const lines = x.lines != null ? x.lines : (l.level === 'Сэргээн санах' ? 1 : 3);
      return `<div class="q"><p class="t">${e(num(T.numbering, ++n))} ${e(x.q)}</p>${'<div class="ln"></div>'.repeat(lines)}</div>`;
    }).join('')).join('');
    let k = 0;
    const ans = o.answerKey ? `<div class="ans"><h2>Хариу (зөвхөн багшид)</h2>` + d.levels.map(l => `<p><b>${e(l.level)}</b></p>` + l.questions.map(x => `<p>${e(num(T.numbering, ++k))} ${e(x.a || '—')}</p>`).join('')).join('') + '</div>' : '';
    return `<!doctype html><html lang="mn"><head><meta charset="utf-8"><title>${e(d.title)}</title><style>${css(T)}</style></head><body><div class="sheet">${o.school ? `<p class="school">${e(o.school)}</p>` : ''}<div class="hd ${T.header}"><h1>${e(d.title)}</h1>${d.subtitle ? `<p>${e(d.subtitle)}</p>` : ''}</div>${o.studentFields ? '<p class="stu">Нэр: ______________________ &nbsp; Анги: ________ &nbsp; Огноо: ____________</p>' : ''}${body}${o.footer ? `<div class="ft">${e(o.footer)}</div>` : ''}</div>${ans}</body></html>`;
  }
  // Жижиг загварын карт (үлгэр): iframe дотор A4-ийн эхний хэсгийг масштаблаж харуулна
  function sample() {
    return { title: 'Хөвсгөл нуур', subtitle: '6-р анги · Монгол хэл', levels: [{ level: 'Ойлгох', questions: [{ q: 'Хөвсгөл нуур хаана байдаг вэ?', a: '', lines: 1 }] }, { level: 'Бүтээх', questions: [{ q: 'Нуурын тухай 3 өгүүлбэр зохио.', a: '', lines: 2 }] }] };
  }
  g.WsRender = { html, css, sample, OPTIONS, FONT };
})(window);
