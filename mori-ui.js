/* ══════════════════════════════════════════════════════════════
   МОРЬ УРАЛДЪЯ 🐎 — ДЭЛГЭЦ БА ТОГЛООМЫН ЯВЦ (UI)
   ──────────────────────────────────────────────────────────────
   Гурван дэлгэц:
     1) Өдрийн зам   — 14 өдрийн жагсаалт, өнөөдрийн даалгавар
     2) Уралдаан     — морь, асуулт, хариулт
     3) Өнөөдрийн ахиц — оноо, зөв хариултын хувь, давтсан чадвар
   #moriApp дотор бүгдийг зурна. index.html-ийн "horseSection"-д
   зөвхөн энэ хоосон хайрцаг байна.
   ══════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';
  var NS = global.MoriUralduya;
  var C = NS.CONFIG, E = NS.Engine, Store = NS.Store, Access = NS.Access;

  var root = null;   // #moriApp
  var G = null;      // тоглолтын төлөв
  var BADGES = ['А', 'Б', 'В', 'Г'];

  /* ── Туслах ── */
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function reduceMotion() {
    try { return global.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
  }
  function toast(msg, type) { if (typeof global.showToast === 'function') global.showToast(msg, type || 'error'); }
  function starString(accuracy) {
    var n = accuracy >= 0.95 ? 5 : accuracy >= 0.8 ? 4 : accuracy >= 0.65 ? 3 : accuracy >= 0.5 ? 2 : 1;
    return '⭐'.repeat(n) + '☆'.repeat(5 - n);
  }
  function dayInfo(n) { return NS.DAYS[n - 1]; }
  function skillsOfDay(n) {
    var seen = [], list = [];
    dayInfo(n).levels.forEach(function (l) {
      Object.keys(NS.LEVELS[l].types).forEach(function (t) {
        var s = NS.SKILL_BY_TYPE[t];
        if (s && seen.indexOf(s) === -1 && !(t === 'listen' && !E.canListen())) { seen.push(s); list.push(s); }
      });
    });
    return list;
  }

  /* ══════════════ SVG зурлага ══════════════ */
  function svgStroke(path, opt) {
    opt = opt || {};
    var m = /M\s*([\d.]+)\s+([\d.]+)/.exec(path) || [0, 50, 50];
    var body;
    if (opt.partial) {
      body = '<path d="' + path + '" class="mr-ghost" pathLength="100" stroke-dasharray="2 5"/>' +
             '<path d="' + path + '" class="mr-line" pathLength="100" stroke-dasharray="52 100"/>';
    } else {
      body = '<path d="' + path + '" class="mr-line"/>';
    }
    if (opt.start) body += '<circle cx="' + m[1] + '" cy="' + m[2] + '" r="5.5" class="mr-dot"/>';
    return '<svg class="mr-svg' + (opt.big ? ' is-big' : '') + '" viewBox="0 0 100 100" aria-hidden="true">' + body + '</svg>';
  }

  /* ══════════════ Асуултын харагдац ══════════════ */
  function scriptHTML(v, size) {
    return '<span class="mr-script mr-s-' + (size || 'md') + '" lang="mn-Mong">' + v + '</span>';
  }
  function viewHTML(v) {
    switch (v.kind) {
      case 'script':
        return scriptHTML(v.value, v.size || 'lg');
      case 'text':
        return '<div class="mr-bigtext' + (v.small ? ' is-small' : '') + (v.size === 'xl' ? ' is-xl' : '') + '">' + esc(v.value) + '</div>';
      case 'stroke':
        return svgStroke(v.path, { start: v.start, big: true });
      case 'partialStroke':
        return svgStroke(v.path, { partial: true, big: true });
      case 'syllableEq':
        return '<div class="mr-eq"><span>' + esc(v.parts[0]) + '</span><i>+</i><span>' + esc(v.parts[1]) + '</span><i>=</i><span class="is-q">?</span></div>';
      case 'wordBlank':
        return scriptHTML(v.script, 'lg') +
          '<div class="mr-blank" aria-label="Дутуу үсэгтэй үг">' +
          v.slots.map(function (c) { return c === null ? '<b class="is-gap">_</b>' : '<b>' + esc(c.toUpperCase()) + '</b>'; }).join('') + '</div>';
      case 'sentence':
        return '<div class="mr-sentence">' + v.words.map(function (w) { return scriptHTML(w, 'lg'); }).join('') + '</div>';
      case 'audio':
        return '<button type="button" class="mr-play" data-act="play" aria-label="Дууг сонсох">🔊<span>Сонсох</span></button>';
      default:
        return '';
    }
  }
  function optHTML(o) {
    if (o.kind === 'script') return scriptHTML(o.value, 'md');
    if (o.kind === 'stroke') return svgStroke(o.value, {});
    if (o.kind === 'arrow') return '<span class="mr-arrow">' + o.value + '</span>';
    return '<span class="mr-otext">' + esc(o.value) + '</span>';
  }

  /* ══════════════ 1) ӨДРИЙН ЗАМ ══════════════ */
  function showHome() {
    clearTimers();
    G = null;
    var st = Store.load();
    var done = st.access.completedDays.length, total = C.totalDays;
    var today = Access.suggestedDay(st);

    var tomorrowDay = null;
    for (var d = 1; d <= total; d++) { if (Access.status(d, st) === 'tomorrow') { tomorrowDay = d; break; } }

    var hero;
    if (today) {
      hero = '<div class="mr-today">' +
        '<div class="mr-today-tag">' + NS.STATUS.today.icon + ' ' + NS.STATUS.today.text + '</div>' +
        '<div class="mr-today-title">Өдөр ' + today + ' — ' + esc(dayInfo(today).title) + '</div>' +
        '<p class="mr-today-meta">' + skillsOfDay(today).slice(0, 3).map(esc).join(' · ') + '</p>' +
        '<button type="button" class="mr-btn" data-act="intro" data-day="' + today + '">ТОГЛОХ 🐎</button></div>';
    } else if (tomorrowDay) {
      hero = '<div class="mr-today is-wait">' +
        '<div class="mr-today-tag">' + NS.STATUS.tomorrow.icon + ' ' + NS.STATUS.tomorrow.text + '</div>' +
        '<div class="mr-today-title">Өдөр ' + tomorrowDay + ' — ' + esc(dayInfo(tomorrowDay).title) + '</div>' +
        '<p class="mr-today-meta">Өнөөдрийн даалгавраа дуусгалаа. Маргааш дахин уулзъя!</p></div>';
    } else {
      hero = '<div class="mr-today is-wait"><div class="mr-today-tag">🏆 Баяр хүргэе!</div>' +
        '<div class="mr-today-title">Бүх өдрийн даалгаврыг дуусгалаа</div>' +
        '<p class="mr-today-meta">Дурын өдрийг сонгож дахин давтаж болно.</p></div>';
    }

    var tiles = dayTilesHTML(st);
    root.innerHTML =
      '<div class="mr-wrap">' +
      '<header class="mr-hero"><div class="mr-band" aria-hidden="true"></div>' +
      '<h2 class="mr-title">МОРЬ УРАЛДЪЯ 🐎</h2>' +
      '<p class="mr-sub">Монгол бичгээ тоглонгоо сурцгаая!</p></header>' +
      hero +
      '<div class="mr-progress"><div class="mr-progress-row"><span>Дууссан өдөр</span><b>' + done + '/' + total + '</b></div>' +
      '<div class="mr-bar" role="progressbar" aria-valuemin="0" aria-valuemax="' + total + '" aria-valuenow="' + done + '"><i style="width:' + (done / total * 100) + '%"></i></div></div>' +
      '<h3 class="mr-h3">' + total + ' өдрийн зам</h3>' +
      '<div class="mr-days">' + tiles + '</div>' +
      '<details class="mr-rules"><summary>Тоглоомын дүрэм</summary>' +
      '<ul><li>Асуултад зөв хариулах бүрд морь <b>1 алхам</b> урагшилна.</li>' +
      '<li>Хурдан зөв хариулбал <b>2 алхам</b>.</li>' +
      '<li>Буруу хариулбал морь зогсоно — зөв хариултыг харж, дахин оролдоно.</li>' +
      '<li>' + C.trackSteps + ' алхамд түрүүлж хүрвэл барианд орно.</li></ul></details>' +
      '</div>';
  }

  function dayTilesHTML(st) {
    return NS.DAYS.map(function (d) {
      var s = Access.status(d.day, st), meta = NS.STATUS[s], ok = Access.isPlayable(s);
      return '<button type="button" class="mr-day is-' + s + '" data-act="' + (ok ? 'intro' : 'locked') + '" data-day="' + d.day + '" data-status="' + s + '"' +
        ' aria-label="Өдөр ' + d.day + ', ' + esc(d.title) + ', ' + meta.text + '">' +
        '<span class="mr-day-n">' + d.day + '</span>' +
        '<span class="mr-day-t">' + esc(d.short) + '</span>' +
        '<span class="mr-day-s" aria-hidden="true">' + meta.icon + '</span></button>';
    }).join('');
  }

  /* ── Өдрийн танилцуулга ── */
  function showIntro(n) {
    var d = dayInfo(n), st = Store.load(), s = Access.status(n, st);
    var total = d.questions || C.questionsPerSession;
    root.innerHTML =
      '<div class="mr-wrap"><button type="button" class="mr-link" data-act="home">← Өдрийн зам</button>' +
      '<div class="mr-card mr-intro"><div class="mr-band" aria-hidden="true"></div>' +
      '<div class="mr-today-tag">' + NS.STATUS[s].icon + ' Өдөр ' + n + '</div>' +
      '<h3 class="mr-intro-title">' + esc(d.title) + '</h3>' +
      '<p class="mr-intro-lead">Өнөөдөр юуг сурах вэ?</p>' +
      '<ul class="mr-skills">' + skillsOfDay(n).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' +
      '<p class="mr-intro-note">Хамгийн ихдээ ' + total + ' асуулт · ойролцоогоор 5–10 минут. ' +
      C.trackSteps + ' алхамд түрүүлж хүрвэл барианд орно!</p>' +
      '<button type="button" class="mr-btn" data-act="start" data-day="' + n + '">Уралдаж эхлэх 🐎</button></div></div>';
  }

  /* ══════════════ 2) УРАЛДАЖ ЭХЛЭХ ══════════════ */
  function startGame(n) {
    clearTimers();
    var ctx = E.buildContext(n);
    G = {
      dayNo: n, ctx: ctx, total: ctx.total,
      me: 0, rv: 0, score: 0, streak: 0, bestStreak: 0,
      correct: 0, answered: 0, skills: {}, skillOrder: [],
      q: null, qStart: 0, locked: false, timers: [],
      sel: null, chosen: [], pending: null, done: {}, mistakes: 0
    };
    var d = dayInfo(n);
    root.innerHTML =
      '<div class="mr-wrap mr-game">' +
      '<div class="mr-topbar">' +
      '<button type="button" class="mr-x" data-act="quit" aria-label="Тоглоомоос гарах">✕</button>' +
      '<div class="mr-daychip">Өдөр ' + n + ' · ' + esc(d.short) + '</div>' +
      '<div class="mr-qcount" id="mrQ" aria-live="off"></div></div>' +
      '<div class="mr-board">' +
      '<div class="mr-scores"><div class="mr-sc">Миний морь 🐎 <b id="mrMe">0</b></div>' +
      '<div class="mr-sc is-rv"><b id="mrRv">0</b> Уралдааны морь 🐎</div></div>' +
      '<div class="mr-track" id="mrTrack" role="img" aria-label="Миний морь 0 алхам, Уралдааны морь 0 алхам">' +
      '<div class="mr-lane is-me" id="mrLaneMe"><span class="mr-horse" id="mrHorseMe"><span>🐎</span></span></div>' +
      '<div class="mr-lane is-rv"><span class="mr-horse" id="mrHorseRv"><span>🐎</span></span></div>' +
      '<div class="mr-goal" aria-hidden="true">🏁<small>Бариа</small></div></div></div>' +
      '<div class="mr-card mr-q" id="mrCard"></div>' +
      '<div class="mr-fb" id="mrFb" role="status" aria-live="polite"></div>' +
      '<div class="mr-actions"><button type="button" class="mr-btn" id="mrGo" data-act="submit" disabled>ХАРИУЛАХ</button></div>' +
      '</div>';
    updateBoard(false);
    nextQuestion();
  }

  function updateBoard(animate) {
    var F = C.trackSteps;
    var me = document.getElementById('mrHorseMe'), rv = document.getElementById('mrHorseRv');
    if (!me) return;
    me.style.setProperty('--p', Math.min(1, G.me / F));
    rv.style.setProperty('--p', Math.min(1, G.rv / F));
    document.getElementById('mrMe').textContent = G.me;
    document.getElementById('mrRv').textContent = G.rv;
    document.getElementById('mrQ').textContent = Math.min(G.answered + 1, G.total) + '/' + G.total;
    document.getElementById('mrTrack').setAttribute('aria-label',
      'Миний морь ' + G.me + ' алхам, Уралдааны морь ' + G.rv + ' алхам. Бариа ' + F + ' алхам.');
    if (animate && !reduceMotion()) {
      me.classList.remove('is-run'); void me.offsetWidth; me.classList.add('is-run');
    }
  }

  function nextQuestion() {
    clearTimers();
    G.q = E.next(G.ctx);
    G.locked = false; G.sel = null; G.chosen = []; G.pending = null; G.done = {}; G.mistakes = 0;
    G.qStart = Date.now();
    var q = G.q, body = '';

    if (q.mode === 'choice') {
      body = '<div class="mr-opts">' + q.options.map(function (o, i) {
        return '<button type="button" class="mr-opt is-' + o.kind + '" data-act="select" data-i="' + i + '" aria-pressed="false">' +
          '<span class="mr-badge" aria-hidden="true">' + BADGES[i] + '</span>' + optHTML(o) + '</button>';
      }).join('') + '</div>';
    } else if (q.mode === 'match') {
      var right = E.shuffle(q.pairs.map(function (p, i) { return i; }));
      body = '<div class="mr-match"><div class="mr-mcol">' + q.pairs.map(function (p, i) {
        return '<button type="button" class="mr-m is-' + p.left.kind + '" data-act="mleft" data-i="' + i + '">' + optHTML(p.left) + '</button>';
      }).join('') + '</div><div class="mr-mcol">' + right.map(function (i) {
        return '<button type="button" class="mr-m is-' + q.pairs[i].right.kind + '" data-act="mright" data-i="' + i + '">' + optHTML(q.pairs[i].right) + '</button>';
      }).join('') + '</div></div>';
    } else if (q.mode === 'build') {
      body = '<div class="mr-slots" id="mrSlots"></div><div class="mr-tiles" id="mrTiles">' + q.tiles.map(function (t, i) {
        return '<button type="button" class="mr-tile" data-act="tile" data-i="' + i + '">' + esc(t.ch) + '</button>';
      }).join('') + '</div>';
    }

    document.getElementById('mrCard').innerHTML =
      '<p class="mr-prompt">' + esc(q.prompt) + '</p>' +
      '<div class="mr-view">' + viewHTML(q.view) + '</div>' + body;
    document.getElementById('mrFb').innerHTML = '';
    document.getElementById('mrFb').className = 'mr-fb';
    var go = document.getElementById('mrGo');
    go.textContent = q.mode === 'match' ? 'Холбоно уу' : 'ХАРИУЛАХ';
    go.disabled = true; go.dataset.act = 'submit';
    if (q.mode === 'build') renderSlots();
    updateBoard(false);
    if (q.view.kind === 'audio') setTimeout(function () { playAudio(); }, 250);
  }

  /* ── Сонсох ── */
  function playAudio() {
    var v = G && G.q && G.q.view; if (!v || v.kind !== 'audio') return;
    try {
      if (v.audio) { new Audio(v.audio).play(); return; }
      var u = new SpeechSynthesisUtterance(v.word);
      var voice = global.speechSynthesis.getVoices().filter(function (x) { return /^mn/i.test(x.lang); })[0];
      if (voice) u.voice = voice;
      u.lang = 'mn-MN'; u.rate = 0.8;
      global.speechSynthesis.cancel(); global.speechSynthesis.speak(u);
    } catch (e) {}
  }

  /* ── Сонголт ── */
  function selectOption(i) {
    if (G.locked || G.q.mode !== 'choice') return;
    G.sel = i;
    var btns = root.querySelectorAll('.mr-opt');
    for (var k = 0; k < btns.length; k++) {
      var on = k === i;
      btns[k].classList.toggle('is-selected', on);
      btns[k].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    document.getElementById('mrGo').disabled = false;
  }

  /* ── Холбох ── */
  function matchTap(side, i) {
    if (G.locked || G.q.mode !== 'match') return;
    if (G.done[i] && G.done[i] === true) return;
    var sel = '[data-act="' + (side === 'l' ? 'mleft' : 'mright') + '"][data-i="' + i + '"]';
    var el = root.querySelector(sel);
    if (G.pending && G.pending.side !== side) {
      var a = G.pending, other = root.querySelector('[data-act="' + (a.side === 'l' ? 'mleft' : 'mright') + '"][data-i="' + a.i + '"]');
      if (a.i === i) {
        G.done[i] = true;
        [el, other].forEach(function (b) { b.classList.remove('is-pending'); b.classList.add('is-done'); b.disabled = true; });
        G.pending = null;
        if (Object.keys(G.done).length === G.q.pairs.length) grade(G.mistakes === 0);
      } else {
        G.mistakes++;
        other.classList.remove('is-pending');
        el.classList.add('is-miss'); other.classList.add('is-miss');
        setTimeout(function () { el.classList.remove('is-miss'); other.classList.remove('is-miss'); }, 450);
        G.pending = null;
      }
    } else {
      if (G.pending) {
        var prev = root.querySelector('[data-act="' + (G.pending.side === 'l' ? 'mleft' : 'mright') + '"][data-i="' + G.pending.i + '"]');
        if (prev) prev.classList.remove('is-pending');
      }
      G.pending = { side: side, i: i };
      el.classList.add('is-pending');
    }
  }

  /* ── Угсрах ── */
  function renderSlots() {
    var q = G.q, box = document.getElementById('mrSlots');
    box.innerHTML = q.target.map(function (_, k) {
      var idx = G.chosen[k];
      return idx === undefined
        ? '<span class="mr-slot" aria-hidden="true"></span>'
        : '<button type="button" class="mr-slot is-full" data-act="slot" data-k="' + k + '" aria-label="Устгах">' + esc(q.tiles[idx].ch) + '</button>';
    }).join('');
    var tiles = root.querySelectorAll('.mr-tile');
    for (var t = 0; t < tiles.length; t++) tiles[t].disabled = G.chosen.indexOf(t) !== -1;
    document.getElementById('mrGo').disabled = G.chosen.length !== q.target.length;
  }
  function tileTap(i) {
    if (G.locked || G.q.mode !== 'build') return;
    if (G.chosen.indexOf(i) !== -1 || G.chosen.length >= G.q.target.length) return;
    G.chosen.push(i); renderSlots();
  }
  function slotTap(k) {
    if (G.locked) return;
    G.chosen.splice(k, 1); renderSlots();
  }

  /* ── ХАРИУЛАХ ── */
  function submit() {
    if (!G || G.locked) return;
    var q = G.q, ok = false;
    if (q.mode === 'choice') {
      if (G.sel === null) return;
      ok = q.options[G.sel].id === q.answer;
      var btns = root.querySelectorAll('.mr-opt');
      btns.forEach(function (b, k) {
        b.disabled = true;
        if (q.options[k].id === q.answer) b.classList.add('is-correct');
        else if (k === G.sel) b.classList.add('is-wrong');
        else b.classList.add('is-dim');
      });
    } else if (q.mode === 'build') {
      var joiner = q.joiner || '';
      var got = G.chosen.map(function (i) { return q.tiles[i].ch; }).join(joiner);
      ok = got === q.target.join(joiner);
      root.querySelectorAll('.mr-tile, .mr-slot').forEach(function (b) { b.disabled = true; });
      root.querySelectorAll('.mr-slot.is-full').forEach(function (b) { b.classList.add(ok ? 'is-correct' : 'is-wrong'); });
    } else { return; }
    grade(ok);
  }

  /* ── Дүгнэх: алхам, оноо, сэтгэл дэмжих үг ── */
  function grade(ok) {
    if (G.locked) return;
    G.locked = true;
    var q = G.q;
    var secs = (Date.now() - G.qStart) / 1000;
    var fast = ok && secs <= (q.long ? C.fastSecondsLong : C.fastSeconds);
    G.answered++;
    if (!G.skills[q.skill]) { G.skills[q.skill] = 0; G.skillOrder.push(q.skill); }
    G.skills[q.skill]++;

    var steps = 0, bonus = 0;
    if (ok) {
      G.correct++; G.streak++;
      if (G.streak > G.bestStreak) G.bestStreak = G.streak;
      steps = fast ? C.stepFast : C.stepCorrect;
      if (C.streakBonusEvery && G.streak % C.streakBonusEvery === 0) { bonus = 1; steps += 1; }
      G.score += C.pointsCorrect + (fast ? C.pointsFast : 0) + Math.min(G.streak, C.streakCap) * C.pointsStreak;
      G.me = Math.min(C.trackSteps, G.me + steps);
    } else {
      G.streak = 0;
    }
    G.rv = Math.min(C.rivalMaxSteps, G.rv + pick(C.rivalSteps));
    updateBoard(ok);
    if (ok) popText('+' + steps);

    var fb = document.getElementById('mrFb');
    if (ok) {
      var near = G.me >= C.trackSteps - 8 && G.me < C.trackSteps;
      var cheer = near ? pick(NS.CHEERS_NEAR_FINISH) : pick(NS.CHEERS);
      fb.className = 'mr-fb is-good';
      fb.innerHTML = '<strong>' + esc(cheer) + '</strong><span>+' + steps + ' алхам' + (fast ? ' · ⚡ Хурдан!' : '') +
        (bonus ? ' · 🔥 ' + C.streakBonusEvery + ' дараалсан зөв!' : '') + '</span>';
    } else {
      fb.className = 'mr-fb is-try';
      fb.innerHTML = '<strong>Дахин нэг хараад үзье!</strong><span>Зөв хариулт: <b>' + esc(q.correctText) + '</b></span>' +
        (q.note ? '<em>' + esc(q.note) + '</em>' : '');
    }

    var go = document.getElementById('mrGo');
    var last = G.answered >= G.total || G.me >= C.trackSteps;
    go.textContent = last ? 'ДҮН ХАРАХ' : 'ДАРААХ';
    go.disabled = false; go.dataset.act = 'next';
    if (G.me >= C.trackSteps) {
      G.timers.push(setTimeout(function () { finish(); }, 1100));
    } else if (ok) {
      G.timers.push(setTimeout(function () { if (G && G.locked && G.q === q) goNext(); }, 1500));
    }
  }

  function popText(t) {
    if (reduceMotion()) return;
    var lane = document.getElementById('mrLaneMe'), horse = document.getElementById('mrHorseMe');
    if (!lane || !horse) return;
    var span = document.createElement('span');
    span.className = 'mr-pop'; span.textContent = t;
    span.style.setProperty('--p', Math.min(1, G.me / C.trackSteps));
    lane.appendChild(span);
    setTimeout(function () { if (span.parentNode) span.parentNode.removeChild(span); }, 950);
  }

  function goNext() {
    if (!G) return;
    clearTimers();
    if (G.answered >= G.total || G.me >= C.trackSteps) { finish(); return; }
    nextQuestion();
  }

  function clearTimers() {
    if (G && G.timers) { G.timers.forEach(clearTimeout); G.timers = []; }
  }

  /* ══════════════ 3) ӨНӨӨДРИЙН АХИЦ ══════════════ */
  function finish() {
    if (!G || G.finished) return;
    G.finished = true; clearTimers();
    var won = G.me >= C.trackSteps;
    var acc = G.answered ? G.correct / G.answered : 0;
    var passed = acc >= C.passAccuracy && G.answered >= Math.min(10, G.total);
    var day = G.dayNo;
    var res = { score: G.score, accuracy: acc, correct: G.correct, answered: G.answered,
                steps: G.me, rival: G.rv, bestStreak: G.bestStreak, won: won, passed: passed };
    NS.saveSession(day, res);
    if (passed) Access.markCompleted(day);
    renderResult(day, res, G.skillOrder.slice());
    G = null;
  }

  function renderResult(day, r, skills) {
    var st = Store.load();
    var title, lead;
    if (r.won) { title = '🏆 Баяр хүргэе! Чи барианд орлоо!'; lead = C.trackSteps + ' алхмыг түрүүлж туулсан чинь гайхалтай!'; }
    else if (r.steps > r.rival) { title = '🎉 Сайн уралдлаа!'; lead = 'Чиний морь Уралдааны морийг ' + (r.steps - r.rival) + ' алхмаар түрүүллээ.'; }
    else { title = '🐎 Сайн уралдлаа!'; lead = 'Уралдааны морь арай түрүүлэв. Маргааш чи илүү хурдан болно!'; }

    var note;
    if (r.passed) {
      var nxt = day < C.totalDays ? day + 1 : null;
      var ns = nxt ? Access.status(nxt, st) : null;
      if (!nxt) note = '<div class="mr-note is-good">🎓 ' + C.totalDays + ' өдрийн замыг дууслаа. Баяр хүргэе!</div>';
      else if (ns === 'today') note = '<div class="mr-note is-good">✅ Өдөр ' + day + ' дууслаа. Дараагийн өдөр нээгдлээ: <b>Өдөр ' + nxt + ' — ' + esc(dayInfo(nxt).title) + '</b></div>';
      else if (ns === 'open') note = '<div class="mr-note is-good">✅ Өдөр ' + day + ' дууслаа. Өдөр ' + nxt + ' нээлттэй байна.</div>';
      else note = '<div class="mr-note is-good">✅ Өдөр ' + day + ' дууслаа. Өдөр ' + nxt + ' — ' + NS.STATUS.tomorrow.text + ' ⏳</div>';
    } else {
      note = '<div class="mr-note">Дахин нэг оролдоод үзье! Зөв хариултын хувь ' + Math.round(C.passAccuracy * 100) + '-аас дээш болбол өдөр дуусна.</div>';
    }

    root.innerHTML =
      '<div class="mr-wrap mr-result">' +
      '<div class="mr-confetti" id="mrConfetti" aria-hidden="true"></div>' +
      '<div class="mr-card mr-res">' +
      '<div class="mr-band" aria-hidden="true"></div>' +
      '<h3 class="mr-res-title">' + title + '</h3><p class="mr-res-lead">' + lead + '</p>' +
      '<div class="mr-res-h">Өнөөдрийн ахиц</div>' +
      '<dl class="mr-stats">' +
      '<div><dt>🎯 Зөв</dt><dd>' + r.correct + '/' + r.answered + ' <small>(' + Math.round(r.accuracy * 100) + '%)</small></dd></div>' +
      '<div><dt>🏆 Оноо</dt><dd>' + r.score + '</dd></div>' +
      '<div><dt>🐎 Морь</dt><dd>' + r.steps + ' алхам</dd></div>' +
      '<div><dt>🔥 Дараалсан зөв</dt><dd>' + r.bestStreak + '</dd></div>' +
      '<div class="is-wide"><dt>Ахиц</dt><dd class="mr-stars" aria-label="Ахиц">' + starString(r.accuracy) + '</dd></div></dl>' +
      '<div class="mr-res-h">📚 Өнөөдөр давтсан чадвар</div>' +
      '<ul class="mr-skills">' + skills.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>' +
      note +
      '<p class="mr-see">Маргааш дахин уулзъя!</p>' +
      '<div class="mr-res-actions"><button type="button" class="mr-btn is-ghost" data-act="again" data-day="' + day + '">🔄 Дахин тоглох</button>' +
      '<button type="button" class="mr-btn" data-act="home">Өдрийн зам</button></div></div></div>';
    if (r.won) confetti();
  }

  function confetti() {
    if (reduceMotion()) return;
    var box = document.getElementById('mrConfetti'); if (!box) return;
    var colors = ['#b8763f', '#5b7a99', '#4d8b73', '#d9a441', '#b3564f'], html = '';
    for (var i = 0; i < 18; i++) {
      html += '<i style="left:' + Math.round(Math.random() * 100) + '%;background:' + colors[i % colors.length] +
        ';animation-delay:' + (Math.random() * 0.6).toFixed(2) + 's"></i>';
    }
    box.innerHTML = html;
    setTimeout(function () { if (box) box.innerHTML = ''; }, 2600);
  }

  /* ══════════════ Үйлдлүүдийг барих ══════════════ */
  function onClick(e) {
    var el = e.target.closest('[data-act]');
    if (!el || !root.contains(el)) return;
    var act = el.getAttribute('data-act'), i = parseInt(el.getAttribute('data-i'), 10), day = parseInt(el.getAttribute('data-day'), 10);
    switch (act) {
      case 'intro': showIntro(day); break;
      case 'start': startGame(day); break;
      case 'again': startGame(day); break;
      case 'home': showHome(); break;
      case 'locked':
        toast(NS.STATUS[el.getAttribute('data-status')].text + (el.getAttribute('data-status') === 'locked' ? ' — өмнөх өдрийг дуусгаарай.' : '.'), 'error'); break;
      case 'select': selectOption(i); break;
      case 'submit': submit(); break;
      case 'next': goNext(); break;
      case 'mleft': matchTap('l', i); break;
      case 'mright': matchTap('r', i); break;
      case 'tile': tileTap(i); break;
      case 'slot': slotTap(parseInt(el.getAttribute('data-k'), 10)); break;
      case 'play': playAudio(); break;
      case 'quit':
        if (global.confirm('Тоглоомоос гарах уу? Одоогийн уралдааны явц хадгалагдахгүй.')) showHome();
        break;
    }
  }

  function onKey(e) {
    var sec = document.getElementById('horseSection');
    if (!G || !sec || !sec.classList.contains('active')) return;
    var t = e.target && e.target.tagName;
    if (t === 'INPUT' || t === 'TEXTAREA') return;
    if (e.key >= '1' && e.key <= '4' && G.q && G.q.mode === 'choice') {
      var i = parseInt(e.key, 10) - 1;
      if (i < G.q.options.length) selectOption(i);
    } else if (e.key === 'Enter') {
      var go = document.getElementById('mrGo');
      if (go && !go.disabled && e.target !== go) { e.preventDefault(); go.click(); }
    }
  }

  /* ══════════════ Эхлүүлэх ══════════════ */
  function mount() {
    root = document.getElementById('moriApp');
    if (!root) return;
    if (/[?&]mori=all\b/.test(global.location.search)) C.unlockMode = 'all'; // багшийн туршилтын горим
    root.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    showHome();
  }

  NS.onShow = function () {
    if (!root) mount();
    else if (!G) showHome();
  };
  NS.resetProgress = function () { Store.reset(); if (root) showHome(); };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})(window);
