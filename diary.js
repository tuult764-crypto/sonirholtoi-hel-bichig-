/* Анирын өдрийн тэмдэглэл — ном нээх, хуудсыг эргүүлэх хөдөлгөөн */
(function () {
  'use strict';
  let page = 0;
  const pageCount = 1; // Нийтлэгдсэн тэмдэглэл нэмэгдэхэд өргөжүүлнэ.
  const book = () => document.getElementById('diaryBook');
  const controls = () => document.getElementById('diaryReadingControls');
  function update() {
    const prev = document.getElementById('diaryPrevBtn');
    const next = document.getElementById('diaryNextBtn');
    const status = document.getElementById('diaryPageStatus');
    if (prev) prev.disabled = page <= 0;
    if (next) next.disabled = page >= pageCount;
    if (status) status.textContent = page === 0 ? 'Эхлэл' : 'Тэмдэглэлийн эхлэл';
  }
  window.openAnirDiary = function () {
    page = 0;
    book()?.classList.add('is-open');
    document.getElementById('diaryOpenBtn')?.setAttribute('hidden', '');
    if (controls()) controls().hidden = false;
    update();
  };
  window.closeAnirDiary = function () {
    book()?.classList.remove('is-open');
    document.getElementById('diaryOpenBtn')?.removeAttribute('hidden');
    if (controls()) controls().hidden = true;
  };
  window.turnDiaryPage = function (direction) {
    const nextPage = Math.max(0, Math.min(pageCount, page + direction));
    if (nextPage === page) return;
    page = nextPage;
    book()?.classList.toggle('show-entry', page > 0);
    update();
  };
})();
