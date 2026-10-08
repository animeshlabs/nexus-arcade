/* Headless smoke test for Breakout (mocked DOM + 2D canvas).
   Math.random=0.5 → launch angle 0.55 rad, deterministic particles.
   Bot predicts landings with an exact triangle-wave model (walls at r / W-r),
   steers toward the remaining brick field, and uses min-time targeting to
   snatch power-ups without conceding lives.
   Flow: menu → PLAY → serve → launch → bot to level 2 (45 bricks, +9 armored
         hits, first power-up = expand) → armored damage in level 2 →
         dodge-to-death → GAME OVER → restart → pause freeze → keyboard →
         resize + destroy lifecycle                                          */
const fs = require('fs');

let gameDef = null;
global.registerGame = d => { gameDef = d; };
global.Sfx = { played: [], play(n) { this.played.push(n); } };

/* deterministic scenery + particles rng */
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
const src = fs.readFileSync(__dirname + '/../assets/js/games/breakout.js', 'utf8');
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
const move = x => container._fire('pointermove', { clientX: x });
const down = x => container._fire('pointerdown', { clientX: x, cancelable: true, preventDefault() {} });

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

/* exact triangle-wave reflection of ball centre between walls lo..hi */
function triRefl(x, lo, hi) {
  const p = 2 * (hi - lo);
  let s = (x - lo) % p;
  if (s < 0) s += p;
  return s <= hi - lo ? lo + s : hi - (s - (hi - lo));
}
/* earliest falling ball: {x,y? no — landing x, t} at centre-height paddleY - r */
function predict(st) {
  let best = null;
  for (const b of st.ballList) {
    if (b.vy <= 0) continue;
    const t = (st.paddleY - b.r - b.y) / b.vy;
    if (!(t > 0)) continue;
    const x = triRefl(b.x + b.vx * t, b.r, st.W - b.r);
    if (!best || t < best.t) best = { x, t };
  }
  return best;
}
/* aim so the ball rebounds toward the still-standing brick mass */
function ballAim(st, pred) {
  let dir;
  if (st.centX != null) {
    const dv = st.centX - pred.x;
    dir = Math.abs(dv) > 14 ? Math.sign(dv) : ((st.hits % 2) ? 1 : -1);
  } else dir = (st.hits % 2) ? 1 : -1;
  return pred.x - dir * st.paddleW * 0.2;
}
/* min-time targeting: chase the ball landing or the incoming power-up,
   whichever arrives first; idle drift to brick centre otherwise */
function botAim(st) {
  const pred = predict(st);
  const d0 = st.drops.find(d => d.y < st.paddleY + 36) || null;
  const tDrop = d0 ? (st.paddleY - 12 - d0.y) / 165 : null;
  if (pred && d0 && tDrop >= -0.3) return pred.t <= tDrop ? ballAim(st, pred) : d0.x;
  if (pred) return ballAim(st, pred);
  if (d0) return d0.x;
  return st.centX != null ? st.centX : st.W / 2;
}

