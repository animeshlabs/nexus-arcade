/* Headless smoke test for Candy Crush (mocked DOM + 2D canvas).
   Flow: menu → SPRINT → swipe + tap-sweep scoring → TIME UP → restart
         → fresh instance → 30 MOVES → OUT OF MOVES → restart → lifecycle */
const fs = require('fs');

let gameDef = null;
global.registerGame = d => { gameDef = d; };
global.Sfx = { played: [], play(n) { this.played.push(n); } };

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
    appendChild(c) { this.children.push(c); },
    addEventListener(e, f) { (listeners[e] ||= []).push(f); },
    removeEventListener(e, f) { listeners[e] = (listeners[e] || []).filter(x => x !== f); },
    _fire(e, ev = {}) { (listeners[e] || []).slice().forEach(f => f(ev)); },
    ...extra,
  };
}
const canvasMock = fakeEl({
  width: 0, height: 0,
  getContext: () => ctx2d,
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 464, height: 492 }),
});
const container = fakeEl({ clientWidth: 900, clientHeight: 700 });

global.document = {
  createElement: tag => (tag === 'canvas' ? canvasMock : fakeEl()),
  documentElement: {},
};
global.window = { devicePixelRatio: 1 };

let rafCb = null;
global.requestAnimationFrame = cb => { rafCb = cb; return 1; };
global.cancelAnimationFrame = () => { rafCb = null; };

/* ── load ── */
const src = fs.readFileSync(__dirname + '/../assets/js/games/candy.js', 'utf8');
eval(src);
if (!gameDef) { console.log('FAIL: not registered'); process.exit(1); }
console.log(`registered: ${gameDef.id} / ${gameDef.title}`);

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
const modeBtn = word => findEl(container, el => el.className === 'cc-mode' && (el.textContent || '').includes(word));

/* logical cell centres: x = 16 + c*54 + 27, y = 44 + r*54 + 27 */
const cx = c => 43 + 54 * c;
const cy = r => 71 + 54 * r;
function tapCell(r, c) {
  const ev = { clientX: cx(c), clientY: cy(r), cancelable: true, preventDefault() {} };
  container._fire('pointerdown', ev);
  container._fire('pointerup', ev);
}
function swipe(r, c, dx, dy) {
  container._fire('pointerdown', { clientX: cx(c), clientY: cy(r), cancelable: true, preventDefault() {} });
  container._fire('pointermove', { clientX: cx(c) + dx, clientY: cy(r) + dy, preventDefault() {} });
  container._fire('pointerup', { clientX: cx(c) + dx, clientY: cy(r) + dy, preventDefault() {} });
}
/* wait until score stops changing (cascade gaps are < 1s, window is 2.55s) */
function settle() {
  for (let i = 0; i < 10; i++) {
    const s = ctx.score;
    frames(150);
    if (ctx.score === s) return;
  }
}
/* try every adjacent pair until one scores (board always has ≥1 valid move) */
function tapSweep() {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      for (const [r2, c2] of [[r, c + 1], [r + 1, c]]) {
        if (r2 >= 8 || c2 >= 8) continue;
        const before = ctx.score;
        tapCell(r, c);
        tapCell(r2, c2);
        frames(30);
        if (ctx.score !== before) return true;
        if (overTitle) return false;          // clock ran out mid-sweep
      }
    }
  }
  return false;
}

const scores = [];
let overTitle = null;
const ctx = {
  container, width: 900, height: 700,
  setScore: n => scores.push(n),
  get score() { return scores.length ? scores[scores.length - 1] : 0; },
  gameOver: o => { overTitle = o.title; },
  toast() {}, sfx() {},
};

(async () => {
  /* A — create: menu present, decorative board behind it */
  const inst = gameDef.create(ctx);
  console.log('created:', !!inst, '| lifecycle:', Object.keys(inst).join(','));
  const menu = findEl(container, el => (el.className || '').includes('cc-menu'));
  if (!menu) { console.log('FAIL: no mode menu'); process.exit(1); }
  console.log('menu present ✓ | score at boot =', ctx.score);

  /* B — pick SPRINT (timed) */
  const bTimed = modeBtn('SPRINT');
  if (!bTimed) { console.log('FAIL: no SPRINT button'); process.exit(1); }
  bTimed._fire('click', {});
  frames(90);                                   // entrance (unlocks at 1.25s)
  if (overTitle) { console.log('FAIL: over during entrance:', overTitle); process.exit(1); }
  console.log('sprint started ✓ (start sfx:', Sfx.played.includes('start'), ')');

  /* C — swipe gesture, then tap-sweep until something scores */
  swipe(4, 4, 60, 0);                           // may swap (4,4)↔(4,5) or revert
  frames(40);
  let scored = ctx.score > 0;
  if (!scored) {
    settle();
    scored = tapSweep();
  }
  console.log(`scoring: score=${ctx.score} via ${scored ? 'swap ✓' : '✗'}`);
  if (!scored || ctx.score <= 0) { console.log('SMOKE FAIL (no scoring swap)'); process.exit(1); }
  const sfxHas = n => Sfx.played.includes(n);
  if (!sfxHas('start') || !(sfxHas('coin') || sfxHas('power'))) {
    console.log('SMOKE FAIL (missing sfx)'); process.exit(1);
  }
  console.log('sfx ok ✓ | setScore calls:', scores.length);

  /* D — pause/resume, then run the 120s clock out */
  settle();
  inst.pause(); frames(300); inst.resume(); frames(30);
  frames(9000);                                 // > 120s of game time
  console.log('after clock:', overTitle);
  if (overTitle !== 'TIME UP!') { console.log('SMOKE FAIL (timer)'); process.exit(1); }

  /* E — restart replays timed mode with score reset */
  inst.restart();
  if (ctx.score !== 0) { console.log('SMOKE FAIL (restart score)'); process.exit(1); }
  frames(120);
  inst.destroy();
  container.children.length = 0;                // emulate innerHTML = ''
  console.log('restart + destroy ✓');

  /* F — fresh instance, 30 MOVES mode, spend every move */
  overTitle = null;
  const inst2 = gameDef.create(ctx);
  const bMoves = modeBtn('MOVES');
  if (!bMoves) { console.log('FAIL: no MOVES button'); process.exit(1); }
  bMoves._fire('click', {});
  frames(90);
  settle();
  let swaps = 0;
  for (let i = 0; i < 40 && !overTitle; i++) {
    if (!tapSweep()) { console.log('SMOKE FAIL (no move found, iteration ' + i + ')'); process.exit(1); }
    swaps++;
    settle();
  }
  console.log(`moves mode: ${swaps} scoring swaps → ${overTitle}`);
  if (overTitle !== 'OUT OF MOVES') { console.log('SMOKE FAIL (moves mode)'); process.exit(1); }

  /* G — restart in moves mode + lifecycle teardown */
  inst2.restart();
  if (ctx.score !== 0) { console.log('SMOKE FAIL (moves restart)'); process.exit(1); }
  frames(120);
  inst2.resize(500, 800); frames(20);
  inst2.pause(); frames(20); inst2.resume(); frames(20);
  inst2.destroy();
  frames(10);
  console.log('lifecycle ok | total setScore calls:', scores.length);

  console.log('SMOKE OK');
  process.exit(0);
})();
