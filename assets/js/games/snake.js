/* ═══════════════════════════════════════════════════════
   NEON SNAKE — classic walls-collide snake on a glowing 26×26 grid
   Steer with arrows/WASD · swipe or tap on touch · speed ramps as you eat
   ═══════════════════════════════════════════════════════ */
registerGame({
  id: 'snake',
  title: 'Snake',
  genre: 'Arcade',
  emoji: '🐍',
  colors: ['#39ff88', '#ff2ecd'],
  description: 'Gobble neon apples, ramp the speed and outgrow yourself — one wrong turn ends the run. Classic walls-collide snake on a glowing grid.',
  featured: true,
  controls: [
    { key: 'ARROWS / WASD', label: 'Steer the snake' },
    { key: 'SWIPE / TAP', label: 'Turn on touch' },
    { key: 'SPACE', label: 'Start the run' },
  ],
  create(ctx) {
    'use strict';

    const host = ctx.container;
    host.classList.add('gsnk-host');

    /* ── constants ─────────────────────────────────── */
    const FONT = 'Orbitron, system-ui, sans-serif';
    const TAU = Math.PI * 2;
    const COLS = 26, ROWS = 26;
    const START_LEN = 4;
    const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

    /* ── sizing (fixed logical grid, re-centred on resize) ── */
    let W = ctx.width || host.clientWidth || 900;
    let H = ctx.height || host.clientHeight || 640;
    let cell = 24, bx = 0, by = 0;               // board origin + cell px
    function layout() {
      cell = Math.max(8, Math.floor(Math.min(W, H) / ROWS));
      const bw = cell * COLS;
      bx = Math.round((W - bw) / 2);
      by = Math.round((H - bw) / 2);
    }

    /* ── state ─────────────────────────────────────── */
    let phase = 'menu';                           // menu | play | over
    let paused = false, alive = true, overCalled = false;
    let score = 0, apples = 0, ticks = 0;
    let acc = 0;
    let dir = { x: 1, y: 0 }, nextDir = null;
    let snake = [], food = { x: 20, y: 13 };
    let shakeT = 0, flashT = 0, eatFlashT = 0, pulseT = 0;
    const parts = [];
    const floaters = [];
    const intervalMs = () => clamp(155 - apples * 3.5, 75, 155);
    const head = () => snake[0];

    /* ── canvas + DOM ──────────────────────────────── */
    const canvas = document.createElement('canvas');
    host.appendChild(canvas);
    const g = canvas.getContext('2d');

    const menu = document.createElement('div');
    menu.className = 'gsnk-menu';
    const menuIn = document.createElement('div');
    menuIn.className = 'gsnk-menu__in';
    const mTitle = document.createElement('h3');
    mTitle.textContent = 'SNAKE';
    const mHint = document.createElement('p');
    mHint.textContent = 'Gobble every neon apple · the grid speeds up as you grow · walls and your own tail end the run.';
    const btnPlay = document.createElement('button');
    btnPlay.className = 'gsnk-play';
    btnPlay.textContent = '▶ PLAY';
    const tips = document.createElement('div');
    tips.className = 'gsnk-tips';
    ['WALLS = DEATH', 'SPEED RAMP', 'ENDLESS'].forEach(t => {
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

    /* touch D-pad (hidden on fine pointers by CSS) */
    const dpad = document.createElement('div');
    dpad.className = 'gsnk-dpad';
    const dUp = document.createElement('button');
    dUp.className = 'gsnk-dir gsnk-up';
    dUp.textContent = '▲';
    const dLeft = document.createElement('button');
    dLeft.className = 'gsnk-dir gsnk-left';
    dLeft.textContent = '◀';
    const dRight = document.createElement('button');
    dRight.className = 'gsnk-dir gsnk-right';
    dRight.textContent = '▶';
    const dDown = document.createElement('button');
    dDown.className = 'gsnk-dir gsnk-down';
    dDown.textContent = '▼';
    dpad.appendChild(dUp);
    dpad.appendChild(dLeft);
    dpad.appendChild(dRight);
    dpad.appendChild(dDown);
    host.appendChild(dpad);

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

    /* ── world ─────────────────────────────────────── */
    function occupied(x, y) {
      for (const s of snake) if (s.x === x && s.y === y) return true;
      return false;
    }

    function spawnFood() {
      const free = [];
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) if (!occupied(x, y)) free.push({ x, y });
      }
      if (!free.length) { food = { x: -1, y: -1 }; return; }   // fully packed (unreachable)
      food = free[Math.floor(Math.random() * free.length)];
    }

    function reset() {
      const cy = Math.floor(ROWS / 2), cx = Math.floor(COLS / 2);
      snake = [];
      for (let i = 0; i < START_LEN; i++) snake.push({ x: cx - i, y: cy });
      dir = { x: 1, y: 0 };
      nextDir = null;
      score = 0; apples = 0; ticks = 0; acc = 0;
      shakeT = 0; flashT = 0; eatFlashT = 0;
      parts.length = 0; floaters.length = 0;
      overCalled = false;
      spawnFood();
      ctx.setScore(0);
    }

    function startRun() {
      reset();
      phase = 'play';
      menu.classList.add('is-out');
      Sfx.play('start');
    }

    function setDir(d) {
      if (phase !== 'play') return;
      if (d.x === -dir.x && d.y === -dir.y) return;   // no reversal into the neck
      nextDir = d;
    }

    function die() {
      if (overCalled) return;
      overCalled = true;
      phase = 'over';
      shakeT = 0.5;
      flashT = 0.7;
      const h = head();
      burst(bx + (h.x + 0.5) * cell, by + (h.y + 0.5) * cell, '#ff3b5c', 24);
      float(bx + (h.x + 0.5) * cell, by + h.y * cell, 'BUST!', '#ff3b5c', 1);
      Sfx.play('hit');
      Sfx.play('lose');
      ctx.gameOver({
        title: 'GAME OVER',
        message: `Score ${score} · ${apples} apples`,
      });
    }

    function step() {
      if (nextDir) { dir = nextDir; nextDir = null; }
      const h = head();
      const nx = h.x + dir.x, ny = h.y + dir.y;
      ticks++;

      /* wall */
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) { die(); return; }

      const willGrow = nx === food.x && ny === food.y;
      /* self — tail cell is free unless it stays (growing) */
      const body = willGrow ? snake : snake.slice(0, -1);
      for (const s of body) if (s.x === nx && s.y === ny) { die(); return; }

      snake.unshift({ x: nx, y: ny });
      if (willGrow) {
        apples++;
        const pts = 10;
        score += pts;
        ctx.setScore(score);
        const px = bx + (nx + 0.5) * cell, py = by + (ny + 0.5) * cell;
        burst(px, py, '#ff8a3d', 10);
        float(px, py - cell * 0.4, '+' + pts, '#ffd23c', 0.8);
        eatFlashT = 0.35;
        if (apples % 5 === 0) {
          score += 50;
          ctx.setScore(score);
          burst(px, py, '#ffd23c', 20);
          float(px, py - cell, '+50 MILESTONE', '#ffd23c', 1.2);
          Sfx.play('power');
        } else {
          Sfx.play('coin');
        }
        spawnFood();
      } else {
        snake.pop();
      }
    }

    /* ── input ─────────────────────────────────────── */
    const toGameX = cx => {
      const r = canvas.getBoundingClientRect();
      return (cx - (r.left || 0)) * (W / (r.width || W));
    };
    const toGameY = cy => {
      const r = canvas.getBoundingClientRect();
      return (cy - (r.top || 0)) * (H / (r.height || H));
    };

    let sw = null;
    const onPD = e => {
      if (e.cancelable && e.preventDefault) e.preventDefault();
      if (typeof e.clientX === 'number') sw = { x: e.clientX, y: e.clientY };
    };
    const onPU = e => {
      if (!sw || typeof e.clientX !== 'number') { sw = null; return; }
      const dx = toGameX(e.clientX) - toGameX(sw.x);
      const dy = toGameY(e.clientY) - toGameY(sw.y);
      sw = null;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) {
        /* tap → steer toward the tap from the head */
        const h = head();
        const tx = dx, ty = dy;
        if (Math.abs(tx) < 4 && Math.abs(ty) < 4) return;
        if (Math.abs(tx) >= Math.abs(ty)) setDir({ x: Math.sign(tx), y: 0 });
        else setDir({ x: 0, y: Math.sign(ty) });
      } else if (Math.abs(dx) >= Math.abs(dy)) setDir({ x: Math.sign(dx), y: 0 });
      else setDir({ x: 0, y: Math.sign(dy) });
    };
    const onPC = () => { sw = null; };

    const onKeyD = e => {
      switch (e.code) {
        case 'ArrowUp': case 'KeyW': setDir({ x: 0, y: -1 }); break;
        case 'ArrowDown': case 'KeyS': setDir({ x: 0, y: 1 }); break;
        case 'ArrowLeft': case 'KeyA': setDir({ x: -1, y: 0 }); break;
        case 'ArrowRight': case 'KeyD': setDir({ x: 1, y: 0 }); break;
        case 'Space': case 'Enter':
          if (e.preventDefault) e.preventDefault();
          if (phase === 'menu') startRun();
          return;
        default: return;
      }
      if (e.preventDefault) e.preventDefault();
    };

    host.addEventListener('pointerdown', onPD);
    host.addEventListener('pointerup', onPU);
    host.addEventListener('pointercancel', onPC);
    window.addEventListener('keydown', onKeyD);
    const dpadBind = (btn, d) => btn.addEventListener('pointerdown', e => {
      if (e.stopPropagation) e.stopPropagation();
      if (e.cancelable && e.preventDefault) e.preventDefault();
      setDir(d);
    });
    dpadBind(dUp, { x: 0, y: -1 });
    dpadBind(dDown, { x: 0, y: 1 });
    dpadBind(dLeft, { x: -1, y: 0 });
    dpadBind(dRight, { x: 1, y: 0 });
    btnPlay.addEventListener('click', () => { if (phase === 'menu') startRun(); });

    /* ── resize ────────────────────────────────────── */
    function resize(w, h) {
      W = Math.max(260, Math.round(w || host.clientWidth || W));
      H = Math.max(260, Math.round(h || host.clientHeight || H));
      layout();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    /* ── update ────────────────────────────────────── */
    function update(dt) {
      if (paused) return;
      if (shakeT > 0) shakeT = Math.max(0, shakeT - dt);
      if (flashT > 0) flashT = Math.max(0, flashT - dt * 1.4);
      if (eatFlashT > 0) eatFlashT = Math.max(0, eatFlashT - dt * 2.4);
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
      acc += dt;
      const iv = intervalMs() / 1000;
      let guard = 0;
      while (acc >= iv && guard++ < 4) {
        acc -= iv;
        step();
        if (phase !== 'play') break;
      }
    }

    /* ── render ────────────────────────────────────── */
    function drawBg() {
      const bg = g.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#06070f');
      bg.addColorStop(0.55, '#080a18');
      bg.addColorStop(1, '#0b0d24');
      g.fillStyle = bg;
      g.fillRect(0, 0, W, H);
      const hz = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.7);
      hz.addColorStop(0, 'rgba(57,255,136,.06)');
      hz.addColorStop(1, 'rgba(57,255,136,0)');
      g.fillStyle = hz;
      g.fillRect(0, 0, W, H);
    }

    function drawBoard() {
      const bw = cell * COLS;
      /* panel */
      g.fillStyle = 'rgba(4,6,14,.9)';
      rr(bx - 6, by - 6, bw + 12, bw + 12, 14);
      g.fill();
      /* checker tint */
      g.fillStyle = 'rgba(255,255,255,.014)';
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          if ((x + y) & 1) { g.fillRect(bx + x * cell, by + y * cell, cell, cell); }
        }
      }
      /* grid lines */
      g.strokeStyle = 'rgba(255,255,255,.035)';
      g.lineWidth = 1;
      g.beginPath();
      for (let i = 1; i < COLS; i++) {
        g.moveTo(bx + i * cell + 0.5, by);
        g.lineTo(bx + i * cell + 0.5, by + bw);
      }
      for (let i = 1; i < ROWS; i++) {
        g.moveTo(bx, by + i * cell + 0.5);
        g.lineTo(bx + bw, by + i * cell + 0.5);
      }
      g.stroke();
      /* neon frame — flashes on eat, reddens on death */
      const eat = eatFlashT > 0 ? eatFlashT : 0;
      g.strokeStyle = flashT > 0
        ? 'rgba(255,59,92,' + Math.min(1, flashT * 1.6) + ')'
        : eat > 0
          ? 'rgba(57,255,136,' + Math.min(1, eat * 2.6) + ')'
          : 'rgba(0,240,255,.55)';
      g.shadowColor = flashT > 0 ? '#ff3b5c' : eat > 0 ? '#39ff88' : '#00f0ff';
      g.shadowBlur = 14 + eat * 30;
      g.lineWidth = 2;
      rr(bx - 6, by - 6, bw + 12, bw + 12, 14);
      g.stroke();
      g.shadowBlur = 0;
      /* corner pips */
      g.fillStyle = 'rgba(0,240,255,.9)';
      const cp = 3;
      for (const [cx2, cy2] of [[bx - 6, by - 6], [bx + bw + 6, by - 6], [bx - 6, by + bw + 6], [bx + bw + 6, by + bw + 6]]) {
        g.beginPath();
        g.arc(cx2, cy2, cp, 0, TAU);
        g.fill();
      }
    }

    function drawFood() {
      if (food.x < 0) return;
      const px = bx + (food.x + 0.5) * cell;
      const bob = Math.sin(pulseT * 3.2) * cell * 0.06;
      const py = by + (food.y + 0.5) * cell + bob;
      const r = cell * 0.32;
      const beat = 1 + Math.sin(pulseT * 6.4) * 0.06;
      g.save();
      g.translate(px, py);
      g.scale(beat, beat);
      /* glow */
      const gl = g.createRadialGradient(0, 0, r * 0.4, 0, 0, r * 2.1);
      gl.addColorStop(0, 'rgba(255,59,92,.5)');
      gl.addColorStop(1, 'rgba(255,59,92,0)');
      g.fillStyle = gl;
      g.beginPath();
      g.arc(0, 0, r * 2.1, 0, TAU);
      g.fill();
      /* apple */
      const body = g.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.15, 0, 0, r);
      body.addColorStop(0, '#ff8a9a');
      body.addColorStop(0.55, '#ff3b5c');
      body.addColorStop(1, '#c4123c');
      g.fillStyle = body;
      g.beginPath();
      g.arc(0, r * 0.08, r, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(6,7,15,.5)';
      g.lineWidth = 1;
      g.stroke();
      /* shine */
      g.fillStyle = 'rgba(255,255,255,.75)';
      g.beginPath();
      g.arc(-r * 0.34, -r * 0.3, r * 0.2, 0, TAU);
      g.fill();
      /* stem + leaf */
      g.strokeStyle = '#7a4a1f';
      g.lineWidth = Math.max(1.5, cell * 0.07);
      g.beginPath();
      g.moveTo(0, -r * 0.85);
      g.quadraticCurveTo(r * 0.1, -r * 1.3, -r * 0.05, -r * 1.5);
      g.stroke();
      g.fillStyle = '#39ff88';
      g.beginPath();
      g.ellipse(r * 0.32, -r * 1.25, r * 0.34, r * 0.16, -0.5, 0, TAU);
      g.fill();
      g.restore();
    }

    function drawSnake() {
      const n = snake.length;
      const gap = Math.max(1, cell * 0.09);
      const s = cell - gap * 2;
      /* tail → head so the head paints on top */
      for (let i = n - 1; i >= 0; i--) {
        const seg = snake[i];
        const t = n > 1 ? i / (n - 1) : 0;
        const px = bx + seg.x * cell + gap;
        const py = by + seg.y * cell + gap;
        const hue = 150 + t * 40;                 // head lime → tail teal
        const lit = 62 - t * 26;
        g.save();
        g.shadowColor = i === 0 ? '#39ff88' : `hsl(${hue},90%,50%)`;
        g.shadowBlur = i === 0 ? cell * 0.7 : cell * 0.3;
        g.fillStyle = i === 0 ? '#4dff9a' : `hsl(${hue},85%,${lit}%)`;
        rr(px, py, s, s, cell * 0.3);
        g.fill();
        g.shadowBlur = 0;
        /* segment inner shade */
        g.fillStyle = 'rgba(6,7,15,.22)';
        rr(px + s * 0.18, py + s * 0.5, s * 0.64, s * 0.34, s * 0.17);
        g.fill();
        /* scale dots on every other segment */
        if (i > 0 && i % 2 === 0) {
          g.fillStyle = 'rgba(255,255,255,.3)';
          g.beginPath();
          g.arc(px + s / 2, py + s / 2, Math.max(1, s * 0.1), 0, TAU);
          g.fill();
        }
        g.restore();
      }
      /* head detail: eyes + brow */
      const h = snake[0];
      const hx = bx + h.x * cell + gap, hy = by + h.y * cell + gap;
      const fwd = { x: dir.x * s * 0.18, y: dir.y * s * 0.18 };
      const perp = { x: -dir.y * s * 0.2, y: dir.x * s * 0.2 };
      for (const side of [1, -1]) {
        const ex = hx + s / 2 + fwd.x + perp.x * side;
        const ey = hy + s / 2 + fwd.y + perp.y * side;
        const er = Math.max(2, s * 0.16);
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.arc(ex, ey, er, 0, TAU);
        g.fill();
        g.fillStyle = '#06070f';
        g.beginPath();
        g.arc(ex + dir.x * er * 0.4, ey + dir.y * er * 0.4, er * 0.55, 0, TAU);
        g.fill();
      }
    }

    function drawParts() {
      for (const p of parts) {
        const k = Math.max(0, 1 - p.t / p.life);
        g.globalAlpha = k;
        g.fillStyle = p.col;
        g.fillRect(p.x - p.sz / 2, p.y - p.sz / 2, p.sz, p.sz);
      }
      g.globalAlpha = 1;
    }

    function drawFloaters() {
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
    }

    function drawSpeedBar() {
      /* slim speed gauge under the board when there is room */
      const bw = cell * COLS;
      const y = by + bw + 18;
      if (y > H - 8) return;
      const w = Math.min(240, bw * 0.5);
      const x = Math.round((W - w) / 2);
      const k = clamp((155 - intervalMs()) / 80, 0.06, 1);
      g.fillStyle = 'rgba(255,255,255,.08)';
      rr(x, y, w, 5, 3);
      g.fill();
      const gr = g.createLinearGradient(x, 0, x + w, 0);
      gr.addColorStop(0, '#39ff88');
      gr.addColorStop(0.6, '#00f0ff');
      gr.addColorStop(1, '#ff2ecd');
      g.fillStyle = gr;
      g.shadowColor = '#00f0ff';
      g.shadowBlur = 8;
      rr(x, y, Math.max(6, w * k), 5, 3);
      g.fill();
      g.shadowBlur = 0;
      g.textAlign = 'center';
      g.font = '700 9px ' + FONT;
      g.fillStyle = 'rgba(255,255,255,.45)';
      g.fillText('SPEED', x + w / 2, y + 16);
      g.textAlign = 'left';
    }

    function render() {
      g.save();
      if (shakeT > 0) {
        const m = shakeT * 9;
        g.translate((Math.random() - 0.5) * 2 * m, (Math.random() - 0.5) * 2 * m);
      }
      drawBg();
      drawBoard();
      drawFood();
      drawSnake();
      drawParts();
      drawFloaters();
      drawSpeedBar();
      if (flashT > 0) {
        g.fillStyle = 'rgba(255,59,92,' + flashT * 0.4 + ')';
        g.fillRect(0, 0, W, H);
      }
      g.restore();
    }

    /* ── boot ──────────────────────────────────────── */
    reset();
    layout();
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
      pause() { paused = true; },
      resume() { paused = false; last = 0; },
      restart() { paused = false; last = 0; startRun(); },
      resize(w, h) { resize(w, h); },
      destroy() {
        alive = false;
        cancelAnimationFrame(raf);
        host.removeEventListener('pointerdown', onPD);
        host.removeEventListener('pointerup', onPU);
        host.removeEventListener('pointercancel', onPC);
        window.removeEventListener('keydown', onKeyD);
        if (menu.parentNode) menu.parentNode.removeChild(menu);
        if (dpad.parentNode) dpad.parentNode.removeChild(dpad);
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        host.classList.remove('gsnk-host');
      },
      getState() {
        return {
          phase, score, apples, ticks, len: snake.length,
          ms: Math.round(intervalMs()),
          cols: COLS, rows: ROWS, cell, bx, by,
          hx: snake[0].x, hy: snake[0].y,
          dx: dir.x, dy: dir.y,
          foodX: food.x, foodY: food.y,
          W, H,
          snake: snake.map(s => ({ x: s.x, y: s.y })),
        };
      },
    };
  },
});
