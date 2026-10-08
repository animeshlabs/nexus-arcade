/* ═══════════════════════════════════════════════════════
   NEON PAC — responsive Pac-Man (canvas 2D, touch friendly)
   ═══════════════════════════════════════════════════════ */
registerGame({
  id: 'pacman',
  title: 'Neon Pac',
  genre: 'Arcade',
  emoji: '🟡',
  colors: ['#ffd400', '#00e5ff'],
  description: 'Clear the neon maze, chomp every dot and outsmart the ghosts. Grab a power pellet and turn the tables.',
  featured: true,
  controls: [
    { key: '←↑↓→ / WASD', label: 'Move' },
    { key: 'SWIPE', label: 'Move on mobile' },
    { key: 'ESC', label: 'Pause' },
  ],
  create(ctx) {
    'use strict';

    /* ── maze (28 × 31) ─────────────────────────────── */
    const RAW = [
      '############################',
      '#............##............#',
      '#.####.#####.##.#####.####.#',
      '#o####.#####.##.#####.####o#',
      '#.####.#####.##.#####.####.#',
      '#..........................#',
      '#.####.##.########.##.####.#',
      '#.####.##.########.##.####.#',
      '#......##....##....##......#',
      '######.#####.##.#####.######',
      '#.####.##.##....##.##.####.#',
      '#.####.##.##....##.##.####.#',
      '#.........###--###.........#',
      '#.........#      #.........#',
      ' .........#      #......... ',
      '#.........#      #.........#',
      '#.........########.........#',
      '#..........................#',
      '#.####.##.########.##.####.#',
      '#.####.##.########.##.####.#',
      '#......##....##....##......#',
      '#.####.#####.##.#####.####.#',
      '#.####.#####.##.#####.####.#',
      '#o........................o#',
      '#.####.##.########.##.####.#',
      '#.####.##.########.##.####.#',
      '#......##....##....##......#',
      '#.##########.##.##########.#',
      '#.##########.##.##########.#',
      '#..........................#',
      '############################',
    ];
    const W = 28, H = 31, TUNNEL = 14;
    const map = RAW.map(r => (r + '#'.repeat(W)).slice(0, W).split(''));

    /* dots: 1 = pellet, 2 = power pellet */
    const dots = map.map(row => row.map(c => (c === '.' ? 1 : c === 'o' ? 2 : 0)));
    let dotsLeft = dots.reduce((s, r) => s + r.filter(Boolean).length, 0);

    const DIRS = {
      up:    { dx: 0, dy: -1, a: -Math.PI / 2 },
      down:  { dx: 0, dy: 1,  a:  Math.PI / 2 },
      left:  { dx: -1, dy: 0, a:  Math.PI },
      right: { dx: 1, dy: 0,  a: 0 },
    };
    const ALL = [DIRS.up, DIRS.left, DIRS.down, DIRS.right];

    const DOOR = { x: 13, y: 12 };        // door tile (top of house)
    const HOUSE_IN = { x: 13, y: 14 };    // inside house target

    /* passability (virtual cols -1 / W allowed on tunnel row) */
    function passable(x, y, ghost, allowDoor) {
      if (y < 0 || y >= H) return false;
      if (x < 0 || x >= W) return y === TUNNEL;
      const c = map[y][x];
      if (c === '#') return false;
      if (c === '-') return !!ghost && !!allowDoor;
      return true;
    }

    /* ── run state ──────────────────────────────────── */
    let state = 'ready';        // ready | play | dying | clear | over
    let timer = 1.6;            // countdown for ready/dying/clear
    let level = 1, lives = 3, score = 0, combo = 0;
    let modeIdx = 0, modeT = 7; // scatter/chase schedule
    let frightT = 0;            // seconds of frightened mode left
    let paused = false;

    const SPEED_PAC = () => 7.4 + Math.min(level - 1, 6) * 0.25;
    const SPEED_GHOST = () => 6.9 + Math.min(level - 1, 6) * 0.3;
    const SPEED_FRIGHT = () => 4.2;
    const SPEED_EATEN = 13;

    /* ── entities ───────────────────────────────────── */
    function makeEnt(cx, cy, dir) {
      return { cx, cy, nx: cx, ny: cy, t: 0, dir, moving: false };
    }
    const pac = makeEnt(13, 23, DIRS.left);
    let wanted = DIRS.left;

    const SCATTER = [
      { x: 26, y: 0 },   // blinky → top-right
      { x: 1,  y: 0 },   // pinky  → top-left
      { x: 26, y: 30 },  // inky   → bottom-right
      { x: 1,  y: 30 },  // clyde  → bottom-left
    ];
    const GHOST_DEFS = [
      { id: 'blinky', color: '#ff2e55', spawn: [13, 11, 'left'],  release: 0 },
      { id: 'pinky',  color: '#ff9ad5', spawn: [13, 14, 'up'],    release: 2 },
      { id: 'inky',   color: '#00e5ff', spawn: [11, 14, 'up'],    release: 5 },
      { id: 'clyde',  color: '#ff9a3d', spawn: [15, 14, 'up'],    release: 8 },
    ];
    let ghosts = [];

    function spawnAll() {
      pac.cx = 13; pac.cy = 23; pac.nx = 13; pac.ny = 23; pac.t = 0;
      pac.dir = DIRS.left; pac.moving = false; wanted = DIRS.left;
      ghosts = GHOST_DEFS.map((d, i) => ({
        ...d,
        idx: i,
        cx: d.spawn[0], cy: d.spawn[1], nx: d.spawn[0], ny: d.spawn[1],
        t: 0, dir: DIRS[d.spawn[2]], moving: false,
        state: d.release <= 0 ? 'active' : 'house',
        relT: d.release,
        frightened: false,
      }));
      modeIdx = 0; modeT = 7; frightT = 0; combo = 0;
    }

    /* reset dots for a fresh level */
    function buildLevel() {
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++)
          dots[y][x] = map[y][x] === '.' ? 1 : map[y][x] === 'o' ? 2 : 0;
      dotsLeft = dots.reduce((s, r) => s + r.filter(Boolean).length, 0);
      levelDirty = true;
    }

    /* ── movement engine ────────────────────────────── */
    function pos(e) { // render position (handles tunnel virtual cells)
      return { x: e.cx + (e.nx - e.cx) * e.t, y: e.cy + (e.ny - e.cy) * e.t };
    }

    function ghostDoorOK(g, x, y) {
      // door only for ghosts inside house (leaving) or eaten (returning)
      const c = (y >= 0 && y < H && x >= 0 && x < W) ? map[y][x] : ' ';
      if (c !== '-') return true;
      return g.state === 'leaving' || g.state === 'eaten' || g.state === 'house';
    }

    function canGo(g, x, y) {
      if (y < 0 || y >= H) return false;
      if (x < 0 || x >= W) return y === TUNNEL;
      const c = map[y][x];
      if (c === '#') return false;
      if (c === '-') return !!g && ghostDoorOK(g, x, y);
      return true;
    }

    function wrapArrive(e) {
      if (e.cx === -1) e.cx = W;        // came from left tunnel
      else if (e.cx === W) e.cx = -1;   // came from right tunnel
    }

    /* PAC: choose direction at tile centre */
    function pacChoose() {
      if (wanted && canGo(null, pac.cx + wanted.dx, pac.cy + wanted.dy)) {
        pac.dir = wanted;
      }
      const nx = pac.cx + pac.dir.dx, ny = pac.cy + pac.dir.dy;
      if (canGo(null, nx, ny)) { pac.nx = nx; pac.ny = ny; pac.moving = true; }
      else pac.moving = false;
    }

    function stepEnt(e, dt, speed, chooser) {
      let dist = speed * dt;
      let guard = 8;
      while (dist > 0 && guard-- > 0) {
        if (e.t === 0 && !e.moving) chooser(e);
        if (!e.moving) break;
        const need = 1 - e.t;
        if (dist < need) { e.t += dist; break; }
        dist -= need;
        e.cx = e.nx; e.cy = e.ny; e.t = 0; e.moving = false;
        wrapArrive(e);
        if (e.onArrive) e.onArrive(e);
        chooser(e);
      }
    }

    /* ── ghost AI ───────────────────────────────────── */
    function ghostTarget(g) {
      const p = pos(pac);
      if (g.state === 'eaten') return HOUSE_IN;
      if (g.state === 'leaving') return { x: DOOR.x, y: DOOR.y - 1 };
      if (modeIdx === 0) return SCATTER[g.idx];       // scatter phase
      const pd = pac.dir;
      if (g.id === 'blinky') return { x: Math.round(p.x), y: Math.round(p.y) };
      if (g.id === 'pinky')  return { x: Math.round(p.x) + pd.dx * 4, y: Math.round(p.y) + pd.dy * 4 };
      if (g.id === 'inky')   return { x: Math.round(p.x) + pd.dx * 2, y: Math.round(p.y) + pd.dy * 2 };
      /* clyde: shy */
      const d = Math.hypot(g.cx - p.x, g.cy - p.y);
      return d > 8 ? { x: Math.round(p.x), y: Math.round(p.y) } : SCATTER[g.idx];
    }

    function ghostChoose(g) {
      /* no reversing unless forced */
      let opts = ALL.filter(d => !(d.dx === -g.dir.dx && d.dy === -g.dir.dy));
      opts = opts.filter(d => canGo(g, g.cx + d.dx, g.cy + d.dy));
      if (!opts.length) opts = ALL.filter(d => canGo(g, g.cx + d.dx, g.cy + d.dy));
      if (!opts.length) { g.moving = false; return; }

      let pick;
      if (g.state === 'eaten' && g.cx === HOUSE_IN.x && g.cy === HOUSE_IN.y) {
        /* arrived home → revive */
        g.state = 'leaving'; g.frightened = false;
      }
      if (g.frightened && g.state === 'active') {
        pick = opts[(Math.random() * opts.length) | 0];
      } else {
        const tgt = ghostTarget(g);
        let best = Infinity;
        for (const d of opts) {
          const nx = g.cx + d.dx, ny = g.cy + d.dy;
          const dd = (nx - tgt.x) ** 2 + (ny - tgt.y) ** 2;
          if (dd < best) { best = dd; pick = d; }
        }
      }
      g.dir = pick;
      g.nx = g.cx + pick.dx; g.ny = g.cy + pick.dy;
      g.moving = true;
    }

    function ghostArrive(g) {
      if (g.state === 'eaten' && g.cx === HOUSE_IN.x && g.cy === HOUSE_IN.y) {
        g.state = 'leaving'; g.frightened = false;
      }
      if (g.state === 'leaving' && g.cy === DOOR.y - 1 && g.cx === DOOR.x) {
        g.state = 'active';
      }
    }

    /* ── eating & collisions ────────────────────────── */
    const popups = [];

    function eatDots() {
      if (pac.t > 0.35) return;           // only near centres
      const x = pac.cx, y = pac.cy;
      if (x < 0 || x >= W || y < 0 || y >= H) return;
      const d = dots[y][x];
      if (!d) return;
      dots[y][x] = 0; dotsLeft--;
      if (d === 1) {
        score += 10; ctx.setScore(score); Sfx.play('tick');
      } else {
        score += 50; ctx.setScore(score); Sfx.play('power');
        frightT = Math.max(3.5, 7.5 - level * 0.4);
        combo = 0;
        ghosts.forEach(g => { if (g.state === 'active') g.frightened = true; });
        popups.push({ x, y, txt: '50', t: 1 });
      }
      if (dotsLeft <= 0 && state === 'play') {
        state = 'clear'; timer = 2.2; Sfx.play('win');
      }
    }

    function collide() {
      const p = pos(pac);
      for (const g of ghosts) {
        if (g.state === 'eaten' || g.state === 'house') continue;
        const q = pos(g);
        if (Math.hypot(p.x - q.x, p.y - q.y) > 0.62) continue;
        if (g.frightened) {
          combo = Math.min(combo + 1, 4);
          const pts = 100 * (2 ** combo);           // 200/400/800/1600
          score += pts; ctx.setScore(score);
          popups.push({ x: q.x, y: q.y, txt: String(pts), t: 1.2 });
          g.frightened = false; g.state = 'eaten';
          Sfx.play('coin');
        } else {
          state = 'dying'; timer = 1.7; pac.moving = false;
          ghosts.forEach(gh => (gh.moving = false));
          Sfx.play('lose');
        }
        break;
      }
    }

    /* ── input ──────────────────────────────────────── */
    function steer(dir) {
      if (paused || state === 'over') return;
      wanted = dir;
      if (!pac.moving && pac.t === 0) pacChoose();
    }
    const KEYMAP = {
      ArrowUp: DIRS.up, ArrowDown: DIRS.down, ArrowLeft: DIRS.left, ArrowRight: DIRS.right,
      w: DIRS.up, s: DIRS.down, a: DIRS.left, d: DIRS.right,
      W: DIRS.up, S: DIRS.down, A: DIRS.left, D: DIRS.right,
    };
    function onKey(e) {
      const dir = KEYMAP[e.key];
      if (dir) { e.preventDefault(); steer(dir); Sfx.play('hover'); }
    }
    window.addEventListener('keydown', onKey);

    /* swipe */
    let tsX = 0, tsY = 0, tsOn = false;
    const wrapEl = ctx.container;
    function onTouchStart(e) { const t = e.touches[0]; tsX = t.clientX; tsY = t.clientY; tsOn = true; }
    function onTouchMove(e) {
      if (!tsOn) return;
      const t = e.touches[0];
      const dx = t.clientX - tsX, dy = t.clientY - tsY;
      if (Math.abs(dx) < 26 && Math.abs(dy) < 26) return;
      tsOn = false;
      if (Math.abs(dx) > Math.abs(dy)) steer(dx > 0 ? DIRS.right : DIRS.left);
      else steer(dy > 0 ? DIRS.down : DIRS.up);
      e.preventDefault();
    }
    function onTouchEnd() { tsOn = false; }
    wrapEl.addEventListener('touchstart', onTouchStart, { passive: true });
    wrapEl.addEventListener('touchmove', onTouchMove, { passive: false });
    wrapEl.addEventListener('touchend', onTouchEnd, { passive: true });

    /* D-pad buttons (injected below by DOM build) */
    function bindPad() {
      wrapEl.querySelectorAll('[data-dir]').forEach(b => {
        const d = DIRS[b.dataset.dir];
        b.addEventListener('pointerdown', e => { e.preventDefault(); steer(d); Sfx.play('hover'); });
      });
    }

    /* ── update tick ────────────────────────────────── */
    function update(dt) {
      if (paused) return;

      /* state machine timers */
      if (state !== 'play') {
        timer -= dt;
        if (state === 'ready' && timer <= 0) { state = 'play'; Sfx.play('start'); }
        else if (state === 'dying' && timer <= 0) {
          lives--;
          if (lives <= 0) { state = 'over'; timer = 0.2; }
          else { spawnAll(); state = 'ready'; timer = 1.4; }
        } else if (state === 'clear' && timer <= 0) {
          level++; buildLevel(); spawnAll(); state = 'ready'; timer = 1.4;
        } else if (state === 'over' && timer <= 0) {
          ctx.gameOver();
          state = 'done';
        }
        return;
      }

      /* scatter/chase schedule */
      modeT -= dt;
      if (modeT <= 0) {
        modeIdx ^= 1;
        modeT = modeIdx === 0 ? 7 : 20;
        /* force reverse on mode flip (classic behaviour) */
        ghosts.forEach(g => { if (g.state === 'active') g.dir = reverse(g.dir); });
      }

      /* frightened timer */
      if (frightT > 0) {
        frightT -= dt;
        if (frightT <= 0) {
          ghosts.forEach(g => (g.frightened = false));
          combo = 0;
        }
      }

      /* ghost house releases */
      ghosts.forEach(g => {
        if (g.state === 'house') {
          g.relT -= dt;
          if (g.relT <= 0) { g.state = 'leaving'; }
        }
      });

      stepEnt(pac, dt, SPEED_PAC(), e => { pacChoose(); });
      eatDots();
      ghosts.forEach(g => {
        g.onArrive = ghostArrive;
        const sp = g.state === 'eaten' ? SPEED_EATEN
          : g.frightened ? SPEED_FRIGHT()
          : SPEED_GHOST();
        stepEnt(g, dt, sp, gh => ghostChoose(gh));
      });
      collide();

      /* popups tick */
      for (let i = popups.length - 1; i >= 0; i--) {
        popups[i].t -= dt;
        if (popups[i].t <= 0) popups.splice(i, 1);
      }
    }
    function reverse(d) {
      return ALL.find(x => x.dx === -d.dx && x.dy === -d.dy) || d;
    }

    /* ── DOM / canvas ───────────────────────────────── */
    const containerEl = ctx.container;
    containerEl.classList.add('pac-host');
    containerEl.innerHTML = `
      <canvas class="pac-canvas"></canvas>
      <div class="pac-pad">
        <button class="pac-btn pac-btn--u" data-dir="up" aria-label="Up">▲</button>
        <button class="pac-btn pac-btn--l" data-dir="left" aria-label="Left">◀</button>
        <button class="pac-btn pac-btn--r" data-dir="right" aria-label="Right">▶</button>
        <button class="pac-btn pac-btn--d" data-dir="down" aria-label="Down">▼</button>
        <span class="pac-pad__hint">MOVE</span>
      </div>`;
    const canvas = containerEl.querySelector('.pac-canvas');
    const g2d = canvas.getContext('2d');
    bindPad();

    let TW = 0, TH = 0, OX = 0, OY = 0;   // tile size / offsets
    function resize(w, h) {
      w = w || containerEl.clientWidth;
      h = h || containerEl.clientHeight;
      const padX = 0, padY = 0;
      const t = Math.min((w - padX) / W, (h - padY) / H);
      TW = Math.max(6, t);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(TW * W * dpr);
      canvas.height = Math.round(TW * H * dpr);
      canvas.style.width = (TW * W) + 'px';
      canvas.style.height = (TW * H) + 'px';
      g2d.setTransform(dpr, 0, 0, dpr, 0, 0);
      levelDirty = true;
    }

    /* ── rendering ──────────────────────────────────── */
    let levelDirty = true;
    let levelCv = document.createElement('canvas');
    let tPhase = 0;

    function buildLevelCanvas() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      levelCv.width = Math.round(TW * W * dpr);
      levelCv.height = Math.round(TW * H * dpr);
      const c = levelCv.getContext('2d');
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, TW * W, TW * H);

      const cs = getComputedStyle(document.documentElement);
      const neon = cs.getPropertyValue('--c1').trim() || '#00f0ff';

      /* wall blocks: fill + neon stroke on exposed edges */
      c.save();
      c.shadowColor = neon; c.shadowBlur = TW * 0.45;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (map[y][x] !== '#') continue;
        const px = x * TW, py = y * TW;
        c.fillStyle = 'rgba(10,16,48,.92)';
        c.fillRect(px, py, TW, TW);
      }
      c.lineWidth = Math.max(1.4, TW * 0.11);
      c.strokeStyle = neon;
      c.lineCap = 'round';
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (map[y][x] !== '#') continue;
        const px = x * TW, py = y * TW, i = c.lineWidth / 2;
        const up = y > 0 && map[y - 1][x] === '#';
        const dn = y < H - 1 && map[y + 1][x] === '#';
        const lf = x > 0 && map[y][x - 1] === '#';
        const rt = x < W - 1 && map[y][x + 1] === '#';
        c.beginPath();
        if (!up) { c.moveTo(px + i, py + i); c.lineTo(px + TW - i, py + i); }
        if (!dn) { c.moveTo(px + i, py + TW - i); c.lineTo(px + TW - i, py + TW - i); }
        if (!lf) { c.moveTo(px + i, py + i); c.lineTo(px + i, py + TW - i); }
        if (!rt) { c.moveTo(px + TW - i, py + i); c.lineTo(px + TW - i, py + TW - i); }
        c.stroke();
      }
      /* ghost door */
      c.shadowBlur = TW * 0.3; c.shadowColor = '#ff9ad5'; c.strokeStyle = '#ff9ad5';
      c.lineWidth = Math.max(1.6, TW * 0.13);
      c.beginPath();
      c.moveTo(13 * TW, (DOOR.y + 0.5) * TW);
      c.lineTo(15 * TW, (DOOR.y + 0.5) * TW);
      c.stroke();
      c.restore();
      levelDirty = false;
    }

    function drawDots(now) {
      g2d.save();
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const d = dots[y][x];
        if (!d) continue;
        const cx = (x + 0.5) * TW, cy = (y + 0.5) * TW;
        if (d === 1) {
          g2d.fillStyle = '#ffe9b0';
          g2d.beginPath();
          g2d.arc(cx, cy, Math.max(1.4, TW * 0.11), 0, 7);
          g2d.fill();
        } else {
          const r = TW * (0.3 + Math.sin(now * 0.006) * 0.07);
          g2d.shadowColor = '#ffd400'; g2d.shadowBlur = TW * 0.6;
          g2d.fillStyle = '#ffd400';
          g2d.beginPath(); g2d.arc(cx, cy, r, 0, 7); g2d.fill();
          g2d.shadowBlur = 0;
        }
      }
      g2d.restore();
    }

    function drawPac(now) {
      const p = pos(pac);
      const cx = (p.x + 0.5) * TW, cy = (p.y + 0.5) * TW;
      const r = TW * 0.46;
      let mouth = 0.22;
      if (state === 'play' && pac.moving) mouth = 0.05 + Math.abs(Math.sin(now * 0.018)) * 0.32;
      if (state === 'dying') {
        const k = 1 - Math.max(0, (1.7 - timer)) / 1.7;  // 0→1
        mouth = 0.15 + k * (Math.PI - 0.15);
      }
      const a = pac.dir ? pac.dir.a : 0;
      g2d.save();
      g2d.translate(cx, cy); g2d.rotate(a);
      g2d.shadowColor = '#ffd400'; g2d.shadowBlur = TW * 0.5;
      g2d.fillStyle = '#ffd400';
      g2d.beginPath();
      g2d.moveTo(0, 0);
      g2d.arc(0, 0, r, mouth, Math.PI * 2 - mouth);
      g2d.closePath(); g2d.fill();
      g2d.restore();
    }

    function drawGhost(g, now) {
      const q = pos(g);
      const cx = (q.x + 0.5) * TW, cy = (q.y + 0.5) * TW;
      const r = TW * 0.44;
      const eaten = g.state === 'eaten';
      const fright = g.frightened;
      const flashing = fright && frightT < 2 && ((frightT * 5) | 0) % 2 === 0;
      const body = eaten ? null : fright ? (flashing ? '#ffffff' : '#2b3cff') : g.color;

      g2d.save();
      g2d.translate(cx, cy);
      if (body) {
        g2d.shadowColor = body; g2d.shadowBlur = TW * 0.4;
        g2d.fillStyle = body;
        g2d.beginPath();
        g2d.arc(0, -r * 0.12, r, Math.PI, 0);
        const bottom = r * 0.95;
        g2d.lineTo(r, bottom);
        const w = r * 2 / 3;
        const wob = ((now * 0.012) | 0) % 2 ? 1 : -1;
        for (let i = 0; i < 3; i++) {
          const x0 = r - i * w, x1 = x0 - w;
          g2d.quadraticCurveTo(x0 - w / 2, bottom + r * 0.42 * wob, x1, bottom);
        }
        g2d.closePath(); g2d.fill();
        g2d.shadowBlur = 0;
      }
      /* eyes */
      const ed = g.dir || DIRS.left;
      const eo = r * 0.26;
      g2d.fillStyle = '#fff';
      g2d.beginPath(); g2d.arc(-eo, -r * 0.2, r * 0.3, 0, 7); g2d.fill();
      g2d.beginPath(); g2d.arc(eo, -r * 0.2, r * 0.3, 0, 7); g2d.fill();
      if (!fright && !eaten) {
        g2d.fillStyle = '#18226b';
        g2d.beginPath(); g2d.arc(-eo + ed.dx * r * 0.13, -r * 0.2 + ed.dy * r * 0.13, r * 0.16, 0, 7); g2d.fill();
        g2d.beginPath(); g2d.arc(eo + ed.dx * r * 0.13, -r * 0.2 + ed.dy * r * 0.13, r * 0.16, 0, 7); g2d.fill();
      } else if (fright && !eaten) {
        /* frightened face */
        g2d.strokeStyle = flashing ? '#ff2e55' : '#ffd400';
        g2d.lineWidth = Math.max(1.2, TW * 0.07);
        g2d.beginPath();
        g2d.moveTo(-r * 0.5, r * 0.18);
        for (let i = 0; i < 4; i++) {
          g2d.lineTo(-r * 0.5 + (i + 0.5) * (r / 4), r * 0.18 + (i % 2 ? r * 0.14 : 0));
          g2d.lineTo(-r * 0.5 + (i + 1) * (r / 4), r * 0.18);
        }
        g2d.stroke();
        g2d.fillStyle = flashing ? '#ff2e55' : '#ffd400';
        g2d.beginPath(); g2d.arc(-eo, -r * 0.2, r * 0.13, 0, 7); g2d.fill();
        g2d.beginPath(); g2d.arc(eo, -r * 0.2, r * 0.13, 0, 7); g2d.fill();
      }
      g2d.restore();
    }

    function drawOverlays(now) {
      g2d.save();
      g2d.textAlign = 'center';

      /* lives icons */
      for (let i = 0; i < Math.max(0, lives - 1); i++) {
        const lx = (1.5 + i * 1.4) * TW, ly = (H - 1.5) * TW;
        g2d.fillStyle = '#ffd400';
        g2d.beginPath();
        g2d.moveTo(lx, ly);
        g2d.arc(lx, ly, TW * 0.36, 0.5, Math.PI * 2 - 0.5);
        g2d.closePath(); g2d.fill();
      }
      /* level label */
      g2d.fillStyle = 'rgba(255,255,255,.5)';
      g2d.font = `700 ${Math.max(9, TW * 0.42)}px Space Grotesk, sans-serif`;
      g2d.textAlign = 'right';
      g2d.fillText('LV ' + level, (W - 1.3) * TW, (H - 1.28) * TW);

      g2d.textAlign = 'center';
      g2d.shadowColor = '#00e5ff'; g2d.shadowBlur = TW * 0.6;
      g2d.fillStyle = '#ffd400';
      g2d.font = `900 ${TW * 1.05}px Orbitron, sans-serif`;

      if (state === 'ready') g2d.fillText('READY!', (W / 2) * TW, 17.5 * TW);
      else if (state === 'clear') g2d.fillText('LEVEL CLEAR!', (W / 2) * TW, 17.5 * TW);
      else if (state === 'over') {
        g2d.fillStyle = '#ff2e55'; g2d.shadowColor = '#ff2e55';
        g2d.fillText('GAME OVER', (W / 2) * TW, 17.5 * TW);
      }

      /* score popups */
      g2d.shadowBlur = TW * 0.4; g2d.shadowColor = '#fff';
      g2d.fillStyle = '#fff';
      g2d.font = `700 ${TW * 0.55}px Orbitron, sans-serif`;
      popups.forEach(pu => {
        g2d.globalAlpha = Math.min(1, pu.t * 1.4);
        g2d.fillText(pu.txt, (pu.x + 0.5) * TW, (pu.y + 0.5 - (1.2 - pu.t) * 0.6) * TW);
      });
      g2d.restore();
    }

    function render(now) {
      if (levelDirty) buildLevelCanvas();
      const css = getComputedStyle(containerEl);
      g2d.clearRect(0, 0, canvas.width, canvas.height);
      g2d.fillStyle = '#04060f';
      g2d.fillRect(0, 0, TW * W, TW * H);

      g2d.drawImage(levelCv, 0, 0, levelCv.width, levelCv.height, 0, 0, TW * W, TW * H);
      drawDots(now);
      ghosts.forEach(g => drawGhost(g, now));
      if (state !== 'done') drawPac(now);
      drawOverlays(now);
    }

    /* ── main loop ──────────────────────────────────── */
    let raf = 0, last = 0, alive = true;
    function loop(now) {
      if (!alive) return;
      raf = requestAnimationFrame(loop);
      if (!last) last = now;
      let dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (state === 'done') { render(now); return; }
      update(dt);
      render(now);
    }

    /* ── lifecycle ──────────────────────────────────── */
    spawnAll();
    resize();
    window.addEventListener('resize', onWinResize);
    function onWinResize() { resize(); }
    raf = requestAnimationFrame(loop);

    return {
      pause() { paused = true; },
      resume() { paused = false; last = 0; },
      restart() {
        score = 0; lives = 3; level = 1;
        ctx.setScore(0);
        buildLevel(); spawnAll();
        state = 'ready'; timer = 1.4; paused = false;
        Sfx.play('start');
      },
      resize(w, h) { resize(w, h); },
      destroy() {
        alive = false;
        cancelAnimationFrame(raf);
        window.removeEventListener('keydown', onKey);
        window.removeEventListener('resize', onWinResize);
        wrapEl.removeEventListener('touchstart', onTouchStart);
        wrapEl.removeEventListener('touchmove', onTouchMove);
        wrapEl.removeEventListener('touchend', onTouchEnd);
        containerEl.classList.remove('pac-host');
        containerEl.innerHTML = '';
      },
    };
  },
});
