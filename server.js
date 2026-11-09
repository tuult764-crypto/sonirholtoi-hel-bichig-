require('dotenv').config();
const express = require('express'), path = require('path'), crypto = require('crypto');
const { Pool, types } = require('pg'), bcrypt = require('bcryptjs'), jwt = require('jsonwebtoken'), qpay = require('./qpay');
types.setTypeParser(20, Number);
types.setTypeParser(1082, v => v); // DATE -> 'YYYY-MM-DD' (цагийн бүсээс болж өдөр зөрөхгүй)
const { JWT_SECRET, DATABASE_URL } = process.env, ADMIN_KEY = process.env.ADMIN_KEY || '';
// Тохиргоо дутуу байсан ч сайт (хуучин дэлгүүр) асна; зөвхөн шинэ /api хэсэг 503 өгнө
const CONFIG_OK = !!(JWT_SECRET && JWT_SECRET.length >= 24 && DATABASE_URL);
if (!JWT_SECRET || JWT_SECRET.length < 24) console.error('ТОХИРГОО ДУТУУ: JWT_SECRET (24+ тэмдэгт) тохируулна уу');
if (!DATABASE_URL) console.error('ТОХИРГОО ДУТУУ: DATABASE_URL тохируулна уу');
const pool = new Pool({ connectionString: DATABASE_URL, max: 5, connectionTimeoutMillis: 10000, ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false } });
const q = (t, p) => pool.query(t, p), SECURE = !!process.env.RENDER || process.env.NODE_ENV === 'production';
const IMG = ['image/jpeg', 'image/png', 'image/webp'], esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function init() {
  await q(`
CREATE TABLE IF NOT EXISTS shop_users(id BIGSERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL DEFAULT '', pass_hash TEXT NOT NULL, created_at BIGINT NOT NULL);
ALTER TABLE shop_users ADD COLUMN IF NOT EXISTS character_id TEXT;
ALTER TABLE shop_users ADD COLUMN IF NOT EXISTS avatar_seed TEXT;
ALTER TABLE shop_users ADD COLUMN IF NOT EXISTS avatar_style TEXT;
CREATE TABLE IF NOT EXISTS shop_materials(id BIGSERIAL PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT 'Бусад', price INTEGER NOT NULL DEFAULT 0, active BOOLEAN NOT NULL DEFAULT true, created_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS shop_files(id BIGSERIAL PRIMARY KEY, material_id BIGINT NOT NULL REFERENCES shop_materials(id) ON DELETE CASCADE, role TEXT NOT NULL, ord INTEGER NOT NULL DEFAULT 0, mime TEXT NOT NULL, data BYTEA NOT NULL);
CREATE INDEX IF NOT EXISTS files_m ON shop_files(material_id, role, ord);
CREATE TABLE IF NOT EXISTS shop_purchases(user_id BIGINT NOT NULL REFERENCES shop_users(id), material_id BIGINT NOT NULL REFERENCES shop_materials(id) ON DELETE CASCADE, created_at BIGINT NOT NULL, PRIMARY KEY(user_id, material_id));
CREATE TABLE IF NOT EXISTS shop_payments(id BIGSERIAL PRIMARY KEY, order_no TEXT UNIQUE NOT NULL, user_id BIGINT NOT NULL REFERENCES shop_users(id), material_id BIGINT NOT NULL REFERENCES shop_materials(id) ON DELETE CASCADE, invoice_id TEXT NOT NULL, amount INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at BIGINT NOT NULL, paid_at BIGINT);
ALTER TABLE shop_payments ADD COLUMN IF NOT EXISTS bank_reference TEXT; ALTER TABLE shop_payments ADD COLUMN IF NOT EXISTS confirmed_at BIGINT;
CREATE TABLE IF NOT EXISTS lesson_package_payments(id BIGSERIAL PRIMARY KEY, order_no TEXT UNIQUE NOT NULL, user_id BIGINT NOT NULL REFERENCES shop_users(id), package_type TEXT NOT NULL CHECK(package_type IN ('pages5','week7')), invoice_id TEXT NOT NULL, amount INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at BIGINT NOT NULL, paid_at BIGINT);
ALTER TABLE lesson_package_payments ADD COLUMN IF NOT EXISTS bank_reference TEXT; ALTER TABLE lesson_package_payments ADD COLUMN IF NOT EXISTS confirmed_at BIGINT;
CREATE TABLE IF NOT EXISTS lesson_packages(id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES shop_users(id), package_type TEXT NOT NULL, paid_amount INTEGER NOT NULL, total_pages INTEGER NOT NULL, used_pages INTEGER NOT NULL DEFAULT 0, daily_limit INTEGER NOT NULL, starts_at BIGINT NOT NULL, expires_at BIGINT, status TEXT NOT NULL DEFAULT 'active', created_at BIGINT NOT NULL);
ALTER TABLE lesson_packages ADD COLUMN IF NOT EXISTS payment_order_no TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS lesson_packages_payment_order ON lesson_packages(payment_order_no) WHERE payment_order_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS lesson_packages_user ON lesson_packages(user_id, status, expires_at);
CREATE TABLE IF NOT EXISTS lesson_usage(id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES shop_users(id), package_id BIGINT NOT NULL REFERENCES lesson_packages(id), source_pages INTEGER NOT NULL, input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0, model TEXT NOT NULL, created_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS training_orders(id BIGSERIAL PRIMARY KEY, order_no TEXT UNIQUE NOT NULL, email TEXT NOT NULL, item TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', amount INTEGER NOT NULL CHECK(amount > 0), status TEXT NOT NULL DEFAULT 'pending', created_at BIGINT NOT NULL, paid_at BIGINT, bank_reference TEXT, confirmed_at BIGINT);
CREATE TABLE IF NOT EXISTS diary_entries(id BIGSERIAL PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL, excerpt TEXT NOT NULL DEFAULT '', entry_date DATE NOT NULL DEFAULT CURRENT_DATE, status TEXT NOT NULL DEFAULT 'draft', image_url TEXT, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL);
CREATE INDEX IF NOT EXISTS diary_entries_public ON diary_entries(status, entry_date DESC, id DESC);
${sheetshop.ddl}`);
}
const app = express();
app.set('trust proxy', 1);
// Нууц файлуудыг (код, тохиргоо, өгөгдөл) нийтэд нээхгүй
const DENY = /^\/(server\.js|server-code\.txt|qpay\.js|bagsh-app\.js|bagsh-qpay\.js|sheetshop-api\.js|worksheet\.js|package(-lock)?\.json|\.env.*|env\.(example|integrated\.example)|\.git.*|netlify.*|readme\.md|.*-MN\.(txt|md)|literature_db\.txt|node_modules.*|.*\.xlsx)$/i;
app.use((req, res, next) => { let p = ''; try { p = decodeURIComponent(req.path); } catch { return res.status(400).end(); } DENY.test(p) ? res.status(404).end() : next(); });
app.use((req, res, next) => (req.path.startsWith('/api/worksheet/') || req.path === '/api/admin/materials' || req.path === '/api/lesson-plan') && req.method === 'POST' ? next() : express.json({ limit: '100kb' })(req, res, next));
let ready = false;
app.use('/api', (req, res, next) => (ready || req.path === '/lesson-plan') ? next() : res.status(503).json({ error: 'Систем бэлдэж байна. Түр хүлээгээд дахин оролдоно уу.' }));

// Багшийн туслах: үндсэн сайтад нэг домэйнээр холбосон боловч өөрийн Supabase/эрхийн сангаа ашиглана.
const bagsh = require('./bagsh-app');
app.use('/api/worksheet', bagsh.router);
app.get(['/bagsh', '/bagsh/'], (req, res) => res.sendFile(path.join(__dirname, 'bagsh-index.html')));
app.get(['/bagsh/admin', '/bagsh/admin.html', '/bagsh-admin'], (req, res) => res.sendFile(path.join(__dirname, 'bagsh-admin.html')));
app.get('/bagsh/pay-qr.jpg', (req, res) => res.redirect(302, '/qr.png'));
const ah = fn => (req, res, next) => fn(req, res, next).catch(e => { console.error(req.path, e.message); if (!res.headersSent) res.status(500).json({ error: req.path.startsWith('/api/admin/') ? 'Серверийн алдаа: ' + e.message : 'Серверийн алдаа' }); });
const hits = new Map();
const limit = (max, ms) => (req, res, next) => { const k = req.ip + req.path, now = Date.now(), a = (hits.get(k) || []).filter(t => now - t < ms); if (a.length >= max) return res.status(429).json({ error: 'Хэт олон оролдлого. Түр хүлээнэ үү.' }); a.push(now); hits.set(k, a); next(); };
setInterval(() => { const n = Date.now(); for (const [k, a] of hits) if (!a.some(t => n - t < 3600e3)) hits.delete(k); }, 600e3).unref();

