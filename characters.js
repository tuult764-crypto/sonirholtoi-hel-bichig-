/* ДҮРҮҮДИЙН НЭГДСЭН БҮРТГЭЛ
   Зургийг images/characters/ хавтсанд яг заасан нэрээр нэмнэ.
   Зураг байхгүй үед сайт нэрийн эхний үсгийг ашиглана; өөр дүрийн зураг зохиомлоор үүсгэхгүй.
*/
(function (global) {
  'use strict';
  global.SHCharacters = [
    { id: 'tsovoo', name: 'Цовоо', image: 'tsovoo.png', role: 'Алхам алхмаар тайлбарлаж, эмх цэгцтэй сурахад тусална.', personality: 'Нямбай, найдвартай хүү' },
    { id: 'todoo', name: 'Тодоо', image: 'todoo.png', role: 'Асуулт, сорил, тоглоомоор давтахад тусална.', personality: 'Хөдөлгөөнтэй, хөгжилтэй хүү' },
    { id: 'enkhrii', name: 'Энхрий', image: 'enkhrii.png', role: 'Зөөлөн тайлбарлаж, суралцагчийг урамшуулна.', personality: 'Зөөлөн, номд дуртай охин' },
    { id: 'azaa', name: 'Азаа', image: 'azaa.png', role: 'Найзуудаа анхаарч халамжилдаг ч өөрийн хүсэл мөрөөдлөө бас нээж явна.', personality: 'Халамжтай, хариуцлагатай охин' },
    { id: 'anir', name: 'Анир', image: 'anir.png', role: 'Шинэ мэдлэг танилцуулж, эргэцүүлэн бодоход тусална.', personality: 'Ажигч, дуу цөөнтэй охин' }
  ];
  global.getSHCharacter = function (id) { return global.SHCharacters.find(function (c) { return c.id === id; }) || null; };
})(window);
