/* Ээлжит хичээлийн төлөвлөлт — сурах бичгийн зураг/эхээс боловсруулж, засаад Word болгон татна. */
(function () {
  'use strict';
  const C = window.LessonCore;
  const DRAFT_KEY = 'shb_lesson_draft_v1';
  const MAX_IMAGES = 10;
  const PICS_KEY = 'shb_lesson_pics_v1';
  const S = { pics: {}, images: [], plan: null, warnings: [], busy: false, pdf: null, pdfName: '' };
  const $ = id => document.getElementById(id);
  const toast = (m, t) => (typeof showToast === 'function' ? showToast(m, t) : alert(m));

  /* ── жижиг DOM туслах ── */
  function h(tag, props, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'value') e.value = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    kids.flat().forEach(c => { if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c)); });
    return e;
  }
  function bindText(node, obj, key, cb) {
    node.value = obj[key] || '';
    node.addEventListener('input', () => { obj[key] = node.value; save(); cb && cb(); });
    return node;
  }
  function bindLines(node, obj, key) {
    node.value = (obj[key] || []).join('\n');
    node.addEventListener('input', () => { obj[key] = node.value.split('\n').map(s => s.trim()).filter(Boolean); save(); });
    return node;
  }
  function bindNum(node, obj, key, cb) {
    node.value = obj[key];
    node.addEventListener('input', () => { obj[key] = Math.max(0, parseInt(node.value) || 0); save(); cb && cb(); });
    return node;
  }
  const field = (label, control) => h('label', { class: 'lp-f' }, h('span', { text: label }), control);

  /* ── зураг оруулах ── */
  function loadImg(file) {
    return new Promise((res, rej) => {
      const u = URL.createObjectURL(file), i = new Image();
      i.onload = () => { URL.revokeObjectURL(u); res(i); };
      i.onerror = () => { URL.revokeObjectURL(u); rej(new Error('Зураг уншигдсангүй. JPG, PNG эсвэл WEBP ашиглана уу.')); };
      i.src = u;
    });
  }
  async function shrink(file) { // том зургийг багасгаж серверт хурдан илгээнэ
    const img = await loadImg(file), max = 1800;
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * k), hh = Math.round(img.naturalHeight * k);
    const c = document.createElement('canvas'); c.width = w; c.height = hh;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, hh); g.drawImage(img, 0, 0, w, hh);
    return c.toDataURL('image/jpeg', 0.85);
  }
  async function addFiles(files) {
    const list = Array.from(files || []).filter(f => /^image\//.test(f.type));
    if (!list.length) { toast('Зураг (JPG, PNG, WEBP) сонгоно уу', 'error'); return; }
    for (const f of list) {
      if (S.images.length >= MAX_IMAGES) { toast('Хамгийн ихдээ ' + MAX_IMAGES + ' зураг оруулна', 'error'); break; }
      try { S.images.push({ name: f.name, url: await shrink(f) }); } catch (e) { toast(e.message, 'error'); }
    }
    drawThumbs();
  }
  function drawThumbs() {
    const box = $('lpThumbs'); box.textContent = '';
    S.images.forEach((im, i) => box.append(h('div', { class: 'lp-thumb' },
      h('img', { src: im.url, alt: 'Хуудас ' + (i + 1) }),
      h('button', { type: 'button', title: 'Хасах', 'aria-label': 'Зургийг хасах', onclick: () => { S.images.splice(i, 1); drawThumbs(); } }, '✕'))));
  }


  /* ── сурах бичгийн PDF-ээс хуудас сонгох ── */
  async function openBookPdf(file) {
    if (!file) return;
    if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) { toast('PDF файл сонгоно уу.', 'error'); return; }
    if (!window.pdfjsLib) { toast('PDF уншигч ачаалагдсангүй. Интернэтээ шалгаад дахин оролдоно уу.', 'error'); return; }
    try {
      const bytes = await file.arrayBuffer();
      S.pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
      S.pdfName = file.name;
      $('lpPdfStart').max = S.pdf.numPages;
      $('lpPdfEnd').max = S.pdf.numPages;
      $('lpPdfEnd').value = Math.min(S.pdf.numPages, 1);
      $('lpPdfInfo').textContent = `${file.name} · Нийт ${S.pdf.numPages} хуудастай. Ашиглах хуудасны дугаараа сонгоно уу.`;
      $('lpPdfPreview').textContent = '';
    } catch (e) {
      S.pdf = null;
      $('lpPdfInfo').textContent = 'PDF файлыг нээж чадсангүй.';
      toast('PDF уншиж чадсангүй: ' + e.message, 'error');
    }
  }
  async function selectBookPages() {
    if (!S.pdf) { toast('Эхлээд сурах бичгийн PDF файлаа сонгоно уу.', 'error'); return; }
    const start = Math.max(1, parseInt($('lpPdfStart').value, 10) || 1);
    const end = Math.max(start, parseInt($('lpPdfEnd').value, 10) || start);
    if (end > S.pdf.numPages) { toast('Хуудасны дугаар PDF-ийн нийт хуудасны тооноос их байна.', 'error'); return; }
    const count = end - start + 1;
    if (count > 10) { toast('Нэг удаад хамгийн ихдээ 10 хуудас сонгоно.', 'error'); return; }
    const rendered = [];
    $('lpPdfPreview').textContent = 'Хуудсуудыг бэлтгэж байна…';
    try {
      for (let n = start; n <= end; n++) {
        const page = await S.pdf.getPage(n);
        const viewport = page.getViewport({ scale: Math.min(1.5, 1500 / page.getViewport({scale:1}).width) });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        rendered.push({ name: `${S.pdfName} — ${n}-р хуудас`, url: canvas.toDataURL('image/jpeg', .86), pageNo: n });
      }
      S.images = rendered;
      drawThumbs();
      $('lpPdfInfo').textContent = `${start}–${end}-р хуудас сонгогдлоо (${count} хуудас). Боловсруулахдаа эдгээр хуудсыг ашиглана.`;
      const preview = $('lpPdfPreview'); preview.textContent = '';
      rendered.forEach((im, i) => preview.append(h('div', {class:'lp-pdf-page'}, h('img',{src:im.url,alt:`${im.pageNo}-р хуудас`}), h('span',{text:`${im.pageNo}-р хуудас`}))));
      $('lpPageCount').value = count;
    } catch (e) {
      $('lpPdfPreview').textContent = '';
      toast('Хуудас хөрвүүлэхэд алдаа гарлаа: ' + e.message, 'error');
    }
  }

  /* ── боловсруулах ── */
  async function generate() {
    if (S.busy) return;
    const text = $('lpText').value.trim();
    if (!S.images.length && text.length < 30) { toast('Сурах бичгийн зураг оруулах эсвэл эхийг буулгана уу', 'error'); return; }
    const minutes = parseInt($('lpMinutes').value) || 40;
    S.busy = true; $('lpGo').disabled = true;
    $('lpStatus').textContent = 'Боловсруулж байна… 30–60 секунд болж болно.';
    try {
      const r = await fetch('/api/lesson-plan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images: S.images.map(i => i.url), text, minutes, sourcePages: S.images.length || Math.max(1, Math.min(10, parseInt($('lpPageCount').value)||1)),
          grade: $('lpGrade').value, subject: $('lpSubject').value.trim(),
          lessonTopic: $('lpTopic').value.trim(), unitTopic: $('lpUnit').value.trim(), method: $('lpMethod').value.trim()
        })
      });
      let data = {}; try { data = await r.json(); } catch (e) { /* JSON биш хариу */ }
      if (!r.ok) throw new Error(data.error || (r.status === 413 ? 'Зураг хэт том байна. Цөөн эсвэл жижиг зураг оруулна уу.' : 'Алдаа гарлаа (' + r.status + ')'));
      S.plan = C.sanitizePlan(data.plan, { totalMinutes: minutes });
      await cropPictures();
      if (data.access) showAccess(data.access);
      S.warnings = data.warnings || [];
      save(); render();
      $('lpStatus').textContent = '';
      $('lpResult').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      $('lpStatus').textContent = '';
      toast(e.message || 'Алдаа гарлаа', 'error');
    } finally { S.busy = false; $('lpGo').disabled = false; }
  }


  /* ── сурах бичгийн хуудсан дахь зургуудыг таслан авах (AI хэлсэн байрлалаар) ── */
  const loadPic = url => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('зураг ачаалсангүй')); i.src = url; });
  async function cropPictures() {
    S.pics = {};
    const list = (S.plan && S.plan.pictures) || [];
    for (const p of list) {
      try {
        const src = S.images[p.page - 1]; if (!src || !p.box) continue;
        const im = await loadPic(src.url), W = im.naturalWidth, H = im.naturalHeight, pad = 0.015;
        const x = Math.max(0, p.box[0] - pad) * W, y = Math.max(0, p.box[1] - pad) * H;
        const w = Math.min(W - x, (p.box[2] + 2 * pad) * W), hh = Math.min(H - y, (p.box[3] + 2 * pad) * H);
        if (w < 40 || hh < 40) continue;
        const k = Math.min(1, 900 / w), cw = Math.round(w * k), ch = Math.round(hh * k);
        const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
        const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cw, ch); cx.drawImage(im, x, y, w, hh, 0, 0, cw, ch);
        S.pics[p.id] = { dataUrl: cv.toDataURL('image/jpeg', 0.85), w: cw, h: ch };
      } catch (e) { /* энэ зургийг алгасна */ }
    }
    try { localStorage.setItem(PICS_KEY, JSON.stringify(S.pics)); } catch (e) { /* багтахгүй бол зөвхөн энэ сессэд */ }
  }
  function attachPics(P) { (P.pictures || []).forEach(p => { const im = S.pics[p.id]; if (im) { p.dataUrl = im.dataUrl; p.w = im.w; p.h = im.h; } }); return P; }
  function removePicture(id) {
    S.plan.pictures = S.plan.pictures.filter(p => p.id !== id); delete S.pics[id];
    C.allSteps(S.plan).forEach(st => { st.pictures = (st.pictures || []).filter(x => x !== id); });
    try { localStorage.setItem(PICS_KEY, JSON.stringify(S.pics)); } catch (e) { /* */ }
    save(); render();
  }

  /* ── засварлагч ── */
  let saveTimer = 0;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { try { if (S.plan) localStorage.setItem(DRAFT_KEY, JSON.stringify(S.plan)); } catch (e) { /* хадгалах боломжгүй */ } }, 400);
  }
  function stepNumbers() { let n = 1; return S.plan.stages.map(st => { const a = n; n += st.steps.length; return a; }); }

  function refreshTotals() {
    const P = S.plan, total = C.totalOf(P), ok = total === P.totalMinutes;
    P.stages.forEach((st, i) => { const e = $('lpStageMin' + i); if (e) e.textContent = C.stageMinutes(st) + ' минут'; });
    const bar = $('lpTotal');
    if (bar) {
      bar.className = 'lp-total ' + (ok ? 'ok' : 'bad');
      $('lpTotalText').textContent = 'Алхмуудын нийлбэр: ' + total + ' / ' + P.totalMinutes + ' минут' + (ok ? ' ✓' : ' — таарахгүй байна');
      $('lpBalance').style.display = ok ? 'none' : '';
    }
  }

  function moveStep(si, i, d) {
    const st = S.plan.stages, s = st[si].steps[i];
    if (d < 0) {
      if (i > 0) { st[si].steps.splice(i, 1); st[si].steps.splice(i - 1, 0, s); }
      else if (si > 0) { st[si].steps.splice(i, 1); st[si - 1].steps.push(s); }
      else return;
    } else {
      if (i < st[si].steps.length - 1) { st[si].steps.splice(i, 1); st[si].steps.splice(i + 1, 0, s); }
      else if (si < 2) { st[si].steps.splice(i, 1); st[si + 1].steps.unshift(s); }
      else return;
    }
    save(); render();
  }

  function stepCard(si, i, no) {
    const s = S.plan.stages[si].steps[i];
    return h('div', { class: 'lp-step' },
      h('div', { class: 'lp-step-top' },
        h('span', { class: 'lp-no', text: 'Алхам ' + no }),
        bindText(h('input', { type: 'text', class: 'lp-title', placeholder: 'Алхмын нэр', 'aria-label': 'Алхмын нэр' }), s, 'title'),
        h('span', { class: 'lp-min' }, bindNum(h('input', { type: 'number', min: 1, max: 180, 'aria-label': 'Минут' }), s, 'minutes', refreshTotals), ' мин'),
        h('button', { type: 'button', class: 'lp-ic', title: 'Дээш', 'aria-label': 'Дээш зөөх', onclick: () => moveStep(si, i, -1) }, '↑'),
        h('button', { type: 'button', class: 'lp-ic', title: 'Доош', 'aria-label': 'Доош зөөх', onclick: () => moveStep(si, i, 1) }, '↓'),
        h('button', { type: 'button', class: 'lp-ic del', title: 'Устгах', 'aria-label': 'Алхмыг устгах', onclick: () => { if (confirm('Энэ алхмыг устгах уу?')) { S.plan.stages[si].steps.splice(i, 1); save(); render(); } } }, '✕')),
      h('div', { class: 'lp-step-grid' },
        field('Зорилго', bindText(h('textarea', { rows: 2 }), s, 'goal')),
        field('Багшийн үйл ажиллагаа', bindText(h('textarea', { rows: 4 }), s, 'teacher')),
        field('Сурагчийн үйл ажиллагаа', bindText(h('textarea', { rows: 4 }), s, 'student')),
        field('Ашиглах зураг (мөр бүр нэг зураг: «Зураг 1»)', bindLines(h('textarea', { rows: 2, placeholder: 'Зураг 1' }), s, 'pictures')),
        field('Даалгаврын нарийн төлөвлөлт (даалгавар бүрд нэг мөр: хэлбэр, хугацаа, удирдлага, хүлээгдэх хариу, дэмжлэг/сорилт)', bindLines(h('textarea', { rows: 4 }), s, 'taskPlans')),
        field('Сурах бичгийн дасгал, даалгавар (мөр бүр нэг даалгавар)', bindLines(h('textarea', { rows: 3, placeholder: 'Дасгал 2 (х.45): ...' }), s, 'tasks')),
        field('Багшийн тавих тодорхой асуултууд (мөр бүр нэг асуулт)', bindLines(h('textarea', { rows: 3 }), s, 'questions')),
        field('Хэрэглэгдэхүүн', bindText(h('input', { type: 'text' }), s, 'materials')),
        field('Үнэлгээ, хүлээгдэх үр дүн', bindText(h('input', { type: 'text' }), s, 'result'))));
  }

  function render() {
    const P = S.plan, root = $('lpResult'); root.textContent = '';
    if (!P) { root.hidden = true; return; }
    root.hidden = false;
    const starts = stepNumbers();

    root.append(h('div', { class: 'lp-bar-top' },
      h('h3', { text: 'Боловсруулсан төлөвлөгөө' }),
      h('p', { text: 'Бүх хэсгийг засч болно. Алхам нэмэх, устгах, зөөх боломжтой. Алхмын тоо тогтмол биш.' })));
    if (S.warnings.length) root.append(h('div', { class: 'lp-warn' }, h('b', { text: 'Анхаарах: ' }), S.warnings.join(' · ')));

    root.append(h('div', { class: 'lp-card' },
      h('div', { class: 'lp-grid2' },
        field('Нэгжийн сэдэв', bindText(h('input', { type: 'text' }), P, 'unitTopic')),
        field('Ээлжит хичээлийн сэдэв', bindText(h('input', { type: 'text' }), P, 'lessonTopic')),
        field('Судлагдахуун', bindText(h('input', { type: 'text' }), P, 'subject')),
        field('Анги', bindText(h('input', { type: 'text' }), P, 'grade')),
        field('Нийт хугацаа (минут)', bindNum(h('input', { type: 'number', min: 10, max: 240 }), P, 'totalMinutes', refreshTotals))),
      h('div', { class: 'lp-grid2' },
        field('Хичээлийн зохион байгуулалт (мөр бүр нэг зүйл)', bindLines(h('textarea', { rows: 3 }), P, 'organization')),
        field('Сургалтын арга (мөр бүр нэг арга)', bindLines(h('textarea', { rows: 3 }), P, 'methods'))),
      field('Зорилго', bindText(h('textarea', { rows: 2 }), P, 'goal')),
      h('div', { class: 'lp-grid2' },
        field('Зорилт (мөр бүр нэг зорилт)', bindLines(h('textarea', { rows: 4 }), P, 'objectives')),
        field('Хичээлийн хэрэгсэл (мөр бүр нэг зүйл)', bindLines(h('textarea', { rows: 4 }), P, 'materials')))));

    root.append(h('div', { class: 'lp-card' },
      field('Сурах бичгээс олдсон дасгал, даалгавар (мөр бүр нэг даалгавар: «Дасгал 2 (х.45): агуулга → Хариу»)', bindLines(h('textarea', { rows: 5 }), P, 'textbookTasks')),
      h('small', { class: 'lp-hint', text: 'Эдгээр нь доорх алхмуудад хуваарилагдсан. Алхмын «Сурах бичгийн дасгал, даалгавар» талбарт мөн ижил дугаартайгаар бичигдсэн байна.' })));

    if ((P.pictures || []).length) root.append(h('div', { class: 'lp-card' },
      h('h3', { text: 'Сурах бичгийн зургууд' }),
      h('small', { class: 'lp-hint', text: 'Хуудаснаас таслан авсан зургууд Word, хэвлэх хувилбарт алхамдаа орно. Зөв таслагдаагүй бол «Хасах» дарна уу (тайлбар, даалгавар хэвээр үлдэнэ).' }),
      ...P.pictures.map(pc => h('div', { class: 'lp-pic' },
        S.pics[pc.id] ? h('img', { src: S.pics[pc.id].dataUrl, alt: pc.caption || pc.id, style: 'max-width:240px;max-height:180px;border:1px solid #ddd;border-radius:6px;display:block;margin-bottom:6px' }) : h('small', { class: 'lp-hint', text: pc.id + ': зураг таслагдаагүй (хуудас ' + pc.page + ')' }),
        field(pc.id + ' — тайлбар', bindText(h('input', { type: 'text' }), pc, 'caption')),
        field('Зурагтай хийх даалгавар', bindText(h('textarea', { rows: 3 }), pc, 'activity')),
        field('Зураг дээрх асуултууд (мөр бүр нэг асуулт)', bindLines(h('textarea', { rows: 3 }), pc, 'questions')),
        S.pics[pc.id] ? h('button', { type: 'button', class: 'btn-g', onclick: () => { delete S.pics[pc.id]; try { localStorage.setItem(PICS_KEY, JSON.stringify(S.pics)); } catch (e) { /* */ } render(); } }, 'Зургийг хасах') : null))));

    P.stages.forEach((st, si) => {
      root.append(h('div', { class: 'lp-stage' },
        h('div', { class: 'lp-stage-h' }, h('h4', { text: st.name }), h('span', { id: 'lpStageMin' + si, text: C.stageMinutes(st) + ' минут' })),
        st.steps.length ? st.steps.map((_, i) => stepCard(si, i, starts[si] + i)) : h('p', { class: 'lp-empty', text: 'Энэ үе шатад алхам алга.' }),
        h('button', { type: 'button', class: 'btn-g lp-add', onclick: () => { st.steps.push(C.emptyStep()); save(); render(); } }, '+ Алхам нэмэх')));
    });

    root.append(h('div', { id: 'lpTotal', class: 'lp-total' },
      h('span', { id: 'lpTotalText' }),
      h('button', { id: 'lpBalance', type: 'button', class: 'btn-g', onclick: () => { C.balanceMinutes(P); save(); render(); } }, 'Хугацааг тэгшлэх')));

    root.append(h('div', { class: 'lp-card' },
      field('Гэрийн даалгавар', bindText(h('textarea', { rows: 2 }), P, 'homework')),
      field('Үнэлгээ (мөр бүр нэг зүйл)', bindText(h('textarea', { rows: 3 }), P, 'assessment'))));

    root.append(h('div', { class: 'lp-actions' },
      h('button', { type: 'button', class: 'btn-g', onclick: previewPlan }, '👁 Харах'),
      h('button', { type: 'button', class: 'btn-p', onclick: printPlan }, '🖨 Харснаа хэвлэх'),
      h('button', { type: 'button', class: 'btn-p', onclick: download }, '⬇ Word татах'),
      h('button', { type: 'button', class: 'btn-g', onclick: () => { if (confirm('Одоогийн төлөвлөгөө арилна. Шинээр эхлэх үү?')) reset(); } }, 'Шинээр эхлэх')));
    refreshTotals();
  }

  function showAccess(data) {
    const title=$('lpAccessTitle'), info=$('lpAccessInfo'); if(!title||!info)return;
    if(data && data.package){const a=data.package;title.textContent='Танд эрх байна';info.textContent=`${a.type==='week7'?'7 хоногийн багц':'5 ээлжит хичээлийн багц'} · Үлдсэн ${a.remainingPages}/${a.totalPages} ээлжит · Өнөөдөр ${Math.max(0,a.dailyLimit-a.usedToday)}/${a.dailyLimit} ээлжит боловсруулах боломжтой`+(a.expiresAt?' · Дуусах: '+new Date(Number(a.expiresAt)).toLocaleString('mn-MN'): ' · Хугацаагүй');}
    else {title.textContent='Эрх дууссан';info.textContent='Ээлжит хичээл боловсруулахын тулд багц сонгоно уу.';}
  }
  async function refreshLessonAccess(){
    try{const r=await fetch('/api/lesson-package/status'); if(r.status===401){$('lpAccessTitle').textContent='И-мэйлээр нэвтэрнэ үү';$('lpAccessInfo').textContent='Нэвтэрсний дараа багцын эрхээ харах боломжтой.';return;} const d=await r.json();showAccess(d);}catch(e){if($('lpAccessTitle'))$('lpAccessTitle').textContent='Эрхийн төлөв шалгаж чадсангүй';}
  }
  window.refreshLessonAccess=refreshLessonAccess;
  async function buyPackage(type){
    if(!currentUser){if(typeof openAuth==='function')openAuth('login');else toast('Эхлээд и-мэйлээр нэвтэрнэ үү','error');return;}
    const box=$('lpPayBox'), wrap=$('lpPackages'); box.hidden=false;box.textContent='Нэхэмжлэх үүсгэж байна…';
    try{const r=await fetch('/api/lesson-package/buy',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({packageType:type})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||('Нэхэмжлэх үүссэнгүй (HTTP '+r.status+')'));
      box.textContent='';box.append(h('b',{text:d.title+' · '+Number(d.amount).toLocaleString('mn-MN')+'₮'}));
      if(d.qr){const im=h('img',{alt:'QPay QR код',src:d.qr.startsWith('data:')?d.qr:'data:image/png;base64,'+d.qr});box.append(im);}
      else if(d.qrUrl){box.append(h('img',{alt:'Төлбөрийн QR код',src:d.qrUrl}));}
      if(d.shortUrl)box.append(h('p',{},h('a',{href:d.shortUrl,target:'_blank',rel:'noopener',text:'QPay-ээр төлөх'})));
      if(d.manual){
        // Гар горим: захиалгын кодыг гүйлгээний утганд бичихгүй бол админ төлбөрийг таних боломжгүй
        box.append(h('ol',{style:'padding-left:22px;line-height:1.65;margin:10px 0'},
          h('li',{},'Дээрх QR кодыг банкны апп-аараа уншуулна.'),
          h('li',{},'Төлөх дүн: ',h('b',{text:Number(d.amount).toLocaleString('mn-MN')+'₮'}),' (QR-д дүн орохгүй тул өөрөө оруулна).'),
          h('li',{},'Гүйлгээний утгад захиалгын кодыг яг хэвээр нь бичнэ.'),
          h('li',{},'Админ банкны орлоготой тулгаж баталгаажуулмагц эрх нээгдэнэ.')));
        box.append(h('div',{style:'text-align:center;margin:8px 0'},h('div',{text:'Захиалгын код (гүйлгээний утга)'}),h('div',{style:'font-size:1.4em;font-weight:800;letter-spacing:.04em;user-select:all',text:d.orderNo})));
        if(d.reused)box.append(h('p',{class:'small',text:'Өмнөх төлөгдөөгүй захиалгыг дахин харууллаа — шинэ код үүсгээгүй.'}));
      } else box.append(h('p',{text:'Төлбөр хийсний дараа төлөвөө шалгана уу.'}));
      box.append(h('button',{type:'button',class:'btn-p',onclick:()=>checkPackage(d.orderNo)},'Төлбөр шалгах'));
      box.append(h('button',{type:'button',class:'btn-g',onclick:()=>{box.hidden=true;wrap.hidden=true;}},'Хаах'));
    }catch(e){box.textContent=e.message;if(/нэвтэр|401/i.test(e.message)&&typeof openAuth==='function')openAuth('login');}
  }
  async function checkPackage(orderNo){
    try{const r=await fetch('/api/lesson-package/check',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderNo})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Шалгаж чадсангүй');if(d.status==='paid'){toast('Төлбөр баталгаажлаа. Эрх идэвхжлээ.','success');$('lpPackages').hidden=true;await refreshLessonAccess();}else toast('Төлбөр хараахан баталгаажаагүй байна.','error');}catch(e){toast(e.message,'error');}
  }
  function escHtml(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  // A4 хэвлэх хувилбар: захын зай зүүн 30 / баруун 15 / дээд 20 / доод 20 мм (Word-той ижил), хүснэгт хуудас таслахад толгойгоо давтана
  function printable(){
    const P=attachPics(C.prepareForExport(S.plan)), e=escHtml, arr=v=>Array.isArray(v)?v:(v?String(v).split(/\n+/):[]), li=a=>arr(a).map(x=>`<li>${e(x)}</li>`).join('');
    const picHtml=(P,x)=>(x.pictures||[]).map(id=>(P.pictures||[]).find(q=>q.id===id)).filter(Boolean).map(q=>`<div class="pic">${q.dataUrl?`<img src="${q.dataUrl}" alt="">`:''}<p><b>${e(q.id)}.</b> ${e(q.caption)}</p>${q.activity?`<p><i>Даалгавар:</i> ${e(q.activity)}</p>`:''}${(q.questions&&q.questions.length)?`<ul>${li(q.questions)}</ul>`:''}</div>`).join('');
    let n=1;
    const rows=P.stages.map(st=>`<tr class="st"><td colspan="4">${e(st.name)} <span>(${st.steps.reduce((a,x)=>a+x.minutes,0)} минут)</span></td></tr>`+st.steps.map(x=>`<tr>
      <td class="c"><b>${n++}.</b> ${e(x.title)}<br><span class="m">${x.minutes} мин</span></td>
      <td>${x.goal?`<p><i>Зорилго:</i> ${e(x.goal)}</p>`:''}<p>${e(x.teacher)}</p>${(x.questions&&x.questions.length)?`<p><i>Асуулт:</i></p><ul>${li(x.questions)}</ul>`:''}${(x.tasks&&x.tasks.length)?`<p><i>Сурах бичгийн даалгавар:</i></p><ul>${li(x.tasks)}</ul>`:''}${(x.taskPlans&&x.taskPlans.length)?`<p><i>Даалгаврын төлөвлөлт:</i></p><ul>${li(x.taskPlans)}</ul>`:''}${picHtml(P,x)}</td>
      <td><p>${e(x.student)}</p>${(x.tasks&&x.tasks.length)?`<p><i>Гүйцэтгэх:</i> ${e(x.tasks.map(t=>String(t).split(/[:：]/)[0].trim()).join('; '))}</p>`:''}</td>
      <td>${x.materials?`<p><i>Хэрэглэгдэхүүн:</i> ${e(x.materials)}</p>`:''}${x.result?`<p><i>Үнэлгээ:</i> ${e(x.result)}</p>`:''}</td></tr>`).join('')).join('');
    const css=`@page{size:A4;margin:20mm 15mm 20mm 30mm}*{box-sizing:border-box}html,body{margin:0;padding:0}body{font:12pt/1.35 "Times New Roman",Times,serif;color:#000}
h1{text-align:center;font-size:15pt;margin:0 0 8pt;text-transform:uppercase}h2{font-size:12.5pt;margin:12pt 0 4pt;border-bottom:.75pt solid #000;padding-bottom:2pt;page-break-after:avoid}
p{margin:0 0 3pt}ul,ol{margin:0 0 3pt;padding-left:14pt}li{margin:0}i{font-style:italic}
table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:.75pt solid #000;padding:3pt 4pt;vertical-align:top;overflow-wrap:anywhere;font-size:11pt}
thead{display:table-header-group}tr{page-break-inside:avoid}th{background:#eee;text-align:center}.st{break-after:avoid;page-break-after:avoid}.st td{background:#f3f3f3;font-weight:bold}.st span{font-weight:normal}
td.c{text-align:left}.pic{margin:4pt 0;page-break-inside:avoid}.pic img{display:block;max-width:100%;max-height:60mm;margin:0 auto 2pt;border:.5pt solid #999}.m{font-size:10pt;color:#222}.info td{border:none;padding:1pt 0;font-size:12pt}.info td:first-child{width:36mm;font-weight:bold}.ob{page-break-inside:avoid}`;
    return `<!doctype html><html lang="mn"><head><meta charset="utf-8"><title>Ээлжит хичээлийн төлөвлөлт</title><style>${css}</style></head><body>
<h1>Ээлжит хичээлийн төлөвлөлт</h1>
<table class="info"><tr><td>Анги:</td><td>${e(P.grade)}</td></tr><tr><td>Судлагдахуун:</td><td>${e(P.subject)}</td></tr><tr><td>Хугацаа:</td><td>${P.totalMinutes} минут</td></tr><tr><td>Нэгжийн сэдэв:</td><td>${e(P.unitTopic)}</td></tr><tr><td>Хичээлийн сэдэв:</td><td>${e(P.lessonTopic)}</td></tr><tr><td>Зорилго:</td><td>${e(P.goal)}</td></tr>${arr(P.objectives).length?`<tr><td>Зорилт:</td><td><ul>${li(P.objectives)}</ul></td></tr>`:''}${arr(P.methods).length?`<tr><td>Арга зүй:</td><td>${e(arr(P.methods).join(', '))}</td></tr>`:''}${arr(P.materials).length?`<tr><td>Хэрэглэгдэхүүн:</td><td>${e(arr(P.materials).join(', '))}</td></tr>`:''}</table>
<h2>Хичээлийн явц</h2>
<table><colgroup><col style="width:20%"><col style="width:34%"><col style="width:28%"><col style="width:18%"></colgroup><thead><tr><th>Алхам</th><th>Багшийн үйл ажиллагаа</th><th>Сурагчийн үйл ажиллагаа</th><th>Хэрэглэгдэхүүн, үнэлгээ</th></tr></thead><tbody>${rows}</tbody></table>
<div class="ob"><h2>Гэрийн даалгавар</h2><p>${e(P.homework)}</p></div>
${arr(P.assessment).length?`<div class="ob"><h2>Үнэлгээ</h2><ul>${li(P.assessment)}</ul></div>`:''}
${arr(P.textbookTasks).length?`<div class="ob"><h2>Хавсралт: сурах бичгийн дасгал, даалгавар</h2><ol>${li(P.textbookTasks)}</ol></div>`:''}</body></html>`;
  }
  // «Харах»: шинэ цонх нээхгүй (хөтөч хааж болзошгүй), хуудас дотор цаасан хэлбэрээр харуулна
  function openView(thenPrint){
    if(!S.plan)return;
    let box=document.getElementById('lpViewer'); if(box)box.remove();
    const scaleFit=()=>{const f=box.querySelector('iframe'),wrap=box.querySelector('.lp-paper');const avail=Math.min(box.clientWidth-24,794);const k=Math.min(1,avail/794);f.style.transform=`scale(${k})`;wrap.style.width=(794*k)+'px';wrap.style.height=(f.__h||1123)*k+'px';};
    const frame=h('iframe',{title:'Ээлжит хичээлийн төлөвлөлт',style:'width:794px;border:0;background:#fff;transform-origin:0 0;display:block'});
    const close=()=>{document.removeEventListener('keydown',onKey);box.remove();document.body.style.overflow='';};
    const onKey=ev=>{if(ev.key==='Escape')close();};
    const doPrint=()=>{try{frame.contentWindow.focus();frame.contentWindow.print();}catch(err){toast('Хэвлэх боломжгүй байна. Word татаж хэвлээрэй.','error');}};
    box=h('div',{id:'lpViewer',role:'dialog','aria-modal':'true','aria-label':'Төлөвлөлтийг харах',style:'position:fixed;inset:0;z-index:9999;background:rgba(40,36,30,.72);display:flex;flex-direction:column;overflow:auto'},
      h('div',{style:'position:sticky;top:0;z-index:1;display:flex;gap:8px;justify-content:center;flex-wrap:wrap;padding:10px;background:#2b2722'},
        h('button',{type:'button',class:'btn-p',onclick:doPrint},'🖨 Хэвлэх'),
        h('button',{type:'button',class:'btn-g',onclick:()=>{close();download();}},'⬇ Word татах'),
        h('button',{type:'button',class:'btn-g',onclick:close},'✕ Хаах')),
      h('div',{style:'padding:14px 0 30px;display:flex;justify-content:center'},h('div',{class:'lp-paper',style:'background:#fff;box-shadow:0 4px 24px rgba(0,0,0,.4);overflow:hidden'},frame)));
    document.body.append(box); document.body.style.overflow='hidden'; document.addEventListener('keydown',onKey);
    box.addEventListener('click',ev=>{if(ev.target===box)close();});
    // A4 хуудасны хэмжээг (210мм ≈ 794px) хадгалж, багтахгүй үед масштаблана
    frame.addEventListener('load',()=>{try{const d=frame.contentDocument;frame.style.height=Math.max(1123,d.documentElement.scrollHeight)+'px';frame.__h=Math.max(1123,d.documentElement.scrollHeight);}catch(err){}scaleFit();if(thenPrint)setTimeout(doPrint,200);});
    window.addEventListener('resize',()=>{if(document.getElementById('lpViewer'))scaleFit();});
    // A4 дотор захын зайг дүрслэн харуулахын тулд агуулгыг цаасан дотор (30/10/20/20 мм) харуулна
    frame.srcdoc=printable().replace('<body>','<body style="padding:20mm 15mm 20mm 30mm">');
  }
  function previewPlan(){openView(false);}
  function printPlan(){openView(true);}

  function reset() {
    S.plan = null; S.pics = {}; S.warnings = []; try { localStorage.removeItem(PICS_KEY); localStorage.removeItem(DRAFT_KEY); } catch (e) { /* */ }
    render(); window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ── Word татах ── */
  async function download() {
    const P = attachPics(C.prepareForExport(S.plan)), total = C.totalOf(P);
    if (!C.allSteps(P).length) { toast('Нэг ч алхам алга байна', 'error'); return; }
    if (total !== P.totalMinutes && !confirm('Алхмуудын нийлбэр ' + total + ' минут, нийт хугацаа ' + P.totalMinutes + ' минут байна. Гэсэн ч татах уу?\n(“Хугацааг тэгшлэх” товчоор засаж болно.)')) return;
    if (!window.JSZip) { toast('Word үүсгэх сан ачаалагдсангүй. Интернэтээ шалгаад хуудсыг дахин нээнэ үү.', 'error'); return; }
    try {
      const r = await fetch('lesson-template.docx'); if (!r.ok) throw new Error('Загвар олдсонгүй');
      const blob = await window.LessonDocx.build(P, await r.arrayBuffer(), { JSZip: window.JSZip, DOMParser: window.DOMParser, XMLSerializer: window.XMLSerializer, type: 'blob' });
      const name = ('Ээлжит_хичээлийн_төлөвлөлт_' + (P.grade || '') + '_' + (P.subject || '')).replace(/[\\/:*?"<>|\s]+/g, '_').replace(/_+$/, '') + '.docx';
      const a = h('a', { href: URL.createObjectURL(blob), download: name });
      document.body.append(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    } catch (e) { toast('Word үүсгэж чадсангүй: ' + e.message, 'error'); }
  }

  /* ── эхлүүлэх ── */
  function init() {
    if (!$('lpResult') || !C) return;
    const drop = $('lpDrop');
    $('lpFile').addEventListener('change', e => { addFiles(e.target.files); e.target.value = ''; });
    if ($('lpPdfFile')) $('lpPdfFile').addEventListener('change', e => openBookPdf(e.target.files[0]));
    if ($('lpPdfSelect')) $('lpPdfSelect').addEventListener('click', selectBookPages);
    ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', e => addFiles(e.dataTransfer.files));
    $('lpGo').addEventListener('click', generate);
    if($('lpBuyOpen'))$('lpBuyOpen').addEventListener('click',()=>{$('lpPackages').hidden=!$('lpPackages').hidden;});
    document.querySelectorAll('.lp-package').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.lp-package').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');buyPackage(b.dataset.package);}));
    refreshLessonAccess();
    setInterval(refreshLessonAccess, 60000);
    try {
      const d = localStorage.getItem(DRAFT_KEY);
      if (d) { S.plan = C.prepareForExport(JSON.parse(d)); try { S.pics = JSON.parse(localStorage.getItem(PICS_KEY) || '{}'); } catch (e) { S.pics = {}; } render(); }
    } catch (e) { /* эвдэрсэн ноорог */ }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