// ---- хэрэглэгч, session (httpOnly cookie) ----
const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(c => c.trim()).filter(Boolean).map(c => { const i = c.indexOf('='); return [c.slice(0, i), decodeURIComponent(c.slice(i + 1))]; }));
const pub = u => ({
  id: u.id, email: u.email, name: u.name,
  characterId: u.character_id || null,
  avatarSeed: u.avatar_seed || null,
  avatarStyle: u.avatar_style || null
});
const login = (res, u) => res.cookie('sid', jwt.sign({ uid: u.id }, JWT_SECRET, { expiresIn: '60d' }), { httpOnly: true, sameSite: 'lax', secure: SECURE, maxAge: 60 * 864e5 });
async function userOf(req) { try { return (await q('SELECT * FROM shop_users WHERE id=$1', [jwt.verify(cookies(req).sid, JWT_SECRET).uid])).rows[0] || null; } catch { return null; } }
const need = ah(async (req, res, next) => { req.user = await userOf(req); req.user ? next() : res.status(401).json({ error: 'Нэвтэрнэ үү' }); });
app.post('/api/auth/register', limit(10, 3600e3), ah(async (req, res) => {
  const email = String(req.body.email || '').toLowerCase().trim();
  const pw = String(req.body.password || '');
  const name = String(req.body.name || '').trim().slice(0, 60);
  const characterId = String(req.body.characterId || '').trim();
  const avatarSeed = String(req.body.avatarSeed || '').trim().slice(0, 40);
  const avatarStyle = String(req.body.avatarStyle || '').trim().slice(0, 40);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'И-мэйл хаягаа зөв бичнэ үү.' });
  if (!name) return res.status(400).json({ error: 'Нэрээ оруулна уу.' });
  if (pw.length < 8 || pw.length > 200) return res.status(400).json({ error: 'Нууц үг 8–200 тэмдэгт байх ёстой.' });
  const allowedCharacters = ['anir','tsovoo','todoo','enkhrii','azaa'];
  if (characterId && !allowedCharacters.includes(characterId)) return res.status(400).json({ error: 'Сонгосон найзын мэдээлэл буруу байна. Дахин сонгоно уу.' });
  try {
    const u = (await q('INSERT INTO shop_users(email,name,pass_hash,created_at,character_id,avatar_seed,avatar_style) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [email, name, bcrypt.hashSync(pw, 10), Date.now(), characterId || null, avatarSeed || null, avatarStyle || null])).rows[0];
    login(res, u);
    res.status(201).json({ user: pub(u) });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Энэ и-мэйл өмнө нь бүртгэгдсэн байна. Нэвтрэх хэсгээр орно уу.' });
    throw e;
  }
}));
app.post('/api/auth/login', limit(20, 900e3), ah(async (req, res) => {
  const u = (await q('SELECT * FROM shop_users WHERE email=$1', [String(req.body.email || '').toLowerCase().trim()])).rows[0];
  if (!u || !bcrypt.compareSync(String(req.body.password || ''), u.pass_hash)) return res.status(401).json({ error: 'И-мэйл эсвэл нууц үг буруу' });
  login(res, u); res.json({ user: pub(u) });
}));
app.post('/api/auth/logout', (req, res) => { res.clearCookie('sid'); res.json({ ok: true }); });
app.get('/api/auth/me', ah(async (req, res) => { const u = await userOf(req); res.json({ user: u ? pub(u) : null }); }));

