/* ═══════════════════════════════════════════════════════
   DOODLE JUMP — neon notebook hopper (canvas 2D)
   Drag / arrows to steer · bounce, springs, breakables
   ═══════════════════════════════════════════════════════ */
registerGame({
  id: 'doodle',
  title: 'Doodle Jump',
  genre: 'Arcade',
  emoji: '🐸',
  colors: ['#2dff9e', '#00e5ff'],
  description: 'Bounce ever upward on a neon notebook — ride moving pads, snap springs, avoid cracking brown plates. How high can you hop?',
  featured: true,
  controls: [
    { key: 'DRAG', label: 'Steer (mobile)' },
    { key: '← → / A D', label: 'Steer (keyboard)' },
    { key: 'MOUSE', label: 'Move to aim' },
  ],
  create(ctx) {
    'use strict';

    const host = ctx.container;

    /* ── world constants (y = up) ───────────────────── */
    const W = 420, H = 700;
    const G = 2000;                 // gravity px/s²
    const BOUNCE = 1010;            // normal bounce
    const SPRING = 1780;            // super bounce
    const R = 20;                   // player radius
    const PW = 70, PH = 14;         // platform size
    const MAXVX = 560;              // max steer speed

    /* ── state ──────────────────────────────────────── */
    let player, platforms, coins, parts, clouds, floaters;
    let camY = 0, genY = 0;
    let maxH = 0, coinBonus = 0, coinsGot = 0;
    let phase = 'play';             // play | falling
    let fallT = 0, overFired = false;
    let paused = false, moved = false;
    let squashT = 0, time = 0;

    /* input */
    const keys = { l: false, r: false };
    let targetX = W / 2, usePointer = false;

    /* ── generation ─────────────────────────────────── */
    /* place the next platform above genY (gap grows with height) */
    function addPlatform() {
      const h = genY;
      const gap = 85 + Math.min(58, h / 55) + Math.random() * 26;
      genY += gap;
      const y = genY;
      const x = 16 + Math.random() * (W - 32 - PW);
      const early = platforms.length <= 3;
      let type = 'normal';
      const roll = Math.random();
      if (!early) {
        if (h > 350 && roll < (h > 900 ? 0.26 : 0.16)) type = 'break';
        else if (h > 500 && roll < 0.42) type = 'move';
      }
      platforms.push({
        x, y, w: PW, type,
        vx: type === 'move' ? (70 + Math.min(90, h / 45)) * (Math.random() < 0.5 ? 1 : -1) : 0,
        broken: false, vy: 0,
        spring: type === 'normal' && !early && h > 400 && Math.random() < 0.05,
      });
      if (Math.random() < 0.1) {
        coins.push({ x: 24 + Math.random() * (W - 48), y: y - gap / 2, t: Math.random() * 6 });
      }
    }

    function ensureAhead() {
      while (genY < camY + H + 300) addPlatform();
    }

    function seed() {
      platforms = []; coins = []; parts = []; clouds = []; floaters = [];
      camY = 0; genY = 60; maxH = 0; coinBonus = 0; coinsGot = 0;
      time = 0; overFired = false; phase = 'play'; fallT = 0;
      player = { x: W / 2, y: 60 + R + 4, vx: 0, vy: 0 };
      platforms.push({ x: W / 2 - PW / 2, y: 60, w: PW, type: 'normal',
                       vx: 0, broken: false, vy: 0, spring: false });
      while (genY < H + 200) addPlatform();
      for (let i = 0; i < 3; i++) {
        clouds.push({ x: Math.random() * W, y: 140 + i * 230, s: 0.55 + Math.random() * 0.7 });
      }
      targetX = W / 2;
      ctx.setScore(0);
    }

    /* ── fx ─────────────────────────────────────────── */
    function burst(x, y, n, col, spd) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = (0.3 + Math.random()) * spd;
        parts.push({
          x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
          life: 0.4 + Math.random() * 0.35, t: 0, col,
          r: 1.5 + Math.random() * 2.5,
        });
      }
    }
    function floater(x, y, txt, col) {
      floaters.push({ x, y, txt, col, t: 0 });
    }

    const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

    /* ── landing ────────────────────────────────────── */
    function land(p) {
      player.y = p.y + R;
      if (p.spring) {
        player.vy = SPRING;
        squashT = 0.2;
        Sfx.play('power');
        burst(player.x, p.y, 16, '#ffd23c', 250);
        floater(player.x, p.y + 46, 'SPRING!', '#ffd23c');
      } else {
        player.vy = BOUNCE;
        squashT = 0.14;
        Sfx.play('jump');
        burst(player.x, p.y, 5, '#2dff9e', 130);
      }
      if (p.type === 'break') {
        p.broken = true;
        p.vy = -30;
        player.vy = BOUNCE * 0.45;          // crumble: weak pop, not a full bounce
        Sfx.play('hit');
        burst(p.x + p.w / 2, p.y - PH / 2, 14, '#ff9a3d', 210);
      } else if (p.type === 'move') {
        Sfx.play('click');
      }
    }

    /* ── physics tick ───────────────────────────────── */
    function update(dt) {
      time += dt;

      /* steer: keys override pointer target */
      const dir = (keys.r ? 1 : 0) - (keys.l ? 1 : 0);
      const want = dir ? dir * MAXVX
        : clamp((targetX - player.x) * 9, -MAXVX, MAXVX);
      player.vx += (want - player.vx) * Math.min(1, dt * 16);
      player.x += player.vx * dt;
      /* wrap only when fully off-screen (settling at edge must not wrap) */
      if (player.x < -R) player.x = W + R;
      else if (player.x > W + R) player.x = -R;

      /* gravity + one-way landing */
      const prevFeet = player.y - R;
      player.vy -= G * dt;
      player.y += player.vy * dt;
      const feet = player.y - R;
      if (player.vy < 0 && phase === 'play') {
        for (const p of platforms) {
          if (p.broken) continue;
          if (prevFeet >= p.y - 2 && feet <= p.y + 2 &&
              player.x + R > p.x && player.x - R < p.x + p.w) {
            land(p);
            break;
          }
        }
      }

      /* platforms: drift / crumble */
      for (const p of platforms) {
        if (p.type === 'move' && !p.broken) {
          p.x += p.vx * dt;
          if (p.x < 8) { p.x = 8; p.vx *= -1; }
          if (p.x + p.w > W - 8) { p.x = W - 8 - p.w; p.vx *= -1; }
        }
        if (p.broken) {
          p.vy -= G * 0.8 * dt;
          p.y += p.vy * dt;
        }
      }

      /* coins */
      for (let i = coins.length - 1; i >= 0; i--) {
        const c = coins[i];
        c.t += dt * 4;
        if (Math.abs(c.x - player.x) < R + 12 && Math.abs(c.y - player.y) < R + 15) {
          coinsGot++; coinBonus += 50;
          Sfx.play('coin');
          burst(c.x, c.y, 10, '#ffd23c', 190);
          floater(c.x, c.y, '+50', '#ffd23c');
          coins.splice(i, 1);
          continue;
        }
        if (c.y < camY - 60) coins.splice(i, 1);
      }

      /* camera only climbs */
      const wantCam = player.y - H * 0.55;
      if (wantCam > camY && phase === 'play') camY = wantCam;

      /* score = peak height + coins */
      if (player.y > maxH && phase === 'play') {
        maxH = player.y;
        ctx.setScore(Math.floor(maxH / 8) + coinBonus);
      }

      /* cull + generate */
      ensureAhead();
      if (platforms.length > 60) {
        platforms = platforms.filter(p => p.y > camY - 130);
      }

      /* clouds drift */
      for (const c of clouds) {
        c.x += 6 * c.s * dt;
        if (c.x > W + 70) c.x = -70;
      }

      /* fx decay */
      for (let i = parts.length - 1; i >= 0; i--) {
        const q = parts[i];
        q.t += dt;
        if (q.t > q.life) { parts.splice(i, 1); continue; }
        q.vy -= 750 * dt;
        q.x += q.vx * dt; q.y += q.vy * dt;
      }
      for (let i = floaters.length - 1; i >= 0; i--) {
        const f = floaters[i];
        f.t += dt;
        if (f.t > 0.9) { floaters.splice(i, 1); continue; }
        f.y += 42 * dt;
      }
      if (squashT > 0) squashT = Math.max(0, squashT - dt);

      /* death */
      if (phase === 'play' && player.y < camY - R - 50) {
        phase = 'falling';
        fallT = 0;
        Sfx.play('hit');
      }
      if (phase === 'falling') {
        fallT += dt;
        if (fallT > 0.8 && !overFired) {
          overFired = true;
          ctx.gameOver({
            title: 'FELL OFF!',
            message: `${Math.floor(maxH / 8) + coinBonus} pts · ${coinsGot} coins grabbed.`,
          });
        }
      }
    }

    /* ── canvas ─────────────────────────────────────── */
    host.classList.add('dj-host');
    const canvas = document.createElement('canvas');
    host.appendChild(canvas);
    const g = canvas.getContext('2d');

    const hint = document.createElement('div');
    hint.className = 'dj-hint';
    hint.textContent = 'DRAG · ARROWS · MOUSE TO STEER';
    host.appendChild(hint);

    function resize(w, h) {
      w = w || host.clientWidth || 420;
      h = h || host.clientHeight || 700;
      const scale = Math.min(w / W, h / H);
      canvas.style.width = Math.round(W * scale) + 'px';
      canvas.style.height = Math.round(H * scale) + 'px';
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    /* ── input ──────────────────────────────────────── */
    function markMoved() {
      if (!moved) { moved = true; hint.classList.add('is-out'); }
    }
    function pointerX(e) {
      const r = canvas.getBoundingClientRect();
      return clamp((e.clientX - r.left) * (W / Math.max(r.width, 1)), 0, W);
    }
    const onDown = e => { targetX = pointerX(e); markMoved(); };
    const onMove = e => {
      if (e.pointerType === 'mouse' || e.buttons) {
        targetX = pointerX(e); markMoved();
      }
    };
    const onKeyDown = e => {
      const k = e.key.toLowerCase();
      if (k === 'arrowleft' || k === 'a') { keys.l = true; markMoved(); e.preventDefault(); }
      if (k === 'arrowright' || k === 'd') { keys.r = true; markMoved(); e.preventDefault(); }
    };
    const onKeyUp = e => {
      const k = e.key.toLowerCase();
      if (k === 'arrowleft' || k === 'a') keys.l = false;
      if (k === 'arrowright' || k === 'd') keys.r = false;
    };
    host.addEventListener('pointerdown', onDown);
    host.addEventListener('pointermove', onMove);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    /* ── render ─────────────────────────────────────── */
    function rr(x, y, w, h, r) {
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
    }
    const SY = wy => H - (wy - camY);          // world→screen y

    function drawPlatform(p) {
      const sy = SY(p.y);
      if (sy > H + 30 || sy < -PH - 30) return;
      const col = p.type === 'move' ? '#00e5ff'
                : p.type === 'break' ? '#ff9a3d' : '#2dff9e';
      g.save();
      g.globalAlpha = p.broken ? 0.55 : 1;
      g.shadowColor = col;
      g.shadowBlur = 12;
      rr(p.x, sy, p.w, PH, 7);
      g.fillStyle = col === '#2dff9e' ? 'rgba(45,255,158,.17)'
                  : col === '#00e5ff' ? 'rgba(0,229,255,.17)'
                  : 'rgba(255,154,61,.2)';
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = col;
      g.stroke();
      /* top sheen */
      g.shadowBlur = 0;
      g.beginPath();
      g.moveTo(p.x + 7, sy + 3);
      g.lineTo(p.x + p.w - 7, sy + 3);
      g.strokeStyle = 'rgba(255,255,255,.35)';
      g.lineWidth = 1.5;
      g.stroke();
      /* break cracks */
      if (p.type === 'break') {
        g.beginPath();
        g.moveTo(p.x + p.w * 0.3, sy + 2); g.lineTo(p.x + p.w * 0.4, sy + PH - 2);
        g.moveTo(p.x + p.w * 0.62, sy + 2); g.lineTo(p.x + p.w * 0.55, sy + PH - 2);
        g.strokeStyle = 'rgba(6,7,15,.7)'; g.lineWidth = 1.5; g.stroke();
      }
      /* moving arrows */
      if (p.type === 'move') {
        const dir = Math.sign(p.vx) || 1;
        g.strokeStyle = 'rgba(0,229,255,.9)';
        g.lineWidth = 2;
        for (let i = 0; i < 2; i++) {
          const ax = p.x + p.w / 2 + (i * 8 - 4) * dir;
          const ay = sy + PH / 2;
          g.beginPath();
          g.moveTo(ax - 3 * dir, ay - 3);
          g.lineTo(ax + 3 * dir, ay);
          g.lineTo(ax - 3 * dir, ay + 3);
          g.stroke();
        }
      }
      /* spring */
      if (p.spring && !p.broken) {
        const sx = p.x + p.w / 2, base = sy;
        g.shadowColor = '#ffd23c'; g.shadowBlur = 10;
        g.strokeStyle = '#ffd23c'; g.lineWidth = 2.5;
        g.beginPath();
        g.moveTo(sx - 7, base);
        g.lineTo(sx + 7, base - 4);
        g.lineTo(sx - 7, base - 8);
        g.lineTo(sx + 7, base - 12);
        g.stroke();
        rr(sx - 10, base - 16, 20, 5, 2);
        g.fillStyle = '#ffd23c';
        g.fill();
      }
      g.restore();
    }

    function drawCoin(c) {
      const sy = SY(c.y);
      if (sy > H + 20 || sy < -20) return;
      const w = Math.abs(Math.cos(c.t)) * 10 + 3;   // spin squash
      g.save();
      g.shadowColor = '#ffd23c'; g.shadowBlur = 14;
      g.fillStyle = '#ffd23c';
      g.beginPath();
      g.ellipse(c.x, sy, w, 11, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(6,7,15,.55)';
      g.beginPath();
      g.ellipse(c.x, sy, w * 0.5, 5.5, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }

    function drawDood(px) {
      const sy = SY(player.y);
      const dur = player.vy > 900 ? 0.2 : 0.14;      // spring lasts longer
      const sq = squashT > 0 ? clamp(squashT / dur, 0, 1) : 0;
      const ky = 1 - 0.26 * sq, kx = 1 + 0.2 * sq;
      const rot = clamp(player.vx / 1500, -0.32, 0.32);
      g.save();
      g.translate(px, sy);
      g.rotate(rot);
      g.scale(kx, ky);
      /* feet */
      g.fillStyle = '#1bbf7a';
      g.beginPath(); g.ellipse(-8, R - 3, 7, 4.5, -0.2, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(8, R - 3, 7, 4.5, 0.2, 0, Math.PI * 2); g.fill();
      /* body */
      g.shadowColor = '#2dff9e'; g.shadowBlur = 16;
      g.fillStyle = '#2dff9e';
      g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fill();
      g.shadowBlur = 0;
      g.strokeStyle = 'rgba(6,7,15,.6)'; g.lineWidth = 2.5;
      g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.stroke();
      /* belly */
      g.fillStyle = 'rgba(230,255,240,.55)';
      g.beginPath(); g.ellipse(0, 6, 10, 7, 0, 0, Math.PI * 2); g.fill();
      /* eyes track velocity */
      const look = clamp(player.vx / 600, -3.5, 3.5);
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(-7, -7, 6.5, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(7, -7, 6.5, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#06070f';
      g.beginPath(); g.arc(-7 + look, -7, 3, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(7 + look, -7, 3, 0, Math.PI * 2); g.fill();
      /* blush + smile */
      g.fillStyle = 'rgba(255,46,140,.5)';
      g.beginPath(); g.arc(-13, 2, 3.5, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(13, 2, 3.5, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#06070f'; g.lineWidth = 2;
      g.beginPath(); g.arc(0, 1, 7, 0.25, Math.PI - 0.25); g.stroke();
      g.restore();
    }

    function render() {
      /* notebook paper */
      g.fillStyle = '#0a0e1c';
      g.fillRect(0, 0, W, H);
      g.strokeStyle = 'rgba(0,229,255,.07)';
      g.lineWidth = 1;
      const start = Math.ceil(camY / 36) * 36;
      for (let wy = start; wy < camY + H + 36; wy += 36) {
        const sy = SY(wy);
        g.beginPath(); g.moveTo(0, sy); g.lineTo(W, sy); g.stroke();
      }
      g.strokeStyle = 'rgba(255,46,205,.16)';
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(24, 0); g.lineTo(24, H); g.stroke();

      /* clouds (parallax) */
      g.fillStyle = 'rgba(124,92,255,.1)';
      for (const c of clouds) {
        const sy = H - (c.y - camY * 0.6);
        if (sy < -50 || sy > H + 50) continue;
        const r = 22 * c.s;
        g.beginPath();
        g.arc(c.x, sy, r, 0, Math.PI * 2);
        g.arc(c.x + r, sy + 4, r * 0.75, 0, Math.PI * 2);
        g.arc(c.x - r, sy + 5, r * 0.7, 0, Math.PI * 2);
        g.fill();
      }

      for (const c of coins) drawCoin(c);
      for (const p of platforms) drawPlatform(p);

      /* particles */
      for (const q of parts) {
        const sy = SY(q.y);
        g.globalAlpha = Math.max(0, 1 - q.t / q.life);
        g.fillStyle = q.col;
        g.fillRect(q.x - q.r / 2, sy - q.r / 2, q.r, q.r);
      }
      g.globalAlpha = 1;

      /* floaters */
      g.font = '900 17px system-ui, sans-serif';
      g.textAlign = 'center';
      for (const f of floaters) {
        const sy = SY(f.y);
        g.globalAlpha = Math.max(0, 1 - f.t / 0.9);
        g.fillStyle = f.col;
        g.shadowColor = f.col; g.shadowBlur = 10;
        g.fillText(f.txt, f.x, sy);
        g.shadowBlur = 0;
      }
      g.globalAlpha = 1;

      /* player (with wrap duplicates) */
      drawDood(player.x);
      if (player.x < R + 12) drawDood(player.x + W);
      if (player.x > W - R - 12) drawDood(player.x - W);

      /* vignette */
      const vg = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
      vg.addColorStop(0, 'rgba(6,7,15,0)');
      vg.addColorStop(1, 'rgba(6,7,15,.5)');
      g.fillStyle = vg;
      g.fillRect(0, 0, W, H);
    }

    /* ── loop ───────────────────────────────────────── */
    let raf = 0, last = 0, alive = true;
    function loop(t) {
      if (!alive) return;
      raf = requestAnimationFrame(loop);
      if (!last) last = t;
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      if (!paused) {
        update(dt);
        render();
      }
    }

    /* ── boot ───────────────────────────────────────── */
    seed();
    resize();
    raf = requestAnimationFrame(loop);

    return {
      pause() { paused = true; },
      resume() { paused = false; last = 0; },
      restart() { seed(); Sfx.play('start'); },
      resize(w, h) { resize(w, h); },
      destroy() {
        alive = false;
        cancelAnimationFrame(raf);
        host.removeEventListener('pointerdown', onDown);
        host.removeEventListener('pointermove', onMove);
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        host.classList.remove('dj-host');
        host.innerHTML = '';
      },
    };
  },
});
