/* Ээлжит хичээлийн төлөвлөлтийн өгөгдлийн загвар.
   Сервер (require) болон хөтөч (<script>) хоёулаа ашиглана. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LessonCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const STAGES = ['Эхлэл', 'Өрнөл', 'Төгсгөл'];

  const str = (v, max) => String(v == null ? '' : v).replace(/[ \t]+\n/g, '\n').trim().slice(0, max);
  const num = (v, lo, hi, dflt) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt; };
  const list = (v, maxItems, maxLen) =>
    (Array.isArray(v) ? v : typeof v === 'string' ? v.split(/\n+/) : [])
      .map(x => str(x, maxLen)).filter(Boolean).slice(0, maxItems);

  function sanitizeStep(s) {
    s = s || {};
    const step = {
      title: str(s.title, 140),
      minutes: num(s.minutes, 1, 180, 5),
      goal: str(s.goal, 400),
      teacher: str(s.teacher, 1200),
      student: str(s.student, 1000),
      materials: str(s.materials, 300),
      result: str(s.result, 400)
    };
    return step;
  }
  const stepIsEmpty = s => !(s.title || s.teacher || s.student);

  // Үе шат үргэлж 3 (эхлэл, өрнөл, төгсгөл). Алхмын тоо чөлөөтэй.
  function sanitizeStages(raw) {
    const out = STAGES.map(name => ({ name, steps: [] }));
    const arr = Array.isArray(raw) ? raw : [];
    arr.forEach((st, i) => {
      let idx = STAGES.findIndex(n => String((st && st.name) || '').toLowerCase().startsWith(n.toLowerCase().slice(0, 4)));
      if (idx < 0) idx = Math.min(i, 2);
      (Array.isArray(st && st.steps) ? st.steps : []).slice(0, 20).forEach(s => {
        const c = sanitizeStep(s);
        if (!stepIsEmpty(c)) out[idx].steps.push(c);
      });
    });
    return out;
  }

  const allSteps = plan => plan.stages.reduce((a, s) => a.concat(s.steps), []);
  const stageMinutes = stage => stage.steps.reduce((a, s) => a + (Number(s.minutes) || 0), 0);
  const totalOf = plan => plan.stages.reduce((a, s) => a + stageMinutes(s), 0);
  const timeMismatch = plan => totalOf(plan) !== plan.totalMinutes;

  // Алхмуудын минутын нийлбэрийг нийт хугацаатай тэнцүүлнэ (өрнөлийн урт алхмуудаас эхэлж зөөнө).
  function balanceMinutes(plan) {
    const steps = allSteps(plan);
    if (!steps.length) return plan;
    let diff = plan.totalMinutes - totalOf(plan);
    const order = plan.stages[1].steps.concat(plan.stages[0].steps, plan.stages[2].steps)
      .sort((a, b) => b.minutes - a.minutes);
    let guard = 2000, i = 0;
    while (diff !== 0 && guard-- > 0) {
      const s = order[i % order.length]; i++;
      if (diff > 0) { s.minutes += 1; diff--; }
      else if (s.minutes > 1) { s.minutes -= 1; diff++; }
    }
    return plan;
  }

  function normalize(raw, opts) {
    raw = raw || {}; opts = opts || {};
    const total = num(opts.totalMinutes != null ? opts.totalMinutes : raw.totalMinutes, 10, 240, 40);
    return {
      unitTopic: str(opts.unitTopic != null && opts.unitTopic !== '' ? opts.unitTopic : raw.unitTopic, 200),
      lessonTopic: str(opts.lessonTopic != null && opts.lessonTopic !== '' ? opts.lessonTopic : raw.lessonTopic, 250),
      subject: str(opts.subject || raw.subject || 'Монгол хэл', 60),
      grade: str(opts.grade || raw.grade, 30),
      totalMinutes: total,
      organization: list(raw.organization, 6, 200),
      methods: list(raw.methods, 8, 160),
      goal: str(raw.goal, 600),
      objectives: list(raw.objectives, 7, 300),
      materials: list(raw.materials, 12, 200),
      stages: sanitizeStages(raw.stages),
      homework: str(raw.homework, 600),
      assessment: list(raw.assessment, 8, 400).join('\n'),
      notes: str(raw.notes, 600)
    };
  }
  // AI-аас ирсэн төлөвлөгөө: цэвэрлээд минутыг нийт хугацаатай тэнцүүлнэ.
  const sanitizePlan = (raw, opts) => balanceMinutes(normalize(raw, opts));
  // Word болгохын өмнө: хоосон алхмыг хасаж, мэдээллийг цэвэрлэнэ (минутыг өөрчлөхгүй).
  const prepareForExport = plan => normalize(plan, {});

  function emptyStep() {
    return { title: 'Шинэ алхам', minutes: 5, goal: '', teacher: '', student: '', materials: '', result: '' };
  }

  return { STAGES, sanitizePlan, prepareForExport, sanitizeStep, emptyStep, balanceMinutes, stageMinutes, totalOf, timeMismatch, allSteps, stepIsEmpty };
});
