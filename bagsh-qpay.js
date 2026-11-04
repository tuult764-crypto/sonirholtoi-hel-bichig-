// Багшийн туслах (ажлын хуудас)-ын төлбөрийн адаптер. Нэг QPay код (qpay.js)-ийг ашиглана.
// BAGSH_QPAY_MODE, BAGSH_QPAY_USERNAME ... гэх мэт хувьсагчийг эхэнд нь, байхгүй бол QPAY_* хувьсагчийг уншина.
module.exports = require('./qpay').create({ prefix: 'BAGSH_', callbackPath: '/api/worksheet/pay/callback' });
