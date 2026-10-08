/* Headless smoke test for Flappy Bird (mocked DOM + 2D canvas).
   Math.random=0.5 → every pipe gap centre lands exactly at 313 (=groundY/2),
   so a feedback autopilot (flap when y > gap+6) threads the pipes.
   Flow: menu → PLAY → ready → tap → play → autopilot to 5 pipes (coin+power)
         → stop flapping → death → GAME OVER banner → gameOver
         → restart → pause/resume freeze → SPACE keydown → lifecycle         */
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
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 420, height: 700 }),
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
const src = fs.readFileSync(__dirname + '/../assets/js/games/flappy.js', 'utf8');
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
const tap = () => container._fire('pointerdown', { cancelable: true, preventDefault() {} });

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

(async () => {
  /* ═══ A — menu → PLAY → ready ═══ */
  const inst = gameDef.create(ctx);
  const menu = findEl(container, el => (el.className || '').includes('fl-menu'));
  if (!menu) fail('no menu');
  const btn = findEl(container, el => el.className === 'fl-play');
  if (!btn) fail('no PLAY button');
  if (inst.getState().phase !== 'menu') fail('phase not menu');
  frames(30);
  btn._fire('click', {});
  if (inst.getState().phase !== 'ready') fail('PLAY did not enter ready');
  if (!menu.classList.contains('is-out')) fail('menu not dismissed');
  if (!Sfx.played.includes('start')) fail('start sfx missing');
  frames(40);                                  // bob in ready
  if (over) fail('over during ready');
  console.log('menu → ready ✓ (bobbing, no pipes yet)');

  /* ═══ B — tap → play → autopilot to 5 pipes ═══ */
  tap();
  if (inst.getState().phase !== 'play') fail('tap did not start play');
  let flaps = 0;
  for (let i = 0; i < 1400 && inst.getState().score < 5; i++) {
    const st = inst.getState();
    if (st.phase !== 'play') break;
    const target = st.gap != null ? st.gap : 313;
    if (st.y > target + 6) { tap(); flaps++; }
    frames(1);
  }
  const st = inst.getState();
  console.log(`autopilot: score=${st.score} flaps=${flaps} (need >=5)`);
  if (st.score < 5) fail('did not score 5 pipes');
  if (!Sfx.played.includes('jump')) fail('flap sfx missing');
  if (!Sfx.played.includes('coin')) fail('coin sfx missing');
  if (!Sfx.played.includes('power')) fail('milestone power sfx missing');
  if (ctx.score !== st.score) fail('setScore out of sync');
  console.log('scoring + milestone ✓');

  /* ═══ C — stop flapping → death → GAME OVER ═══ */
  over = null;
  frames(700);                                 // fall + tumble + banner dwell
  console.log('over:', over && over.title, '| msg:', over && over.message);
  if (!over || over.title !== 'GAME OVER') fail('gameOver not called');
  if (!/pipes/.test(over.message)) fail('message missing');
  if (!Sfx.played.includes('hit') || !Sfx.played.includes('lose')) fail('death sfx missing');
  if (inst.getState().phase !== 'over') fail('phase not over');

  /* ═══ D — restart → pause/resume → keyboard ═══ */
  inst.restart();
  if (inst.getState().phase !== 'ready') fail('restart not ready');
  if (inst.getState().score !== 0 || ctx.score !== 0) fail('restart score not zero');
  const yFrozen = inst.getState().y;
  inst.pause();
  frames(40);
  if (inst.getState().y !== yFrozen) fail('paused world still moving');
  inst.resume();
  frames(25);
  if (inst.getState().y === yFrozen) fail('resume did not unfreeze');
  window._fire('keydown', { code: 'Space', preventDefault() {} });
  if (inst.getState().phase !== 'play') fail('SPACE did not start play');
  tap(); frames(5);
  console.log('restart + pause/resume + keyboard ✓');

  /* ═══ E — lifecycle ═══ */
  inst.resize(500, 800); frames(20);
  inst.pause(); frames(40); inst.resume(); frames(20);
  inst.destroy();
  if (rafCb !== null) fail('raf not cancelled');
  if (container.children.length !== 0) fail('host not cleaned');
  if (container.classList.contains('fl-host')) fail('host class not removed');
  frames(10);
  console.log('lifecycle ok | setScore calls:', scores.length);

  console.log('SMOKE OK');
  process.exit(0);
})();
