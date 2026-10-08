/* ═══════════════════════════════════════════════════════
   NEON BREAKOUT — endless brick-shattering arcade (canvas 2D)
   Slide the paddle · chain volleys into combos · catch power-ups
   ═══════════════════════════════════════════════════════ */
registerGame({
  id: 'breakout',
  title: 'Breakout',
  genre: 'Arcade',
  emoji: '🧱',
  colors: ['#ff2ecd', '#00f0ff'],
  description: 'Smash neon brick walls, chain volleys into combo multipliers and snag falling power-ups — endless levels climb in speed and steel.',
  featured: true,
  controls: [
    { key: 'MOUSE / DRAG', label: 'Slide the paddle' },
    { key: 'SPACE', label: 'Launch the ball' },
    { key: '← →', label: 'Fine-steer with keys' },
  ],
  create(ctx) {
    'use strict';

    const host = ctx.container;
    host.classList.add('gbrk-host');

    /* ── world constants ───────────────────────────── */
    const FONT = 'Orbitron, system-ui, sans-serif';
    const TAU = Math.PI * 2;
    const ROWCOLS = ['#ff2ecd', '#7c5cff', '#00f0ff', '#39ff88', '#ffd23c', '#ff8a3d'];
    const DROP_TYPES = ['expand', 'multi', 'life'];
    const MAX_ANG = 1.05;                    // 60° deflection at paddle edges
    const MIN_ANG = 0.2;                     // never dead-vertical (stall-proof)
    const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
    const easeOutBack = t => {
      const c = 1.70158;
      return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
    };

    /* ── sizing — everything derives from live W/H ─── */
    let W = ctx.width || host.clientWidth || 900;
    let H = ctx.height || host.clientHeight || 700;
    const ballR = () => clamp(Math.round(W * 0.0075), 6, 10);
    const baseWFor = () => clamp(W * 0.15, 64, 130);
    const paddleHFor = () => clamp(H * 0.024, 12, 17);
    const hudH = () => clamp(H * 0.1, 52, 76);
    const ballSpeed = () => Math.min(760, 430 + (level - 1) * 45);

    /* ── state ─────────────────────────────────────── */
    let phase = 'menu';                       // menu | serve | play | levelup | over
    let paused = false, alive = true, overCalled = false;
    let level = 1, lives = 3, score = 0;
    let combo = 1, hits = 0, destroyed = 0, caught = 0;
    let shakeT = 0, flash = 0, bannerT = 0, expandT = 0;
    let keyL = false, keyR = false;
    const balls = [];
    const bricks = [];
    const drops = [];
    const parts = [];
    const floaters = [];
    const paddle = {
      x: W / 2, y: H - 54, aim: W / 2,
      w: baseWFor(), h: paddleHFor(), baseW: baseWFor(),
    };

    /* ── canvas + menu DOM ─────────────────────────── */
    const canvas = document.createElement('canvas');
    host.appendChild(canvas);
    const g = canvas.getContext('2d');

    const menu = document.createElement('div');
    menu.className = 'gbrk-menu';
    const menuIn = document.createElement('div');
    menuIn.className = 'gbrk-menu__in';
    const mTitle = document.createElement('h3');
    mTitle.textContent = 'BREAKOUT';
    const mHint = document.createElement('p');
    mHint.textContent = 'Smash every brick · chain volleys for combo multipliers · catch the falling power-ups.';
    const btnPlay = document.createElement('button');
    btnPlay.className = 'gbrk-play';
    btnPlay.textContent = '▶ PLAY';
    const tips = document.createElement('div');
    tips.className = 'gbrk-tips';
    ['3 LIVES', '×5 CHAIN', 'ENDLESS LEVELS'].forEach(t => {
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

    function shade(hex, amt) {
      const n = parseInt(hex.slice(1), 16);
      let r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255;
      r = clamp(Math.round(r + 255 * amt), 0, 255);
      gg = clamp(Math.round(gg + 255 * amt), 0, 255);
      b = clamp(Math.round(b + 255 * amt), 0, 255);
      return 'rgb(' + r + ',' + gg + ',' + b + ')';
    }

    function burst(x, y, col, n) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU, v = 80 + Math.random() * 220;
        parts.push({
          kind: 'shard', x, y,
          vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60,
          rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 14,
          t: 0, life: 0.5 + Math.random() * 0.45,
          col, sz: 2.5 + Math.random() * 3.5,
        });
      }
    }

    function sparks(x, y, col) {
      for (let i = 0; i < 7; i++) {
        const a = Math.random() * TAU, v = 60 + Math.random() * 160;
        parts.push({
          kind: 'spark', x, y,
          vx: Math.cos(a) * v, vy: Math.sin(a) * v,
          t: 0, life: 0.28 + Math.random() * 0.2, col, sz: 1.6 + Math.random() * 2,
        });
      }
    }

    function float(x, y, txt, col, life) {
      floaters.push({ x, y, txt, col, t: 0, life: life || 0.9 });
    }

    /* ── level construction ────────────────────────── */
    function buildLevel(lv) {
      bricks.length = 0;
      const margin = Math.max(10, W * 0.045);
      const usable = W - margin * 2;
      const gap = 7;
      const cols = clamp(Math.round(usable / 95), 6, 13);
      const rowsWant = 5 + Math.min(lv - 1, 3);
      const bw = (usable - gap * (cols - 1)) / cols;
      const bh = clamp(H * 0.034, 20, 30);
      const top = hudH() + 3 * ballR() + 8;
      const maxRows = Math.max(3, Math.floor((paddle.y - 16 - top) / (bh + gap)));
      const rows = Math.min(rowsWant, maxRows);
      for (let r0 = 0; r0 < rows; r0++) {
        for (let c = 0; c < cols; c++) {
          const armed = r0 === 0;               // steel top row: two hits
          bricks.push({
            x: margin + c * (bw + gap),
            y: top + r0 * (bh + gap),
            w: bw, h: bh, row: r0, col: c,
            hp: armed ? 2 : 1, maxHp: armed ? 2 : 1,
            col_hex: ROWCOLS[r0 % ROWCOLS.length],
            value: (rows - r0) * 20,
            hitT: 0,
          });
        }
      }
    }

    function makeBall() {
      const r = ballR();
      return { x: paddle.x, y: paddle.y - r - 3, vx: 0, vy: 0, r, trail: [] };
    }

    function serve() {
      balls.length = 0;
      balls.push(makeBall());
      combo = 1;
      phase = 'serve';
    }

    function launch() {
      if (phase !== 'serve' || !balls.length) return;
      const b = balls[0];
      const ang = 0.3 + Math.random() * 0.5;     // always diagonal
      const sp = ballSpeed();
      b.vx = sp * Math.sin(ang);
      b.vy = -sp * Math.cos(ang);
      phase = 'play';
      Sfx.play('jump');
    }

    function startRun() {
      level = 1; lives = 3; score = 0; combo = 1;
      hits = 0; destroyed = 0; caught = 0;
      expandT = 0; overCalled = false;
      shakeT = 0; flash = 0; bannerT = 0;
      drops.length = 0; parts.length = 0; floaters.length = 0;
      paddle.x = W / 2; paddle.aim = W / 2;
      paddle.baseW = baseWFor();
      paddle.w = paddle.baseW;
      ctx.setScore(0);
      buildLevel(1);
      serve();
      menu.classList.add('is-out');
      Sfx.play('start');
    }

    /* ── gameplay events ───────────────────────────── */
    function paddleHit(b) {
      const off = clamp((b.x - paddle.x) / (paddle.w / 2), -1, 1);
      let ang = off * MAX_ANG;
      if (Math.abs(ang) < MIN_ANG) ang = MIN_ANG * (b.vx >= 0 ? 1 : -1);
      const sp = ballSpeed();
      b.vx = sp * Math.sin(ang);
      b.vy = -sp * Math.cos(ang);
      b.y = paddle.y - b.r - 0.5;
      combo = 1;
      Sfx.play('click');
      sparks(b.x, paddle.y, '#00f0ff');
    }

    function spawnDrop(br) {
      const type = DROP_TYPES[Math.floor((destroyed - 1) / 11) % 3];
      drops.push({ x: br.x + br.w / 2, y: br.y + br.h / 2, type, t: 0 });
    }

    function applyDrop(d) {
      caught++;
      Sfx.play('power');
      if (d.type === 'expand') {
        expandT = Math.min(20, expandT + 11);
        float(paddle.x, paddle.y - 30, 'WIDE!', '#00f0ff', 1);
      } else if (d.type === 'multi') {
        const src = balls[0];
        if (src) {
          for (const a of [0.42, -0.42]) {
            if (balls.length >= 5) break;
            const c = Math.cos(a), s = Math.sin(a);
            balls.push({
              x: src.x, y: src.y,
              vx: src.vx * c - src.vy * s,
              vy: src.vx * s + src.vy * c,
              r: src.r, trail: [],
            });
          }
        }
        float(paddle.x, paddle.y - 30, 'MULTI!', '#ff2ecd', 1);
      } else {
        lives = Math.min(6, lives + 1);
        float(paddle.x, paddle.y - 30, '+1 LIFE', '#39ff88', 1.1);
      }
    }

    function levelClear() {
      phase = 'levelup';
      bannerT = 0;
      const bonus = level * 500;
      score += bonus;
      ctx.setScore(score);
      drops.length = 0;
      expandT = 0;
      float(W / 2, H * 0.55, '+' + bonus, '#ffd23c', 1.4);
      Sfx.play('win');
    }

    function loseBall(idx) {
      balls.splice(idx, 1);
      if (balls.length) return;
      lives--;
      combo = 1;
      shakeT = 0.5;
      flash = 0.35;
      Sfx.play('hit');
      float(W / 2, H * 0.55, '−1 LIFE', '#ff3b5c', 1.1);
      if (lives <= 0) gameOver();
      else serve();
    }

    function gameOver() {
      if (overCalled) return;
      overCalled = true;
      phase = 'over';
      Sfx.play('lose');
      ctx.gameOver({
        title: 'GAME OVER',
        message: `Level ${level} · ${destroyed} bricks smashed`,
      });
    }

    function hitBrick(b, br) {
      hits++;
      br.hitT = 0.18;
      if (br.hp > 1) {
        br.hp--;
        score += 10;
        ctx.setScore(score);
        Sfx.play('tick');
        float(br.x + br.w / 2, br.y, '+10', '#cfe6ff', 0.7);
        burst(br.x + br.w / 2, br.y + br.h / 2, '#cfe6ff', 4);
        shakeT = Math.max(shakeT, 0.1);
        return;
      }
      /* destroyed */
      br.hp = 0;
      destroyed++;
      const pts = br.value * combo;
      score += pts;
      ctx.setScore(score);
      float(br.x + br.w / 2, br.y, '+' + pts, br.col_hex, 0.9);
      burst(br.x + br.w / 2, br.y + br.h / 2, br.col_hex, 9);
      shakeT = Math.max(shakeT, 0.08);
      if (combo >= 5) Sfx.play('power');
      else Sfx.play('coin');
      if (combo < 5) combo++;
      if (destroyed % 11 === 0) spawnDrop(br);
      for (const x of bricks) if (x.hp > 0) return;
      if (phase === 'play') levelClear();
    }

    /* ── input ─────────────────────────────────────── */
    const toWorld = cx => {
      const r = canvas.getBoundingClientRect();
      const rw = r.width || W;
      return (cx - (r.left || 0)) * (W / rw);
    };
    const clampAim = v => clamp(v, paddle.w / 2 + 2, W - paddle.w / 2 - 2);

    const onMove = e => {
      if (typeof e.clientX !== 'number') return;
      paddle.aim = clampAim(toWorld(e.clientX));
    };
    const onDown = e => {
      if (e.cancelable && e.preventDefault) e.preventDefault();
      if (typeof e.clientX === 'number') paddle.aim = clampAim(toWorld(e.clientX));
      if (phase === 'serve') launch();
    };
    const onKeyD = e => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        keyL = true;
        if (e.preventDefault) e.preventDefault();
      } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        keyR = true;
        if (e.preventDefault) e.preventDefault();
      } else if (e.code === 'Space' || e.code === 'Enter') {
        if (e.preventDefault) e.preventDefault();
        if (phase === 'menu') startRun();
        else if (phase === 'serve') launch();
      }
    };
    const onKeyU = e => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') keyL = false;
      else if (e.code === 'ArrowRight' || e.code === 'KeyD') keyR = false;
    };

    host.addEventListener('pointermove', onMove);
    host.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKeyD);
    window.addEventListener('keyup', onKeyU);
    btnPlay.addEventListener('click', () => { if (phase === 'menu') startRun(); });

    /* ── resize ────────────────────────────────────── */
    function resize(w, h) {
      w = Math.max(260, Math.round(w || host.clientWidth || W));
      h = Math.max(260, Math.round(h || host.clientHeight || H));
      const sx = W ? w / W : 1, sy = H ? h / H : 1;
      W = w; H = h;
      if (sx !== 1 || sy !== 1) {
        paddle.baseW = baseWFor();
        paddle.h = paddleHFor();
        paddle.y = H - 54;
        paddle.w = paddle.baseW * (expandT > 0 ? 1.45 : 1);
        paddle.x = clamp(paddle.x * sx, paddle.w / 2 + 2, W - paddle.w / 2 - 2);
        paddle.aim = paddle.x;
        const r = ballR();
        for (const b of balls) {
          b.x *= sx; b.y *= sy; b.r = r;
          for (const tr of b.trail) { tr.x *= sx; tr.y *= sy; }
        }
        for (const br of bricks) { br.x *= sx; br.y *= sy; br.w *= sx; br.h *= sy; }
        for (const d of drops) { d.x *= sx; d.y *= sy; }
        for (const p of parts) { p.x *= sx; p.y *= sy; }
        for (const f of floaters) { f.x *= sx; f.y *= sy; }
      }
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    /* ── update ────────────────────────────────────── */
    function update(dt, tSec) {
      if (paused) return;

      /* decay */
      if (shakeT > 0) shakeT = Math.max(0, shakeT - dt);
      if (flash > 0) flash = Math.max(0, flash - dt * 2);
      if (expandT > 0) expandT = Math.max(0, expandT - dt);
      for (const br of bricks) if (br.hitT > 0) br.hitT = Math.max(0, br.hitT - dt);
      for (const p of parts) {
        p.t += dt;
        if (p.kind === 'shard') {
          p.vy += 900 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
        } else {
          p.x += p.vx * dt; p.y += p.vy * dt;
        }
      }
      for (let i = parts.length - 1; i >= 0; i--) if (parts[i].t >= parts[i].life) parts.splice(i, 1);
      for (const f of floaters) { f.t += dt; f.y -= 44 * dt; }
      for (let i = floaters.length - 1; i >= 0; i--) if (floaters[i].t >= floaters[i].life) floaters.splice(i, 1);

      if (phase === 'menu' || phase === 'over') return;

      /* level banner */
      if (phase === 'levelup') {
        bannerT += dt;
        if (bannerT >= 1.8) {
          level++;
          buildLevel(level);
          serve();
          Sfx.play('tick');
        }
        return;
      }

      /* paddle */
      const kd = (keyR ? 1 : 0) - (keyL ? 1 : 0);
      if (kd) paddle.aim = clampAim(paddle.aim + kd * 760 * dt);
      paddle.aim = clampAim(paddle.aim);
      paddle.x = paddle.aim;
      paddle.w = paddle.baseW * (expandT > 0 ? 1.45 : 1);

      if (phase === 'serve') {
        const b = balls[0];
        if (b) { b.x = paddle.x; b.y = paddle.y - b.r - 3; }
        return;
      }

      /* ── phase play: balls ── */
      const hud = hudH();
      for (let bi = balls.length - 1; bi >= 0; bi--) {
        const b = balls[bi];
        const sp = Math.hypot(b.vx, b.vy);
        const steps = clamp(Math.ceil((sp * dt) / Math.max(4, b.r * 0.85)), 1, 8);
        const stepT = dt / steps;
        for (let s = 0; s < steps; s++) {
          b.x += b.vx * stepT;
          b.y += b.vy * stepT;
          /* walls */
          if (b.x - b.r < 0) { b.x = b.r; b.vx = Math.abs(b.vx); }
          else if (b.x + b.r > W) { b.x = W - b.r; b.vx = -Math.abs(b.vx); }
          if (b.y - b.r < hud) { b.y = hud + b.r; b.vy = Math.abs(b.vy); }
          /* paddle */
          if (b.vy > 0 &&
              b.y + b.r >= paddle.y && b.y - b.r <= paddle.y + paddle.h &&
              Math.abs(b.x - paddle.x) <= paddle.w / 2 + b.r * 0.7) {
            paddleHit(b);
          }
          /* bricks */
          for (const br of bricks) {
            if (br.hp <= 0) continue;
            const ox = (br.w / 2 + b.r) - Math.abs(b.x - (br.x + br.w / 2));
            const oy = (br.h / 2 + b.r) - Math.abs(b.y - (br.y + br.h / 2));
            if (ox <= 0 || oy <= 0) continue;
            if (ox < oy) {
              const leftSide = b.x < br.x + br.w / 2;
              b.vx = leftSide ? -Math.abs(b.vx) : Math.abs(b.vx);
              b.x += leftSide ? -ox : ox;
            } else {
              const topSide = b.y < br.y + br.h / 2;
              b.vy = topSide ? -Math.abs(b.vy) : Math.abs(b.vy);
              b.y += topSide ? -oy : oy;
            }
            hitBrick(b, br);
            break;                               // one brick per substep
          }
          if (phase !== 'play') break;
        }
        /* trail */
        b.trail.push({ x: b.x, y: b.y, t: 0 });
        for (const tr of b.trail) tr.t += dt;
        while (b.trail.length && (b.trail[0].t > 0.32 || b.trail.length > 16)) b.trail.shift();
        /* death (skipped if the level was cleared this very frame) */
        if (phase === 'play' && b.y - b.r > H) loseBall(bi);
      }

      /* ── power-up drops ── */
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        d.t += dt;
        d.y += 165 * dt;
        if (d.y > H + 30) { drops.splice(i, 1); continue; }
        if (d.y >= paddle.y - 12 && d.y <= paddle.y + paddle.h + 16 &&
            Math.abs(d.x - paddle.x) <= paddle.w / 2 + 16) {
          drops.splice(i, 1);
          applyDrop(d);
        }
      }
    }

    /* ── render ────────────────────────────────────── */
    function drawBg(tSec) {
      const bg = g.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#07081a');
      bg.addColorStop(0.6, '#0a0c22');
      bg.addColorStop(1, '#0d1030');
      g.fillStyle = bg;
      g.fillRect(0, 0, W, H);
      /* top neon haze */
      const hz = g.createRadialGradient(W / 2, 0, 20, W / 2, 0, W * 0.55);
      hz.addColorStop(0, 'rgba(124,92,255,.20)');
      hz.addColorStop(1, 'rgba(124,92,255,0)');
      g.fillStyle = hz;
      g.fillRect(0, 0, W, H * 0.7);
      /* drifting grid */
      g.lineWidth = 1;
      g.strokeStyle = 'rgba(0,240,255,.05)';
      g.beginPath();
      const gs = 48, off = (tSec * 8) % gs;
      for (let x = -off; x < W + gs; x += gs) { g.moveTo(x, 0); g.lineTo(x, H); }
      for (let y = -off; y < H + gs; y += gs) { g.moveTo(0, y); g.lineTo(W, y); }
      g.stroke();
      /* danger line */
      const dz = g.createLinearGradient(0, H - 26, 0, H);
      dz.addColorStop(0, 'rgba(255,46,207,0)');
      dz.addColorStop(1, 'rgba(255,46,207,.25)');
      g.fillStyle = dz;
      g.fillRect(0, H - 26, W, 26);
      g.strokeStyle = 'rgba(255,46,207,.55)';
      g.lineWidth = 2;
      g.shadowColor = '#ff2ecd';
      g.shadowBlur = 12;
      g.beginPath();
      g.moveTo(0, H - 1.5);
      g.lineTo(W, H - 1.5);
      g.stroke();
      g.shadowBlur = 0;
      /* vignette */
      const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
      vg.addColorStop(0, 'rgba(6,7,15,0)');
      vg.addColorStop(1, 'rgba(6,7,15,.5)');
      g.fillStyle = vg;
      g.fillRect(0, 0, W, H);
    }

    function drawHud(tSec) {
      const hh = hudH();
      const st = g.createLinearGradient(0, 0, 0, hh);
      st.addColorStop(0, 'rgba(4,5,12,.88)');
      st.addColorStop(1, 'rgba(4,5,12,.2)');
      g.fillStyle = st;
      g.fillRect(0, 0, W, hh);
      g.strokeStyle = 'rgba(0,240,255,.35)';
      g.lineWidth = 1.5;
      g.shadowColor = '#00f0ff';
      g.shadowBlur = 10;
      g.beginPath();
      g.moveTo(14, hh - 2);
      g.lineTo(W - 14, hh - 2);
      g.stroke();
      g.shadowBlur = 0;
      g.textBaseline = 'middle';
      /* level */
      g.textAlign = 'left';
      g.font = '800 17px ' + FONT;
      g.fillStyle = '#00f0ff';
      g.shadowColor = '#00f0ff';
      g.shadowBlur = 12;
      g.fillText('LEVEL ' + level, 18, hh * 0.55);
      g.shadowBlur = 0;
      /* lives */
      g.textAlign = 'right';
      g.font = '700 10px ' + FONT;
      g.fillStyle = 'rgba(255,255,255,.5)';
      g.fillText('LIVES', W - 26 - lives * 17, hh * 0.55);
      for (let i = 0; i < lives; i++) {
        const x = W - 20 - (lives - 1 - i) * 17;
        g.fillStyle = '#ff2ecd';
        g.shadowColor = '#ff2ecd';
        g.shadowBlur = 8;
        g.beginPath();
        g.arc(x, hh * 0.55, 5.2, 0, TAU);
        g.fill();
        g.shadowBlur = 0;
        g.fillStyle = 'rgba(255,255,255,.85)';
        g.beginPath();
        g.arc(x - 1.6, hh * 0.55 - 1.6, 1.6, 0, TAU);
        g.fill();
      }
      /* combo chain */
      if (combo >= 2 && phase !== 'menu') {
        const pulse = 1 + 0.12 * Math.sin(tSec * 7);
        g.save();
        g.translate(W / 2, hh * 0.55);
        g.scale(pulse, pulse);
        g.textAlign = 'center';
        g.font = '900 16px ' + FONT;
        g.fillStyle = '#ffd23c';
        g.shadowColor = '#ffd23c';
        g.shadowBlur = 14;
        g.fillText('CHAIN ×' + combo, 0, 0);
        g.shadowBlur = 0;
        g.restore();
      }
      g.textAlign = 'left';
      g.textBaseline = 'alphabetic';
    }

    function drawBricks() {
      for (const br of bricks) {
        if (br.hp <= 0) continue;
        const base = br.col_hex;
        const damaged = br.maxHp > 1 && br.hp <= 1;
        g.save();
        /* body */
        g.shadowColor = base;
        g.shadowBlur = br.hp > 1 ? 10 : 7;
        const gr = g.createLinearGradient(br.x, br.y, br.x, br.y + br.h);
        gr.addColorStop(0, shade(base, 0.3));
        gr.addColorStop(0.5, base);
        gr.addColorStop(1, shade(base, -0.28));
        g.fillStyle = gr;
        rr(br.x, br.y, br.w, br.h, 5);
        g.fill();
        g.shadowBlur = 0;
        /* shine */
        g.fillStyle = 'rgba(255,255,255,.26)';
        rr(br.x + 2, br.y + 2, br.w - 4, Math.max(3, br.h * 0.3), 3);
        g.fill();
        /* outline */
        g.strokeStyle = 'rgba(6,7,15,.55)';
        g.lineWidth = 1.5;
        rr(br.x, br.y, br.w, br.h, 5);
        g.stroke();
        if (br.hp > 1) {
          /* steel frame + rivets */
          g.strokeStyle = 'rgba(232,240,255,.85)';
          g.lineWidth = 2;
          rr(br.x + 1.5, br.y + 1.5, br.w - 3, br.h - 3, 4);
          g.stroke();
          g.fillStyle = 'rgba(255,255,255,.9)';
          g.beginPath(); g.arc(br.x + 6, br.y + br.h / 2, 1.7, 0, TAU); g.fill();
          g.beginPath(); g.arc(br.x + br.w - 6, br.y + br.h / 2, 1.7, 0, TAU); g.fill();
        }
        if (damaged) {
          g.fillStyle = 'rgba(6,7,15,.3)';
          rr(br.x, br.y, br.w, br.h, 5);
          g.fill();
          g.strokeStyle = 'rgba(6,7,15,.7)';
          g.lineWidth = 1.4;
          g.beginPath();
          g.moveTo(br.x + br.w * 0.3, br.y + 2);
          g.lineTo(br.x + br.w * 0.44, br.y + br.h * 0.5);
          g.lineTo(br.x + br.w * 0.34, br.y + br.h - 2);
          g.moveTo(br.x + br.w * 0.66, br.y + br.h * 0.25);
          g.lineTo(br.x + br.w * 0.58, br.y + br.h * 0.7);
          g.stroke();
        }
        if (br.hitT > 0) {
          g.fillStyle = 'rgba(255,255,255,' + (br.hitT * 2.2) + ')';
          rr(br.x, br.y, br.w, br.h, 5);
          g.fill();
        }
        g.restore();
      }
    }

    function drawPaddle(tSec) {
      const x = paddle.x - paddle.w / 2, y = paddle.y, w = paddle.w, h = paddle.h;
      /* under-glow */
      const ug = g.createRadialGradient(paddle.x, y + h + 6, 4, paddle.x, y + h + 6, w * 0.7);
      ug.addColorStop(0, 'rgba(0,240,255,.35)');
      ug.addColorStop(1, 'rgba(0,240,255,0)');
      g.fillStyle = ug;
      g.fillRect(x - w * 0.4, y, w * 1.8, h * 3);
      g.save();
      g.shadowColor = expandT > 0 ? '#ffd23c' : '#00f0ff';
      g.shadowBlur = 16;
      const gr = g.createLinearGradient(x, y, x + w, y);
      gr.addColorStop(0, '#00f0ff');
      gr.addColorStop(0.5, '#7c5cff');
      gr.addColorStop(1, '#ff2ecd');
      g.fillStyle = gr;
      rr(x, y, w, h, h / 2);
      g.fill();
      g.shadowBlur = 0;
      /* top highlight */
      g.fillStyle = 'rgba(255,255,255,.5)';
      rr(x + 5, y + 2, w - 10, Math.max(2, h * 0.26), h * 0.15);
      g.fill();
      /* end caps */
      g.fillStyle = 'rgba(255,255,255,.85)';
      g.beginPath(); g.arc(x + 4.5, y + h / 2, 2.1, 0, TAU); g.fill();
      g.beginPath(); g.arc(x + w - 4.5, y + h / 2, 2.1, 0, TAU); g.fill();
      if (expandT > 0) {
        g.strokeStyle = 'rgba(255,210,60,' + (0.5 + 0.3 * Math.sin(tSec * 9)) + ')';
        g.lineWidth = 2;
        rr(x - 2, y - 2, w + 4, h + 4, h / 2 + 2);
        g.stroke();
      }
      g.restore();
    }

    function drawBalls() {
      for (const b of balls) {
        /* motion trail */
        for (const tr of b.trail) {
          const k = 1 - tr.t / 0.32;
          g.globalAlpha = Math.max(0, 0.3 * k);
          g.fillStyle = '#00f0ff';
          g.beginPath();
          g.arc(tr.x, tr.y, b.r * (0.35 + 0.6 * k), 0, TAU);
          g.fill();
        }
        g.globalAlpha = 1;
        /* core */
        g.save();
        g.shadowColor = '#00f0ff';
        g.shadowBlur = 14;
        const bg = g.createRadialGradient(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.1, b.x, b.y, b.r);
        bg.addColorStop(0, '#ffffff');
        bg.addColorStop(0.5, '#bff9ff');
        bg.addColorStop(1, '#00f0ff');
        g.fillStyle = bg;
        g.beginPath();
        g.arc(b.x, b.y, b.r, 0, TAU);
        g.fill();
        g.shadowBlur = 0;
        g.strokeStyle = 'rgba(6,7,15,.4)';
        g.lineWidth = 1;
        g.stroke();
        g.restore();
      }
    }

    function drawDrops() {
      const ICON = { expand: 'W', multi: 'M', life: '♥' };
      const COL = { expand: '#00f0ff', multi: '#ff2ecd', life: '#39ff88' };
      for (const d of drops) {
        const col = COL[d.type];
        g.save();
        g.translate(d.x, d.y);
        g.rotate(Math.sin(d.t * 6) * 0.25);
        /* riser streak */
        g.globalAlpha = 0.4;
        g.strokeStyle = col;
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(0, -16);
        g.lineTo(0, -32);
        g.stroke();
        g.globalAlpha = 1;
        /* capsule badge */
        const pw = 34, ph = 22;
        g.shadowColor = col;
        g.shadowBlur = 14;
        g.fillStyle = 'rgba(6,7,15,.88)';
        rr(-pw / 2, -ph / 2, pw, ph, 11);
        g.fill();
        g.strokeStyle = col;
        g.lineWidth = 2;
        rr(-pw / 2, -ph / 2, pw, ph, 11);
        g.stroke();
        g.shadowBlur = 0;
        g.fillStyle = col;
        g.font = '900 12px ' + FONT;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(ICON[d.type], 0, 1);
        g.restore();
      }
      g.textAlign = 'left';
      g.textBaseline = 'alphabetic';
    }

    function drawParts() {
      for (const p of parts) {
        const k = Math.max(0, 1 - p.t / p.life);
        g.globalAlpha = k;
        if (p.kind === 'shard') {
          g.save();
          g.translate(p.x, p.y);
          g.rotate(p.rot);
          g.fillStyle = p.col;
          g.fillRect(-p.sz / 2, -p.sz / 2, p.sz, p.sz);
          g.restore();
        } else {
          g.fillStyle = p.col;
          g.beginPath();
          g.arc(p.x, p.y, p.sz * k, 0, TAU);
          g.fill();
        }
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

    function drawBanner() {
      if (phase !== 'levelup') return;
      g.fillStyle = 'rgba(6,7,15,.45)';
      g.fillRect(0, 0, W, H);
      const k = Math.min(1, bannerT / 0.35);
      const s = k >= 1 ? 1 : easeOutBack(k);
      g.save();
      g.translate(W / 2, H * 0.42);
      g.scale(s, s);
      g.textAlign = 'center';
      g.font = '900 ' + clamp(W * 0.055, 26, 46) + 'px ' + FONT;
      g.fillStyle = '#ffd23c';
      g.shadowColor = '#ffd23c';
      g.shadowBlur = 26;
      g.fillText('LEVEL CLEARED', 0, 0);
      g.shadowBlur = 0;
      g.font = '800 ' + clamp(W * 0.03, 15, 24) + 'px ' + FONT;
      g.fillStyle = '#00f0ff';
      g.fillText('+' + level * 500 + ' BONUS', 0, clamp(W * 0.05, 30, 44));
      g.restore();
      g.textAlign = 'center';
      g.font = '600 13px ' + FONT;
      g.fillStyle = 'rgba(255,255,255,.8)';
      g.fillText('GET READY · LEVEL ' + (level + 1), W / 2, H * 0.42 + clamp(W * 0.09, 62, 88));
      g.textAlign = 'left';
    }

    function render(tSec) {
      g.save();
      if (shakeT > 0) {
        const m = shakeT * 10;
        g.translate((Math.random() - 0.5) * 2 * m, (Math.random() - 0.5) * 2 * m);
      }
      drawBg(tSec);
      drawHud(tSec);
      drawBricks();
      drawDrops();
      drawPaddle(tSec);
      drawBalls();
      drawParts();
      drawFloaters();
      if (flash > 0) {
        g.fillStyle = 'rgba(255,59,92,' + flash * 0.5 + ')';
        g.fillRect(0, 0, W, H);
      }
      g.restore();
      drawBanner();
    }

    /* ── boot: pre-built level-1 backdrop behind the menu ── */
    buildLevel(1);
    balls.push(makeBall());
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
      const tSec = now / 1000;
      update(dt, tSec);
      render(tSec);
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
        host.removeEventListener('pointermove', onMove);
        host.removeEventListener('pointerdown', onDown);
        window.removeEventListener('keydown', onKeyD);
        window.removeEventListener('keyup', onKeyU);
        if (menu.parentNode) menu.parentNode.removeChild(menu);
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        host.classList.remove('gbrk-host');
      },
      getState() {
        let left = 0, armored = 0;
        for (const b of bricks) {
          if (b.hp > 0) left++;
          if (b.hp > 1) armored++;
        }
        let n = 0, sx = 0;
        for (const b of bricks) {
          if (b.hp > 0) { n++; sx += b.x + b.w / 2; }
        }
        return {
          phase, level, lives, score, combo, hits, destroyed, caught,
          bricksLeft: left, armoredLeft: armored,
          paddleX: paddle.x, paddleY: paddle.y, paddleW: paddle.w,
          W, H, expandT,
          ballX: balls[0] ? balls[0].x : null,
          ballY: balls[0] ? balls[0].y : null,
          ballVx: balls[0] ? balls[0].vx : null,
          ballVy: balls[0] ? balls[0].vy : null,
          balls: balls.length,
          ballList: balls.map(b => ({ x: b.x, y: b.y, vx: b.vx, vy: b.vy, r: b.r })),
          drops: drops.map(d => ({ x: d.x, y: d.y, type: d.type })),
          centX: n ? sx / n : null,
        };
      },
    };
  },
});