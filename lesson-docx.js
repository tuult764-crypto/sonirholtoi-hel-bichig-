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

    function setStepCell(tc, steps, role, startNo, homework) {
      kids(tc, 'p').forEach(p => tc.removeChild(p));
      const out = [];
      steps.forEach((s, i) => {
        out.push(para([run('Алхам ' + (startNo + i) + '. ' + s.title + ' (' + s.minutes + ' мин)', { b: 1 })], 100, 40));
        if (role === 'teacher') {
          if (s.goal) out.push(para([run('Зорилго: ', { i: 1, sz: 20 }), run(s.goal, { sz: 20 })], 0, 40));
          if (s.teacher) out.push(para([run('Багш: ', { i: 1, sz: 20 }), run(s.teacher, { sz: 20 })], 0, 40));
          if (s.materials) out.push(para([run('Хэрэглэгдэхүүн: ', { i: 1, sz: 20 }), run(s.materials, { sz: 20 })], 0, 40));
        } else {
          if (s.student) out.push(para([run('Сурагч: ', { i: 1, sz: 20 }), run(s.student, { sz: 20 })], 0, 40));
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
    const subject = p.subject || 'Монгол хэл';

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

    let xml = new XS().serializeToString(doc).replace(/^<\?xml[^>]*\?>\s*/, '');
    zip.file('word/document.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + xml);
    return zip.generateAsync({ type: deps.type || 'blob', compression: 'DEFLATE' });
  }

  return { build };
});
