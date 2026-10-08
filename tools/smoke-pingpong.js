/* Headless smoke test for Ping Pong (mocked DOM + 2D canvas).
   Math.random=0.5 → deterministic particles.
   Bot: per-frame pointer aim at ball.y ± 40 (alternating by return
   count) → guaranteed returns, sharp angles → machine misses →
   bot wins 11-0. Then parks the paddle opposite the ball so the
   machine reaches 11 → loss path. Invariants: score = 50*points +
   2*returns (+100 win bonus).
   Flow: menu (court + digits static) → PLAY → serve → launch speed →
         pointer/keyboard paddle → pause freeze → bot match WIN
         (YOU WIN! 11-0) → restart → parked bot match LOSS (GAME OVER)
         → restart fresh → resize clamp → destroy → 2nd instance SPACE */
const fs = require('fs');

let gameDef = null;
global.registerGame = d => { gameDef = d; };
global.Sfx = { played: [], play(n) { this.played.push(n); } };

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
const src = fs.readFileSync(__dirname + '/../assets/js/games/pingpong.js', 'utf8');
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
const aim = y => container._fire('pointermove', { clientY: y, clientX: 40 });

let inst = null;
(async () => {
  /* ═══ A — menu: court + menu structure static ═══ */
  inst = gameDef.create(ctx);
  const menu = findEl(container, el => (el.className || '').includes('gpp-menu'));
  if (!menu) fail('no menu');
  const btn = findEl(container, el => el.className === 'gpp-play');
  if (!btn) fail('no PLAY button');
  const mTitle = menu.children[0] && menu.children[0].children[0];
  if (!mTitle || mTitle.textContent !== 'PING PONG') fail('title: ' + (mTitle && mTitle.textContent));
  const mHint = menu.children[0] && menu.children[0].children[1];
  if (!mHint || !/^First to 11/.test(mHint.textContent || '')) fail('hint: ' + (mHint && mHint.textContent));
  const tips = [];
  (function walk(n) {
    for (const k of n.children || []) {
      if ((k.className || '').includes('gpp-tips')) tips.push(...k.children.map(c => c.textContent));
      walk(k);
    }
  })(container);
  if (tips.length !== 3) fail('tips: ' + tips.join(','));
  if (!canvasMock.parentNode) fail('canvas not mounted');
  let st = inst.getState();
  if (st.phase !== 'menu' || st.you !== 0 || st.foe !== 0 || st.returns !== 0 || st.score !== 0)
    fail('init ' + JSON.stringify(st));
  if (st.bx !== st.W / 2 || st.by !== st.H / 2) fail('ball not centred: ' + st.bx + ',' + st.by);
  frames(30);
  st = inst.getState();
  if (st.phase !== 'menu' || st.bx !== 450 || st.vx !== 0) fail('menu moved: ' + JSON.stringify(st));
  console.log('menu + court + tips (3) static ✓');

  /* ═══ B — PLAY → serve → launch ═══ */
  btn._fire('click', {});
  st = inst.getState();
  if (st.phase !== 'play') fail('PLAY: ' + st.phase);
  if (!menu.classList.contains('is-out')) fail('menu not dismissed');
  if (!Sfx.played.includes('start')) fail('start sfx');
  if (st.serveT <= 0) fail('no serve countdown: ' + st.serveT);
  let g = 0;
  while (st.serveT > 0 && g++ < 120) { frames(1); st = inst.getState(); }
  if (st.serveT > 0) fail('serve never launched');
  if (st.speed < 335 || st.speed > 345) fail('launch speed ' + st.speed);
  if (!(st.vx > 0)) fail('serve not toward machine: vx=' + st.vx);
  console.log('PLAY → serve → launch @ ' + st.speed + ' px/s ✓');

  /* ═══ C — pointer + keyboard paddle ═══ */
  aim(200);
  frames(1);
  st = inst.getState();
  if (Math.abs(st.py - 200) > 1) fail('pointer aim: py=' + st.py);
  window._fire('keydown', { code: 'ArrowUp' });
  frames(10);
  const afterUp = inst.getState().py;
  window._fire('keyup', { code: 'ArrowUp' });
  if (afterUp > 160) fail('ArrowUp did not lift paddle: py=' + afterUp);
  window._fire('keydown', { code: 'ArrowDown' });
  frames(10);
  const afterDn = inst.getState().py;
  window._fire('keyup', { code: 'ArrowDown' });
  if (afterDn < afterUp + 60) fail('ArrowDown did not drop paddle: ' + afterUp + '→' + afterDn);
  console.log('pointer + arrows paddle ✓');

  /* ═══ D — pause freeze mid-flight ═══ */
  inst.pause();
  const d1 = inst.getState();
  frames(40);
  const d2 = inst.getState();
  if (d2.bx !== d1.bx || d2.by !== d1.by || d2.serveT !== d1.serveT || d2.phase !== d1.phase)
    fail('not frozen: ' + JSON.stringify({ a: [d1.bx, d1.by], b: [d2.bx, d2.by] }));
  inst.resume();
  frames(6);
  const d3 = inst.getState();
  if (d3.bx === d2.bx && d3.by === d2.by && d3.serveT === d2.serveT) fail('did not resume');
  console.log('pause freeze ✓');

  /* ═══ E — bot wins the match 11-0 ═══ */
  over = null;
  g = 0;
  while (inst.getState().phase !== 'over' && g++ < 40000) {
    const s = inst.getState();
    const off = (s.returns % 2 === 0) ? 40 : -40;
    aim(s.by + off);
    frames(1);
  }
  st = inst.getState();
  if (st.phase !== 'over') fail('match never ended: ' + JSON.stringify(st));
  if (st.you !== 11 || st.foe !== 0) fail('score line: ' + st.you + '-' + st.foe + ' after ' + g + ' frames');
  if (!over || over.title !== 'YOU WIN!') fail('win title: ' + (over && over.title));
  if (over.message !== `11-0 · ${st.returns} returns`) fail('win message: ' + over.message);
  if (ctx.score !== 650 + 2 * st.returns) fail('win score ' + ctx.score + ' != 650+2*' + st.returns);
  if (!Sfx.played.includes('win')) fail('win sfx');
  if (st.speed < 0) fail('speed sanity');
  console.log(`bot match won 11-0 in ${g} frames | returns=${st.returns} | ${over.message} | score ${ctx.score} ✓`);

  /* ═══ F — restart → parked paddle → machine wins 11 ═══ */
  inst.restart();
  st = inst.getState();
  if (st.phase !== 'play' || st.you !== 0 || st.foe !== 0 || st.returns !== 0 || st.score !== 0)
    fail('restart: ' + JSON.stringify(st));
  if (ctx.score !== 0) fail('score not reset');
  if (st.serveT <= 0) fail('restart serve missing');
  over = null;
  g = 0;
  while (inst.getState().phase !== 'over' && g++ < 40000) {
    const s = inst.getState();
    /* park opposite the ball so returns are rare */
    aim(s.by < s.H / 2 ? s.H - 10 : 10);
    frames(1);
  }
  st = inst.getState();
  if (st.phase !== 'over') fail('loss match never ended: ' + JSON.stringify(st));
  if (st.foe !== 11) fail('machine should reach 11: ' + st.you + '-' + st.foe);
  if (st.you >= 11) fail('parked player won?! ' + st.you + '-' + st.foe);
  if (!over || over.title !== 'GAME OVER') fail('loss title: ' + (over && over.title));
  if (over.message !== `${st.you}-11 · ${st.returns} returns`) fail('loss message: ' + over.message);
  if (ctx.score !== 50 * st.you + 2 * st.returns) fail('loss score ' + ctx.score + ' != 50*' + st.you + '+2*' + st.returns);
  if (!Sfx.played.includes('lose')) fail('lose sfx');
  console.log(`machine match lost ${st.you}-11 in ${g} frames | ${over.message} | score ${ctx.score} ✓`);

  /* ═══ G — restart → fresh serve ═══ */
  inst.restart();
  st = inst.getState();
  if (st.phase !== 'play' || st.you !== 0 || st.foe !== 0 || st.returns !== 0 || st.score !== 0 || st.serveT <= 0)
    fail('second restart: ' + JSON.stringify(st));
  if (ctx.score !== 0) fail('ctx score not reset again');
  console.log('restart → fresh serve ✓');

  /* ═══ I — resize clamps the court ═══ */
  inst.resize(500, 800);
  frames(5);
  st = inst.getState();
  if (st.W !== 500 || st.H !== 800) fail('resize dims ' + st.W + 'x' + st.H);
  if (st.bx < 8 || st.bx > 492 || st.by < 8 || st.by > 792) fail('ball out of court: ' + st.bx + ',' + st.by);
  if (st.py < st.paddleH / 2 - 0.1 || st.py > 800 - st.paddleH / 2 + 0.1) fail('paddle out: ' + st.py);
  if (st.paddleH !== 108) fail('paddleH ' + st.paddleH + ' != 108');
  console.log('resize clamp (500x800, paddle 108) ✓');

  /* ═══ J — destroy ═══ */
  inst.destroy();
  if (rafCb !== null) fail('raf not cancelled');
  if (container.children.length !== 0) fail('host not cleaned: ' + container.children.length);
  if (container.classList.contains('gpp-host')) fail('host class not removed');
  frames(10);
  console.log('destroy cleanup ✓');

  /* ═══ K — 2nd instance: SPACE starts ═══ */
  inst = gameDef.create(ctx);
  window._fire('keydown', { code: 'Space' });
  if (inst.getState().phase !== 'play') fail('SPACE did not start: ' + inst.getState().phase);
  const m2 = findEl(container, el => (el.className || '').includes('gpp-menu'));
  if (!m2.classList.contains('is-out')) fail('menu not dismissed by SPACE');
  frames(10);
  inst.destroy();
  if (container.children.length !== 0) fail('second instance not cleaned');
  console.log('SPACE start + re-lifecycle ✓ | setScore calls:', scores.length);

  console.log('SMOKE OK');
  process.exit(0);
})();