// ---- материал, эрх ----
const owned = async (m, u) => m.price === 0 || (!!u && (await q('SELECT 1 FROM shop_purchases WHERE user_id=$1 AND material_id=$2', [u.id, m.id])).rowCount > 0);
const material = async id => (await q('SELECT * FROM shop_materials WHERE id=$1 AND active=true', [parseInt(id) || 0])).rows[0];
app.get('/api/materials', ah(async (req, res) => {
  const u = await userOf(req), mine = u ? new Set((await q('SELECT material_id FROM shop_purchases WHERE user_id=$1', [u.id])).rows.map(r => r.material_id)) : new Set();
  const rows = (await q('SELECT id,title,description,category,price,created_at FROM shop_materials WHERE active=true ORDER BY created_at DESC')).rows;
  res.json(rows.map(m => ({ ...m, owned: m.price === 0 || mine.has(m.id) })));
}));
app.get('/api/my', need, ah(async (req, res) => res.json((await q('SELECT m.id,m.title,m.description,m.category,m.price,p.created_at "boughtAt" FROM shop_purchases p JOIN shop_materials m ON m.id=p.material_id WHERE p.user_id=$1 AND m.active=true ORDER BY p.created_at DESC', [req.user.id])).rows)));
const sendFile = (res, f) => { res.set({ 'Content-Type': f.mime, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline' }); res.send(f.data); };
app.get('/api/materials/:id/cover', ah(async (req, res) => {
  const f = (await q("SELECT f.mime,f.data FROM shop_files f JOIN shop_materials m ON m.id=f.material_id WHERE m.id=$1 AND m.active=true AND f.role='cover' LIMIT 1", [parseInt(req.params.id) || 0])).rows[0];
  if (!f) return res.status(404).end(); res.set('Cache-Control', 'public, max-age=300'); res.set('Content-Type', f.mime); res.send(f.data);
}));
// хуудас бүрийг эрх шалгаж өгнө (нийтэд нээлттэй URL биш)
app.get('/api/materials/:id/page/:n', ah(async (req, res) => {
  const m = await material(req.params.id); if (!m) return res.status(404).end();
  if (!(await owned(m, await userOf(req)))) return res.status(403).end();
  const f = (await q("SELECT mime,data FROM shop_files WHERE material_id=$1 AND role='page' ORDER BY ord OFFSET $2 LIMIT 1", [m.id, Math.max(0, (parseInt(req.params.n) || 1) - 1)])).rows[0];
  f ? sendFile(res, f) : res.status(404).end();
}));
app.get('/api/materials/:id/print', ah(async (req, res) => {
  const m = await material(req.params.id), u = await userOf(req); res.set('Cache-Control', 'no-store');
  const msg = t => res.status(403).type('html').send(`<meta charset="utf-8"><body style="font:18px system-ui;padding:40px;text-align:center">${t}<p><a href="/materials.html">← Сургалтын материал</a></p>`);
  if (!m) return res.status(404).type('html').send('<meta charset="utf-8">Материал олдсонгүй');
  if (!(await owned(m, u))) return msg(u ? 'Энэ материалыг хэвлэхийн тулд эхлээд худалдаж авна уу.' : 'Төлбөртэй материал. Эхлээд нэвтэрч, худалдаж авна уу.');
  const n = (await q("SELECT COUNT(*) c FROM shop_files WHERE material_id=$1 AND role='page'", [m.id])).rows[0].c;
  if (!n) return msg('Энэ материалын хуудас хараахан нэмэгдээгүй байна.');
  const imgs = Array.from({ length: n }, (_, i) => `<img class="pg" alt="Хуудас ${i + 1}" src="/api/materials/${m.id}/page/${i + 1}">`).join('');
  res.type('html').send(`<!doctype html><html lang="mn"><meta charset="utf-8"><title>${esc(m.title)}</title><style>@page{size:A4;margin:8mm}body{margin:0;background:#eee;font-family:system-ui}.bar{position:sticky;top:0;background:#fff;padding:10px;text-align:center;box-shadow:0 1px 6px #0002}.bar button{font:700 16px system-ui;padding:10px 22px;border:0;border-radius:10px;background:#b8763f;color:#fff;cursor:pointer}.pg{display:block;margin:10px auto;max-width:100%;background:#fff}@media print{.bar{display:none}body{background:#fff}.pg{margin:0;width:100%;page-break-after:always;break-after:page}}</style><div class="bar"><button onclick="print()">🖨️ Хэвлэх</button></div>${imgs}<script>let k=0;document.querySelectorAll('.pg').forEach(i=>i.complete?k++:i.onload=()=>{if(++k===${n})setTimeout(print,300)});if(k===${n})setTimeout(print,300)</script></html>`);
}));

// ---- худалдан авалт, төлбөр (QPay / гар баталгаажуулалт) ----
async function activate(orderNo, bankReference = null) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const p = await c.query("UPDATE shop_payments SET status='paid', paid_at=$2, bank_reference=$3, confirmed_at=$2 WHERE order_no=$1 AND status='pending' RETURNING user_id, material_id", [orderNo, Date.now(), bankReference]);
    if (!p.rowCount) { await c.query('ROLLBACK'); return false; }
    await c.query('INSERT INTO shop_purchases(user_id,material_id,created_at) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [p.rows[0].user_id, p.rows[0].material_id, Date.now()]);
    await c.query('COMMIT'); return true;
  } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; } finally { c.release(); }
}
async function verify(orderNo) {
  const p = (await q('SELECT * FROM shop_payments WHERE order_no=$1', [orderNo])).rows[0];
  if (!p) return 'unknown'; if (p.status === 'paid') return 'paid';
  if (await qpay.isPaid(p.invoice_id, p.amount)) { await activate(orderNo); return 'paid'; }
  return 'pending';
}
app.post('/api/buy', need, limit(30, 3600e3), ah(async (req, res) => {
  if (qpay.MODE === 'mock' && (process.env.RENDER || process.env.NODE_ENV === 'production')) return res.status(503).json({ error: 'Төлбөрийн горим тохируулаагүй байна. QPAY_MODE=manual эсвэл live тохируулна уу.' });
  const m = await material(req.body.materialId);
  if (!m) return res.status(404).json({ error: 'Материал олдсонгүй' });
  if (m.price === 0) return res.status(400).json({ error: 'Үнэгүй материал. Шууд хэвлэж болно.' });
  if (await owned(m, req.user)) return res.status(409).json({ error: 'Та энэ материалыг аль хэдийн авсан байна (Миний сан)' });
  const manual = qpay.MODE === 'manual';
  if (manual) {
    const pending = (await q("SELECT order_no AS \"orderNo\",amount FROM shop_payments WHERE user_id=$1 AND material_id=$2 AND amount=$3 AND status='pending' AND invoice_id LIKE 'MANUAL-%' ORDER BY created_at DESC LIMIT 1", [req.user.id,m.id,m.price])).rows[0];
    if (pending) return res.json({ ...pending, invoiceId:'MANUAL-'+pending.orderNo, manual:true, mock:false, qrUrl:'/qr.png', reused:true });
  }
  for (let i = 0; i < 3; i++) {
    const orderNo = manual ? 'BT' + crypto.randomInt(10000, 100000) : 'BT' + Date.now() + crypto.randomBytes(3).toString('hex');
    try {
      const inv = await qpay.createInvoice({ orderNo, amount: m.price, description: m.title.slice(0, 80) });
      await q('INSERT INTO shop_payments(order_no,user_id,material_id,invoice_id,amount,created_at) VALUES($1,$2,$3,$4,$5,$6)', [orderNo, req.user.id, m.id, inv.invoiceId, m.price, Date.now()]);
      return res.json({ orderNo, amount: m.price, ...inv, mock: qpay.MODE === 'mock', manual, qrUrl: manual ? '/qr.png' : null });
    } catch (e) { if (e.code !== '23505') { console.error('buy:', e.message); return res.status(502).json({ error: 'Нэхэмжлэх үүсгэж чадсангүй. Дахин оролдоно уу.' }); } }
  }
  res.status(500).json({ error: 'Дахин оролдоно уу' });
}));
app.post('/api/pay/check', need, ah(async (req, res) => {
  const p = (await q('SELECT 1 FROM shop_payments WHERE order_no=$1 AND user_id=$2', [String(req.body.orderNo || ''), req.user.id])).rows[0];
  if (!p) return res.status(404).json({ error: 'Олдсонгүй' });
  try { res.json({ status: await verify(String(req.body.orderNo)) }); } catch (e) { console.error('check:', e.message); res.status(502).json({ error: 'Төлбөр шалгаж чадсангүй' }); }
}));
app.all('/api/pay/callback', async (req, res) => { try { await verify(String(req.query.order || '')); } catch {} res.sendStatus(200); });

// ---- админ (/admin): ADMIN_KEY-ээр хамгаалагдсан, сервер талд шалгана ----
const adminAuth = (req, res, next) => {
  const a = Buffer.from(String(req.headers['x-admin-key'] || '')), b = Buffer.from(ADMIN_KEY);
  if (ADMIN_KEY.length < 12 || a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: 'Админ түлхүүр буруу' });
  next();
};
const A = [limit(120, 900e3), adminAuth];
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/api/admin/pending', ...A, ah(async (req, res) => res.json((await q(`SELECT p.order_no "orderNo", p.amount, p.created_at "createdAt", u.email, m.title FROM shop_payments p JOIN shop_users u ON u.id=p.user_id JOIN shop_materials m ON m.id=p.material_id WHERE p.status='pending' AND p.invoice_id LIKE 'MANUAL-%' ORDER BY p.created_at DESC LIMIT 100`)).rows)));
app.post('/api/admin/confirm', ...A, ah(async (req, res) => {
  const o = String(req.body.orderNo || ''), ref = String(req.body.bankReference || '').trim().slice(0, 120);
  if (!ref) return res.status(400).json({ error: 'Банкны гүйлгээний дугаар эсвэл лавлагааг оруулна уу.' });
  if (!(await q("SELECT 1 FROM shop_payments WHERE order_no=$1 AND invoice_id LIKE 'MANUAL-%'", [o])).rowCount) return res.status(404).json({ error: 'Олдсонгүй' });
  res.json({ ok: true, activated: await activate(o, ref) });
}));
app.get('/api/admin/materials', ...A, ah(async (req, res) => res.json((await q(`SELECT m.id,m.title,m.description,m.category,m.price,m.active,(SELECT COUNT(*) FROM shop_files f WHERE f.material_id=m.id AND f.role='page') pages,(SELECT COUNT(*) FROM shop_purchases p WHERE p.material_id=m.id) sold FROM shop_materials m ORDER BY m.created_at DESC`)).rows)));
const b64 = f => { const m = String((f && f.mime) || ''), d = String((f && f.data) || '').replace(/^data:[^,]*,/, ''); return IMG.includes(m) && /^[A-Za-z0-9+/=]+$/.test(d) && d.length > 20 ? { mime: m, data: Buffer.from(d, 'base64') } : null; };
const fields = b => ({ title: String(b.title || '').trim().slice(0, 120), description: String(b.description || '').trim().slice(0, 600), category: String(b.category || 'Бусад').trim().slice(0, 40) || 'Бусад', price: Math.max(0, Math.min(1e6, parseInt(b.price) || 0)) });
app.post('/api/admin/materials', ...A, express.json({ limit: '30mb' }), ah(async (req, res) => {
  const f = fields(req.body), pages = (Array.isArray(req.body.pages) ? req.body.pages : []).slice(0, 40).map(b64), cover = b64(req.body.cover);
  if (!f.title || pages.some(p => !p) || (!cover && !pages.length)) return res.status(400).json({ error: 'Нэр, зураг (JPG/PNG/WEBP) зөв оруулна уу' });
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const id = (await c.query('INSERT INTO shop_materials(title,description,category,price,created_at) VALUES($1,$2,$3,$4,$5) RETURNING id', [f.title, f.description, f.category, f.price, Date.now()])).rows[0].id;
    const cv = cover || pages[0];
    await c.query("INSERT INTO shop_files(material_id,role,ord,mime,data) VALUES($1,'cover',0,$2,$3)", [id, cv.mime, cv.data]);
    for (let i = 0; i < pages.length; i++) await c.query("INSERT INTO shop_files(material_id,role,ord,mime,data) VALUES($1,'page',$2,$3,$4)", [id, i, pages[i].mime, pages[i].data]);
    await c.query('COMMIT'); res.json({ ok: true, id });
  } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; } finally { c.release(); }
}));
app.post('/api/admin/materials/:id', ...A, ah(async (req, res) => {
  const f = fields(req.body), active = req.body.active !== false;
  if (!f.title) return res.status(400).json({ error: 'Нэр хоосон байна' });
  res.json({ ok: (await q('UPDATE shop_materials SET title=$2,description=$3,category=$4,price=$5,active=$6 WHERE id=$1', [parseInt(req.params.id) || 0, f.title, f.description, f.category, f.price, active])).rowCount === 1 });
}));

