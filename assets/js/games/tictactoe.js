/* ═══════════════════════════════════════════════════════
   TIC-TAC-TOE — neon board duel (canvas 2D)
   Vs bot (easy / normal / expert-minimax) or local 2P
   First to 3 round wins takes the match (max 5 rounds)
   ═══════════════════════════════════════════════════════ */
registerGame({
  id: 'tictactoe',
  title: 'Tic-Tac-Toe',
  genre: 'Board',
  emoji: '❌',
  colors: ['#00f0ff', '#ff2ecd'],
  description: 'Classic Xs and Os with animated neon strokes — outsmart the bot across three difficulties or duel a friend on one screen. First to 3 round wins takes the match.',
  featured: true,
  controls: [
    { key: 'TAP', label: 'Drop your mark in any open tile' },
    { key: '3 IN A ROW', label: 'Win the round — best of five' },
  ],
  create(ctx) {
    'use strict';

    const host = ctx.container;
    host.classList.add('ttt-host');

    /* ── layout ─────────────────────────────────────── */
    const N = 3, CELL = 100, PAD = 30, BY = 50;
    const W = PAD * 2 + N * CELL;      // 360
    const H = 440;                     // board 50–350, stats 362–418
    const FONT = 'Orbitron, system-ui, sans-serif';
    const TAU = Math.PI * 2;

    const CX = '#00f0ff', CP = '#ff2ecd';   // X · cyan   O · pink
    const COL = [CX, CP];

    const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
    const easeOutBack = t => {
      const c = 1.70158;
      return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
    };
    const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

    const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    const MODE_LABEL = {
      easy: 'BOT · EASY',
      normal: 'BOT · NORMAL',
      expert: 'BOT · EXPERT',
      friend: 'LOCAL 2P',
    };

    const tileX = i => PAD + (i % 3) * CELL + 3;
    const tileY = i => BY + Math.floor(i / 3) * CELL + 3;
    const ctrX = i => PAD + (i % 3) * CELL + CELL / 2;
    const ctrY = i => BY + Math.floor(i / 3) * CELL + CELL / 2;

    /* ── win helpers ────────────────────────────────── */
    function winnerOf(b) {
      for (const L of LINES) {
        const a = b[L[0]];
        if (a != null && a === b[L[1]] && a === b[L[2]]) return a;
      }
      return b.every(v => v != null) ? 'draw' : null;
    }
    function winLineOf(b) {
      for (const L of LINES) {
        const a = b[L[0]];
        if (a != null && a === b[L[1]] && a === b[L[2]]) return L;
      }
      return null;
    }
    function openCells(b) {
      const a = [];
      for (let i = 0; i < 9; i++) if (b[i] == null) a.push(i);
      return a;
    }
    function winningCell(b, p) {
      for (const i of openCells(b)) {
        b[i] = p;
        const wins = winnerOf(b) === p;
        b[i] = null;
        if (wins) return i;
      }
      return -1;
    }

    /* ── bot brains ─────────────────────────────────── */
    function easyBot(b) {
      const a = openCells(b);
      return a[Math.floor(Math.random() * a.length)];
    }
    function normalBot(b) {
      const w = winningCell(b, 1);
      if (w >= 0) return w;                       // take the win
      const block = winningCell(b, 0);
      if (block >= 0) return block;               // block the threat
      if (b[4] == null) return 4;                 // centre
      const corners = [0, 2, 6, 8].filter(i => b[i] == null);
      if (corners.length) return corners[Math.floor(Math.random() * corners.length)];
      const sides = [1, 3, 5, 7].filter(i => b[i] == null);
      return sides[Math.floor(Math.random() * sides.length)];
    }
    function minimax(b, turn, me, depth) {
      const w = winnerOf(b);
      if (w === 'draw') return 0;
      if (w === me) return 10 - depth;            // prefer faster wins
      if (w !== null) return depth - 10;          // prefer forcing faster losses
      let best = turn === me ? -Infinity : Infinity;
      for (const i of openCells(b)) {
        b[i] = turn;
        const s = minimax(b, 1 - turn, me, depth + 1);
        b[i] = null;
        if (turn === me) { if (s > best) best = s; }
        else if (s < best) best = s;
      }
      return best;
    }
    function expertBot(b) {
      const me = 1;
      let best = -Infinity;
      const picks = [];
      for (const i of openCells(b)) {
        b[i] = me;
        const s = minimax(b, 0, me, 1);
        b[i] = null;
        if (s > best) { best = s; picks.length = 0; picks.push(i); }
        else if (s === best) picks.push(i);
      }
      return picks.length ? picks[Math.floor(Math.random() * picks.length)] : -1;
    }
    const BOTS = { easy: easyBot, normal: normalBot, expert: expertBot };

    /* ── state ──────────────────────────────────────── */
    let phase = 'menu';               // menu | enter | play | round | clear | over
    let mode = 'easy';
    let board = [];                   // null | 0 (X) | 1 (O)
    let marks = [];                   // {p, t, alpha} anim per cell
    let tiles = [];                   // {t, press} anim per cell
    let turn = 0;                     // X opens round 1, alternates after
    let roundsDone = 0;
    let xWins = 0, oWins = 0, draws = 0;
    let score = 0, matchEnd = false;
    let timer = 0;                    // generic phase clock
    let botT = 0;                     // bot thinking delay
    let winT = 0, dimT = 0;
    let winLine = null, winP = -1;
    let banner = null;                // {txt, col, t}
    let hover = -1, shakeT = 0;
    const parts = [];
    let paused = false, alive = true;

    const isBot = () => mode !== 'friend';

    /* ── mode menu ──────────────────────────────────── */
    const menu = document.createElement('div');
    menu.className = 'ttt-menu';
    const menuIn = document.createElement('div');
    menuIn.className = 'ttt-menu__in';
    const mTitle = document.createElement('h3');
    mTitle.textContent = 'TIC · TAC · TOE';
    const mHint = document.createElement('p');
    mHint.textContent = 'Three in a row takes the round — first to 3 wins the match';
    const mRow = document.createElement('div');
    mRow.className = 'ttt-modes';
    function mkBtn(txt) {
      const b = document.createElement('button');
      b.className = 'ttt-mode';
      b.textContent = txt;
      mRow.appendChild(b);
      return b;
    }
    const btnEasy = mkBtn('🤖 EASY BOT');
    const btnNormal = mkBtn('🧠 NORMAL BOT');
    const btnExpert = mkBtn('🎓 EXPERT BOT');
    const btnFriend = mkBtn('👥 LOCAL 2P');
    menuIn.appendChild(mTitle);
    menuIn.appendChild(mHint);
    menuIn.appendChild(mRow);
    menu.appendChild(menuIn);
    host.appendChild(menu);

    /* ── board lifecycle ────────────────────────────── */
    function resetBoard(entrance) {
      board = [null, null, null, null, null, null, null, null, null];
      marks = board.map(() => null);
      tiles = board.map((_, i) => ({ t: entrance ? -i * 0.045 : 9, press: 0 }));
      turn = roundsDone % 2;          // alternate who opens each round
      winLine = null; winP = -1; banner = null;
      winT = 0; dimT = 0; hover = -1;
    }

    function start(m) {
      mode = m;
      score = 0; roundsDone = 0;
      xWins = 0; oWins = 0; draws = 0;
      matchEnd = false;
      shakeT = 0; parts.length = 0;
      resetBoard(true);
      phase = 'enter';
      timer = 0.6;
      ctx.setScore(0);
      menu.classList.add('is-out');
      Sfx.play('start');
    }

    function placeMark(i, byBot) {
      if (i < 0 || i > 8 || board[i] != null || phase !== 'play') return;
      board[i] = turn;
      marks[i] = { p: turn, t: 0, alpha: 1 };
      tiles[i].press = 1;
      Sfx.play(byBot ? 'click' : 'toggle');
      const w = winnerOf(board);
      if (w === 'draw') endRound('draw', null);
      else if (w != null) endRound(w, winLineOf(board));
      else {
        turn = 1 - turn;
        if (isBot() && turn === 1) botT = 0.45 + Math.random() * 0.35;
      }
    }

    function spawnWinFx(line, p) {
      const col = COL[p];
      const ax = ctrX(line[0]), ay = ctrY(line[0]);
      const bx = ctrX(line[2]), by = ctrY(line[2]);
      for (let k = 0; k < 26; k++) {
        const t = Math.random();
        const x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
        const a = Math.random() * TAU, v = 50 + Math.random() * 160;
        parts.push({
          x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60,
          t: 0, life: 0.5 + Math.random() * 0.4,
          col, sz: 2.5 + Math.random() * 3.5,
          rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 9,
        });
      }
      if (parts.length > 300) parts.splice(0, parts.length - 300);
    }

    function endRound(result, line) {
      phase = 'round';
      roundsDone++;
      if (result === 'draw') {
        draws++; score += 25;
        banner = { txt: 'DRAW', col: '#ffffff', t: 0 };
        Sfx.play('hit');
      } else {
        const p = result;
        if (p === 0) xWins++; else oWins++;
        score += 100;
        winLine = line; winP = p;
        banner = { txt: (p === 0 ? 'X' : 'O') + ' WINS!', col: COL[p], t: 0 };
        shakeT = 0.35;
        Sfx.play(isBot() && p === 1 ? 'lose' : 'win');
        spawnWinFx(line, p);
      }
      ctx.setScore(score);
      matchEnd = xWins >= 3 || oWins >= 3 || roundsDone >= 5;
      timer = matchEnd ? 1.9 : 1.55;
    }

    function finishMatch() {
      phase = 'over';
      const bonus = xWins > oWins ? 300 : xWins === oWins ? 100 : 0;
      score += bonus;
      ctx.setScore(score);
      let title;
      if (xWins === oWins) title = 'MATCH DRAWN';
      else if (isBot()) title = xWins > oWins ? 'YOU WIN THE MATCH!' : 'BOT WINS THE MATCH';
      else title = (xWins > oWins ? 'X' : 'O') + ' WINS THE MATCH!';
      Sfx.play(xWins === oWins ? 'tick' : (isBot() && oWins > xWins) ? 'lose' : 'win');
      ctx.gameOver({
        title,
        message: `${score} pts · rounds ${xWins}–${oWins}${draws ? ` · ${draws} drawn` : ''}`,
      });
    }

    /* ── input ──────────────────────────────────────── */
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
      if (c < 0 || c >= N || r < 0 || r >= N) return -1;
      return r * N + c;
    }
    const canPlay = () => phase === 'play' && !(isBot() && turn === 1);

    const onDown = e => {
      if (!canPlay()) return;
      const i = cellFromEvent(e);
      if (i < 0 || board[i] != null) return;
      if (e.cancelable) e.preventDefault();
      hover = i;
      placeMark(i, false);
    };
    const onMove = e => { hover = canPlay() ? cellFromEvent(e) : -1; };
    const onLeave = () => { hover = -1; };
    const onCancel = () => { hover = -1; };

    host.addEventListener('pointerdown', onDown);
    host.addEventListener('pointermove', onMove);
    host.addEventListener('pointerleave', onLeave);
    host.addEventListener('pointercancel', onCancel);

    const whenMenu = m => () => { if (phase === 'menu') start(m); };
    btnEasy.addEventListener('click', whenMenu('easy'));
    btnNormal.addEventListener('click', whenMenu('normal'));
    btnExpert.addEventListener('click', whenMenu('expert'));
    btnFriend.addEventListener('click', whenMenu('friend'));

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

    /* partial line: colour glow pass + white core pass */
    function seg(x1, y1, x2, y2, prog, col) {
      if (prog <= 0) return;
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x1 + (x2 - x1) * prog, y1 + (y2 - y1) * prog);
      g.lineWidth = 11;
      g.strokeStyle = col;
      g.shadowColor = col;
      g.shadowBlur = 16;
      g.stroke();
      g.lineWidth = 4.5;
      g.strokeStyle = 'rgba(255,255,255,.92)';
      g.shadowBlur = 0;
      g.stroke();
    }

    function drawMark(p, x, y, t, alpha) {
      g.save();
      g.globalAlpha = alpha;
      g.translate(x, y);
      g.lineCap = 'round';
      const col = COL[p], s = 31;
      if (p === 0) {
        seg(-s, -s, s, s, easeOutCubic(clamp(t / 0.5, 0, 1)), col);
        seg(s, -s, -s, s, easeOutCubic(clamp((t - 0.35) / 0.5, 0, 1)), col);
      } else if (t > 0) {
        const k = easeOutCubic(clamp(t / 0.85, 0, 1));
        g.beginPath();
        g.arc(0, 0, 30, -Math.PI / 2, -Math.PI / 2 + TAU * k);
        g.lineWidth = 11;
        g.strokeStyle = col;
        g.shadowColor = col;
        g.shadowBlur = 16;
        g.stroke();
        g.lineWidth = 4.5;
        g.strokeStyle = 'rgba(255,255,255,.92)';
        g.shadowBlur = 0;
        g.stroke();
      }
      g.restore();
    }

    function drawStatus(tSec) {
      g.textBaseline = 'middle';
      g.textAlign = 'left';
      g.font = '700 11px ' + FONT;
      g.fillStyle = 'rgba(255,255,255,.45)';
      g.fillText(MODE_LABEL[mode] || '', PAD, 24);

      g.textAlign = 'center';
      g.font = '700 11px ' + FONT;
      g.fillStyle = 'rgba(255,255,255,.32)';
      g.fillText('ROUND ' + Math.min(roundsDone + 1, 5) + '/5', W / 2, 24);

      g.textAlign = 'right';
      g.font = '900 14px ' + FONT;
      if (isBot() && turn === 1 && phase === 'play') {
        const dots = '.'.repeat(1 + (Math.floor(tSec * 3) % 3));
        g.fillStyle = CP;
        g.shadowColor = CP;
        g.shadowBlur = 10;
        g.fillText('BOT' + dots, W - PAD, 24);
      } else {
        g.globalAlpha = 0.72 + 0.28 * Math.sin(tSec * 5);
        g.fillStyle = COL[turn];
        g.shadowColor = COL[turn];
        g.shadowBlur = 12;
        g.fillText((turn === 0 ? 'X' : 'O') + ' TURN', W - PAD, 24);
        g.globalAlpha = 1;
      }
      g.shadowBlur = 0;
    }

    function drawTiles(tSec) {
      for (let i = 0; i < 9; i++) {
        const tl = tiles[i];
        if (!tl) continue;
        const k = clamp(tl.t / 0.34, 0, 1);
        const sc = k < 1 ? easeOutBack(k) : 1;
        let alpha = 1;
        if (phase === 'round' || phase === 'clear') {
          const dim = easeOutCubic(clamp(dimT / 0.6, 0, 1));
          if (winLine && winLine.indexOf(i) === -1) alpha = 1 - 0.62 * dim;
          else if (!winLine) alpha = 1 - 0.28 * dim;
        }
        const hovered = hover === i && canPlay() && board[i] == null;
        const x = tileX(i), y = tileY(i), size = 94, mid = 47;
        g.save();
        g.globalAlpha = alpha;
        g.translate(x + mid, y + mid);
        const pressK = 1 - tl.press * 0.07;
        g.scale(sc * pressK, sc * pressK);
        g.translate(-(x + mid), -(y + mid));
        rr(x, y, size, size, 16);
        g.fillStyle = hovered ? 'rgba(255,255,255,.075)' : 'rgba(255,255,255,.035)';
        g.fill();
        if (hovered) {
          g.fillStyle = COL[turn];
          g.globalAlpha = alpha * 0.1;
          g.fill();
          g.globalAlpha = alpha;
          g.strokeStyle = COL[turn];
          g.lineWidth = 1.5;
          g.shadowColor = COL[turn];
          g.shadowBlur = 14;
          g.stroke();
          g.shadowBlur = 0;
        }
        if (phase !== 'menu' && winLine && winLine.indexOf(i) !== -1 && winP >= 0) {
          rr(x, y, size, size, 16);
          g.fillStyle = COL[winP];
          g.globalAlpha = alpha * (0.08 + 0.06 * Math.sin(tSec * 6));
          g.fill();
        }
        g.restore();
      }
    }

    function drawWinLine() {
      if (!winLine) return;
      let alpha = 1;
      if (phase === 'clear') alpha = clamp(1 - (0.6 - timer) / 0.4, 0, 1);
      if (alpha <= 0) return;
      const k = easeOutCubic(clamp(winT / 0.55, 0, 1));
      if (k <= 0) return;
      const ax = ctrX(winLine[0]), ay = ctrY(winLine[0]);
      const bx = ctrX(winLine[2]), by = ctrY(winLine[2]);
      let dx = bx - ax, dy = by - ay;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len; dy /= len;
      const ex = 30;
      const sx = ax - dx * ex, sy = ay - dy * ex;
      const total = len + ex * 2;
      g.save();
      g.globalAlpha = alpha;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(sx, sy);
      g.lineTo(sx + dx * total * k, sy + dy * total * k);
      g.strokeStyle = COL[winP];
      g.lineWidth = 9;
      g.shadowColor = COL[winP];
      g.shadowBlur = 22;
      g.stroke();
      g.lineWidth = 3.5;
      g.strokeStyle = 'rgba(255,255,255,.95)';
      g.shadowBlur = 0;
      g.stroke();
      g.restore();
    }

    function drawBanner() {
      if (!banner) return;
      if (winLine && banner.t <= 0.4) return;      // wait for line sweep
      let alpha = 1;
      if (phase === 'clear') alpha = clamp(1 - (0.6 - timer) / 0.35, 0, 1);
      if (alpha <= 0) return;
      const k = clamp(banner.t / 0.3, 0, 1);
      const sc = k < 1 ? easeOutBack(k) : 1;
      g.save();
      g.globalAlpha = alpha;
      g.translate(W / 2, BY + N * CELL / 2);
      g.scale(sc, sc);
      rr(-100, -28, 200, 56, 15);
      g.fillStyle = 'rgba(4,6,15,.78)';
      g.fill();
      g.lineWidth = 1;
      g.strokeStyle = banner.col;
      g.globalAlpha = alpha * 0.5;
      g.stroke();
      g.globalAlpha = alpha;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = '900 30px ' + FONT;
      g.fillStyle = banner.col;
      g.shadowColor = banner.col;
      g.shadowBlur = 24;
      g.fillText(banner.txt, 0, 2);
      g.restore();
      g.globalAlpha = 1;
      g.shadowBlur = 0;
    }

    function drawStats() {
      const x = PAD, y = 362, w = W - PAD * 2, h = 56;
      rr(x, y, w, h, 14);
      g.fillStyle = 'rgba(10,12,28,.72)';
      g.fill();
      g.lineWidth = 1;
      g.strokeStyle = 'rgba(255,255,255,.10)';
      g.stroke();
      g.strokeStyle = 'rgba(255,255,255,.07)';
      for (const dx of [x + w / 3, x + 2 * w / 3]) {
        g.beginPath();
        g.moveTo(dx, y + 12);
        g.lineTo(dx, y + h - 12);
        g.stroke();
      }
      const cols = [
        { cx: x + w / 6, val: xWins, lab: 'X WINS', col: CX },
        { cx: x + w / 2, val: draws, lab: 'DRAWS', col: 'rgba(255,255,255,.55)' },
        { cx: x + 5 * w / 6, val: oWins, lab: 'O WINS', col: CP },
      ];
      g.textAlign = 'center';
      for (const c of cols) {
        g.font = '900 22px ' + FONT;
        g.fillStyle = '#ffffff';
        g.fillText(String(c.val), c.cx, y + 23);
        g.font = '700 9px ' + FONT;
        g.fillStyle = c.col;
        g.fillText(c.lab, c.cx, y + 43);
      }
    }

    function render(tSec) {
      const bg = g.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#0a0d1e');
      bg.addColorStop(1, '#131036');
      g.fillStyle = bg;
      g.fillRect(0, 0, W, H);

      g.save();
      if (shakeT > 0) {
        const m = shakeT * 15;
        g.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
      }

      drawStatus(tSec);

      /* board panel */
      rr(PAD - 12, BY - 12, N * CELL + 24, N * CELL + 24, 20);
      g.fillStyle = 'rgba(10,12,28,.66)';
      g.fill();
      g.lineWidth = 1.5;
      g.strokeStyle = 'rgba(0,229,255,.35)';
      g.shadowColor = '#00e5ff';
      g.shadowBlur = 18;
      g.stroke();
      g.shadowBlur = 0;

      drawTiles(tSec);

      /* hover ghost preview */
      if (hover >= 0 && canPlay() && board[hover] == null) {
        drawMark(turn, ctrX(hover), ctrY(hover), 1, 0.3);
      }

      /* placed marks */
      for (let i = 0; i < 9; i++) {
        const m = marks[i];
        if (m) drawMark(m.p, ctrX(i), ctrY(i), m.t, m.alpha);
      }

      drawWinLine();
      drawBanner();

      /* particles (additive sparkle) */
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

      g.restore();

      drawStats();

      const vg = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.85);
      vg.addColorStop(0, 'rgba(6,7,15,0)');
      vg.addColorStop(1, 'rgba(6,7,15,.42)');
      g.fillStyle = vg;
      g.fillRect(0, 0, W, H);
    }

    /* ── update ─────────────────────────────────────── */
    function update(dt, tSec) {
      if (phase === 'enter') {
        timer -= dt;
        if (timer <= 0) {
          phase = 'play';
          if (isBot() && turn === 1) botT = 0.45 + Math.random() * 0.35;
        }
      } else if (phase === 'play') {
        if (isBot() && turn === 1) {
          botT -= dt;
          if (botT <= 0) placeMark(BOTS[mode](board.slice()), true);
        }
      } else if (phase === 'round') {
        timer -= dt;
        winT = Math.min(1.4, winT + dt);
        dimT = Math.min(1.4, dimT + dt);
        if (timer <= 0) {
          if (matchEnd) finishMatch();
          else { phase = 'clear'; timer = 0.6; }
        }
      } else if (phase === 'clear') {
        timer -= dt;
        if (timer <= 0) {
          resetBoard(true);
          phase = 'enter';
          timer = 0.6;
        }
      }

      for (let i = 0; i < 9; i++) {
        const tl = tiles[i];
        if (tl) {
          if (tl.t < 1) tl.t += dt;
          if (tl.press > 0) tl.press = Math.max(0, tl.press - dt * 4);
        }
        const m = marks[i];
        if (m && m.t < 1) m.t = Math.min(1, m.t + dt / 0.36);
        /* staggered fade-out during clear */
        if (m && phase === 'clear') {
          const cp = 0.6 - timer;
          m.alpha = 1 - clamp((cp - i * 0.045) / 0.28, 0, 1);
        }
      }

      if (banner && (phase === 'round' || phase === 'clear')) banner.t += dt;

      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.t += dt;
        if (p.t >= p.life) { parts.splice(i, 1); continue; }
        p.vy += 380 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
      }

      if (shakeT > 0) shakeT = Math.max(0, shakeT - dt);
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
    resetBoard(false);              // idle decorative board behind the menu
    resize();
    ctx.setScore(0);
    raf = requestAnimationFrame(loop);

    return {
      pause() { paused = true; },
      resume() { paused = false; last = 0; },
      restart() { start(mode || 'easy'); },
      resize(w, h) { resize(w, h); },
      destroy() {
        alive = false;
        cancelAnimationFrame(raf);
        host.removeEventListener('pointerdown', onDown);
        host.removeEventListener('pointermove', onMove);
        host.removeEventListener('pointerleave', onLeave);
        host.removeEventListener('pointercancel', onCancel);
        host.classList.remove('ttt-host');
        host.innerHTML = '';
      },
    };
  },
});
