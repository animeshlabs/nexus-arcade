/* ═══════════════════════════════════════════════════════
   BUBBLE SHOOTER — neon rework of the supplied logic
   (grid/cluster/orphan logic kept, themed + polished)
   ═══════════════════════════════════════════════════════ */
registerGame({
  id: 'bubble',
  title: 'Bubble Shooter',
  genre: 'Puzzle',
  emoji: '🫧',
  colors: ['#00e5ff', '#7c5cff'],
  description: 'Aim, bounce and blast — group 3+ matching bubbles to pop them. Clear the board before the stack crosses the danger line.',
  controls: [
    { key: 'MOUSE / DRAG', label: 'Aim' },
    { key: 'CLICK · TAP · FIRE', label: 'Shoot' },
    { key: '← → · SPACE', label: 'Aim & shoot' },
  ],
  create(ctx) {
    'use strict';

    /* neon palette (matches platform theme) */
    const COLORS = ['#ff2e55', '#00e5ff', '#2dff9e', '#ffd400', '#7c5cff', '#ff9a3d'];
    const LEVELS = {
      easy:   { colors: 4, rows: 4, speed: 6 },
      medium: { colors: 5, rows: 5, speed: 8 },
      hard:   { colors: 6, rows: 6, speed: 10 },
    };

    const W = 400, H = 560;
    const COLS = 8, R = 18, ROW_H = R * 1.75;
    const OX = (W - COLS * R * 2) / 2;   // centre the grid (56)
    const OY = 10;
    const GUN = { x: W / 2, y: H - 40 };
    const DANGER_Y = H - 80;

    const state = {
      difficulty: null,
      grid: [],
      score: 0,
      aimAngle: -Math.PI / 2,
      current: 0, next: 0,
      flying: null,
      phase: 'menu',            // menu | play | over
    };
    let paused = false;

    function cfg() { return LEVELS[state.difficulty]; }
    function colsInRow(row) { return row % 2 === 0 ? COLS : COLS - 1; }
    function randomColor() { return Math.floor(Math.random() * cfg().colors); }

    function cellCenter(row, col) {
      const odd = row % 2 === 1;
      return {
        x: R + col * (R * 2) + (odd ? R : 0) + OX,
        y: R + row * ROW_H + OY,
      };
    }

    function initGrid() {
      state.grid = [];
      for (let r = 0; r < cfg().rows; r++) {
        const row = [], n = colsInRow(r);
        for (let c = 0; c < n; c++) row.push(randomColor());
        state.grid.push(row);
      }
    }

    function neighbors(row, col) {
      const odd = row % 2 === 1;
      const deltas = odd
        ? [[0, -1], [0, 1], [-1, 0], [-1, 1], [1, 0], [1, 1]]
        : [[0, -1], [0, 1], [-1, -1], [-1, 0], [1, -1], [1, 0]];
      const out = [];
      for (const [dr, dc] of deltas) {
        const rr = row + dr, cc = col + dc;
        if (rr >= 0 && rr < state.grid.length && cc >= 0 &&
            cc < state.grid[rr].length && state.grid[rr][cc] !== null) {
          out.push([rr, cc]);
        }
      }
      return out;
    }

    /* ── cluster / ceiling / orphan logic (from source) ── */
    function findCluster(row, col) {
      const color = state.grid[row][col];
      if (color === null) return [];
      const visited = new Set(), stack = [[row, col]], cluster = [];
      while (stack.length) {
        const [r, c] = stack.pop();
        const key = r + ',' + c;
        if (visited.has(key)) continue;
        visited.add(key);
        if (state.grid[r][c] !== color) continue;
        cluster.push([r, c]);
        neighbors(r, c).forEach(([nr, nc]) => stack.push([nr, nc]));
      }
      return cluster;
    }

    function connectedToCeiling() {
      const visited = new Set(), stack = [];
      if (!state.grid.length) return visited;
      for (let c = 0; c < state.grid[0].length; c++)
        if (state.grid[0][c] !== null) stack.push([0, c]);
      while (stack.length) {
        const [r, c] = stack.pop();
        const key = r + ',' + c;
        if (visited.has(key)) continue;
        visited.add(key);
        neighbors(r, c).forEach(([nr, nc]) => stack.push([nr, nc]));
      }
      return visited;
    }

    /* orphans now FALL with gravity instead of vanishing */
    const falling = [];
    function dropOrphans() {
      const connected = connectedToCeiling();
      let dropped = 0;
      for (let r = 0; r < state.grid.length; r++) {
        for (let c = 0; c < state.grid[r].length; c++) {
          if (state.grid[r][c] !== null && !connected.has(r + ',' + c)) {
            const p = cellCenter(r, c);
            falling.push({ x: p.x, y: p.y, vy: 40 + Math.random() * 60,
                           vx: (Math.random() - 0.5) * 60, color: state.grid[r][c] });
            state.grid[r][c] = null;
            dropped++;
          }
        }
      }
      while (state.grid.length &&
             state.grid[state.grid.length - 1].every(v => v === null)) {
        state.grid.pop();
      }
      return dropped;
    }

    /* ── pop juice: particles + floating scores ──────── */
    const particles = [], floats = [];
    function burst(x, y, colorIdx, n = 6) {
      const col = COLORS[colorIdx];
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 160;
        particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                         life: 0.55 + Math.random() * 0.3, t: 0,
                         r: 2 + Math.random() * 3.5, color: col });
      }
    }
    function float(x, y, txt) {
      floats.push({ x, y, txt, t: 0 });
    }

    function snapBubble(x, y, color) {
      let best = null, bestDist = Infinity;
      const maxRows = Math.max(state.grid.length + 1, cfg().rows + 2);
      for (let r = 0; r < maxRows; r++) {
        const n = colsInRow(r);
        if (!state.grid[r]) state.grid[r] = Array(n).fill(null);
        while (state.grid[r].length < n) state.grid[r].push(null);
        for (let c = 0; c < n; c++) {
          if (state.grid[r][c] !== null) continue;
          const p = cellCenter(r, c);
          const d = Math.hypot(p.x - x, p.y - y);
          if (d < bestDist) { bestDist = d; best = { r, c }; }
        }
      }
      if (!best) return;
      state.grid[best.r][best.c] = color;

      const cluster = findCluster(best.r, best.c);
      if (cluster.length >= 3) {
        let gained = cluster.length * 10;
        cluster.forEach(([r, c]) => {
          const p = cellCenter(r, c);
          burst(p.x, p.y, state.grid[r][c]);
          state.grid[r][c] = null;
        });
        const dropped = dropOrphans();
        if (dropped) {
          gained += dropped * 15;
          Sfx.play('coin');
        }
        state.score += gained;
        const bp = cellCenter(best.r, best.c);
        float(bp.x, bp.y, '+' + gained);
        Sfx.play(cluster.length >= 5 ? 'power' : 'tick');
      } else {
        Sfx.play('click');
      }
      ctx.setScore(state.score);
      checkEnd();
    }

    function checkEnd() {
      let any = false, tooLow = false;
      for (let r = 0; r < state.grid.length; r++) {
        for (let c = 0; c < state.grid[r].length; c++) {
          if (state.grid[r][c] !== null) {
            any = true;
            if (cellCenter(r, c).y + R > DANGER_Y) tooLow = true;
          }
        }
      }
      if (!any) endGame(true);
      else if (tooLow) endGame(false);
    }

    function endGame(won) {
      if (state.phase === 'over') return;
      state.phase = 'over';
      state.flying = null;
      Sfx.play(won ? 'win' : 'hit');
      ctx.gameOver({
        title: won ? 'BOARD CLEAR!' : 'STACK OVERFLOW',
        message: won
          ? `You cleared ${state.difficulty} — every bubble popped.`
          : 'The bubbles crossed the danger line.',
      });
    }

    /* ── shooting & simulation ─────────────────────── */
    function shoot() {
      if (state.phase !== 'play' || state.flying || paused) return;
      const sp = cfg().speed * 60;                    // px/sec (60fps-orig scaled)
      state.flying = {
        x: GUN.x, y: GUN.y,
        vx: Math.cos(state.aimAngle) * sp,
        vy: Math.sin(state.aimAngle) * sp,
        color: state.current,
      };
      state.current = state.next;
      state.next = randomColor();
      Sfx.play('jump');
    }

    function moveFlying(dt) {
      const b = state.flying;
      let remain = Math.hypot(b.vx, b.vy) * dt;
      const speed = Math.hypot(b.vx, b.vy) || 1;
      const ux = b.vx / speed, uy = b.vy / speed;
      while (remain > 0) {
        const step = Math.min(remain, 5);
        b.x += ux * step; b.y += uy * step;
        remain -= step;

        if (b.x - R < 0) { b.x = R; b.vx = Math.abs(b.vx); }
        if (b.x + R > W) { b.x = W - R; b.vx = -Math.abs(b.vx); }
        if (b.y - R <= 0) { snapBubble(b.x, R, b.color); state.flying = null; return; }

        let hit = false;
        for (let r = 0; r < state.grid.length && !hit; r++) {
          for (let c = 0; c < state.grid[r].length; c++) {
            if (state.grid[r][c] === null) continue;
            const p = cellCenter(r, c);
            if (Math.hypot(p.x - b.x, p.y - b.y) < R * 1.85) { hit = true; break; }
          }
        }
        if (hit) { snapBubble(b.x, b.y, b.color); state.flying = null; return; }
      }
    }

    function update(dt) {
      if (state.flying) moveFlying(dt);

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.t += dt;
        p.vy += 420 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.t >= p.life) particles.splice(i, 1);
      }
      for (let i = falling.length - 1; i >= 0; i--) {
        const f = falling[i];
        f.vy += 520 * dt;
        f.x += f.vx * dt; f.y += f.vy * dt;
        if (f.y > H + R * 2) falling.splice(i, 1);
      }
      for (let i = floats.length - 1; i >= 0; i--) {
        floats[i].t += dt;
        if (floats[i].t > 0.9) floats.splice(i, 1);
      }
    }

    /* ── rendering ──────────────────────────────────── */
    let shakeT = 0;

    function drawBackground() {
      const g = g2d.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#0a0f26');
      g.addColorStop(0.55, '#070a18');
      g.addColorStop(1, '#0b0720');
      g2d.fillStyle = g;
      g2d.fillRect(0, 0, W, H);

      /* faint dot grid */
      g2d.fillStyle = 'rgba(255,255,255,.05)';
      for (let y = 20; y < H; y += 30)
        for (let x = 20; x < W; x += 30) {
          g2d.beginPath(); g2d.arc(x, y, 1, 0, 7); g2d.fill();
        }
      /* side glow rails */
      g2d.save();
      g2d.globalAlpha = 0.5;
      const rail = g2d.createLinearGradient(0, 0, 0, H);
      rail.addColorStop(0, 'rgba(0,229,255,0)');
      rail.addColorStop(0.5, 'rgba(0,229,255,.35)');
      rail.addColorStop(1, 'rgba(124,92,255,.35)');
      g2d.fillStyle = rail;
      g2d.fillRect(0, 0, 4, H);
      g2d.fillRect(W - 4, 0, 4, H);
      g2d.restore();
    }

    function drawBubble(x, y, ci, scale = 1) {
      const r = (R - 1) * scale;
      g2d.save();
      g2d.shadowColor = COLORS[ci];
      g2d.shadowBlur = 9 * scale;
      const g = g2d.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.12, x, y, r);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.22, COLORS[ci]);
      g.addColorStop(1, shade(COLORS[ci], -0.42));
      g2d.fillStyle = g;
      g2d.beginPath(); g2d.arc(x, y, r, 0, 7); g2d.fill();
      g2d.shadowBlur = 0;
      /* glass highlight */
      g2d.fillStyle = 'rgba(255,255,255,.55)';
      g2d.beginPath();
      g2d.ellipse(x - r * 0.34, y - r * 0.42, r * 0.3, r * 0.18, -0.6, 0, 7);
      g2d.fill();
      g2d.restore();
    }

    function shade(hex, amt) {
      const n = parseInt(hex.slice(1), 16);
      let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
      r = Math.round(Math.max(0, Math.min(255, r + 255 * amt)));
      g = Math.round(Math.max(0, Math.min(255, g + 255 * amt)));
      b = Math.round(Math.max(0, Math.min(255, b + 255 * amt)));
      return `rgb(${r},${g},${b})`;
    }

    function drawDanger(t) {
      const pulse = 0.45 + Math.abs(Math.sin(t * 3)) * 0.4;
      g2d.save();
      g2d.strokeStyle = `rgba(255,46,85,${pulse})`;
      g2d.lineWidth = 2;
      g2d.setLineDash([10, 8]);
      g2d.lineDashOffset = -t * 30;
      g2d.shadowColor = '#ff2e55';
      g2d.shadowBlur = 12;
      g2d.beginPath();
      g2d.moveTo(6, DANGER_Y); g2d.lineTo(W - 6, DANGER_Y);
      g2d.stroke();
      g2d.setLineDash([]);
      g2d.shadowBlur = 0;
      g2d.font = '700 9px Orbitron, sans-serif';
      g2d.fillStyle = `rgba(255,46,85,${pulse + 0.2})`;
      g2d.textAlign = 'right';
      g2d.fillText('DANGER', W - 10, DANGER_Y - 6);
      g2d.restore();
    }

    function drawAim(t) {
      if (state.flying || state.phase !== 'play') return;
      let x = GUN.x, y = GUN.y;
      let vx = Math.cos(state.aimAngle), vy = Math.sin(state.aimAngle);
      g2d.save();
      for (let i = 0; i < 110; i++) {
        x += vx * 7; y += vy * 7;
        if (x < R) { x = R; vx = Math.abs(vx); }
        if (x > W - R) { x = W - R; vx = -Math.abs(vx); }
        if (y < 0) break;
        /* stop on first bubble → draw reticle */
        let hit = false;
        for (let r = 0; r < state.grid.length && !hit; r++)
          for (let c = 0; c < state.grid[r].length; c++) {
            if (state.grid[r][c] === null) continue;
            const p = cellCenter(r, c);
            if (Math.hypot(p.x - x, p.y - y) < R * 1.7) { hit = true; break; }
          }
        if (hit) {
          g2d.strokeStyle = 'rgba(255,255,255,.7)';
          g2d.lineWidth = 1.5;
          g2d.beginPath(); g2d.arc(x, y, R, 0, 7); g2d.stroke();
          break;
        }
        if (i % 3 === 0) {
          const a = 0.75 - i * 0.006;
          if (a <= 0) break;
          g2d.fillStyle = `rgba(0,240,255,${a})`;
          g2d.beginPath(); g2d.arc(x, y, 2.4, 0, 7); g2d.fill();
        }
      }
      g2d.restore();
    }

    function drawGun(t) {
      const a = state.aimAngle;
      g2d.save();
      g2d.translate(GUN.x, GUN.y);
      /* barrel */
      g2d.rotate(a);
      const bg = g2d.createLinearGradient(0, 0, 26, 0);
      bg.addColorStop(0, '#7c5cff'); bg.addColorStop(1, '#00e5ff');
      g2d.fillStyle = bg;
      g2d.shadowColor = '#00e5ff'; g2d.shadowBlur = 10;
      g2d.beginPath();
      g2d.roundRect(4, -7, 26, 14, 7);
      g2d.fill();
      g2d.restore();
      /* base */
      g2d.save();
      g2d.shadowColor = '#7c5cff'; g2d.shadowBlur = 14;
      g2d.fillStyle = 'rgba(124,92,255,.25)';
      g2d.strokeStyle = '#7c5cff'; g2d.lineWidth = 2;
      g2d.beginPath(); g2d.arc(GUN.x, GUN.y, 20, 0, 7); g2d.fill(); g2d.stroke();
      g2d.restore();
      /* loaded bubble */
      drawBubble(GUN.x, GUN.y, state.current, 0.95);
      /* next preview */
      g2d.save();
      g2d.font = '700 9px Orbitron, sans-serif';
      g2d.fillStyle = 'rgba(255,255,255,.45)';
      g2d.textAlign = 'left';
      g2d.fillText('NEXT', 14, H - 16);
      g2d.restore();
      drawBubble(52, H - 26, state.next, 0.7);
    }

    /* ── frame compose ──────────────────────────────── */
    function draw(t) {
      drawBackground();
      drawDanger(t);

      for (let r = 0; r < state.grid.length; r++)
        for (let c = 0; c < state.grid[r].length; c++) {
          if (state.grid[r][c] === null) continue;
          const p = cellCenter(r, c);
          drawBubble(p.x, p.y, state.grid[r][c]);
        }

      falling.forEach(f => drawBubble(f.x, f.y, f.color, 0.92));
      drawAim(t);

      if (state.flying) drawBubble(state.flying.x, state.flying.y, state.flying.color);
      else drawGun(t);

      /* particles (additive) */
      g2d.save();
      g2d.globalCompositeOperation = 'lighter';
      particles.forEach(p => {
        const a = 1 - p.t / p.life;
        g2d.globalAlpha = Math.max(0, a);
        g2d.fillStyle = p.color;
        g2d.beginPath(); g2d.arc(p.x, p.y, p.r * a, 0, 7); g2d.fill();
      });
      g2d.restore();

      /* floating scores */
      g2d.save();
      g2d.textAlign = 'center';
      g2d.font = '900 15px Orbitron, sans-serif';
      floats.forEach(f => {
        g2d.globalAlpha = Math.max(0, 1 - f.t / 0.9);
        g2d.shadowColor = '#00e5ff'; g2d.shadowBlur = 8;
        g2d.fillStyle = '#fff';
        g2d.fillText(f.txt, f.x, f.y - f.t * 44);
      });
      g2d.restore();
    }

    /* ── main loop ──────────────────────────────────── */
    let raf = 0, last = 0, alive = true;
    function loop(now) {
      if (!alive) return;
      raf = requestAnimationFrame(loop);
      if (!last) last = now;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!paused && state.phase === 'play') update(dt);
      draw(now / 1000);
    }

    /* ── DOM ────────────────────────────────────────── */
    const host = ctx.container;
    host.classList.add('bs-host');
    host.innerHTML = `
      <div class="bs-stage">
        <canvas class="bs-canvas" width="${W}" height="${H}"></canvas>
        <span class="bs-badge" hidden></span>
        <button class="bs-fire" type="button">FIRE</button>
        <div class="bs-menu">
          <div class="bs-menu__in">
            <h3>BUBBLE <span>SHOOTER</span></h3>
            <p>Choose your difficulty</p>
            <div class="bs-levels">
              <button type="button" data-lv="easy"><b>Easy</b><i>4 colors · 4 rows · slow</i></button>
              <button type="button" data-lv="medium"><b>Medium</b><i>5 colors · 5 rows · medium</i></button>
              <button type="button" data-lv="hard"><b>Hard</b><i>6 colors · 6 rows · fast</i></button>
            </div>
            <div class="bs-hint">Aim with mouse or finger — shoot with click, tap or FIRE</div>
          </div>
        </div>
      </div>`;
    const cv = host.querySelector('.bs-canvas');
    const g2d = cv.getContext('2d');
    const badge = host.querySelector('.bs-badge');
    const menu = host.querySelector('.bs-menu');

    /* ── sizing ─────────────────────────────────────── */
    function fit(w, h) {
      w = w || host.clientWidth;
      h = h || host.clientHeight;
      const s = Math.min((w - 10) / W, (h - 10) / H) || 1;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      g2d.setTransform(dpr, 0, 0, dpr, 0, 0);
      cv.style.width = Math.round(W * s) + 'px';
      cv.style.height = Math.round(H * s) + 'px';
    }

    /* ── game flow ──────────────────────────────────── */
    function startRound() {
      initGrid();
      state.score = 0;
      state.current = randomColor();
      state.next = randomColor();
      state.flying = null;
      state.aimAngle = -Math.PI / 2;
      state.phase = 'play';
      particles.length = 0; falling.length = 0; floats.length = 0;
      ctx.setScore(0);
      badge.hidden = false;
      badge.textContent = state.difficulty;
      Sfx.play('start');
    }

    function pickDifficulty(lv) {
      state.difficulty = lv;
      menu.classList.add('is-out');
      Sfx.play('coin');
      setTimeout(() => { menu.style.display = 'none'; }, 260);
      startRound();
    }

    host.querySelectorAll('.bs-levels button').forEach(b =>
      b.addEventListener('click', () => pickDifficulty(b.dataset.lv)));

    /* ── input ──────────────────────────────────────── */
    function setAim(e) {
      if (state.phase !== 'play') return;
      const rect = cv.getBoundingClientRect();
      const pt = e.touches ? e.touches[0] : e;
      const x = (pt.clientX - rect.left) * (W / rect.width);
      const y = (pt.clientY - rect.top) * (H / rect.height);
      let angle = Math.atan2(y - GUN.y, x - GUN.x);
      const minA = -Math.PI + 0.2, maxA = -0.2;
      if (angle > 0) angle = y < GUN.y ? (x < GUN.x ? -Math.PI + 0.2 : -0.2) : -0.2;
      state.aimAngle = Math.max(minA, Math.min(maxA, angle));
    }

    const onMouseMove = e => setAim(e);
    const onTouchStart = e => { setAim(e); };
    const onTouchMove = e => { e.preventDefault(); setAim(e); };
    const onTouchEnd = e => { e.preventDefault(); shoot(); };
    const onClick = () => shoot();
    const onKey = e => {
      if (state.phase !== 'play') return;
      if (e.key === 'ArrowLeft') { state.aimAngle = Math.max(-Math.PI + 0.2, state.aimAngle - 0.07); e.preventDefault(); }
      else if (e.key === 'ArrowRight') { state.aimAngle = Math.min(-0.2, state.aimAngle + 0.07); e.preventDefault(); }
      else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); shoot(); }
    };

    cv.addEventListener('mousemove', onMouseMove);
    cv.addEventListener('touchstart', onTouchStart, { passive: true });
    cv.addEventListener('touchmove', onTouchMove, { passive: false });
    cv.addEventListener('touchend', onTouchEnd, { passive: false });
    cv.addEventListener('click', onClick);
    window.addEventListener('keydown', onKey);
    host.querySelector('.bs-fire').addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation(); shoot();
    });

    const onResize = () => fit();
    window.addEventListener('resize', onResize);

    /* ── go ─────────────────────────────────────────── */
    fit();
    raf = requestAnimationFrame(loop);

    return {
      pause() { paused = true; },
      resume() { paused = false; last = 0; },
      restart() { if (state.difficulty) startRound(); },
      resize(w, h) { fit(w, h); },
      destroy() {
        alive = false;
        cancelAnimationFrame(raf);
        cv.removeEventListener('mousemove', onMouseMove);
        cv.removeEventListener('touchstart', onTouchStart);
        cv.removeEventListener('touchmove', onTouchMove);
        cv.removeEventListener('touchend', onTouchEnd);
        cv.removeEventListener('click', onClick);
        window.removeEventListener('keydown', onKey);
        window.removeEventListener('resize', onResize);
        host.classList.remove('bs-host');
        host.innerHTML = '';
      },
    };
  },
});
