/* ═══════════════════════════════════════════════════════════
   HANGMAN — neon gallows word game
   3 difficulties · 10 themed categories · endless levels
   DOM word/keypad + canvas gallows (theme-matched, mobile first)
   ═══════════════════════════════════════════════════════════ */
registerGame({
  id: 'hangman',
  title: 'Hangman',
  genre: 'Word',
  emoji: '🔤',
  colors: ['#7c5cff', '#00f0ff'],
  description: 'Guess the word one letter at a time — six mistakes and the rope does its thing. Three difficulties, ten themed categories and endless levels.',
  controls: [
    { key: 'A – Z', label: 'Guess a letter' },
    { key: 'MOUSE / TAP', label: 'Use the keypad' },
    { key: 'ENTER', label: 'Skip the level-clear splash' },
  ],
  featured: true,

  create(ctx) {
    'use strict';

    /* ── word bank: category → difficulty tier ─────────── */
    const BANK = {
      ANIMALS: {
        easy:   ['ZEBRA', 'KOALA', 'PANDA', 'LLAMA', 'OTTER', 'CRAB', 'WOLF', 'GECKO', 'SLOTH', 'HIPPO'],
        normal: ['GIRAFFE', 'PENGUIN', 'DOLPHIN', 'JAGUAR', 'BUFFALO', 'OSTRICH', 'LEOPARD', 'PANTHER', 'RABBIT', 'TURTLE'],
        hard:   ['CHAMELEON', 'RHINOCEROS', 'FLAMINGO', 'ARMADILLO', 'KANGAROO', 'HEDGEHOG', 'SQUIRREL', 'REINDEER'],
      },
      FRUIT: {
        easy:   ['APPLE', 'MANGO', 'PEACH', 'GRAPE', 'LEMON', 'BERRY', 'MELON', 'PLUM', 'PEAR', 'KIWI'],
        normal: ['ORANGE', 'BANANA', 'CHERRY', 'PAPAYA', 'APRICOT', 'COCONUT', 'OLIVES', 'PLANTAIN', 'JUNIPER', 'MANGOES'],
        hard:   ['PINEAPPLE', 'WATERMELON', 'STRAWBERRY', 'BLACKBERRY', 'RASPBERRY', 'CRANBERRY', 'BLUEBERRY', 'GRAPEFRUIT'],
      },
      COUNTRY: {
        easy:   ['CHILE', 'BRAZIL', 'EGYPT', 'JAPAN', 'PERU', 'CHINA', 'SPAIN', 'ITALY', 'CUBA', 'OMAN'],
        normal: ['CANADA', 'GERMANY', 'FRANCE', 'MEXICO', 'NORWAY', 'SWEDEN', 'POLAND', 'TURKEY', 'VIETNAM', 'GREECE'],
        hard:   ['AUSTRALIA', 'ARGENTINA', 'SWITZERLAND', 'INDONESIA', 'MADAGASCAR', 'VENEZUELA', 'THAILAND', 'COLOMBIA'],
      },
      SPACE: {
        easy:   ['MOON', 'STAR', 'MARS', 'ORBIT', 'COMET', 'NOVA', 'PLUTO', 'EARTH', 'LUNAR', 'ROVER'],
        normal: ['ROCKET', 'GALAXY', 'NEPTUNE', 'JUPITER', 'SATURN', 'METEOR', 'ECLIPSE', 'QUASAR', 'PULSAR', 'ASTERISK'],
        hard:   ['TELESCOPE', 'ASTEROID', 'SATELLITE', 'SUPERNOVA', 'ANDROMEDA', 'OBSERVATORY', 'HELIOSPHERE', 'GALAXIES'],
      },
      FOOD: {
        easy:   ['RICE', 'CAKE', 'PIZZA', 'SALAD', 'SOUP', 'TOFU', 'BREAD', 'PASTA', 'SUSHI', 'STEW'],
        normal: ['NOODLE', 'CHEESE', 'SANDWICH', 'OMELETTE', 'PANCAKE', 'LASAGNA', 'BURRITO', 'COOKIE', 'WAFFLE', 'PRETZEL'],
        hard:   ['SPAGHETTI', 'STROGANOFF', 'ESPRESSO', 'CROISSANT', 'MUSHROOMS', 'SAUERKRAUT', 'TIRAMISU', 'LINGUINE'],
      },
      SPORTS: {
        easy:   ['GOLF', 'POLO', 'BALL', 'RACE', 'SWIM', 'JUMP', 'GOAL', 'PUCK', 'SURF', 'DIVE'],
        normal: ['SOCCER', 'TENNIS', 'HOCKEY', 'BOXING', 'CRICKET', 'KARATE', 'CYCLING', 'MARATHON', 'FENCING', 'ARCHERY'],
        hard:   ['BASKETBALL', 'FOOTBALL', 'GYMNASTICS', 'SWIMMING', 'BADMINTON', 'SNOWBOARD', 'WRESTLING', 'HANDBALL'],
      },
      MUSIC: {
        easy:   ['SONG', 'BASS', 'JAZZ', 'BEAT', 'RIFF', 'DRUM', 'PIANO', 'CHORD', 'FLUTE', 'VIOLA'],
        normal: ['VIOLIN', 'TRUMPET', 'MELODY', 'RHYTHM', 'HARMONY', 'CHORUS', 'LYRICS', 'DYNAMICS', 'SONATA', 'TROMBONE'],
        hard:   ['SAXOPHONE', 'SYMPHONY', 'ACCORDION', 'BARITONE', 'CRESCENDO', 'ARPEGGIO', 'CAPPELLA', 'XYLOPHONE'],
      },
      TECH: {
        easy:   ['CODE', 'DATA', 'MOUSE', 'CHIP', 'WIRE', 'PIXEL', 'CACHE', 'ARRAY', 'BINARY', 'SCREEN'],
        normal: ['LAPTOP', 'SERVER', 'KEYBOARD', 'FIREWALL', 'ROUTER', 'MEMORY', 'TABLET', 'MONITOR', 'PROGRAM', 'BROWSER'],
        hard:   ['COMPUTER', 'INTERNET', 'BLUETOOTH', 'ALGORITHM', 'PROCESSOR', 'SOFTWARE', 'DATABASE', 'MOTHERBOARD'],
      },
      NATURE: {
        easy:   ['LEAF', 'TREE', 'LAKE', 'RIVER', 'ROCK', 'MOSS', 'SEED', 'FERN', 'VINE', 'CAVE'],
        normal: ['FOREST', 'ISLAND', 'DESERT', 'VALLEY', 'CANYON', 'JUNGLE', 'GLACIER', 'VOLCANO', 'MEADOW', 'SUMMIT'],
        hard:   ['WATERFALL', 'HURRICANE', 'ECOSYSTEM', 'BLIZZARD', 'MOUNTAINS', 'RAINFOREST', 'WILDFLOWER', 'SNOWSTORM'],
      },
      MOVIES: {
        easy:   ['EPIC', 'DRAMA', 'SCENE', 'CAMEO', 'SCRIPT', 'ACTOR', 'REEL', 'HORROR', 'GENRE', 'FILM'],
        normal: ['COMEDY', 'THRILLER', 'MUSICAL', 'SEQUEL', 'REMAKE', 'CASTING', 'PREQUEL', 'TRAILER', 'CINEMA', 'ACTRESS'],
        hard:   ['BLOCKBUSTER', 'DOCUMENTARY', 'SCREENPLAY', 'ANIMATION', 'DIRECTOR', 'STORYBOARD', 'PRODUCER', 'CINEMATIC'],
      },
    };

    const CATS = [
      { id: 'ANIMALS', e: '🐾' }, { id: 'FRUIT', e: '🍎' }, { id: 'COUNTRY', e: '🗺️' },
      { id: 'SPACE', e: '🚀' }, { id: 'FOOD', e: '🍜' }, { id: 'SPORTS', e: '⚽' },
      { id: 'MUSIC', e: '🎵' }, { id: 'TECH', e: '💾' }, { id: 'NATURE', e: '🌿' },
      { id: 'MOVIES', e: '🎬' },
    ];

    const TIERS = ['easy', 'normal', 'hard'];
    const DIFFS = {
      easy:   { label: 'EASY',   tag: '4–6 letter words · 1 free letter every round', start: 0, free: 1 },
      normal: { label: 'NORMAL', tag: '6–8 letter words · classic rules',              start: 1, free: 0 },
      hard:   { label: 'HARD',   tag: '8–11 letter words · no free letters',           start: 2, free: 0 },
    };
    const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    const LIVES_MAX = 6;

    /* ── state ─────────────────────────────────────────── */
    const state = {
      phase: 'menu',          // menu | play | clear | reveal | over
      difficulty: null,
      level: 1,
      lives: LIVES_MAX,
      wrong: 0,
      word: '',
      category: null,
      tierIdx: 0,
      guessed: {},            // { LETTER: true }
      revealed: [],
      score: 0,
    };

    let paused = false;
    let clock = 0;            // frame clock in ms (freezes while paused)
    const timers = [];        // frame-driven timeouts: { due, fn }
    const partT = [];         // ms stamp when body part i appeared
    const decks = {};         // "CAT|tier" → draw pile

    function blocked() { return paused || !!ctx.paused; }
    function sfx(name) { try { if (ctx.sfx) ctx.sfx(name); } catch (e) { /* audio off */ } }
    function addScore(n) { state.score += n; try { ctx.setScore(state.score); } catch (e) { /* shell gone */ } }
    function after(ms, fn) { timers.push({ due: clock + ms, fn: fn }); }
    function clearTimers() { timers.length = 0; }
    function tickTimers() {
      for (let i = timers.length - 1; i >= 0; i--) {
        if (clock >= timers[i].due) { const t = timers.splice(i, 1)[0]; t.fn(); }
      }
    }
    function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
    function clearNode(node) { while (node.firstChild) node.removeChild(node.firstChild); }
    function el(tag, cls, txt) {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (txt != null) e.textContent = txt;
      return e;
    }

    /* ── persistence: best level cleared per difficulty ── */
    function bests() {
      const base = { easy: 0, normal: 0, hard: 0 };
      try {
        if (typeof Store !== 'undefined' && Store.settings && Store.settings.hangman) {
          const h = Store.settings.hangman;
          base.easy = h.easy | 0; base.normal = h.normal | 0; base.hard = h.hard | 0;
        }
      } catch (e) { /* private mode */ }
      return base;
    }
    function saveBest(d, lv) {
      if (!d) return;
      const b = bests();
      if (lv > (b[d] || 0)) {
        b[d] = lv;
        try { if (typeof Store !== 'undefined') Store.set('hangman', b); } catch (e) { /* ignore */ }
        try { if (ctx.toast) ctx.toast('New best: level ' + lv + ' on ' + DIFFS[d].label + '!', 'win'); } catch (e) { /* ignore */ }
        bestB.textContent = 'LV ' + lv;
      }
    }

    /* ══ DOM ═══════════════════════════════════════════ */
    const host = ctx.container;
    host.classList.add('grhm-host');

    /* HUD row */
    const hud = el('div', 'grhm-hud');
    function hudCell(label) {
      const c = el('div', 'grhm-cell');
      c.appendChild(el('span', null, label));
      const b = el('b');
      c.appendChild(b);
      hud.appendChild(c);
      return b;
    }
    const levelB = hudCell('LEVEL');
    const catB = hudCell('CATEGORY');
    const bestB = hudCell('BEST');
    const livesC = el('div', 'grhm-cell grhm-cell--lives');
    livesC.appendChild(el('span', null, 'LIVES'));
    const pipsEl = el('div', 'grhm-pips');
    const pips = [];
    for (let i = 0; i < LIVES_MAX; i++) { const p = el('i', 'grhm-pip'); pipsEl.appendChild(p); pips.push(p); }
    livesC.appendChild(pipsEl);
    hud.appendChild(livesC);

    /* main: canvas art + side panel */
    const main = el('div', 'grhm-main');
    const art = el('div', 'grhm-art');
    const cv = el('canvas', 'grhm-canvas');
    art.appendChild(cv);
    const flash = el('div', 'grhm-flash');
    const flashT = el('div', 'grhm-flash__t');
    const flashS = el('div', 'grhm-flash__s');
    flash.appendChild(flashT); flash.appendChild(flashS);
    flash.style.display = 'none';
    art.appendChild(flash);
    main.appendChild(art);

    const side = el('div', 'grhm-side');
    const wordEl = el('div', 'grhm-word');
    const msgEl = el('div', 'grhm-msg', 'PICK A DIFFICULTY');
    const keysEl = el('div', 'grhm-keys');
    side.appendChild(wordEl); side.appendChild(msgEl); side.appendChild(keysEl);
    main.appendChild(side);

    /* keypad */
    const keyEls = {};
    LETTERS.forEach(function (k) {
      const b = el('button', 'grhm-key', k);
      b.type = 'button';
      b.dataset.k = k;
      b.addEventListener('click', function () { guess(k); });
      keysEl.appendChild(b);
      keyEls[k] = b;
    });

    /* title / difficulty menu */
    const menu = el('div', 'grhm-menu');
    const menuIn = el('div', 'grhm-menu__in');
    menuIn.appendChild(el('div', 'grhm-logo', 'HANGMAN'));
    menuIn.appendChild(el('p', 'grhm-sub', 'Guess the word one letter at a time — clear words to climb the levels. Six mistakes and the rope does its thing.'));
    const diffs = el('div', 'grhm-diffs');
    const diffEls = {};
    Object.keys(DIFFS).forEach(function (k) {
      const b = el('button', 'grhm-diff');
      b.type = 'button';
      b.dataset.d = k;
      b.appendChild(el('b', null, DIFFS[k].label));
      b.appendChild(el('i', null, DIFFS[k].tag));
      const best = el('span', 'grhm-diff__best', 'NEW');
      b.appendChild(best);
      b.addEventListener('click', function () { pickDiff(k); });
      diffs.appendChild(b);
      diffEls[k] = best;
    });
    menuIn.appendChild(diffs);
    menuIn.appendChild(el('div', 'grhm-menu__foot', 'TIP: vowels first — they open the board fast.'));
    menu.appendChild(menuIn);

    host.appendChild(hud);
    host.appendChild(main);
    host.appendChild(menu);

    function refreshMenuBests() {
      const b = bests();
      Object.keys(DIFFS).forEach(function (k) {
        diffEls[k].textContent = b[k] > 0 ? 'BEST · LV ' + b[k] : 'NEW';
      });
    }

    /* ══ canvas ════════════════════════════════════════ */
    const g = cv.getContext ? cv.getContext('2d') : null;
    const DW = 320, DH = 420;
    let dpr = 1, cssW = 0, cssH = 0;
    const stars = [];
    for (let i = 0; i < 30; i++) {
      stars.push({ x: Math.random(), y: Math.random() * 0.86, s: Math.random() * 1.5 + 0.7, a: Math.random() * 0.45 + 0.2 });
    }

    function measure() {
      const r = art.getBoundingClientRect ? art.getBoundingClientRect() : { width: 0, height: 0 };
      const w = Math.round(r.width || host.clientWidth || DW);
      const h = Math.round(r.height || host.clientHeight || DH);
      return { w: Math.max(2, w), h: Math.max(2, h) };
    }
    function fit() {
      const m = measure();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const bw = Math.round(m.w * dpr), bh = Math.round(m.h * dpr);
      if (cv.width !== bw) cv.width = bw;
      if (cv.height !== bh) cv.height = bh;
      cssW = m.w; cssH = m.h;
    }

    /* scene geometry (design space 320×420) */
    const GN = {                       // gallows + figure
      baseX1: 60, baseX2: 150, groundY: 386,
      poleX: 95, poleY1: 386, poleY2: 68,
      beamX1: 95, beamX2: 205, beamY: 68,
      braceX1: 95, braceY1: 112, braceX2: 137, braceY2: 68,
      ropeX: 205, ropeY1: 68, ropeY2: 94,
      hx: 205, hy: 118, hr: 24,
      neckY: 142, hipY: 244,
      shY: 166, handY: 210, armLx: 163, armRx: 247,
      footY: 314, legLx: 175, legRx: 235,
    };

    function neonLine(x1, y1, x2, y2, color, w, blur) {
      g.save();
      g.strokeStyle = color; g.lineWidth = w; g.lineCap = 'round';
      g.shadowColor = color; g.shadowBlur = blur;
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      g.restore();
    }
    function seg(x1, y1, x2, y2, p, color, w, blur) {   // partial stroke (grow-in)
      const xe = x1 + (x2 - x1) * p, ye = y1 + (y2 - y1) * p;
      neonLine(x1, y1, xe, ye, color, w, blur);
    }

    function paint(t) {   // t = clock ms
      /* backdrop stars */
      g.save();
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        g.globalAlpha = s.a;
        g.fillStyle = '#9fd8ff';
        g.fillRect(s.x * DW, s.y * DH, s.s, s.s);
      }
      g.restore();

      /* ground */
      neonLine(14, GN.groundY, 306, GN.groundY, '#ff2ecd', 3, 14);
      g.save();
      g.strokeStyle = 'rgba(124,92,255,0.75)'; g.lineWidth = 3;
      for (let i = 0; i < 8; i++) {
        const x = 20 + i * 38;
        g.beginPath(); g.moveTo(x, 402); g.lineTo(x + 22, 402); g.stroke();
      }
      g.restore();

      /* gallows */
      neonLine(GN.baseX1, GN.groundY, GN.baseX2, GN.groundY, '#7c5cff', 5, 12);
      neonLine(GN.poleX, GN.poleY1, GN.poleX, GN.poleY2, '#7c5cff', 5, 12);
      neonLine(GN.beamX1, GN.beamY, GN.beamX2, GN.beamY, '#7c5cff', 5, 12);
      neonLine(GN.braceX1, GN.braceY1, GN.braceX2, GN.braceY2, '#7c5cff', 4, 10);

      /* figure group — sways from the beam */
      const dead = state.wrong >= LIVES_MAX;
      const col = (state.phase === 'reveal' || state.phase === 'over') ? '#ff2e6d' : (dead ? '#ff2e6d' : '#00f0ff');
      const amp = 0.012 + state.wrong * 0.005;
      g.save();
      g.translate(GN.beamX2, GN.beamY);
      g.rotate(Math.sin(t / 1000 * 1.5) * amp);
      g.translate(-GN.beamX2, -GN.beamY);

      neonLine(GN.ropeX, GN.ropeY1, GN.ropeX, GN.ropeY2, '#ffd23c', 3, 10);

      const parts = [pHead, pBody, pArmL, pArmR, pLegL, pLegR];
      for (let i = 0; i < state.wrong && i < parts.length; i++) {
        const p = clamp((t - (partT[i] || 0)) / 320, 0, 1);
        if (p <= 0) continue;
        parts[i](p, col);
      }
      if (state.wrong >= 1) drawFace(col, dead);
      g.restore();
    }

    function pHead(p, col) {
      g.save();
      g.strokeStyle = col; g.lineWidth = 4; g.lineCap = 'round';
      g.shadowColor = col; g.shadowBlur = 14;
      g.beginPath();
      g.arc(GN.hx, GN.hy, GN.hr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p);
      g.stroke();
      g.restore();
    }
    function pBody(p, col) { seg(GN.hx, GN.neckY, GN.hx, GN.hipY, p, col, 4, 14); }
    function pArmL(p, col) { seg(GN.hx, GN.shY, GN.armLx, GN.handY, p, col, 4, 14); }
    function pArmR(p, col) { seg(GN.hx, GN.shY, GN.armRx, GN.handY, p, col, 4, 14); }
    function pLegL(p, col) { seg(GN.hx, GN.hipY, GN.legLx, GN.footY, p, col, 4, 14); }
    function pLegR(p, col) { seg(GN.hx, GN.hipY, GN.legRx, GN.footY, p, col, 4, 14); }

    function drawFace(col, dead) {
      g.save();
      g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 3; g.lineCap = 'round';
      g.shadowColor = col; g.shadowBlur = 8;
      if (dead) {
        /* X eyes + frown */
        seg(192, 108, 200, 116, 1, col, 3, 8);
        seg(200, 108, 192, 116, 1, col, 3, 8);
        seg(210, 108, 218, 116, 1, col, 3, 8);
        seg(218, 108, 210, 116, 1, col, 3, 8);
        g.beginPath(); g.arc(GN.hx, 134, 9, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
      } else {
        g.beginPath(); g.arc(196, 112, 2.6, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.arc(214, 112, 2.6, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.moveTo(199, 132); g.lineTo(211, 132); g.stroke();
      }
      g.restore();
    }

    function draw(t) {
      if (!g) return;
      if (!cssW || !cssH) fit();
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, cssW, cssH);
      const S = Math.min(cssW / DW, cssH / DH);
      g.save();
      g.translate((cssW - DW * S) / 2, (cssH - DH * S) / 2);
      g.scale(S, S);
      paint(t);
      g.restore();
    }

    /* ══ word logic ════════════════════════════════════ */
    function bankFor(catId, tier) {
      const b = BANK[catId] && BANK[catId][tier];
      if (b && b.length) return b;
      for (let i = 0; i < CATS.length; i++) {
        const x = BANK[CATS[i].id] && BANK[CATS[i].id][tier];
        if (x && x.length) return x;
      }
      return ['HANGMAN'];
    }
    function shuffle(a) {
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = a[i]; a[i] = a[j]; a[j] = t;
      }
      return a;
    }
    function drawWord(catId, tier) {
      const key = catId + '|' + tier;
      const bank = bankFor(catId, tier);
      if (!decks[key] || !decks[key].length) decks[key] = shuffle(bank.slice());
      const deck = decks[key];
      let w = deck.pop();
      if (w === state.word && deck.length) {          // never twice in a row
        const alt = deck.shift();
        deck.push(w);
        w = alt;
      }
      return w;
    }

    let letterEls = [];
    function buildWord() {
      clearNode(wordEl);
      letterEls = [];
      for (let i = 0; i < state.word.length; i++) {
        const s = el('span', 'grhm-let is-empty');
        wordEl.appendChild(s);
        letterEls.push(s);
      }
    }
    function revealLetter(i, ch, miss) {
      const s = letterEls[i];
      if (!s) return;
      s.textContent = ch;
      s.className = 'grhm-let ' + (miss ? 'is-miss' : 'is-on');
    }
    function resetKeys() {
      LETTERS.forEach(function (k) {
        const b = keyEls[k];
        b.className = 'grhm-key';
        b.disabled = false;
      });
    }
    function resetPips() {
      for (let i = 0; i < pips.length; i++) pips[i].className = 'grhm-pip';
    }
    function updatePips() {
      for (let i = 0; i < pips.length; i++) pips[i].classList.toggle('is-off', i >= state.lives);
    }
    function updateHud() {
      levelB.textContent = String(state.level);
      catB.textContent = state.category ? state.category.e + ' ' + state.category.id : '—';
      const b = bests();
      const v = state.difficulty ? b[state.difficulty] : Math.max(b.easy, b.normal, b.hard);
      bestB.textContent = 'LV ' + v;
      updatePips();
    }

    /* ══ feedback ══════════════════════════════════════ */
    function showFlash(t, s) {
      flashT.textContent = t; flashS.textContent = s;
      flash.style.display = 'grid';
    }
    function hideFlash() { flash.style.display = 'none'; }
    function shake() {
      main.classList.add('is-shake');
      after(430, function () { main.classList.remove('is-shake'); });
    }

    /* ══ flow ══════════════════════════════════════════ */
    function showMenu() {
      state.phase = 'menu';
      clearTimers();
      hideFlash();
      menu.style.display = '';
      menu.classList.remove('is-out');
      refreshMenuBests();
      msgEl.textContent = 'PICK A DIFFICULTY';
    }

    function startLevel() {
      const n = state.level;
      const cat = CATS[(n - 1) % CATS.length];
      state.tierIdx = Math.min(TIERS.length - 1, DIFFS[state.difficulty].start + Math.floor((n - 1) / 3));
      state.category = cat;
      state.word = drawWord(cat.id, TIERS[state.tierIdx]);
      state.lives = LIVES_MAX;
      state.wrong = 0;
      partT.length = 0;
      state.guessed = {};
      state.revealed = [];
      for (let i = 0; i < state.word.length; i++) state.revealed.push(false);
      state.phase = 'play';

      buildWord();
      resetKeys();
      resetPips();
      hideFlash();
      msgEl.textContent = 'GUESS A LETTER';
      updateHud();
      sfx('start');

      /* EASY perk: one letter revealed up front */
      if (DIFFS[state.difficulty].free) {
        const distinct = state.word.split('').filter(function (c, i, a) { return a.indexOf(c) === i; });
        const ch = distinct[Math.floor(Math.random() * distinct.length)];
        guess(ch, true);
      }
    }

    function startRun() {
      state.level = 1;
      state.score = 0;
      ctx.setScore(0);
      startLevel();
    }

    function pickDiff(d) {
      if (blocked()) return;
      state.difficulty = d;
      sfx('coin');
      menu.classList.add('is-out');
      after(280, function () { menu.style.display = 'none'; });
      startRun();
    }

    function clearLevel() {
      state.phase = 'clear';
      const bonus = (120 + 50 * state.lives) * (state.tierIdx + 1);
      addScore(bonus);
      sfx('win');
      msgEl.textContent = 'LEVEL ' + state.level + ' CLEARED  +' + bonus;
      showFlash('LEVEL ' + state.level + ' CLEAR', '+' + bonus);
      saveBest(state.difficulty, state.level);
      updateHud();
      after(1500, function () { hideFlash(); state.level++; startLevel(); });
    }

    function skipClear() {
      if (state.phase !== 'clear') return;
      clearTimers();
      hideFlash();
      state.level++;
      startLevel();
    }

    function die() {
      state.phase = 'reveal';
      for (let i = 0; i < state.word.length; i++) {
        if (!state.revealed[i]) { state.revealed[i] = true; revealLetter(i, state.word[i], true); }
      }
      msgEl.textContent = 'OUT OF LIVES — THE WORD WAS ' + state.word;
      sfx('lose');
      after(1500, function () {
        state.phase = 'over';
        try {
          ctx.gameOver({
            title: 'HANGED!',
            message: 'You reached level ' + state.level + ' · the word was ' + state.word,
          });
        } catch (e) { /* shell gone */ }
      });
    }

    /* ══ guessing ══════════════════════════════════════ */
    function guess(ch, free) {
      if (blocked() || state.phase !== 'play') return false;
      if (!ch || state.guessed[ch]) return false;
      state.guessed[ch] = true;
      const key = keyEls[ch];
      let hits = 0;
      for (let i = 0; i < state.word.length; i++) {
        if (state.word[i] === ch) { state.revealed[i] = true; hits++; revealLetter(i, ch, false); }
      }
      if (hits) {
        if (key) { key.classList.add('is-hit'); key.disabled = true; }
        if (free) {
          sfx('tick');
          msgEl.textContent = 'FREE LETTER: ' + ch;
        } else {
          const pts = 15 * (state.tierIdx + 1);
          addScore(pts);
          sfx('coin');
          msgEl.textContent = (hits > 1 ? hits + ' × ' + ch : ch + '!') + '  +' + pts;
        }
        if (state.revealed.every(Boolean)) { clearLevel(); return true; }
      } else {
        if (key) { key.classList.add('is-miss'); key.disabled = true; }
        state.lives--;
        partT[state.wrong] = clock;
        state.wrong++;
        updatePips();
        shake();
        sfx('hit');
        msgEl.textContent = state.lives > 0
          ? 'NO ' + ch + ' — ' + state.lives + ' LEFT'
          : 'NO ' + ch + ' — NO LIVES LEFT';
        if (state.lives <= 0) die();
      }
      return true;
    }

    /* ══ input ═════════════════════════════════════════ */
    function onKey(e) {
      if (!e || !e.key) return;
      const k = String(e.key);
      if (/^[a-zA-Z]$/.test(k)) { guess(k.toUpperCase()); return; }
      if (k === 'Enter' && state.phase === 'clear') skipClear();
    }
    function onArtClick() { if (state.phase === 'clear') skipClear(); }
    window.addEventListener('keydown', onKey);
    art.addEventListener('click', onArtClick);

    /* ══ frame loop ════════════════════════════════════ */
    let raf = 0, last = 0, alive = true, fitDirty = true, lastFit = -1e9;
    function frame(ts) {
      if (!alive) return;
      const dt = last ? Math.min(80, ts - last) : 16;
      last = ts;
      if (!blocked()) {
        clock += dt;
        tickTimers();
        if (fitDirty || clock - lastFit > 400) { fit(); lastFit = clock; fitDirty = false; }
      }
      draw(clock);
      raf = requestAnimationFrame(frame);
    }

    /* ══ boot ══════════════════════════════════════════ */
    showMenu();
    updateHud();
    fit();
    raf = requestAnimationFrame(frame);

    /* ══ shell contract ════════════════════════════════ */
    return {
      pause() { paused = true; },
      resume() { paused = false; },
      restart() {
        clearTimers();
        hideFlash();
        state.score = 0;
        try { ctx.setScore(0); } catch (e) { /* shell gone */ }
        if (state.difficulty) startRun();
        else showMenu();
      },
      resize() { fitDirty = true; fit(); },
      destroy() {
        alive = false;
        cancelAnimationFrame(raf);
        clearTimers();
        window.removeEventListener('keydown', onKey);
        art.removeEventListener('click', onArtClick);
        clearNode(host);
        host.classList.remove('grhm-host');
      },
      getState() {
        return {
          phase: state.phase,
          difficulty: state.difficulty,
          level: state.level,
          category: state.category ? state.category.id : null,
          tier: TIERS[state.tierIdx],
          lives: state.lives,
          wrong: state.wrong,
          word: state.word,
          letters: state.word.length,
          revealed: state.revealed.filter(Boolean).length,
          pattern: state.word.split('').map(function (c, i) { return state.revealed[i] ? c : '.'; }).join(''),
          guessed: LETTERS.filter(function (k) { return state.guessed[k]; }),
          score: state.score,
          timers: timers.length,
        };
      },
    };
  },
});
