/* Headless smoke test for Doodle Jump (mocked DOM + 2D canvas). */
const fs = require('fs');

let gameDef = null;
global.registerGame = d => { gameDef = d; };
global.Sfx = { played: [], play(n) { this.played.push(n); } };

/* deterministic layout: every platform at x=175, all normal, no coins */
Math.random = () => 0.5;

/* ── 2D context mock ── */
const ctx2d = new Proxy({}, {
  get(t, p) {
    if (p === 'createRadialGradient') return () => ({ addColorStop() {} });
    if (p in t) return t[p];
    return () => undefined;
  },
  set(t, p, v) { t[p] = v; return true; },
});

function fakeEl(extra = {}) {
  const listeners = {};
  return {
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); } },
    style: {}, textContent: '', className: '', innerHTML: '',
    appendChild() {},
    addEventListener(e, f) { (listeners[e] ||= []).push(f); },
    removeEventListener(e, f) { listeners[e] = (listeners[e] || []).filter(x => x !== f); },
    _fire(e, ev = {}) { (listeners[e] || []).forEach(f => f(ev)); },
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
};

let rafCb = null;
global.requestAnimationFrame = cb => { rafCb = cb; return 1; };
global.cancelAnimationFrame = () => { rafCb = null; };

/* ── load ── */
const src = fs.readFileSync(__dirname + '/../assets/js/games/doodle.js', 'utf8');
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

(async () => {
  /* A — climb with no input: perfectly centred stack → auto-bounce upward */
  frames(700);
  const climb = ctx.score;
  console.log(`climb: score=${climb} (expect > 100), sfx=[${[...new Set(Sfx.played)].join('/')}]`);
  if (climb <= 100) { console.log('SMOKE FAIL (no climb)'); process.exit(1); }

  /* B — steer to the left edge (pointer), then fall to death */
  container._fire('pointermove', { pointerType: 'mouse', clientX: 0, buttons: 0 });
  frames(1200);                      // drift off → fall → 0.8s death anim
  await new Promise(r => setTimeout(r, 100));
  frames(20);
  console.log('game over title:', overTitle || 'NOT YET');
  if (overTitle !== 'FELL OFF!') { console.log('SMOKE FAIL (no game over)'); process.exit(1); }

  /* C — restart resets and climbs again */
  inst.restart();
  const afterRestart = ctx.score;
  frames(400);
  console.log(`restart: score after=${afterRestart} → ${ctx.score} (expect 0 then > 50)`);
  if (afterRestart !== 0 || ctx.score <= 50) { console.log('SMOKE FAIL (restart)'); process.exit(1); }

  /* D — keyboard tap + lifecycle */
  (winListeners.keydown || []).forEach(f => f({ key: 'ArrowRight', preventDefault() {} }));
  frames(20);
  (winListeners.keyup || []).forEach(f => f({ key: 'ArrowRight', preventDefault() {} }));
  inst.pause(); frames(60);
  inst.resume(); frames(60);
  inst.resize(500, 800); frames(30);
  inst.destroy();
  console.log('lifecycle ok | total setScore calls:', scores.length);

  console.log('SMOKE OK');
  process.exit(0);
})();
