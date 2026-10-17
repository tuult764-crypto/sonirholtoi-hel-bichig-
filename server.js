require('dotenv').config();
const express = require('express'), cors = require('cors'), path = require('path'), crypto = require('crypto');
const { Pool, types } = require('pg'), bcrypt = require('bcryptjs'), jwt = require('jsonwebtoken'), qpay = require('./qpay');
types.setTypeParser(20, Number);
const { JWT_SECRET, DATABASE_URL, OPENAI_API_KEY } = process.env, ADMIN_KEY = process.env.ADMIN_KEY || '';
if (!JWT_SECRET || JWT_SECRET.length < 24) { console.error('JWT_SECRET (24+ тэмдэгт) тохируулна уу'); process.exit(1); }
if (!DATABASE_URL) { console.error('DATABASE_URL тохируулна уу'); process.exit(1); }
const pool = new Pool({ connectionString: DATABASE_URL, max: 5, ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false } });
const q = (t, p) => pool.query(t, p), SECURE = !!process.env.RENDER || process.env.NODE_ENV === 'production';
const IMG = ['image/jpeg', 'image/png', 'image/webp'], esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function init() {
  await q(`
CREATE TABLE IF NOT EXISTS users(id BIGSERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL DEFAULT '', pass_hash TEXT NOT NULL, created_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS materials(id BIGSERIAL PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT 'Бусад', price INTEGER NOT NULL DEFAULT 0, active BOOLEAN NOT NULL DEFAULT true, created_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS files(id BIGSERIAL PRIMARY KEY, material_id BIGINT NOT NULL REFERENCES materials(id) ON DELETE CASCADE, role TEXT NOT NULL, ord INTEGER NOT NULL DEFAULT 0, mime TEXT NOT NULL, data BYTEA NOT NULL);
CREATE INDEX IF NOT EXISTS files_m ON files(material_id, role, ord);
CREATE TABLE IF NOT EXISTS purchases(user_id BIGINT NOT NULL REFERENCES users(id), material_id BIGINT NOT NULL REFERENCES materials(id) ON DELETE CASCADE, created_at BIGINT NOT NULL, PRIMARY KEY(user_id, material_id));
CREATE TABLE IF NOT EXISTS payments(id BIGSERIAL PRIMARY KEY, order_no TEXT UNIQUE NOT NULL, user_id BIGINT NOT NULL REFERENCES users(id), material_id BIGINT NOT NULL REFERENCES materials(id) ON DELETE CASCADE, invoice_id TEXT NOT NULL, amount INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at BIGINT NOT NULL, paid_at BIGINT);`);
}
const app = express();
app.set('trust proxy', 1);
// Нууц файлуудыг (код, тохиргоо, өгөгдөл) нийтэд нээхгүй
const DENY = /^\/(server\.js|qpay\.js|package(-lock)?\.json|\.env.*|\.git.*|netlify.*|readme\.md|literature_db\.txt|node_modules.*|.*\.xlsx)$/i;
app.use((req, res, next) => { let p = ''; try { p = decodeURIComponent(req.path); } catch { return res.status(400).end(); } DENY.test(p) ? res.status(404).end() : next(); });
app.use((req, res, next) => req.path === '/api/admin/materials' && req.method === 'POST' ? next() : express.json({ limit: '100kb' })(req, res, next));
const ah = fn => (req, res, next) => fn(req, res, next).catch(e => { console.error(req.path, e.message); if (!res.headersSent) res.status(500).json({ error: 'Серверийн алдаа' }); });
const hits = new Map();
const limit = (max, ms) => (req, res, next) => { const k = req.ip + req.path, now = Date.now(), a = (hits.get(k) || []).filter(t => now - t < ms); if (a.length >= max) return res.status(429).json({ error: 'Хэт олон оролдлого. Түр хүлээнэ үү.' }); a.push(now); hits.set(k, a); next(); };
setInterval(() => { const n = Date.now(); for (const [k, a] of hits) if (!a.some(t => n - t < 3600e3)) hits.delete(k); }, 600e3).unref();

