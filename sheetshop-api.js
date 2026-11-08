// Цахим дэлгүүр (судоку, PDF гэх мэт бүтээгдэхүүн): жагсаалт нь Google Sheet-ийн «Products» хуудаснаас,
// харин ЗАХИАЛГА, ТӨЛБӨР, БАТАЛГААЖУУЛАЛТ бүгд энэ серверт (админ хуудсанд) хадгалагдана. Google Apps Script-ээс хамаарахгүй.
const SHEET_ID = process.env.SHEET_ID || '19XbGi1hWULDm2MRjFAG8G0dtlp7tbfN2pJSupKWA6G4';
const SHEET_NAME = process.env.SHEET_NAME || 'Products';

const DDL = `CREATE TABLE IF NOT EXISTS sheet_orders(
  id BIGSERIAL PRIMARY KEY, order_no TEXT UNIQUE NOT NULL, email TEXT NOT NULL, user_id BIGINT, note TEXT NOT NULL DEFAULT '',
  items JSONB NOT NULL, amount INTEGER NOT NULL CHECK(amount > 0), status TEXT NOT NULL DEFAULT 'pending', unverified BOOLEAN NOT NULL DEFAULT false,
  user_reference TEXT, bank_reference TEXT, admin_note TEXT, created_at BIGINT NOT NULL, paid_at BIGINT);
CREATE INDEX IF NOT EXISTS sheet_orders_email ON sheet_orders(LOWER(email), status);`;

