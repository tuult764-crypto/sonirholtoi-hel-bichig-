/* ДҮРҮҮДИЙН НЭГДСЭН БҮРТГЭЛ
   Зургийг images/characters/ хавтсанд яг заасан нэрээр нэмнэ.
   Зураг байхгүй үед сайт нэрийн эхний үсгийг ашиглана; өөр дүрийн зураг зохиомлоор үүсгэхгүй.
*/
(function (global) {
  'use strict';
  global.SHCharacters = [
    { id: 'tsovoo', name: 'Цовоо', image: 'images/characters/tsovoo.png', role: 'Алхам алхмаар тайлбарлаж, эмх цэгцтэй сурахад тусална.', personality: 'Нямбай, найдвартай хүү' },
    { id: 'todoo', name: 'Тодоо', image: 'images/characters/todoo.png', role: 'Асуулт, сорил, тоглоомоор давтахад тусална.', personality: 'Хөдөлгөөнтэй, хөгжилтэй хүү' },
    { id: 'enkhrii', name: 'Энхрий', image: 'images/characters/enkhrii.png', role: 'Зөөлөн тайлбарлаж, суралцагчийг урамшуулна.', personality: 'Зөөлөн, номд дуртай охин' },
    { id: 'ajaa', name: 'Ажаа', image: 'images/characters/ajaa.png', role: 'Дасгал, давтлага, зорилгоо биелүүлэхэд тусална.', personality: 'Өөртөө итгэлтэй охин' },
    { id: 'anir', name: 'Анир', image: 'images/characters/anir.png', role: 'Шинэ мэдлэг танилцуулж, эргэцүүлэн бодоход тусална.', personality: 'Ажигч, дуу цөөнтэй охин' }
  ];
  global.getSHCharacter = function (id) { return global.SHCharacters.find(function (c) { return c.id === id; }) || null; };
})(window);
