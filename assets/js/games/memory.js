/* ═══════════════════════════════════════════════════════
   MEMORY MATCH — 16 neon cards, 8 pairs, a 60-second clock
   Flip two, find the pair. Streaks pay more. Clear the deck
   before time runs out.
   ═══════════════════════════════════════════════════════ */
registerGame({
  id: 'memory',
  title: 'Memory Match',
  genre: 'Cards',
  emoji: '🃏',
  colors: ['#ff2ecd', '#ffd23c'],
  description: 'Flip neon cards two at a time and burn the deck into your brain — 8 pairs, streak bonuses and a 60-second clock that never stops.',
  featured: true,
  controls: [
    { key: 'TAP CARDS', label: 'Flip & match pairs' },
    { key: 'ARROWS + ENTER', label: 'Move and flip' },
    { key: 'SPACE', label: 'Start the run' },
  ],
  create(ctx) {
    'use strict';

    const host = ctx.container;
    host.classList.add('gmem-host');

    /* ── constants ─────────────────────────────────── */
    const FACES = ['👾', '🚀', '🎮', '🎲', '💎', '⚡', '🔮', '🐙'];
    const COLS = 4, TOTAL = 16, PAIRS = 8;
    const START_T = 60;
    const MISMATCH_DELAY = 0.75;
    const setCls = (el, c, on) => { if (on) el.classList.add(c); else el.classList.remove(c); };

    /* ── state ─────────────────────────────────────── */
    let phase = 'menu';                 // menu | play | over
    let paused = false, alive = true, overCalled = false;
    let cards = [];                     // { face, matched, flipped }
    let flipped = [];                   // pending pair indices
    let locked = false, lockT = 0;
    let moves = 0, matches = 0, score = 0, streak = 0;
    let timeLeft = START_T;
    let cursorIdx = 0;
    let W = ctx.width || host.clientWidth || 900;
    let H = ctx.height || host.clientHeight || 640;

    /* ── DOM ───────────────────────────────────────── */
    const menu = document.createElement('div');
    menu.className = 'gmem-menu';
    const menuIn = document.createElement('div');
    menuIn.className = 'gmem-menu__in';
    const mTitle = document.createElement('h3');
    mTitle.textContent = 'MEMORY MATCH';
    const mHint = document.createElement('p');
    mHint.textContent = 'Flip two cards at a time and lock all 8 pairs into your brain — clean streaks score bigger and the 60-second clock never stops.';
    const btnPlay = document.createElement('button');
    btnPlay.className = 'gmem-play';
    btnPlay.textContent = '▶ PLAY';
    const tips = document.createElement('div');
    tips.className = 'gmem-tips';
    ['16 CARDS · 8 PAIRS', '60 SECOND CLOCK', 'STREAKS PAY MORE'].forEach(t => {
      const s = document.createElement('span');
      s.textContent = t;
      tips.appendChild(s);
    });
    menuIn.appendChild(mTitle);
    menuIn.appendChild(mHint);
    menuIn.appendChild(btnPlay);
    menuIn.appendChild(tips);
    menu.appendChild(menuIn);
    host.appendChild(menu);

    const bar = document.createElement('div');
    bar.className = 'gmem-bar';
    const clock = document.createElement('span');
    clock.className = 'gmem-clock';
    clock.textContent = '⏱ ' + START_T.toFixed(1);
    const track = document.createElement('div');
    track.className = 'gmem-track';
    const fill = document.createElement('i');
    fill.className = 'gmem-fill';
    track.appendChild(fill);
    const movesEl = document.createElement('span');
    movesEl.className = 'gmem-moves';
    movesEl.textContent = 'MOVES 0';
    bar.appendChild(clock);
    bar.appendChild(track);
    bar.appendChild(movesEl);
    host.appendChild(bar);

    const grid = document.createElement('div');
    grid.className = 'gmem-grid';
    const cardEls = [];
    for (let i = 0; i < TOTAL; i++) {
      const c = document.createElement('button');
      c.className = 'gmem-card';
      const inner = document.createElement('div');
      inner.className = 'gmem-inner';
      const back = document.createElement('div');
      back.className = 'gmem-back';
      back.textContent = '✦';
      const face = document.createElement('div');
      face.className = 'gmem-face';
      face.textContent = '';
      inner.appendChild(back);
      inner.appendChild(face);
      c.appendChild(inner);
      grid.appendChild(c);
      cardEls.push(c);
    }
    host.appendChild(grid);

    /* ── deck ──────────────────────────────────────── */
    function shuffle() {
      cards = [];
      for (let i = 0; i < PAIRS; i++) {
        cards.push({ face: FACES[i], matched: false, flipped: false });
        cards.push({ face: FACES[i], matched: false, flipped: false });
      }
      for (let i = cards.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = cards[i]; cards[i] = cards[j]; cards[j] = t;
      }
      cardEls.forEach((el, i) => { el.children[0].children[1].textContent = cards[i].face; });
    }

    function reset() {
      shuffle();
      flipped = [];
      locked = false; lockT = 0;
      moves = 0; matches = 0; score = 0; streak = 0;
      timeLeft = START_T;
      cursorIdx = 0;
      overCalled = false;
      ctx.setScore(0);
    }

    function startRun() {
      reset();
      phase = 'play';
      menu.classList.add('is-out');
      Sfx.play('start');
      paint();
    }

    /* ── rules ─────────────────────────────────────── */
    function pick(i) {
      if (phase !== 'play' || locked) return;
      const c = cards[i];
      if (!c || c.matched || c.flipped) return;
      c.flipped = true;
      Sfx.play('click');
      flipped.push(i);
      paint();
      if (flipped.length < 2) return;

      moves++;
      const a = cards[flipped[0]], b = cards[flipped[1]];
      if (a.face === b.face) {
        a.matched = b.matched = true;
        flipped = [];
        matches++;
        streak++;
        score += 100 + (streak - 1) * 25;
        ctx.setScore(score);
        Sfx.play(streak >= 3 ? 'power' : 'coin');
        if (matches >= PAIRS) {
          score += Math.round(timeLeft) * 10;
          ctx.setScore(score);
          const used = Math.round(START_T - timeLeft);
          phase = 'over';
          Sfx.play('win');
          paint();
          ctx.gameOver({
            title: 'CLEARED!',
            message: `${moves} moves · ${used}s · ${score} pts`,
          });
          return;
        }
      } else {
        streak = 0;
        locked = true;
        lockT = 0;
        Sfx.play('tick');
      }
      paint();
    }

    function timeUp() {
      if (overCalled) return;
      overCalled = true;
      phase = 'over';
      timeLeft = 0;
      Sfx.play('hit');
      Sfx.play('lose');
      paint();
      ctx.gameOver({
        title: 'TIME UP!',
        message: `${moves} moves · ${START_T}s · ${score} pts`,
      });
    }

    /* ── input ─────────────────────────────────────── */
    cardEls.forEach((el, i) => {
      el.addEventListener('click', () => { if (phase === 'play') { cursorIdx = i; pick(i); } });
      el.addEventListener('pointerenter', () => { if (phase === 'play') cursorIdx = i; });
    });
    btnPlay.addEventListener('click', () => { if (phase === 'menu') startRun(); });

    const onKeyD = e => {
      const k = e.code;
      if (k === 'Space' || k === 'Enter') {
        const onCard = !!(e.target && e.target.closest && e.target.closest('.gmem-card'));
        if (phase === 'menu') {
          if (e.preventDefault) e.preventDefault();
          startRun();
          return;
        }
        if (onCard) return;                       // native button click will pick
        if (e.preventDefault) e.preventDefault();
        if (phase === 'play') pick(cursorIdx);
        return;
      }
      if (phase !== 'play') return;
      const col = cursorIdx % COLS, row = Math.floor(cursorIdx / COLS);
      let ni = -1;
      switch (k) {
        case 'ArrowRight': ni = row * COLS + ((col + 1) % COLS); break;
        case 'ArrowLeft': ni = row * COLS + ((col + COLS - 1) % COLS); break;
        case 'ArrowDown': ni = (cursorIdx + COLS) % TOTAL; break;
        case 'ArrowUp': ni = (cursorIdx + TOTAL - COLS) % TOTAL; break;
        default: return;
      }
      cursorIdx = ni;
      if (e.preventDefault) e.preventDefault();
      paint();
    };
    window.addEventListener('keydown', onKeyD);

    /* ── resize (CSS grid) ─────────────────────────── */
    function resize(w, h) {
      W = Math.max(260, Math.round(w || host.clientWidth || W));
      H = Math.max(260, Math.round(h || host.clientHeight || H));
    }

    /* ── update ────────────────────────────────────── */
    function update(dt) {
      if (paused || phase !== 'play') return;
      const before = Math.ceil(timeLeft);
      timeLeft -= dt;
      if (timeLeft <= 0) { timeUp(); return; }
      const after = Math.ceil(timeLeft);
      if (after <= 10 && after !== before) Sfx.play('tick');
      if (locked) {
        lockT += dt;
        if (lockT >= MISMATCH_DELAY) {
          for (const i of flipped) cards[i].flipped = false;
          flipped = [];
          locked = false;
          lockT = 0;
        }
      }
    }

    /* ── paint ─────────────────────────────────────── */
    function paint() {
      for (let i = 0; i < TOTAL; i++) {
        const c = cards[i];
        setCls(cardEls[i], 'is-flipped', !!(c && (c.flipped || c.matched)));
        setCls(cardEls[i], 'is-matched', !!(c && c.matched));
        setCls(cardEls[i], 'is-cursor', phase === 'play' && i === cursorIdx);
      }
      const t = '⏱ ' + Math.max(0, timeLeft).toFixed(1);
      if (clock.textContent !== t) clock.textContent = t;
      setCls(clock, 'is-urgent', phase === 'play' && timeLeft <= 10);
      const pct = Math.max(0, Math.min(100, (timeLeft / START_T) * 100));
      fill.style.width = pct + '%';
      const mv = 'MOVES ' + moves;
      if (movesEl.textContent !== mv) movesEl.textContent = mv;
    }

    /* ── boot ──────────────────────────────────────── */
    reset();
    resize();
    paint();

    let raf = 0, last = 0;
    function frame(now) {
      if (!alive) return;
      raf = requestAnimationFrame(frame);
      if (!last) last = now;
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.05) dt = 0.05;
      if (dt < 0) dt = 0;
      update(dt);
      paint();
    }
    raf = requestAnimationFrame(frame);

    /* ── shell contract ── */
    return {
      pause() { paused = true; },
      resume() { paused = false; last = 0; },
      restart() { paused = false; last = 0; startRun(); },
      resize(w, h) { resize(w, h); },
      destroy() {
        alive = false;
        cancelAnimationFrame(raf);
        window.removeEventListener('keydown', onKeyD);
        if (menu.parentNode) menu.parentNode.removeChild(menu);
        if (bar.parentNode) bar.parentNode.removeChild(bar);
        if (grid.parentNode) grid.parentNode.removeChild(grid);
        host.classList.remove('gmem-host');
      },
      getState() {
        return {
          phase, moves, matches, score, streak,
          timeLeft: Math.round(timeLeft * 10) / 10,
          pairs: PAIRS, cursorIdx,
          flipped: flipped.slice(),
          matchedIdx: cards.map((c, i) => (c.matched ? i : -1)).filter(i => i >= 0),
          layout: cards.map(c => c.face),
          locked, W, H,
        };
      },
    };
  },
});
