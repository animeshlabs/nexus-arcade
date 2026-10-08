/* ═══════════════════════════════════════════════════════
   NEON PING PONG — paddle vs machine, first to 11 takes it
   Drag to steer (or arrows/WASD) · every return speeds the
   ball up · sharp angles beat the machine's reaction time.
   ═══════════════════════════════════════════════════════ */
registerGame({
  id: 'pingpong',
  title: 'Ping Pong',
  genre: 'Arcade',
  emoji: '🏓',
  colors: ['#00f0ff', '#ff2ecd'],
  description: 'Rally the neon ball past the machine — every return speeds it up and the angles get sharper. First to 11 takes the match; drag, swipe or steer with arrows to defend your side.',
  featured: true,
  controls: [
    { key: 'DRAG TO STEER', label: 'Follow the ball' },
    { key: 'ARROWS / WASD', label: 'Keyboard move' },
    { key: 'SPACE', label: 'Start the match' },
  ],
  create(ctx) {
    'use strict';

    const host = ctx.container;
    host.classList.add('gpp-host');

    /* ── constants ─────────────────────────────────── */
    const FONT = 'Orbitron, system-ui, sans-serif';
    const TAU = Math.PI * 2;
    const PT_HIT = 2;                 // per player paddle return
    const PT_POINT = 50;              // per point won
    const PT_WIN = 100;               // match bonus
    const WIN_SCORE = 11;
    const INIT_SPEED = 340;
    const MAX_SPEED = 660;
    const SPEED_UP = 1.05;            // per paddle return
    const SERVE_T = 0.9;
    const SERVE_A = 0.34;             // serve half-angle (rad)
    const MAX_ANGLE = 1.05;           // return angle from paddle offset (rad)
    const MIN_ANGLE = 0.105;          // never dead-straight (keeps rallies alive)
    const KEY_SPEED = 560;            // keyboard paddle px/s
    const PAD_X = 26;
    const PAD_W = 12;
    const BALL_R = 8;
    const AI_SAMPLE = 0.13;           // machine reaction tick
    const AI_DEAD = 26;               // machine ignores micro-adjustments
    const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

    /* ── sizing ────────────────────────────────────── */
    let W = ctx.width || host.clientWidth || 900;
    let H = ctx.height || host.clientHeight || 640;
    let pH = 90;                      // paddle height
    let playerX = PAD_X, aiX = W - PAD_X - PAD_W;

    function layout() {
      pH = clamp(H * 0.16, 64, 108);
      playerX = PAD_X;
      aiX = W - PAD_X - PAD_W;
      py = clamp(py, pH / 2, H - pH / 2);
      aiY = clamp(aiY, pH / 2, H - pH / 2);
      targetY = clamp(targetY, pH / 2, H - pH / 2);
      ball.y = clamp(ball.y, BALL_R, H - BALL_R);
      ball.x = clamp(ball.x, BALL_R, W - BALL_R);
    }

    /* ── state ─────────────────────────────────────── */
    let phase = 'menu';               // menu | play | over
    let paused = false, alive = true, overCalled = false;
    let you = 0, foe = 0, returns = 0;
    let score = 0;
    let serveT = 0, dirX = 1, serveSign = 1;
    const ball = { x: 0, y: 0, vx: 0, vy: 0 };
    let py = 0, aiY = 0, targetY = 0;
    let aiT = 0, aiTarget = 0;
    let upHeld = false, downHeld = false;
    let shakeT = 0, flashT = 0, flashCol = '#00f0ff';
    let padFlashP = 0, padFlashA = 0, pulseT = 0;
    const trail = [];
    const parts = [];
    const floaters = [];

    /* ── canvas + menu DOM ─────────────────────────── */
    const canvas = document.createElement('canvas');
    host.appendChild(canvas);
    const g = canvas.getContext('2d');

    const menu = document.createElement('div');
    menu.className = 'gpp-menu';
    const menuIn = document.createElement('div');
    menuIn.className = 'gpp-menu__in';
    const mTitle = document.createElement('h3');
    mTitle.textContent = 'PING PONG';
    const mHint = document.createElement('p');
    mHint.textContent = 'First to 11 takes the match · every return ramps the speed · slam it wide and watch the machine chase.';
    const btnPlay = document.createElement('button');
    btnPlay.className = 'gpp-play';
    btnPlay.textContent = '▶ PLAY';
    const tips = document.createElement('div');
    tips.className = 'gpp-tips';
    ['FIRST TO 11', 'DRAG · ARROWS · WASD', 'RALLY ACCELERATES'].forEach(t => {
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

    function burst(px, py2, col, n) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU, v = 60 + Math.random() * 190;
        parts.push({
          x: px, y: py2,
          vx: Math.cos(a) * v, vy: Math.sin(a) * v,
          t: 0, life: 0.45 + Math.random() * 0.4,
          col, sz: 2 + Math.random() * 3,
        });
      }
    }

    function float(px, py2, txt, col, life) {
      floaters.push({ x: px, y: py2, txt, col, t: 0, life: life || 0.9 });
    }

    /* ── run flow ──────────────────────────────────── */
    function reset() {
      you = 0; foe = 0; returns = 0;
      score = 0;
      ctx.setScore(0);
      py = aiY = targetY = H / 2;
      aiY = H / 2;
      aiT = 0; aiTarget = H / 2;
      ball.x = W / 2; ball.y = H / 2;
      ball.vx = 0; ball.vy = 0;
      serveT = SERVE_T;
      dirX = 1;
      serveSign = 1;
      upHeld = downHeld = false;
      shakeT = 0; flashT = 0; padFlashP = 0; padFlashA = 0;
      trail.length = 0; parts.length = 0; floaters.length = 0;
      overCalled = false;
    }

    function startRun() {
      reset();
      phase = 'play';
      menu.classList.add('is-out');
      Sfx.play('start');
    }

    function launch() {
      const ang = serveSign * SERVE_A;
      serveSign = -serveSign;
      ball.vx = dirX * INIT_SPEED * Math.cos(ang);
      ball.vy = INIT_SPEED * Math.sin(ang);
      serveT = 0;
    }

    function point(who) {
      if (overCalled || phase !== 'play') return;
      serveT = SERVE_T;
      ball.x = W / 2; ball.y = H / 2;
      ball.vx = 0; ball.vy = 0;
      trail.length = 0;
      shakeT = 0.35;
      if (who === 'you') {
        you++;
        score += PT_POINT;
        ctx.setScore(score);
        flashCol = '#00f0ff';
        dirX = 1;                       // machine receives the next serve
        Sfx.play('coin');
        burst(W - 40, ball.y, '#00f0ff', 18);
        float(W - 110, H / 2 - 30, '+50 POINT!', '#00f0ff', 1.1);
        if (you >= WIN_SCORE) { endMatch(true); return; }
      } else {
        foe++;
        flashCol = '#ff2ecd';
        dirX = -1;                      // you receive the next serve
        Sfx.play('hit');
        burst(40, ball.y, '#ff2ecd', 18);
        float(140, H / 2 - 30, 'MACHINE SCORES', '#ff2ecd', 1.1);
        if (foe >= WIN_SCORE) { endMatch(false); return; }
      }
      flashT = 0.55;
    }

    function endMatch(won) {
      overCalled = true;
      phase = 'over';
      if (won) {
        score += PT_WIN;
        ctx.setScore(score);
        Sfx.play('win');
        float(W / 2, H / 2 - 70, 'MATCH!', '#39ff88', 1.4);
        burst(W / 2, H / 2, '#39ff88', 34);
      } else {
        Sfx.play('lose');
      }
      flashCol = won ? '#39ff88' : '#ff2ecd';
      flashT = 0.7;
      ctx.gameOver({
        title: won ? 'YOU WIN!' : 'GAME OVER',
        message: `${you}-${foe} · ${returns} returns`,
      });
    }

    /* ── physics ───────────────────────────────────── */
    function bounce(paddleY, dirOut, mine) {
      const rel = clamp((ball.y - paddleY) / (pH / 2 + BALL_R), -1, 1);
      let ang = rel * MAX_ANGLE;
      if (Math.abs(rel) < 0.12) {
        /* never dead-straight — keeps the rally moving */
        ang = (ball.vy >= 0 ? 1 : -1) * MIN_ANGLE;
      }
      const sp = Math.min(Math.hypot(ball.vx, ball.vy) * SPEED_UP, MAX_SPEED);
      ball.vx = dirOut * sp * Math.cos(ang);
      ball.vy = sp * Math.sin(ang);
      if (mine) {
        returns++;
        score += PT_HIT;
        ctx.setScore(score);
        padFlashP = 0.25;
        Sfx.play('click');
        burst(playerX + PAD_W, ball.y, '#00f0ff', 7);
      } else {
        padFlashA = 0.25;
        Sfx.play('jump');
        burst(aiX, ball.y, '#ff2ecd', 7);
      }
    }

    function substep(dt) {
      const sp = Math.hypot(ball.vx, ball.vy);
      const n = Math.max(1, Math.ceil((sp * dt) / 4));
      const sdt = dt / n;
      for (let i = 0; i < n; i++) {
        ball.x += ball.vx * sdt;
        ball.y += ball.vy * sdt;

        /* walls */
        if (ball.y < BALL_R) { ball.y = BALL_R; ball.vy = Math.abs(ball.vy); Sfx.play('hover'); }
        else if (ball.y > H - BALL_R) { ball.y = H - BALL_R; ball.vy = -Math.abs(ball.vy); Sfx.play('hover'); }

        /* player paddle (left, sends right) */
        if (ball.vx < 0 &&
            ball.x - BALL_R <= playerX + PAD_W && ball.x + BALL_R >= playerX &&
            ball.y + BALL_R >= py - pH / 2 && ball.y - BALL_R <= py + pH / 2) {
          ball.x = playerX + PAD_W + BALL_R;
          bounce(py, 1, true);
        }
        /* machine paddle (right, sends left) */
        if (ball.vx > 0 &&
            ball.x + BALL_R >= aiX && ball.x - BALL_R <= aiX + PAD_W &&
            ball.y + BALL_R >= aiY - pH / 2 && ball.y - BALL_R <= aiY + pH / 2) {
          ball.x = aiX - BALL_R;
          bounce(aiY, -1, false);
        }

        /* point */
        if (ball.x < -BALL_R * 2) { point('foe'); return; }
        if (ball.x > W + BALL_R * 2) { point('you'); return; }
      }
    }

    /* ── input ─────────────────────────────────────── */
    const toGameY = cy => {
      const r = canvas.getBoundingClientRect();
      return (cy - (r.top || 0)) * (H / (r.height || H));
    };
    const onPM = e => {
      if (typeof e.clientY !== 'number') return;
      targetY = toGameY(e.clientY);
    };
    const onKeyD = e => {
      switch (e.code) {
        case 'ArrowUp': case 'KeyW': upHeld = true; break;
        case 'ArrowDown': case 'KeyS': downHeld = true; break;
        case 'Space': case 'Enter':
          if (e.preventDefault) e.preventDefault();
          if (phase === 'menu') startRun();
          return;
        default: return;
      }
      if (e.preventDefault) e.preventDefault();
    };
    const onKeyU = e => {
      switch (e.code) {
        case 'ArrowUp': case 'KeyW': upHeld = false; break;
        case 'ArrowDown': case 'KeyS': downHeld = false; break;
      }
    };
    host.addEventListener('pointermove', onPM);
    host.addEventListener('pointerdown', onPM);
    window.addEventListener('keydown', onKeyD);
    window.addEventListener('keyup', onKeyU);
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
      if (padFlashP > 0) padFlashP = Math.max(0, padFlashP - dt);
      if (padFlashA > 0) padFlashA = Math.max(0, padFlashA - dt);
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

      /* keyboard steer shifts the pointer target */
      if (upHeld) targetY -= KEY_SPEED * dt;
      if (downHeld) targetY += KEY_SPEED * dt;
      targetY = clamp(targetY, pH / 2, H - pH / 2);
      py = targetY;

      /* machine: sample the ball while it comes its way */
      aiT -= dt;
      if (aiT <= 0) {
        aiT = AI_SAMPLE;
        aiTarget = (serveT <= 0 && ball.vx > 0) ? ball.y : H / 2;
      }
      const aiSp = clamp(250 + you * 10, 250, 335);
      const diff = aiTarget - aiY;
      if (Math.abs(diff) > AI_DEAD) aiY += Math.sign(diff) * Math.min(Math.abs(diff), aiSp * dt);
      aiY = clamp(aiY, pH / 2, H - pH / 2);

      if (serveT > 0) {
        serveT -= dt;
        ball.x = W / 2;
        ball.y = H / 2;
        if (serveT <= 0) launch();
        return;
      }

      trail.push({ x: ball.x, y: ball.y });
      if (trail.length > 9) trail.shift();
      substep(dt);
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
      hz.addColorStop(0, 'rgba(0,240,255,.05)');
      hz.addColorStop(1, 'rgba(0,240,255,0)');
      g.fillStyle = hz;
      g.fillRect(0, 0, W, H);
      /* top / bottom glow strips */
      g.fillStyle = 'rgba(255,255,255,.05)';
      g.fillRect(0, 0, W, 2);
      g.fillRect(0, H - 2, W, 2);
    }

    function drawCourt() {
      /* centre dashes */
      g.strokeStyle = 'rgba(255,255,255,.16)';
      g.lineWidth = 3;
      g.setLineDash([14, 16]);
      g.beginPath();
      g.moveTo(W / 2, 14);
      g.lineTo(W / 2, H - 14);
      g.stroke();
      g.setLineDash([]);
      /* score digits */
      g.textAlign = 'right';
      g.font = '900 ' + Math.round(clamp(H * 0.14, 44, 84)) + 'px ' + FONT;
      g.fillStyle = 'rgba(0,240,255,.75)';
      g.shadowColor = '#00f0ff';
      g.shadowBlur = 18;
      g.fillText(String(you), W / 2 - 46, clamp(H * 0.19, 60, 120));
      g.textAlign = 'left';
      g.fillStyle = 'rgba(255,46,205,.75)';
      g.shadowColor = '#ff2ecd';
      g.fillText(String(foe), W / 2 + 46, clamp(H * 0.19, 60, 120));
      g.shadowBlur = 0;
      g.textAlign = 'left';
    }

    function drawPaddle(x, y, col, flash) {
      g.shadowColor = col;
      g.shadowBlur = 16 + flash * 30;
      g.fillStyle = col;
      rr(x, y - pH / 2, PAD_W, pH, 6);
      g.fill();
      g.shadowBlur = 0;
      g.fillStyle = 'rgba(255,255,255,.5)';
      rr(x + 3, y - pH / 2 + 6, PAD_W - 6, pH - 12, 3);
      g.fill();
    }

    function drawBall() {
      /* trail */
      for (let i = 0; i < trail.length; i++) {
        const k = (i + 1) / trail.length;
        g.globalAlpha = k * 0.32;
        g.fillStyle = '#8ff7ff';
        g.beginPath();
        g.arc(trail[i].x, trail[i].y, BALL_R * (0.35 + k * 0.55), 0, TAU);
        g.fill();
      }
      g.globalAlpha = 1;
      const pulse = serveT > 0 ? 1 + Math.sin(pulseT * 9) * 0.18 : 1;
      const r = BALL_R * pulse;
      const gl = g.createRadialGradient(ball.x, ball.y, r * 0.4, ball.x, ball.y, r * 2.6);
      gl.addColorStop(0, 'rgba(234,255,255,.55)');
      gl.addColorStop(1, 'rgba(0,240,255,0)');
      g.fillStyle = gl;
      g.beginPath();
      g.arc(ball.x, ball.y, r * 2.6, 0, TAU);
      g.fill();
      const body = g.createRadialGradient(ball.x - r * 0.3, ball.y - r * 0.3, r * 0.15, ball.x, ball.y, r);
      body.addColorStop(0, '#ffffff');
      body.addColorStop(1, '#9df4ff');
      g.fillStyle = body;
      g.beginPath();
      g.arc(ball.x, ball.y, r, 0, TAU);
      g.fill();
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

    function drawServe() {
      if (phase !== 'play' || serveT <= 0) return;
      g.textAlign = 'center';
      g.font = '800 14px ' + FONT;
      g.fillStyle = 'rgba(255,255,255,' + (0.45 + Math.sin(pulseT * 7) * 0.3) + ')';
      g.fillText('READY', W / 2, H / 2 - 46);
      g.textAlign = 'left';
    }

    function render() {
      g.save();
      if (shakeT > 0) {
        const m = shakeT * 8;
        g.translate((Math.random() - 0.5) * 2 * m, (Math.random() - 0.5) * 2 * m);
      }
      drawBg();
      drawCourt();
      drawPaddle(playerX, py, '#00f0ff', padFlashP);
      drawPaddle(aiX, aiY, '#ff2ecd', padFlashA);
      drawBall();
      drawServe();
      drawParts();
      drawFloaters();
      if (flashT > 0) {
        g.fillStyle = flashCol + Math.round(Math.min(1, flashT) * 70).toString(16).padStart(2, '0');
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
      pause() { paused = true; },
      resume() { paused = false; last = 0; },
      restart() { paused = false; last = 0; startRun(); },
      resize(w, h) { resize(w, h); },
      destroy() {
        alive = false;
        cancelAnimationFrame(raf);
        host.removeEventListener('pointermove', onPM);
        host.removeEventListener('pointerdown', onPM);
        window.removeEventListener('keydown', onKeyD);
        window.removeEventListener('keyup', onKeyU);
        if (menu.parentNode) menu.parentNode.removeChild(menu);
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        host.classList.remove('gpp-host');
      },
      getState() {
        return {
          phase, you, foe, returns, score,
          serveT: Math.round(serveT * 100) / 100,
          bx: Math.round(ball.x * 10) / 10,
          by: Math.round(ball.y * 10) / 10,
          vx: Math.round(ball.vx * 10) / 10,
          vy: Math.round(ball.vy * 10) / 10,
          speed: Math.round(Math.hypot(ball.vx, ball.vy)),
          py: Math.round(py * 10) / 10,
          aiY: Math.round(aiY * 10) / 10,
          paddleH: Math.round(pH),
          W, H,
          overCalled,
        };
      },
    };
  },
});