// ---- Ээлжит хичээлийн төлбөрт багц ----
const PACKAGE_OPTIONS = { pages5: { amount: 5000, pages: 5, daily: 10, days: null, title: '5 ээлжит хичээлийн багц' }, week7: { amount: 10000, pages: 70, daily: 10, days: 7, title: '7 хоногийн багц' } };
async function currentLessonPackage(userId) {
  const now = Date.now();
  await q("UPDATE lesson_packages SET status='expired' WHERE user_id=$1 AND status='active' AND expires_at IS NOT NULL AND expires_at <= $2", [userId, now]);
  const r = await q("SELECT *, GREATEST(0,total_pages-used_pages) remaining_pages FROM lesson_packages WHERE user_id=$1 AND status='active' AND (expires_at IS NULL OR expires_at>$2) AND used_pages<total_pages ORDER BY created_at DESC LIMIT 1", [userId, now]);
  const pkg = r.rows[0] || null;
  if (!pkg) return { package: null, status: 'expired', message: 'Эрх дууссан' };
  const day = new Date(now).toLocaleDateString('en-CA', { timeZone: 'Asia/Ulaanbaatar' });
  const daily = await q("SELECT COUNT(*)::int n FROM lesson_usage WHERE package_id=$1 AND (to_timestamp(created_at/1000.0) AT TIME ZONE 'Asia/Ulaanbaatar')::date=$2::date", [pkg.id, day]);
  return { package: { id: pkg.id, type: pkg.package_type, totalPages: pkg.total_pages, usedPages: pkg.used_pages, remainingPages: pkg.remaining_pages, dailyLimit: pkg.daily_limit, usedToday: daily.rows[0].n, expiresAt: pkg.expires_at, status: 'active' }, status: 'active', message: 'Танд эрх байна' };
}
async function activateLessonPackage(orderNo, bankReference = null) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    // Lock the payment row so two admin clicks cannot create two entitlements.
    const found = await c.query('SELECT * FROM lesson_package_payments WHERE order_no=$1 FOR UPDATE', [orderNo]);
    if (!found.rowCount) { await c.query('ROLLBACK'); return false; }
    const payment = found.rows[0];
    const option = PACKAGE_OPTIONS[payment.package_type];
    if (!option || Number(payment.amount) !== option.amount) {
      await c.query('ROLLBACK'); throw new Error('Багцын үнэ эсвэл төрөл тохирохгүй байна');
    }

    // Already activated? Return success only if the entitlement exists.
    const existing = await c.query('SELECT id FROM lesson_packages WHERE payment_order_no=$1', [orderNo]);
    if (existing.rowCount) {
      if (payment.status !== 'paid') {
        await c.query("UPDATE lesson_package_payments SET status='paid', paid_at=COALESCE(paid_at,$2), confirmed_at=COALESCE(confirmed_at,$2), bank_reference=COALESCE(bank_reference,$3) WHERE order_no=$1", [orderNo, Date.now(), bankReference]);
      }
      await c.query('COMMIT'); return true;
    }

    // For a previously paid legacy order, do not create a second entitlement
    // if a matching package was already created by the older code.
    if (payment.status === 'paid') {
      const legacy = await c.query(
        "SELECT id FROM lesson_packages WHERE user_id=$1 AND package_type=$2 AND paid_amount=$3 AND created_at BETWEEN $4 AND $5 ORDER BY created_at DESC LIMIT 1",
        [payment.user_id, payment.package_type, payment.amount, Number(payment.paid_at || payment.confirmed_at || payment.created_at)-120000, Number(payment.paid_at || payment.confirmed_at || payment.created_at)+600000]
      );
      if (legacy.rowCount) { await c.query('COMMIT'); return true; }
      // Paid but no entitlement: only repair if the previous admin confirmation left an audit reference.
      if (!payment.bank_reference && !bankReference) {
        await c.query('ROLLBACK'); return false;
      }
    } else if (payment.status !== 'pending') {
      await c.query('ROLLBACK'); return false;
    }

    const now = Date.now();
    await c.query("UPDATE lesson_packages SET status='replaced' WHERE user_id=$1 AND status='active'", [payment.user_id]);
    await c.query(
      "INSERT INTO lesson_packages(user_id,package_type,paid_amount,total_pages,daily_limit,starts_at,expires_at,status,created_at,payment_order_no) VALUES($1,$2,$3,$4,$5,$6,$7,'active',$6,$8)",
      [payment.user_id, payment.package_type, payment.amount, option.pages, option.daily, now, option.days ? now + option.days*86400000 : null, orderNo]
    );
    await c.query(
      "UPDATE lesson_package_payments SET status='paid', paid_at=COALESCE(paid_at,$2), bank_reference=COALESCE(bank_reference,$3), confirmed_at=COALESCE(confirmed_at,$2) WHERE order_no=$1",
      [orderNo, now, bankReference]
    );
    await c.query('COMMIT'); return true;
  } catch(e) { await c.query('ROLLBACK').catch(()=>{}); throw e; } finally { c.release(); }
}
async function verifyLessonPackage(orderNo) {
  const p=(await q('SELECT * FROM lesson_package_payments WHERE order_no=$1',[orderNo])).rows[0];
  if(!p) return 'unknown'; if(p.status==='paid') return 'paid';
  if(await qpay.isPaid(p.invoice_id,p.amount)){ await activateLessonPackage(orderNo); return 'paid'; }
  return 'pending';
}
app.get('/api/lesson-package/status', need, ah(async(req,res)=>res.json(await currentLessonPackage(req.user.id))));
app.post('/api/lesson-package/buy', need, limit(10,3600e3), ah(async(req,res)=>{
  if(qpay.MODE==='mock' && (process.env.RENDER || process.env.NODE_ENV==='production')) return res.status(503).json({error:'Төлбөрийн горим тохируулаагүй байна. QPAY_MODE=manual эсвэл live тохируулна уу.'});
  const type=String(req.body.packageType||''), o=PACKAGE_OPTIONS[type]; if(!o) return res.status(400).json({error:'Багцаа сонгоно уу'});
  const manual = qpay.MODE === 'manual';
  if (manual) {
    const pending=(await q("SELECT order_no AS \"orderNo\",amount FROM lesson_package_payments WHERE user_id=$1 AND package_type=$2 AND amount=$3 AND status='pending' AND invoice_id LIKE 'MANUAL-%' ORDER BY created_at DESC LIMIT 1",[req.user.id,type,o.amount])).rows[0];
    if(pending) return res.json({...pending,title:o.title,invoiceId:'MANUAL-'+pending.orderNo,manual:true,mock:false,qrUrl:'/qr.png',reused:true});
  }
  for (let i = 0; i < 5; i++) {
    // Гар горимд хэрэглэгч гүйлгээний утгад бичих тул богино код (LP12345); бусад горимд урт код
    const orderNo = manual ? 'LP' + crypto.randomInt(10000, 100000) : 'LP' + Date.now() + crypto.randomBytes(3).toString('hex');
    try {
      const inv = await qpay.createInvoice({ orderNo, amount: o.amount, description: o.title, callbackUrl: process.env.PUBLIC_URL ? `${String(process.env.PUBLIC_URL).replace(/\/+$/,'')}/api/lesson-package/callback?order=${orderNo}` : undefined });
      await q('INSERT INTO lesson_package_payments(order_no,user_id,package_type,invoice_id,amount,created_at) VALUES($1,$2,$3,$4,$5,$6)',[orderNo,req.user.id,type,inv.invoiceId,o.amount,Date.now()]);
      return res.json({orderNo,amount:o.amount,title:o.title,...inv,manual,mock:qpay.MODE==='mock',qrUrl:manual?'/qr.png':null});
    } catch (e) { if (e.code !== '23505') { console.error('lesson-package buy:', e.message); return res.status(502).json({ error: 'Нэхэмжлэх үүсгэж чадсангүй. Дахин оролдоно уу.' }); } }
  }
  res.status(500).json({ error: 'Дахин оролдоно уу' });
}));
app.post('/api/lesson-package/check', need, ah(async(req,res)=>{
  const orderNo=String(req.body.orderNo||''), p=(await q('SELECT 1 FROM lesson_package_payments WHERE order_no=$1 AND user_id=$2',[orderNo,req.user.id])).rowCount;
  if(!p) return res.status(404).json({error:'Төлбөрийн хүсэлт олдсонгүй'});
  try { const status=await verifyLessonPackage(orderNo); res.json({status, ...(status==='paid'?await currentLessonPackage(req.user.id):{})}); }
  catch(e){ console.error('lesson package check:',e.message); res.status(502).json({error:'Төлбөр шалгаж чадсангүй'}); }
}));
app.all('/api/lesson-package/callback',async(req,res)=>{try{await verifyLessonPackage(String(req.query.order||''));}catch(e){console.error('package callback:',e.message);}res.sendStatus(200);});
app.get('/api/admin/lesson-packages/pending', ...A, ah(async(req,res)=>res.json((await q("SELECT p.order_no \"orderNo\",p.amount,p.package_type \"packageType\",p.created_at \"createdAt\",u.email FROM lesson_package_payments p JOIN shop_users u ON u.id=p.user_id WHERE p.status='pending' AND p.invoice_id LIKE 'MANUAL-%' ORDER BY p.created_at DESC LIMIT 100")).rows)));
app.post('/api/admin/lesson-packages/confirm', ...A, ah(async(req,res)=>{const o=String(req.body.orderNo||''),ref=String(req.body.bankReference||'').trim().slice(0,120);if(!ref)return res.status(400).json({error:'Банкны гүйлгээний дугаар эсвэл лавлагааг оруулна уу.'});if(!(await q("SELECT 1 FROM lesson_package_payments WHERE order_no=$1 AND invoice_id LIKE 'MANUAL-%'",[o])).rowCount)return res.status(404).json({error:'Олдсонгүй'});res.json({ok:true,activated:await activateLessonPackage(o,ref)});}));


