/* Ээлжит хичээлийн төлөвлөлт — сурах бичгийн зураг/эхээс боловсруулж, засаад Word болгон татна. */
(function () {
  'use strict';
  const C = window.LessonCore;
  const DRAFT_KEY = 'shb_lesson_draft_v1';
  const MAX_IMAGES = 10;
  const S = { images: [], plan: null, warnings: [], busy: false, pdf: null, pdfName: '' };
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
    if(data && data.package){const a=data.package;title.textContent='Танд эрх байна';info.textContent=`${a.type==='week7'?'7 хоногийн багц':'5 хуудасны багц'} · Үлдсэн ${a.remainingPages}/${a.totalPages} хуудас · Өнөөдөр ${Math.max(0,a.dailyLimit-a.usedToday)} хуудас ашиглах боломжтой`+(a.expiresAt?' · Дуусах: '+new Date(Number(a.expiresAt)).toLocaleString('mn-MN'): ' · Хугацаагүй');}
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
  function printable(){
    const P=C.prepareForExport(S.plan);let n=1;
    const stages=P.stages.map(st=>`<section><h2>${escHtml(st.name)}</h2>${st.steps.map(x=>`<article><h3>${n++}. ${escHtml(x.title)} <small>(${x.minutes} минут)</small></h3><p><b>Зорилго:</b> ${escHtml(x.goal)}</p><p><b>Багш:</b> ${escHtml(x.teacher)}</p><p><b>Сурагч:</b> ${escHtml(x.student)}</p><p><b>Хэрэглэгдэхүүн:</b> ${escHtml(x.materials)}</p><p><b>Үнэлгээ, үр дүн:</b> ${escHtml(x.result)}</p></article>`).join('')}</section>`).join('');
    return `<!doctype html><html lang="mn"><meta charset="utf-8"><title>Ээлжит хичээлийн төлөвлөлт</title><style>body{font:14px Arial,sans-serif;color:#111;line-height:1.5;max-width:900px;margin:24px auto;padding:0 20px}h1{text-align:center;font-size:22px}h2{border-bottom:1px solid #333;padding-bottom:5px;margin-top:24px}article{page-break-inside:avoid;margin:12px 0 18px}h3{font-size:16px;margin-bottom:6px}p{margin:4px 0}small{font-weight:normal}@media print{body{margin:0 auto}.noprint{display:none}}</style><body><h1>ЭЭЛЖИТ ХИЧЭЭЛИЙН ТӨЛӨВЛӨЛТ</h1><p><b>Анги:</b> ${escHtml(P.grade)}　<b>Судлагдахуун:</b> ${escHtml(P.subject)}　<b>Хугацаа:</b> ${P.totalMinutes} минут</p><p><b>Нэгжийн сэдэв:</b> ${escHtml(P.unitTopic)}</p><p><b>Хичээлийн сэдэв:</b> ${escHtml(P.lessonTopic)}</p><p><b>Зорилго:</b> ${escHtml(P.goal)}</p><p><b>Зорилт:</b><br>${(P.objectives||[]).map(x=>'• '+escHtml(x)).join('<br>')}</p>${stages}<h2>Гэрийн даалгавар</h2><p>${escHtml(P.homework)}</p><h2>Үнэлгээ</h2><p>${(P.assessment||[]).map(escHtml).join('<br>')}</p><div class="noprint"><button onclick="window.print()">Хэвлэх</button></div></body></html>`;
  }
  function previewPlan(){if(!S.plan)return;const w=window.open('','_blank');if(!w){toast('Цонх нээхийг зөвшөөрнө үү','error');return;}w.document.open();w.document.write(printable());w.document.close();}
  function printPlan(){if(!S.plan)return;const w=window.open('','_blank');if(!w){toast('Цонх нээхийг зөвшөөрнө үү','error');return;}w.document.open();w.document.write(printable());w.document.close();w.onload=()=>{w.focus();w.print();};}

  function reset() {
    S.plan = null; S.warnings = []; try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* */ }
    render(); window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ── Word татах ── */
  async function download() {
    const P = C.prepareForExport(S.plan), total = C.totalOf(P);
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
      if (d) { S.plan = C.prepareForExport(JSON.parse(d)); render(); }
    } catch (e) { /* эвдэрсэн ноорог */ }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
