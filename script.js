/* ════════════════════════════════════
   CONSTANTS & STATE
════════════════════════════════════ */
const AUTH_KEY   = 'shb_auth_v2';
const MONG_NUMS  = {'1':'᠑','2':'᠒','3':'᠓','4':'᠔','5':'᠕','6':'᠖','7':'᠗','8':'᠘','9':'᠙'};
const MONG_REV   = Object.fromEntries(Object.entries(MONG_NUMS).map(([k,v])=>[v,k]));
const GAS_URL    = 'https://script.google.com/macros/s/AKfycby1Hsa1TvOLBeuLuHtMTzYfuE8i6HT6fRxfhZqYcXB7tGSnt6-61sPQLwdulKhqf6FldQ/exec';
const SHEET_ID   = '19XbGi1hWULDm2MRjFAG8G0dtlp7tbfN2pJSupKWA6G4';
const SHEET_NAME = 'Products';
const CREDIT_KEY    = 'shb_print_credits';
const FREE_USED_KEY = 'shb_free_used';

let currentUser    = '';
let cartItems      = [];
let authTab        = 'login';
let allProducts    = [];
let sudokuSolution = [];
let sudokuPuzzle   = [];
let _spBuying      = {pages:0,price:0};
let _currentCourseType = '';

/* ════════════════════════════════════
   INIT
════════════════════════════════════ */
/* ════════════════════════════════════
   LOGO — GitHub-аас найдвартай ачаалах
════════════════════════════════════ */
const LOGO_URL = 'https://raw.githubusercontent.com/tuult764-crypto/sonirholtoi-hel-bichig-/main/logo.png';

// Лого ачааллагдахгүй бол дахин оролдоно (3 удаа)
function loadLogoWithRetry(imgEl, attempt) {
  if (!imgEl) return;
  attempt = attempt || 1;
  const ts = Date.now();
  const url = LOGO_URL + '?v=' + ts;

  imgEl.onload = function() {
    imgEl.style.display = 'block';
  };
  imgEl.onerror = function() {
    if (attempt < 3) {
      setTimeout(() => loadLogoWithRetry(imgEl, attempt + 1), 1500);
    } else {
      handleLogoError(imgEl);
    }
  };
  imgEl.src = url;
}

function handleLogoError(imgEl) {
  // Зураг олдохгүй бол emoji fallback
  const wrap = imgEl.parentElement;
  if (!wrap) return;
  const size = imgEl.id === 'navLogo' ? '20px' : '18px';
  imgEl.style.display = 'none';
  if (!wrap.querySelector('.logo-fallback')) {
    const span = document.createElement('span');
    span.className = 'logo-fallback';
    span.style.cssText = `font-size:${size};line-height:1`;
    span.textContent = '📖';
    wrap.appendChild(span);
  }
}

document.addEventListener('DOMContentLoaded',()=>{
  // Лого зургуудыг retry-тай ачаална
  const navLogo    = document.getElementById('navLogo');
  const footerLogo = document.getElementById('footerLogo');
  if (navLogo)    loadLogoWithRetry(navLogo,    1);
  if (footerLogo) loadLogoWithRetry(footerLogo, 1);

  const saved = localStorage.getItem(AUTH_KEY);
  currentUser = saved || '';
  updateNavUser();
  loadProducts();
  initSudoku();
  startWordSearch();
  startReading();
  selectPlayerCount(1);
  updateCreditUI();
});

/* ════════════════════════════════════
   NAVIGATION
════════════════════════════════════ */
function showSec(name){
  document.querySelectorAll('.sec').forEach(s=>s.classList.remove('active'));
  const el=document.getElementById(name+'Section');
  if(el){el.classList.add('active');window.scrollTo(0,0);}
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  const labels={'home':'Нүүр','games':'Тоглоом','training':'Сургалт','shop':'Дэлгүүр'};
  if(labels[name]){document.querySelectorAll('.nav-btn').forEach(b=>{if(b.textContent.includes(labels[name]))b.classList.add('active');});}
  if(name==='library')loadLibrary();
}

/* ════════════════════════════════════
   AUTH — Нэвтрэх / Бүртгүүлэх / Avatar
════════════════════════════════════ */
const USERS_KEY   = 'shb_users_v1';
const AVATAR_KEY  = 'shb_avatar_v1';

// DiceBear avatar seeds — 20 сонголт
const AVATAR_SEEDS = [
  'Tuul','Oyun','Bat','Khuu','Deli','Mogi','Naran','Saran',
  'Gal','Tenger','Urd','Zuun','Barun','Umar','Gobi',
  'Khar','Tsagaan','Ulaan','Nogoon','Khukh'
];
const AVATAR_STYLES = [
  'avataaars','bottts','fun-emoji','pixel-art','adventurer',
  'lorelei','notionists','open-peeps','personas','croodles'
];

