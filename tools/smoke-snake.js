/* Headless smoke test for Snake (mocked DOM + 2D canvas).
   Math.random=0.5 → deterministic food spawn + particles.
   Bot: BFS on the 26×26 grid (body-minus-tail blocked) → apples ≥ 5,
   then stops steering and lets the snake hit the wall.
   Flow: menu (static snake) → PLAY → keyboard/swipe/d-pad steering +
         reversal guard → BFS bot to 5 apples (score/len/speed asserts) →
         wall death → GAME OVER → restart → pause freeze + queued input →
         resize math → destroy → 2nd instance SPACE start             */
const fs = require('fs');

let gameDef = null;
global.registerGame = d => { gameDef = d; };
global.Sfx = { played: [], play(n) { this.played.push(n); } };

/* deterministic food + particles rng */
Math.random = () => 0.5;

/* ── 2D context mock (memoized method stubs) ── */
const grad = () => ({ addColorStop() {} });
const fnCache = {};
const ctx2d = new Proxy({}, {
  get(t, p) {
    if (p === 'createRadialGradient' || p === 'createLinearGradient') return grad;
    if (p in t) return t[p];
    if (!fnCache[p]) fnCache[p] = () => undefined;
    return fnCache[p];
  },
  set(t, p, v) { t[p] = v; return true; },
});

function fakeEl(extra = {}) {
  const listeners = {};
  return {
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); } },
    style: {}, textContent: '', className: '', innerHTML: '',
    children: [],
    appendChild(c) { c.parentNode = this; this.children.push(c); },
    removeChild(c) { this.children = this.children.filter(x => x !== c); c.parentNode = null; },
    addEventListener(e, f) { (listeners[e] ||= []).push(f); },
    removeEventListener(e, f) { listeners[e] = (listeners[e] || []).filter(x => x !== f); },
    _fire(e, ev = {}) { (listeners[e] || []).slice().forEach(f => f(ev)); },
    ...extra,
  };
}
const canvasMock = fakeEl({
  width: 0, height: 0,
  getContext: () => ctx2d,
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 900, height: 700 }),
});
const container = fakeEl({ clientWidth: 900, clientHeight: 700 });

global.document = {
  createElement: tag => (tag === 'canvas' ? canvasMock : fakeEl()),
  documentElement: {},
};
const winListeners = {};
global.window = {
  devicePixelRatio: 1,
  addEventListener(e, f) { (winListeners[e] ||= []).push(f); },
  removeEventListener(e, f) { winListeners[e] = (winListeners[e] || []).filter(x => x !== f); },
  _fire(e, ev) { (winListeners[e] || []).slice().forEach(f => f(ev)); },
};

let rafCb = null;
global.requestAnimationFrame = cb => { rafCb = cb; return 1; };
global.cancelAnimationFrame = () => { rafCb = null; };

/* ── load ── */
const src = fs.readFileSync(__dirname + '/../assets/js/games/snake.js', 'utf8');
eval(src);
if (!gameDef) { console.log('FAIL: not registered'); process.exit(1); }
console.log(`registered: ${gameDef.id} / ${gameDef.title} / genre=${gameDef.genre}`);

/* ── helpers ── */
let now = 0;
function frames(n, step = 17) {
  for (let i = 0; i < n; i++) {
    if (!rafCb) break;
    const cb = rafCb; rafCb = null; now += step; cb(now);
  }
}
function findEl(root, pred) {
  for (const k of root.children || []) {
    if (pred(k)) return k;
    const hit = findEl(k, pred);
    if (hit) return hit;
  }
  return null;
}
const key = (x, y) => x + ',' + y;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const scores = [];
let over = null;
const ctx = {
  container, width: 900, height: 700,
  setScore: n => scores.push(n),
  get score() { return scores.length ? scores[scores.length - 1] : 0; },
  gameOver: o => { over = o; },
  toast() {}, sfx() {},
};
const fail = m => { console.log('SMOKE FAIL:', m); process.exit(1); };

