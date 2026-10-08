/* ═══════════════════════════════════════════════════════
   FLAPPY BIRD — neon night flyer (canvas 2D)
   Tap to flap · parallax city · every 5th pipe powers up
   ═══════════════════════════════════════════════════════ */
registerGame({
  id: 'flappy',
  title: 'Flappy Bird',
  genre: 'Arcade',
  emoji: '🐦',
  colors: ['#ffd23c', '#39ff88'],
  description: 'One tap = one flap. Thread the glowing pipes over a neon skyline — speed rises and gaps shrink as your streak grows.',
  featured: true,
  controls: [
    { key: 'TAP / SPACE', label: 'Flap to gain lift' },
    { key: 'DODGE', label: 'Pass pipes clean — don\'t touch anything' },
  ],
  create(ctx) {
    'use strict';

    const host = ctx.container;
    host.classList.add('fl-host');

    /* ── world constants ────────────────────────────── */
    const W = 420, H = 700;
    const GROUND_H = 74;
    const groundY = H - GROUND_H;        // 626
    const BIRD_X = W * 0.32;             // 134.4
    const BIRD_R = 15;
    const GRAV = 1750, FLAP_V = -500, MAX_V = 640;
    const PW = 68, CAP_X = 10, CAP_H = 26;
    const SPACING = 240;
    const READY_Y = groundY / 2;         // 313 — also the stubbed-random gap centre
    const FONT = 'Orbitron, system-ui, sans-serif';
    const TAU = Math.PI * 2;

    const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
    const easeOutBack = t => {
      const c = 1.70158;
      return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
    };
    const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
    const speedFor = s => 150 + Math.min(s, 25) * 2.6;      // 150 → 215
    const gapFor = s => Math.max(148, 180 - s * 1.4);       // 180 → 148

    /* ── procedural scenery ─────────────────────────── */
    const stars = [];
    for (let i = 0; i < 70; i++) {
      stars.push({
        x: Math.random() * W,
        y: Math.random() * (groundY - 280),
        r: Math.random() * 1.5 + 0.4,
        tw: Math.random() * TAU,
        depth: Math.random() * 0.5 + 0.15,
      });
    }

    function makeSkyline(hMin, hMax, stripW) {
      const b = [];
      let x = 0;
      while (x < stripW) {
        const w = 26 + Math.random() * 44;
        const h = hMin + Math.random() * (hMax - hMin);
        const cols = Math.max(1, Math.floor(w / 13));
        const rows = Math.max(1, Math.floor(h / 18));
        const wins = [];
        for (let c = 0; c < cols; c++) {
          for (let r = 0; r < rows; r++) {
            if (Math.random() < 0.45) wins.push([c, r]);
          }
        }
        b.push({ x, w, h, wins, cols, rows });
        x += w + 4 + Math.random() * 10;
      }
      return { b, w: stripW };
    }
    const stripW = W * 2;
    const farCity = makeSkyline(60, 180, stripW);
    const nearCity = makeSkyline(110, 300, stripW);

    /* ── state ──────────────────────────────────────── */
    let phase = 'menu';                 // menu | ready | play | dying | over
    let score = 0;
    let bird = { y: READY_Y, vy: 0, rot: 0, squash: 0, wing: 0 };
    let pipes = [];                     // {x, gapY, g, scored}
    let scroll = 0;                     // world scroll accumulator
    let scorePop = 0, flash = 0, shakeT = 0, bannerT = 0;
    let overCalled = false;
    const trail = [];                   // bird after-glow
    const parts = [];                   // puff rings + feathers + sparkles
    const floaters = [];                // rising +1 texts
    let paused = false, alive = true;

    function makePipe(x) {
      const g = gapFor(score);
      const half = g / 2;
      const minY = half + 70;
      const maxY = groundY - half - 70;
      const gapY = minY + Math.random() * (maxY - minY);
      return { x, gapY, g, scored: false };
    }

    /* ── mode menu ──────────────────────────────────── */
    const menu = document.createElement('div');
    menu.className = 'fl-menu';
    const menuIn = document.createElement('div');
    menuIn.className = 'fl-menu__in';
    const mTitle = document.createElement('h3');
    mTitle.textContent = 'FLAPPY BIRD';
    const mHint = document.createElement('p');
    mHint.textContent = 'Tap to flap · thread the neon pipes · every 5th pipe powers up';
    const btnPlay = document.createElement('button');
    btnPlay.className = 'fl-play';
    btnPlay.textContent = '▶ PLAY';
    menuIn.appendChild(mTitle);
    menuIn.appendChild(mHint);
    menuIn.appendChild(btnPlay);
    menu.appendChild(menuIn);
    host.appendChild(menu);

    /* ── flow ───────────────────────────────────────── */
    function start() {
      score = 0;
      bird = { y: READY_Y, vy: 0, rot: 0, squash: 0, wing: 0 };
      pipes = [];
      trail.length = 0;
      parts.length = 0;
      floaters.length = 0;
      scorePop = 0; flash = 0; shakeT = 0; bannerT = 0;
      overCalled = false;
      phase = 'ready';
      ctx.setScore(0);
      menu.classList.add('is-out');
      Sfx.play('start');
    }

    function puff() {
      parts.push({ kind: 'ring', x: BIRD_X - 16, y: bird.y + 6, t: 0, life: 0.42 });
      parts.push({ kind: 'ring', x: BIRD_X - 22, y: bird.y + 2, t: 0, life: 0.34 });
    }

    function feathers() {
      const cols = ['#ffd23c', '#ff8a3d', '#ff2e7e', '#00f0ff'];
      for (let i = 0; i < 12; i++) {
        const a = Math.random() * TAU, v = 70 + Math.random() * 190;
        parts.push({
          kind: 'feather',
          x: BIRD_X, y: bird.y,
          vx: Math.cos(a) * v, vy: Math.sin(a) * v - 90,
          rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 12,
          t: 0, life: 0.7 + Math.random() * 0.5,
          col: cols[i % cols.length], sz: 3 + Math.random() * 3.5,
        });
      }
    }

    function flap() {
      if (phase === 'ready') phase = 'play';
      else if (phase !== 'play') return;
      bird.vy = FLAP_V;
      bird.squash = 1;
      puff();
      Sfx.play('jump');
    }

    function die() {
      if (phase !== 'play') return;
      phase = 'dying';
      flash = 0.5;
      shakeT = 0.4;
      bird.vy = Math.min(bird.vy, -200);
      feathers();
      Sfx.play('hit');
    }

    function gameOver() {
      if (overCalled) return;
      overCalled = true;
      phase = 'over';
      const medal = score >= 80 ? '💎 DIAMOND RUN'
        : score >= 50 ? '🥇 GOLD'
        : score >= 25 ? '🥈 SILVER'
        : score >= 10 ? '🥉 BRONZE' : '';
      Sfx.play('lose');
      ctx.gameOver({
        title: 'GAME OVER',
        message: `${score} pipes${medal ? ' · ' + medal : ''}`,
      });
    }

    function scorePoint(p) {
      p.scored = true;
      score++;
      scorePop = 1;
      ctx.setScore(score);
      floaters.push({ x: p.x + PW / 2, y: p.gapY, txt: '+1', col: '#39ff88', t: 0 });
      if (score % 5 === 0) {
        floaters.push({ x: W / 2, y: 190, txt: '★ ' + score + ' ★', col: '#ffd23c', t: 0 });
        Sfx.play('power');
      } else {
        Sfx.play('coin');
      }
    }

    /* pipe spawning while playing */
    function spawnPipes() {
      if (phase !== 'play') return;
      if (!pipes.length) { pipes.push(makePipe(W + 110)); return; }
      const lastP = pipes[pipes.length - 1];
      if (lastP.x <= W - SPACING) pipes.push(makePipe(W));
    }

    /* circle vs pipe columns + ground */
    function collide() {
      const fr = BIRD_R - 3;            // forgiving hitbox
      for (const p of pipes) {
        if (BIRD_X + fr < p.x || BIRD_X - fr > p.x + PW) continue;
        const top = p.gapY - p.g / 2;
        const bot = p.gapY + p.g / 2;
        if (bird.y - fr < top || bird.y + fr > bot) return true;
      }
      return bird.y + fr >= groundY;
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

    const onDown = e => {
      if (e.cancelable) e.preventDefault();
      flap();
    };
    const onKey = e => {
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
        e.preventDefault();
        flap();
      }
    };
    const onCancel = () => {};

    host.addEventListener('pointerdown', onDown);
    host.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey);

    btnPlay.addEventListener('click', () => { if (phase === 'menu') start(); });

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

    function drawSky(tSec) {
      const sky = g.createLinearGradient(0, 0, 0, groundY);
      sky.addColorStop(0, '#05060f');
      sky.addColorStop(0.55, '#170d38');
      sky.addColorStop(1, '#33165c');
      g.fillStyle = sky;
      g.fillRect(0, 0, W, groundY);

      /* stars */
      for (const s of stars) {
        const x = ((s.x - scroll * 0.03 * s.depth) % W + W) % W;
        const a = 0.35 + 0.55 * Math.abs(Math.sin(tSec * 1.6 + s.tw));
        g.globalAlpha = a * s.depth * 2;
        g.fillStyle = '#cfe6ff';
        g.beginPath();
        g.arc(x, s.y, s.r, 0, TAU);
        g.fill();
      }
      g.globalAlpha = 1;

      /* moon */
      const mx = W - 86, my = 92;
      const glow = g.createRadialGradient(mx, my, 8, mx, my, 74);
      glow.addColorStop(0, 'rgba(255,244,214,.5)');
      glow.addColorStop(1, 'rgba(255,244,214,0)');
      g.fillStyle = glow;
      g.beginPath();
      g.arc(mx, my, 74, 0, TAU);
      g.fill();
      g.fillStyle = '#fff6d8';
      g.beginPath();
      g.arc(mx, my, 34, 0, TAU);
      g.fill();
      g.fillStyle = 'rgba(214,200,168,.55)';
      g.beginPath(); g.arc(mx - 11, my - 6, 7, 0, TAU); g.fill();
      g.beginPath(); g.arc(mx + 9, my + 10, 5, 0, TAU); g.fill();
      g.beginPath(); g.arc(mx + 4, my - 14, 3.5, 0, TAU); g.fill();
    }

    function drawCity(city, off, base, dark, winCol, winSize) {
      const shift = ((off % city.w) + city.w) % city.w;
      for (let rep = -1; rep <= 1; rep++) {
        const ox = -shift + rep * city.w;
        for (const b of city.b) {
          const x = ox + b.x;
          if (x > W + 4 || x + b.w < -4) continue;
          g.fillStyle = dark;
          g.fillRect(x, base - b.h, b.w, b.h);
          g.fillStyle = winCol;
          for (const [c, r] of b.wins) {
            g.globalAlpha = 0.5 + 0.4 * Math.sin(b.x * 7 + c * 3 + r);
            g.fillRect(x + 4 + c * 13, base - b.h + 6 + r * 18, winSize, winSize + 1);
          }
          g.globalAlpha = 1;
        }
      }
    }

    function drawGround() {
      /* strip */
      const gr = g.createLinearGradient(0, groundY, 0, H);
      gr.addColorStop(0, '#221a4e');
      gr.addColorStop(1, '#100c26');
      g.fillStyle = gr;
      g.fillRect(0, groundY, W, GROUND_H);
      /* neon top line */
      g.strokeStyle = '#00f0ff';
      g.lineWidth = 2.5;
      g.shadowColor = '#00f0ff';
      g.shadowBlur = 14;
      g.beginPath();
      g.moveTo(0, groundY);
      g.lineTo(W, groundY);
      g.stroke();
      g.shadowBlur = 0;
      /* scrolling dashes */
      const step = 46;
      const off = -(((scroll % step) + step) % step);
      for (let x = off; x < W + step; x += step) {
        g.fillStyle = 'rgba(255,46,207,.30)';
        g.fillRect(x, groundY + 12, 24, 5);
        g.fillStyle = 'rgba(124,92,255,.30)';
        g.fillRect(x + 18, groundY + 34, 24, 5);
      }
      g.fillStyle = 'rgba(0,0,0,.35)';
      g.fillRect(0, groundY + 52, W, GROUND_H - 52);
    }

    function drawPipes(tSec) {
      const pulse = 12 + 4 * Math.sin(tSec * 3);
      for (const p of pipes) {
        const top = Math.round(p.gapY - p.g / 2);
        const bot = Math.round(p.gapY + p.g / 2);
        const segs = [
          { y: 0, h: top },
          { y: bot, h: groundY - bot },
        ];
        for (const s of segs) {
          if (s.h <= 0) continue;
          const body = g.createLinearGradient(p.x, 0, p.x + PW, 0);
          body.addColorStop(0, '#0e8f56');
          body.addColorStop(0.28, '#39ff88');
          body.addColorStop(0.5, '#a8ffd9');
          body.addColorStop(0.72, '#39ff88');
          body.addColorStop(1, '#0b7548');
          g.shadowColor = '#39ff88';
          g.shadowBlur = pulse;
          g.fillStyle = body;
          g.fillRect(p.x, s.y, PW, s.h);
          g.shadowBlur = 0;
          g.strokeStyle = 'rgba(255,255,255,.3)';
          g.lineWidth = 2;
          g.strokeRect(p.x + 1, s.y - 1, PW - 2, s.h + 2);
        }
        /* caps */
        const caps = [
          { y: top - CAP_H, h: CAP_H },
          { y: bot, h: CAP_H },
        ];
        for (const c of caps) {
          g.shadowColor = '#39ff88';
          g.shadowBlur = pulse + 6;
          const cg = g.createLinearGradient(p.x, 0, p.x + PW + CAP_X * 2, 0);
          cg.addColorStop(0, '#0b7548');
          cg.addColorStop(0.3, '#39ff88');
          cg.addColorStop(0.55, '#c8ffe6');
          cg.addColorStop(1, '#0e8f56');
          g.fillStyle = cg;
          rr(p.x - CAP_X, c.y, PW + CAP_X * 2, c.h, 5);
          g.fill();
          g.shadowBlur = 0;
          g.strokeStyle = 'rgba(255,255,255,.35)';
          g.lineWidth = 2;
          g.stroke();
        }
      }
    }

    function drawTrail() {
      for (const tr of trail) {
        const k = 1 - tr.t / 0.45;
        g.globalAlpha = k * 0.35;
        g.fillStyle = '#ffd23c';
        g.beginPath();
        g.arc(tr.x, tr.y, 2 + k * 7, 0, TAU);
        g.fill();
      }
      g.globalAlpha = 1;
    }

    function drawBird() {
      const rot = bird.rot;
      let sx = 1 + 0.16 * bird.squash;
      let sy = 1 - 0.22 * bird.squash;
      g.save();
      g.translate(BIRD_X, bird.y);
      g.rotate(rot);
      g.scale(sx, sy);

      /* tail */
      g.fillStyle = '#ff8a3d';
      g.shadowColor = '#ff8a3d';
      g.shadowBlur = 8;
      g.beginPath();
      g.moveTo(-12, -2); g.lineTo(-24, -9); g.lineTo(-22, 2); g.lineTo(-24, 9); g.lineTo(-12, 5);
      g.closePath();
      g.fill();

      /* body */
      const body = g.createRadialGradient(-4, -6, 3, 0, 0, 20);
      body.addColorStop(0, '#fff0a8');
      body.addColorStop(1, '#ffb830');
      g.shadowColor = '#ffd23c';
      g.shadowBlur = 12;
      g.fillStyle = body;
      g.beginPath();
      g.ellipse(0, 0, 17, 14.5, 0, 0, TAU);
      g.fill();
      g.shadowBlur = 0;

      /* belly */
      g.fillStyle = '#fff7d6';
      g.beginPath();
      g.ellipse(3, 6, 10, 7, 0, 0, TAU);
      g.fill();

      /* wing — flaps on wing phase */
      const wa = Math.sin(bird.wing) * 0.85;
      g.save();
      g.translate(-3, 0);
      g.rotate(wa);
      g.fillStyle = '#00f0ff';
      g.shadowColor = '#00f0ff';
      g.shadowBlur = 10;
      g.beginPath();
      g.ellipse(-2, 0, 11, 6.5, -0.15, 0, TAU);
      g.fill();
      g.shadowBlur = 0;
      g.strokeStyle = 'rgba(255,255,255,.5)';
      g.lineWidth = 1.4;
      g.stroke();
      g.restore();

      /* eye */
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(8, -5, 5.4, 0, TAU);
      g.fill();
      g.fillStyle = '#101426';
      g.beginPath();
      g.arc(9.6, -5, 2.6, 0, TAU);
      g.fill();
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(10.6, -6, 1, 0, TAU);
      g.fill();

      /* beak */
      g.fillStyle = '#ff8a3d';
      g.shadowColor = '#ff8a3d';
      g.shadowBlur = 6;
      g.beginPath();
      g.moveTo(13, 1);
      g.lineTo(24, 4.5);
      g.lineTo(13, 9);
      g.closePath();
      g.fill();
      g.shadowBlur = 0;
      g.strokeStyle = 'rgba(180,80,20,.6)';
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(13.5, 5);
      g.lineTo(23, 5.6);
      g.stroke();

      /* outline */
      g.strokeStyle = 'rgba(255,255,255,.35)';
      g.lineWidth = 1.6;
      g.beginPath();
      g.ellipse(0, 0, 17, 14.5, 0, 0, TAU);
      g.stroke();
      g.restore();
    }

    function drawParticles() {
      for (const p of parts) {
        const k = p.t / p.life;
        if (p.kind === 'ring') {
          g.globalAlpha = Math.max(0, 1 - k);
          g.strokeStyle = 'rgba(255,255,255,.8)';
          g.lineWidth = 2;
          g.beginPath();
          g.arc(p.x, p.y, 5 + k * 22, 0, TAU);
          g.stroke();
        } else {
          g.save();
          g.globalAlpha = Math.max(0, 1 - k);
          g.translate(p.x, p.y);
          g.rotate(p.rot);
          g.fillStyle = p.col;
          g.beginPath();
          g.ellipse(0, 0, p.sz * 1.6, p.sz * 0.7, 0, 0, TAU);
          g.fill();
          g.restore();
        }
      }
      g.globalAlpha = 1;
    }

    function drawFloaters() {
      g.textAlign = 'center';
      for (const f of floaters) {
        const k = f.t / 0.9;
        g.globalAlpha = Math.max(0, 1 - k);
        g.font = `800 ${f.txt.length > 4 ? 22 : 30}px ${FONT}`;
        g.fillStyle = f.col;
        g.shadowColor = f.col;
        g.shadowBlur = 14;
        g.fillText(f.txt, f.x, f.y - 10 - k * 46);
        g.shadowBlur = 0;
      }
      g.globalAlpha = 1;
    }

    function drawHud() {
      if (phase === 'menu' || phase === 'ready') return;
      const pop = 1 + 0.4 * scorePop;
      g.save();
      g.translate(W / 2, 104);
      g.scale(pop, pop);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `900 58px ${FONT}`;
      g.fillStyle = '#ffffff';
      g.shadowColor = '#00f0ff';
      g.shadowBlur = 22;
      g.fillText(String(score), 0, 0);
      g.shadowBlur = 0;
      g.lineWidth = 2;
      g.strokeStyle = 'rgba(6,7,15,.8)';
      g.strokeText(String(score), 0, 0);
      g.fillStyle = '#00f0ff';
      g.strokeStyle = 'rgba(6,7,15,.8)';
      g.font = `700 13px ${FONT}`;
      g.strokeText('PIPES', 0, 40);
      g.fillText('PIPES', 0, 40);
      g.restore();
      g.textAlign = 'left';
      g.textBaseline = 'alphabetic';
    }

    function drawReadyHint(tSec) {
      const a = 0.55 + 0.45 * Math.sin(tSec * 4);
      g.textAlign = 'center';
      /* bobbing arrow */
      g.save();
      g.translate(W / 2, 396 + Math.sin(tSec * 4) * 6);
      g.globalAlpha = a;
      g.fillStyle = '#ffd23c';
      g.shadowColor = '#ffd23c';
      g.shadowBlur = 12;
      g.beginPath();
      g.moveTo(0, -12); g.lineTo(11, 4); g.lineTo(4, 4); g.lineTo(4, 14);
      g.lineTo(-4, 14); g.lineTo(-4, 4); g.lineTo(-11, 4);
      g.closePath();
      g.fill();
      g.restore();
      g.globalAlpha = a;
      g.font = `800 22px ${FONT}`;
      g.fillStyle = '#ffffff';
      g.shadowColor = '#ff2ecd';
      g.shadowBlur = 16;
      g.fillText('TAP TO FLAP', W / 2, 452);
      g.shadowBlur = 0;
      g.font = `600 13px ${FONT}`;
      g.fillStyle = 'rgba(255,255,255,.75)';
      g.fillText('SPACE / ↑ ALSO WORK', W / 2, 478);
      g.globalAlpha = 1;
      g.textAlign = 'left';
    }

    function drawBanner() {
      if (phase !== 'dying' && phase !== 'over') return;
      const k = clamp(bannerT / 0.4, 0, 1);
      if (k <= 0) return;
      const s = easeOutBack(k);
      g.save();
      g.translate(W / 2, 240);
      g.scale(s, s);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `900 44px ${FONT}`;
      g.fillStyle = '#ff3b5c';
      g.shadowColor = '#ff2e7e';
      g.shadowBlur = 26;
      g.fillText('GAME OVER', 0, 0);
      g.shadowBlur = 0;
      g.lineWidth = 2;
      g.strokeStyle = 'rgba(255,255,255,.6)';
      g.strokeText('GAME OVER', 0, 0);
      g.restore();
      g.textAlign = 'left';
      g.textBaseline = 'alphabetic';
    }

    function render(tSec) {
      g.save();
      if (shakeT > 0) {
        const m = shakeT * 12;
        g.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
      }
      drawSky(tSec);
      drawCity(farCity, scroll * 0.15, groundY, '#241a4a', '#ffd23c', 3);
      drawCity(nearCity, scroll * 0.35, groundY, '#17123a', '#00f0ff', 3);
      drawPipes(tSec);
      drawGround();
      drawTrail();
      if (phase !== 'menu') drawBird();
      drawParticles();
      drawFloaters();
      drawHud();
      if (phase === 'ready') drawReadyHint(tSec);
      drawBanner();
      g.restore();

      /* vignette */
      const vg = g.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.78);
      vg.addColorStop(0, 'rgba(6,7,15,0)');
      vg.addColorStop(1, 'rgba(6,7,15,.55)');
      g.fillStyle = vg;
      g.fillRect(0, 0, W, H);

      /* death flash */
      if (flash > 0) {
        g.fillStyle = `rgba(255,255,255,${flash})`;
        g.fillRect(0, 0, W, H);
      }
    }

    /* ── update ─────────────────────────────────────── */
    function update(dt, tSec) {
      if (paused || !alive) return;

      if (phase === 'menu') scroll += 40 * dt;

      if (phase === 'ready') {
        scroll += speedFor(0) * dt;
        bird.y = READY_Y + Math.sin(tSec * 3.2) * 9;
        bird.rot = Math.sin(tSec * 3.2) * 0.08;
        bird.wing += dt * 14;
      }

      if (phase === 'play') {
        const spd = speedFor(score);
        scroll += spd * dt;
        spawnPipes();

        /* physics */
        bird.vy = Math.min(MAX_V, bird.vy + GRAV * dt);
        bird.y += bird.vy * dt;
        if (bird.y < BIRD_R) { bird.y = BIRD_R; bird.vy = Math.max(bird.vy, 0); }

        /* tilt */
        const target = bird.vy <= 0
          ? -0.5 + (bird.vy + FLAP_V) / -FLAP_V * 0.5
          : Math.min(1.55, bird.vy / MAX_V * 1.55);
        bird.rot += (target - bird.rot) * Math.min(1, dt * 10);
        bird.wing += dt * (bird.vy < 0 ? 16 : 7);

        /* pipes scroll + score */
        for (const p of pipes) p.x -= spd * dt;
        while (pipes.length && pipes[0].x + PW < -20) pipes.shift();
        for (const p of pipes) {
          if (!p.scored && p.x + PW < BIRD_X) scorePoint(p);
        }

        /* trail */
        for (const tr of trail) tr.t += dt;
        while (trail.length && trail[0].t > 0.45) trail.shift();
        trail.push({ x: BIRD_X - 6, y: bird.y, t: 0 });

        if (collide()) die();
      }

      if (phase === 'dying') {
        /* bird tumbles down */
        bird.vy = Math.min(MAX_V + 200, bird.vy + GRAV * 1.2 * dt);
        bird.y += bird.vy * dt;
        bird.rot += (1.55 - bird.rot) * Math.min(1, dt * 6);
        if (bird.y >= groundY - BIRD_R) {
          bird.y = groundY - BIRD_R;
          bannerT += dt;
          if (bannerT > 1.1) gameOver();
        }
      }

      /* timers */
      if (scorePop > 0) scorePop = Math.max(0, scorePop - dt * 3);
      if (flash > 0) flash = Math.max(0, flash - dt * 2);
      if (shakeT > 0) shakeT = Math.max(0, shakeT - dt);
      bird.squash = Math.max(0, bird.squash - dt * 5);

      for (const p of parts) {
        p.t += dt;
        if (p.kind === 'feather') {
          p.vy += GRAV * 0.5 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.rot += p.vr * dt;
        }
      }
      for (let i = parts.length - 1; i >= 0; i--) {
        if (parts[i].t >= parts[i].life) parts.splice(i, 1);
      }
      for (const f of floaters) f.t += dt;
      for (let i = floaters.length - 1; i >= 0; i--) {
        if (floaters[i].t >= 0.9) floaters.splice(i, 1);
      }
    }

    /* ── loop ───────────────────────────────────────── */
    let raf = 0, last = 0, tSec = 0;
    function frame(now) {
      if (!alive) return;
      raf = requestAnimationFrame(frame);
      if (!last) last = now;
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.05) dt = 0.05;
      tSec = now / 1000;
      update(dt, tSec);
      render(tSec);
    }
    resize();
    raf = requestAnimationFrame(frame);

    /* ── lifecycle ──────────────────────────────────── */
    return {
      pause() { paused = true; },
      resume() { paused = false; last = 0; },
      restart() { start(); },
      resize(w, h) { resize(w, h); },
      destroy() {
        alive = false;
        cancelAnimationFrame(raf);
        host.removeEventListener('pointerdown', onDown);
        host.removeEventListener('pointercancel', onCancel);
        window.removeEventListener('keydown', onKey);
        if (menu.parentNode) menu.parentNode.removeChild(menu);
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        host.classList.remove('fl-host');
      },
      /* read-only introspection for headless smoke tests */
      getState() {
        const next = pipes.find(p => p.x + PW >= BIRD_X - 10);
        return { phase, y: bird.y, vy: bird.vy, score, gap: next ? next.gapY : null };
      },
    };
  },
});