// ---- хэрэглэгч, session (httpOnly cookie) ----
const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(c => c.trim()).filter(Boolean).map(c => { const i = c.indexOf('='); return [c.slice(0, i), decodeURIComponent(c.slice(i + 1))]; }));
const pub = u => ({ id: u.id, email: u.email, name: u.name });
const login = (res, u) => res.cookie('sid', jwt.sign({ uid: u.id }, JWT_SECRET, { expiresIn: '60d' }), { httpOnly: true, sameSite: 'lax', secure: SECURE, maxAge: 60 * 864e5 });
async function userOf(req) { try { return (await q('SELECT * FROM users WHERE id=$1', [jwt.verify(cookies(req).sid, JWT_SECRET).uid])).rows[0] || null; } catch { return null; } }
const need = ah(async (req, res, next) => { req.user = await userOf(req); req.user ? next() : res.status(401).json({ error: 'Нэвтэрнэ үү' }); });
app.post('/api/auth/register', limit(10, 3600e3), ah(async (req, res) => {
  const email = String(req.body.email || '').toLowerCase().trim(), pw = String(req.body.password || ''), name = String(req.body.name || '').trim().slice(0, 60);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || pw.length < 8 || pw.length > 200) return res.status(400).json({ error: 'Зөв и-мэйл, 8+ тэмдэгт нууц үг оруулна уу' });
  try { const u = (await q('INSERT INTO users(email,name,pass_hash,created_at) VALUES($1,$2,$3,$4) RETURNING *', [email, name, bcrypt.hashSync(pw, 10), Date.now()])).rows[0]; login(res, u); res.json({ user: pub(u) }); }
  catch (e) { if (e.code === '23505') return res.status(409).json({ error: 'Энэ и-мэйл бүртгэлтэй байна' }); throw e; }
}));
app.post('/api/auth/login', limit(20, 900e3), ah(async (req, res) => {
  const u = (await q('SELECT * FROM users WHERE email=$1', [String(req.body.email || '').toLowerCase().trim()])).rows[0];
  if (!u || !bcrypt.compareSync(String(req.body.password || ''), u.pass_hash)) return res.status(401).json({ error: 'И-мэйл эсвэл нууц үг буруу' });
  login(res, u); res.json({ user: pub(u) });
}));
app.post('/api/auth/logout', (req, res) => { res.clearCookie('sid'); res.json({ ok: true }); });
app.get('/api/auth/me', ah(async (req, res) => { const u = await userOf(req); res.json({ user: u ? pub(u) : null }); }));

