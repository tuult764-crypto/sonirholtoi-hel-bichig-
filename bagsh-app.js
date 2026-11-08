// Багшийн туслахын API-г үндсэн Сонирхолтой хэл бичиг серверт тусдаа замаар холбох модуль.
const express = require('express'), { Pool, types } = require('pg');
const bcrypt = require('bcryptjs'), jwt = require('jsonwebtoken'), crypto = require('crypto');
const sheet = require('./worksheet'), qpay = require('./bagsh-qpay');
types.setTypeParser(20, Number);
const fs = require('fs'), path = require('path');
const secret = name => { if (process.env[name]) return process.env[name]; try { return fs.readFileSync('/etc/secrets/' + name, 'utf8').trim(); } catch { return ''; } };
const JWT_SECRET = secret('BAGSH_JWT_SECRET') || secret('JWT_SECRET');
const DATABASE_URL = secret('BAGSH_DATABASE_URL') || secret('DATABASE_URL');
const GEMINI_API_KEY = secret('BAGSH_GEMINI_API_KEY') || secret('GEMINI_API_KEY');
const ANTHROPIC_API_KEY = secret('BAGSH_ANTHROPIC_API_KEY') || secret('ANTHROPIC_API_KEY');
const PROVIDER = (process.env.BAGSH_AI_PROVIDER || process.env.AI_PROVIDER || 'gemini').toLowerCase();
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';
const GEMINI_URL = process.env.GEMINI_URL || `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const ADMIN_KEYS = [...new Set([secret('BAGSH_ADMIN_KEY'), secret('ADMIN_KEY')].filter(x => x && x.length >= 12))];
if (!JWT_SECRET || JWT_SECRET.length < 24) console.error('Багшийн туслах: BAGSH_JWT_SECRET (эсвэл JWT_SECRET) 24+ тэмдэгт байх ёстой.');
if (!DATABASE_URL) console.error('Багшийн туслах: BAGSH_DATABASE_URL тохируулаагүй байна.');
const HOLD = 120e3;
const SHEET_PRICE = +(process.env.BAGSH_SHEET_PRICE || process.env.SHEET_PRICE || process.env.PRICE_MNT) || 500;
const DAILY = +process.env.BAGSH_DAILY_LIMIT || +process.env.DAILY_LIMIT || 30;
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6', DAY = 864e5, PERIOD = 30 * DAY;
const AI_URL = process.env.AI_URL || 'https://api.anthropic.com/v1/messages';
const pool = new Pool({ connectionString: DATABASE_URL || undefined, max: 4, connectionTimeoutMillis: 10000, ssl: process.env.BAGSH_PGSSL === 'disable' ? false : { rejectUnauthorized: false } });
const q = (text, params) => pool.query(text, params);
const router = express.Router();
let ready = false;
router.use((req,res,next)=> ready ? next() : res.status(503).json({error:'Ажлын хуудасны систем түр бэлдэж байна.'}));
router.use((req,res,next)=> ['/generate','/docx'].includes(req.path) ? next() : express.json({limit:'200kb'})(req,res,next));
async function init() {
  await q(`
