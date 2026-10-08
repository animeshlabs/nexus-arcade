/* Headless smoke test for 2048 — the user's clone logic, DOM edition.
   Math.random = 0.5 → spawn = floor(0.5 × empties), always value 2.
   A — instant start (their design has no menu): spawn grid, tagline, score box
   B — exact reference-logic grids: up(1) left(2) down(3) right-via-swipe(4)
   C — pause gate   D — restart resets everything
   E — deterministic death: up/left/down/right → lose @146 presses,
       score 1356, best tile 128, exact final grid, then the
       gameOver overlay payload after the end-of-run delay
   F — lifecycle / destroy cleanup                                        */
const fs = require('fs');

let gameDef = null;
global.registerGame = d => { gameDef = d; };
global.Sfx = { played: [], play(n) { this.played.push(n); } };

/* deterministic spawn rng — uniform-over-empties pick */
Math.random = () => 0.5;

function fakeEl(extra = {}) {
  const listeners = {};
  return {
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); } },
    style: {}, textContent: '', className: '', innerHTML: '',
    children: [], parentNode: null,
    appendChild(c) { c.parentNode = this; this.children.push(c); },
    removeChild(c) { this.children = this.children.filter(x => x !== c); c.parentNode = null; },
    addEventListener(e, f) { (listeners[e] ||= []).push(f); },
    removeEventListener(e, f) { listeners[e] = (listeners[e] || []).filter(x => x !== f); },
    _fire(e, ev = {}) { (listeners[e] || []).slice().forEach(f => f(ev)); },
    ...extra,
  };
}
const container = fakeEl({ clientWidth: 900, clientHeight: 700 });

global.document = { createElement: () => fakeEl(), documentElement: {} };

/* ── window with a keydown bus ── */
const winListeners = {};
global.window = {
  addEventListener(e, f) { (winListeners[e] ||= []).push(f); },
  removeEventListener(e, f) { winListeners[e] = (winListeners[e] || []).filter(x => x !== f); },
};
const key = k => (winListeners.keydown || []).slice().forEach(f => f({ key: k, preventDefault() {} }));

let rafCb = null;
global.requestAnimationFrame = cb => { rafCb = cb; return 1; };
global.cancelAnimationFrame = () => { rafCb = null; };

/* ── load ── */
const src = fs.readFileSync(__dirname + '/../assets/js/games/2048.js', 'utf8');
eval(src);
if (!gameDef) { console.log('FAIL: not registered'); process.exit(1); }
console.log(`registered: ${gameDef.id} / ${gameDef.title} / genre=${gameDef.genre}`);
if (gameDef.id !== '2048') { console.log('FAIL: bad id'); process.exit(1); }

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
const fail = msg => { console.log('FAIL: ' + msg); process.exit(1); };
function expectGrid(st, want, label) {
  const got = st.grid;
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    console.log('FAIL grid [' + label + ']');
    console.log('  got : ' + got.join(','));
    console.log('  want: ' + want.join(','));
    process.exit(1);
  }
}
const SWIPES = {
  left:  [340, 300, 120, 300],
  right: [120, 300, 340, 300],
  up:    [220, 380, 220, 140],
  down:  [220, 140, 220, 380],
};
function swipe(dir) {
  const a = SWIPES[dir];
  container._fire('pointerdown', { clientX: a[0], clientY: a[1], cancelable: true, preventDefault() {} });
  container._fire('pointerup', { clientX: a[2], clientY: a[3], cancelable: true, preventDefault() {} });
}

const scores = [];
let over = null;
const toasts = [];
const ctx = {
  container, width: 900, height: 700,
  setScore: n => scores.push(n),
  get score() { return scores.length ? scores[scores.length - 1] : 0; },
  gameOver: o => { over = o; },
  toast: (m, k) => toasts.push({ m, k }),
  sfx() {},
};