// ---- Сургалтын бүртгэлийн төлбөр (банкнаас гар аргаар тулган баталгаажуулна) ----
app.post('/api/training/orders', limit(10, 3600e3), ah(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const item = String(req.body.item || '').trim().slice(0, 180);
  const note = String(req.body.note || '').trim().slice(0, 500);
  const amount = Math.floor(Number(req.body.amount));
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Зөв и-мэйл хаяг оруулна уу.' });
  if (!item || !Number.isSafeInteger(amount) || amount < 1 || amount > 5000000) return res.status(400).json({ error: 'Сургалтын нэр эсвэл төлөх дүн буруу байна.' });
  const orderNo = 'TR' + Date.now() + crypto.randomBytes(3).toString('hex').toUpperCase();
  await q('INSERT INTO training_orders(order_no,email,item,note,amount,created_at) VALUES($1,$2,$3,$4,$5,$6)', [orderNo,email,item,note,amount,Date.now()]);
  res.status(201).json({ ok: true, orderNo, amount, status: 'pending' });
}));

// ---- Бүх үйлчилгээний төлбөрийн нэгтгэсэн админ API ----
app.get('/api/admin/lesson-package-status/:orderNo', ...A, ah(async (req, res) => {
  const orderNo = String(req.params.orderNo || '').trim();
  const payment = (await q(
    `SELECT p.order_no AS "orderNo", p.user_id AS "userId", u.email, p.package_type AS "packageType",
            p.amount, p.status AS "paymentStatus", p.bank_reference AS "bankReference",
            p.created_at AS "createdAt", p.paid_at AS "paidAt", p.confirmed_at AS "confirmedAt"
       FROM lesson_package_payments p JOIN shop_users u ON u.id=p.user_id WHERE p.order_no=$1`,
    [orderNo]
  )).rows[0];
  if (!payment) return res.status(404).json({ error: 'Захиалга олдсонгүй' });
  const entitlement = (await q(
    `SELECT id, package_type AS "packageType", paid_amount AS "paidAmount", total_pages AS "totalPages",
            used_pages AS "usedPages", daily_limit AS "dailyLimit", starts_at AS "startsAt",
            expires_at AS "expiresAt", status, payment_order_no AS "paymentOrderNo"
       FROM lesson_packages
      WHERE payment_order_no=$1
         OR (user_id=$2 AND package_type=$3 AND paid_amount=$4
             AND created_at BETWEEN $5 AND $6)
      ORDER BY created_at DESC LIMIT 1`,
    [orderNo, payment.userId, payment.packageType, payment.amount,
     Number(payment.paidAt || payment.confirmedAt || payment.createdAt)-120000,
     Number(payment.paidAt || payment.confirmedAt || payment.createdAt)+600000]
  )).rows[0] || null;
  res.json({ payment, entitlement, entitlementActive: !!entitlement && entitlement.status === 'active' && (!entitlement.expiresAt || Number(entitlement.expiresAt) > Date.now()) });
}));

// Бүх төлөвтэй сүүлийн захиалгууд + төлбөрийн горим: «захиалга харагдахгүй байна» гэх үед шалтгааныг шууд харуулна
const sheetshop = require('./sheetshop-api')({ app, q, ah, limit, need, userOf, crypto });
app.get('/api/admin/recent-orders', ...A, ah(async (req, res) => {
  const mk = (kind, service) => r => ({ ...r, kind, service, amount: Number(r.amount), createdAt: Number(r.createdAt), paidAt: r.paidAt == null ? null : Number(r.paidAt),
    channel: String(r.invoiceId || '').startsWith('MANUAL-') ? 'manual' : String(r.invoiceId || '').startsWith('MOCK-') ? 'mock' : (r.invoiceId ? 'live' : '') });
  const names = ['shop', 'lesson', 'worksheet', 'training', 'sheetshop'];
  const res4 = await Promise.allSettled([
    q(`SELECT p.order_no AS "orderNo", p.status, p.amount, p.created_at AS "createdAt", p.paid_at AS "paidAt", p.invoice_id AS "invoiceId", u.email, m.title AS detail
       FROM shop_payments p JOIN shop_users u ON u.id=p.user_id JOIN shop_materials m ON m.id=p.material_id ORDER BY p.created_at DESC LIMIT 40`),
    q(`SELECT p.order_no AS "orderNo", p.status, p.amount, p.created_at AS "createdAt", p.paid_at AS "paidAt", p.invoice_id AS "invoiceId", u.email,
       CASE p.package_type WHEN 'week7' THEN '7 хоногийн багц' ELSE '5 ээлжит хичээлийн багц' END AS detail FROM lesson_package_payments p JOIN shop_users u ON u.id=p.user_id ORDER BY p.created_at DESC LIMIT 40`),
    bagsh.adminRecentPayments(40),
    q(`SELECT order_no AS "orderNo", status, amount, created_at AS "createdAt", paid_at AS "paidAt", email, item AS detail FROM training_orders ORDER BY created_at DESC LIMIT 40`),
    sheetshop.recent(40)
  ]);
  const val = i => res4[i].status === 'fulfilled' ? (res4[i].value.rows || res4[i].value) : [];
  const rows = [
    ...val(0).map(mk('material', 'Цахим дэлгүүр')), ...val(1).map(mk('lesson', 'Ээлжит хичээл')),
    ...val(2).map(r => mk('worksheet', 'Ажлын хуудас')({ ...r, detail: `${r.qty || 1} эрх` })), ...val(3).map(mk('training', 'Сургалтын бүртгэл')),
    ...val(4).map(({ items, ...r }) => mk('sheetshop', 'Цахим дэлгүүр (PDF, судоку)')({ ...r, detail: sheetshop.detail(items) }))
  ].sort((a, b) => b.createdAt - a.createdAt).slice(0, 80).map(r => { const { invoiceId, ...rest } = r; return rest; });
  res.json({ mode: qpay.MODE, rows, sources: res4.map((x, i) => names[i] + ':' + x.status).join(',') });
}));

