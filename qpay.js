// QPay v2 адаптер (үндсэн сайт болон Багшийн туслах хоёулаа ашиглана).
//   QPAY_MODE=manual — QR + гүйлгээний утга, админ банкны орлогыг гараар баталгаажуулна
//   QPAY_MODE=live   — QPay нэхэмжлэл үүсгэж, сервер QPay-аас төлбөрийг шалгана
//   QPAY_MODE=mock   — зөвхөн туршилт (production дээр төлбөр үүсгэхийг сервер хориглоно)
// Live горимд ашиглахын өмнө QPay merchant баримт бичгийн endpoint/талбарыг заавал баталгаажуул.
function create({ prefix = '', callbackPath = '/api/pay/callback' } = {}) {
  // prefix (жишээ нь BAGSH_) бүхий хувьсагч эхэнд, байхгүй бол ерөнхий хувьсагч уншигдана.
  const env = (k, fallback = '') => String((prefix && process.env[prefix + k]) || process.env[k] || fallback).trim();
  const rawMode = env('QPAY_MODE', 'mock').toLowerCase();   // "Manual", " manual " гэж бичсэн ч ажиллана
  const MODE = ['mock', 'manual', 'live'].includes(rawMode) ? rawMode : 'mock';
  if (MODE !== rawMode) console.error(`${prefix}QPAY_MODE="${rawMode}" буруу байна. manual, live эсвэл mock гэж бичнэ үү.`);
  const BASE = env('QPAY_BASE', 'https://merchant.qpay.mn/v2').replace(/\/+$/, '');
  const publicUrl = () => env('PUBLIC_URL').replace(/\/+$/, '');
  let tok = null, exp = 0;
  const mockPaid = new Set();

  async function token() {
    if (tok && Date.now() < exp) return tok;
    const user = env('QPAY_USERNAME'), pass = env('QPAY_PASSWORD');
    if (!user || !pass) throw new Error('QPAY_USERNAME / QPAY_PASSWORD тохируулаагүй байна');
    const basic = Buffer.from(`${user}:${pass}`).toString('base64');
    const r = await fetch(`${BASE}/auth/token`, { method: 'POST', headers: { Authorization: `Basic ${basic}` }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error('QPay auth алдаа ' + r.status);
    const j = await r.json();
    if (!j.access_token) throw new Error('QPay auth: access_token ирсэнгүй');
    tok = j.access_token;
    exp = Date.now() + (j.expires_in ? Math.max(30, j.expires_in - 60) * 1000 : 3000000);
    return tok;
  }
  // Token хугацаа дуусаж 401 ирвэл нэг удаа шинэчлээд дахин оролдоно
  async function call(path, body, retried = false) {
    const r = await fetch(`${BASE}${path}`, {
      method: 'POST', signal: AbortSignal.timeout(20000),
      headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    if (r.status === 401 && !retried) { tok = null; exp = 0; return call(path, body, true); }
    if (!r.ok) throw new Error(`QPay ${path} алдаа ${r.status} ${(await r.text().catch(() => '')).slice(0, 200)}`);
    return r.json();
  }

  async function createInvoice({ orderNo, amount, description, callbackUrl }) {
    if (MODE === 'mock') return { invoiceId: 'MOCK-' + orderNo, qr: null, urls: [], shortUrl: null };
    if (MODE === 'manual') return { invoiceId: 'MANUAL-' + orderNo, qr: null, urls: [], shortUrl: null };
    const code = env('QPAY_INVOICE_CODE');
    if (!code) throw new Error('QPAY_INVOICE_CODE тохируулаагүй байна');
    const cb = callbackUrl || `${publicUrl()}${callbackPath}?order=${encodeURIComponent(orderNo)}`;
    if (!/^https:\/\//i.test(cb)) throw new Error('PUBLIC_URL (https://...) тохируулаагүй тул QPay callback үүсгэж чадсангүй');
    const j = await call('/invoice', {
      invoice_code: code, sender_invoice_no: orderNo, invoice_receiver_code: 'terminal',
      invoice_description: String(description || orderNo).slice(0, 250), amount: Math.round(Number(amount)), callback_url: cb
    });
    return { invoiceId: j.invoice_id, qr: j.qr_image, urls: j.urls || [], shortUrl: j.qPay_shortUrl };
  }
  // Сервер талаас QPay-аас шууд шалгана — callback/клиентийн хэлсэнд итгэхгүй
  async function isPaid(invoiceId, amount) {
    if (MODE === 'mock') return mockPaid.has(invoiceId);
    if (MODE === 'manual') return false; // зөвхөн админ баталгаажуулна
    const j = await call('/payment/check', { object_type: 'INVOICE', object_id: invoiceId, offset: { page_number: 1, page_size: 100 } });
    return Number(j.paid_amount) >= amount || (j.rows || []).some(p => p.payment_status === 'PAID' && Number(p.payment_amount) >= amount);
  }
  return { createInvoice, isPaid, mockMarkPaid: id => mockPaid.add(id), MODE };
}
module.exports = { ...create(), create };