function getAvatarUrl(seed, style='avataaars') {
  return `https://api.dicebear.com/7.x/${style}/svg?seed=${encodeURIComponent(seed)}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;
}

function getSavedUsers() {
  try { return JSON.parse(localStorage.getItem(USERS_KEY)||'{}'); } catch{ return {}; }
}
function saveUser(email, data) {
  const users = getSavedUsers();
  users[email] = {...(users[email]||{}), ...data};
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}
function getUser(email) {
  return getSavedUsers()[email] || null;
}

// ── Open/Close ──────────────────────
function openAuth(tab='login') {
  switchTab(tab);
  clearAuthMessages();
  document.getElementById('authModal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}
function closeAuth() {
  document.getElementById('authModal').classList.add('hidden');
  document.body.style.overflow = '';
}

function switchTab(tab) {
  authTab = tab;
  const isLogin = tab === 'login';
  document.getElementById('tabLogin').classList.toggle('active', isLogin);
  document.getElementById('tabReg').classList.toggle('active', !isLogin);
  document.getElementById('loginFields').style.display = isLogin ? '' : 'none';
  document.getElementById('regFields').style.display   = isLogin ? 'none' : '';
  clearAuthMessages();
  if (!isLogin) buildRegAvatarGrid();
}

function showAuthError(msg) {
  const el = document.getElementById('authError');
  el.textContent = msg; el.style.display = 'block';
  document.getElementById('authSuccess').style.display = 'none';
}
function showAuthSuccess(msg) {
  const el = document.getElementById('authSuccess');
  el.textContent = msg; el.style.display = 'block';
  document.getElementById('authError').style.display = 'none';
}
function clearAuthMessages() {
  document.getElementById('authError').style.display = 'none';
  document.getElementById('authSuccess').style.display = 'none';
}

// ── Login ───────────────────────────
function handleAuth() {
  const email = document.getElementById('authEmail').value.trim().toLowerCase();
  const pass  = document.getElementById('authPass').value;
  if (!email || !email.includes('@')) { showAuthError('Зөв и-мэйл хаяг оруулна уу.'); return; }
  if (pass.length < 6) { showAuthError('Нууц үг хамгийн багадаа 6 тэмдэгт байна.'); return; }

  const user = getUser(email);
  if (!user) { showAuthError('И-мэйл бүртгэлгүй байна. Бүртгүүлнэ үү.'); return; }
  if (user.pass !== btoa(pass)) { showAuthError('Нууц үг буруу байна.'); return; }

  loginSuccess(email, user);
}

// ── Register ────────────────────────
let _selectedRegAvatar = AVATAR_SEEDS[0];
let _selectedRegStyle  = AVATAR_STYLES[0];

function buildRegAvatarGrid() {
  const grid = document.getElementById('regAvatarGrid');
  if (!grid || grid.children.length) return; // already built
  AVATAR_SEEDS.slice(0,10).forEach((seed,i) => {
    const style = AVATAR_STYLES[i % AVATAR_STYLES.length];
    const div = document.createElement('div');
    div.style.cssText = 'border-radius:12px;border:2.5px solid var(--border);cursor:pointer;overflow:hidden;aspect-ratio:1;background:var(--surface2);transition:all .18s';
    div.onclick = () => {
      document.querySelectorAll('#regAvatarGrid > div').forEach(d => {
        d.style.borderColor = 'var(--border)'; d.style.transform = '';
      });
      div.style.borderColor = 'var(--amber)';
      div.style.transform = 'scale(1.08)';
      _selectedRegAvatar = seed; _selectedRegStyle = style;
    };
    const img = document.createElement('img');
    img.src = getAvatarUrl(seed, style);
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block';
    div.appendChild(img);
    grid.appendChild(div);
    if (i === 0) { div.style.borderColor = 'var(--amber)'; div.style.transform = 'scale(1.08)'; }
  });
}

function handleRegister() {
  const name  = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim().toLowerCase();
  const pass  = document.getElementById('regPass').value;
  const pass2 = document.getElementById('regPass2').value;

  if (!name)                       { showAuthError('Нэрээ оруулна уу.'); return; }
  if (!email.includes('@'))        { showAuthError('Зөв и-мэйл хаяг оруулна уу.'); return; }
  if (pass.length < 6)             { showAuthError('Нууц үг хамгийн багадаа 6 тэмдэгт байна.'); return; }
  if (pass !== pass2)              { showAuthError('Нууц үг тохирохгүй байна.'); return; }
  if (getUser(email))              { showAuthError('Энэ и-мэйл аль хэдийн бүртгэлтэй байна.'); return; }

  saveUser(email, {
    name, pass: btoa(pass),
    avatarSeed: _selectedRegAvatar,
    avatarStyle: _selectedRegStyle,
    createdAt: Date.now()
  });
  showAuthSuccess('✅ Бүртгэл амжилттай! Нэвтэрч байна...');
  setTimeout(() => loginSuccess(email, getUser(email)), 1000);
}

function loginSuccess(email, user) {
  currentUser = email;
  localStorage.setItem(AUTH_KEY, email);
  // Save avatar preference
  if (user.avatarSeed) {
    localStorage.setItem(AVATAR_KEY, JSON.stringify({seed: user.avatarSeed, style: user.avatarStyle||'avataaars'}));
  }
  updateNavUser();
  closeAuth();
  showToast(`👋 Сайн байна уу, ${user.name || email.split('@')[0]}!`, 'success');
}

function logout() {
  localStorage.removeItem(AUTH_KEY);
  currentUser = '';
  updateNavUser();
  showToast('Гарлаа. Дараа уулзацгаая! 👋', 'success');
}

function handleForgot() {
  showAuthSuccess('📧 Нууц үг сэргээх холбоос тан руу илгээгдэх болно.');
}

// ── Nav user display ─────────────────
function updateNavUser() {
  const guest   = document.getElementById('navGuest');
  const pill    = document.getElementById('navUserPill');
  const avatarEl= document.getElementById('userAvatar');
  const labelEl = document.getElementById('userLabel');
  const nameEl  = document.getElementById('menuUserName');
  const emailEl = document.getElementById('menuUserEmail');

  if (currentUser && currentUser !== 'guest@shb.mn') {
    // Logged in
    if (guest) guest.style.display = 'none';
    if (pill)  pill.style.display  = 'flex';

    const user = getUser(currentUser) || {};
    const saved = (() => { try { return JSON.parse(localStorage.getItem(AVATAR_KEY)||'null'); } catch{ return null; } })();
    const seed  = saved?.seed  || user.avatarSeed  || currentUser.split('@')[0];
    const style = saved?.style || user.avatarStyle || 'avataaars';

    if (avatarEl) { avatarEl.src = getAvatarUrl(seed, style); }
    if (labelEl)  { labelEl.textContent = (user.name || currentUser.split('@')[0]).substring(0,12); }
    if (nameEl)   { nameEl.textContent  = user.name || currentUser.split('@')[0]; }
    if (emailEl)  { emailEl.textContent = currentUser; }
  } else {
    // Guest
    if (guest) guest.style.display = 'flex';
    if (pill)  pill.style.display  = 'none';
  }
}

// ── Avatar picker (profile edit) ─────
let _pickerSelected = null;

function openAvatarPicker(e) {
  if (e) e.stopPropagation();
  const grid = document.getElementById('avatarGrid');
  if (!grid) return;

  // Get current
  const saved = (() => { try { return JSON.parse(localStorage.getItem(AVATAR_KEY)||'null'); } catch{ return null; } })();
  const curSeed  = saved?.seed  || 'default';
  const curStyle = saved?.style || 'avataaars';
  _pickerSelected = { seed: curSeed, style: curStyle };

  // Build grid: 4 styles × 5 seeds = 20 options
  grid.innerHTML = '';
  const picks = [];
  AVATAR_STYLES.slice(0,4).forEach(style => {
    AVATAR_SEEDS.slice(0,5).forEach(seed => picks.push({seed, style}));
  });

  picks.forEach(({seed, style}) => {
    const div = document.createElement('div');
    const isCur = seed === curSeed && style === curStyle;
    div.className = 'avatar-opt' + (isCur ? ' selected' : '');
    div.onclick = () => {
      document.querySelectorAll('.avatar-opt').forEach(d => d.classList.remove('selected'));
      div.classList.add('selected');
      _pickerSelected = {seed, style};
    };
    const img = document.createElement('img');
    img.src = getAvatarUrl(seed, style);
    img.alt = seed;
    div.appendChild(img);
    grid.appendChild(div);
  });

  document.getElementById('avatarModal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeAvatarPicker() {
  document.getElementById('avatarModal').classList.add('hidden');
  document.body.style.overflow = '';
}

function confirmAvatar() {
  if (!_pickerSelected) { closeAvatarPicker(); return; }
  localStorage.setItem(AVATAR_KEY, JSON.stringify(_pickerSelected));
  // Also update in user record
  if (currentUser) {
    saveUser(currentUser, { avatarSeed: _pickerSelected.seed, avatarStyle: _pickerSelected.style });
  }
  updateNavUser();
  closeAvatarPicker();
  showToast('✅ Профайл дүрс шинэчлэгдлээ!', 'success');
}


/* ════════════════════════════════════
   TRAINING SECTION
════════════════════════════════════ */
const COURSE_DATA = {
  writing: {
    icon:'✍️',
    color:'#fef3c7',
    title:'Алдаагүй бичиж сурцгаая',
    subtitle:'21 хоног тасралтгүй · 50,000₮ · Макс 10 суралцагч',
    desc:'Тасралтгүй 21 хоногийн онлайн сургалт. Цээж бичиг бичүүлж, алдааг дараа өдөр нь засан тохирох дүрмийн хичээлийн бичлэг илгээнэ. Нэмэлтээр ажлын хуудас өгч, даалгавар шалган дахин цээж бичгээр хичээл дуусгана. Насны хязгааргүй.',
    features:[
      {icon:'📝', text:'Цээж бичиг', sub:'Алдааг дараа өдөр засна'},
      {icon:'🎬', text:'Дүрмийн бичлэг', sub:'Тохирох дүрэм бүрт'},
      {icon:'📄', text:'Ажлын хуудас', sub:'Нэмэлт дасгал даалгавар'},
      {icon:'✅', text:'Шалгалт', sub:'Дахин цээж бичгээр дуусгана'},
    ],
    hasSchedule: false,
    hasAge: false,
    priceNote:'50,000₮ — 21 хоногийн бүрэн сургалт',
    priceFull:'50,000₮',
    priceSub:'21 хоног тасралтгүй'
  },
  homework: {
    icon:'📝',
    color:'#fdf4ff',
    title:'Гэрийн даалгаврын сургалт багштай хамтран',
    subtitle:'50,000₮ анхны хямдрал · Ганцаарчилсан Meet · Цагт 2 сурагч',
    desc:'Онлайн ганцаарчилсан Meet уулзалт. Да·Мя·Лх·Пү·Ба хичээл явагдана. Бямба, Нямд бүртгэл авна. Бүртгэхдээ анги болон хичээлийн цагаа сонгоно — багш цагийг үзээд зөвшөөрвөл баталгаажна. Цаг бүрт 2 сурагч л бүртгэгдэх тул эрт бүртгүүлэхийг зөвлөнө.',
    features:[
      {icon:'💻', text:'Онлайн Meet', sub:'Ганцаарчилсан хичээл'},
      {icon:'📅', text:'Да·Мя·Лх·Пү·Ба', sub:'Хичээлийн өдрүүд'},
      {icon:'✏️', text:'Бямба·Нямд бүртгэл', sub:'Долоо хоног бүр нээнэ'},
      {icon:'👤', text:'Цагт 2 сурагч', sub:'Дүүрсэн бол хаагдана'},
    ],
    hasSchedule: true,
    hasAge: false,
    priceNote:'50,000₮ — Анхны хямдаралтай үнэ / сар',
    priceFull:'50,000₮',
    priceSub:'сар / анхны хямдрал'
  },
  reading: {
    icon:'📖',
    color:'#f0fdf4',
    title:'Унших чадвараа сайжруулцгаая',
    subtitle:'99,000₮ · 21 хоног Meet · Ангилалт бүрт 3 суралцагч',
    desc:'Meet уулзалт · 21 хоног тасралтгүй. Насны ангиллаар бүртгэнэ — ангилал тус бүрт 3 сурагч л, дүүрвэл хаагдана. Хурдан уншиж яриулах, эхийг дахин уншиж мэдэрч унших, зогсолттой ойлгомжтой унших, гол санааг тайлбарлах арга эзэмшинэ. Аргачлалыг дотоодод хадгалдаг тул зөвхөн хичээлийн явцад эзэмшинэ.',
    features:[
      {icon:'⚡', text:'Хурдан унших', sub:'Яриулах дасгалтай'},
      {icon:'🔄', text:'Дахин уншиж ярих', sub:'Ойлголтоо бататгана'},
      {icon:'❤️', text:'Мэдэрч унших', sub:'Зогсолттой, ойлгомжтой'},
      {icon:'💬', text:'Гол санаа тайлбарлах', sub:'Бусдад хүргэх чадвар'},
    ],
    hasSchedule: false,
    hasAge: true,
    priceNote:'99,000₮ — 21 хоногийн Meet сургалт',
    priceFull:'99,000₮',
    priceSub:'21 хоног · насны ангиллаар'
  },
  script: {
    icon:'ᠮ',
    color:'#ede9fe',
    title:'Үндэсний бичгийн анхан шатны сургалт',
    subtitle:'99,000₮ · Meet уулзалт · Макс 10 суралцагч · 20% Cashback',
    desc:'Meet уулзалт · Анхан шатны сургалт. Сургалтын материал болон эх бүгд хичээлийн явцад багшаас гарна — тусгайлан худалдаж авах шаардлагагүй. Макс 10 суралцагч. Нэг ч өдөр тасалдалгүй даалгавраа бүрэн гүйцэт хийж, хичээлийн үед дүрсээ асааж ярьсан тохиолдолд 20% cashback буцаагдана!',
    features:[
      {icon:'💻', text:'Meet уулзалт', sub:'Онлайн бүлгийн хичээл'},
      {icon:'📄', text:'Материал бүгд дотроос', sub:'Тусгай зардал байхгүй'},
      {icon:'👤', text:'Макс 10 суралцагч', sub:'Цөөн, анхаарал хангалттай'},
      {icon:'🎁', text:'20% Cashback', sub:'Тасралтгүй идэвхтэй бол'},
    ],
    hasSchedule: false,
    hasAge: false,
    priceNote:'99,000₮ — Cashback-тэй бол 79,200₮',
    priceFull:'99,000₮',
    priceSub:'Cashback-тэй бол 79,200₮'
  }
};

function filterTraining(cat, btn) {
  document.querySelectorAll('.tr-flt-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.course-card').forEach(card=>{
    if(cat==='all'||card.dataset.cat===cat){card.style.display='';}
    else{card.style.display='none';}
  });
}

function openCourseDetail(type) {
  _currentCourseType = type;
  const d = COURSE_DATA[type];
  if(!d) return;

  document.getElementById('cmHeaderContent').innerHTML = `
    <div style="display:flex;align-items:center;gap:14px">
      <div style="width:56px;height:56px;border-radius:16px;background:${d.color};display:flex;align-items:center;justify-content:center;font-size:28px;flex-shrink:0">${d.icon}</div>
      <div>
        <div style="font-size:18px;font-weight:800;color:#fff;font-family:'Baloo 2',cursive;line-height:1.2">${d.title}</div>
        <div style="font-size:11px;color:rgba(255,255,255,.6);margin-top:4px">${d.subtitle}</div>
      </div>
    </div>`;

  const ageSection = d.hasAge ? `
    <div style="margin-bottom:20px">
      <div style="font-size:13px;font-weight:800;margin-bottom:10px">👶 Насны бүлэг — ангилалт бүрт 3 суралцагч</div>
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px">
        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:10px;text-align:center"><div style="font-size:13px;font-weight:800;color:#1d4ed8">6–9 нас</div><div style="font-size:9px;color:#3b82f6;margin-top:2px">Бага ангийн дунд</div></div>
        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:10px;text-align:center"><div style="font-size:13px;font-weight:800;color:#1d4ed8">10–13 нас</div><div style="font-size:9px;color:#3b82f6;margin-top:2px">Ахлах бага анги</div></div>
        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:10px;text-align:center"><div style="font-size:13px;font-weight:800;color:#1d4ed8">14–17 нас</div><div style="font-size:9px;color:#3b82f6;margin-top:2px">Дунд сургуулийн</div></div>
        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:10px;text-align:center"><div style="font-size:13px;font-weight:800;color:#1d4ed8">18+ нас</div><div style="font-size:9px;color:#3b82f6;margin-top:2px">Насанд хүрэгч</div></div>
      </div>
      <div style="background:#fef9f0;border-radius:10px;padding:9px 12px;font-size:10px;color:#92400e;margin-top:8px;line-height:1.5">⚠️ Ангилалт бүрт <strong>3 сурагч</strong> л. Дүүрсэн бол тухайн ангилал хаагдана.</div>
    </div>` : '';

  const cashbackSection = (type==='script') ? `
    <div style="background:linear-gradient(135deg,#1c1917,#292524);border-radius:16px;padding:18px;margin-bottom:16px">
      <div style="font-size:12px;font-weight:800;color:#fbbf24;margin-bottom:8px">🎁 20% CASHBACK УРАМШУУЛАЛ</div>
      <div style="font-size:11px;color:rgba(255,255,255,.75);line-height:1.8;margin-bottom:10px">Дараах 2 нөхцөлийг давхар биелүүлсэн тохиолдолд <strong style="color:#fbbf24">19,800₮</strong> буцаагдана:</div>
      <div style="display:flex;flex-direction:column;gap:7px">
        <div style="background:rgba(255,255,255,.08);border-radius:10px;padding:9px 12px;display:flex;align-items:center;gap:10px">
          <span style="font-size:18px">✅</span>
          <div style="font-size:10px;color:rgba(255,255,255,.8);line-height:1.5"><strong style="color:#fff">Нэг ч өдөр тасалдалгүй</strong> сургалтаас өгсөн даалгаврыг бүрэн гүйцэт хийсэн байх</div>
        </div>
        <div style="background:rgba(255,255,255,.08);border-radius:10px;padding:9px 12px;display:flex;align-items:center;gap:10px">
          <span style="font-size:18px">📹</span>
          <div style="font-size:10px;color:rgba(255,255,255,.8);line-height:1.5">Хичээлийн үед <strong style="color:#fff">дүрсээ асааж ярьсан</strong> байх</div>
        </div>
      </div>
    </div>` : '';

  const schedSection = (type==='homework') ? `
    <div style="margin-bottom:20px">
      <div style="font-size:13px;font-weight:800;margin-bottom:10px">🕐 Хичээлийн цагийн сонголт</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px">
        <div style="background:#1c1917;color:#fff;border-radius:12px;padding:12px 8px;text-align:center"><div style="font-size:16px;font-weight:800">19:00</div><div style="font-size:9px;opacity:.6;margin-top:3px">Орой</div></div>
        <div style="background:#1c1917;color:#fff;border-radius:12px;padding:12px 8px;text-align:center"><div style="font-size:16px;font-weight:800">20:00</div><div style="font-size:9px;opacity:.6;margin-top:3px">Орой</div></div>
        <div style="background:#1c1917;color:#fff;border-radius:12px;padding:12px 8px;text-align:center"><div style="font-size:16px;font-weight:800">21:00</div><div style="font-size:9px;opacity:.6;margin-top:3px">Орой</div></div>
      </div>
      <div style="background:#fef9f0;border-radius:10px;padding:9px 12px;font-size:10px;color:#92400e;line-height:1.6">
        ⚠️ Цаг бүрт <strong>2 сурагч</strong> л бүртгэгдэнэ. Дүүрсэн цаг автоматаар хаагдана.<br>
        📌 Хичээл: <strong>Да·Мя·Лх·Пү·Ба</strong> · Бүртгэл: <strong>Бямба·Нямд</strong>
      </div>
    </div>` : '';

  document.getElementById('cmBody').innerHTML = `
    <p style="font-size:13px;color:var(--mid);line-height:1.8;margin-bottom:20px">${d.desc}</p>
    <div class="cm-features">
      ${d.features.map(f=>`<div class="cm-feature"><div class="cf-icon">${f.icon}</div><div><div class="cf-text">${f.text}</div><div class="cf-sub">${f.sub}</div></div></div>`).join('')}
    </div>
    ${ageSection}
    ${cashbackSection}
    ${schedSection}
    <div style="background:#1c1917;border-radius:14px;padding:16px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between">
      <div><div style="font-size:10px;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:.1em;margin-bottom:3px">Үнэ</div><div style="font-size:24px;font-weight:800;color:#fbbf24;font-family:'Baloo 2',cursive">${d.priceFull||d.priceNote}</div><div style="font-size:10px;color:rgba(255,255,255,.5);margin-top:2px">${d.priceSub||''}</div></div>
      <div style="font-size:32px">💳</div>
    </div>
    <button onclick="closeCourseModal();openCoursePayModal('${type}')" class="btn-p" style="width:100%;padding:14px;font-size:14px;border-radius:14px;font-weight:800">🎓 Одоо бүртгүүлэх →</button>
    <button onclick="closeCourseModal()" style="width:100%;padding:10px;margin-top:8px;background:none;border:none;font-size:11px;color:#aaa;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif">Хаах</button>`;

  document.getElementById('courseModal').classList.remove('hidden');
}

function closeCourseModal() {
  document.getElementById('courseModal').classList.add('hidden');
}

/* ── COURSE ENROLL PAY MODAL ── */
function openCoursePayModal(type) {
  _currentCourseType = type;
  const d = COURSE_DATA[type];
  if(!d) return;
  document.getElementById('cpTitle').textContent = d.title;
  document.getElementById('cpSubtitle').textContent = d.priceSub || d.subtitle;
  document.getElementById('cpAmt').textContent = d.priceFull || d.priceNote;
  document.getElementById('cpEmail').value = currentUser !== 'guest@shb.mn' ? currentUser : '';
  // Show/hide schedule picker
  const sw = document.getElementById('cpSchedWrap');
  if(sw) sw.style.display = d.hasSchedule ? 'block' : 'none';
  // Show/hide time slot picker (homework only)
  const tw = document.getElementById('cpTimeWrap');
  if(tw) tw.style.display = (type==='homework') ? 'block' : 'none';
  // Reset time slot selections
  document.querySelectorAll('.cp-time-btn').forEach(b=>b.classList.remove('active'));
  cpGoStep1();
  document.getElementById('coursePayModal').classList.remove('hidden');
}

function closeCoursePayModal() {
  document.getElementById('coursePayModal').classList.add('hidden');
  cpGoStep1();
}

function cpGoStep1(){['cpStep1','cpStep2','cpStep3'].forEach((id,i)=>document.getElementById(id).style.display=i===0?'':'none');}
function cpGoStep2(){['cpStep1','cpStep2','cpStep3'].forEach((id,i)=>document.getElementById(id).style.display=i===1?'':'none');}

function toggleSchedBtn(btn){btn.classList.toggle('active');}

function selectTimeSlot(btn) {
  // Only one time slot at a time
  document.querySelectorAll('.cp-time-btn').forEach(b=>{
    b.classList.remove('active');
    b.style.borderColor='var(--border)';
    b.style.background='#fff';
    b.style.color='var(--mid)';
  });
  btn.classList.add('active');
  btn.style.borderColor='var(--amber)';
  btn.style.background='var(--amber-l)';
  btn.style.color='var(--amber-d)';
}

async function cpSubmit() {
  const name  = document.getElementById('cpName').value.trim();
  const email = document.getElementById('cpEmail').value.trim();
  const phone = document.getElementById('cpPhone').value.trim();
  const age   = document.getElementById('cpChildAge').value.trim();
  const note  = document.getElementById('cpNote').value.trim();
  const grade = document.getElementById('cpGrade') ? document.getElementById('cpGrade').value.trim() : '';

  if(!name){showToast('Нэрээ оруулна уу','error');return;}
  if(!email||!email.includes('@')){showToast('Зөв и-мэйл хаяг оруулна уу','error');return;}

  const schedDays = [...document.querySelectorAll('.sched-sel-btn.active')].map(b=>b.textContent).join(', ');
  const timeSlot  = [...document.querySelectorAll('.cp-time-btn.active')].map(b=>b.dataset.time).join(', ') || '';
  const d = COURSE_DATA[_currentCourseType]||{};

  const btn = document.getElementById('cpSubmitBtn');
  btn.disabled=true;btn.textContent='⏳ Илгээж байна...';

  try {
    await fetch(GAS_URL,{method:'POST',mode:'no-cors',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        action:'submitOrder',
        email,
        note:`Сургалт: ${d.title} | Нэр: ${name} | Утас: ${phone} | Нас: ${age} | Анги: ${grade} | Хуваарь: ${schedDays} | Цаг: ${timeSlot} | ${note}`,
        total: d.priceFull ? parseInt(d.priceFull.replace(/[^0-9]/g,'')) : 0,
        items:`Сургалтын бүртгэл: ${d.title} — ${d.priceFull||''}`,
        date:new Date().toLocaleString('mn-MN')
      })
    });
    document.getElementById('cpConfirmName').textContent = name;
    ['cpStep1','cpStep2','cpStep3'].forEach((id,i)=>document.getElementById(id).style.display=i===2?'':'none');
    showToast('Бүртгэл амжилттай илгээгдлээ!','success');
  } catch(e) {
    showToast('Сүлжээний алдаа. Дахин оролдоно уу.','error');
  }
  btn.disabled=false;btn.textContent='🚀 Бүртгэл илгээх';
}

/* ════════════════════════════════════
   PRODUCTS / SHOP
════════════════════════════════════ */
function parseGvizJson(raw){return JSON.parse(raw.replace(/^[^(]+\(/,'').replace(/\);?\s*$/,''));}
async function loadProducts(){
  ['shopGrid','dashGrid'].forEach(id=>{const g=document.getElementById(id);if(g)g.innerHTML=`<div style="grid-column:1/-1;text-align:center;padding:44px;color:#bbb"><div style="width:32px;height:32px;border:3px solid var(--border);border-top-color:var(--amber);border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 12px"></div><p style="font-size:12px;font-weight:600">Ачааллаж байна...</p></div>`;});
  try{
    const url=`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(SHEET_NAME)}`;
    const resp=await fetch(url);if(!resp.ok)throw new Error();
    const gviz=parseGvizJson(await resp.text());
    const cols=gviz.table.cols,rows=gviz.table.rows;
    function findCol(...names){const lc=names.map(n=>n.toLowerCase().trim());for(let i=0;i<cols.length;i++){const l=(cols[i].label||cols[i].id||'').toLowerCase().trim();if(lc.some(n=>l.includes(n)||n.includes(l)))return i;}return -1;}
    const CI={title:Math.max(0,findCol('title','гарчиг','нэр')),desc:Math.max(1,findCol('description','тайлбар')),price:Math.max(2,findCol('price','үнэ','дүн')),img:Math.max(3,findCol('images','зураг','image')),type:Math.max(4,findCol('type','төрөл')),link:Math.max(5,findCol('link','холбоос','url'))};
    const safeVal=c=>!c?'':String(c.f!=null?c.f:(c.v??'')).trim();
    const safeNum=c=>(!c||c.v==null)?0:Number(c.v)||0;
    allProducts=rows.filter(r=>r.c&&r.c[CI.title]&&(r.c[CI.title].v||r.c[CI.title].f)).map((r,i)=>{
      const c=r.c,type=safeVal(c[CI.type]),price=safeNum(c[CI.price]),free=price===0||['free','free-sample'].includes(type.toLowerCase());
      return{id:i+1,title:safeVal(c[CI.title]),desc:safeVal(c[CI.desc]),price,type,cat:free?'Үнэгүй':'Төлбөртэй',icon:free?'🎁':'📝',link:safeVal(c[CI.link]),img:safeVal(c[CI.img])};
    });
    renderProducts(allProducts,'shopGrid');renderProducts(allProducts,'dashGrid');
  }catch(e){
    const err=`<div style="grid-column:1/-1;text-align:center;padding:44px;color:#bbb"><p style="font-size:12px;font-weight:600;margin-bottom:8px">⚠️ Бүтээгдэхүүн ачаалах боломжгүй.</p><button class="btn-p" style="margin-top:14px;font-size:11px" onclick="loadProducts()">🔄 Дахин</button></div>`;
    ['shopGrid','dashGrid'].forEach(id=>{const g=document.getElementById(id);if(g)g.innerHTML=err;});
  }
}
function isFreeP(p){return p.price===0||['free','free-sample'].includes((p.type||'').toLowerCase().trim());}
function driveDownloadUrl(link){if(!link)return'';const m1=link.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);if(m1)return`https://drive.google.com/uc?export=download&id=${m1[1]}`;const m2=link.match(/[?&]id=([a-zA-Z0-9_-]+)/);if(m2)return`https://drive.google.com/uc?export=download&id=${m2[1]}`;return link;}
function productImgHTML(p){if(p.img){const fn=p.img.split(',')[0].trim();if(fn){const url=`https://raw.githubusercontent.com/tuult764-crypto/sonirholtoi-hel-bichig-/main/${encodeURIComponent(fn)}`;return`<img src="${url}" alt="${p.title}" style="width:100%;height:100%;object-fit:cover;display:block" onerror="this.style.display='none';this.nextSibling.style.display='flex'"><span style="display:none;font-size:44px;width:100%;height:100%;align-items:center;justify-content:center">${p.icon}</span>`;}}return`<span style="font-size:44px">${p.icon}</span>`;}
function renderProducts(prods,gridId){
  const grid=document.getElementById(gridId);if(!grid)return;
  if(!prods.length){grid.innerHTML=`<div style="grid-column:1/-1;text-align:center;padding:44px;color:#bbb"><p style="font-size:12px;font-weight:600">Бүтээгдэхүүн олдсонгүй</p></div>`;return;}
  grid.innerHTML=prods.map(p=>{
    const free=isFreeP(p),dlUrl=driveDownloadUrl(p.link);
    const actionBtn=free?(dlUrl?`<a href="${dlUrl}" target="_blank" rel="noopener" style="display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:9px;background:#d1fae5;color:#065f46;font-size:14px;text-decoration:none;flex-shrink:0" download>⬇</a>`:''):`<button class="add-cart" onclick="openPreview(allProducts.find(x=>x.id===${p.id}))" title="Жишээ" style="font-size:13px">👁</button><button class="add-cart" onclick="addToCart(${p.id})">🛒</button>`;
    const badgeStyle=free?'background:#d1fae5;color:#065f46':'background:rgba(255,255,255,.92);color:var(--dark)';
    const cardBorder=free?'border:2px solid #a7f3d0':'border:1px solid var(--border)';
    return`<div class="prod-card" style="${cardBorder}">
      <div class="prod-img" style="overflow:hidden;position:relative">${productImgHTML(p)}<span class="prod-badge" style="${badgeStyle}">${free?'🎁 Үнэгүй':p.cat}</span></div>
      <div class="prod-body">
        <div class="prod-title" title="${p.desc||p.title}">${p.title}</div>
        ${p.desc?`<div style="font-size:10px;color:var(--mid);margin-bottom:10px;line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${p.desc}</div>`:''}
        <div class="prod-foot">
          <span class="prod-price" style="${free?'color:#065f46':''}">${free?'🆓 ҮНЭГҮЙ':p.price.toLocaleString()+'₮'}</span>
          <div style="display:flex;gap:5px;align-items:center">${actionBtn}</div>
        </div>
        ${free&&dlUrl?`<a href="${dlUrl}" target="_blank" rel="noopener" download style="display:block;margin-top:9px;text-align:center;background:var(--green);color:#fff;padding:8px;border-radius:11px;font-size:11px;font-weight:700;text-decoration:none">⬇ Татаж авах</a>`:''}
      </div></div>`;
  }).join('');
}
function filterShop(cat,btn){document.querySelectorAll('.flt-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');const f=cat==='all'?allProducts:allProducts.filter(p=>p.cat===cat);renderProducts(f,'shopGrid');}
function openPreview(p){
  if(!p)return;const imgs=(p.img||'').split(',').map(s=>s.trim()).filter(Boolean);
  if(!imgs.length){showToast('Жишээ зураг байхгүй','error');return;}
  const slides=imgs.map((name,i)=>{const url=`https://raw.githubusercontent.com/tuult764-crypto/sonirholtoi-hel-bichig-/main/${encodeURIComponent(name)}`;return`<div class="preview-slide" style="display:${i===0?'flex':'none'};align-items:center;justify-content:center;width:100%;height:100%"><img src="${url}" alt="${name}" style="max-width:100%;max-height:100%;object-fit:contain;border-radius:10px"></div>`;}).join('');
  const dots=imgs.length>1?`<div style="display:flex;gap:5px;justify-content:center;margin-top:10px">${imgs.map((_,i)=>`<button onclick="previewGoTo(${i})" id="pdot${i}" style="width:7px;height:7px;border-radius:50%;border:none;cursor:pointer;background:${i===0?'var(--amber)':'#ddd'};padding:0;transition:all .2s"></button>`).join('')}</div>`:'';
  const nav=imgs.length>1?`<button onclick="previewNav(-1)" style="position:absolute;left:7px;top:50%;transform:translateY(-50%);background:rgba(0,0,0,.4);color:#fff;border:none;border-radius:50%;width:34px;height:34px;font-size:17px;cursor:pointer;z-index:2">‹</button><button onclick="previewNav(1)" style="position:absolute;right:7px;top:50%;transform:translateY(-50%);background:rgba(0,0,0,.4);color:#fff;border:none;border-radius:50%;width:34px;height:34px;font-size:17px;cursor:pointer;z-index:2">›</button>`:'';
  document.getElementById('previewModalBody').innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">
      <div><div style="font-size:15px;font-weight:800">${p.title}</div><div style="font-size:11px;color:var(--mid);margin-top:3px">${p.desc||''}</div></div>
      <button onclick="closePreviewModal()" style="background:#f5f5f5;border:none;border-radius:50%;width:30px;height:30px;font-size:14px;cursor:pointer;flex-shrink:0;margin-left:10px">✕</button>
    </div>
    <div style="position:relative;background:#f5ede0;border-radius:14px;height:380px;overflow:hidden;display:flex;align-items:center;justify-content:center">
      <div id="previewSlides" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center">${slides}</div>${nav}</div>
    ${dots}
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px">
      <div style="font-size:17px;font-weight:800;color:var(--amber)">${p.price.toLocaleString()}₮</div>
      <button onclick="closePreviewModal();addToCart(${p.id})" class="btn-p" style="padding:9px 22px">🛒 Сагсанд нэмэх</button>
    </div>`;
  window._previewIdx=0;window._previewTotal=imgs.length;
  document.getElementById('previewModal').classList.remove('hidden');
}
function previewNav(dir){const t=window._previewTotal||0;if(t<=1)return;const slides=document.querySelectorAll('.preview-slide'),dots=document.querySelectorAll('[id^="pdot"]');slides[window._previewIdx].style.display='none';if(dots[window._previewIdx])dots[window._previewIdx].style.background='#ddd';window._previewIdx=(window._previewIdx+dir+t)%t;slides[window._previewIdx].style.display='flex';if(dots[window._previewIdx])dots[window._previewIdx].style.background='var(--amber)';}
function previewGoTo(idx){const slides=document.querySelectorAll('.preview-slide'),dots=document.querySelectorAll('[id^="pdot"]');slides[window._previewIdx].style.display='none';if(dots[window._previewIdx])dots[window._previewIdx].style.background='#ddd';window._previewIdx=idx;slides[window._previewIdx].style.display='flex';if(dots[window._previewIdx])dots[window._previewIdx].style.background='var(--amber)';}
function closePreviewModal(){document.getElementById('previewModal').classList.add('hidden');}

/* ── CART & PAY ── */
function addToCart(id){const p=allProducts.find(x=>x.id===id);if(!p)return;if(isFreeP(p)){const dl=driveDownloadUrl(p.link);if(dl)window.open(dl,'_blank','noopener');else showToast('Татах холбоос байхгүй','error');return;}if(cartItems.find(x=>x.id===id)){showToast('Аль хэдийн сагсанд байна','error');return;}cartItems.push(p);document.getElementById('cartBadge').textContent=cartItems.length;showToast(`"${p.title}" сагсанд нэмэгдлээ`,'success');}
function openCart(){if(!cartItems.length){showToast('Сагс хоосон байна','error');return;}const total=cartItems.reduce((s,p)=>s+p.price,0);document.getElementById('payAmount').textContent=total.toLocaleString()+'₮';document.getElementById('payItemList').innerHTML=cartItems.map(p=>`• ${p.title} — ${p.price===0?'Үнэгүй':p.price.toLocaleString()+'₮'}`).join('<br>');document.getElementById('payEmail').value=currentUser;goToStep1();document.getElementById('payModal').classList.remove('hidden');}
function goToStep1(){['payStep1','payStep2','payStep3'].forEach((id,i)=>document.getElementById(id).style.display=i===0?'':'none');}
function goToStep2(){['payStep1','payStep2','payStep3'].forEach((id,i)=>document.getElementById(id).style.display=i===1?'':'none');}
function closePayment(){document.getElementById('payModal').classList.add('hidden');goToStep1();}
async function submitOrder(){
  const email=document.getElementById('payEmail').value.trim(),note=document.getElementById('payNote').value.trim();
  if(!email||!email.includes('@')){showToast('Зөв и-мэйл хаяг оруулна уу','error');return;}
  const btn=document.getElementById('submitOrderBtn');btn.disabled=true;btn.textContent='⏳ Илгээж байна...';
  const total=cartItems.reduce((s,p)=>s+p.price,0);
  try{await fetch(GAS_URL,{method:'POST',mode:'no-cors',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'submitOrder',email,note,total,items:cartItems.map(p=>p.title).join(', '),itemLinks:cartItems.map(p=>p.link||'').join(', '),date:new Date().toLocaleString('mn-MN')})});
    document.getElementById('confirmEmail').textContent=email;
    ['payStep1','payStep2','payStep3'].forEach((id,i)=>document.getElementById(id).style.display=i===2?'':'none');
    cartItems=[];document.getElementById('cartBadge').textContent='0';
  }catch(e){showToast('Сүлжээний алдаа. Дахин оролдоно уу.','error');}
  btn.disabled=false;btn.textContent='🚀 Захиалга илгээх';
}

/* ── LIBRARY ── */
async function loadLibrary(){
  const grid=document.getElementById('libraryGrid'),status=document.getElementById('libStatus');
  grid.innerHTML=`<div style="grid-column:1/-1;text-align:center;padding:44px"><div style="width:32px;height:32px;border:3px solid var(--border);border-top-color:var(--amber);border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 12px"></div><p style="font-size:12px;font-weight:600;color:#bbb">Шалгаж байна...</p></div>`;
  status.style.display='none';
  try{
    const resp=await fetch(GAS_URL+'?action=getApproved&email='+encodeURIComponent(currentUser));
    const data=await resp.json();
    if(!data||!data.length){grid.innerHTML=`<div style="grid-column:1/-1;text-align:center;padding:56px;color:#bbb"><div style="font-size:44px;margin-bottom:12px">📭</div><p style="font-size:13px;font-weight:600">Баталгаажсан захиалга байхгүй байна.</p><button class="btn-p" style="margin-top:18px" onclick="showSec('shop')">Дэлгүүрт очих</button></div>`;return;}
    status.style.display='block';status.textContent=`✅ ${data.length} файл таны санд байна`;
    grid.innerHTML=data.map(item=>`<div class="prod-card" style="border:2px solid #d1fae5"><div class="prod-img" style="background:#f0fdf4"><span style="font-size:44px">📄</span><span class="prod-badge" style="background:#d1fae5;color:#065f46">Баталгаажсан</span></div><div class="prod-body"><div class="prod-title">${item.title}</div><div style="font-size:10px;color:#999;margin-bottom:10px">📅 ${item.date}</div><a href="${item.link}" target="_blank" rel="noopener" style="display:block;text-align:center;background:var(--green);color:#fff;padding:9px;border-radius:11px;font-size:12px;font-weight:700;text-decoration:none">⬇ Татаж авах</a></div></div>`).join('');
  }catch(e){grid.innerHTML=`<div style="grid-column:1/-1;text-align:center;padding:56px;color:#bbb"><p style="font-size:12px;font-weight:600">Мэдээлэл татахад алдаа гарлаа.</p></div>`;}
}

/* ════════════════════════════════════
   TOAST
════════════════════════════════════ */
let toastTimer;
function showToast(msg,type='success'){const t=document.getElementById('toast');t.textContent=msg;t.className='show '+type;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{t.className='';},3000);}

/* ════════════════════════════════════
   SUDOKU
════════════════════════════════════ */
function getCredits(){return parseInt(localStorage.getItem(CREDIT_KEY)||'0');}
function setCredits(n){localStorage.setItem(CREDIT_KEY,String(Math.max(0,n)));updateCreditUI();}
function updateCreditUI(){const el=document.getElementById('creditCount');if(el)el.textContent=getCredits();}
async function refreshCredits(){
  if(!currentUser){showToast('Эхлээд нэвтэрнэ үү!','error');return;}
  const btn=document.getElementById('refreshCreditBtn');if(btn){btn.textContent='⏳';btn.disabled=true;}
  try{
    const resp=await fetch(GAS_URL+'?action=getApproved&email='+encodeURIComponent(currentUser));
    const data=await resp.json();
    if(Array.isArray(data)&&data.length){let total=0;data.forEach(item=>{const p=parseInt(item.printPages||item.pages||item.credits||0);total+=isNaN(p)?0:p;});if(total>0){setCredits(total);showToast('✅ Эрх шинэчлэгдлээ: '+total+' хуудас','success');}else{showToast('Батлагдсан хэвлэх эрх олдсонгүй.','error');}}
    else{updateCreditUI();showToast('Батлагдсан захиалга байхгүй байна.','error');}
  }catch(e){updateCreditUI();showToast('Сүлжээний алдаа.','error');}
  if(btn){btn.textContent='⟳ Шинэчлэх';btn.disabled=false;}
}
function isFreeUsed(){return localStorage.getItem(FREE_USED_KEY)==='1';}
function markFreeUsed(){localStorage.setItem(FREE_USED_KEY,'1');}

function initSudoku(){
  const{puzzle,solution}=generateSudoku();sudokuSolution=solution;sudokuPuzzle=puzzle;
  const grid=document.getElementById('sudokuGrid');if(!grid)return;grid.innerHTML='';
  for(let row=0;row<9;row++){for(let col=0;col<9;col++){
    const idx=row*9+col,val=puzzle[idx],inp=document.createElement('input');
    inp.type='text';inp.maxLength=1;inp.className='sudoku-cell';
    if(col===2||col===5)inp.classList.add('border-r');if(row===2||row===5)inp.classList.add('border-b');
    if(val){inp.value=MONG_NUMS[String(val)]||'';inp.readOnly=true;inp.classList.add('readonly');}
    inp.addEventListener('input',function(e){const ch=e.target.value.slice(-1);if(MONG_NUMS[ch])this.value=MONG_NUMS[ch];else if(Object.values(MONG_NUMS).includes(ch))this.value=ch;else this.value='';this.classList.remove('error');});
    inp.addEventListener('keydown',function(e){if(e.key>='1'&&e.key<='9'){e.preventDefault();this.value=MONG_NUMS[e.key];this.classList.remove('error');}if(e.key==='Backspace'||e.key==='Delete'){this.value='';this.classList.remove('error');}});
    grid.appendChild(inp);
  }}
}
function generateSudoku(){const base=Array(81).fill(0);fillSudoku(base);const solution=[...base],puzzle=[...solution];const pos=[...Array(81).keys()].sort(()=>Math.random()-.5);let rem=0;for(const p of pos){if(rem>=45)break;puzzle[p]=0;rem++;}return{puzzle,solution};}
function generateNewPuzzle(){const base=Array(81).fill(0);fillSudoku(base);const sol=[...base],puz=[...sol];const pos=[...Array(81).keys()].sort(()=>Math.random()-.5);let rem=0;for(const p of pos){if(rem>=46)break;puz[p]=0;rem++;}return{puzzle:puz,solution:sol};}
function fillSudoku(board){const empty=board.indexOf(0);if(empty===-1)return true;const nums=shuffle([1,2,3,4,5,6,7,8,9]);for(const n of nums){if(isValidPlacement(board,empty,n)){board[empty]=n;if(fillSudoku(board))return true;board[empty]=0;}}return false;}
function isValidPlacement(board,idx,num){const row=Math.floor(idx/9),col=idx%9;for(let i=0;i<9;i++){if(board[row*9+i]===num||board[i*9+col]===num)return false;}const br=Math.floor(row/3)*3,bc=Math.floor(col/3)*3;for(let r=0;r<3;r++)for(let c=0;c<3;c++)if(board[(br+r)*9+(bc+c)]===num)return false;return true;}
function shuffle(arr){for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];}return arr;}
function checkSudoku(){const cells=document.querySelectorAll('.sudoku-cell');let hasError=false,hasEmpty=false;cells.forEach((cell,idx)=>{if(cell.readOnly)return;cell.classList.remove('error');const mv=cell.value;if(!mv){hasEmpty=true;return;}const n=parseInt(MONG_REV[mv]||mv);if(n!==sudokuSolution[idx]){cell.classList.add('error');hasError=true;}});if(hasEmpty)showToast('Бүх нүдийг бөглөнө үү','error');else if(hasError)showToast('Буруу нүд бий. Улаанаар тэмдэглэгдлээ','error');else showToast('Маш сайн! Судоку зөв боллоо! 🎉','success');}
function solveSudoku(){const cells=document.querySelectorAll('.sudoku-cell');cells.forEach((cell,idx)=>{if(!cell.readOnly){cell.value=MONG_NUMS[String(sudokuSolution[idx])]||'';cell.classList.remove('error');}});showToast('Шийдэл харуулагдлаа','success');}
function handlePrint(){const cr=getCredits();if(cr<1&&isFreeUsed()){showToast('Хэвлэх эрх байхгүй. Эрх худалдаж аваарай!','error');return;}askPrintCount();}
function printFree(){askPrintCount();}
function askPrintCount(){
  const existing=document.getElementById('printCountModal');if(existing)existing.remove();
  const cr=getCredits(),freeAvail=!isFreeUsed(),maxPages=freeAvail?Math.max(cr,1):cr;
  const modal=document.createElement('div');modal.id='printCountModal';
  modal.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;padding:18px;font-family:"Plus Jakarta Sans",sans-serif';
  const maxBtn=Math.min(maxPages,5);
  const btns=Array.from({length:maxBtn},(_,i)=>i+1).map(n=>`<button id="pcBtn${n}" onclick="selectPrintCount(${n})" style="width:50px;height:50px;border-radius:13px;border:2px solid #e7e5e4;background:#fff;font-size:15px;font-weight:800;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;color:#57534e">${n}</button>`).join('');
  const creditInfo=cr>0?`Таны эрх: <strong>${cr} хуудас</strong>`:freeAvail?'Үнэгүй: <strong>1 хуудас</strong>':'⚠️ Эрх байхгүй';
  modal.innerHTML=`<div style="background:#fff;border-radius:22px;padding:28px 24px;width:100%;max-width:320px;text-align:center;box-shadow:0 18px 56px rgba(0,0,0,.3)"><div style="font-size:38px;margin-bottom:10px">🖨️</div><h3 style="font-size:16px;font-weight:800;margin-bottom:7px;color:#1c1917">Хэдэн хуудас хэвлэх вэ?</h3><p style="font-size:11px;color:#57534e;margin-bottom:18px;line-height:1.6">1 хуудас = 4 судоку.<br>${creditInfo}</p><div style="display:flex;gap:7px;justify-content:center;margin-bottom:20px;flex-wrap:wrap">${btns}</div><div id="pcPreview" style="background:#fef3c7;border-radius:11px;padding:9px;font-size:11px;color:#92400e;font-weight:700;margin-bottom:16px;display:none"></div><div style="display:flex;gap:9px"><button onclick="closePrintCountModal()" style="flex:1;padding:12px;border-radius:12px;border:none;background:#f5f5f5;color:#555;font-family:'Plus Jakarta Sans',sans-serif;font-size:12px;font-weight:700;cursor:pointer">Болих</button><button id="pcConfirmBtn" onclick="confirmPrintCount()" style="flex:2;padding:12px;border-radius:12px;border:none;background:var(--amber);color:#fff;font-family:'Plus Jakarta Sans',sans-serif;font-size:12px;font-weight:800;cursor:pointer;opacity:.4;pointer-events:none">🖨️ Хэвлэх</button></div></div>`;
  document.body.appendChild(modal);window._selectedPrintCount=0;
}
function selectPrintCount(n){if(!n||n<1)return;window._selectedPrintCount=n;[1,2,3,4,5].forEach(i=>{const b=document.getElementById('pcBtn'+i);if(!b)return;b.style.borderColor=i===n?'var(--amber)':'#e7e5e4';b.style.background=i===n?'rgba(217,119,6,.12)':'#fff';b.style.color=i===n?'var(--amber)':'#57534e';});const prev=document.getElementById('pcPreview'),btn=document.getElementById('pcConfirmBtn');if(prev){prev.style.display='block';prev.textContent=`${n} хуудас · ${n*4} судоку хэвлэгдэнэ`;}if(btn){btn.style.opacity='1';btn.style.pointerEvents='auto';}}
function closePrintCountModal(){const m=document.getElementById('printCountModal');if(m)m.remove();}
function confirmPrintCount(){
  const n=window._selectedPrintCount||0;if(!n||n<1){showToast('Хуудасны тоо сонгоно уу!','error');return;}
  const cr=getCredits(),freeAvail=!isFreeUsed();
  if(!freeAvail&&n>cr){showToast(`Эрх хүрэлцэхгүй. Таны эрх: ${cr} хуудас`,'error');return;}
  closePrintCountModal();if(!freeAvail){setCredits(cr-n);}else{markFreeUsed();if(cr>0)setCredits(Math.max(0,cr-Math.max(0,n-1)));}
  doPrint(n);
}
function doPrint(pageCount){
  const pages=[];for(let p=0;p<pageCount;p++){const puzzles=[];for(let q=0;q<4;q++)puzzles.push(generateNewPuzzle());pages.push(puzzles);}
  const html=buildPrintHTML(pages);showToast(`${pageCount} хуудас хэвлэж байна...`,'success');
  setTimeout(()=>{const pa=document.getElementById('printArea');if(!pa)return;pa.innerHTML=html;pa.style.display='block';
  setTimeout(()=>{window.print();function cleanup(){const el=document.getElementById('printArea');if(el){el.style.display='none';el.innerHTML='';}window.removeEventListener('afterprint',cleanup);}window.addEventListener('afterprint',cleanup);setTimeout(()=>{const el=document.getElementById('printArea');if(el&&el.style.display!=='none'){el.style.display='none';el.innerHTML='';}},4000);},400);},150);
}
function buildPrintHTML(pages){
  const MN={'1':'᠑','2':'᠒','3':'᠓','4':'᠔','5':'᠕','6':'᠖','7':'᠗','8':'᠘','9':'᠙'};
  return pages.map((puzzles,pi)=>{
    const header=`<div class="pg-hdr"><img src="https://raw.githubusercontent.com/tuult764-crypto/sonirholtoi-hel-bichig-/main/logo.png" alt="" onerror="this.style.display='none'" style="width:24px;height:24px;object-fit:contain;border-radius:5px;background:#1c1917;"><div><div class="pg-hdr-t">Сонирхолтой хэл бичиг</div><div class="pg-hdr-s">Судоку · Хуудас ${pi+1}</div></div></div>`;
    const puzzleHTMLs=puzzles.map((p,qi)=>{let rows='';for(let r=0;r<9;r++){rows+='<tr>';for(let c=0;c<9;c++){const idx=r*9+c,val=p.puzzle[idx];let cls='';if(c===2||c===5)cls+=' br';if(r===2||r===5)cls+=' bb';if(val!==0)cls+=' gv';rows+=`<td class="${cls.trim()}">${val?(MN[String(val)]||val):''}</td>`;}rows+='</tr>';}return`<div class="pp"><div class="pp-t">Судоку ${pi*4+qi+1} &nbsp;·&nbsp; Нэр:_______________ &nbsp;·&nbsp; Анги:_____</div><table class="pt"><tbody>${rows}</tbody></table><div class="pp-g">᠑=1 ᠒=2 ᠓=3 ᠔=4 ᠕=5 ᠖=6 ᠗=7 ᠘=8 ᠙=9</div></div>`;}).join('');
    return`<div class="pg">${header}${puzzleHTMLs}</div>`;
  }).join('');
}
function buyPackage(pages,price){_spBuying={pages,price};document.getElementById('spPkgLabel').textContent=`${pages} хуудас · ${price.toLocaleString()}₮`;document.getElementById('spAmtEl').textContent=price.toLocaleString()+'₮';if(currentUser)document.getElementById('spEmail').value=currentUser;spGoStep1();document.getElementById('sudokuPayModal').classList.remove('hidden');}
function spGoStep1(){['spStep1','spStep2','spStep3'].forEach((id,i)=>document.getElementById(id).style.display=i===0?'':'none');}
function spGoStep2(){['spStep1','spStep2','spStep3'].forEach((id,i)=>document.getElementById(id).style.display=i===1?'':'none');}
function closeSudokuPay(){document.getElementById('sudokuPayModal').classList.add('hidden');spGoStep1();}
async function spSubmit(){
  const email=document.getElementById('spEmail').value.trim(),note=document.getElementById('spNote').value.trim();
  if(!email||!email.includes('@')){showToast('Зөв и-мэйл хаяг оруулна уу','error');return;}
  const btn=document.getElementById('spSubmitBtn');btn.disabled=true;btn.textContent='⏳ Илгээж байна...';
  try{await fetch(GAS_URL,{method:'POST',mode:'no-cors',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'submitOrder',email,note,total:_spBuying.price,items:`Судоку хэвлэх эрх ${_spBuying.pages} хуудас`,printPages:_spBuying.pages,date:new Date().toLocaleString('mn-MN')})});
    document.getElementById('spConfirmEmail').textContent=email;
    ['spStep1','spStep2','spStep3'].forEach((id,i)=>document.getElementById(id).style.display=i===2?'':'none');
    showToast('Захиалга амжилттай!','success');
  }catch(e){showToast('Сүлжээний алдаа.','error');}
  btn.disabled=false;btn.textContent='🚀 Захиалга илгээх';
}

/* ════════════════════════════════════
   WORD SEARCH
════════════════════════════════════ */
const GITHUB_RAW='https://raw.githubusercontent.com/tuult764-crypto/sonirholtoi-hel-bichig-/main/';
const WS_DB_URL=GITHUB_RAW+'wordsearch_db.txt';
const WS_IMG_FALLBACK_NAMES=['wordsearch_1.png','wordsearch_2.png','wordsearch_3.png','wordsearch_4.png','wordsearch_5.png'];
const WS_FALLBACK_WORDS={1:['НОХОЙ','МУУР','МОРЬ','ҮНЭГ','ЧОНО','БААВГАЙ','ТУУЛАЙ'],2:['УЛААН','НОГООН','ЦЭНХЭР','ШАРААН','ЦАГААН','ХАР','ХӨХ'],3:['УУЛС','НУУР','ГОЛ','ТЭНГЭР','ЦАСАН','МАНАН','НУГА'],4:['ТАРАГ','ЦУТГАА','БААЗ','ХУУРГА','ЗУТАН','БОРЦОГ','ЦАЙ'],5:['ТОЛГОЙ','НҮД','ЧИХ','ХАМАР','АМ','ГАРТ','ХӨЛЭН']};
let wsCurrentPage=1,wsWords=[],wsFound=[],wsFirstClick=null,wsDrawing=false,_wsDBCache=null;
async function wsGetDB(){if(_wsDBCache)return _wsDBCache;try{const resp=await fetch(WS_DB_URL+'?_='+Date.now());if(!resp.ok)throw new Error();const text=await resp.text();const db={};text.split(/\n===\n/).forEach(block=>{block=block.trim();const pm=block.match(/ХУУДАС:\s*(\d+)/);const wm=block.match(/ҮГС:\s*(.+)/);if(!pm||!wm)return;const page=parseInt(pm[1]);const words=wm[1].split(',').map(w=>w.trim().toUpperCase()).filter(Boolean);if(words.length)db[page]=words;});_wsDBCache=db;return db;}catch(e){return null;}}
function wsImageUrl(page){return GITHUB_RAW+WS_IMG_FALLBACK_NAMES[page-1];}
async function wsLoadPage(){
  const sel=document.getElementById('wsCatSel');wsCurrentPage=parseInt(sel?.value||'1');wsFound=[];wsFirstClick=null;wsDrawing=false;
  document.getElementById('wsLoading').style.display='block';document.getElementById('wsNoPdf').style.display='none';document.getElementById('wsGameArea').style.display='none';
  const db=await wsGetDB();wsWords=(db&&db[wsCurrentPage])?(db[wsCurrentPage]):(WS_FALLBACK_WORDS[wsCurrentPage]||WS_FALLBACK_WORDS[1]);
  const imgUrl=wsImageUrl(wsCurrentPage);const img=document.getElementById('wsBgImg');
  img.onload=()=>{document.getElementById('wsLoading').style.display='none';document.getElementById('wsGameArea').style.display='block';wsResetOverlay();renderWordList();updateFoundCount();const info=document.getElementById('wsCatInfo');if(info)info.textContent=db&&db[wsCurrentPage]?`✅ GitHub-аас татсан: ${wsWords.length} үг`:`📦 Дотоод үгс: ${wsWords.length} үг`;};
  img.onerror=()=>{document.getElementById('wsLoading').style.display='none';document.getElementById('wsNoPdf').style.display='block';};
  img.src=imgUrl;wsSetupClickLayer();
}
function wsSetupClickLayer(){const layer=document.getElementById('wsClickLayer');if(!layer)return;const newLayer=layer.cloneNode(true);layer.parentNode.replaceChild(newLayer,layer);newLayer.addEventListener('click',wsHandleClick);newLayer.addEventListener('mousemove',wsHandleMouseMove);}
function wsGetPct(e){const wrap=document.getElementById('wsImgWrap');const rect=wrap.getBoundingClientRect();const clientX=e.touches?e.touches[0].clientX:e.clientX;const clientY=e.touches?e.touches[0].clientY:e.clientY;return{x:((clientX-rect.left)/rect.width)*100,y:((clientY-rect.top)/rect.height)*100};}
function wsHandleMouseMove(e){if(!wsFirstClick)return;const pos=wsGetPct(e);const line=document.getElementById('wsActiveLine');if(!line)return;line.style.display='';line.setAttribute('x1',wsFirstClick.x+'%');line.setAttribute('y1',wsFirstClick.y+'%');line.setAttribute('x2',pos.x+'%');line.setAttribute('y2',pos.y+'%');}
function wsHandleClick(e){const pos=wsGetPct(e);if(!wsFirstClick){wsFirstClick=pos;const svg=document.getElementById('wsOverlaySvg');const mark=document.createElementNS('http://www.w3.org/2000/svg','circle');mark.setAttribute('cx',pos.x+'%');mark.setAttribute('cy',pos.y+'%');mark.setAttribute('r','1.2%');mark.setAttribute('fill','rgba(37,99,235,0.5)');mark.setAttribute('class','ws-start-mark');svg.appendChild(mark);const line=document.getElementById('wsActiveLine');line.style.display='';line.setAttribute('x1',pos.x+'%');line.setAttribute('y1',pos.y+'%');line.setAttribute('x2',pos.x+'%');line.setAttribute('y2',pos.y+'%');}else{const endPos=pos;wsDrawLine(wsFirstClick,endPos);wsFirstClick=null;const line=document.getElementById('wsActiveLine');if(line)line.style.display='none';document.querySelectorAll('.ws-start-mark').forEach(m=>m.remove());wsAskWord(endPos);}}
function wsDrawLine(start,end,color,word){const svg=document.getElementById('wsFoundLines');const line=document.createElementNS('http://www.w3.org/2000/svg','line');line.setAttribute('x1',start.x+'%');line.setAttribute('y1',start.y+'%');line.setAttribute('x2',end.x+'%');line.setAttribute('y2',end.y+'%');line.setAttribute('stroke',color||'rgba(37,99,235,0.45)');line.setAttribute('stroke-width','22');line.setAttribute('stroke-linecap','round');line.setAttribute('opacity','0.55');svg.appendChild(line);}
const WS_LINE_COLORS=['rgba(59,130,246,0.5)','rgba(16,185,129,0.5)','rgba(245,158,11,0.5)','rgba(139,92,246,0.5)','rgba(239,68,68,0.5)','rgba(6,182,212,0.5)','rgba(236,72,153,0.5)'];
function wsAskWord(endPos){const remaining=wsWords.filter(w=>!wsFound.includes(w));if(!remaining.length)return;const existing=document.getElementById('wsWordPickModal');if(existing)existing.remove();const modal=document.createElement('div');modal.id='wsWordPickModal';modal.style.cssText='position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;padding:16px;font-family:"Plus Jakarta Sans",sans-serif';const COLORS=['#3b82f6','#10b981','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#ec4899'];modal.innerHTML=`<div style="background:#fff;border-radius:20px;padding:24px;width:100%;max-width:340px;box-shadow:0 16px 48px rgba(0,0,0,0.25)"><div style="font-size:14px;font-weight:800;margin-bottom:4px">✅ Ямар үг олсон бэ?</div><div style="font-size:11px;color:var(--mid);margin-bottom:16px">Олсон үгээ сонгоно уу</div><div style="display:flex;flex-direction:column;gap:7px;max-height:280px;overflow-y:auto;margin-bottom:14px">${remaining.map((w,i)=>`<button onclick="wsConfirmWord('${w}',${JSON.stringify(endPos)},${i})" style="padding:10px 14px;border:2px solid #e7e5e4;border-radius:12px;background:#fff;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;font-size:13px;font-weight:700;text-align:left;transition:all .12s;color:#1c1917" onmouseover="this.style.borderColor='${COLORS[i%COLORS.length]}'" onmouseout="this.style.borderColor='#e7e5e4'">${w}</button>`).join('')}</div><button onclick="wsCancelWord()" style="width:100%;padding:10px;border:none;background:#f5f5f5;border-radius:11px;font-size:12px;font-weight:700;cursor:pointer;color:#57534e;font-family:'Plus Jakarta Sans',sans-serif">Болих</button></div>`;document.body.appendChild(modal);}
function wsConfirmWord(word,endPos,colorIdx){document.getElementById('wsWordPickModal')?.remove();const color=WS_LINE_COLORS[colorIdx%WS_LINE_COLORS.length];wsDrawLine({x:parseFloat(document.getElementById('wsActiveLine')?.getAttribute('x1')||50),y:parseFloat(document.getElementById('wsActiveLine')?.getAttribute('y1')||50)},endPos,color,word);wsFound.push(word);renderWordList();updateFoundCount();showToast(`✅ "${word}" олдлоо!`,'success');if(wsFound.length===wsWords.length)setTimeout(()=>showToast('🎉 Бүх үг олдлоо!','success'),600);}
function wsCancelWord(){document.getElementById('wsWordPickModal')?.remove();const svg=document.getElementById('wsFoundLines');if(svg&&svg.lastChild)svg.removeChild(svg.lastChild);showToast('Шугам арилгагдлаа','error');}
function wsResetOverlay(){const fl=document.getElementById('wsFoundLines');if(fl)fl.innerHTML='';const al=document.getElementById('wsActiveLine');if(al)al.style.display='none';document.querySelectorAll('.ws-start-mark').forEach(m=>m.remove());wsFirstClick=null;}
function wsReset(){wsFound=[];wsFirstClick=null;wsResetOverlay();renderWordList();updateFoundCount();document.getElementById('wsWordPickModal')?.remove();}
function renderWordList(){const el=document.getElementById('wordListEl');if(!el)return;const COLORS_LABEL=['#3b82f6','#10b981','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#ec4899'];el.innerHTML=wsWords.map((w,i)=>{const done=wsFound.includes(w);const color=done?COLORS_LABEL[wsFound.indexOf(w)%COLORS_LABEL.length]:'var(--border)';return`<div class="word-item${done?' done':''}" style="${done?'border-left:3px solid '+color+';padding-left:9px':''}"><div class="ws-check" style="${done?'background:'+color+';border-color:'+color:''}"></div>${w}</div>`;}).join('');}
function updateFoundCount(){const el=document.getElementById('wsFoundCount');if(el)el.textContent=`✅ Олсон: ${wsFound.length} / ${wsWords.length} үг`;}
function startWordSearch(){wsLoadPage();}

/* ════════════════════════════════════
   READING GAME
════════════════════════════════════ */
const READ_DATA=[
  {title:'Монгол оньсого №1',text:'Нарны [1] байнга [2] мандана.',blanks:['гэрэл','мандал'],options:[['гэрэл','харанхуй','салхи','ус'],['мандал','уулс','тэнгэр','газар']]},
  {title:'Монгол оньсого №2',text:'[1] нь монгол хүний [2] байдаг.',blanks:['Сэтгэл','эрдэнэ'],options:[['Сэтгэл','Бие','Мал','Газар'],['эрдэнэ','найз','ном','хоол']]},
  {title:'Монгол оньсого №3',text:'Ухаантай [1] холын [2] харна.',blanks:['хүн','замыг'],options:[['хүн','морь','нохой','үнэг'],['замыг','тэнгэрийг','уулыг','голыг']]},
  {title:'Монгол үг №4',text:'Монгол хэлэнд [1] ба [2] гэсэн хоёр нэр үг байна.',blanks:['эр','эм'],options:[['эр','ул','хар','цаг'],['эм','ах','ах','нар']]},
  {title:'Монгол үг №5',text:'[1] уул нь монголын [2] уул юм.',blanks:['Богд','дархан'],options:[['Богд','Алтай','Говь','Хангай'],['дархан','ариун','хийд','ойт']]},
  {title:'🔒 Нэмэлт даалгавар',text:'',locked:true},
  {title:'🔒 Нэмэлт даалгавар',text:'',locked:true},
];
const READ_FREE=5;
let readIdx=0,readScore=0,readBlankIdx=0;
function startReading(){readIdx=0;readScore=0;readBlankIdx=0;document.getElementById('readScore').textContent='0';document.getElementById('readQ').textContent='1';document.getElementById('readTotal').textContent=READ_FREE;document.getElementById('readProgress').style.width='0%';document.getElementById('readLockMsg').style.display='none';document.getElementById('readContent').innerHTML='';document.getElementById('readOptions').innerHTML='';showReadQuestion();}
function showReadQuestion(){const q=READ_DATA[readIdx];if(!q||q.locked||readIdx>=READ_FREE){document.getElementById('readLockMsg').style.display='block';document.getElementById('readContent').innerHTML='';document.getElementById('readOptions').innerHTML='';document.getElementById('readTitle').textContent='— Дэлгүүрээс худалдаж аваарай —';return;}document.getElementById('readTitle').textContent=q.title;readBlankIdx=0;renderReadText(q);renderReadOptions(q,0);document.getElementById('readQ').textContent=readIdx+1;document.getElementById('readProgress').style.width=((readIdx/READ_FREE)*100)+'%';}
function renderReadText(q){let html=q.text;for(let i=0;i<q.blanks.length;i++)html=html.replace(`[${i+1}]`,`<span class="blank" data-num="${i+1}">____</span>`);document.getElementById('readContent').innerHTML=html;}
function renderReadOptions(q,bIdx){const opts=q.options[bIdx];document.getElementById('readOptions').innerHTML=opts.map(o=>`<button class="option-btn" onclick="selectReadOption('${o}',${bIdx})">${o}</button>`).join('');}
function selectReadOption(chosen,bIdx){const q=READ_DATA[readIdx],correct=q.blanks[bIdx];const btns=document.querySelectorAll('.option-btn');btns.forEach(b=>{b.disabled=true;if(b.textContent===correct)b.classList.add('correct');else if(b.textContent===chosen&&chosen!==correct)b.classList.add('wrong');});const blanks=document.querySelectorAll('.blank');if(blanks[bIdx])blanks[bIdx].textContent=chosen;if(chosen===correct)readScore++;document.getElementById('readScore').textContent=readScore;setTimeout(()=>{readBlankIdx++;if(readBlankIdx<q.blanks.length){renderReadOptions(q,readBlankIdx);}else{readIdx++;document.getElementById('readQ').textContent=Math.min(readIdx+1,READ_FREE);document.getElementById('readProgress').style.width=((readIdx/READ_FREE)*100)+'%';setTimeout(()=>showReadQuestion(),600);}},1000);}

/* ════════════════════════════════════
   HORSE RACE
════════════════════════════════════ */
const PLAYER_COLORS=[{emoji:'🔴',color:'#dc2626',bg:'#fef2f2',name:'1-р тоглогч'},{emoji:'🔵',color:'#2563eb',bg:'#eff6ff',name:'2-р тоглогч'},{emoji:'🟢',color:'#059669',bg:'#f0fdf4',name:'3-р тоглогч'},{emoji:'🟡',color:'#d97706',bg:'#fffbeb',name:'4-р тоглогч'}];
const SHAGAI_FACES={'Хонь':'🟢','Ямаа':'🟡','Тэмээ':'🔵','Морь':'🔴'};
const SHAGAI_KEYS=Object.keys(SHAGAI_FACES);
const BONUS_QUESTIONS=[{q:'Монгол улсын нийслэл хот аль вэ?',opts:['Улаанбаатар','Эрдэнэт','Дархан','Мурэн'],ans:0},{q:'"Хонь" монгол бичгээр хэд дэх үсгээс эхэлдэг вэ?',opts:['Х','О','Н','Ь'],ans:0},{q:'Монгол цагаан сар ямар саруудад тохиодог вэ?',opts:['1-2 сар','3-4 сар','5-6 сар','11-12 сар'],ans:0},{q:'Шагайн тоглоомд "дөрвөн бэрх" гэж юу вэ?',opts:['4 морь','4 ижил тал','4 хонь','4 тэмээ'],ans:1},{q:'Монгол хэлэнд хэдэн эгшиг байдаг вэ?',opts:['7','9','11','5'],ans:1},{q:'"Цагаан" монгол хэлэнд юуг илэрхийлдэг вэ?',opts:['Өнгө','Мал','Байгаль','Тэнгэр'],ans:0},{q:'Монгол бичиг ямар чиглэлд бичигддэг вэ?',opts:['Дээрээс доош','Зүүнээс баруун','Баруунаас зүүн','Доороос дээш'],ans:0},{q:'Оньсого: "Өглөө 4 хөлтэй, өдөр 2 хөлтэй, орой 3 хөлтэй"?',opts:['Хүн','Морь','Муур','Нохой'],ans:0},{q:'"Нохой" үгэнд хэдэн үсэг байна вэ?',opts:['4','5','3','6'],ans:0},{q:'Монгол нутгийн ямар мал хамгийн их тоотой вэ?',opts:['Хонь','Ямаа','Үхэр','Морь'],ans:0}];
let horsePlayerCount=1,horsePlayerNames=['Тоглогч 1'],horsePos=[0],horseTurn=0,horseRolled=false,horseLastRoll=0,currentQuestion=null,questionAnswered=false,gameOver=false;
const FINISH=50;
function selectPlayerCount(n){horsePlayerCount=n;document.querySelectorAll('.horse-cnt-btn').forEach((b,i)=>{const sel=i+1===n;b.style.borderColor=sel?'var(--amber)':'var(--border)';b.style.background=sel?'var(--amber-l)':'#fff';b.style.color=sel?'var(--amber-d)':'var(--mid)';});const wrap=document.getElementById('playerNamesWrap');if(!wrap)return;if(n===1){wrap.innerHTML='';return;}wrap.innerHTML=`<p style="font-size:11px;font-weight:700;color:var(--mid);margin-bottom:10px;text-transform:uppercase;letter-spacing:.06em">Тоглогчдын нэр (заавал биш)</p>`+Array.from({length:n},(_,i)=>`<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px"><span style="font-size:18px">${PLAYER_COLORS[i].emoji}</span><input id="pname${i}" class="modal-field" type="text" placeholder="${PLAYER_COLORS[i].name}" style="margin:0;flex:1"></div>`).join('');}
function startHorseGame(){horsePlayerNames=Array.from({length:horsePlayerCount},(_,i)=>{const el=document.getElementById('pname'+i);return el?.value?.trim()||PLAYER_COLORS[i].name;});horsePos=Array(horsePlayerCount).fill(0);horseTurn=0;horseRolled=false;horseLastRoll=0;currentQuestion=null;questionAnswered=false;gameOver=false;document.getElementById('horseSetup').style.display='none';document.getElementById('horseGame').style.display='block';document.getElementById('winnerBanner').style.display='none';document.getElementById('rollBtn').disabled=false;document.getElementById('qText').textContent='Шагайгаа буулгасны дараа нэмэлт асуулт гарч ирнэ.';document.getElementById('qOpts').innerHTML='';document.getElementById('rollResult').textContent='Шагайгаа буулгана уу!';const shagais=document.getElementById('shagaiDisplay');if(shagais)shagais.innerHTML='<div class="shagai">?</div><div class="shagai">?</div><div class="shagai">?</div><div class="shagai">?</div>';buildTrack();updateHorseUI();}
function buildTrack(){const track=document.getElementById('raceTrack');if(!track)return;track.innerHTML=horsePlayerNames.map((name,i)=>`<div class="track-lane"><div class="lane-label" style="color:rgba(255,255,255,.85);font-size:10px">${PLAYER_COLORS[i].emoji} ${name}</div><div class="lane-track"><div class="lane-bg-stripes"></div><div class="horse-pos" id="horse${i}" style="left:1%">${PLAYER_COLORS[i].emoji}</div><div class="finish-line"><span class="finish-flag">🏁</span></div><div class="lane-pos-num" id="pos${i}Label">0</div></div></div>`).join('');}
function resetHorse(){document.getElementById('horseSetup').style.display='block';document.getElementById('horseGame').style.display='none';horsePos=[0];horseTurn=0;gameOver=false;horseRolled=false;selectPlayerCount(horsePlayerCount);}
function rollShagai(){if(gameOver||horseRolled)return;horseRolled=true;document.getElementById('rollBtn').disabled=true;const results=Array.from({length:4},()=>SHAGAI_KEYS[Math.floor(Math.random()*4)]);const disp=document.getElementById('shagaiDisplay');if(disp){disp.innerHTML='';results.forEach((r,i)=>{const el=document.createElement('div');el.className='shagai rolled';el.style.animationDelay=(i*.1)+'s';el.textContent=SHAGAI_FACES[r];disp.appendChild(el);});}const counts={};results.forEach(r=>counts[r]=(counts[r]||0)+1);let move=0;if(Object.keys(counts).length===1){const face=Object.keys(counts)[0];move=face==='Морь'?4:face==='Тэмээ'?3:4;document.getElementById('rollResult').innerHTML=`<span>Дөрвөн ${face}! +${move} алхам 🎉</span>`;}else{move=Object.keys(counts).length;document.getElementById('rollResult').innerHTML=`${results.map(r=>SHAGAI_FACES[r]).join(' ')} → <span>+${move} алхам</span>`;}if(move===0)move=1;horseLastRoll=move;setTimeout(()=>{horsePos[horseTurn]=Math.min(FINISH,horsePos[horseTurn]+move);updateHorseUI();if(horsePos[horseTurn]>=FINISH){endGame(horseTurn);return;}showBonusQuestion();},800);}
function showBonusQuestion(){const q=BONUS_QUESTIONS[Math.floor(Math.random()*BONUS_QUESTIONS.length)];currentQuestion=q;questionAnswered=false;document.getElementById('qText').textContent=q.q;document.getElementById('qOpts').innerHTML=q.opts.map((o,i)=>`<button class="q-opt" onclick="answerBonus(${i})">${o}</button>`).join('');}
function answerBonus(idx){if(questionAnswered)return;questionAnswered=true;const btns=document.querySelectorAll('.q-opt');btns.forEach(b=>b.disabled=true);const correct=currentQuestion.ans;btns[correct].classList.add('correct2');if(idx!==correct)btns[idx].classList.add('wrong2');if(idx===correct){showToast('+2 нэмэлт алхам! 🎉','success');setTimeout(()=>{horsePos[horseTurn]=Math.min(FINISH,horsePos[horseTurn]+2);updateHorseUI();if(horsePos[horseTurn]>=FINISH){endGame(horseTurn);return;}nextTurn();},1000);}else{showToast('Буруу хариулт!','error');setTimeout(()=>nextTurn(),1000);}}
function nextTurn(){horseTurn=(horseTurn+1)%horsePlayerCount;horseRolled=false;questionAnswered=false;currentQuestion=null;document.getElementById('qText').textContent='Шагайгаа буулгасны дараа нэмэлт асуулт гарч ирнэ.';document.getElementById('qOpts').innerHTML='';document.getElementById('rollBtn').disabled=false;updateHorseUI();}
function endGame(winner){gameOver=true;document.getElementById('rollBtn').disabled=true;document.getElementById('winnerBanner').style.display='block';const wname=horsePlayerNames[winner]||PLAYER_COLORS[winner].name;document.getElementById('winnerText').textContent=`🏆 ${PLAYER_COLORS[winner].emoji} ${wname} ялагч боллоо!`;document.getElementById('winnerSub').textContent=`${FINISH} алхам туулж финишэд хүрлээ!`;showToast('Уралдаан дууслаа! 🎉','success');}
function updateHorseUI(){horsePos.forEach((pos,i)=>{const pct=Math.min(pos/FINISH*92,92);const h=document.getElementById('horse'+i);if(h)h.style.left=pct+'%';const pl=document.getElementById('pos'+i+'Label');if(pl)pl.textContent=pos;});const sr=document.getElementById('scoreRow');if(sr)sr.innerHTML=horsePlayerNames.map((name,i)=>`<div class="p-score"><div class="p-score-num" style="color:${PLAYER_COLORS[i].color}">${horsePos[i]||0}</div><div class="p-score-lbl">${PLAYER_COLORS[i].emoji} ${name}</div></div>${i<horsePlayerNames.length-1?'<div style="font-size:18px">⚡</div>':''}`).join('');const tname=horsePlayerNames[horseTurn]||PLAYER_COLORS[horseTurn].name;document.getElementById('turnLabel').textContent=gameOver?'🏁 Тоглоом дууслаа':`${PLAYER_COLORS[horseTurn].emoji} ${tname}-ийн ээлж`;const cp=document.getElementById('curPlayerLabel');if(cp)cp.textContent=`🎲 ${PLAYER_COLORS[horseTurn].emoji} ${tname}: Шагай буулгах`;}

/* ════════════════════════════════════
   ҮНДЭСНИЙ БИЧГИЙН СУРГАЛТ
   Countdown + Бүртгэлийн цонхны систем
════════════════════════════════════ */

// ── Тохируулга ──────────────────────
// Анги эхлэх цаг (Монгол цаг UTC+8)
const CLASS_START = new Date('2026-05-18T19:00:00+08:00');

// Бүртгэлийн цонх: сар бүрийн хагас сайн 00:00 → бүтэн сайн 00:00
// Монгол цаг дээр тооцоолно (UTC+8)
function getMonthlyRegWindow(now) {
  const mn = new Date(now.toLocaleString('en-US', {timeZone:'Asia/Ulaanbaatar'}));
  const y = mn.getFullYear(), m = mn.getMonth();

  // Тухайн сарын хагас сайн (Saturday) болон бүтэн сайн (Sunday) олно
  // Эхний Saturday, Sunday олно
function firstWeekend(year, month) {
  let sat = null;
  for (let d = 1; d <= 31; d++) {
    const dt = new Date(year, month, d);
    if (dt.getMonth() !== month) break;
    const dow = dt.getDay();
    if (dow === 6 && sat === null) { sat = d; continue; }
    if (dow === 0 && sat !== null) { return [{ day: 6, date: sat }, { day: 0, date: d }]; }
  }
  return [];
}

  // Сар бүрийн аль 7 хоногийн эхний бямба, ням сонгоно
  // Бүртгэл: Бямба 00:00 → Ням 23:59:59
  const we = firstWeekend(y, m);
  const satObj = we.find(x=>x.day===6);
  const sunObj = we.find(x=>x.day===0);
  if (!satObj || !sunObj) return null;

  const openUB  = new Date(y, m, satObj.date, 0, 0, 0);   // Бямба 00:00
  const closeUB = new Date(y, m, sunObj.date, 23, 59, 59); // Ням 23:59

  // UB time → UTC
  const TZ_OFFSET = 8 * 60; // UTC+8
  const open  = new Date(openUB.getTime()  - (openUB.getTimezoneOffset() + TZ_OFFSET) * 60000);
  const close = new Date(closeUB.getTime() - (closeUB.getTimezoneOffset() + TZ_OFFSET) * 60000);

  return {open, close, satDate: satObj.date, sunDate: sunObj.date};
}

function isRegOpen(now) {
  const w = getMonthlyRegWindow(now);
  if (!w) return false;
  return now >= w.open && now <= w.close;
}

function nextRegWindow(now) {
  // This month or next month
  const w = getMonthlyRegWindow(now);
  if (w && now < w.open) return w;
  // Next month
  const mn = new Date(now.toLocaleString('en-US',{timeZone:'Asia/Ulaanbaatar'}));
  const nextM = new Date(mn.getFullYear(), mn.getMonth()+1, 1);
  return getMonthlyRegWindow(nextM);
}

function pad2(n){ return String(n).padStart(2,'0'); }
function formatDate(d){
  const mn = new Date(d.toLocaleString('en-US',{timeZone:'Asia/Ulaanbaatar'}));
  return `${mn.getMonth()+1} сарын ${mn.getDate()}-нд`;
}

// ── Үндэсний бичгийн countdown ONLY ──
function updateScriptUI() {
  const now = new Date();
  const cd = document.getElementById('cdDisplay');
  if (!cd) return;
  const diff = CLASS_START - now;
  if (diff <= 0) {
    cd.textContent = '🟢 Эхэлсэн!';
    cd.style.color = '#4ade80';
  } else {
    const totalSec = Math.floor(diff / 1000);
    const days  = Math.floor(totalSec / 86400);
    const hours = Math.floor((totalSec % 86400) / 3600);
    const mins  = Math.floor((totalSec % 3600) / 60);
    const secs  = totalSec % 60;
    cd.textContent = days > 0
      ? `${days}өдөр ${pad2(hours)}:${pad2(mins)}:${pad2(secs)}`
      : `${pad2(hours)}:${pad2(mins)}:${pad2(secs)}`;
  }
}

// ── Гэрийн даалгаврын бүртгэлийн цонх ──
function updateHomeworkUI() {
  const now = new Date();
  const regEl    = document.getElementById('hwRegStatus');
  const tagEl    = document.getElementById('hwRegTag');
  const enrollBtn = document.getElementById('hwEnrollBtn');
  if (!regEl || !tagEl || !enrollBtn) return;

  const open = isRegOpen(now);
  const w = open ? getMonthlyRegWindow(now) : nextRegWindow(now);

  if (open && w) {
    const timeLeft = w.close - now;
    const hrs  = Math.floor(timeLeft/3600000);
    const mins = Math.floor((timeLeft%3600000)/60000);

    regEl.style.background = '#f0fdf4';
    regEl.style.color = '#065f46';
    regEl.innerHTML = `✅ <strong>Бүртгэл нээлттэй байна!</strong><br>
      Хаагдах хугацаа: ${formatDate(w.close)} · ${hrs}ц ${mins}мин үлдсэн<br>
      <span style="font-size:10px;opacity:.8">7 хоног бүрийн Бямба·Нямд бүртгэл явагдана</span>`;

    tagEl.textContent = '🟢 Бүртгэл нээлттэй';
    tagEl.style.background = '#d1fae5';
    tagEl.style.color = '#065f46';

    enrollBtn.disabled = false;
    enrollBtn.style.opacity = '1';
    enrollBtn.style.background = 'var(--amber)';
    enrollBtn.textContent = 'Бүртгүүлэх →';

  } else if (w) {
    const timeLeft = w.open - now;
    const days = Math.floor(timeLeft/86400000);
    const hrs  = Math.floor((timeLeft%86400000)/3600000);
    const mins = Math.floor((timeLeft%3600000)/60000);

    regEl.style.background = '#fef9f0';
    regEl.style.color = '#92400e';
    regEl.innerHTML = `🔒 <strong>Бүртгэл одоогоор хаалттай</strong><br>
      Дараагийн бүртгэл: ${formatDate(w.open)} 00:00 цагт нээгдэнэ<br>
      <span style="font-size:10px;opacity:.8">${days > 0 ? days+'өдөр ' : ''}${pad2(hrs)}:${pad2(mins)} үлдсэн · 7 хоног бүрийн Бямба·Нямд</span>`;

    tagEl.textContent = '🔒 Бүртгэл хаалттай';
    tagEl.style.background = '#fee2e2';
    tagEl.style.color = '#991b1b';

    enrollBtn.disabled = true;
    enrollBtn.style.opacity = '0.45';
    enrollBtn.style.background = '#9ca3af';
    enrollBtn.textContent = '🔒 Хаалттай';
  }
}

function handleHomeworkEnroll() {
  const now = new Date();
  if (!isRegOpen(now)) {
    const w = nextRegWindow(now);
    const msg = w ? `Бүртгэл ${formatDate(w.open)} 00:00 цагт нээгдэнэ.` : 'Бүртгэл одоогоор хаалттай байна.';
    showToast('🔒 ' + msg, 'error');
    return;
  }
  openCourseDetail('homework');
}

// Init + секунд бүр шинэчлэх
updateScriptUI();
updateHomeworkUI();
setInterval(() => { updateScriptUI(); updateHomeworkUI(); }, 1000);

function toggleMobileNav(){
  document.getElementById('mobileNav').classList.toggle('open');
  document.getElementById('hamburger').classList.toggle('open');
}
function closeMobileNav(){
  document.getElementById('mobileNav').classList.remove('open');
  document.getElementById('hamburger').classList.remove('open');
}
document.addEventListener('click',function(e){
  const nav=document.getElementById('mobileNav');
  const btn=document.getElementById('hamburger');
  if(nav&&nav.classList.contains('open')){
    if(!nav.contains(e.target)&&!btn.contains(e.target))closeMobileNav();
  }
});
