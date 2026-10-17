// QPay v2 адаптер. QPAY_MODE=mock үед жинхэнэ дуудлага хийхгүй.
// ЖИНХЭНЭ горимд ашиглахын өмнө QPay merchant баримт бичгийн endpoint/талбарыг заавал баталгаажуул.
const MODE = process.env.QPAY_MODE || 'mock';
const BASE = process.env.QPAY_BASE || 'https://merchant.qpay.mn/v2';
let tok = null, exp = 0;
const mockPaid = new Set();

async function token() {
  if (tok && Date.now() < exp) return tok;
  const basic = Buffer.from(`${process.env.QPAY_USERNAME}:${process.env.QPAY_PASSWORD}`).toString('base64');
  const r = await fetch(`${BASE}/auth/token`, { method: 'POST', headers: { Authorization: `Basic ${basic}` } });
  if (!r.ok) throw new Error('QPay auth алдаа ' + r.status);
  const j = await r.json(); tok = j.access_token; exp = Date.now() + (j.expires_in ? j.expires_in * 1000 - 60000 : 3000000);
  return tok;
}
async function createInvoice({ orderNo, amount, description }) {
  if (MODE === 'mock') return { invoiceId: 'MOCK-' + orderNo, qr: null, urls: [], shortUrl: null };
  if (MODE === 'manual') return { invoiceId: 'MANUAL-' + orderNo, qr: null, urls: [], shortUrl: null };
  const r = await fetch(`${BASE}/invoice`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      invoice_code: process.env.QPAY_INVOICE_CODE, sender_invoice_no: orderNo,
      invoice_receiver_code: 'terminal', invoice_description: description, amount,
      callback_url: `${process.env.PUBLIC_URL}/api/pay/callback?order=${orderNo}`
    })
  });
  if (!r.ok) throw new Error('QPay invoice алдаа ' + r.status);
  const j = await r.json();
  return { invoiceId: j.invoice_id, qr: j.qr_image, urls: j.urls || [], shortUrl: j.qPay_shortUrl };
}
// Сервер талаас QPay-аас шууд шалгана — callback/клиентийн хэлсэнд итгэхгүй
async function isPaid(invoiceId, amount) {
  if (MODE === 'mock') return mockPaid.has(invoiceId);
  if (MODE === 'manual') return false; // зөвхөн админ баталгаажуулна
  const r = await fetch(`${BASE}/payment/check`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ object_type: 'INVOICE', object_id: invoiceId, offset: { page_number: 1, page_size: 100 } })
  });
  if (!r.ok) throw new Error('QPay check алдаа ' + r.status);
  const j = await r.json();
  return Number(j.paid_amount) >= amount || (j.rows || []).some(p => p.payment_status === 'PAID' && Number(p.payment_amount) >= amount);
}
module.exports = { createInvoice, isPaid, mockMarkPaid: id => mockPaid.add(id), MODE };
