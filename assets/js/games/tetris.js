/* ═══════════════════════════════════════════════════════
   NEON TETRIS — 10×20 well, 7-bag randomiser, level curve
   Arrows/WASD move · rotate · soft drop · Space hard drops
   Touch pad (shown on coarse pointers) mirrors every action
   ═══════════════════════════════════════════════════════ */
registerGame({
  id: 'tetris',
  title: 'Tetris',
  genre: 'Puzzle',
  emoji: '🧱',
  colors: ['#8b5cff', '#00f0ff'],
  description: 'Stack the neon bricks, clear full rows and climb the curve — every ten rows the well speeds up, and one placement above the rim ends the run.',
  featured: true,
  controls: [
    { key: 'ARROWS / WASD', label: 'Move · rotate · drop' },
    { key: 'SPACE', label: 'Hard drop + start' },
    { key: 'TAP THE PAD', label: 'Touch controls' },
  ],
  create(ctx) {
    'use strict';

    const host = ctx.container;
    host.classList.add('gtet-host');

    /* ── constants ─────────────────────────────────── */
    const FONT = 'Orbitron, system-ui, sans-serif';
    const TAU = Math.PI * 2;
    const COLS = 10, ROWS = 20;
    const SHAPES = [
      [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]], /* I */
      [[1, 1], [1, 1]],                                          /* O */
      [[0, 1, 0], [1, 1, 1], [0, 0, 0]],                          /* T */
      [[0, 1, 1], [1, 1, 0], [0, 0, 0]],                          /* S */
      [[1, 1, 0], [0, 1, 1], [0, 0, 0]],                          /* Z */
      [[1, 0, 0], [1, 1, 1], [0, 0, 0]],                          /* J */
      [[0, 0, 1], [1, 1, 1], [0, 0, 0]],                          /* L */
    ];
    const NAMES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
    const PAL = ['#00f0ff', '#ffd23c', '#b14cff', '#39ff88', '#ff4d6d', '#3d7bff', '#ff9f1c'];
    const CLEAR_PTS = [0, 100, 300, 500, 800];
    const LOCK_MS = 420;
    const SOFT_MS = 45;
    const CLEAR_MS = 0.32;
    const KICKS = [0, -1, 1, -2, 2];
    const dropIV = () => Math.max(80, 800 - (level - 1) * 70);
    const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

    /* ── state ─────────────────────────────────────── */
    let phase = 'menu';                 // menu | play | over
    let paused = false, alive = true, overCalled = false;
    let board = [];
    let piece = null;                   // { t, rot, x, y, m }
    let nxt = null;
    let bag = [];
    let score = 0, lines = 0, level = 1;
    let dropAcc = 0, lockT = 0, lockResets = 0;
    let softHeld = false;
    let clearing = null;                // { rows:[…], t }
    let shakeT = 0, flashT = 0, pulseT = 0;
    const parts = [];
    const floaters = [];

    /* ── layout ────────────────────────────────────── */
    let W = ctx.width || host.clientWidth || 800;
    let H = ctx.height || host.clientHeight || 640;
    let cell = 30, fieldX = 0, fieldY = 0, sidebarX = 0, reserve = 0;

    function computeLayout() {
      const coarse = !!(window.matchMedia && window.matchMedia('(pointer:coarse)').matches);
      const narrow = typeof window.innerWidth === 'number' && window.innerWidth > 0 && window.innerWidth <= 700;
      reserve = (coarse || narrow) ? 78 : 0;
      const availH = Math.max(220, H - reserve);
      cell = Math.floor(Math.min((availH - 20) / ROWS, (W - 20) / (COLS + 4)));
      cell = Math.max(12, cell);
      const fieldW = COLS * cell, fieldH = ROWS * cell, sidebarW = 4 * cell;
      const totalW = fieldW + 8 + sidebarW;
      fieldX = Math.max(8, Math.round((W - totalW) / 2));
      fieldY = Math.max(8, Math.round((availH - fieldH) / 2));
      sidebarX = fieldX + fieldW + 8;
    }

    /* ── canvas + DOM ──────────────────────────────── */
    const canvas = document.createElement('canvas');
    host.appendChild(canvas);
    const g = canvas.getContext('2d');

    const menu = document.createElement('div');
    menu.className = 'gtet-menu';
    const menuIn = document.createElement('div');
    menuIn.className = 'gtet-menu__in';
    const mTitle = document.createElement('h3');
    mTitle.textContent = 'TETRIS';
    const mHint = document.createElement('p');
    mHint.textContent = 'Stack the neon bricks, clear full rows and climb the curve — every ten rows the well speeds up, and one placement above the rim ends the run.';
    const btnPlay = document.createElement('button');
    btnPlay.className = 'gtet-play';
    btnPlay.textContent = '▶ PLAY';
    const tips = document.createElement('div');
    tips.className = 'gtet-tips';
    ['10 × 20 WELL', 'FULL ROWS SCORE', 'EVERY 10 = LEVEL UP'].forEach(t => {
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

    /* touch pad (hidden on fine pointers by CSS) */
    const pad = document.createElement('div');
    pad.className = 'gtet-pad';
    const mkBtn = (cls, txt) => {
      const b = document.createElement('button');
      b.className = 'gtet-b ' + cls;
      b.textContent = txt;
      pad.appendChild(b);
      return b;
    };
    const bLeft = mkBtn('gtet-b--left', '◀');
    const bRot = mkBtn('gtet-b--rot', '↻');
    const bRight = mkBtn('gtet-b--right', '▶');
    const bDown = mkBtn('gtet-b--down', '▼');
    const bDrop = mkBtn('gtet-b--drop', '⤓');
    host.appendChild(pad);

    /* ── helpers ───────────────────────────────────── */
    function rr(x, y, w, h, r) {
      r = Math.min(r, w / 2, h / 2);
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
    }

    function burst(px, py, col, n) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU, v = 60 + Math.random() * 190;
        parts.push({
          x: px, y: py,
          vx: Math.cos(a) * v, vy: Math.sin(a) * v,
          t: 0, life: 0.45 + Math.random() * 0.4,
          col, sz: 2 + Math.random() * 3,
        });
      }
    }

    function float(px, py, txt, col, life) {
      floaters.push({ x: px, y: py, txt, col, t: 0, life: life || 0.9 });
    }

    function rotCW(m) {
      const n = m.length;
      return m.map((row, y) => row.map((_, x) => m[n - 1 - x][y]));
    }

    function fits(x, y, m) {
      for (let r = 0; r < m.length; r++) {
        for (let c = 0; c < m[r].length; c++) {
          if (!m[r][c]) continue;
          const cx = x + c, cy = y + r;
          if (cx < 0 || cx >= COLS || cy >= ROWS) return false;
          if (cy >= 0 && board[cy][cx]) return false;
        }
      }
      return true;
    }

    /* ── bag + spawn ───────────────────────────────── */
    function refillBag() {
      bag = [0, 1, 2, 3, 4, 5, 6];
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = bag[i]; bag[i] = bag[j]; bag[j] = t;
      }
    }

    function take() {
      if (!bag.length) refillBag();
      return bag.pop();
    }

    function spawn() {
      const t = nxt;
      nxt = take();
      piece = { t, rot: 0, x: 0, y: 0, m: SHAPES[t] };
      piece.x = Math.floor((COLS - piece.m[0].length) / 2);
      piece.y = 0;
      dropAcc = 0; lockT = 0; lockResets = 0;
      if (!fits(piece.x, piece.y, piece.m)) endMatch();
    }

    /* ── run flow ──────────────────────────────────── */
    function reset() {
      board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
      bag = []; piece = null;
      nxt = take();
      score = 0; lines = 0; level = 1;
      dropAcc = 0; lockT = 0; lockResets = 0;
      softHeld = false; clearing = null;
      shakeT = 0; flashT = 0;
      parts.length = 0; floaters.length = 0;
      overCalled = false;
      ctx.setScore(0);
    }

    function startRun() {
      reset();
      phase = 'play';
      menu.classList.add('is-out');
      Sfx.play('start');
      spawn();
    }

    function endMatch() {
      if (overCalled) return;
      overCalled = true;
      phase = 'over';
      softHeld = false;
      clearing = null;
      flashT = 0.8;
      Sfx.play('hit');
      Sfx.play('lose');
      ctx.gameOver({
        title: 'GAME OVER',
        message: `${lines} lines · level ${level} · ${score} pts`,
      });
    }

    /* ── actions ───────────────────────────────────── */
    function addScore(n) {
      score += n;
      ctx.setScore(score);
    }

    function resetLock() {
      if (lockT > 0 && lockResets < 15) { lockT = 0; lockResets++; }
    }

    function move(dx) {
      if (phase !== 'play' || paused || clearing || !piece) return;
      if (fits(piece.x + dx, piece.y, piece.m)) {
        piece.x += dx;
        resetLock();
        Sfx.play('click');
      }
    }

    function rotate() {
      if (phase !== 'play' || paused || clearing || !piece) return;
      const nm = rotCW(piece.m);
      for (const dx of KICKS) {
        if (fits(piece.x + dx, piece.y, nm)) {
          piece.m = nm;
          piece.rot = (piece.rot + 1) % 4;
          piece.x += dx;
          resetLock();
          Sfx.play('toggle');
          return;
        }
      }
    }

    function hardDrop() {
      if (phase !== 'play' || paused || clearing || !piece) return;
      let n = 0;
      while (fits(piece.x, piece.y + 1, piece.m)) { piece.y++; n++; }
      if (n) addScore(n * 2);
      shakeT = 0.14;
      Sfx.play('hit');
      lockPiece();
    }

    function lockPiece() {
      const t = piece.t, m = piece.m, px = piece.x, py = piece.y;
      let above = false;
      for (let r = 0; r < m.length; r++) {
        for (let c = 0; c < m[r].length; c++) {
          if (!m[r][c]) continue;
          const cy = py + r, cx = px + c;
          if (cy < 0) above = true;
          else if (cy < ROWS && cx >= 0 && cx < COLS) board[cy][cx] = t + 1;
        }
      }
      piece = null;
      if (above) { endMatch(); return; }

      const full = [];
      for (let r = 0; r < ROWS; r++) {
        if (board[r].every(v => v)) full.push(r);
      }
      if (full.length) {
        clearing = { rows: full, t: 0 };
        shakeT = 0.3;
        flashT = 0.45;
        if (full.length === 1) Sfx.play('coin');
        else Sfx.play('power');
        if (full.length === 4) float(fieldX + COLS * cell / 2, fieldY + ROWS * cell / 2 - 30, 'TETRIS!', '#39ff88', 1.3);
        else float(fieldX + COLS * cell / 2, fieldY + ROWS * cell / 2 - 30, `+${CLEAR_PTS[full.length] * level}`, '#ffd23c', 1.1);
        for (const r of full) {
          for (let i = 0; i < 6; i++) {
            burst(fieldX + (i * 2 + 1) * COLS * cell / 12, fieldY + r * cell + cell / 2, '#ffffff', 5);
          }
        }
      } else {
        spawn();
      }
    }

    function finishClear() {
      const rows = clearing.rows.slice().sort((a, b) => b - a);
      for (const r of rows) {
        board.splice(r, 1);
        board.unshift(Array(COLS).fill(0));
      }
      const n = rows.length;
      lines += n;
      addScore(CLEAR_PTS[n] * level);
      const nl = Math.floor(lines / 10) + 1;
      if (nl !== level) {
        level = nl;
        float(fieldX + COLS * cell / 2, fieldY + ROWS * cell * 0.3, `LEVEL ${level}`, '#39ff88', 1.3);
        Sfx.play('win');
      }
      clearing = null;
      spawn();
    }

    /* ── input: keyboard ───────────────────────────── */
    const onKeyD = e => {
      switch (e.code) {
        case 'ArrowLeft': case 'KeyA': move(-1); break;
        case 'ArrowRight': case 'KeyD': move(1); break;
        case 'ArrowUp': case 'KeyW': case 'KeyX': rotate(); break;
        case 'ArrowDown': case 'KeyS':
          if (phase === 'play' && !paused) softHeld = true;
          break;
        case 'Space':
          if (e.preventDefault) e.preventDefault();
          if (phase === 'menu') startRun();
          else hardDrop();
          return;
        case 'Enter':
          if (e.preventDefault) e.preventDefault();
          if (phase === 'menu') startRun();
          return;
        default: return;
      }
      if (e.preventDefault) e.preventDefault();
    };
    const onKeyU = e => {
      switch (e.code) {
        case 'ArrowDown': case 'KeyS': softHeld = false; break;
      }
    };
    window.addEventListener('keydown', onKeyD);
    window.addEventListener('keyup', onKeyU);

    /* ── input: touch pad ──────────────────────────── */
    const timers = new Set();
    const later = (fn, ms) => {
      const id = setTimeout(() => { timers.delete(id); fn(); }, ms);
      timers.add(id);
      return id;
    };
    const laterCancel = id => { clearTimeout(id); timers.delete(id); };

    function bindPad(btn, k, opts) {
      let rep = null, first = null;
      btn.addEventListener('pointerdown', e => {
        if (e && e.preventDefault) e.preventDefault();
        if (phase !== 'play' || paused) return;
        if (k === 'down') softHeld = true;
        else if (k === 'drop') hardDrop();
        else if (k === 'rot') rotate();
        else move(k === 'left' ? -1 : 1);
        if (k === 'left' || k === 'right') {
          const step = k === 'left' ? -1 : 1;
          first = later(() => {
            move(step);
            rep = setInterval(() => move(step), 55);
            timers.add(rep);
          }, opts && opts.hold ? opts.hold : 170);
        }
      });
      const stop = () => {
        if (k === 'down') softHeld = false;
        if (first) { laterCancel(first); first = null; }
        if (rep) { clearInterval(rep); timers.delete(rep); rep = null; }
      };
      btn.addEventListener('pointerup', stop);
      btn.addEventListener('pointercancel', stop);
      btn.addEventListener('pointerleave', stop);
    }
    bindPad(bLeft, 'left');
    bindPad(bRight, 'right');
    bindPad(bRot, 'rot');
    bindPad(bDown, 'down');
    bindPad(bDrop, 'drop');
    btnPlay.addEventListener('click', () => { if (phase === 'menu') startRun(); });

    /* ── resize ────────────────────────────────────── */
    function resize(w, h) {
      W = Math.max(260, Math.round(w || host.clientWidth || W));
      H = Math.max(260, Math.round(h || host.clientHeight || H));
      computeLayout();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    /* ── update ────────────────────────────────────── */
    function update(dt) {
      if (paused) return;
      if (shakeT > 0) shakeT = Math.max(0, shakeT - dt);
      if (flashT > 0) flashT = Math.max(0, flashT - dt * 1.6);
      pulseT += dt;
      for (const p of parts) {
        p.t += dt;
        p.vy += 420 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      for (let i = parts.length - 1; i >= 0; i--) if (parts[i].t >= parts[i].life) parts.splice(i, 1);
      for (const f of floaters) { f.t += dt; f.y -= 40 * dt; }
      for (let i = floaters.length - 1; i >= 0; i--) if (floaters[i].t >= floaters[i].life) floaters.splice(i, 1);

      if (phase !== 'play') return;

      if (clearing) {
        clearing.t += dt;
        if (clearing.t >= CLEAR_MS) finishClear();
        return;
      }
      if (!piece) return;

      if (!fits(piece.x, piece.y + 1, piece.m)) {
        lockT += dt * 1000;
        if (lockT >= LOCK_MS) lockPiece();
        return;
      }
      lockT = 0;
      dropAcc += dt * 1000;
      let iv = softHeld ? SOFT_MS : dropIV();
      let guard = 0;
      while (dropAcc >= iv && guard++ < 30) {
        dropAcc -= iv;
        if (fits(piece.x, piece.y + 1, piece.m)) {
          piece.y++;
          if (softHeld) addScore(1);
          iv = softHeld ? SOFT_MS : dropIV();
        } else break;
      }
    }

    /* ── render ────────────────────────────────────── */
    function drawCell(x, y, col, glow) {
      const p = 2;
      g.fillStyle = col;
      if (glow) { g.shadowColor = col; g.shadowBlur = 12; }
      rr(x + p, y + p, cell - p * 2, cell - p * 2, Math.max(3, cell * 0.16));
      g.fill();
      g.shadowBlur = 0;
      g.fillStyle = 'rgba(255,255,255,.34)';
      rr(x + p + 2, y + p + 2, cell - p * 2 - 4, Math.max(3, (cell - p * 2) * 0.3), 2);
      g.fill();
      g.fillStyle = 'rgba(0,0,0,.22)';
      rr(x + p + 2, y + cell - p - Math.max(3, (cell - p * 2) * 0.22) - 1, cell - p * 2 - 4, Math.max(3, (cell - p * 2) * 0.22), 2);
      g.fill();
    }

    function drawGhost() {
      if (!piece || clearing) return;
      let gy = piece.y;
      while (fits(piece.x, gy + 1, piece.m)) gy++;
      if (gy === piece.y) return;
      g.strokeStyle = PAL[piece.t];
      g.globalAlpha = 0.4;
      g.lineWidth = 1.5;
      const m = piece.m;
      for (let r = 0; r < m.length; r++) {
        for (let c = 0; c < m[r].length; c++) {
          if (!m[r][c]) continue;
          const cy = gy + r, cx = piece.x + c;
          if (cy < 0) continue;
          rr(fieldX + cx * cell + 3, fieldY + cy * cell + 3, cell - 6, cell - 6, 3);
          g.stroke();
        }
      }
      g.globalAlpha = 1;
    }

    function drawSidebar() {
      const sx = sidebarX, w = 4 * cell;
      g.textAlign = 'left';
      /* NEXT */
      g.font = '800 11px ' + FONT;
      g.fillStyle = '#7c88b0';
      g.fillText('NEXT', sx, fieldY + 14);
      const by = fieldY + 22, bh = cell * 4 + 8;
      g.strokeStyle = 'rgba(255,255,255,.14)';
      g.lineWidth = 1;
      rr(sx, by, w, bh, 8);
      g.stroke();
      if (nxt !== null) {
        const m = SHAPES[nxt];
        const mini = Math.max(8, Math.floor(cell * 0.62));
        let minC = 9, maxC = -1, minR = 9, maxR = -1;
        for (let r = 0; r < m.length; r++) {
          for (let c = 0; c < m[r].length; c++) {
            if (m[r][c]) { minC = Math.min(minC, c); maxC = Math.max(maxC, c); minR = Math.min(minR, r); maxR = Math.max(maxR, r); }
          }
        }
        const pw = (maxC - minC + 1) * mini, ph = (maxR - minR + 1) * mini;
        const ox = sx + (w - pw) / 2 - minC * mini, oy = by + (bh - ph) / 2 - minR * mini;
        g.fillStyle = PAL[nxt];
        g.shadowColor = PAL[nxt];
        g.shadowBlur = 8;
        for (let r = 0; r < m.length; r++) {
          for (let c = 0; c < m[r].length; c++) {
            if (!m[r][c]) continue;
            rr(ox + c * mini + 1.5, oy + r * mini + 1.5, mini - 3, mini - 3, 2);
            g.fill();
          }
        }
        g.shadowBlur = 0;
      }
      /* LEVEL + LINES */
      let yy = by + bh + 34;
      g.font = '800 11px ' + FONT;
      g.fillStyle = '#7c88b0';
      g.fillText('LEVEL', sx, yy);
      yy += 26;
      g.font = '900 24px ' + FONT;
      g.fillStyle = '#00f0ff';
      g.shadowColor = '#00f0ff';
      g.shadowBlur = 12;
      g.fillText(String(level), sx, yy);
      g.shadowBlur = 0;
      yy += 36;
      g.font = '800 11px ' + FONT;
      g.fillStyle = '#7c88b0';
      g.fillText('LINES', sx, yy);
      yy += 26;
      g.font = '900 24px ' + FONT;
      g.fillStyle = '#8b5cff';
      g.shadowColor = '#8b5cff';
      g.shadowBlur = 12;
      g.fillText(String(lines), sx, yy);
      g.shadowBlur = 0;
    }

    function render() {
      /* background */
      const bg = g.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#06070f');
      bg.addColorStop(0.6, '#080a18');
      bg.addColorStop(1, '#0b0a1e');
      g.fillStyle = bg;
      g.fillRect(0, 0, W, H);

      g.save();
      if (shakeT > 0) {
        const m = shakeT * 9;
        g.translate((Math.random() - 0.5) * 2 * m, (Math.random() - 0.5) * 2 * m);
      }

      const fieldW = COLS * cell, fieldH = ROWS * cell;

      /* well */
      g.fillStyle = 'rgba(4,6,16,.78)';
      rr(fieldX - 5, fieldY - 5, fieldW + 10, fieldH + 10, 10);
      g.fill();
      g.strokeStyle = 'rgba(139,92,255,.55)';
      g.lineWidth = 1.5;
      g.shadowColor = '#8b5cff';
      g.shadowBlur = 14;
      rr(fieldX - 5, fieldY - 5, fieldW + 10, fieldH + 10, 10);
      g.stroke();
      g.shadowBlur = 0;

      /* grid */
      g.strokeStyle = 'rgba(255,255,255,.045)';
      g.lineWidth = 1;
      g.beginPath();
      for (let c = 1; c < COLS; c++) {
        g.moveTo(fieldX + c * cell, fieldY);
        g.lineTo(fieldX + c * cell, fieldY + fieldH);
      }
      for (let r = 1; r < ROWS; r++) {
        g.moveTo(fieldX, fieldY + r * cell);
        g.lineTo(fieldX + fieldW, fieldY + r * cell);
      }
      g.stroke();

      /* locked cells */
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const v = board[r][c];
          if (v) drawCell(fieldX + c * cell, fieldY + r * cell, PAL[v - 1], false);
        }
      }

      /* ghost + active piece */
      drawGhost();
      if (piece && !clearing) {
        const m = piece.m;
        for (let r = 0; r < m.length; r++) {
          for (let c = 0; c < m[r].length; c++) {
            if (!m[r][c]) continue;
            const cy = piece.y + r;
            if (cy < 0) continue;
            drawCell(fieldX + (piece.x + c) * cell, fieldY + cy * cell, PAL[piece.t], true);
          }
        }
      }

      /* clear flash */
      if (clearing) {
        const a = Math.max(0, 1 - clearing.t / CLEAR_MS);
        g.fillStyle = `rgba(255,255,255,${(a * 0.8).toFixed(3)})`;
        for (const r of clearing.rows) {
          g.fillRect(fieldX, fieldY + r * cell, fieldW, cell);
        }
      }

      drawSidebar();

      /* particles + floaters */
      for (const p of parts) {
        const k = Math.max(0, 1 - p.t / p.life);
        g.globalAlpha = k;
        g.fillStyle = p.col;
        g.fillRect(p.x - p.sz / 2, p.y - p.sz / 2, p.sz, p.sz);
      }
      g.globalAlpha = 1;
      g.textAlign = 'center';
      g.font = '900 15px ' + FONT;
      for (const f of floaters) {
        g.globalAlpha = Math.max(0, Math.min(1, (1 - f.t / f.life) * 1.6));
        g.fillStyle = f.col;
        g.shadowColor = f.col;
        g.shadowBlur = 10;
        g.fillText(f.txt, f.x, f.y);
      }
      g.shadowBlur = 0;
      g.globalAlpha = 1;
      g.textAlign = 'left';

      if (flashT > 0) {
        const hx = Math.round(Math.min(1, flashT) * 40).toString(16).padStart(2, '0');
        g.fillStyle = '#ffffff' + hx;
        g.fillRect(0, 0, W, H);
      }
      g.restore();
    }

    /* ── boot ──────────────────────────────────────── */
    reset();
    resize();

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
      render();
    }
    raf = requestAnimationFrame(frame);

    /* ── shell contract ── */
    return {
      pause() { paused = true; softHeld = false; },
      resume() { paused = false; last = 0; },
      restart() { paused = false; last = 0; startRun(); },
      resize(w, h) { resize(w, h); },
      destroy() {
        alive = false;
        cancelAnimationFrame(raf);
        for (const id of timers) { clearTimeout(id); clearInterval(id); }
        timers.clear();
        window.removeEventListener('keydown', onKeyD);
        window.removeEventListener('keyup', onKeyU);
        if (pad.parentNode) pad.parentNode.removeChild(pad);
        if (menu.parentNode) menu.parentNode.removeChild(menu);
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        host.classList.remove('gtet-host');
      },
      getState() {
        return {
          phase, score, lines, level,
          piece: piece ? {
            t: NAMES[piece.t], rot: piece.rot, x: piece.x, y: piece.y,
            m: piece.m.map(r => r.join('')),
          } : null,
          next: nxt !== null ? NAMES[nxt] : null,
          board: board.map(r => r.join('')),
          clearing: !!clearing,
          clearingRows: clearing ? clearing.rows.slice() : [],
          W, H, cell, fieldX, fieldY, reserve,
          paused, overCalled,
        };
      },
    };
  },
});