CREATE TABLE IF NOT EXISTS users(id BIGSERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL, pass_hash TEXT NOT NULL,
  free_used INTEGER NOT NULL DEFAULT 0, paid_until BIGINT NOT NULL DEFAULT 0, created_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS payments(id BIGSERIAL PRIMARY KEY, order_no TEXT UNIQUE NOT NULL, user_id BIGINT NOT NULL REFERENCES users(id),
  invoice_id TEXT NOT NULL, amount INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at BIGINT NOT NULL, paid_at BIGINT);
CREATE TABLE IF NOT EXISTS usage(id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id), ts BIGINT NOT NULL);
ALTER TABLE users ADD COLUMN IF NOT EXISTS free_hold BIGINT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS free_done BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS credits INTEGER NOT NULL DEFAULT 0;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS qty INTEGER NOT NULL DEFAULT 1;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS bank_reference TEXT; ALTER TABLE payments ADD COLUMN IF NOT EXISTS confirmed_at BIGINT;
CREATE INDEX IF NOT EXISTS usage_user_ts ON usage(user_id, ts);
CREATE INDEX IF NOT EXISTS payments_user ON payments(user_id);`);
}

const ah = fn => (req, res, next) => fn(req, res, next).catch(e => { console.error(req.path, e.message); if (!res.headersSent) res.status(500).json({ error: 'Серверийн алдаа' }); });

// ---- энгийн IP rate limit ----
const hits = new Map();
setInterval(() => { const now = Date.now(); for (const [k, a] of hits) if (!a.some(t => now - t < 3600e3)) hits.delete(k); }, 600e3).unref();
const limit = (max, ms) => (req, res, next) => {
  const k = req.ip + req.path, now = Date.now(), a = (hits.get(k) || []).filter(t => now - t < ms);
  if (a.length >= max) return res.status(429).json({ error: 'Хэт олон оролдлого. Түр хүлээнэ үү.' });
  a.push(now); hits.set(k, a); next();
};

const sign = u => jwt.sign({ uid: u.id }, JWT_SECRET, { expiresIn: '30d' });
const getUser = async id => (await q('SELECT * FROM users WHERE id=$1', [id])).rows[0];
const auth = ah(async (req, res, next) => {
  let u;
  try { u = await getUser(jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), JWT_SECRET).uid); } catch { u = null; }
  if (!u) return res.status(401).json({ error: 'Нэвтэрнэ үү' });
  req.user = u; next();
});
const status = u => ({ email: u.email, freeLeft: (u.free_used < 1 || (!u.free_done && u.free_hold < Date.now() - HOLD)) ? 1 : 0, credits: u.credits, price: SHEET_PRICE });

router.post('/register', limit(10, 3600e3), ah(async (req, res) => {
  const email = String(req.body.email || '').toLowerCase().trim(), pw = String(req.body.password || '');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || pw.length < 8 || pw.length > 200) return res.status(400).json({ error: 'Зөв и-мэйл, 8+ тэмдэгт нууц үг оруулна уу' });
  try {
    const r = await q('INSERT INTO users(email,pass_hash,created_at) VALUES($1,$2,$3) RETURNING *', [email, bcrypt.hashSync(pw, 10), Date.now()]);
    res.json({ token: sign(r.rows[0]), ...status(r.rows[0]) });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Энэ и-мэйл бүртгэлтэй байна' });
    throw e;
  }
}));
router.post('/login', limit(20, 900e3), ah(async (req, res) => {
  const u = (await q('SELECT * FROM users WHERE email=$1', [String(req.body.email || '').toLowerCase().trim()])).rows[0];
  if (!u || !bcrypt.compareSync(String(req.body.password || ''), u.pass_hash)) return res.status(401).json({ error: 'И-мэйл эсвэл нууц үг буруу' });
  res.json({ token: sign(u), ...status(u) });
}));
router.get('/me', auth, (req, res) => res.json(status(req.user)));

// ---- асуулт бэлтгэх (унших эхийн зураг/PDF + Блумын шат) ----
const MIMES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
function validate(b) {
  const f = b.file || {}, data = String(f.data || '').replace(/^data:[^,]*,/, '');
  const levels = (Array.isArray(b.levels) ? b.levels : []).filter(x => sheet.LEVELS[x]);
  const o = { grade: +b.grade, levels: [...new Set(levels)], per: Math.min(3, Math.max(1, parseInt(b.per) || 2)), note: String(b.note || '').trim().slice(0, 300), mime: String(f.mime || ''), data };
  if (!(o.grade >= 1 && o.grade <= 12) || !o.levels.length || !MIMES.includes(o.mime) || !data || data.length > 9e6 || !/^[A-Za-z0-9+/=]+$/.test(data)) return null;
  return o;
}
router.post('/generate', auth, express.json({ limit: '10mb' }), ah(async (req, res) => {
  if (PROVIDER === 'gemini' && !GEMINI_API_KEY) return res.status(503).json({ error: 'GEMINI_API_KEY тохируулаагүй байна.' });
  if (PROVIDER === 'anthropic' && !ANTHROPIC_API_KEY) return res.status(503).json({ error: 'ANTHROPIC_API_KEY тохируулаагүй байна.' });
  const input = validate(req.body);
  if (!input) return res.status(400).json({ error: 'Эхийн PDF/зураг (6 MB-аас бага) оруулж, дор хаяж нэг шат сонгоно уу' });
  const u = req.user, now = Date.now();
  let use;
  if ((await q('UPDATE users SET free_used=1, free_hold=$2 WHERE id=$1 AND (free_used<1 OR (free_done=false AND free_hold<$3))', [u.id, now, now - HOLD])).rowCount) use = 'free';
  else if ((await q('UPDATE users SET credits=credits-1 WHERE id=$1 AND credits>0', [u.id])).rowCount) use = 'credit';
  else return res.status(402).json({ error: 'Үнэгүй хуудас дууссан. Ажлын хуудас худалдан авна уу.', payRequired: true });
  try {
    let r, text;
    if (PROVIDER === 'anthropic') {
      const bytes = Buffer.from(input.data, 'base64');
      const mediaType = input.mime === 'application/pdf' ? 'application/pdf' : input.mime;
      const source = mediaType === 'application/pdf'
        ? { type: 'document', source: { type: 'base64', media_type: mediaType, data: input.data } }
        : { type: 'image', source: { type: 'base64', media_type: mediaType, data: input.data } };
      r = await fetch(AI_URL, { signal: AbortSignal.timeout(85000), method: 'POST', headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify({ model: MODEL, max_tokens: 7000, messages: [{ role: 'user', content: [source, { type: 'text', text: sheet.prompt(input) }] }] }) });
      if (!r.ok) throw new Error('AI ' + r.status);
      const j = await r.json(); text = (j.content || []).map(x => x.text || '').join('\n');
    } else {
      r = await fetch(GEMINI_URL, { signal: AbortSignal.timeout(85000), method: 'POST', headers: { 'x-goog-api-key': GEMINI_API_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ inlineData: { mimeType: input.mime, data: input.data } }, { text: sheet.prompt(input) }] }], generationConfig: { maxOutputTokens: 7000, responseMimeType: 'application/json' } }) });
      if (!r.ok) throw new Error('AI ' + r.status);
      const j = await r.json(); text = ((j.candidates || [])[0]?.content?.parts || []).map(x => x.text || '').join('\n');
    }
    if (!text) throw new Error('хоосон хариу');
    const raw = sheet.parse(text);
    if (raw.error) throw new Error('READ');
    const d = sheet.clean(raw);
    if (use === 'free') await q('UPDATE users SET free_done=true WHERE id=$1', [u.id]);
    res.json({ ...d, ...status(await getUser(u.id)) });
  } catch (e) {
    console.error('generate:', e.message);
    if (use === 'free') await q('UPDATE users SET free_used=0 WHERE id=$1 AND free_done=false', [u.id]);
    else await q('UPDATE users SET credits=credits+1 WHERE id=$1', [u.id]);
    if (e.message === 'READ') return res.status(422).json({ error: 'Файлаас эхийг уншиж чадсангүй. Илүү тод зураг эсвэл PDF оруулна уу (эрх хасагдаагүй).' });
    res.status(502).json({ error: 'AI түр алдаа гаргалаа. Дахин оролдоно уу (эрх хасагдаагүй).' });
  }
}));
// багшийн засварласан асуултаас Word файл үүсгэх (төлбөр хасахгүй)
router.post('/docx', auth, limit(40, 3600e3), express.json({ limit: '200kb' }), ah(async (req, res) => {
  try { const d = sheet.clean({ title: req.body.title, levels: req.body.levels }); res.json({ docx: await sheet.make(d), title: d.title }); }
  catch { res.status(400).json({ error: 'Асуулт дутуу байна' }); }
}));

// ---- төлбөр ----
async function activate(orderNo, bankReference = null) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const p = await c.query("UPDATE payments SET status='paid', paid_at=$2, bank_reference=$3, confirmed_at=$2 WHERE order_no=$1 AND status='pending' RETURNING user_id, qty", [orderNo, Date.now(), bankReference]);
    if (!p.rowCount) { await c.query('ROLLBACK'); return false; }
    await c.query('UPDATE users SET credits=credits+$1 WHERE id=$2', [p.rows[0].qty, p.rows[0].user_id]);
    await c.query('COMMIT'); return true;
  } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; }
  finally { c.release(); }
}
async function verifyAndActivate(orderNo) {
  const p = (await q('SELECT * FROM payments WHERE order_no=$1', [orderNo])).rows[0];
  if (!p) return 'unknown';
  if (p.status === 'paid') return 'paid';
  if (await qpay.isPaid(p.invoice_id, p.amount)) { await activate(orderNo); return 'paid'; }
  return 'pending';
}
router.post('/pay/create', auth, limit(20, 3600e3), ah(async (req, res) => {
  const qty = Math.min(50, Math.max(1, parseInt(req.body.qty) || 1)), amount = qty * SHEET_PRICE;
  try {
    if (qpay.MODE === 'mock' && (process.env.RENDER || process.env.NODE_ENV === 'production')) return res.status(503).json({ error: 'Төлбөрийн горим тохируулаагүй байна. BAGSH_QPAY_MODE=manual (эсвэл QPAY_MODE=manual) эсвэл live тохируулна уу.' });
    const manual = qpay.MODE === 'manual';
    if (manual) {
      // Үнэ өөрчлөгдсөн бол хуучин дүнтэй захиалгыг дахин ашиглахгүй
      const pending = (await q("SELECT order_no AS \"orderNo\",amount,qty FROM payments WHERE user_id=$1 AND qty=$2 AND amount=$3 AND status='pending' AND invoice_id LIKE 'MANUAL-%' ORDER BY created_at DESC LIMIT 1", [req.user.id, qty, amount])).rows[0];
      if (pending) return res.json({ ...pending, invoiceId: 'MANUAL-' + pending.orderNo, manual: true, mock: false, qrUrl: '/qr.png', reused: true });
    }
    for (let i = 0; i < 5; i++) {
      // Гар горимд хэрэглэгч гүйлгээний утгад бичих тул богино код (WS12345)
      const orderNo = manual ? 'WS' + crypto.randomInt(10000, 100000) : 'WS' + Date.now() + crypto.randomBytes(4).toString('hex');
      try {
        const inv = await qpay.createInvoice({ orderNo, amount, description: `Ажлын хуудас ${qty} ширхэг` });
        await q('INSERT INTO payments(order_no,user_id,invoice_id,amount,qty,created_at) VALUES($1,$2,$3,$4,$5,$6)', [orderNo, req.user.id, inv.invoiceId, amount, qty, Date.now()]);
        return res.json({ orderNo, amount, qty, ...inv, mock: qpay.MODE === 'mock', manual, qrUrl: manual ? '/qr.png' : null });
      } catch (e) { if (e.code !== '23505') throw e; }
    }
    res.status(500).json({ error: 'Дахин оролдоно уу' });
  } catch (e) { console.error('pay:', e.message); res.status(502).json({ error: 'Нэхэмжлэх үүсгэж чадсангүй. Дахин оролдоно уу.' }); }
}));
router.post('/pay/check', auth, ah(async (req, res) => {
  const p = (await q('SELECT * FROM payments WHERE order_no=$1 AND user_id=$2', [String(req.body.orderNo || ''), req.user.id])).rows[0];
  if (!p) return res.status(404).json({ error: 'Олдсонгүй' });
  try { const s = await verifyAndActivate(p.order_no); res.json({ status: s, ...status(await getUser(req.user.id)) }); }
  catch (e) { console.error('check:', e.message); res.status(502).json({ error: 'Төлбөр шалгаж чадсангүй' }); }
}));
// QPay callback: query-д итгэхгүй, QPay-аас дахин баталгаажуулна
router.all('/pay/callback', async (req, res) => { try { await verifyAndActivate(String(req.query.order || '')); } catch {} res.sendStatus(200); });
if (qpay.MODE === 'mock') router.post('/pay/mock-confirm', auth, ah(async (req, res) => {
  const p = (await q('SELECT * FROM payments WHERE order_no=$1 AND user_id=$2', [String(req.body.orderNo || ''), req.user.id])).rows[0];
  if (!p) return res.status(404).json({ error: 'Олдсонгүй' });
  qpay.mockMarkPaid(p.invoice_id); res.json({ ok: true });
}));

// ---- гар төлбөрийн админ (QPAY_MODE=manual) ----
const adminAuth = (req, res, next) => {
  const supplied = Buffer.from(String(req.headers['x-admin-key'] || ''));
  const valid = ADMIN_KEYS.some(key => { const expected = Buffer.from(key); return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected); });
  if (!valid) return res.status(401).json({ error: 'Админ түлхүүр буруу' });
  next();
};
router.get('/admin/pending', limit(60, 900e3), adminAuth, ah(async (req, res) => {
  res.json((await q(`SELECT p.order_no "orderNo", p.amount, p.created_at "createdAt", u.email FROM payments p JOIN users u ON u.id=p.user_id
    WHERE p.status='pending' AND p.invoice_id LIKE 'MANUAL-%' ORDER BY p.created_at DESC LIMIT 100`)).rows);
}));
router.post('/admin/confirm', limit(60, 900e3), adminAuth, ah(async (req, res) => {
  const o = String(req.body.orderNo || ''), ref = String(req.body.bankReference || '').trim().slice(0, 120);
  if (!ref) return res.status(400).json({ error: 'Банкны гүйлгээний дугаар эсвэл лавлагааг оруулна уу.' });
  if (!(await q("SELECT 1 FROM payments WHERE order_no=$1 AND invoice_id LIKE 'MANUAL-%'", [o])).rowCount) return res.status(404).json({ error: 'Олдсонгүй' });
  res.json({ ok: true, activated: await activate(o, ref) });
}));


// Үндсэн сайтын нэгдсэн админ самбар эдгээр функцийг дуудаж worksheet төлбөрийг удирдана.
async function adminPendingPayments() {
  if (!ready) throw new Error('Ажлын хуудасны өгөгдлийн сан бэлэн биш байна.');
  return (await q(`SELECT p.order_no AS "orderNo", p.amount, p.created_at AS "createdAt", u.email, p.qty
    FROM payments p JOIN users u ON u.id=p.user_id
    WHERE p.status='pending' AND p.invoice_id LIKE 'MANUAL-%'
    ORDER BY p.created_at DESC LIMIT 100`)).rows;
}
// Бүх төлөвтэй сүүлийн төлбөрүүд (админы «Сүүлийн захиалгууд» хүснэгтэд)
async function adminRecentPayments(limit = 40) {
  if (!ready) throw new Error('Ажлын хуудасны өгөгдлийн сан бэлэн биш байна.');
  return (await q(`SELECT p.order_no AS "orderNo", p.status, p.amount, p.created_at AS "createdAt", p.paid_at AS "paidAt", p.invoice_id AS "invoiceId", u.email, p.qty
    FROM payments p JOIN users u ON u.id=p.user_id ORDER BY p.created_at DESC LIMIT $1`, [limit])).rows;
}
async function adminConfirmPayment(orderNo, bankReference) {
  if (!ready) throw new Error('Ажлын хуудасны өгөгдлийн сан бэлэн биш байна.');
  const found = await q("SELECT 1 FROM payments WHERE order_no=$1 AND invoice_id LIKE 'MANUAL-%' AND status='pending'", [orderNo]);
  if (!found.rowCount) return false;
  return activate(orderNo, bankReference);
}

async function initBagsh() { if (!DATABASE_URL || !JWT_SECRET || JWT_SECRET.length < 24) throw new Error('BAGSH_DATABASE_URL эсвэл BAGSH_JWT_SECRET тохируулаагүй'); await init(); ready = true; console.log('Багшийн туслах өгөгдлийн сан бэлэн. QPay:', qpay.MODE); }
module.exports = { router, initBagsh, pool, adminPendingPayments, adminRecentPayments, adminConfirmPayment };
