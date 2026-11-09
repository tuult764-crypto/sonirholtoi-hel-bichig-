/* Таны "Ээлжит хичээлийн төлөвлөлт" Word загварыг (lesson-template.docx) бөглөнө.
   Хүрээ, багана, фонт, өнгө загвараас хэвээр үлдэж, алхмын тоо хичээлээс хамаарна. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LessonDocx = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const XML = 'http://www.w3.org/XML/1998/namespace';
  const DOTS = '……………………………';

  async function build(plan, templateBuf, deps) {
    const { JSZip, DOMParser: DP, XMLSerializer: XS } = deps;
    const zip = await JSZip.loadAsync(templateBuf);
    const xmlText = await zip.file('word/document.xml').async('string');
    const doc = new DP().parseFromString(xmlText, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('Загварын XML уншигдсангүй');

    const el = (tag, attrs) => {
      const e = doc.createElementNS(W, 'w:' + tag);
      for (const k in (attrs || {})) e.setAttributeNS(W, 'w:' + k, String(attrs[k]));
      return e;
    };
    const kids = (n, name) => Array.from(n.childNodes).filter(c => c.nodeType === 1 && c.namespaceURI === W && c.localName === name);
    const firstDesc = (n, path) => path.reduce((cur, name) => cur && kids(cur, name)[0], n);

    const body = kids(doc.documentElement, 'body')[0];
    const tbls = kids(body, 'tbl');
    if (tbls.length !== 5) throw new Error('Загварын бүтэц өөрчлөгдсөн байна (5 хүснэгт хүлээсэн)');
    const cell = (t, r, c) => kids(kids(t, 'tr')[r], 'tc')[c];

    const textEl = text => {
      const t = el('t'); t.setAttributeNS(XML, 'xml:space', 'preserve'); t.appendChild(doc.createTextNode(text)); return t;
    };

    // Загварын эхний догол мөрийн хэв маягийг хадгалаад текстийг солино.
    function setTextCell(tc, texts, baseIdx) {
      const ps = kids(tc, 'p'), base = ps[baseIdx || 0];
      const rpr = firstDesc(base, ['r', 'rPr']);
      const made = (texts.length ? texts : ['']).map(tx => {
        const p = base.cloneNode(true);
        Array.from(p.childNodes).forEach(c => { if (!(c.namespaceURI === W && c.localName === 'pPr')) p.removeChild(c); });
        if (tx !== '') {
          const r = el('r');
          if (rpr) r.appendChild(rpr.cloneNode(true));
          r.appendChild(textEl(tx)); p.appendChild(r);
        }
        return p;
      });
      ps.forEach(p => tc.removeChild(p));
      made.forEach(p => tc.appendChild(p));
    }

    function run(text, o) {
      o = o || {};
      const r = el('r'), rp = el('rPr');
      if (o.b) { rp.appendChild(el('b', { val: 1 })); rp.appendChild(el('bCs', { val: 1 })); }
      if (o.i) { rp.appendChild(el('i', { val: 1 })); rp.appendChild(el('iCs', { val: 1 })); }
      if (o.sz) { rp.appendChild(el('sz', { val: o.sz })); rp.appendChild(el('szCs', { val: o.sz })); }
      rp.appendChild(el('rtl', { val: 0 }));
      r.appendChild(rp); r.appendChild(textEl(text)); return r;
    }
    function para(runs, before, after) {
      const p = el('p'), pp = el('pPr');
      pp.appendChild(el('spacing', { before: before || 0, after: after || 0, line: 240, lineRule: 'auto' }));
      pp.appendChild(el('ind', { left: 60, right: 40, firstLine: 0 }));
      p.appendChild(pp); runs.forEach(r => p.appendChild(r)); return p;
    }

    // ── Зураг шигтгэх (word/media + холбоос) ──
    const media = [];
    const NS_FRAG = 'xmlns:w="' + W + '" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
    function imgPara(pc, maxMm) {
      const m = /^data:image\/(jpeg|png);base64,(.+)$/.exec(pc.dataUrl || ''); if (!m) return null;
      const n = media.length + 1, ext = m[1] === 'png' ? 'png' : 'jpg', rid = 'rIdLessonImg' + n;
      media.push({ name: 'lessonimg' + n + '.' + ext, b64: m[2], ext, rid });
      let cx = Math.round(maxMm * 36000), cy = Math.round(cx * (pc.h || 1) / (pc.w || 1));
      const maxH = 65 * 36000; if (cy > maxH) { cx = Math.round(cx * maxH / cy); cy = maxH; }
      const xml = '<w:p ' + NS_FRAG + '><w:pPr><w:spacing w:before="40" w:after="20"/><w:ind w:left="60" w:right="40" w:firstLine="0"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="' + cx + '" cy="' + cy + '"/><wp:docPr id="' + (1000 + n) + '" name="Зураг ' + n + '" descr="' + String(pc.caption || pc.id).replace(/[<>&"]/g, ' ') + '"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="' + (1000 + n) + '" name="' + 'lessonimg' + n + '.' + ext + '"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="' + rid + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
      return doc.importNode(new DP().parseFromString(xml, 'application/xml').documentElement, true);
    }
    function picBlock(id) {
      const pc = (plan.pictures || []).find(x => x.id === id); if (!pc) return [];
      const o = [];
      const im = imgPara(pc, 50); if (im) o.push(im);
      o.push(para([run(pc.id + '. ', { b: 1, sz: 20 }), run(pc.caption || '', { sz: 20 })], 0, 20));
      if (pc.activity) o.push(para([run('Даалгавар: ', { i: 1, sz: 20 }), run(pc.activity, { sz: 20 })], 0, 20));
      (pc.questions || []).forEach(q => o.push(para([run('• ' + q, { sz: 20 })], 0, 20)));
      return o;
    }

    function setStepCell(tc, steps, role, startNo, homework) {
      kids(tc, 'p').forEach(p => tc.removeChild(p));
      const out = [];
      steps.forEach((s, i) => {
        out.push(para([run('Алхам ' + (startNo + i) + '. ' + s.title + ' (' + s.minutes + ' мин)', { b: 1 })], 100, 40));
        if (role === 'teacher') {
          if (s.goal) out.push(para([run('Зорилго: ', { i: 1, sz: 20 }), run(s.goal, { sz: 20 })], 0, 40));
          if (s.teacher) out.push(para([run('Багш: ', { i: 1, sz: 20 }), run(s.teacher, { sz: 20 })], 0, 40));
          if (s.questions && s.questions.length) { out.push(para([run('Асуулт:', { i: 1, sz: 20 })], 0, 20)); s.questions.forEach(q => out.push(para([run('• ' + q, { sz: 20 })], 0, 20))); }
          if (s.tasks && s.tasks.length) { out.push(para([run('Сурах бичгийн даалгавар:', { i: 1, sz: 20 })], 40, 20)); s.tasks.forEach(t => out.push(para([run('• ' + t, { sz: 20 })], 0, 20))); }
          if (s.taskPlans && s.taskPlans.length) { out.push(para([run('Даалгаврын төлөвлөлт:', { i: 1, sz: 20 })], 40, 20)); s.taskPlans.forEach(t => out.push(para([run('• ' + t, { sz: 20 })], 0, 20))); }
          (s.pictures || []).forEach(id => picBlock(id).forEach(n => out.push(n)));
          if (s.materials) out.push(para([run('Хэрэглэгдэхүүн: ', { i: 1, sz: 20 }), run(s.materials, { sz: 20 })], 0, 40));
        } else {
          if (s.student) out.push(para([run('Сурагч: ', { i: 1, sz: 20 }), run(s.student, { sz: 20 })], 0, 40));
          if (s.tasks && s.tasks.length) out.push(para([run('Гүйцэтгэх даалгавар: ', { i: 1, sz: 20 }), run(s.tasks.map(t => String(t).split(/[:：]/)[0].trim()).join('; '), { sz: 20 })], 0, 40));
          if (s.result) out.push(para([run('Үнэлгээ, үр дүн: ', { i: 1, sz: 20 }), run(s.result, { sz: 20 })], 0, 40));
        }
      });
      if (homework) out.push(para([run('Гэрийн даалгавар: ', { b: 1 }), run(homework, { sz: 20 })], 140, 40));
      if (!out.length) out.push(para([], 0, 0));
      out.forEach(p => tc.appendChild(p));
    }

    const [T1, T2, T3, T4, T5] = tbls;
    const p = plan;
    const total = p.totalMinutes;
    const subject = p.subject || DOTS;

    // 1. Толгой хэсэг
    setTextCell(cell(T1, 0, 0), ['Нэгжийн сэдэв: ' + (p.unitTopic || DOTS)]);
    setTextCell(cell(T1, 0, 1), ['Ээлжит хичээлийн сэдэв: ' + (p.lessonTopic || DOTS)]);
    setTextCell(cell(T1, 1, 0), ['Судлагдахуун']); setTextCell(cell(T1, 1, 1), [subject]);
    setTextCell(cell(T1, 2, 0), ['Анги']);         setTextCell(cell(T1, 2, 1), [p.grade || DOTS]);
    setTextCell(cell(T1, 3, 0), ['Хугацаа']);      setTextCell(cell(T1, 3, 1), [total + ' минут']);

    // 2. Зохион байгуулалт, арга
    const stageMin = p.stages.map(s => s.steps.reduce((a, x) => a + x.minutes, 0));
    const org = p.organization.length ? p.organization
      : ['Бүтэц: эхлэл (' + stageMin[0] + ' мин), өрнөл (' + stageMin[1] + ' мин), төгсгөл (' + stageMin[2] + ' мин)'];
    setTextCell(cell(T2, 0, 0), ['Хичээлийн зохион байгуулалт']);
    setTextCell(cell(T2, 0, 1), ['Сургалтын арга']);
    setTextCell(cell(T2, 1, 0), org, 0);
    setTextCell(cell(T2, 1, 1), p.methods.length ? p.methods : [DOTS], 0);

    // 3. Зорилго, зорилт, хэрэгсэл
    setTextCell(cell(T3, 0, 0), ['Зорилго']); setTextCell(cell(T3, 0, 1), ['Зорилт']); setTextCell(cell(T3, 0, 2), ['Хичээлийн хэрэгсэл']);
    setTextCell(cell(T3, 1, 0), [p.goal || DOTS], 0);
    setTextCell(cell(T3, 1, 1), p.objectives.length ? p.objectives : [DOTS], 0);
    setTextCell(cell(T3, 1, 2), p.materials.length ? p.materials : [DOTS], 0);

    // 4–5. Алхмууд: багш / сурагч. Дугаар нь үе шатуудаар үргэлжилнэ.
    let no = 1;
    p.stages.forEach((st, c) => {
      const mins = stageMin[c];
      setTextCell(cell(T4, 0, c), [st.name + ' — ' + mins + ' минут']);
      setTextCell(cell(T4, 1, c), ['Багшийн үйл ажиллагаа']);
      setTextCell(cell(T5, 0, c), ['Сурагчийн үйл ажиллагаа']);
      const hw = c === 2 ? p.homework : '';
      setStepCell(cell(T4, 2, c), st.steps, 'teacher', no, hw);
      setStepCell(cell(T5, 1, c), st.steps, 'student', no, hw);
      no += st.steps.length;
    });

    // 6. Үнэлгээ (засан сайжруулах, нэмэлт тэмдэглэлийг хичээлийн дараа багш бөглөнө)
    setTextCell(cell(T5, 2, 0), ['Үнэлгээ']); setTextCell(cell(T5, 2, 1), ['Засан сайжруулах']); setTextCell(cell(T5, 2, 2), ['Нэмэлт тэмдэглэл']);
    setTextCell(cell(T5, 3, 0), p.assessment ? p.assessment.split('\n') : [''], 0);
    if (p.notes) setTextCell(cell(T5, 3, 2), [p.notes], 0);

    // 6.5 Хуудасны стандарт: A4, захын зай — зүүн 30 мм, баруун 15 мм, дээд 20 мм, доод 20 мм (баримт бичгийн нийтлэг стандарт).
    //     Өмнө нь доод зай 50 мм, хүснэгт текстийн талбараас гарсан байсан тул хэвлэхэд таарахгүй байв.
    const MM = 56.6929;                                           // 1 мм = 56.69 twip
    const PG = { top: Math.round(20 * MM), bottom: Math.round(20 * MM), left: Math.round(30 * MM), right: Math.round(15 * MM) };
    const TEXT_W = 11906 - PG.left - PG.right;
    const sp = kids(body, 'sectPr')[0];
    if (sp) {
      const set = (n, a) => { for (const k in a) n.setAttributeNS(W, 'w:' + k, String(a[k])); };
      let sz = kids(sp, 'pgSz')[0]; if (!sz) { sz = el('pgSz'); sp.insertBefore(sz, sp.firstChild); } set(sz, { w: 11906, h: 16838, orient: 'portrait' });
      let mar = kids(sp, 'pgMar')[0]; if (!mar) { mar = el('pgMar'); sp.appendChild(mar); } set(mar, { top: PG.top, bottom: PG.bottom, left: PG.left, right: PG.right, header: 567, footer: 567, gutter: 0 });
    }
    Array.from(doc.getElementsByTagNameNS(W, 'tbl')).forEach(tbl => {      // хүснэгт бүрийг текстийн өргөнд яг тааруулна
      const grid = kids(tbl, 'tblGrid')[0]; if (!grid) return;
      kids(grid, 'tblGridChange').forEach(n => grid.removeChild(n));   // хуучин өргөний өөрчлөлтийн бүртгэлийг цэвэрлэнэ
      const cols = kids(grid, 'gridCol'), sum = cols.reduce((s, c) => s + Number(c.getAttributeNS(W, 'w') || c.getAttribute('w:w') || 0), 0);
      if (!sum) return;
      let acc = 0;
      cols.forEach((c, i) => { const w0 = Number(c.getAttributeNS(W, 'w') || c.getAttribute('w:w') || 0); const w1 = i === cols.length - 1 ? TEXT_W - acc : Math.round(w0 * TEXT_W / sum); acc += w1; c.setAttributeNS(W, 'w:w', String(w1)); });
      const pr = kids(tbl, 'tblPr')[0];
      if (pr) { let tw = kids(pr, 'tblW')[0]; if (!tw) { tw = el('tblW'); pr.appendChild(tw); } tw.setAttributeNS(W, 'w:w', String(TEXT_W)); tw.setAttributeNS(W, 'w:type', 'dxa'); kids(pr, 'tblInd').forEach(n => pr.removeChild(n)); }
    });

    // 7. Хавсралт: сурах бичгээс олдсон бүх дасгал, даалгавар (хариутай нь)
    if (p.textbookTasks && p.textbookTasks.length) {
      const sect = kids(body, 'sectPr')[0];
      const add = n => (sect ? body.insertBefore(n, sect) : body.appendChild(n));
      add(para([run('Хавсралт: сурах бичгийн дасгал, даалгавар', { b: 1, sz: 24 })], 240, 80));
      p.textbookTasks.forEach((t, i) => add(para([run((i + 1) + '. ' + t, { sz: 20 })], 0, 60)));
    }

    let xml = new XS().serializeToString(doc).replace(/^<\?xml[^>]*\?>\s*/, '');
    zip.file('word/document.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + xml);
    if (media.length) {
      media.forEach(m => zip.file('word/media/' + m.name, m.b64, { base64: true }));
      const rels = await zip.file('word/_rels/document.xml.rels').async('string');
      zip.file('word/_rels/document.xml.rels', rels.replace('</Relationships>', media.map(m => '<Relationship Id="' + m.rid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/' + m.name + '"/>').join('') + '</Relationships>'));
      let ct = await zip.file('[Content_Types].xml').async('string');
      ['jpg:image/jpeg', 'png:image/png'].forEach(x => { const [e, t] = x.split(':'); if (media.some(m => m.ext === e) && !new RegExp('Extension="' + e + '"', 'i').test(ct)) ct = ct.replace(/<Types[^>]*>/, mm => mm + '<Default Extension="' + e + '" ContentType="' + t + '"/>'); });
      zip.file('[Content_Types].xml', ct);
    }
    return zip.generateAsync({ type: deps.type || 'blob', compression: 'DEFLATE' });
  }

  return { build };
});