(async () => {
  /* ═══ A — instant start (their design has no menu) ═══ */
  const inst = gameDef.create(ctx);
  if (!container.classList.contains('g2048-host')) fail('host class missing');
  const wrap = findEl(container, el => typeof el.className === 'string' && el.className.includes('g2048-wrap'));
  if (!wrap) fail('wrap missing');
  const title = findEl(wrap, el => typeof el.className === 'string' && el.className.includes('g2048-title'));
  const line = findEl(wrap, el => typeof el.className === 'string' && el.className.includes('g2048-result'));
  const boxV = findEl(wrap, el => typeof el.className === 'string' && el.className.includes('g2048-score__v'));
  const grid = findEl(wrap, el => typeof el.className === 'string' && el.className.includes('g2048-grid'));
  if (!title || !line || !boxV || !grid) fail('layout parts missing');
  if (title.textContent !== '2048') fail('title: ' + title.textContent);
  if (grid.children.length !== 16) fail('cells: ' + grid.children.length);
  if (typeof line.innerHTML !== 'string' || line.innerHTML.indexOf('Join the numbers') === -1) fail('tagline: ' + line.innerHTML);
  if (boxV.textContent !== '0') fail('score box: ' + boxV.textContent);
  if (findEl(container, el => typeof el.className === 'string' && el.className.includes('g2048-menu'))) fail('menu present — must start instantly');

  let st = inst.getState();
  if (st.phase !== 'play') fail('phase: ' + st.phase);
  if (st.result !== '') fail('result pre-game: ' + st.result);
  expectGrid(st, [0,0,0,0, 0,0,0,2, 2,0,0,0, 0,0,0,0], 'spawn');
  if (st.score !== 0 || st.presses !== 0) fail('spawn stats');
  console.log('A → instant start, spawn grid exact ✓');

  /* ═══ B — reference-logic grids ═══ */
  key('ArrowUp');
  st = inst.getState();
  expectGrid(st, [2,0,0,2, 0,0,0,0, 0,2,0,0, 0,0,0,0], 'up1');
  if (st.presses !== 1 || st.score !== 0) fail('up1 stats ' + st.presses + '/' + st.score);
  if (grid.children[9].className.indexOf('is-new') === -1) fail('spawn pop missing on cell 9');
  if (!Sfx.played.includes('tick')) fail('plain-press tick sfx missing');

  key('ArrowLeft');
  st = inst.getState();
  expectGrid(st, [4,0,0,0, 0,0,0,0, 2,2,0,0, 0,0,0,0], 'left2');
  if (st.score !== 4 || st.presses !== 2) fail('left2 stats ' + st.score + '/' + st.presses);
  if (boxV.textContent !== '4') fail('score box not synced: ' + boxV.textContent);
  if (ctx.score !== 4) fail('setScore not synced: ' + ctx.score);
  if (!Sfx.played.includes('click')) fail('merge sfx missing');

  key('ArrowDown');
  st = inst.getState();
  expectGrid(st, [0,0,0,0, 0,0,2,0, 4,0,0,0, 2,2,0,0], 'down3');
  if (st.presses !== 3 || st.score !== 4) fail('down3 stats ' + st.presses + '/' + st.score);

  swipe('right');                        // touch path — same reference logic
  st = inst.getState();
  expectGrid(st, [0,0,0,0, 0,0,2,2, 0,0,0,4, 0,0,0,4], 'swipe4');
  if (st.presses !== 4 || st.score !== 8) fail('swipe stats ' + st.presses + '/' + st.score);
  if (boxV.textContent !== '8') fail('score box after swipe: ' + boxV.textContent);
  console.log('B → reference logic exact ✓ (up/left/down/right+swipe, score box synced)');

  /* ═══ C — pause gate ═══ */
  inst.pause();
  key('ArrowLeft'); swipe('up'); swipe('down'); key('ArrowRight');
  st = inst.getState();
  if (st.presses !== 4 || st.score !== 8) fail('input leaked through pause');
  inst.resume();
  console.log('C → pause gate ✓');

  /* ═══ D — restart resets everything ═══ */
  inst.restart();
  st = inst.getState();
  expectGrid(st, [0,0,0,0, 0,0,0,2, 2,0,0,0, 0,0,0,0], 'restart');
  if (st.score !== 0 || st.presses !== 0 || st.phase !== 'play') fail('restart stats');
  if (ctx.score !== 0) fail('restart setScore');
  if (boxV.textContent !== '0') fail('restart score box');
  if (line.innerHTML.indexOf('Join the numbers') === -1) fail('tagline not restored');
  if (line.classList.contains('is-win') || line.classList.contains('is-lose')) fail('result classes not cleared');
  console.log('D → restart clean ✓');

  /* ═══ E — deterministic death: up,left,down,right → 146 presses ═══ */
  const cyc = ['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'];
  let guard = 0;
  while (inst.getState().phase === 'play' && guard < 600) { key(cyc[guard % 4]); guard++; }
  st = inst.getState();
  if (st.phase !== 'ending') fail('phase after cycle: ' + st.phase + ' @' + guard);
  if (guard !== 146) fail('presses until death: ' + guard);
  expectGrid(st, [4,64,4,16, 2,8,128,2, 4,2,8,2, 2,16,32,2], 'final');
  if (st.score !== 1356 || st.max !== 128) fail('final stats ' + st.score + '/' + st.max);
  if (st.result !== 'You LOSE') fail('result: ' + st.result);
  if (line.textContent !== 'You LOSE') fail('line text: ' + line.textContent);
  if (!line.classList.contains('is-lose')) fail('is-lose class missing');
  if (boxV.textContent !== '1356') fail('score box at death: ' + boxV.textContent);
  if (ctx.score !== 1356) fail('setScore at death: ' + ctx.score);

  key('ArrowUp'); swipe('left');          // locked while ending…
  if (inst.getState().presses !== 146) fail('input leaked during ending');
  frames(80);                             // END_DELAY 1.15s → 80×17ms
  if (!over) fail('gameOver not fired');
  if (over.title !== 'You LOSE') fail('over title: ' + over.title);
  if (over.message !== '1356 pts · best tile 128') fail('over message: ' + over.message);
  if (inst.getState().phase !== 'over') fail('phase after over');
  key('ArrowDown'); swipe('up');          // …and after over
  if (inst.getState().presses !== 146) fail('input leaked after over');
  console.log(`E → ${over.title} | ${over.message} @${guard} presses ✓`);

  /* ═══ F — lifecycle ═══ */
  inst.resize(500, 800); frames(10);
  inst.pause(); frames(20); inst.resume(); frames(10);
  inst.restart();
  st = inst.getState();
  if (st.phase !== 'play' || st.score !== 0 || st.presses !== 0) fail('final restart');
  inst.destroy();
  if (rafCb !== null) fail('raf not cancelled');
  if (container.children.length !== 0) fail('host not cleaned: ' + container.children.length);
  if (container.classList.contains('g2048-host')) fail('host class not removed');
  if ((winListeners.keydown || []).length !== 0) fail('keydown listener leaked');
  console.log('F → lifecycle ok | setScore calls:', scores.length);

  console.log('SMOKE OK');
  process.exit(0);
})();