module.exports = function mount(ctx) {
  const { app, q, ah, limit, need, userOf, crypto } = ctx;
  const t = (v, n) => String(v == null ? '' : v).trim().slice(0, n);

  // ---- Бүтээгдэхүүний жагсаалтыг Sheet-ээс уншина (үнийг клиентэд итгэхгүй, серверт шалгана) ----
  let cache = { at: 0, rows: null };
  async function catalog() {
    if (cache.rows && Date.now() - cache.at < 60000) return cache.rows;
    try {
      const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(SHEET_NAME)}`;
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const txt = await r.text(), m = txt.match(/setResponse\(([\s\S]*)\);?\s*$/);
      const g = JSON.parse(m ? m[1] : txt), cols = g.table.cols, rows = g.table.rows;
      const find = (...names) => { const lc = names.map(n => n.toLowerCase()); for (let i = 0; i < cols.length; i++) { const l = String(cols[i].label || cols[i].id || '').toLowerCase().trim(); if (l && lc.some(n => l.includes(n) || n.includes(l))) return i; } return -1; };
      const ci = { title: Math.max(0, find('title', 'гарчиг', 'нэр')), price: Math.max(2, find('price', 'үнэ', 'дүн')), type: Math.max(4, find('type', 'төрөл')), link: Math.max(5, find('link', 'холбоос', 'url')) };
      const val = c => !c ? '' : String(c.f != null ? c.f : (c.v ?? '')).trim();
      const num = c => (!c || c.v == null) ? 0 : Number(c.v) || 0;
      const list = rows.filter(r => r.c && r.c[ci.title] && (r.c[ci.title].v || r.c[ci.title].f)).map(r => ({ title: val(r.c[ci.title]), price: num(r.c[ci.price]), type: val(r.c[ci.type]), link: val(r.c[ci.link]) }));
      cache = { at: Date.now(), rows: list };
      return list;
    } catch (e) { console.error('Sheet жагсаалт уншиж чадсангүй:', e.message); return cache.rows; }
  }

  // ---- Захиалга үүсгэх (нэвтрээгүй хэрэглэгч ч и-мэйлээр захиалж болно) ----
  app.post('/api/shop/orders', limit(15, 3600e3), ah(async (req, res) => {
    const email = t(req.body.email, 160).toLowerCase(), note = t(req.body.note, 300), reference = t(req.body.reference, 120);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Зөв и-мэйл хаяг оруулна уу.' });
    const raw = Array.isArray(req.body.items) ? req.body.items.slice(0, 30) : [];
    if (!raw.length) return res.status(400).json({ error: 'Сагс хоосон байна.' });
    const cat = await catalog(), items = []; let unverified = false;
    for (const it of raw) {
      const title = t(it && it.title, 200); if (!title) continue;
      if (cat) {
        const f = cat.find(c => c.title === title);
        if (!f) return res.status(400).json({ error: 'Бүтээгдэхүүн олдсонгүй: ' + title + '. Хуудсаа шинэчлээд дахин оролдоно уу.' });
        if (f.price > 0) items.push({ title: f.title, price: Math.round(f.price), link: f.link });
      } else {
        unverified = true;
        const price = Math.round(Number(it.price)); if (!(price > 0 && price <= 1000000)) continue;
        items.push({ title, price, link: t(it.link, 500) });
      }
    }
    if (!items.length) return res.status(400).json({ error: 'Төлбөртэй бүтээгдэхүүн олдсонгүй.' });
    const amount = items.reduce((s, x) => s + x.price, 0);
    const key = items.map(x => x.title).sort().join('|');
    // Давхар захиалга үүсгэхгүй: ижил и-мэйл, ижил бүтээгдэхүүнтэй хүлээгдэж буй захиалга (3 хоногт) байвал яг тэрийг буцаана
    const ex = (await q("SELECT order_no, items, amount FROM sheet_orders WHERE LOWER(email)=$1 AND status='pending' AND created_at>$2 ORDER BY created_at DESC LIMIT 5", [email, Date.now() - 3 * 864e5])).rows
      .find(o => o.items.map(x => x.title).sort().join('|') === key);
    if (ex) { if (reference) await q('UPDATE sheet_orders SET user_reference=$2 WHERE order_no=$1', [ex.order_no, reference]); return res.json({ ok: true, orderNo: ex.order_no, amount: Number(ex.amount), status: 'pending', reused: true }); }
    const u = await userOf(req), orderNo = 'SH' + Date.now() + crypto.randomBytes(3).toString('hex').toUpperCase();
    await q('INSERT INTO sheet_orders(order_no,email,user_id,note,items,amount,unverified,user_reference,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [orderNo, email, u ? u.id : null, note, JSON.stringify(items), amount, unverified, reference || null, Date.now()]);
    res.status(201).json({ ok: true, orderNo, amount, status: 'pending' });
  }));

  // Захиалгын төлөв (код + и-мэйлээр)
  app.post('/api/shop/orders/status', limit(30, 3600e3), ah(async (req, res) => {
    const o = (await q('SELECT order_no, amount, status, created_at, admin_note FROM sheet_orders WHERE order_no=$1 AND LOWER(email)=$2', [t(req.body.orderNo, 60), t(req.body.email, 160).toLowerCase()])).rows[0];
    if (!o) return res.status(404).json({ error: 'Захиалга олдсонгүй. Код болон и-мэйлээ шалгана уу.' });
    res.json({ orderNo: o.order_no, amount: Number(o.amount), status: o.status, createdAt: Number(o.created_at), adminNote: o.status === 'failed' ? (o.admin_note || '') : '' });
  }));

  // «Миний сан»: баталгаажсан захиалгын файлууд (нэвтэрсэн хэрэглэгчийн и-мэйлээр)
  app.get('/api/shop/library', need, ah(async (req, res) => {
    const rows = (await q("SELECT items, paid_at, created_at FROM sheet_orders WHERE status='paid' AND (user_id=$1 OR LOWER(email)=LOWER($2)) ORDER BY paid_at DESC", [req.user.id, req.user.email])).rows;
    const seen = new Set(), out = [];
    rows.forEach(o => o.items.forEach(it => { const k = it.title + '|' + it.link; if (seen.has(k)) return; seen.add(k); out.push({ title: it.title, link: it.link, date: new Date(Number(o.paid_at || o.created_at)).toLocaleDateString('mn-MN') }); }));
    res.json(out);
  }));
  // Миний захиалгууд (төлөвтэй)
  app.get('/api/shop/my-orders', need, ah(async (req, res) => {
    const rows = (await q("SELECT order_no, items, amount, status, created_at, admin_note FROM sheet_orders WHERE user_id=$1 OR LOWER(email)=LOWER($2) ORDER BY created_at DESC LIMIT 30", [req.user.id, req.user.email])).rows;
    res.json(rows.map(o => ({ orderNo: o.order_no, detail: o.items.map(x => x.title).join(', '), amount: Number(o.amount), status: o.status, createdAt: Number(o.created_at), adminNote: o.status === 'failed' ? (o.admin_note || '') : '' })));
  }));

  // ---- Админы нэгдсэн самбарт ашиглах функцууд ----
  return {
    ddl: DDL,
    pending: () => q(`SELECT order_no AS "orderNo", amount, created_at AS "createdAt", email, items, unverified, user_reference AS "userReference" FROM sheet_orders WHERE status='pending' ORDER BY created_at DESC LIMIT 100`),
    recent: n => q(`SELECT order_no AS "orderNo", status, amount, created_at AS "createdAt", paid_at AS "paidAt", email, items FROM sheet_orders ORDER BY created_at DESC LIMIT $1`, [n]),
    confirm: async (orderNo, bankReference) => (await q("UPDATE sheet_orders SET status='paid', paid_at=$2, bank_reference=$3 WHERE order_no=$1 AND status IN ('pending','failed') RETURNING order_no", [orderNo, Date.now(), bankReference])).rowCount === 1,
    detail: items => (items || []).map(x => x.title).join(', ')
  };
};