app.get('/api/admin/all-pending', ...A, ah(async (req, res) => {
  // Нэг үйлчилгээний сан түр тасарсан ч бусад үйлчилгээний захиалгыг харуулна.
  const sources = await Promise.allSettled([
    q(`SELECT p.order_no AS "orderNo", p.amount, p.created_at AS "createdAt", u.email, m.title AS detail
       FROM shop_payments p JOIN shop_users u ON u.id=p.user_id JOIN shop_materials m ON m.id=p.material_id
       WHERE p.status='pending' AND p.invoice_id LIKE 'MANUAL-%' ORDER BY p.created_at DESC LIMIT 100`),
    q(`SELECT p.order_no AS "orderNo", p.amount, p.created_at AS "createdAt", u.email, p.package_type AS detail
       FROM lesson_package_payments p JOIN shop_users u ON u.id=p.user_id
       WHERE p.status='pending' AND p.invoice_id LIKE 'MANUAL-%' ORDER BY p.created_at DESC LIMIT 100`),
    bagsh.adminPendingPayments(),
    q(`SELECT order_no AS "orderNo", amount, created_at AS "createdAt", email, item AS detail FROM training_orders WHERE status='pending' ORDER BY created_at DESC LIMIT 100`),
    sheetshop.pending()
  ]);
  const get = i => sources[i].status === 'fulfilled' ? sources[i].value : null;
  const rows = [
    ...(get(0)?.rows || []).map(r => ({ ...r, service: 'Цахим дэлгүүр', kind: 'material' })),
    ...(get(1)?.rows || []).map(r => ({ ...r, service: 'Ээлжит хичээл', detail: r.detail === 'week7' ? '7 хоногийн багц' : '5 ээлжит хичээлийн багц', kind: 'lesson' })),
    ...(get(2) || []).map(r => ({ ...r, service: 'Ажлын хуудас', detail: `${r.qty || 1} эрх`, kind: 'worksheet' })),
    ...(get(3)?.rows || []).map(r => ({ ...r, service: 'Сургалтын бүртгэл', kind: 'training' })),
    ...(get(4)?.rows || []).map(({ items, unverified, ...r }) => ({ ...r, service: 'Цахим дэлгүүр (PDF, судоку)', detail: sheetshop.detail(items) + (unverified ? ' ⚠ үнэ шалгагдаагүй' : ''), kind: 'sheetshop' }))
  ].sort((a,b) => Number(b.createdAt) - Number(a.createdAt));
  res.set('X-Admin-Source-Status', sources.map((x,i) => `${['shop','lesson','worksheet','training','sheetshop'][i]}:${x.status}`).join(','));
  res.json(rows);
}));
app.post('/api/admin/all-confirm', ...A, ah(async (req, res) => {
  const orderNo = String(req.body.orderNo || '').trim();
  const kind = String(req.body.kind || '');
  const bankReference = String(req.body.bankReference || '').trim().slice(0, 120);
  if (!bankReference) return res.status(400).json({ error: 'Банкны гүйлгээний дугаар эсвэл лавлагааг оруулна уу.' });
  if (!orderNo || !['material','lesson','worksheet','training','sheetshop'].includes(kind)) return res.status(400).json({ error: 'Захиалгын мэдээлэл буруу байна.' });
  let activated = false;
  if (kind === 'material') {
    const found = await q("SELECT 1 FROM shop_payments WHERE order_no=$1 AND invoice_id LIKE 'MANUAL-%' AND status='pending'", [orderNo]);
    if (!found.rowCount) return res.status(404).json({ error: 'Хүлээгдэж буй захиалга олдсонгүй эсвэл аль хэдийн баталгаажсан байна.' });
    activated = await activate(orderNo, bankReference);
  } else if (kind === 'lesson') {
    const found = await q("SELECT status, invoice_id FROM lesson_package_payments WHERE order_no=$1", [orderNo]);
    if (!found.rowCount || !String(found.rows[0].invoice_id).startsWith('MANUAL-')) return res.status(404).json({ error: 'Гар аргаар баталгаажуулах захиалга олдсонгүй.' });
    activated = await activateLessonPackage(orderNo, bankReference);
  } else if (kind === 'worksheet') {
    activated = await bagsh.adminConfirmPayment(orderNo, bankReference);
    if (!activated) return res.status(404).json({ error: 'Хүлээгдэж буй ажлын хуудасны захиалга олдсонгүй эсвэл аль хэдийн баталгаажсан байна.' });
  } else if (kind === 'sheetshop') {
    activated = await sheetshop.confirm(orderNo, bankReference);
    if (!activated) return res.status(404).json({ error: 'Хүлээгдэж буй захиалга олдсонгүй эсвэл аль хэдийн баталгаажсан байна.' });
  } else {
    const r = await q("UPDATE training_orders SET status='paid', paid_at=$2, bank_reference=$3, confirmed_at=$2 WHERE order_no=$1 AND status='pending' RETURNING order_no", [orderNo, Date.now(), bankReference]);
    activated = r.rowCount === 1;
  }
  if (!activated) return res.status(409).json({ error: 'Энэ захиалга өмнө нь баталгаажсан эсвэл идэвхжүүлэх боломжгүй байна.' });
  res.json({ ok: true, activated: true, orderNo, kind });
}));

