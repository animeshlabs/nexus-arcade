/* Headless smoke test for Crossy Road (mocked THREE + DOM).
   Math.random=0.5 → row types cycle deterministically:
     rows 0-4 grass · row5 grass+coin(x=0) · row6 road · row7 river ...
   Flow: menu → PLAY → swipe-up starts play → keyboard hops to row6 (road)
         → parked chicken gets FLATTENED → restart → hop into river → SPLASHED
         → restart → pause gate + left/right hops → idle → TOO SLOW (kill line)
         → lifecycle/destroy                                                    */
const fs = require('fs');

let gameDef = null;
global.registerGame = d => { gameDef = d; };
global.Sfx = { played: [], play(n) { this.played.push(n); } };
global.matchMedia = () => ({ matches: false });

/* deterministic world rng */
Math.random = () => 0.5;

/* ── THREE mock: chainable, real vec3 for position/scale/rotation ── */
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

/* ── DOM stubs (children + parentNode tracked) ── */
function fakeEl(extra = {}) {
  const listeners = {};
  return {
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); } },
    style: {}, dataset: {}, textContent: '', className: '', innerHTML: '',
    children: [],
    appendChild(c) { c.parentNode = this; this.children.push(c); },
    removeChild(c) { this.children = this.children.filter(x => x !== c); c.parentNode = null; },
    addEventListener(e, f) { (listeners[e] ||= []).push(f); },
    removeEventListener(e, f) { listeners[e] = (listeners[e] || []).filter(x => x !== f); },
    _fire(e, ev = {}) { (listeners[e] || []).slice().forEach(f => f(ev)); },
    ...extra,
  };
}
/* ── canvas 2d stub for the painted sky texture ── */
function ctx2d() {
  const grad = () => ({ addColorStop() {} });
  return {
    fillStyle: '', globalAlpha: 1,
    createLinearGradient: grad, createRadialGradient: grad,
    fillRect() {}, beginPath() {}, closePath() {}, arc() {}, fill() {}, stroke() {},
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
  };
}
const container = fakeEl({ clientWidth: 900, clientHeight: 700 });
global.document = {
  createElement: tag => (tag === 'canvas'
    ? fakeEl({ width: 0, height: 0, getContext: () => ctx2d() })
    : fakeEl()),
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
const src = fs.readFileSync(__dirname + '/../assets/js/games/crossy.js', 'utf8');
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
function waitFor(pred, max) {
  for (let i = 0; i < max; i++) { if (pred()) return true; frames(1); }
  return pred();
}
function findEl(root, pred) {
  const kids = Array.isArray(root.children) ? root.children : [];
  for (const k of kids) {
    if (typeof k.className === 'string' && pred(k)) return k;
    const hit = findEl(k, pred);
    if (hit) return hit;
  }
  return null;
}
const key = k => global.window._fire('keydown', { key: k, preventDefault() {} });
const swipe = (x1, y1, x2, y2) => {
  container._fire('pointerdown', { clientX: x1, clientY: y1, cancelable: true, preventDefault() {} });
  container._fire('pointerup', { clientX: x2, clientY: y2, cancelable: true, preventDefault() {} });
};
const tap = () => swipe(200, 300, 201, 301);

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
  /* ═══ A — menu → PLAY → swipe starts play ═══ */
  const inst = gameDef.create(ctx);
  const st0 = inst.getState();
  if (st0.phase !== 'menu') fail('phase not menu');
  const menu = findEl(container, el => (el.className || '').includes('cx-menu'));
  const btn = findEl(container, el => el.className === 'cx-play');
  const hint = findEl(container, el => (el.className || '').includes('cx-hint'));
  if (!menu || !btn || !hint) fail('menu/button/hint missing');
  console.log('lanes:', st0.lanes.slice(0, 8).join(','));
  if (st0.lanes[5] !== 'grass' || st0.lanes[6] !== 'road' || st0.lanes[7] !== 'river' || st0.lanes[8] !== 'grass') {
    fail('deterministic lane cycle wrong');
  }
  btn._fire('click', {});
  if (inst.getState().phase !== 'ready') fail('PLAY did not enter ready');
  if (!menu.classList.contains('is-out')) fail('menu not dismissed');
  if (hint.classList.contains('is-out')) fail('hint hidden in ready');
  if (!Sfx.played.includes('start')) fail('start sfx missing');
  frames(20);

  /* swipe up = first hop + start */
  swipe(200, 400, 200, 150);
  if (!waitFor(() => inst.getState().row === 1, 40)) fail('swipe-up hop');
  if (inst.getState().phase !== 'playing') fail('swipe did not start play');
  if (!hint.classList.contains('is-out')) fail('hint still visible in play');
  console.log('swipe start ✓ row=1 score=', ctx.score);

  /* keyboard hops to row 6 (road), coin on row5 */
  for (let k = 2; k <= 6; k++) {
    key('ArrowUp');
    if (!waitFor(() => inst.getState().row === k, 40)) fail('hop to row ' + k);
    if (k === 5) {
      const s5 = inst.getState();
      if (s5.score !== 15 || s5.coins !== 1 || ctx.score !== 15) fail('coin+score at row5: ' + JSON.stringify(s5));
    }
  }
  const st6 = inst.getState();
  console.log('row6 parked ✓ score=', st6.score, '(expect 16)');
  if (st6.score !== 16 || st6.x !== 0) fail('score at row6');

  /* wait for traffic to flatten the chicken */
  if (!waitFor(() => inst.getState().phase === 'over', 900)) fail('car death did not fire');
  console.log('A →', over.title, '|', over.message);
  if (over.title !== 'FLATTENED!' || over.message !== '16 pts · 1 🪙') fail('A gameOver payload');
  if (!Sfx.played.includes('hit') || !Sfx.played.includes('lose')) fail('death sfx');
  if (!Sfx.played.includes('coin') || !Sfx.played.includes('jump')) fail('coin/jump sfx');
  frames(30);

  /* ═══ B — restart → hop into river → drown ═══ */
  over = null;
  inst.restart();
  if (inst.getState().phase !== 'ready' || inst.getState().score !== 0 || ctx.score !== 0) fail('restart reset');
  for (let k = 1; k <= 7; k++) {
    key('ArrowUp');
    if (!waitFor(() => inst.getState().row === k, 40)) fail('B hop row ' + k);
  }
  if (inst.getState().score !== 17 || inst.getState().coins !== 1) fail('B score before drown');
  if (!waitFor(() => inst.getState().phase === 'over', 600)) fail('drown did not fire');
  console.log('B →', over.title, '|', over.message);
  if (over.title !== 'SPLASHED!' || over.message !== '17 pts · 1 🪙') fail('B gameOver payload');

  /* ═══ C — restart → pause gate → side hops → idle → kill line ═══ */
  over = null;
  inst.restart();
  inst.pause();
  key('ArrowUp');
  if (inst.getState().phase !== 'ready') fail('hop leaked through pause');
  frames(30);
  inst.resume();
  frames(5);
  /* d-pad exists; blocked hop (behind start line) must give feedback without moving */
  const padDown = findEl(container, el => typeof el.className === 'string' && el.className.includes('cx-pad__b') && el.className.includes('is-down'));
  const padUp = findEl(container, el => typeof el.className === 'string' && el.className.includes('cx-pad__b') && el.className.includes('is-up'));
  if (!padDown || !padUp) fail('d-pad buttons missing');
  const padEvt = { stopPropagation() {}, cancelable: true, preventDefault() {} };
  padDown._fire('pointerdown', padEvt);
  if (inst.getState().row !== 0 || inst.getState().x !== 0) fail('blocked hop moved chicken');
  if (!Sfx.played.includes('click')) fail('blocked-hop feedback sfx missing');
  padUp._fire('pointerdown', padEvt);
  if (!waitFor(() => inst.getState().row === 1, 40)) fail('d-pad hop');
  console.log('d-pad + blocked feedback ✓');
  swipe(300, 300, 100, 300);                      // swipe left → screen-left = world +X
  if (!waitFor(() => inst.getState().x === 1, 40)) fail('swipe left');
  swipe(100, 300, 300, 300);                      // swipe right back
  if (!waitFor(() => inst.getState().x === 0, 40)) fail('swipe right');
  key('ArrowDown');
  if (!waitFor(() => inst.getState().row === 0, 40)) fail('backward hop');
  console.log('pause gate + lateral hops ✓');
  if (!waitFor(() => inst.getState().phase === 'over', 1800)) fail('kill line did not fire');
  console.log('C →', over.title, '|', over.message);
  if (over.title !== 'TOO SLOW!' || over.message !== '1 pts') fail('C gameOver payload');

  /* ═══ D — lifecycle ═══ */
  inst.resize(500, 800); frames(10);
  inst.pause(); frames(20); inst.resume(); frames(20);
  tap(); frames(20);                             // tap-while-over must be inert
  if (inst.getState().phase !== 'over') fail('tap leaked after over');
  inst.restart();
  frames(30);
  inst.destroy();
  if (rafCb !== null) fail('raf not cancelled');
  if (container.children.length !== 0) fail('host not cleaned: ' + container.children.length);
  if (container.classList.contains('cx-host')) fail('host class not removed');
  console.log('lifecycle ok | setScore calls:', scores.length);

  console.log('SMOKE OK');
  process.exit(0);
})();
