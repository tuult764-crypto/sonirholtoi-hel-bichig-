/* Анирын өдрийн тэмдэглэл — нийтэлсэн бичвэрийг серверээс уншина. */
(function () {
  'use strict';
  let entries = [], page = 0;
  const $ = id => document.getElementById(id);
  const book = () => $('diaryBook');
  const controls = () => $('diaryReadingControls');
  function update() {
    const prev=$('diaryPrevBtn'), next=$('diaryNextBtn'), status=$('diaryPageStatus');
    if(prev) prev.disabled=page<=0;
    if(next) next.disabled=page>=entries.length;
    if(status) status.textContent=entries.length ? `${page+1} / ${entries.length}` : 'Одоогоор тэмдэглэл алга';
    const right=document.querySelector('.diary-page-right');
    if(!right) return;
    const item=entries[page-1];
    if(!item) {
      right.innerHTML='<span class="diary-page-date">ЭХЛЭЛ</span><h3>Сайн уу, уншигч минь.</h3><p>Намайг Анир гэдэг. Би бодол, дурсамжаа энэ дэвтэртээ бичиж үлдээнэ.</p><p>Хамтдаа миний ертөнцөөр аялцгаая.</p><span class="diary-sign">— Анир</span>';
      return;
    }
    const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    right.innerHTML=`<span class="diary-page-date">${esc(new Date(item.date).toLocaleDateString('mn-MN'))}</span><h3>${esc(item.title)}</h3><div class="diary-entry-body">${esc(item.body).replace(/\n/g,'<br>')}</div><span class="diary-sign">— Анир</span>`;
  }
  async function load() {
    try {
      const r=await fetch('/api/diary',{headers:{Accept:'application/json'}});
      if(!r.ok) throw new Error('Тэмдэглэл ачаалж чадсангүй');
      entries=await r.json();
      const archive=document.querySelector('.diary-archive');
      if(archive) {
        const old=archive.querySelector('.diary-empty');
        const list=document.createElement('div'); list.className='diary-entry-list';
        if(!entries.length) {
          if(old) old.innerHTML='<span>✧</span><p>Одоогоор нийтлэгдсэн тэмдэглэл алга.</p><small>Удахгүй шинэ дурсамж нэмэгдэнэ.</small>';
        } else {
          entries.forEach((e,i)=>{
            const card=document.createElement('article'); card.className='diary-entry-card';
            const h=document.createElement('h4'); h.textContent=e.title;
            const date=document.createElement('small'); date.textContent=new Date(e.date).toLocaleDateString('mn-MN');
            const p=document.createElement('p'); p.textContent=e.excerpt||e.body.slice(0,180);
            const btn=document.createElement('button'); btn.type='button'; btn.textContent='Дэвтрээс унших'; btn.addEventListener('click',()=>window.openAnirDiary(i+1));
            card.append(date,h,p,btn); list.append(card);
          });
          if(old) old.replaceWith(list); else archive.append(list);
        }
      }
      update();
    } catch(e) { console.warn('Анирын тэмдэглэл:',e.message); }
  }
  window.openAnirDiary=function(startPage){ page=Number.isInteger(startPage)?Math.max(0,Math.min(entries.length,startPage)):(entries.length?1:0); book()?.classList.add('is-open'); $('diaryOpenBtn')?.setAttribute('hidden',''); if(controls())controls().hidden=false; update(); };
  window.closeAnirDiary=function(){book()?.classList.remove('is-open');$('diaryOpenBtn')?.removeAttribute('hidden');if(controls())controls().hidden=true;};
  window.turnDiaryPage=function(direction){page=Math.max(0,Math.min(entries.length,page+direction));book()?.classList.toggle('show-entry',page>0);update();};
  document.addEventListener('DOMContentLoaded',load);
  if(document.readyState!=='loading') load();
})();