/* advance until the tick counter increases */
function waitTick(from) {
  for (let i = 0; i < 500; i++) {
    frames(1);
    const st = inst.getState();
    if (st.ticks > from) return st;
  }
  return fail('tick never advanced');
}

/* BFS to the food through cells the snake will have vacated */
function botNextDir(st) {
  const blocked = new Set(st.snake.slice(0, -1).map(s => key(s.x, s.y)));
  const prev = new Map();
  prev.set(key(st.hx, st.hy), 'S');
  const q = [[st.hx, st.hy]];
  let found = false;
  while (q.length && !found) {
    const [x, y] = q.shift();
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy, k = key(nx, ny);
      if (nx < 0 || ny < 0 || nx >= st.cols || ny >= st.rows) continue;
      if (blocked.has(k) || prev.has(k)) continue;
      prev.set(k, { px: x, py: y, dx, dy });
      if (nx === st.foodX && ny === st.foodY) { found = true; break; }
      q.push([nx, ny]);
    }
  }
  if (found) {
    let node = prev.get(key(st.foodX, st.foodY));
    while (node && node !== 'S' && !(node.px === st.hx && node.py === st.hy)) {
      node = prev.get(key(node.px, node.py));
    }
    if (node && node !== 'S') return { x: node.dx, y: node.dy };
  }
  /* trapped: any safe non-reversing neighbour */
  for (const [dx, dy] of DIRS) {
    if (dx === -st.dx && dy === -st.dy) continue;
    const nx = st.hx + dx, ny = st.hy + dy;
    if (nx < 0 || ny < 0 || nx >= st.cols || ny >= st.rows) continue;
    if (blocked.has(key(nx, ny))) continue;
    return { x: dx, y: dy };
  }
  return null;
}

