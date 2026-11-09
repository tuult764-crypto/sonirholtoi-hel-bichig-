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
      result: str(s.result, 400),
      questions: list(s.questions, 8, 300),   // багшийн тавих тодорхой асуултууд
      tasks: list(s.tasks, 10, 600),          // сурах бичгийн дасгал, даалгавар (дугаар, агуулгатай нь)
      taskPlans: list(s.taskPlans, 10, 700),  // даалгавар бүрийн нарийн төлөвлөлт: хэлбэр, хугацаа, удирдлага, хүлээгдэх хариу, дэмжлэг/сорилт
    };
    return step;
  }
  // Зураг дээр суурилсан даалгавар: AI зургийг таньж, даалгаврыг боловсруулсан байдал
  const picTasks = v => (Array.isArray(v) ? v : []).slice(0, 20).map(x => {
    x = x && typeof x === 'object' ? x : {};
    return { ref: str(x.ref, 140), type: str(x.type, 120), scene: str(x.scene, 1200), process: list(x.process, 10, 400), prompts: list(x.prompts, 10, 300), sample: list(x.sample, 8, 500), criteria: list(x.criteria, 6, 300), materials: str(x.materials, 200) };
  }).filter(x => x.ref || x.scene);
  const stepIsEmpty = s => !(s.title || s.teacher || s.student);
  const refOf = t => String(t || '').split(/[:：]/)[0].toLowerCase().replace(/\s+/g, ' ').trim();

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
      subject: str(opts.subject || raw.subject || '', 60),
      grade: str(opts.grade || raw.grade, 30),
      totalMinutes: total,
      organization: list(raw.organization, 6, 200),
      methods: list(raw.methods, 8, 160),
      goal: str(raw.goal, 600),
      objectives: list(raw.objectives, 7, 300),
      materials: list(raw.materials, 12, 200),
      stages: sanitizeStages(raw.stages),
      pictureTasks: picTasks(raw.pictureTasks),         // зурагт даалгавар (сэтгэгдэл бичих, цуврал зургаар өгүүлбэр зохиох, дуурайн зурах гэх мэт) — зургийн агуулга, явц, жишээ, шалгуур
      textbookTasks: list(raw.textbookTasks, 40, 700),   // зургаас уншсан бүх дасгал, даалгавар: «Дасгал 2 (х.45): текст → Хариу: ...»
      homework: str(raw.homework, 600),
      assessment: list(raw.assessment, 8, 400).join('\n'),
      notes: str(raw.notes, 600)
    };
  }
  // AI-аас ирсэн төлөвлөгөө: цэвэрлээд минутыг нийт хугацаатай тэнцүүлнэ.
  function coverTasks(plan) {
    const used = allSteps(plan).flatMap(s => s.tasks).map(refOf);
    const hw = String(plan.homework || '').toLowerCase();
    const missing = plan.textbookTasks.filter(t => { const r = refOf(t); return r && !used.some(u => u === r || u.includes(r) || r.includes(u)) && !hw.includes(r); });
    if (missing.length) {
      const mid = plan.stages[1].steps, pool = mid.length ? mid : allSteps(plan);
      const target = pool[pool.length - 1];
      if (target) missing.forEach(t => { if (target.tasks.length < 10) target.tasks.push(t); });
    }
    return plan;
  }
// Алхамд хамаарах зурагт даалгаврууд: алхмын tasks-ийн дугаартай таарсныг, таарахгүйг нь эхний «Өрнөл» алхамд харуулна
  function pictureTasksOf(plan, step) {
    const all = allSteps(plan), refs = s => s.tasks.map(refOf);
    const match = (pt, st) => { const r = refOf(pt.ref); return r && refs(st).some(u => u === r || u.includes(r) || r.includes(u)); };
    const home = pt => all.find(st => match(pt, st)) || (plan.stages[1].steps[0] || all[0]);
    return (plan.pictureTasks || []).filter(pt => home(pt) === step);
  }
  const sanitizePlan = (raw, opts) => coverTasks(balanceMinutes(normalize(raw, opts)));
  // Word болгохын өмнө: хоосон алхмыг хасаж, мэдээллийг цэвэрлэнэ (минутыг өөрчлөхгүй).
  const prepareForExport = plan => normalize(plan, {});

  function emptyStep() {
    return { title: 'Шинэ алхам', minutes: 5, goal: '', teacher: '', student: '', materials: '', result: '', questions: [], tasks: [], taskPlans: [] };
  }

  return { STAGES, pictureTasksOf, coverTasks, refOf, sanitizePlan, prepareForExport, sanitizeStep, emptyStep, balanceMinutes, stageMinutes, totalOf, timeMismatch, allSteps, stepIsEmpty };
});
