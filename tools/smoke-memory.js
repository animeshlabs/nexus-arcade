/* Headless smoke test for Memory Match (mocked DOM).
   Math.random=0.5 → deterministic shuffle (bot reads layout from state).
   Flow: menu (16 cards / 8 pairs, deck static) → PLAY (clock runs) →
         first pair (+100) → mismatch (unflips after delay) →
         keyboard cursor + Enter flip → pair (+200 total) →
         bot clears deck → CLEARED! → restart → pause freeze →
         resize → idle timeout → TIME UP! exact message →
         destroy → 2nd instance SPACE start */
const fs = require('fs');

let gameDef = null;
global.registerGame = d => { gameDef = d; };
global.Sfx = { played: [], play(n) { this.played.push(n); } };

Math.random = () => 0.5;

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
const container = fakeEl({ clientWidth: 900, clientHeight: 700 });

global.document = {
  createElement: tag => fakeEl(),
  documentElement: {},
};
const winListeners = {};
global.window = {
  addEventListener(e, f) { (winListeners[e] ||= []).push(f); },
  removeEventListener(e, f) { winListeners[e] = (winListeners[e] || []).filter(x => x !== f); },
  _fire(e, ev) { (winListeners[e] || []).slice().forEach(f => f(ev)); },
};

let rafCb = null;
global.requestAnimationFrame = cb => { rafCb = cb; return 1; };
global.cancelAnimationFrame = () => { rafCb = null; };

const src = fs.readFileSync(__dirname + '/../assets/js/games/memory.js', 'utf8');
eval(src);
if (!gameDef) { console.log('FAIL: not registered'); process.exit(1); }
console.log(`registered: ${gameDef.id} / ${gameDef.title} / genre=${gameDef.genre}`);

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
function collect(root, pred, out = []) {
  for (const k of root.children || []) {
    if (pred(k)) out.push(k);
    collect(k, pred, out);
  }
  return out;
}
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
const tickCount = () => Sfx.played.filter(x => x === 'tick').length;

