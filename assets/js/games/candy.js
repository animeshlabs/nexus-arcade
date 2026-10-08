/* ═══════════════════════════════════════════════════════
   CANDY CRUSH — neon match-3 (canvas 2D)
   Swipe or tap-swap · match 3+ · cascades multiply score
   ═══════════════════════════════════════════════════════ */
registerGame({
  id: 'candy',
  title: 'Candy Crush',
  genre: 'Puzzle',
  emoji: '🍬',
  colors: ['#ff2ecd', '#ffd23c'],
  description: 'Slide neon candies to line up three or more — every cascade multiplies your score. Beat the 120s clock or spend 30 moves wisely.',
  featured: true,
  controls: [
    { key: 'SWIPE', label: 'Slide a candy into its neighbour' },
    { key: 'TAP ×2', label: 'Pick two adjacent candies' },
  ],
  create(ctx) {
    'use strict';

    const host = ctx.container;
    host.classList.add('cc-host');

    /* ── layout constants ───────────────────────────── */
    const N = 8;                       // 8×8 board (as original)
    const CELL = 54;
    const PAD = 16;
    const BY = 44;                     // board top — status bar above
    const W = PAD * 2 + N * CELL;      // 464
    const H = BY + N * CELL + 16;      // 492
    const NCOLORS = 6;
    const FONT = 'Orbitron, system-ui, sans-serif';

    const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
    const easeInOutQuad = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
    const easeOutBack = t => {
      const c = 1.70158;
      return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
    };
    const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

    /* candy palettes: base + gloss */
    const PAL = [
      { c: '#ff2e7e', g: '#ff9ec4' },   // 0 pink  · circle
      { c: '#00e5ff', g: '#9df6ff' },   // 1 cyan   · rounded square
      { c: '#2dff9e', g: '#b6ffe2' },   // 2 mint   · hexagon
      { c: '#ffd23c', g: '#fff0a8' },   // 3 gold   · sparkle star
      { c: '#ff8a3d', g: '#ffce9e' },   // 4 orange · diamond
      { c: '#a06bff', g: '#d9c4ff' },   // 5 purple · heart
    ];

    const cellX = c => PAD + c * CELL + CELL / 2;
    const cellY = r => BY + r * CELL + CELL / 2;

    /* ── state ──────────────────────────────────────── */
    let cells = [];                 // cells[r][c] = candy | null
    let state = 'menu';             // menu | play | over
    let mode = null;                // 'timed' | 'moves'
    let locked = true;              // input gate during animations
    let paused = false, alive = true;
    let score = 0, cascade = 0, bestCascade = 0;
    let timeLeft = 120, movesLeft = 30, lastSec = -1;
    let sel = null;                 // {r,c} tap-selected cell
    let pDown = null;               // pointer gesture state
    let idleT = 0, hint = null;
    let shakeT = 0, comboPopT = 0, comboPopTxt = '';
    let waiter = null;              // sequenced delay {t, fn}
    const tweens = [];
    const parts = [];               // particles
    const floaters = [];            // rising +score texts
    let candyId = 0;

    function after(d, fn) { waiter = { t: d, fn }; }

    function tween(o, key, to, dur, delay, ease, done) {
      tweens.push({ o, key, from: o[key], to, t: -(delay || 0), dur, ease: ease || easeOutCubic, done });
    }

    function makeCandy(color, r, c) {
      return {
        id: candyId++, color, r, c,
        x: cellX(c), y: cellY(r),
        scale: 1, alpha: 1, rot: 0,
        pop: -1, squash: 0,
      };
    }

    /* ── board generation: no starting matches ─────── */
    function freeColor(r, c) {
      const ok = col => {
        if (c >= 2 && cells[r][c - 1] && cells[r][c - 2] &&
            cells[r][c - 1].color === col && cells[r][c - 2].color === col) return false;
        if (r >= 2 && cells[r - 1] && cells[r - 1][c] && cells[r - 2] && cells[r - 2][c] &&
            cells[r - 1][c].color === col && cells[r - 2][c].color === col) return false;
        return true;
      };
      const first = Math.floor(Math.random() * NCOLORS);
      if (ok(first)) return first;
      for (let i = 0; i < NCOLORS; i++) if (ok(i)) return i;
      return 0;
    }

    function buildBoard() {
      for (let attempt = 0; attempt < 50; attempt++) {
        cells = [];
        for (let r = 0; r < N; r++) {
          cells.push([]);
          for (let c = 0; c < N; c++) cells[r].push(makeCandy(freeColor(r, c), r, c));
        }
        if (findValidMove()) return;
      }
    }

    /* ── match detection: runs of 3+ (rows + columns) ─ */
    function findMatches() {
      const marked = new Set();
      const runs = [];
      const scan = get => {
        let start = 0;
        while (start < N) {
          const a = get(start);
          if (!a) { start++; continue; }
          let end = start + 1;
          while (end < N) {
            const b = get(end);
            if (!b || b.color !== a.color) break;
            end++;
          }
          if (end - start >= 3) {
            const run = [];
            for (let i = start; i < end; i++) { run.push(get(i)); marked.add(get(i)); }
            runs.push(run);
          }
          start = end;
        }
      };
      for (let r = 0; r < N; r++) scan(c => cells[r][c]);
      for (let c = 0; c < N; c++) scan(r => cells[r][c]);
      return { marked, runs };
    }

    /* does any single swap create a match? */
    function findValidMove() {
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const a = cells[r][c];
          if (!a) continue;
          const tries = [];
          if (c + 1 < N) tries.push([r, c + 1]);
          if (r + 1 < N) tries.push([r + 1, c]);
          for (const [r2, c2] of tries) {
            const b = cells[r2][c2];
            if (!b) continue;
            cells[r][c] = b; cells[r2][c2] = a;
            const m = findMatches();
            cells[r][c] = a; cells[r2][c2] = b;
            if (m.marked.size) return { r, c, r2, c2 };
          }
        }
      }
      return null;
    }

    /* ── mode menu (DOM, mirrors bubble's picker) ───── */
    const menu = document.createElement('div');
    menu.className = 'cc-menu';
    const menuIn = document.createElement('div');
    menuIn.className = 'cc-menu__in';
    const mTitle = document.createElement('h3');
    mTitle.textContent = 'CANDY CRUSH';
    const mHint = document.createElement('p');
    mHint.textContent = 'Swipe to swap · match 3+ · chain cascades for multipliers';
    const mRow = document.createElement('div');
    mRow.className = 'cc-modes';
    const btnTimed = document.createElement('button');
    btnTimed.className = 'cc-mode';
    btnTimed.textContent = '⏱ SPRINT · 120 SECONDS';
    const btnMoves = document.createElement('button');
    btnMoves.className = 'cc-mode';
    btnMoves.textContent = '🎯 30 MOVES';
    mRow.appendChild(btnTimed);
    mRow.appendChild(btnMoves);
    menuIn.appendChild(mTitle);
    menuIn.appendChild(mHint);
    menuIn.appendChild(mRow);
    menu.appendChild(menuIn);
    host.appendChild(menu);

    /* ── game flow ──────────────────────────────────── */
    function start(m) {
      mode = m;
      state = 'play';
      score = 0; cascade = 0; bestCascade = 0;
      timeLeft = 120; movesLeft = 30; lastSec = -1;
      sel = null; pDown = null; idleT = 0; hint = null;
      shakeT = 0; comboPopT = 0;
      tweens.length = 0; parts.length = 0; floaters.length = 0;
      waiter = null;
      buildBoard();
      /* entrance: board fills bottom-first, everyone rains in from above */
      locked = true;
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const cd = cells[r][c];
          const fromBottom = N - 1 - r;
          cd.y = cellY(r) - (N - r + 1) * CELL;
          const dur = 0.34 + fromBottom * 0.05;
          tween(cd, 'y', cellY(r), dur, fromBottom * 0.045 + c * 0.02, easeOutCubic);
        }
      }
      after(1.25, () => { locked = false; idleT = 0; });
      ctx.setScore(0);
      menu.classList.add('is-out');
      Sfx.play('start');
    }

    function endGame(title) {
      if (state === 'over') return;
      state = 'over';
      locked = true;
      sel = null;
      Sfx.play('lose');
      ctx.gameOver({
        title,
        message: `${score} pts · best cascade ×${bestCascade}`,
      });
    }

    function shuffleBoard() {
      ctx.toast('No moves left — reshuffling!', 'info');
      Sfx.play('start');
      buildBoard();
      locked = true;
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const cd = cells[r][c];
          const fromBottom = N - 1 - r;
          cd.y = cellY(r) - CELL * (2 + Math.random() * 4);
          const dur = 0.28 + fromBottom * 0.045;
          tween(cd, 'y', cellY(r), dur, fromBottom * 0.03 + Math.random() * 0.08, easeOutCubic);
        }
      }
      after(0.95, () => { locked = false; idleT = 0; });
    }

    /* ── swap attempt ───────────────────────────────── */
    function swapData(a, b) {
      const ar = a.r, ac = a.c;
      cells[a.r][a.c] = b;
      cells[b.r][b.c] = a;
      a.r = b.r; a.c = b.c;
      b.r = ar; b.c = ac;
    }

    function attemptSwap(a, b) {
      if (locked || state !== 'play') return;
      if (Math.abs(a.r - b.r) + Math.abs(a.c - b.c) !== 1) return;
      locked = true;
      sel = null;
      hint = null;
      idleT = 0;
      Sfx.play('toggle');
      swapData(a, b);
      let pending = 2;
      const done = () => { if (--pending === 0) afterSwap(a, b); };
      if (a.x !== cellX(a.c)) tween(a, 'x', cellX(a.c), 0.16, 0, easeInOutQuad, done);
      else tween(a, 'y', cellY(a.r), 0.16, 0, easeInOutQuad, done);
      if (b.x !== cellX(b.c)) tween(b, 'x', cellX(b.c), 0.16, 0, easeInOutQuad, done);
      else tween(b, 'y', cellY(b.r), 0.16, 0, easeInOutQuad, done);
    }

    function afterSwap(a, b) {
      const { marked, runs } = findMatches();
      if (!marked.size) {
        /* invalid: snap back with a shake */
        Sfx.play('tick');
        shakeT = 0.22;
        swapData(a, b);
        let pending = 2;
        const done = () => { if (--pending === 0) { locked = false; idleT = 0; } };
        if (a.x !== cellX(a.c)) tween(a, 'x', cellX(a.c), 0.16, 0, easeInOutQuad, done);
        else tween(a, 'y', cellY(a.r), 0.16, 0, easeInOutQuad, done);
        if (b.x !== cellX(b.c)) tween(b, 'x', cellX(b.c), 0.16, 0, easeInOutQuad, done);
        else tween(b, 'y', cellY(b.r), 0.16, 0, easeInOutQuad, done);
        return;
      }
      /* valid move */
      if (mode === 'moves') {
        movesLeft--;
        if (movesLeft <= 0) { /* end after resolution — flag checked in finishTurn */ }
      }
      resolveStep(marked, runs);
    }

    /* ── cascade resolver (pop → gravity → repeat) ──── */
    function resolveStep(marked, runs) {
      cascade++;
      if (cascade > bestCascade) bestCascade = cascade;

      let pts = 0;
      for (const run of runs) pts += run.length * 10;
      pts *= cascade;
      score += pts;
      ctx.setScore(score);

      /* floaters at run centroid */
      let fx = 0, fy = 0;
      marked.forEach(cd => { fx += cd.x; fy += cd.y; });
      const n = marked.size || 1;
      floaters.push({
        x: fx / n, y: fy / n, t: 0,
        txt: '+' + pts + (cascade > 1 ? '  ×' + cascade : ''),
        col: cascade >= 3 ? '#ffd23c' : cascade >= 2 ? '#ff2ecd' : '#00e5ff',
      });

      Sfx.play(cascade >= 3 ? 'power' : 'coin');
      marked.forEach(cd => {
        burst(cd.x, cd.y, 7, PAL[cd.color].c);
        cd.pop = 0;
      });
      if (cascade >= 2) {
        comboPopT = 0.9;
        comboPopTxt = 'CASCADE ×' + cascade;
        shakeT = Math.max(shakeT, 0.12 + cascade * 0.03);
        Sfx.play('win');
      }

      after(0.3, () => {
        marked.forEach(cd => {
          if (cells[cd.r][cd.c] === cd) cells[cd.r][cd.c] = null;
        });
        const fallDur = applyGravity();
        after(fallDur + 0.04, () => {
          const next = findMatches();
          if (next.marked.size) resolveStep(next.marked, next.runs);
          else finishTurn();
        });
      });
    }

    function finishTurn() {
      cascade = 0;
      if (mode === 'moves' && movesLeft <= 0) { endGame('OUT OF MOVES'); return; }
      const mv = findValidMove();
      if (!mv) { shuffleBoard(); return; }
      locked = false;
      idleT = 0;
    }

    /* ── gravity + refill ───────────────────────────── */
    function applyGravity() {
      let maxDur = 0;
      for (let c = 0; c < N; c++) {
        const stack = [];
        for (let r = N - 1; r >= 0; r--) if (cells[r][c]) stack.push(cells[r][c]);
        let r = N - 1;
        for (const cd of stack) {
          cd.r = r; cd.c = c;
          cells[r][c] = cd;
          r--;
        }
        /* refill the top gap from above the board */
        let spawnIdx = 0;
        for (; r >= 0; r--) {
          const cd = makeCandy(Math.floor(Math.random() * NCOLORS), r, c);
          cd.y = BY - CELL * (spawnIdx + 1.6);   // hidden above the canvas
          spawnIdx++;
          cells[r][c] = cd;
        }
        /* animate everything in this column toward its target */
        for (let rr = 0; rr < N; rr++) {
          const cd = cells[rr][c];
          if (!cd) continue;
          const target = cellY(rr);
          if (Math.abs(cd.y - target) < 0.5) continue;
          const dist = Math.abs(target - cd.y) / CELL;
          const dur = 0.16 + dist * 0.035;
          tween(cd, 'y', target, dur, 0, easeOutCubic, () => { cd.squash = 1; });
          if (dur > maxDur) maxDur = dur;
        }
      }
      return maxDur;
    }

    /* ── canvas + input ─────────────────────────────── */
    const canvas = document.createElement('canvas');
    host.appendChild(canvas);
    const g = canvas.getContext('2d');

    function resize(w, h) {
      w = w || host.clientWidth || W;
      h = h || host.clientHeight || H;
      const scale = Math.min(w / W, h / H);
      canvas.style.width = Math.round(W * scale) + 'px';
      canvas.style.height = Math.round(H * scale) + 'px';
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function cellFromEvent(e) {
      const rct = canvas.getBoundingClientRect();
      const sx = W / Math.max(rct.width, 1);
      const x = (e.clientX - rct.left) * sx;
      const y = (e.clientY - rct.top) * sx;
      const c = Math.floor((x - PAD) / CELL);
      const r = Math.floor((y - BY) / CELL);
      if (r < 0 || r >= N || c < 0 || c >= N) return null;
      return { r, c, cx: e.clientX, cy: e.clientY, moved: false };
    }

    const onDown = e => {
      if (state !== 'play' || locked) return;
      const cell = cellFromEvent(e);
      if (!cell) return;
      if (e.cancelable) e.preventDefault();
      pDown = cell;
    };

    const onMove = e => {
      if (!pDown || pDown.moved) return;
      const rct = canvas.getBoundingClientRect();
      const sx = W / Math.max(rct.width, 1);
      const dx = (e.clientX - pDown.cx) * sx;
      const dy = (e.clientY - pDown.cy) * sx;
      const TH = CELL * 0.45;
      if (Math.abs(dx) < TH && Math.abs(dy) < TH) return;
      pDown.moved = true;
      let r2 = pDown.r, c2 = pDown.c;
      if (Math.abs(dx) > Math.abs(dy)) c2 += dx > 0 ? 1 : -1;
      else r2 += dy > 0 ? 1 : -1;
      const from = pDown;
      pDown = null;
      if (r2 < 0 || r2 >= N || c2 < 0 || c2 >= N) return;
      const a = cells[from.r][from.c], b = cells[r2][c2];
      if (a && b) attemptSwap(a, b);
    };

    const onUp = e => {
      const down = pDown;
      pDown = null;
      if (!down || down.moved) return;
      /* plain tap → select / second-tap-swap */
      if (locked || state !== 'play') return;
      if (sel && sel.r === down.r && sel.c === down.c) { sel = null; return; }
      if (sel && Math.abs(sel.r - down.r) + Math.abs(sel.c - down.c) === 1) {
        const a = cells[sel.r][sel.c], b = cells[down.r][down.c];
        sel = null;
        if (a && b) attemptSwap(a, b);
        return;
      }
      sel = { r: down.r, c: down.c };
      idleT = 0;
      hint = null;
      Sfx.play('click');
    };

    const onCancel = () => { pDown = null; };

    host.addEventListener('pointerdown', onDown);
    host.addEventListener('pointermove', onMove);
    host.addEventListener('pointerup', onUp);
    host.addEventListener('pointercancel', onCancel);

    btnTimed.addEventListener('click', () => { if (state === 'menu') start('timed'); });
    btnMoves.addEventListener('click', () => { if (state === 'menu') start('moves'); });

    /* ── fx ─────────────────────────────────────────── */
    function burst(x, y, n, col) {
      for (let i = 0; i < n; i++) {
        if (parts.length > 280) break;
        const a = Math.random() * Math.PI * 2;
        const v = 60 + Math.random() * 150;
        parts.push({
          x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40,
          t: 0, life: 0.45 + Math.random() * 0.3,
          col, sz: 2 + Math.random() * 3.5,
          rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 10,
        });
      }
    }

    /* ── drawing ────────────────────────────────────── */
    function rr(x, y, w, h, r) {
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
    }

    function candyPath(shape) {
      g.beginPath();
      if (shape === 0) {                                   // circle
        g.arc(0, 0, 19, 0, Math.PI * 2);
      } else if (shape === 1) {                            // rounded square
        rr(-18, -18, 36, 36, 9);
      } else if (shape === 2) {                            // hexagon
        for (let i = 0; i < 6; i++) {
          const a = -Math.PI / 2 + i * Math.PI / 3;
          const x = Math.cos(a) * 20, y = Math.sin(a) * 20;
          i ? g.lineTo(x, y) : g.moveTo(x, y);
        }
        g.closePath();
      } else if (shape === 3) {                            // sparkle star
        for (let i = 0; i < 8; i++) {
          const a = -Math.PI / 2 + i * Math.PI / 4;
          const rad = i % 2 ? 8.5 : 21;
          const x = Math.cos(a) * rad, y = Math.sin(a) * rad;
          i ? g.lineTo(x, y) : g.moveTo(x, y);
        }
        g.closePath();
      } else if (shape === 4) {                            // diamond
        g.moveTo(0, -21); g.lineTo(16, 0); g.lineTo(0, 21); g.lineTo(-16, 0);
        g.closePath();
      } else {                                             // heart
        g.moveTo(0, 17);
        g.bezierCurveTo(-24, -1, -13, -22, 0, -7);
        g.bezierCurveTo(13, -22, 24, -1, 0, 17);
        g.closePath();
      }
    }

    function drawCandy(cd, tSec) {
      if (cd.y < BY - CELL || cd.y > H + CELL) return;
      const pal = PAL[cd.color];
      let sx = cd.scale, sy = cd.scale;
      if (cd.pop < 0 && cd.squash > 0) {
        const dip = Math.sin(cd.squash * Math.PI);
        sx *= 1 + 0.18 * dip;
        sy *= 1 - 0.25 * dip;
      }
      g.save();
      g.globalAlpha = cd.alpha;
      g.translate(cd.x, cd.y);
      if (cd.rot) g.rotate(cd.rot);
      g.scale(sx, sy);
      /* body */
      g.shadowColor = pal.c;
      g.shadowBlur = 10;
      const grad = g.createRadialGradient(-6, -8, 2, 0, 0, 22);
      grad.addColorStop(0, pal.g);
      grad.addColorStop(1, pal.c);
      g.fillStyle = grad;
      candyPath(cd.color);
      g.fill();
      /* rim */
      g.shadowBlur = 0;
      g.lineWidth = 1.6;
      g.strokeStyle = 'rgba(255,255,255,.35)';
      g.stroke();
      /* gloss highlight */
      g.save();
      candyPath(cd.color);
      g.clip();
      g.fillStyle = 'rgba(255,255,255,.38)';
      g.beginPath();
      g.ellipse(-6, -9, 8.5, 5, -0.5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,.9)';
      g.beginPath();
      g.arc(-7, -11, 2, 0, Math.PI * 2);
      g.fill();
      g.restore();
      g.restore();
    }

    function drawBoard(tSec) {
      /* status bar */
      g.font = '700 13px ' + FONT;
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillStyle = 'rgba(255,255,255,.4)';
      g.fillText(mode === 'timed' ? 'SPRINT' : 'MOVES', PAD, 24);

      g.textAlign = 'right';
      g.font = '900 22px ' + FONT;
      if (mode === 'timed') {
        const sec = Math.max(0, Math.ceil(timeLeft));
        const mm = Math.floor(sec / 60), ss = String(sec % 60).padStart(2, '0');
        const low = timeLeft <= 10;
        const pulse = low ? 0.75 + 0.25 * Math.sin(tSec * 9) : 1;
        g.globalAlpha = pulse;
        g.fillStyle = low ? '#ff3b5c' : '#00e5ff';
        g.shadowColor = low ? '#ff3b5c' : '#00e5ff';
        g.shadowBlur = 14;
        g.fillText(`${mm}:${ss}`, W - PAD, 24);
        g.shadowBlur = 0;
        g.globalAlpha = 1;
      } else {
        const low = movesLeft <= 5;
        g.fillStyle = low ? '#ff8a3d' : '#ffd23c';
        g.shadowColor = g.fillStyle;
        g.shadowBlur = 12;
        g.fillText(String(Math.max(0, movesLeft)), W - PAD, 24);
        g.shadowBlur = 0;
      }

      /* cascade chip while resolving */
      if (cascade > 1 && locked && state === 'play') {
        g.textAlign = 'center';
        g.font = '900 14px ' + FONT;
        g.fillStyle = '#ff2ecd';
        g.shadowColor = '#ff2ecd';
        g.shadowBlur = 12;
        g.fillText('×' + cascade, W / 2, 24);
        g.shadowBlur = 0;
      }

      /* board panel */
      const bx = PAD - 8, by = BY - 8, bw = N * CELL + 16, bh = N * CELL + 16;
      rr(bx, by, bw, bh, 16);
      g.fillStyle = 'rgba(10,12,28,.72)';
      g.fill();
      g.lineWidth = 1.5;
      g.strokeStyle = 'rgba(0,229,255,.4)';
      g.shadowColor = '#00e5ff';
      g.shadowBlur = 18;
      g.stroke();
      g.shadowBlur = 0;
      /* cell tint checker */
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          if ((r + c) % 2) continue;
          g.fillStyle = 'rgba(255,255,255,.025)';
          g.fillRect(PAD + c * CELL, BY + r * CELL, CELL, CELL);
        }
      }
    }

    function drawRing(r, c, col, alpha, tSec) {
      const x = cellX(c), y = cellY(r);
      g.save();
      g.globalAlpha = alpha;
      g.strokeStyle = col;
      g.lineWidth = 2.5;
      g.shadowColor = col;
      g.shadowBlur = 12;
      g.setLineDash([7, 6]);
      g.lineDashOffset = -tSec * 34;
      rr(x - CELL / 2 + 3, y - CELL / 2 + 3, CELL - 6, CELL - 6, 12);
      g.stroke();
      g.restore();
    }

    function render(tSec) {
      /* background */
      const bg = g.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#0b0e20');
      bg.addColorStop(1, '#141136');
      g.fillStyle = bg;
      g.fillRect(0, 0, W, H);

      g.save();
      if (shakeT > 0) {
        const m = shakeT * 16;
        g.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
      }

      drawBoard(tSec);

      if (sel) drawRing(sel.r, sel.c, '#ffffff', 0.9, tSec);
      if (hint) {
        const a = 0.4 + 0.4 * Math.sin(tSec * 5);
        drawRing(hint.r, hint.c, '#ffd23c', a, tSec);
        drawRing(hint.r2, hint.c2, '#ffd23c', a, tSec);
      }

      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const cd = cells[r] && cells[r][c];
          if (cd) drawCandy(cd, tSec);
        }
      }

      /* particles (additive sparkle squares) */
      g.globalCompositeOperation = 'lighter';
      for (const p of parts) {
        g.save();
        g.globalAlpha = Math.max(0, 1 - p.t / p.life);
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        g.fillStyle = p.col;
        g.fillRect(-p.sz / 2, -p.sz / 2, p.sz, p.sz);
        g.restore();
      }
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;

      /* floating score texts */
      g.font = '900 16px ' + FONT;
      g.textAlign = 'center';
      for (const f of floaters) {
        g.globalAlpha = Math.max(0, 1 - f.t);
        g.fillStyle = f.col;
        g.shadowColor = f.col;
        g.shadowBlur = 12;
        g.fillText(f.txt, f.x, f.y);
        g.shadowBlur = 0;
      }
      g.globalAlpha = 1;

      /* cascade banner */
      if (comboPopT > 0) {
        const k = 1 - comboPopT / 0.9;
        const a = comboPopT > 0.55 ? 1 : comboPopT / 0.55;
        const sc = k < 0.3 ? easeOutBack(k / 0.3) : 1;
        g.save();
        g.globalAlpha = a;
        g.translate(W / 2, H / 2 - 50);
        g.scale(sc, sc);
        g.font = '900 34px ' + FONT;
        g.textAlign = 'center';
        g.fillStyle = '#ffd23c';
        g.shadowColor = '#ff2ecd';
        g.shadowBlur = 26;
        g.fillText(comboPopTxt, 0, 0);
        g.restore();
        g.globalAlpha = 1;
      }

      g.restore();

      /* vignette */
      const vg = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.8);
      vg.addColorStop(0, 'rgba(6,7,15,0)');
      vg.addColorStop(1, 'rgba(6,7,15,.45)');
      g.fillStyle = vg;
      g.fillRect(0, 0, W, H);
    }

    /* ── update ─────────────────────────────────────── */
    function update(dt, tSec) {
      /* sequenced cascade steps */
      if (waiter) {
        waiter.t -= dt;
        if (waiter.t <= 0) {
          const fn = waiter.fn;
          waiter = null;
          fn();
        }
      }

      /* tweens */
      for (let i = tweens.length - 1; i >= 0; i--) {
        const tw = tweens[i];
        tw.t += dt;
        if (tw.t < 0) continue;
        const k = Math.min(1, tw.t / tw.dur);
        tw.o[tw.key] = tw.from + (tw.to - tw.from) * tw.ease(k);
        if (k >= 1) {
          tweens.splice(i, 1);
          if (tw.done) tw.done();
        }
      }

      /* candy pop / squash animation */
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const cd = cells[r] && cells[r][c];
          if (!cd) continue;
          if (cd.pop >= 0) {
            cd.pop += dt;
            const k = Math.min(1, cd.pop / 0.28);
            cd.scale = k < 0.35 ? 1 + (k / 0.35) * 0.3
                                : 1.3 * (1 - (k - 0.35) / 0.65);
            cd.alpha = k > 0.55 ? Math.max(0, 1 - (k - 0.55) / 0.45) : 1;
            cd.rot = k * 1.1;
            if (k >= 1) { cd.scale = 0; cd.alpha = 0; }
          } else if (cd.squash > 0) {
            cd.squash = Math.max(0, cd.squash - dt * 5);
          }
        }
      }

      /* particles */
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.t += dt;
        if (p.t >= p.life) { parts.splice(i, 1); continue; }
        p.vy += 380 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
      }

      /* floaters */
      for (let i = floaters.length - 1; i >= 0; i--) {
        const f = floaters[i];
        f.t += dt;
        f.y -= 46 * dt;
        if (f.t >= 1) floaters.splice(i, 1);
      }

      if (shakeT > 0) shakeT = Math.max(0, shakeT - dt);
      if (comboPopT > 0) comboPopT = Math.max(0, comboPopT - dt);

      /* clock + idle hint */
      if (state === 'play') {
        if (mode === 'timed') {
          timeLeft -= dt;
          const sec = Math.ceil(timeLeft);
          if (sec !== lastSec) {
            lastSec = sec;
            if (sec <= 10 && sec > 0) Sfx.play('tick');
          }
          if (timeLeft <= 0) { timeLeft = 0; endGame('TIME UP!'); }
        }
        if (!locked && !sel) {
          idleT += dt;
          if (idleT > 6 && !hint) hint = findValidMove();
        }
      }
    }

    /* ── loop ───────────────────────────────────────── */
    let raf = 0, last = 0;
    function loop(t) {
      if (!alive) return;
      raf = requestAnimationFrame(loop);
      if (!last) last = t;
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      const tSec = t * 0.001;
      if (!paused) update(dt, tSec);
      render(tSec);
    }

    /* ── boot ───────────────────────────────────────── */
    buildBoard();                 // decorative board behind the menu
    resize();
    ctx.setScore(0);
    raf = requestAnimationFrame(loop);

    return {
      pause() { paused = true; },
      resume() { paused = false; last = 0; },
      restart() { start(mode || 'timed'); },
      resize(w, h) { resize(w, h); },
      destroy() {
        alive = false;
        cancelAnimationFrame(raf);
        host.removeEventListener('pointerdown', onDown);
        host.removeEventListener('pointermove', onMove);
        host.removeEventListener('pointerup', onUp);
        host.removeEventListener('pointercancel', onCancel);
        host.classList.remove('cc-host');
        host.innerHTML = '';
      },
    };
  },
});
