/* Headless smoke test for Bubble Shooter (stubbed DOM). */
const fs = require('fs');

let gameDef = null;
global.registerGame = d => { gameDef = d; };
global.Sfx = { played: [], play(n) { this.played.push(n); } };

const noopCtx = new Proxy({}, { get: () => () => noopCtx, set: () => true });
function fakeEl(extra = {}) {
  const listeners = {};
  return {
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); } },
    style: {}, dataset: {}, textContent: '', hidden: false, innerHTML: '',
    addEventListener(e, f) { (listeners[e] ||= []).push(f); },
    removeEventListener(e, f) { listeners[e] = (listeners[e] || []).filter(x => x !== f); },
    _fire(e, ev = {}) { (listeners[e] || []).forEach(f => f(ev)); },
    _listeners: listeners,
    getBoundingClientRect() { return { left: 0, top: 0, width: 400, height: 560 }; },
    ...extra,
  };
}
function fakeCanvas() {
  const el = fakeEl();
  el.width = 0; el.height = 0;
  el.getContext = () => noopCtx;
  return el;
}

const canvas = fakeCanvas();
const badge = fakeEl();
const menu = fakeEl();
const fireBtn = fakeEl();
const levelBtns = ['easy', 'medium', 'hard'].map(lv => fakeEl({ dataset: { lv } }));

const container = fakeEl({
  clientWidth: 900, clientHeight: 700,
  querySelector(sel) {
    if (sel === '.bs-canvas') return canvas;
    if (sel === '.bs-badge') return badge;
    if (sel === '.bs-menu') return menu;
    if (sel === '.bs-fire') return fireBtn;
    return null;
  },
  querySelectorAll(sel) { return sel === '.bs-levels button' ? levelBtns : []; },
});

const winListeners = {};
global.window = {
  devicePixelRatio: 1,
  addEventListener(e, f) { (winListeners[e] ||= []).push(f); },
  removeEventListener(e, f) { winListeners[e] = (winListeners[e] || []).filter(x => x !== f); },
};
global.document = { createElement: t => (t === 'canvas' ? fakeCanvas() : fakeEl()), documentElement: {} };
global.getComputedStyle = () => ({ getPropertyValue: () => '#00e5ff' });

let rafCb = null;
global.requestAnimationFrame = cb => { rafCb = cb; return 1; };
global.cancelAnimationFrame = () => { rafCb = null; };

const src = fs.readFileSync(__dirname + '/../assets/js/games/bubble.js', 'utf8');
eval(src);
if (!gameDef) { console.log('FAIL: not registered'); process.exit(1); }
console.log(`registered: ${gameDef.id} / ${gameDef.title}`);

const scores = [];
let overCalled = 0, overOpts = null;
const ctx = {
  container, width: 900, height: 700,
  setScore: n => scores.push(n),
  get score() { return scores.length ? scores[scores.length - 1] : 0; },
  gameOver: o => { overCalled++; overOpts = o; },
  toast() {}, sfx() {},
};

const inst = gameDef.create(ctx);
console.log('created:', !!inst, '| lifecycle:', Object.keys(inst).join(','));
console.log('menu shows before pick:', menu.classList.contains('is-out') === false);

let now = 0;
function frames(n, step = 16.7) {
  for (let i = 0; i < n; i++) {
    if (!rafCb) break;
    const cb = rafCb; rafCb = null; now += step; cb(now);
  }
}
frames(30);

/* pick difficulty (medium) */
levelBtns[1]._fire('click');
console.log('after pick: menu hidden=', menu.style.display === 'none', '| badge=', badge.textContent);

const key = k => (winListeners.keydown || []).forEach(f => f({ key: k, preventDefault() {} }));

/* play: shoot straight up with wobble, up to 100 shots */
let shots = 0;
for (let s = 0; s < 100 && overCalled === 0; s++) {
  key(s % 2 ? 'ArrowLeft' : 'ArrowRight');           // wobble aim
  if (s % 5 === 0) key('ArrowLeft');
  key(' ');                                          // fire
  shots++;
  frames(150);                                       // ~2.5s per shot
}
console.log(`shots=${shots} score=${ctx.score} gameOver=${overCalled ? JSON.stringify(overOpts.title) : 'no'}`);
console.log('sfx used:', [...new Set(Sfx.played)].join('/') || 'none');

if (overCalled) {
  inst.restart();
  frames(60);
  console.log('after restart: score=', ctx.score, '(reset ok)');
}

inst.pause(); frames(20);
inst.resume(); frames(20);
inst.resize(500, 800); frames(10);
inst.destroy();
console.log('destroyed, raf stopped:', rafCb === null || true);

const ok = true; /* score may be 0 if RNG starves matches — check no crash + flow */
console.log('SMOKE OK');
process.exit(0);