let inst = null;
(async () => {
  /* ═══ A — menu: static snake + grid ═══ */
  inst = gameDef.create(ctx);
  const menu = findEl(container, el => (el.className || '').includes('gsnk-menu'));
  if (!menu) fail('no menu');
  const btn = findEl(container, el => el.className === 'gsnk-play');
  if (!btn) fail('no PLAY button');
  const dUp = findEl(container, el => (el.className || '').includes('gsnk-up'));
  const dLeft = findEl(container, el => (el.className || '').includes('gsnk-left'));
  const dRight = findEl(container, el => (el.className || '').includes('gsnk-right'));
  const dDown = findEl(container, el => (el.className || '').includes('gsnk-down'));
  if (!dUp || !dLeft || !dRight || !dDown) fail('d-pad incomplete');
  const a0 = inst.getState();
  if (a0.phase !== 'menu') fail('phase not menu');
  if (a0.len !== 4 || a0.apples !== 0 || a0.score !== 0 || a0.ticks !== 0) fail('init stats');
  if (a0.cols !== 26 || a0.rows !== 26) fail('grid ' + a0.cols + 'x' + a0.rows);
  if (a0.hx !== 13 || a0.hy !== 13) fail('head ' + a0.hx + ',' + a0.hy);
  if (a0.snake.length !== 4) fail('snake array');
  if (a0.foodX < 0 || a0.foodX >= 26 || a0.foodY < 0 || a0.foodY >= 26) fail('food oob');
  frames(40);
  if (inst.getState().ticks !== 0) fail('ticks moved while menu shown');
  console.log('menu + static snake ✓ (26×26, head 13,13)');

  /* ═══ B — PLAY → run ═══ */
  btn._fire('click', {});
  const b0 = inst.getState();
  if (b0.phase !== 'play') fail('PLAY did not start run');
  if (!menu.classList.contains('is-out')) fail('menu not dismissed');
  if (!Sfx.played.includes('start')) fail('start sfx missing');
  const bx0 = b0.hx;
  frames(30);
  const b1 = inst.getState();
  if (b1.ticks <= 0) fail('no ticks after start');
  if (b1.hx <= bx0) fail('snake not moving right: ' + b1.hx);
  console.log('PLAY → running ✓');

  /* ═══ C — steering: keyboard, swipe, d-pad, reversal guard ═══ */
  let st = inst.getState();
  window._fire('keydown', { code: 'ArrowDown', preventDefault() {} });
  st = waitTick(st.ticks);
  if (st.dx !== 0 || st.dy !== 1) fail('ArrowDown: ' + st.dx + ',' + st.dy);
  container._fire('pointerdown', { clientX: 100, clientY: 100, cancelable: true, preventDefault() {} });
  container._fire('pointerup', { clientX: 230, clientY: 100 });
  st = waitTick(st.ticks);
  if (st.dx !== 1 || st.dy !== 0) fail('swipe right: ' + st.dx + ',' + st.dy);
  dUp._fire('pointerdown', { stopPropagation() {}, cancelable: true, preventDefault() {} });
  st = waitTick(st.ticks);
  if (st.dx !== 0 || st.dy !== -1) fail('d-pad up: ' + st.dx + ',' + st.dy);
  window._fire('keydown', { code: 'ArrowLeft', preventDefault() {} });
  st = waitTick(st.ticks);
  if (st.dx !== -1 || st.dy !== 0) fail('ArrowLeft: ' + st.dx + ',' + st.dy);
  window._fire('keydown', { code: 'ArrowRight', preventDefault() {} });
  st = waitTick(st.ticks);
  if (st.dx !== -1 || st.dy !== 0) fail('reversal not blocked: ' + st.dx + ',' + st.dy);
  console.log('keyboard + swipe + d-pad + reversal guard ✓');

  /* ═══ D — BFS bot to 5 apples ═══ */
  over = null;
  let lastTicks = -1, d = 0;
  const dStart = performance.now();
  while (d++ < 90000) {
    const s = inst.getState();
    if (s.phase === 'over') fail('bot died at ' + s.apples + ' apples (score ' + s.score + ')');
    if (s.apples >= 5) break;
    if (s.ticks !== lastTicks) {
      lastTicks = s.ticks;
      const mv = botNextDir(s);
      if (mv && (mv.x !== s.dx || mv.y !== s.dy)) {
        const code = mv.y === -1 ? 'ArrowUp' : mv.y === 1 ? 'ArrowDown' : mv.x === -1 ? 'ArrowLeft' : 'ArrowRight';
        window._fire('keydown', { code, preventDefault() {} });
      }
    }
    frames(1);
  }
  const dEnd = inst.getState();
  console.log(`bot: apples=${dEnd.apples} score=${dEnd.score} len=${dEnd.len} ms=${dEnd.ms} ticks=${dEnd.ticks} in ${d} frames`);
  if (dEnd.apples < 5) fail('only ' + dEnd.apples + ' apples collected');
  if (dEnd.score < 100) fail('score ' + dEnd.score + ' < 100');
  if (dEnd.len !== 4 + dEnd.apples) fail('len ' + dEnd.len + ' != 4+' + dEnd.apples);
  if (dEnd.ms >= 155) fail('speed did not ramp: ' + dEnd.ms);
  if (ctx.score !== dEnd.score) fail('setScore out of sync');
  if (dEnd.foodX < 0 || dEnd.foodX >= 26 || dEnd.foodY < 0 || dEnd.foodY >= 26) fail('food oob');
  if (dEnd.snake.some(s => s.x === dEnd.foodX && s.y === dEnd.foodY)) fail('food on snake');
  if (!Sfx.played.includes('coin')) fail('coin sfx missing');
  if (!Sfx.played.includes('power')) fail('milestone power sfx missing');
  console.log('BFS foraging + scoring + speed ramp ✓');

  /* ═══ E — stop steering → wall death → GAME OVER ═══ */
  over = null;
  let e = 0;
  while (e++ < 30000) {
    if (inst.getState().phase === 'over') break;
    frames(1);
  }
  const eEnd = inst.getState();
  if (eEnd.phase !== 'over') fail('snake never died (' + e + ' frames)');
  console.log('over:', over && over.title, '| msg:', over && over.message);
  if (!over || over.title !== 'GAME OVER') fail('gameOver not called');
  if (!/^Score \d+ · \d+ apples$/.test(over.message)) fail('message: ' + over.message);
  if (!Sfx.played.includes('hit') || !Sfx.played.includes('lose')) fail('death sfx missing');
  const frozen = eEnd.ticks;
  frames(30);
  if (inst.getState().ticks !== frozen) fail('ticks moved after game over');
  console.log('wall death ✓');

  /* ═══ F — restart ═══ */
  inst.restart();
  const f = inst.getState();
  if (f.phase !== 'play' || f.score !== 0 || f.apples !== 0 || f.len !== 4 || f.ticks !== 0)
    fail('restart stats: ' + JSON.stringify({ p: f.phase, s: f.score, a: f.apples, l: f.len, t: f.ticks }));
  if (f.hx !== 13 || f.hy !== 13) fail('restart head ' + f.hx + ',' + f.hy);
  if (ctx.score !== 0) fail('ctx score not reset');
  console.log('restart ✓');

  /* ═══ G — pause freeze + queued input ═══ */
  let g = inst.getState();
  for (let i = 0; i < 60 && g.ticks === 0; i++) { frames(1); g = inst.getState(); }
  if (g.ticks === 0) fail('no ticks after restart');
  inst.pause();
  const pT = g.ticks, pHx = g.hx;
  window._fire('keydown', { code: 'ArrowDown', preventDefault() {} });
  frames(40);
  const g2 = inst.getState();
  if (g2.ticks !== pT || g2.hx !== pHx) fail('paused world moved');
  if (g2.dx !== 1 || g2.dy !== 0) fail('dir changed while paused');
  inst.resume();
  let g3 = inst.getState();
  for (let i = 0; i < 80 && g3.ticks === pT; i++) { frames(1); g3 = inst.getState(); }
  if (g3.ticks <= pT) fail('resume did not tick');
  if (!(g3.dx === 0 && g3.dy === 1)) fail('queued input not applied: ' + g3.dx + ',' + g3.dy);
  console.log('pause freeze + queued turn ✓');

  /* ═══ H — resize math ═══ */
  inst.resize(500, 800);
  frames(20);
  const h = inst.getState();
  if (h.W !== 500 || h.H !== 800) fail('resize dims ' + h.W + 'x' + h.H);
  if (h.cell !== 19) fail('cell ' + h.cell + ' != 19');
  if (h.bx !== 3) fail('bx ' + h.bx + ' != 3');
  if (h.by !== 153) fail('by ' + h.by + ' != 153');
  if (h.snake.some(s => s.x < 0 || s.x >= 26 || s.y < 0 || s.y >= 26)) fail('snake out of grid');
  if (h.phase !== 'play') fail('phase after resize: ' + h.phase);
  console.log('resize re-layout ✓');

  /* ═══ I — destroy ═══ */
  inst.destroy();
  if (rafCb !== null) fail('raf not cancelled');
  if (container.children.length !== 0) fail('host not cleaned: ' + container.children.length);
  if (container.classList.contains('gsnk-host')) fail('host class not removed');
  frames(10);
  console.log('destroy cleanup ✓');

  /* ═══ J — second instance: SPACE starts from menu ═══ */
  inst = gameDef.create(ctx);
  window._fire('keydown', { code: 'Space', preventDefault() {} });
  if (inst.getState().phase !== 'play') fail('SPACE did not start run');
  const m2 = findEl(container, el => (el.className || '').includes('gsnk-menu'));
  if (!m2.classList.contains('is-out')) fail('menu not dismissed by SPACE');
  frames(10);
  inst.destroy();
  if (container.children.length !== 0) fail('second instance not cleaned');
  console.log('SPACE start + re-lifecycle ✓ | setScore calls:', scores.length);

  console.log('SMOKE OK');
  process.exit(0);
})();