// ---- Ээлжит хичээлийн төлөвлөлт (сурах бичгийн зураг/эхээс AI боловсруулна) ----
const lesson = require('./lesson-core');
const LESSON_MODEL = process.env.LESSON_MODEL || 'gpt-4o';
const LESSON_DAILY_CAP = parseInt(process.env.LESSON_DAILY_CAP) || 150; // өдөрт нийт хэдэн удаа AI дуудахыг хязгаарлана (зардлаас хамгаална)
let lessonDay = '', lessonCount = 0;
const IMG_URL = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const LESSON_SYS = `Та Монгол Улсын ерөнхий боловсролын сургуулийн ЯМАР Ч судлагдахууны (монгол хэл, математик, англи хэл, байгалийн ухаан, нийгэм, урлаг, биеийн тамир, технологи, мэдээлэл зүй гэх мэт) туршлагатай багш, арга зүйч. Багшийн өгсөн сурах бичгийн хуудасны зураг, эх, ангийн түвшин, хичээлийн хугацаанд тулгуурлан \"Ээлжит хичээлийн төлөвлөлт\" боловсруулна. Хариуг ЗӨВХӨН нэг JSON объект байдлаар, монгол хэлээр (кирилл) бич. JSON-оос өөр текст бүү нэм.

ХАМГИЙН ЧУХАЛ: төлөвлөгөө сурах бичгийн тухайн хуудсуудын БОДИТ агуулгад тулгуурласан, ерөнхий биш байна. \"Өмнөх мэдлэгээ сэргээе\", \"дүгнэе\" гэх мэт ерөнхий өгүүлбэр бичихийг хориглоно: эхлэл, төгсгөлийн алхам бүрд тухайн хуудасны сэдэвт хамаарах тодорхой асуулт, жишээ, даалгаврыг нэр, тоо, ойлголтоор нь бич.

ДҮРЭМ:
1. ДАСГАЛ, ДААЛГАВАР ТОГТООХ: зураг болон өгсөн эхээс бүх дасгал, даалгавар, бодлого, асуулт, үйл ажиллагааг (дугаар, хуудастай нь) олж \"textbookTasks\" жагсаалтад ЭХЭЛЖ бич. Мөр бүр: \"Дасгал 2 (х.45): даалгаврын агуулга товч → Хариу: ...\" хэлбэртэй (Хариу нь зурагнаас мэдэгдэж байвал, эсвэл математик, шинжлэх ухааны тодорхой бодлогыг зөв бодож гаргах боломжтой бол; мэдэхгүй бол хариуг бүү зохио). Дугаар, хуудас нь \":\"-ээс өмнө байна. Уншигдаагүй зүйлийг зохиохгүй.
2. ДАСГАЛЫГ АЛХАМД ТАРААХ: textbookTasks дахь дасгал бүрийг тохирох алхмын \"tasks\" талбарт яг ижил \"Дасгал 2 (х.45): ...\" хэлбэрээр оруул (нэг дасгал нэгээс олонгүй алхамд гол байрлалтай). Дасгал бүр заавал ямар нэг алхамд орсон байх ёстой. Хичээлийн хугацаанд багтахгүй бол үлдсэнийг homework-д тусгаж, дугаарыг нь бич. Дасгалыг алхмын teacher, student дотор ч ашигла (хэрхэн удирдах, сурагч яаж гүйцэтгэх, хэр хугацаа, хосоор/багаар эсэх).
3. ЭХЛЭЛ, ТӨГСГӨЛ: Эхлэлд тухайн хуудасны сэдэвтэй холбоотой 2–4 тодорхой асуулт эсвэл жишээ (\"questions\" талбар) тавьж өмнөх мэдлэгийг идэвхжүүл. Төгсгөлд хуудасны гол ойлголтыг дүгнэх, сурагч өөрийгөө үнэлэх 2–3 тодорхой асуулт эсвэл богино шалгалтын даалгавар (\"questions\") болон гэрийн даалгавар өг. Эдгээр нь сурах бичгийн агуулгаас шууд гарсан байна.
4. Алхмын тоог хичээлийн зорилго, агуулга, ангийн нас, хугацаа, арга, ажлын зохион байгуулалтаас хамааруулан өөрөө тогтоо. Заавал 11 алхамтай байх албагүй; 6, 8, 10, 12 эсвэл түүнээс олон байж болно. Алхам олшруулахын тулд агуулгыг давтах, шаардлагагүй үйл ажиллагаа зохиохыг хориглоно.
5. \"stages\" нь яг 3 үе шат: Эхлэл, Өрнөл, Төгсгөл. Бүх алхмын \"minutes\" (бүхэл тоо)-ын нийлбэр нийт хугацаатай яг тэнцүү байх ёстой. Үе шатны хугацаа хичээлийн онцлогт тохирно (ихэвчлэн эхлэл, төгсгөл тус бүр ойролцоогоор 10–15%).
6. Алхам бүрд: title, minutes, goal, teacher, student, materials (байхгүй бол \"\"), result (үнэлгээний арга эсвэл хүлээгдэх үр дүн), questions (байхгүй бол []), tasks (байхгүй бол []). Багшийн болон сурагчийн үйл ажиллагаа бие биедээ яг харгалзсан, хэрэгжихүйц байна (teacher, student тус бүр 2–4 өгүүлбэр).
7. СУДЛАГДАХУУНД ТОХИРУУЛАХ: судлагдахууны онцлогт арга зүйгээ тохируул. Математик/физик/хими: жишээ бодлогыг шат шатаар шийдэх, бие даан бодох, алдаа засах, хариугаа шалгах. Хэл (монгол, англи, орос): сонсох, ярих, унших, бичих чадвар, үг хэллэг, дүрмийн дадлага. Биологи/газарзүй/байгалийн ухаан: ажиглалт, туршилт, зураг-схем, аюулгүй байдал. Түүх/нийгэм: эх сурвалж, шалтгаан-үр дагавар, дүгнэлт, хэлэлцүүлэг. Урлаг/хөгжим/дизайн технологи: бүтээлч ажил, техник, үзүүлэн, үнэлгээний шалгуур. Биеийн тамир: бэлтгэл, гол дасгал, тайвшрах, аюулгүй байдал (сурах бичиг байхгүй бол эхээс). Мэдээлэл зүй: практик даалгавар, алгоритм/програм.
8. Хичээл нь өмнөх мэдлэгийг идэвхжүүлэх, шинэ агуулгыг бие даан болон хамтран ойлгох, хэрэглэх (дасгал, даалгавар), дүгнэж үнэлэх үе шатуудыг агуулсан байна. Ганцаарчилсан, хосын, багийн ажлыг агуулгад тохируул.
9. objectives нь 3–5 хэмжигдэхүйц зорилт (\"...ж чадна\" хэлбэртэй). goal нь нэг өгүүлбэр.
10. Багш сургалтын арга заасан бол түүнийг ашигла; заагаагүй бол агуулгад тохирох 3–5 аргыг өөрөө сонго.
11. assessment: 2–4 мөр — явцын үнэлгээ ба гүйцэтгэлийн үнэлгээний шалгуур (оноо эсвэл түвшинтэй).
12. homework: сурах бичгийн агуулга, дасгалтай холбоотой, 10 минутад хийхээр даалгавар (дасгалын дугаартай).
13. Багш сэдэв, судлагдахуун өгөөгүй бол \"lessonTopic\", \"subject\"-ийг сурах бичгийн агуулгаас тодорхойл.
14. Зурагнаас уншигдаагүй, бүдэг, таслагдсан хэсэг байвал \"warnings\" талбарт товч бич.

15. ЗУРАГТ ДААЛГАВАР: сурах бичгийн дасгал, даалгавар зураг дээр суурилсан бол (жишээ нь: зургийг ажиглаж мэдрэмж, сэтгэгдлээ бичих; цуврал зургаар өгүүлбэр, үг, түүх зохиох; зургийг дуурайн зурах; зургаар ярих, нэрлэх, тоолох, харьцуулах; дутуу зургийг гүйцээх; зургийн дарааллыг тогтоох) тэр зургийг НЯГТЛАН ХАРЖ ТАНИ. Даалгавар бүрийг \"pictureTasks\" жагсаалтад боловсруул: \"ref\" (textbookTasks дахь дугаартай яг ижил, жишээ нь \"Дасгал 3 (х.45)\"), \"type\" (даалгаврын төрөл), \"scene\" (зураг дээр юу харагдаж буй: дүр, үйлдэл, газар, өнгө, гол зүйлс; цуврал зураг бол зураг бүрийг 1, 2, 3... гэж дарааллаар нь тодорхой тайлбарла), \"process\" (багш, сурагч хийх үйл ажиллагааны дэс дараалал: ажиглах, ярилцах, бичих, зурах алхмууд; зурах даалгаварт зурах алхмуудыг), \"prompts\" (удирдах асуултууд, өгүүлбэрийн эхлэл, санах үгс — мэдрэмж, сэтгэгдэл бичихэд \"Энэ зургийг хараад би ... гэж мэдэрлээ, учир нь ...\" шиг), \"sample\" (жишээ хариу: боломжит өгүүлбэр, түүх, сэтгэгдэл — ЗӨВХӨН зургаас харагдсан зүйлд тулгуурла), \"criteria\" (үнэлгээний шалгуур), \"materials\" (өнгөт харандаа, цаас гэх мэт). Зураг бүдэг, таслагдсан, танигдахгүй бол \"scene\"-д юу харагдаж буйг хэлж, тааж зохиохгүй, \"warnings\" талбарт бич. Зурагт даалгаврыг тухайн дасгал орсон алхмын teacher, student, taskPlans-д тусга. Зураг дээр суурилаагүй даалгаварт \"pictureTasks\" шаардлагагүй (хоосон []).
16. ДАСГАЛ, ДААЛГАВРЫГ НАРИЙН ТӨЛӨВЛӨХ: алхамд оруулсан дасгал бүрийн хувьд \"taskPlans\" талбарт \"Дасгал 2 (х.45): ажлын хэлбэр (ганцаар/хосоор/багаар), хугацаа, багшийн удирдлага (юу гэж асууж, юуг үзүүлэх), сурагчийн гүйцэтгэх алхмууд, хүлээгдэх зөв хариу эсвэл үнэлгээний шалгуур, хүндрэл гарвал дэмжих арга, хурдан хийсэн сурагчид өгөх нэмэлт сорилт\" хэлбэрээр нэг мөр бич. Зураг агуулсан даалгаварт зургийг яаж ашиглахыг тодорхой заа.

JSON БҮТЭЦ (талбаруудыг энэ дарааллаар бич, textbookTasks болон pictureTasks-ыг ЭХЭНД):
{\"textbookTasks\":[\"\"],\"pictureTasks\":[{\"ref\":\"Дасгал 3 (х.45)\",\"type\":\"\",\"scene\":\"\",\"process\":[\"\"],\"prompts\":[\"\"],\"sample\":[\"\"],\"criteria\":[\"\"],\"materials\":\"\"}],\"subject\":\"\",\"lessonTopic\":\"\",\"unitTopic\":\"\",\"organization\":[\"Хичээлийн төрөл: ...\",\"Ажлын хэлбэр: ...\"],\"methods\":[\"\"],\"goal\":\"\",\"objectives\":[\"\"],\"materials\":[\"\"],\"stages\":[{\"name\":\"Эхлэл\",\"steps\":[{\"title\":\"\",\"minutes\":5,\"goal\":\"\",\"teacher\":\"\",\"student\":\"\",\"materials\":\"\",\"result\":\"\",\"questions\":[\"\"],\"tasks\":[\"\"],\"taskPlans\":[\"\"]}]},{\"name\":\"Өрнөл\",\"steps\":[]},{\"name\":\"Төгсгөл\",\"steps\":[]}],\"homework\":\"\",\"assessment\":[\"\"],\"warnings\":[]}`;
app.post('/api/lesson-plan', limit(30, 3600e3), express.json({ limit: '25mb' }), ah(async (req, res) => {
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: 'AI хараахан тохируулагдаагүй байна (OPENAI_API_KEY).' });
  const b = req.body || {}, t = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
  const images = (Array.isArray(b.images) ? b.images : []).slice(0, 10), text = t(b.text, 12000);
  if (images.some(u => typeof u !== 'string' || u.length > 7e6 || !IMG_URL.test(u))) return res.status(400).json({ error: 'Зураг JPG/PNG/WEBP байх ёстой' });
  if (!images.length && text.length < 30) return res.status(400).json({ error: 'Сурах бичгийн зураг эсвэл эхийг оруулна уу' });
  const minutes = Math.max(10, Math.min(240, parseInt(b.minutes) || 40));
  const inp = { grade: t(b.grade, 30), subject: t(b.subject, 60), lessonTopic: t(b.lessonTopic, 250), unitTopic: t(b.unitTopic, 200), method: t(b.method, 300), minutes };
  const user = await userOf(req); if (!user) return res.status(401).json({ error: 'Ээлжит хичээл боловсруулахын тулд и-мэйлээр нэвтэрнэ үү.' });
  const sourcePages = images.length ? images.length : Math.max(1, Math.min(10, parseInt(b.sourcePages) || 1));
  const access = await currentLessonPackage(user.id); if (!access.package) return res.status(402).json({ error: 'Эрх дууссан. Багц сонгон төлбөр төлнө үү.', access });
  if (access.package.dailyLimit - access.package.usedToday < 1) return res.status(429).json({ error: `Өнөөдрийн ${access.package.dailyLimit} ээлжит хичээлийн хязгаар дууссан. Маргааш дахин боловсруулна уу.`, access });
  if (access.package.remainingPages < 1) return res.status(429).json({ error: 'Багцын ээлжит хичээлийн эрх дууссан.', access });
  const info = `Анги: ${inp.grade || '(заагаагүй)'}\nСудлагдахуун: ${inp.subject || '(заагаагүй — сурах бичгийн агуулгаас тодорхойл)'}\nНийт хугацаа: ${minutes} минут (алхмуудын минутын нийлбэр яг ${minutes} байна)\nХичээлийн сэдэв: ${inp.lessonTopic || '(өгөөгүй — сурах бичгээс тодорхойл)'}\nНэгжийн сэдэв: ${inp.unitTopic || '(өгөөгүй)'}\nСургалтын арга: ${inp.method || '(өгөөгүй — өөрөө сонго)'}\n` +
    (text ? `\nСурах бичгийн эх (багшийн оруулсан):\n${text}\n` : '') + (images.length ? `\nДараах ${images.length} зураг нь сурах бичгийн хуудас.` : '');
  const content = [{ type: 'text', text: info }, ...images.map(u => ({ type: 'image_url', image_url: { url: u, detail: 'high' } }))];
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 150e3);
  let r, data;
  try {
    r = await fetch((process.env.OPENAI_BASE_URL || 'https://api.openai.com') + '/v1/chat/completions', {
      method: 'POST', signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.OPENAI_API_KEY },
      body: JSON.stringify({ model: LESSON_MODEL, temperature: 0.4, max_tokens: 11000, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: LESSON_SYS }, { role: 'user', content }] })
    });
    data = await r.json().catch(() => ({}));
  } catch (e) {
    return res.status(e.name === 'AbortError' ? 504 : 502).json({ error: 'AI хариулахад хэт удлаа. Дахин оролдоно уу.' });
  } finally { clearTimeout(timer); }
  if (!r.ok) { console.error('lesson-plan OpenAI:', r.status, data && data.error && data.error.message); return res.status(502).json({ error: 'AI үйлчилгээ хариулсангүй. Түр хүлээгээд дахин оролдоно уу.' }); }
  let raw; try { raw = JSON.parse(data.choices[0].message.content); } catch { return res.status(502).json({ error: 'AI-ийн хариуг уншиж чадсангүй. Дахин оролдоно уу.' }); }
  const plan = lesson.sanitizePlan(raw, { totalMinutes: minutes, grade: inp.grade, subject: inp.subject || t(raw.subject, 60), lessonTopic: inp.lessonTopic, unitTopic: inp.unitTopic });
  if (lesson.allSteps(plan).length < 3) return res.status(502).json({ error: 'AI бүрэн төлөвлөгөө гаргаж чадсангүй. Дахин оролдоно уу.' });
  await q('UPDATE lesson_packages SET used_pages=used_pages+$2 WHERE id=$1', [access.package.id, 1]);
  await q('INSERT INTO lesson_usage(user_id,package_id,source_pages,input_tokens,output_tokens,model,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)', [user.id, access.package.id, sourcePages, Number(data.usage?.prompt_tokens||0), Number(data.usage?.completion_tokens||0), LESSON_MODEL, Date.now()]);
  const warnings = (Array.isArray(raw.warnings) ? raw.warnings : []).slice(0, 5).map(w => t(w, 200)).filter(Boolean);
  if (images.length && !plan.textbookTasks.length) warnings.push('Зургаас дасгал, даалгавар илрээгүй. Хуудас тод, бүтэн орсон эсэхийг шалгаж, шаардлагатай бол эхийг «Сурах бичгийн эх» талбарт буулгана уу.');
  res.json({ plan, warnings, usage: { sourcePages, inputTokens: Number(data.usage?.prompt_tokens||0), outputTokens: Number(data.usage?.completion_tokens||0) }, access: await currentLessonPackage(user.id) });
}));