// ---- материал, эрх ----
const owned = async (m, u) => m.price === 0 || (!!u && (await q('SELECT 1 FROM purchases WHERE user_id=$1 AND material_id=$2', [u.id, m.id])).rowCount > 0);
const material = async id => (await q('SELECT * FROM materials WHERE id=$1 AND active=true', [parseInt(id) || 0])).rows[0];
app.get('/api/materials', ah(async (req, res) => {
  const u = await userOf(req), mine = u ? new Set((await q('SELECT material_id FROM purchases WHERE user_id=$1', [u.id])).rows.map(r => r.material_id)) : new Set();
  const rows = (await q('SELECT id,title,description,category,price,created_at FROM materials WHERE active=true ORDER BY created_at DESC')).rows;
  res.json(rows.map(m => ({ ...m, owned: m.price === 0 || mine.has(m.id) })));
}));
app.get('/api/my', need, ah(async (req, res) => res.json((await q('SELECT m.id,m.title,m.description,m.category,m.price,p.created_at "boughtAt" FROM purchases p JOIN materials m ON m.id=p.material_id WHERE p.user_id=$1 AND m.active=true ORDER BY p.created_at DESC', [req.user.id])).rows)));
const sendFile = (res, f) => { res.set({ 'Content-Type': f.mime, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline' }); res.send(f.data); };
app.get('/api/materials/:id/cover', ah(async (req, res) => {
  const f = (await q("SELECT f.mime,f.data FROM files f JOIN materials m ON m.id=f.material_id WHERE m.id=$1 AND m.active=true AND f.role='cover' LIMIT 1", [parseInt(req.params.id) || 0])).rows[0];
  if (!f) return res.status(404).end(); res.set('Cache-Control', 'public, max-age=300'); res.set('Content-Type', f.mime); res.send(f.data);
}));
// хуудас бүрийг эрх шалгаж өгнө (нийтэд нээлттэй URL биш)
app.get('/api/materials/:id/page/:n', ah(async (req, res) => {
  const m = await material(req.params.id); if (!m) return res.status(404).end();
  if (!(await owned(m, await userOf(req)))) return res.status(403).end();
  const f = (await q("SELECT mime,data FROM files WHERE material_id=$1 AND role='page' ORDER BY ord OFFSET $2 LIMIT 1", [m.id, Math.max(0, (parseInt(req.params.n) || 1) - 1)])).rows[0];
  f ? sendFile(res, f) : res.status(404).end();
}));
app.get('/api/materials/:id/print', ah(async (req, res) => {
  const m = await material(req.params.id), u = await userOf(req); res.set('Cache-Control', 'no-store');
  const msg = t => res.status(403).type('html').send(`<meta charset="utf-8"><body style="font:18px system-ui;padding:40px;text-align:center">${t}<p><a href="/materials.html">← Сургалтын материал</a></p>`);
  if (!m) return res.status(404).type('html').send('<meta charset="utf-8">Материал олдсонгүй');
  if (!(await owned(m, u))) return msg(u ? 'Энэ материалыг хэвлэхийн тулд эхлээд худалдаж авна уу.' : 'Төлбөртэй материал. Эхлээд нэвтэрч, худалдаж авна уу.');
  const n = (await q("SELECT COUNT(*) c FROM files WHERE material_id=$1 AND role='page'", [m.id])).rows[0].c;
  if (!n) return msg('Энэ материалын хуудас хараахан нэмэгдээгүй байна.');
  const imgs = Array.from({ length: n }, (_, i) => `<img class="pg" alt="Хуудас ${i + 1}" src="/api/materials/${m.id}/page/${i + 1}">`).join('');
  res.type('html').send(`<!doctype html><html lang="mn"><meta charset="utf-8"><title>${esc(m.title)}</title><style>@page{size:A4;margin:8mm}body{margin:0;background:#eee;font-family:system-ui}.bar{position:sticky;top:0;background:#fff;padding:10px;text-align:center;box-shadow:0 1px 6px #0002}.bar button{font:700 16px system-ui;padding:10px 22px;border:0;border-radius:10px;background:#b8763f;color:#fff;cursor:pointer}.pg{display:block;margin:10px auto;max-width:100%;background:#fff}@media print{.bar{display:none}body{background:#fff}.pg{margin:0;width:100%;page-break-after:always;break-after:page}}</style><div class="bar"><button onclick="print()">🖨️ Хэвлэх</button></div>${imgs}<script>let k=0;document.querySelectorAll('.pg').forEach(i=>i.complete?k++:i.onload=()=>{if(++k===${n})setTimeout(print,300)});if(k===${n})setTimeout(print,300)</script></html>`);
}));

// ---- худалдан авалт, төлбөр (QPay / гар баталгаажуулалт) ----
async function activate(orderNo) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const p = await c.query("UPDATE payments SET status='paid', paid_at=$2 WHERE order_no=$1 AND status='pending' RETURNING user_id, material_id", [orderNo, Date.now()]);
    if (!p.rowCount) { await c.query('ROLLBACK'); return false; }
    await c.query('INSERT INTO purchases(user_id,material_id,created_at) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [p.rows[0].user_id, p.rows[0].material_id, Date.now()]);
    await c.query('COMMIT'); return true;
  } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; } finally { c.release(); }
}
async function verify(orderNo) {
  const p = (await q('SELECT * FROM payments WHERE order_no=$1', [orderNo])).rows[0];
  if (!p) return 'unknown'; if (p.status === 'paid') return 'paid';
  if (await qpay.isPaid(p.invoice_id, p.amount)) { await activate(orderNo); return 'paid'; }
  return 'pending';
}
app.post('/api/buy', need, limit(30, 3600e3), ah(async (req, res) => {
  const m = await material(req.body.materialId);
  if (!m) return res.status(404).json({ error: 'Материал олдсонгүй' });
  if (m.price === 0) return res.status(400).json({ error: 'Үнэгүй материал. Шууд хэвлэж болно.' });
  if (await owned(m, req.user)) return res.status(409).json({ error: 'Та энэ материалыг аль хэдийн авсан байна (Миний сан)' });
  const manual = qpay.MODE === 'manual';
  for (let i = 0; i < 3; i++) {
    const orderNo = manual ? 'BT' + crypto.randomInt(10000, 100000) : 'BT' + Date.now() + crypto.randomBytes(3).toString('hex');
    try {
      const inv = await qpay.createInvoice({ orderNo, amount: m.price, description: m.title.slice(0, 80) });
      await q('INSERT INTO payments(order_no,user_id,material_id,invoice_id,amount,created_at) VALUES($1,$2,$3,$4,$5,$6)', [orderNo, req.user.id, m.id, inv.invoiceId, m.price, Date.now()]);
      return res.json({ orderNo, amount: m.price, ...inv, mock: qpay.MODE === 'mock', manual, qrUrl: manual ? '/qr.png' : null });
    } catch (e) { if (e.code !== '23505') { console.error('buy:', e.message); return res.status(502).json({ error: 'Нэхэмжлэх үүсгэж чадсангүй. Дахин оролдоно уу.' }); } }
  }
  res.status(500).json({ error: 'Дахин оролдоно уу' });
}));
app.post('/api/pay/check', need, ah(async (req, res) => {
  const p = (await q('SELECT 1 FROM payments WHERE order_no=$1 AND user_id=$2', [String(req.body.orderNo || ''), req.user.id])).rows[0];
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
app.get('/api/admin/pending', ...A, ah(async (req, res) => res.json((await q(`SELECT p.order_no "orderNo", p.amount, p.created_at "createdAt", u.email, m.title FROM payments p JOIN users u ON u.id=p.user_id JOIN materials m ON m.id=p.material_id WHERE p.status='pending' AND p.invoice_id LIKE 'MANUAL-%' ORDER BY p.created_at DESC LIMIT 100`)).rows)));
app.post('/api/admin/confirm', ...A, ah(async (req, res) => {
  const o = String(req.body.orderNo || '');
  if (!(await q("SELECT 1 FROM payments WHERE order_no=$1 AND invoice_id LIKE 'MANUAL-%'", [o])).rowCount) return res.status(404).json({ error: 'Олдсонгүй' });
  res.json({ ok: true, activated: await activate(o) });
}));
app.get('/api/admin/materials', ...A, ah(async (req, res) => res.json((await q(`SELECT m.id,m.title,m.description,m.category,m.price,m.active,(SELECT COUNT(*) FROM files f WHERE f.material_id=m.id AND f.role='page') pages,(SELECT COUNT(*) FROM purchases p WHERE p.material_id=m.id) sold FROM materials m ORDER BY m.created_at DESC`)).rows)));
const b64 = f => { const m = String((f && f.mime) || ''), d = String((f && f.data) || '').replace(/^data:[^,]*,/, ''); return IMG.includes(m) && /^[A-Za-z0-9+/=]+$/.test(d) && d.length > 20 ? { mime: m, data: Buffer.from(d, 'base64') } : null; };
const fields = b => ({ title: String(b.title || '').trim().slice(0, 120), description: String(b.description || '').trim().slice(0, 600), category: String(b.category || 'Бусад').trim().slice(0, 40) || 'Бусад', price: Math.max(0, Math.min(1e6, parseInt(b.price) || 0)) });
app.post('/api/admin/materials', ...A, express.json({ limit: '30mb' }), ah(async (req, res) => {
  const f = fields(req.body), pages = (Array.isArray(req.body.pages) ? req.body.pages : []).slice(0, 40).map(b64), cover = b64(req.body.cover);
  if (!f.title || pages.some(p => !p) || (!cover && !pages.length)) return res.status(400).json({ error: 'Нэр, зураг (JPG/PNG/WEBP) зөв оруулна уу' });
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const id = (await c.query('INSERT INTO materials(title,description,category,price,created_at) VALUES($1,$2,$3,$4,$5) RETURNING id', [f.title, f.description, f.category, f.price, Date.now()])).rows[0].id;
    const cv = cover || pages[0];
    await c.query("INSERT INTO files(material_id,role,ord,mime,data) VALUES($1,'cover',0,$2,$3)", [id, cv.mime, cv.data]);
    for (let i = 0; i < pages.length; i++) await c.query("INSERT INTO files(material_id,role,ord,mime,data) VALUES($1,'page',$2,$3,$4)", [id, i, pages[i].mime, pages[i].data]);
    await c.query('COMMIT'); res.json({ ok: true, id });
  } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; } finally { c.release(); }
}));
app.post('/api/admin/materials/:id', ...A, ah(async (req, res) => {
  const f = fields(req.body), active = req.body.active !== false;
  if (!f.title) return res.status(400).json({ error: 'Нэр хоосон байна' });
  res.json({ ok: (await q('UPDATE materials SET title=$2,description=$3,category=$4,price=$5,active=$6 WHERE id=$1', [parseInt(req.params.id) || 0, f.title, f.description, f.category, f.price, active])).rowCount === 1 });
}));

// ---- хуучин AI chat (хамгаалалттай: түлхүүргүй бол унтраалтай, IP тутамд хязгаартай) ----
app.use(cors({ origin: false }));
app.post('/api/chat', limit(10, 3600e3), ah(async (req, res) => {
  if (!OPENAI_API_KEY) return res.status(503).json({ error: 'AI тохируулаагүй байна' });
  const { OpenAI } = require('openai');
  res.json(await new OpenAI({ apiKey: OPENAI_API_KEY }).chat.completions.create({ model: 'gpt-3.5-turbo', messages: [{ role: 'user', content: String(req.body.prompt || '').slice(0, 2000) }] }));
}));
app.use(express.static(path.join(__dirname)));
init().then(() => app.listen(process.env.PORT || 3000, () => console.log('Ажиллаж байна. QPay горим:', qpay.MODE))).catch(e => { console.error('Өгөгдлийн сантай холбогдож чадсангүй:', e.message); process.exit(1); });
