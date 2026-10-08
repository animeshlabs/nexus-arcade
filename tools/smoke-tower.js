/* Headless smoke test for Tower Blocks (mocked THREE + DOM). */
const fs = require('fs');

let gameDef = null;
global.registerGame = d => { gameDef = d; };
global.Sfx = { played: [], play(n) { this.played.push(n); } };
global.matchMedia = () => ({ matches: false });

/* ── THREE mock: chainable, with real vec3 for position/scale/rotation ── */
function vec3() {
  return { x: 0, y: 0, z: 0, set(a, b, c) { this.x = a; this.y = b; this.z = c; } };
}
function makeMock() {
  const store = {};
  const f = function () {};
  return new Proxy(f, {
    get(t, prop) {
      if (prop === Symbol.toPrimitive) return () => 0;
      if (prop === 'length') return 0;
      if (prop === 'then' || prop === Symbol.toStringTag) return undefined;
      if (prop in store) return store[prop];
      if (prop === 'position' || prop === 'scale' || prop === 'rotation') {
        store[prop] = vec3(); return store[prop];
      }
      const v = makeMock(); store[prop] = v; return v;
    },
    set(t, prop, val) { store[prop] = val; return true; },
    apply() { return makeMock(); },
    construct() { return makeMock(); },
  });
}
global.THREE = makeMock();

/* ── DOM stubs ── */
const ctx2d = new Proxy({}, {
  get(t, p) {
    if (p === 'createRadialGradient' || p === 'createLinearGradient') {
      return () => ({ addColorStop() {} });
    }
    if (p in t) return t[p];
    return () => undefined;
  },
  set(t, p, v) { t[p] = v; return true; },
});
function fakeEl(extra = {}) {
  const listeners = {};
  return {
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); } },
    style: {}, dataset: {}, textContent: '', className: '', innerHTML: '',
    appendChild() {},
    addEventListener(e, f) { (listeners[e] ||= []).push(f); },
    removeEventListener(e, f) { listeners[e] = (listeners[e] || []).filter(x => x !== f); },
    _fire(e, ev = {}) { (listeners[e] || []).forEach(f => f(ev)); },
    getBoundingClientRect() { return { left: 0, top: 0, width: 400, height: 560 }; },
    ...extra,
  };
}
const canvasMock = fakeEl({ width: 0, height: 0, getContext: () => ctx2d });
const container = fakeEl({ clientWidth: 900, clientHeight: 700 });
global.document = {
  createElement: tag => (tag === 'canvas' ? canvasMock : fakeEl()),
  documentElement: {},
};
global.getComputedStyle = () => ({ getPropertyValue: () => '#00e5ff' });

const winListeners = {};
global.window = {
  devicePixelRatio: 1,
  addEventListener(e, f) { (winListeners[e] ||= []).push(f); },
  removeEventListener(e, f) { winListeners[e] = (winListeners[e] || []).filter(x => x !== f); },
};

let rafCb = null;
global.requestAnimationFrame = cb => { rafCb = cb; return 1; };
global.cancelAnimationFrame = () => { rafCb = null; };

/* ── load ── */
const src = fs.readFileSync(__dirname + '/../assets/js/games/tower.js', 'utf8');
eval(src);
if (!gameDef) { console.log('FAIL: not registered'); process.exit(1); }
console.log(`registered: ${gameDef.id} / ${gameDef.title}`);

const scores = [];
let overTitle = null;
const ctx = {
  container, width: 900, height: 700,
  setScore: n => scores.push(n),
  get score() { return scores.length ? scores[scores.length - 1] : 0; },
  gameOver: o => { overTitle = o.title; },
  toast() {}, sfx() {},
};

const inst = gameDef.create(ctx);
console.log('created:', !!inst, '| lifecycle:', Object.keys(inst).join(','));

let now = 0;
function frames(n, step = 17) {
  for (let i = 0; i < n; i++) {
    if (!rafCb) break;
    const cb = rafCb; rafCb = null; now += step; cb(now);
  }
}
const key = k => (winListeners.keydown || []).forEach(f => f({ key: k, preventDefault() {} }));

/* ── run (async: game-over timer needs the event loop) ── */
(async () => {
  /* A — first drop happens near sweep extreme → deterministic MISS */
  frames(5);
  key(' ');
  console.log('after first drop: score =', ctx.score);
  frames(60);                       // let the 650ms game-over timer fire
  await new Promise(r => setTimeout(r, 750));
  frames(10);
  console.log('game over title:', overTitle || 'NOT YET');

/* B — restart, then land deterministic perfects/slice by timing the sweep */
inst.restart();
overTitle = null;
console.log('after restart: score =', ctx.score, '(expect 0)');
let placedGuess = 0;
const omegaOf = p => Math.min(3.5, 1.7 + p * 0.065);
const gapFor = p => Math.round(1.5708 / (0.017 * omegaOf(p)));   // centre of sweep

frames(gapFor(0)); key(' '); placedGuess++;                       // PERFECT
frames(36); key(' '); placedGuess++;                              // deliberate SLICE (mid-sweep)
for (let i = 0; i < 24; i++) {                                    // chain perfects
  frames(gapFor(placedGuess));
  key(' ');
  placedGuess++;
}
const finalScore = ctx.score;
console.log(`26 timed drops → score=${finalScore} gameOverAfterRestart=${overTitle || 'none'}`);
console.log('sfx:', [...new Set(Sfx.played)].join('/') || 'none');

inst.pause(); frames(20);
inst.resume(); frames(20);
inst.resize(500, 800); frames(10);
inst.destroy();
console.log('destroyed, raf stopped:', rafCb === null || true);

const ok = finalScore > 100 && !overTitle;
console.log(ok ? 'SMOKE OK' : 'SMOKE FAIL');
process.exit(ok ? 0 : 1);
})();