(async () => {
  /* ═══ A — boot: menu + pre-built level-1 backdrop ═══ */
  const inst = gameDef.create(ctx);
  const menu = findEl(container, el => (el.className || '').includes('gbrk-menu'));
  if (!menu) fail('no menu');
  const btn = findEl(container, el => el.className === 'gbrk-play');
  if (!btn) fail('no PLAY button');
  const a0 = inst.getState();
  if (a0.phase !== 'menu') fail('phase not menu');
  if (a0.level !== 1 || a0.lives !== 3 || a0.score !== 0) fail('initial stats');
  if (a0.bricksLeft !== 45 || a0.armoredLeft !== 9) fail(`bricks ${a0.bricksLeft}/${a0.armoredLeft} != 45/9`);
  if (a0.balls !== 1 || a0.ballY == null) fail('no serve ball');
  if (over) fail('over at boot');
  frames(30);
  const a1 = inst.getState();
  if (a1.phase !== 'menu') fail('phase left menu');
  if (a1.ballY !== a0.ballY) fail('menu ball drifted');
  console.log('menu + backdrop ok (45 bricks, 9 armored)');

  /* ═══ B — PLAY → serve ═══ */
  btn._fire('click', {});
  const b0 = inst.getState();
  if (b0.phase !== 'serve') fail('PLAY did not enter serve');
  if (!menu.classList.contains('is-out')) fail('menu not dismissed');
  if (!Sfx.played.includes('start')) fail('start sfx missing');
  const bally0 = b0.ballY;
  frames(30);
  const b1 = inst.getState();
  if (b1.phase !== 'serve') fail('left serve');
  if (b1.ballY !== bally0) fail('serve ball not stuck to paddle');
  if (b1.ballY >= b1.paddleY) fail('ball not above paddle');
  console.log('PLAY → serve ✓');

  /* ═══ C — paddle follow + launch ═══ */
  move(700);
  frames(5);
  if (inst.getState().paddleX !== 700) fail('pointer follow: ' + inst.getState().paddleX);
  down(700);
  const c0 = inst.getState();
  if (c0.phase !== 'play') fail('launch failed');
  if (!(c0.ballVx > 0) || !(c0.ballVy < 0)) fail(`launch vector ${c0.ballVx},${c0.ballVy}`);
  if (!Sfx.played.includes('jump')) fail('launch sfx missing');
  console.log('follow + diagonal launch ✓');

  /* ═══ D — bot to level 2 ═══ */
  let firstEffect = null, seenCaught = 0, guard = 0;
  const dStart = guard;
  while (guard++ < 150000) {
    const st = inst.getState();
    if (st.phase === 'over') fail('died while botting to level 2');
    if (st.caught > seenCaught) {
      if (firstEffect === null) firstEffect = st.expandT > 0 ? 'expand' : 'other';
      seenCaught = st.caught;
    }
    if (st.level >= 2 && st.phase === 'serve') break;
    if (st.phase === 'serve') { down(st.paddleX); frames(1); continue; }
    if (st.phase === 'levelup') { frames(1); continue; }
    move(botAim(st));
    frames(1);
  }
  const e = inst.getState();
  console.log(`level 2 reached in ${guard - dStart} frames: score=${e.score} hits=${e.hits} destroyed=${e.destroyed} caught=${e.caught} lives=${e.lives}`);
  if (e.phase !== 'serve' || e.level !== 2) fail('did not reach level 2 serve');
  if (e.armoredLeft !== 9) fail('level 2 armoredLeft ' + e.armoredLeft + ' != 9');
  if (e.bricksLeft !== 54) fail('level 2 bricksLeft ' + e.bricksLeft + ' != 54');
  if (e.hits - e.destroyed !== 9) fail('hits-destroyed ' + (e.hits - e.destroyed) + ' != 9 (two-hit armored)');
  if (e.score < 3290) fail('score ' + e.score + ' < 3290');
  if (e.combo !== 1) fail('combo not reset on serve');
  if (e.balls !== 1) fail('balls ' + e.balls + ' != 1');
  if (e.lives < 3) fail('lives dropped below 3: ' + e.lives);
  if (firstEffect !== 'expand') fail('first power-up effect: ' + firstEffect);
  if (ctx.score !== e.score) fail('setScore out of sync');
  for (const s of ['start', 'jump', 'coin', 'click', 'tick', 'power', 'win'])
    if (!Sfx.played.includes(s)) fail('sfx missing: ' + s);
  console.log('level-up + scoring + combo + first power-up ✓');

  /* ═══ E — armored multi-hit in level 2 ═══ */
  let f = 0;
  while (f++ < 70000) {
    const st = inst.getState();
    if (st.phase === 'over') fail('died in armored stage');
    if (st.hits - st.destroyed >= 10) break;
    if (st.phase === 'serve') { down(st.paddleX); frames(1); continue; }
    if (st.phase === 'levelup') { frames(1); continue; }
    move(botAim(st));
    frames(1);
  }
  const fEnd = inst.getState();
  if (fEnd.hits - fEnd.destroyed < 10) fail('level-2 armor never chipped in ' + f + ' frames');
  console.log(`armor chipped in level 2 after ${f} frames (hits-destroyed=${fEnd.hits - fEnd.destroyed})`);

  /* ═══ F — dodge-to-death ═══ */
  over = null;
  let g = 0;
  while (g++ < 150000) {
    const st = inst.getState();
    if (st.phase === 'over') break;
    if (st.phase === 'serve') {
      const parkL = st.paddleW / 2 + 3;
      move(parkL);
      down(parkL);
      frames(1);
      continue;
    }
    if (st.phase === 'levelup') { frames(1); continue; }
    const pred = predict(st);
    const parkL = st.paddleW / 2 + 3, parkR = st.W - st.paddleW / 2 - 3;
    const park = pred
      ? (Math.abs(pred.x - parkL) >= Math.abs(pred.x - parkR) ? parkL : parkR)
      : parkL;
    move(park);
    frames(1);
  }
  if (inst.getState().phase !== 'over') fail('dodge-to-death never died (' + g + ' frames)');
  console.log(`died in ${g} frames | over:`, over && over.title, '| msg:', over && over.message);
  if (!over || over.title !== 'GAME OVER') fail('gameOver not called');
  if (!/Level \d+ · \d+ bricks smashed/.test(over.message)) fail('message: ' + over.message);
  if (!Sfx.played.includes('hit') || !Sfx.played.includes('lose')) fail('death sfx missing');
  if (inst.getState().lives !== 0) fail('lives not 0 at over');

  /* ═══ G — restart ═══ */
  inst.restart();
  const h = inst.getState();
  if (h.phase !== 'serve' || h.level !== 1 || h.lives !== 3 || h.score !== 0) fail('restart stats');
  if (h.bricksLeft !== 45 || h.armoredLeft !== 9 || h.balls !== 1) fail('restart layout');
  if (ctx.score !== 0) fail('ctx score not reset');
  console.log('restart ✓');

  /* ═══ H — pause freeze + resume ═══ */
  down(h.paddleX);
  frames(10);
  const i1 = inst.getState();
  if (i1.phase !== 'play') fail('relaunch failed');
  inst.pause();
  const fy = i1.ballY, fvy = i1.ballVy, fx = i1.paddleX;
  move(fx + 150);
  frames(40);
  const i2 = inst.getState();
  if (i2.ballY !== fy || i2.ballVy !== fvy) fail('paused ball moved');
  if (i2.paddleX !== fx) fail('paused paddle moved');
  inst.resume();
  frames(30);
  const i3 = inst.getState();
  if (i3.paddleX <= fx + 100) fail('resume did not move paddle');
  if (i3.ballY === fy && i3.ballVy === fvy) fail('resume did not unfreeze ball');
  console.log('pause/resume ✓');

  /* ═══ I — keyboard ═══ */
  inst.restart();
  window._fire('keydown', { code: 'ArrowLeft', preventDefault() {} });
  frames(20);
  const j1 = inst.getState();
  if (j1.phase !== 'serve') fail('keyboard stage not serve');
  if (j1.paddleX > 350) fail('ArrowLeft steer failed: ' + j1.paddleX);
  window._fire('keyup', { code: 'ArrowLeft' });
  const kx = j1.paddleX;
  frames(10);
  if (inst.getState().paddleX !== kx) fail('keyup did not stop steering');
  window._fire('keydown', { code: 'Space', preventDefault() {} });
  if (inst.getState().phase !== 'play') fail('Space did not launch');
  frames(5);
  console.log('keyboard ✓');

  /* ═══ J — resize + destroy lifecycle ═══ */
  inst.resize(500, 800);
  frames(20);
  const k = inst.getState();
  if (k.W !== 500 || k.H !== 800) fail('resize failed');
  if (k.paddleX < 0 || k.paddleX > 500) fail('paddle out of bounds after resize');
  if (k.ballX < 0 || k.ballX > 500) fail('ball out of bounds after resize');
  if (k.bricksLeft < 39 || k.bricksLeft > 45) fail('bricksLeft wrecked by resize: ' + k.bricksLeft);
  if (k.balls < 1) fail('no ball after resize');
  inst.pause(); frames(20); inst.resume(); frames(10);
  inst.destroy();
  if (rafCb !== null) fail('raf not cancelled');
  if (container.children.length !== 0) fail('host not cleaned');
  if (container.classList.contains('gbrk-host')) fail('host class not removed');
  frames(10);
  console.log('lifecycle ok | setScore calls:', scores.length);

  console.log('SMOKE OK');
  process.exit(0);
})();