let inst = null;
(async () => {
  /* ═══ A — menu: deck dealt, clock frozen ═══ */
  inst = gameDef.create(ctx);
  const menu = findEl(container, el => (el.className || '').includes('gmem-menu'));
  if (!menu) fail('no menu');
  const btn = findEl(container, el => el.className === 'gmem-play');
  if (!btn) fail('no PLAY button');
  const tips = [];
  (function walk(n) {
    for (const k of n.children || []) {
      if ((k.className || '').includes('gmem-tips')) tips.push(...k.children.map(c => c.textContent));
      walk(k);
    }
  })(container);
  if (tips.length !== 3) fail('tips: ' + tips.join(','));
  const cards = collect(container, el => (el.className || '').includes('gmem-card'));
  if (cards.length !== 16) fail('cards: ' + cards.length);
  const faceEl = collect(container, el => (el.className || '').includes('gmem-face'))[0];
  if (!faceEl || !faceEl.textContent) fail('face element empty');
  let st = inst.getState();
  if (st.phase !== 'menu' || st.timeLeft !== 60 || st.moves !== 0 || st.matches !== 0 || st.score !== 0)
    fail('init ' + JSON.stringify(st));
  if (new Set(st.layout).size !== 8) fail('faces not distinct: ' + st.layout.join(''));
  st.layout.forEach(f => { if (st.layout.filter(x => x === f).length !== 2) fail('pair count for ' + f); });
  if (st.flipped.length || st.matchedIdx.length) fail('deck not face-down');
  frames(30);
  if (inst.getState().timeLeft !== 60) fail('clock ran in menu');
  console.log('menu + 16 cards / 8 pairs, clock frozen ✓');

  /* ═══ B — PLAY → clock runs ═══ */
  btn._fire('click', {});
  st = inst.getState();
  if (st.phase !== 'play') fail('PLAY: ' + st.phase);
  if (!menu.classList.contains('is-out')) fail('menu not dismissed');
  if (!Sfx.played.includes('start')) fail('start sfx');
  frames(30);
  st = inst.getState();
  if (!(st.timeLeft < 60 && st.timeLeft >= 59)) fail('clock: ' + st.timeLeft);
  console.log('PLAY → clock running ✓');

  /* ═══ C — first pair: +100 ═══ */
  cards[0]._fire('click', {});
  st = inst.getState();
  if (st.flipped.length !== 1 || st.flipped[0] !== 0) fail('flip 1: ' + JSON.stringify(st.flipped));
  if (!Sfx.played.includes('click')) fail('flip sfx');
  const pair0 = st.layout.findIndex((f, i) => i !== 0 && f === st.layout[0]);
  cards[pair0]._fire('click', {});
  st = inst.getState();
  if (st.matches !== 1 || st.moves !== 1 || st.score !== 100 || st.streak !== 1)
    fail('pair resolve: ' + JSON.stringify({ m: st.matches, mv: st.moves, s: st.score, k: st.streak }));
  if (st.flipped.length !== 0 || st.matchedIdx.length !== 2) fail('pair state');
  if (ctx.score !== 100) fail('ctx score ' + ctx.score);
  if (!Sfx.played.includes('coin')) fail('match sfx');
  console.log('pair matched (+100) ✓');

  /* ═══ D — mismatch: shows both, then unflips ═══ */
  const d0 = inst.getState();
  let u = -1, v = -1;
  for (let i = 0; i < 16; i++) {
    if (d0.matchedIdx.includes(i)) continue;
    if (u < 0) { u = i; continue; }
    if (d0.layout[i] !== d0.layout[u]) { v = i; break; }
  }
  if (u < 0 || v < 0) fail('no mismatch pair found');
  cards[u]._fire('click', {});
  cards[v]._fire('click', {});
  st = inst.getState();
  if (st.moves !== 2 || !st.locked || st.streak !== 0 || st.score !== 100)
    fail('mismatch: ' + JSON.stringify({ mv: st.moves, locked: st.locked, k: st.streak, s: st.score }));
  if (st.flipped.length !== 2) fail('both shown: ' + JSON.stringify(st.flipped));
  if (!Sfx.played.includes('tick')) fail('miss sfx');
  frames(50);
  st = inst.getState();
  if (st.locked || st.flipped.length !== 0) fail('did not unflip: ' + JSON.stringify({ l: st.locked, f: st.flipped }));
  if (st.matches !== 1 || st.score !== 100) fail('mismatch side effects');
  console.log('mismatch → both show → unflip ✓');

  /* ═══ E — keyboard cursor + Enter, pair → 200 ═══ */
  /* cursor sits on v (last card clicked) */
  const col = v % 4, row = Math.floor(v / 4);
  const expectR = row * 4 + ((col + 1) % 4);
  window._fire('keydown', { code: 'ArrowRight' });
  if (inst.getState().cursorIdx !== expectR) fail('ArrowRight → ' + inst.getState().cursorIdx + ' != ' + expectR);
  const expectD = (expectR + 4) % 16;
  window._fire('keydown', { code: 'ArrowDown' });
  if (inst.getState().cursorIdx !== expectD) fail('ArrowDown → ' + inst.getState().cursorIdx + ' != ' + expectD);
  window._fire('keydown', { code: 'Enter' });
  st = inst.getState();
  if (st.flipped.length !== 1 || st.flipped[0] !== expectD) fail('Enter flip: ' + JSON.stringify(st.flipped));
  window._fire('keydown', { code: 'Enter' });
  if (inst.getState().flipped.length !== 1) fail('double-Enter flipped twice');
  const pairE = st.layout.findIndex((f, i) => i !== expectD && f === st.layout[expectD] && !st.matchedIdx.includes(i));
  cards[pairE]._fire('click', {});
  st = inst.getState();
  if (st.matches !== 2 || st.moves !== 3 || st.score !== 200)
    fail('keyboard pair: ' + JSON.stringify({ m: st.matches, mv: st.moves, s: st.score }));
  console.log('arrows + Enter cursor, pair 2 (score 200) ✓');

  /* ═══ F — bot clears the remaining 6 pairs → CLEARED! ═══ */
  over = null;
  let g = 0;
  while (g++ < 100) {
    const s = inst.getState();
    if (s.matches >= 8) break;
    const i = s.layout.findIndex((f, idx) => !s.matchedIdx.includes(idx));
    const j = s.layout.findIndex((f, idx) => idx !== i && f === s.layout[i] && !s.matchedIdx.includes(idx));
    if (i < 0 || j < 0) fail('pair search failed at ' + s.matches);
    cards[i]._fire('click', {});
    cards[j]._fire('click', {});
  }
  st = inst.getState();
  if (st.phase !== 'over' || st.matches !== 8) fail('not cleared: ' + JSON.stringify({ p: st.phase, m: st.matches }));
  if (!over || over.title !== 'CLEARED!') fail('win title: ' + (over && over.title));
  if (!/^\d+ moves · \d+s · \d+ pts$/.test(over.message)) fail('win message: ' + over.message);
  if (!over.message.endsWith(st.score + ' pts')) fail('message score mismatch: ' + over.message);
  if (st.score < 800) fail('score ' + st.score + ' < 800');
  if (ctx.score !== st.score) fail('ctx sync');
  if (!Sfx.played.includes('win')) fail('win sfx');
  console.log('deck cleared → CLEARED! |', over.message);

  /* ═══ G — restart ═══ */
  inst.restart();
  st = inst.getState();
  if (st.phase !== 'play' || st.moves !== 0 || st.matches !== 0 || st.score !== 0 || st.timeLeft !== 60)
    fail('restart: ' + JSON.stringify(st));
  if (st.flipped.length || st.matchedIdx.length) fail('restart deck');
  if (st.cursorIdx !== 0) fail('cursor reset');
  if (ctx.score !== 0) fail('ctx score not reset');
  if (cards.some(c => c.classList.contains('is-flipped') || c.classList.contains('is-matched')))
    fail('face-up cards persist');
  console.log('restart ✓');

  /* ═══ H — pause freeze ═══ */
  inst.pause();
  const h1 = inst.getState().timeLeft;
  frames(40);
  const h2 = inst.getState().timeLeft;
  if (h2 !== h1) fail('clock ran while paused: ' + h1 + ' → ' + h2);
  inst.resume();
  frames(20);
  if (!(inst.getState().timeLeft < h1)) fail('clock not running after resume');
  console.log('pause freeze ✓');

  /* ═══ J — resize during play ═══ */
  inst.resize(500, 800);
  frames(5);
  st = inst.getState();
  if (st.W !== 500 || st.H !== 800) fail('resize dims ' + st.W + 'x' + st.H);
  if (st.phase !== 'play') fail('phase after resize ' + st.phase);
  console.log('resize ✓');

  /* ═══ I — idle → TIME UP (exact message) ═══ */
  const ticksBefore = tickCount();
  over = null;
  let i2 = 0;
  while (inst.getState().phase === 'play') {
    frames(1);
    if (++i2 > 5000) fail('timeout never fired');
  }
  st = inst.getState();
  if (st.phase !== 'over') fail('phase ' + st.phase);
  if (!over || over.title !== 'TIME UP!') fail('fail title: ' + (over && over.title));
  if (over.message !== '0 moves · 60s · 0 pts') fail('fail message: ' + over.message);
  if (!Sfx.played.includes('hit') || !Sfx.played.includes('lose')) fail('fail sfx');
  if (tickCount() <= ticksBefore) fail('no countdown ticks');
  console.log('idle timeout → TIME UP! (0 moves · 60s · 0 pts) in ' + i2 + ' frames ✓');

  /* ═══ K — destroy ═══ */
  inst.destroy();
  if (rafCb !== null) fail('raf not cancelled');
  if (container.children.length !== 0) fail('host not cleaned: ' + container.children.length);
  if (container.classList.contains('gmem-host')) fail('host class not removed');
  frames(10);
  console.log('destroy cleanup ✓');

  /* ═══ L — 2nd instance: SPACE starts ═══ */
  inst = gameDef.create(ctx);
  window._fire('keydown', { code: 'Space' });
  if (inst.getState().phase !== 'play') fail('SPACE did not start: ' + inst.getState().phase);
  const m2 = findEl(container, el => (el.className || '').includes('gmem-menu'));
  if (!m2.classList.contains('is-out')) fail('menu not dismissed by SPACE');
  frames(10);
  inst.destroy();
  if (container.children.length !== 0) fail('second instance not cleaned');
  console.log('SPACE start + re-lifecycle ✓ | setScore calls:', scores.length);

  console.log('SMOKE OK');
  process.exit(0);
})();
