/* ═══════════════════════════════════════════════════════
   ARCHERY — ten arrows against a floating neon target
   Drag from the bow to aim: direction = where you point,
   power = how far you pull. Wind bends every arrow, the
   target drifts further / smaller every 3 shots.
   Rings score 10 (gold centre) → 1 (outer white), exactly
   like a real 10-ring face. 10 arrows, best total wins.
   ═══════════════════════════════════════════════════════ */
registerGame({
  id: 'archery',
  title: 'Archery',
  genre: 'Arcade',
  emoji: '🏹',
  colors: ['#ffd23c', '#ff2e6d'],
  description:
    'Ten arrows, one shrinking target and a wind that never sits still. Read the gust, pull the bow and put gold in the centre.',
  featured: true,
  controls: [
    { key: 'DRAG', label: 'Aim — pull further for power, release to shoot' },
    { key: '↑ ↓ ← →', label: 'Angle and power with the keyboard' },
    { key: 'WIND', label: 'Read the gust — it bends every arrow' },
  ],
  create(ctx) {
    'use strict';

    const host = ctx.container;
    host.classList.add('grch-host');

    /* ── layout skeleton ─────────────────────────────── */
    const hud = document.createElement('div');
    hud.className = 'grch-hud';

    function cell(label, mod) {
      const c = document.createElement('div');
      c.className = 'grch-cell' + (mod ? ' ' + mod : '');
      const s = document.createElement('span');
      s.textContent = label;
      const b = document.createElement('b');
      b.textContent = '—';
      c.appendChild(s);
      c.appendChild(b);
      hud.appendChild(c);
      return { el: c, val: b };
    }

    /* quiver: 10 dots */
    const cQuiver = document.createElement('div');
    cQuiver.className = 'grch-cell grch-quiver';
    (function () {
      const s = document.createElement('span');
      s.textContent = 'QUIVER';
      const dots = document.createElement('i');
      dots.className = 'grch-dots';
      for (let i = 0; i < 10; i++) {
        const d = document.createElement('i');
        d.className = 'grch-dot is-on';
        dots.appendChild(d);
      }
      cQuiver.appendChild(s);
      cQuiver.appendChild(dots);
      hud.appendChild(cQuiver);
    })();
    /* wind */
    const cWind = document.createElement('div');
    cWind.className = 'grch-cell grch-wind';
    (function () {
      const s = document.createElement('span');
      s.textContent = 'WIND';
      const row = document.createElement('i');
      row.className = 'grch-wind__row';
      const track = document.createElement('i');
      track.className = 'grch-wind__track';
      const bar = document.createElement('i');
      bar.className = 'grch-wind__bar';
      track.appendChild(bar);
      const val = document.createElement('b');
      val.textContent = 'CALM';
      row.appendChild(track);
      row.appendChild(val);
      cWind.appendChild(s);
      cWind.appendChild(row);
      hud.appendChild(cWind);
    })();

    const cHits = cell('HITS');
    const cBulls = cell('BULL', 'is-bull');

    const stage = document.createElement('div');
    stage.className = 'grch-stage';
    const canvas = document.createElement('canvas');
    stage.appendChild(canvas);

    const hint = document.createElement('div');
    hint.className = 'grch-hint';
    const hintMsg = document.createElement('span');
    hintMsg.className = 'grch-hint__msg';
    hintMsg.textContent = 'DRAG TO AIM · PULL FURTHER · RELEASE TO SHOOT';
    const hintKeys = document.createElement('span');
    hintKeys.className = 'grch-hint__keys';
    hintKeys.textContent = '↑ ↓ angle · ← → power · SPACE shoot';
    hint.appendChild(hintMsg);
    hint.appendChild(hintKeys);

    host.appendChild(hud);
    host.appendChild(stage);
    host.appendChild(hint);

    const g = canvas.getContext('2d');

    /* the quiver dots (queried after construction) */
    const dots = cQuiver.children[1].children;

    /* ── tuning ──────────────────────────────────────── */
    const DEG = Math.PI / 180;
    const TAU = Math.PI * 2;
    const SHOTS = 10;
    const SETTLE = 1.05;              // beat to read the result
    const STAGE = 3;                  // shots before the target is re-placed
    const AIM_MIN = -85 * DEG;        // launch-angle clamp (screen coords)
    const AIM_MAX = -3 * DEG;
    const FONT = 'Orbitron, system-ui, sans-serif';
    const HINT_AIM = 'DRAG TO AIM · PULL FURTHER · RELEASE TO SHOOT';
    const BANDS = [
      ['#e8f1ff', 1.0],               // white  · 1–2
      ['#141a3a', 0.8],               // black  · 3–4
      ['#00d8ff', 0.6],               // blue   · 5–6
      ['#ff2e6d', 0.4],               // red    · 7–8
      ['#ffd23c', 0.2],               // gold   · 9–10
    ];
    const POP = ['#6b74a3', '#6b74a3', '#8b94c7', '#8b94c7', '#00f0ff',
                 '#00f0ff', '#ff2e6d', '#ff2e6d', '#ffd23c', '#ffd23c'];
    const ringColor = v => POP[Math.max(0, Math.min(9, v - 1))];
    const bandColor = v => BANDS[Math.max(0, Math.min(4, Math.floor((v - 1) / 2)))][0];

    const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

    /* ── state ───────────────────────────────────────── */
    let W = 0, H = 0, k = 1;
    let G = 980, V_MIN = 430, V_MAX = 1250, MAX_DRAG = 300;
    let groundY = 0, bowX = 0, bowY = 0;
    let shot = 0, score = 0, hits = 0, bulls = 0;
    let wind = 0;
    const target = { x: 0, y: 0, r: 40 };
    let aimA = -46 * DEG, aimP = 0.7;
    let phase = 'aim';                // aim | fly | settle | over
    let timer = 0, aiming = false;
    let arrow = null;                 // {x,y,px,py,vx,vy}
    let lastShot = null;
    let booted = false, overCalled = false;
    let flash = 0, shakeT = 0;
    let paused = false, alive = true;
    const boardArrows = [], groundArrows = [], parts = [], floats = [], trail = [];
    const stars = [];
    for (let i = 0; i < 64; i++) {
      stars.push({
        x: Math.random(), y: Math.random() * 0.62,
        r: Math.random() * 1.4 + 0.5,
        tw: Math.random() * TAU,
        d: Math.random() * 0.6 + 0.2,
      });
    }

    /* ── geometry ────────────────────────────────────── */
    function layout(w, h) {
      W = Math.max(300, Math.round(w || 720));
      H = Math.max(260, Math.round(h || 520));
      k = clamp(Math.min(W, H) / 700, 0.5, 1.8);
      G = 980 * k;
      V_MIN = 430 * Math.sqrt(k);
      V_MAX = 1250 * Math.sqrt(k);
      MAX_DRAG = 300 * k;
      groundY = H - Math.max(46, H * 0.13);
      bowX = W * 0.13;
      bowY = groundY - 12 * k;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (booted) placeTarget();
    }

    /** re-place the board for the stage the player is on */
    function placeTarget() {
      const prog = clamp(Math.floor(shot / STAGE) / 3, 0, 1);
      target.r = clamp(Math.min(W, H) * (0.075 - 0.025 * prog), 18, 52);
      target.x = clamp(W * (0.56 + 0.2 * prog), target.r + 70, W - target.r - 14);
      target.y = clamp(H * (0.3 + Math.random() * 0.22), target.r + 18, groundY - target.r - 44);
      boardArrows.length = 0;
      renderHUD();
    }

    /** a fresh gust for every arrow */
    function rollWind() {
      const prog = clamp(Math.floor(shot / STAGE) / 3, 0, 1);
      wind = (Math.random() * 2 - 1) * (35 + 55 * prog);
      if (Math.abs(wind) < 4) wind = 0;
      renderHUD();
    }

    /* ── HUD ─────────────────────────────────────────── */
    function renderHUD() {
      for (let i = 0; i < dots.length; i++) {
        const on = i >= shot;
        if (on) dots[i].classList.add('is-on');
        else dots[i].classList.remove('is-on');
      }
      cHits.val.textContent = hits + '/' + SHOTS;
      cBulls.val.textContent = String(bulls);
      const a = Math.min(1, Math.abs(wind) / 90);
      const bar = cWind.children[1].children[0].children[0];
      const val = cWind.children[1].children[1];
      bar.style.left = (wind >= 0 ? 50 : 50 - a * 50) + '%';
      bar.style.width = a * 50 + '%';
      if (Math.abs(wind) < 4) {
        val.textContent = 'CALM';
        cWind.classList.remove('is-right', 'is-left');
      } else {
        val.textContent = (wind > 0 ? '→ ' : '← ') + Math.round(Math.abs(wind));
        if (wind > 0) { cWind.classList.add('is-right'); cWind.classList.remove('is-left'); }
        else { cWind.classList.add('is-left'); cWind.classList.remove('is-right'); }
      }
    }

    /* ── flow ────────────────────────────────────────── */
    function start() {
      shot = 0; score = 0; hits = 0; bulls = 0;
      lastShot = null; arrow = null; aiming = false;
      overCalled = false; flash = 0; shakeT = 0; timer = 0;
      boardArrows.length = 0; groundArrows.length = 0;
      parts.length = 0; floats.length = 0; trail.length = 0;
      aimA = -46 * DEG; aimP = 0.7;
      booted = true;
      placeTarget();
      rollWind();
      phase = 'aim';
      ctx.setScore(0);
      hintMsg.textContent = HINT_AIM;
      renderHUD();
      ctx.sfx('start');
    }

    function applyAim(p) {
      aimA = clamp(Math.atan2(p.y - bowY, p.x - bowX), AIM_MIN, AIM_MAX);
      aimP = clamp(Math.hypot(p.x - bowX, p.y - bowY) / MAX_DRAG, 0.06, 1);
    }

    function fire() {
      if (phase !== 'aim' || paused || !alive) return;
      const v = V_MIN + aimP * (V_MAX - V_MIN);
      arrow = {
        x: bowX, y: bowY, px: bowX, py: bowY,
        vx: v * Math.cos(aimA), vy: v * Math.sin(aimA),
      };
      trail.length = 0;
      lastShot = null;
      shot++;
      phase = 'fly';
      aiming = false;
      hintMsg.textContent = '';
      ctx.sfx('click');
      renderHUD();
    }

    function burst(x, y, col, n) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU, sp = 50 + Math.random() * 170;
        parts.push({
          x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40,
          r: 1.8 + Math.random() * 2.6, col,
          t: 0, life: 0.45 + Math.random() * 0.4,
        });
      }
    }

    /** arrow crossed the board's plane → score where it punched through */
    function land(dist, onTarget) {
      const value = onTarget ? clamp(Math.ceil(10 - (dist / target.r) * 10), 1, 10) : 0;
      lastShot = { x: arrow.x, y: arrow.y, dist, value, onTarget };
      if (onTarget) {
        boardArrows.push({
          x: arrow.x - target.x, y: arrow.y - target.y,
          a: Math.atan2(arrow.vy, arrow.vx),
        });
        score += value;
        hits++;
        if (value === 10) bulls++;
        ctx.setScore(score);
        const col = bandColor(value);
        burst(arrow.x, arrow.y, col, value === 10 ? 20 : 12);
        floats.push({
          x: clamp(arrow.x, 50, W - 50), y: arrow.y - 16,
          txt: value === 10 ? '+10 ★ BULLSEYE' : '+' + value,
          col: ringColor(value), t: 0,
        });
        if (value === 10) { flash = 0.3; shakeT = 0.28; ctx.sfx('coin'); }
        else ctx.sfx('hit');
      } else {
        if (groundArrows.length > 6) groundArrows.shift();
        groundArrows.push({
          x: arrow.x, y: Math.min(arrow.y, groundY),
          a: Math.atan2(arrow.vy, arrow.vx),
        });
        burst(arrow.x, Math.min(arrow.y, groundY), '#7c5cff', 7);
        floats.push({
          x: clamp(arrow.x, 50, W - 50), y: Math.min(arrow.y, groundY) - 16,
          txt: 'MISS', col: '#8b94c7', t: 0,
        });
        ctx.sfx('tick');
      }
      phase = 'settle';
      timer = SETTLE;
      renderHUD();
    }

    function nextShot() {
      arrow = null;
      if (shot >= SHOTS) { gameOver(); return; }
      if (shot % STAGE === 0) placeTarget();
      rollWind();
      phase = 'aim';
      hintMsg.textContent = HINT_AIM;
      renderHUD();
    }

    function gameOver() {
      if (overCalled) return;
      overCalled = true;
      phase = 'over';
      hintMsg.textContent = 'OUT OF ARROWS';
      ctx.sfx('lose');
      ctx.gameOver({
        title: 'OUT OF ARROWS',
        message: `${hits}/${SHOTS} hits · ${bulls} bullseye${bulls === 1 ? '' : 's'}`,
      });
    }

    /* ── update ──────────────────────────────────────── */
    function update(dt) {
      if (phase === 'fly' && arrow) {
        /* exact integration for constant acceleration */
        arrow.px = arrow.x;
        arrow.py = arrow.y;
        arrow.x += arrow.vx * dt + 0.5 * wind * dt * dt;
        arrow.y += arrow.vy * dt + 0.5 * G * dt * dt;
        arrow.vx += wind * dt;
        arrow.vy += G * dt;

        trail.push({ x: arrow.x, y: arrow.y, t: 0 });
        for (let i = 0; i < trail.length; i++) trail[i].t += dt;
        while (trail.length && trail[0].t > 0.4) trail.shift();

        /* crossed the board's face? */
        if ((arrow.px - target.x) * (arrow.x - target.x) <= 0 && arrow.x !== arrow.px) {
          const s = (target.x - arrow.px) / (arrow.x - arrow.px);
          const yAt = arrow.py + (arrow.y - arrow.py) * s;
          const dist = Math.abs(yAt - target.y);
          if (dist <= target.r) {
            arrow.x = target.x;
            arrow.y = yAt;
            land(dist, true);
            return;
          }
        }
        if (arrow.x > W + 70 || arrow.y > H + 70 || arrow.x < -70) {
          land(0, false);            // gone — no arrow kept
          groundArrows.pop();
          return;
        }
        if (arrow.y >= groundY) {
          arrow.y = groundY;
          land(0, false);
          return;
        }
      }

      if (phase === 'settle') {
        timer -= dt;
        if (timer <= 0) nextShot();
      }

      for (const p of parts) {
        p.t += dt;
        p.vy += G * 0.55 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      for (let i = parts.length - 1; i >= 0; i--) if (parts[i].t >= parts[i].life) parts.splice(i, 1);
      for (const f of floats) f.t += dt;
      for (let i = floats.length - 1; i >= 0; i--) if (floats[i].t >= 0.95) floats.splice(i, 1);
      if (flash > 0) flash = Math.max(0, flash - dt * 2.2);
      if (shakeT > 0) shakeT = Math.max(0, shakeT - dt);
    }

    /* ── drawing ─────────────────────────────────────── */
    function drawSky(tSec) {
      const sky = g.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#05060f');
      sky.addColorStop(0.5, '#101538');
      sky.addColorStop(1, '#1e1748');
      g.fillStyle = sky;
      g.fillRect(0, 0, W, H);

      for (const s of stars) {
        const a = 0.3 + 0.5 * Math.abs(Math.sin(tSec * 1.5 + s.tw));
        g.globalAlpha = a * s.d;
        g.fillStyle = '#cfe6ff';
        g.beginPath();
        g.arc(s.x * W, s.y * H, s.r, 0, TAU);
        g.fill();
      }
      g.globalAlpha = 1;

      const mx = W - 74, my = 74;
      const glow = g.createRadialGradient(mx, my, 6, mx, my, 64);
      glow.addColorStop(0, 'rgba(255,244,214,.45)');
      glow.addColorStop(1, 'rgba(255,244,214,0)');
      g.fillStyle = glow;
      g.beginPath(); g.arc(mx, my, 64, 0, TAU); g.fill();
      g.fillStyle = '#fff6d8';
      g.beginPath(); g.arc(mx, my, 26, 0, TAU); g.fill();
      g.fillStyle = 'rgba(214,200,168,.5)';
      g.beginPath(); g.arc(mx - 8, my - 5, 6, 0, TAU); g.fill();
      g.beginPath(); g.arc(mx + 7, my + 8, 4, 0, TAU); g.fill();
    }

    function drawHills() {
      g.fillStyle = '#171341';
      g.beginPath();
      g.moveTo(0, groundY);
      for (let x = 0; x <= W; x += 24) {
        g.lineTo(x, groundY - 34 * k - Math.sin(x * 0.011) * 26 * k - Math.sin(x * 0.004 + 2) * 34 * k);
      }
      g.lineTo(W, groundY);
      g.closePath();
      g.fill();

      g.fillStyle = '#0f1030';
      g.beginPath();
      g.moveTo(0, groundY);
      for (let x = 0; x <= W; x += 24) {
        g.lineTo(x, groundY - 16 * k - Math.sin(x * 0.017 + 1) * 18 * k);
      }
      g.lineTo(W, groundY);
      g.closePath();
      g.fill();
    }

    function drawGround() {
      const gr = g.createLinearGradient(0, groundY, 0, H);
      gr.addColorStop(0, '#1b1746');
      gr.addColorStop(1, '#0c0b22');
      g.fillStyle = gr;
      g.fillRect(0, groundY, W, H - groundY);

      g.strokeStyle = '#ff2ecd';
      g.lineWidth = 2.5;
      g.shadowColor = '#ff2ecd';
      g.shadowBlur = 14;
      g.beginPath(); g.moveTo(0, groundY); g.lineTo(W, groundY); g.stroke();
      g.shadowBlur = 0;

      for (let x = 14; x < W; x += 54) {
        g.fillStyle = 'rgba(0,240,255,.3)';
        g.fillRect(x, groundY + 13, 22, 4);
        g.fillStyle = 'rgba(124,92,255,.3)';
        g.fillRect(x + 26, groundY + 30, 22, 4);
      }
    }

    function drawArrowShape(len) {
      g.lineCap = 'round';
      g.strokeStyle = '#dbe9f6';
      g.lineWidth = 2.6;
      g.beginPath(); g.moveTo(-len, 0); g.lineTo(-7, 0); g.stroke();
      g.fillStyle = '#ffd23c';
      g.beginPath(); g.moveTo(1, 0); g.lineTo(-9, -4.4); g.lineTo(-5.5, 0); g.lineTo(-9, 4.4); g.closePath(); g.fill();
      g.fillStyle = '#ff2e6d';
      g.beginPath(); g.moveTo(-len + 1, 0); g.lineTo(-len + 11, -5); g.lineTo(-len + 16, 0); g.closePath(); g.fill();
      g.fillStyle = '#00f0ff';
      g.beginPath(); g.moveTo(-len + 1, 0); g.lineTo(-len + 11, 5); g.lineTo(-len + 16, 0); g.closePath(); g.fill();
      g.lineCap = 'butt';
    }

    function drawStuck() {
      for (const a of boardArrows) {
        g.save();
        g.translate(target.x + a.x, target.y + a.y);
        g.rotate(a.a);
        g.scale(k, k);
        drawArrowShape(54);
        g.restore();
      }
      for (const a of groundArrows) {
        g.save();
        g.translate(a.x, a.y);
        g.rotate(a.a);
        g.scale(k, k);
        drawArrowShape(54);
        g.restore();
      }
    }

    function drawTarget(tSec) {
      const { x, y, r } = target;

      /* light beam down to the grass */
      const beam = g.createLinearGradient(x, y, x, groundY);
      beam.addColorStop(0, 'rgba(0,240,255,.15)');
      beam.addColorStop(1, 'rgba(0,240,255,0)');
      g.fillStyle = beam;
      g.beginPath();
      g.moveTo(x - r * 0.55, y);
      g.lineTo(x + r * 0.55, y);
      g.lineTo(x + r * 1.5, groundY);
      g.lineTo(x - r * 1.5, groundY);
      g.closePath();
      g.fill();

      const gg = g.createRadialGradient(x, groundY, 2, x, groundY, r * 2.3);
      gg.addColorStop(0, 'rgba(0,240,255,.32)');
      gg.addColorStop(1, 'rgba(0,240,255,0)');
      g.fillStyle = gg;
      g.beginPath(); g.ellipse(x, groundY, r * 2.3, r * 0.5, 0, 0, TAU); g.fill();

      for (const band of BANDS) {
        g.fillStyle = band[0];
        g.beginPath(); g.arc(x, y, r * band[1], 0, TAU); g.fill();
      }
      g.strokeStyle = 'rgba(6,7,15,.6)';
      g.lineWidth = 1.4;
      for (const f of [0.8, 0.6, 0.4, 0.2, 0.1]) {
        g.beginPath(); g.arc(x, y, r * f, 0, TAU); g.stroke();
      }

      g.strokeStyle = '#7c5cff';
      g.lineWidth = 3;
      g.shadowColor = '#7c5cff';
      g.shadowBlur = 14 + 6 * Math.sin(tSec * 3);
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke();
      g.shadowBlur = 0;

      const pulse = 0.5 + 0.5 * Math.sin(tSec * 4);
      g.fillStyle = `rgba(255,255,255,${0.3 + 0.5 * pulse})`;
      g.beginPath(); g.arc(x, y, Math.max(2, r * 0.07), 0, TAU); g.fill();
    }

    function drawBow(tSec) {
      const pull = phase === 'aim' ? 10 + aimP * 34 : 6;
      g.save();
      g.translate(bowX, bowY);
      g.rotate(aimA + (phase === 'aim' ? 0 : Math.sin(tSec * 1.7) * 0.03));
      g.scale(k, k);

      /* limbs */
      const grad = g.createLinearGradient(-6, -46, 34, 46);
      grad.addColorStop(0, '#ffb830');
      grad.addColorStop(0.5, '#ffd23c');
      grad.addColorStop(1, '#ff8a3d');
      g.strokeStyle = grad;
      g.lineWidth = 6;
      g.lineJoin = 'round';
      g.shadowColor = '#ffd23c';
      g.shadowBlur = 14;
      g.beginPath();
      g.moveTo(-4, -46);
      g.quadraticCurveTo(34, 0, -4, 46);
      g.stroke();
      g.shadowBlur = 0;

      /* grip */
      g.fillStyle = '#2a2350';
      g.fillRect(11, -9, 9, 18);
      g.strokeStyle = 'rgba(255,255,255,.35)';
      g.lineWidth = 1.4;
      g.strokeRect(11, -9, 9, 18);

      /* string */
      g.strokeStyle = 'rgba(255,255,255,.85)';
      g.lineWidth = 1.8;
      g.beginPath();
      g.moveTo(-4, -46);
      g.lineTo(-4 - pull, 0);
      g.lineTo(-4, 46);
      g.stroke();

      /* nocked arrow */
      if (phase === 'aim') {
        g.save();
        g.translate(-4 - pull, 0);
        drawArrowShape(58);
        g.restore();
      }
      g.restore();
      g.lineJoin = 'miter';
    }

    function drawAim() {
      const v = V_MIN + aimP * (V_MAX - V_MIN);

      /* trajectory preview (same integrator as the real flight) */
      let vx = v * Math.cos(aimA), vy = v * Math.sin(aimA);
      let x = bowX, y = bowY;
      const step = 0.035;
      for (let i = 0; i < 14; i++) {
        x += vx * step + 0.5 * wind * step * step;
        y += vy * step + 0.5 * G * step * step;
        vx += wind * step;
        vy += G * step;
        if (y > groundY || x > W || x < 0) break;
        g.globalAlpha = Math.max(0.1, 0.72 - i * 0.045);
        g.fillStyle = i > 8 ? '#ff2ecd' : '#00f0ff';
        g.beginPath();
        g.arc(x, y, Math.max(1.4, 3 - i * 0.11), 0, TAU);
        g.fill();
      }
      g.globalAlpha = 1;

      /* aim ray */
      const len = 54 + aimP * 130;
      g.save();
      g.setLineDash([6, 9]);
      g.strokeStyle = 'rgba(255,255,255,.5)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(bowX, bowY);
      g.lineTo(bowX + Math.cos(aimA) * len, bowY + Math.sin(aimA) * len);
      g.stroke();
      g.restore();

      /* power ring + read-out */
      const R = 56 * k;
      g.strokeStyle = 'rgba(255,255,255,.12)';
      g.lineWidth = 6;
      g.beginPath(); g.arc(bowX, bowY, R, -Math.PI / 2, -Math.PI / 2 + TAU * 0.75); g.stroke();
      g.strokeStyle = aimP > 0.85 ? '#ffd23c' : aimP > 0.55 ? '#ff2ecd' : '#00f0ff';
      g.shadowColor = g.strokeStyle;
      g.shadowBlur = 12;
      g.beginPath();
      g.arc(bowX, bowY, R, -Math.PI / 2, -Math.PI / 2 + TAU * 0.75 * aimP);
      g.stroke();
      g.shadowBlur = 0;

      g.textAlign = 'center';
      g.font = `800 ${Math.max(11, 13 * k)}px ${FONT}`;
      g.fillStyle = 'rgba(255,255,255,.9)';
      g.fillText(Math.round(aimP * 100) + '%', bowX, bowY + R + 16 * k);
      g.textAlign = 'left';
    }

    function drawFlying() {
      for (const t of trail) {
        const kk = 1 - t.t / 0.4;
        g.globalAlpha = kk * 0.4;
        g.fillStyle = '#ffd23c';
        g.beginPath();
        g.arc(t.x, t.y, 2 + kk * 6, 0, TAU);
        g.fill();
      }
      g.globalAlpha = 1;
      if (!arrow) return;
      g.save();
      g.translate(arrow.x, arrow.y);
      g.rotate(Math.atan2(arrow.vy, arrow.vx));
      g.scale(k, k);
      g.shadowColor = '#ffd23c';
      g.shadowBlur = 10;
      drawArrowShape(58);
      g.shadowBlur = 0;
      g.restore();
    }

    function drawParts() {
      for (const p of parts) {
        const kk = p.t / p.life;
        g.globalAlpha = Math.max(0, 1 - kk);
        g.fillStyle = p.col;
        g.beginPath(); g.arc(p.x, p.y, p.r * (1 - kk * 0.4), 0, TAU); g.fill();
      }
      g.globalAlpha = 1;
    }

    function drawFloats() {
      g.textAlign = 'center';
      for (const f of floats) {
        const kk = f.t / 0.95;
        g.globalAlpha = Math.max(0, 1 - kk);
        g.font = `800 ${f.txt.length > 5 ? 17 : 26}px ${FONT}`;
        g.fillStyle = f.col;
        g.shadowColor = f.col;
        g.shadowBlur = 14;
        g.fillText(f.txt, f.x, f.y - 10 - kk * 44);
        g.shadowBlur = 0;
      }
      g.globalAlpha = 1;
      g.textAlign = 'left';
    }

    function render(tSec) {
      g.save();
      if (shakeT > 0) {
        const m = shakeT * 14;
        g.translate(Math.sin(tSec * 71) * m, Math.cos(tSec * 53) * m);
      }
      drawSky(tSec);
      drawHills();
      drawGround();
      drawTarget(tSec);
      drawStuck();
      drawBow(tSec);
      if (phase === 'aim') drawAim();
      if (phase === 'fly') drawFlying();
      drawParts();
      drawFloats();
      g.restore();

      const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.72);
      vg.addColorStop(0, 'rgba(6,7,15,0)');
      vg.addColorStop(1, 'rgba(6,7,15,.5)');
      g.fillStyle = vg;
      g.fillRect(0, 0, W, H);

      if (flash > 0) {
        g.fillStyle = `rgba(255,255,255,${flash})`;
        g.fillRect(0, 0, W, H);
      }
    }

    /* ── input ───────────────────────────────────────── */
    function local(e) {
      const r = stage.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    const onDown = e => {
      if (!alive || paused || phase !== 'aim') return;
      if (e.cancelable) e.preventDefault();
      aiming = true;
      if (e.pointerId != null && stage.setPointerCapture) {
        try { stage.setPointerCapture(e.pointerId); } catch (_) {}
      }
      applyAim(local(e));
    };
    const onMove = e => {
      if (!aiming) return;
      if (e.cancelable) e.preventDefault();
      applyAim(local(e));
    };
    const onUp = e => {
      if (!aiming) return;
      aiming = false;
      if (e && e.cancelable) e.preventDefault();
      fire();
    };
    const onCancel = () => { aiming = false; };
    const onKey = e => {
      if (!e || e.repeat || !alive || paused) return;
      const key = e.key;
      let used = true;
      if (key === 'ArrowUp') aimA = clamp(aimA - 1.5 * DEG, AIM_MIN, AIM_MAX);
      else if (key === 'ArrowDown') aimA = clamp(aimA + 1.5 * DEG, AIM_MIN, AIM_MAX);
      else if (key === 'ArrowRight') aimP = clamp(aimP + 0.05, 0.06, 1);
      else if (key === 'ArrowLeft') aimP = clamp(aimP - 0.05, 0.06, 1);
      else if (key === ' ' || key === 'Enter') fire();
      else used = false;
      if (used && e.preventDefault) e.preventDefault();
    };

    stage.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey);

    /* ── loop ────────────────────────────────────────── */
    let raf = 0, last = 0;
    function frame(now) {
      if (!alive) return;
      raf = requestAnimationFrame(frame);
      if (!last) last = now;
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.05) dt = 0.05;
      if (!paused) update(dt);
      render(now / 1000);
    }

    function readSize(w, h) {
      const sw = stage.clientWidth || (stage.getBoundingClientRect && stage.getBoundingClientRect().width) || w || ctx.width || 720;
      const sh = stage.clientHeight || (stage.getBoundingClientRect && stage.getBoundingClientRect().height) || h || ctx.height || 520;
      return { w: sw, h: sh };
    }

    const s0 = readSize();
    layout(s0.w, s0.h);
    start();
    raf = requestAnimationFrame(frame);

    /* ── lifecycle ───────────────────────────────────── */
    return {
      pause() { paused = true; },
      resume() { paused = false; last = 0; },
      restart() { start(); },
      resize(w, h) {
        const s = readSize(w, h);
        layout(s.w, s.h);
        renderHUD();
      },
      destroy() {
        alive = false;
        cancelAnimationFrame(raf);
        stage.removeEventListener('pointerdown', onDown);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
        window.removeEventListener('keydown', onKey);
        for (const el of [hud, stage, hint]) {
          if (el.parentNode) el.parentNode.removeChild(el);
        }
        host.classList.remove('grch-host');
      },
      /* read-only introspection for the headless smoke test */
      getState() {
        return {
          phase, shot, shotsLeft: SHOTS - shot, score, hits, bulls,
          stage: Math.floor(shot / STAGE),
          wind,
          aim: { angleDeg: aimA / DEG, power: aimP },
          bow: { x: bowX, y: bowY },
          target: { x: target.x, y: target.y, r: target.r },
          physics: { g: G, vmin: V_MIN, vmax: V_MAX, maxDrag: MAX_DRAG },
          arrow: arrow ? { x: arrow.x, y: arrow.y } : null,
          lastShot,
          boardArrows: boardArrows.length,
          groundArrows: groundArrows.length,
          floats: floats.length,
          hint: hintMsg.textContent,
        };
      },
    };
  },
});