// ---- Анирын тэмдэглэл: админ бичиж/засаж, нийтэлсэн бичвэрийг сайт харуулна ----
app.get('/api/diary', ah(async (req,res) => {
  const rows = await q("SELECT id,title,body,excerpt,entry_date AS date,image_url AS \"imageUrl\" FROM diary_entries WHERE status='published' ORDER BY entry_date DESC,id DESC");
  res.json(rows.rows);
}));
app.get('/api/admin/diary', ...A, ah(async (req,res) => {
  res.json((await q("SELECT id,title,body,excerpt,entry_date AS date,status,image_url AS \"imageUrl\" FROM diary_entries ORDER BY entry_date DESC,id DESC")).rows);
}));
app.post('/api/admin/diary', ...A, ah(async (req,res) => {
  const id = Number(req.body.id) || 0;
  const title = String(req.body.title || '').trim().slice(0,160);
  const body = String(req.body.body || '').trim().slice(0,20000);
  const excerpt = String(req.body.excerpt || '').trim().slice(0,500);
  const date = String(req.body.date || '').trim();
  const status = req.body.status === 'published' ? 'published' : 'draft';
  const imageUrl = String(req.body.imageUrl || '').trim().slice(0,1000);
  const realDate = (() => { if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false; const d = new Date(date + 'T00:00:00Z'); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date; })();
  if (!title || !body || !realDate) return res.status(400).json({error:'Гарчиг, бичвэр, огноог зөв оруулна уу.'});
  if (imageUrl && !/^https:\/\//i.test(imageUrl) && !/^\/(?!\/)/.test(imageUrl)) return res.status(400).json({error:'Зургийн холбоос буруу байна.'});
  const now=Date.now();
  if (id) {
    const r=await q("UPDATE diary_entries SET title=$2,body=$3,excerpt=$4,entry_date=$5,status=$6,image_url=$7,updated_at=$8 WHERE id=$1 RETURNING id",
      [id,title,body,excerpt,date,status,imageUrl||null,now]);
    if (!r.rowCount) return res.status(404).json({error:'Тэмдэглэл олдсонгүй'});
    return res.json({ok:true,id});
  }
  const r=await q("INSERT INTO diary_entries(title,body,excerpt,entry_date,status,image_url,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$7) RETURNING id",
    [title,body,excerpt,date,status,imageUrl||null,now]);
  res.status(201).json({ok:true,id:r.rows[0].id});
}));
app.delete('/api/admin/diary/:id', ...A, ah(async (req,res) => {
  const r=await q("DELETE FROM diary_entries WHERE id=$1",[Number(req.params.id)||0]);
  res.json({ok:r.rowCount===1});
}));

app.use(express.static(path.join(__dirname)));
app.use('/api', (req, res) => res.status(404).json({ error: 'Олдсонгүй' }));
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const st = err.status || err.statusCode || 500;
  res.status(st).json({ error: st === 413 ? 'Файл эсвэл өгөгдөл хэт том байна.' : st >= 400 && st < 500 ? 'Хүсэлтийн өгөгдөл буруу байна.' : 'Серверийн алдаа' });
});
app.listen(process.env.PORT || 3000, () => console.log('Ажиллаж байна. Port:', process.env.PORT || 3000, '| QPay горим:', qpay.MODE));
(async function boot() {
  if (!CONFIG_OK) return;
  for (;;) {
    try {
      await init(); ready = true; console.log('Өгөгдлийн сан бэлэн');
      (async function retryBagsh() {
        for (;;) {
          try { await bagsh.initBagsh(); return; }
          catch (be) { console.error('Багшийн туслахын DB холболт бэлэн биш:', be.message, '(30 секундын дараа дахин оролдоно)'); await new Promise(r => setTimeout(r, 30000)); }
        }
      })();
      return;
    }
    catch (e) { console.error('Өгөгдлийн сантай холбогдож чадсангүй:', e.message, '(15 секундын дараа дахин оролдоно)'); await new Promise(r => setTimeout(r, 15000)); }
  }
})();