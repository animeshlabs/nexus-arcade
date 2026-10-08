/* Headless smoke test for Tic-Tac-Toe (mocked DOM + 2D canvas).
   Math.random=0.5 makes bot picks deterministic:
   - EASY bot answers: X0→O5, X1→O6 → X wins row 0-1-2
   - Round 2 opens with O (alternating), EXPERT blocks a two threat
   Flow: EASY full match (3 rounds → YOU WIN) → restart → FRIEND round
         → EXPERT block test → NORMAL sanity → lifecycle            */
const fs = require('fs');

let gameDef = null;
global.registerGame = d => { gameDef = d; };
global.Sfx = { played: [], play(n) { this.played.push(n); } };

/* deterministic bot + particle rng */
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
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 360, height: 440 }),
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
const src = fs.readFileSync(__dirname + '/../assets/js/games/tictactoe.js', 'utf8');
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
const modeBtn = word => findEl(container, el => el.className === 'ttt-mode' && (el.textContent || '').includes(word));
/* logical cell centre: x = 30 + c*100 + 50, y = 50 + r*100 + 50 */
function tapCell(i) {
  const x = 80 + (i % 3) * 100, y = 100 + Math.floor(i / 3) * 100;
  const ev = { clientX: x, clientY: y, cancelable: true, preventDefault() {} };
  container._fire('pointerdown', ev);
}
/* transition: round banner (1.55s) → clear (0.6) → enter (0.6) → play (+bot 0.625 if O opens) */
const waitRound = () => frames(240);
const waitBot = () => frames(60);

const scores = [];
let overTitle = null;
const ctx = {
  container, width: 900, height: 700,
  setScore: n => scores.push(n),
  get score() { return scores.length ? scores[scores.length - 1] : 0; },
  gameOver: o => { overTitle = o.title; },
  toast() {}, sfx() {},
};
function freshInstance() {
  const inst = gameDef.create(ctx);
  return inst;
}

(async () => {
  /* ═══ A — EASY bot: full match to victory ═══ */
  let inst = freshInstance();
  const menu = findEl(container, el => (el.className || '').includes('ttt-menu'));
  if (!menu) { console.log('FAIL: no mode menu'); process.exit(1); }
  const bEasy = modeBtn('EASY');
  if (!bEasy) { console.log('FAIL: no EASY button'); process.exit(1); }
  bEasy._fire('click', {});
  frames(90);                                   // entrance → play
  if (overTitle) { console.log('FAIL: over during entrance'); process.exit(1); }
  console.log('easy started ✓ (start sfx:', Sfx.played.includes('start'), ')');

  /* round 1 — X opens: X0 (bot→O5), X1 (bot→O6), X2 wins */
  tapCell(0); waitBot();
  tapCell(1); waitBot();
  tapCell(2); frames(30);
  console.log(`round1: score=${ctx.score} (expect 100)`);
  if (ctx.score !== 100) { console.log('SMOKE FAIL (round1)'); process.exit(1); }

  /* round 2 — O opens (alternating): bot→O4, X0 (bot→O5), X2 (bot→O6), X1 wins */
  waitRound();
  tapCell(0); waitBot();
  tapCell(2); waitBot();
  tapCell(1); frames(30);
  console.log(`round2: score=${ctx.score} (expect 200)`);
  if (ctx.score !== 200) { console.log('SMOKE FAIL (round2)'); process.exit(1); }

  /* round 3 — X opens again: same line wins the match */
  waitRound();
  tapCell(0); waitBot();
  tapCell(1); waitBot();
  tapCell(2); frames(130);                      // banner dwell 1.9s → finishMatch
  console.log('match end title:', overTitle, '| score =', ctx.score);
  if (overTitle !== 'YOU WIN THE MATCH!' || ctx.score !== 600) {
    console.log('SMOKE FAIL (match end)'); process.exit(1);
  }

  /* restart replays the same mode with a clean sheet */
  inst.restart();
  if (ctx.score !== 0) { console.log('SMOKE FAIL (restart score)'); process.exit(1); }
  frames(90);
  inst.destroy();
  container.children.length = 0;
  console.log('restart + destroy ✓');

  /* ═══ B — FRIEND (2P): one round, alternating taps ═══ */
  overTitle = null;
  inst = freshInstance();
  const bFriend = modeBtn('LOCAL');
  if (!bFriend) { console.log('FAIL: FRIEND button'); process.exit(1); }
  bFriend._fire('click', {});
  frames(90);
  tapCell(0);        // X
  tapCell(3);        // O
  tapCell(1);        // X
  tapCell(4);        // O
  tapCell(2);        // X completes 0-1-2
  frames(30);
  console.log(`friend round: score=${ctx.score} (expect 100)`);
  if (ctx.score !== 100) { console.log('SMOKE FAIL (friend round)'); process.exit(1); }
  inst.destroy();
  container.children.length = 0;

  /* ═══ C — EXPERT: must block a two-in-a-row ═══ */
  overTitle = null;
  inst = freshInstance();
  modeBtn('EXPERT')._fire('click', {});
  frames(90);
  const clicksBefore = Sfx.played.filter(s => s === 'click').length;
  tapCell(0); waitBot();      // expert replies a corner/centre (never a side)
  tapCell(1); waitBot();      // X threatens 2 → expert blocks it
  tapCell(2); frames(30);     // occupied → ignored, no win
  const botMoves = Sfx.played.filter(s => s === 'click').length - clicksBefore;
  console.log(`expert block: score=${ctx.score} (expect 0), bot moves=${botMoves} (expect 2)`);
  if (ctx.score !== 0 || botMoves !== 2) { console.log('SMOKE FAIL (expert block)'); process.exit(1); }
  inst.destroy();
  container.children.length = 0;

  /* ═══ D — NORMAL: takes the centre, no crash ═══ */
  overTitle = null;
  inst = freshInstance();
  modeBtn('NORMAL')._fire('click', {});
  frames(90);
  tapCell(0); waitBot();      // no win/block → centre
  frames(30);
  console.log('normal reply: score =', ctx.score, '(expect 0)');
  if (ctx.score !== 0) { console.log('SMOKE FAIL (normal)'); process.exit(1); }

  /* ═══ E — lifecycle ═══ */
  inst.resize(500, 800); frames(20);
  inst.pause(); frames(40); inst.resume(); frames(20);
  inst.restart(); frames(90);
  if (ctx.score !== 0) { console.log('SMOKE FAIL (final restart)'); process.exit(1); }
  inst.destroy();
  frames(10);
  console.log('lifecycle ok | total setScore calls:', scores.length);

  console.log('SMOKE OK');
  process.exit(0);
})();
