/* Headless smoke test for Simon Says (mocked DOM).
   Math.random=0.5 → deterministic sequence: every step is pad 2.
   Flow: menu (ring + hub static) → PLAY → inter → playback glow →
         input → correct press (round clear) → tap-during-watch guard →
         round 2 cleared (score 130) → pause freeze (inter + watch) →
         wrong pad → GAME OVER "Round 3 · 130 pts" → restart →
         keyboard Digit3 → resize → destroy → 2nd instance SPACE start */
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

const src = fs.readFileSync(__dirname + '/../assets/js/games/simon.js', 'utf8');
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

function waitPhase(target, cap = 900) {
  for (let i = 0; i < cap; i++) {
    const st = inst.getState();
    if (st.phase === target) return st;
    frames(1);
  }
  return fail('never reached phase ' + target + ' (now ' + inst.getState().phase + ')');
}
function waitLit(cap = 900) {
  for (let i = 0; i < cap; i++) {
    if (inst.getState().litPad >= 0) return inst.getState();
    frames(1);
  }
  return fail('no pad ever lit');
}

let inst = null;
(async () => {
  /* ═══ A — menu: ring + hub static ═══ */
  inst = gameDef.create(ctx);
  const menu = findEl(container, el => (el.className || '').includes('gsim-menu'));
  if (!menu) fail('no menu');
  const btn = findEl(container, el => el.className === 'gsim-play');
  if (!btn) fail('no PLAY button');
  const tips = [];
  (function walk(n) {
    for (const k of n.children || []) {
      if ((k.className || '').includes('gsim-tips')) tips.push(...k.children.map(c => c.textContent));
      walk(k);
    }
  })(container);
  if (tips.length !== 3) fail('tips: ' + tips.join(','));
  const pads = [0, 1, 2, 3].map(i =>
    findEl(container, el => (el.className || '').includes('gsim-p' + i) && (el.className || '').includes('gsim-pad')));
  if (pads.some(p => !p)) fail('pads incomplete');
  const hubRound = findEl(container, el => (el.className || '').includes('gsim-round'));
  const hubLabel = findEl(container, el => (el.className || '').includes('gsim-label'));
  if (!hubRound || !hubLabel) fail('hub missing');
  let st = inst.getState();
  if (st.phase !== 'menu' || st.round !== 0 || st.score !== 0) fail('init state ' + JSON.stringify(st));
  if (hubRound.textContent !== '?' || hubLabel.textContent !== 'READY') fail('hub boot: ' + hubRound.textContent + '/' + hubLabel.textContent);
  frames(30);
  if (inst.getState().phase !== 'menu') fail('menu moved');
  console.log('menu + ring (4 pads) + hub static ✓');

  /* ═══ B — PLAY → inter → watch ═══ */
  btn._fire('click', {});
  st = inst.getState();
  if (st.phase !== 'inter' || st.round !== 1) fail('PLAY: ' + st.phase + ' r' + st.round);
  if (!menu.classList.contains('is-out')) fail('menu not dismissed');
  if (!Sfx.played.includes('start')) fail('start sfx');
  if (hubLabel.textContent !== 'ROUND 1') fail('hub label: ' + hubLabel.textContent);
  st = waitPhase('watch');
  if (st.round !== 1 || st.seq.length !== 1) fail('seq round1');
  console.log('PLAY → ROUND 1 → watch ✓');

  /* ═══ C — playback glow + tone ═══ */
  st = waitLit();
  if (st.litPad !== st.seq[0]) fail('lit ' + st.litPad + ' != seq ' + st.seq[0]);
  if (hubLabel.textContent !== 'WATCH') fail('hub: ' + hubLabel.textContent);
  if (!Sfx.played.includes('click')) fail('pad tone missing (seq[0]=2 → click)');
  st = waitPhase('input');
  if (st.inputIdx !== 0 || st.score !== 0) fail('input armed: ' + JSON.stringify(st));
  if (hubLabel.textContent !== 'YOUR TURN') fail('hub: ' + hubLabel.textContent);
  console.log('playback glow + tone → input armed ✓');

  /* ═══ D — correct press, guard during watch, round 2 ═══ */
  pads[st.seq[0]]._fire('click', {});
  st = inst.getState();
  if (st.phase !== 'inter' || st.round !== 2 || st.score !== 60)
    fail('round1 clear: ' + JSON.stringify({ p: st.phase, r: st.round, s: st.score }));
  if (ctx.score !== 60) fail('ctx score ' + ctx.score);
  if (!Sfx.played.includes('power')) fail('power sfx (round clear)');
  st = waitPhase('watch');
  /* tap during playback must be ignored */
  pads[(st.seq[0] + 1) % 4]._fire('click', {});
  frames(3);
  st = inst.getState();
  if (st.phase !== 'watch' || st.score !== 60) fail('watch tap not ignored: ' + st.phase + ' s' + st.score);
  st = waitPhase('input');
  pads[st.seq[0]]._fire('click', {});
  st = inst.getState();
  if (st.phase !== 'input' || st.inputIdx !== 1 || st.score !== 70)
    fail('partial press: ' + JSON.stringify({ p: st.phase, i: st.inputIdx, s: st.score }));
  pads[st.seq[1]]._fire('click', {});
  st = inst.getState();
  if (st.phase !== 'inter' || st.round !== 3 || st.score !== 130)
    fail('round2 clear: ' + JSON.stringify({ p: st.phase, r: st.round, s: st.score }));
  console.log('correct presses + watch-guard + round 2 (score 130) ✓');

  /* ═══ E — pause freeze in inter ═══ */
  inst.pause();
  const e1 = inst.getState();
  frames(40);
  const e2 = inst.getState();
  if (e2.tState !== e1.tState || e2.phase !== e1.phase) fail('inter not frozen');
  inst.resume();
  frames(10);
  const e3 = inst.getState();
  if (!(e3.tState > e2.tState || e3.phase !== e2.phase)) fail('inter did not resume');
  console.log('pause freeze (inter) ✓');

  /* ═══ I — pause freeze in watch ═══ */
  st = waitPhase('watch');
  inst.pause();
  const i1 = inst.getState();
  frames(40);
  const i2 = inst.getState();
  if (i2.pbT !== i1.pbT || i2.pbIdx !== i1.pbIdx || i2.phase !== i1.phase) fail('watch not frozen');
  inst.resume();
  frames(12);
  const i3 = inst.getState();
  const advanced = i3.phase !== i2.phase || i3.pbIdx > i2.pbIdx || i3.pbT > i2.pbT;
  if (!advanced) fail('watch did not resume: ' + JSON.stringify(i3));
  console.log('pause freeze (watch) ✓');

  /* ═══ F — wrong pad → GAME OVER ═══ */
  st = waitPhase('input');
  over = null;
  pads[(st.seq[0] + 1) % 4]._fire('click', {});
  st = inst.getState();
  if (st.phase !== 'over' || st.badPad !== (st.seq[0] + 1) % 4)
    fail('over: ' + JSON.stringify({ p: st.phase, b: st.badPad }));
  if (!over || over.title !== 'GAME OVER') fail('gameOver title: ' + (over && over.title));
  if (over.message !== 'Round 3 · 130 pts') fail('message: ' + over.message);
  if (!Sfx.played.includes('hit') || !Sfx.played.includes('lose')) fail('death sfx');
  const bad = pads.find(p => p.classList.contains('is-bad'));
  if (!bad) fail('is-bad pad missing');
  frames(30);
  if (inst.getState().phase !== 'over') fail('phase changed after over');
  console.log('wrong pad → GAME OVER (Round 3 · 130 pts) ✓');

  /* ═══ G — restart ═══ */
  inst.restart();
  st = inst.getState();
  if (st.phase !== 'inter' || st.round !== 1 || st.score !== 0 || st.badPad !== -1)
    fail('restart: ' + JSON.stringify(st));
  if (ctx.score !== 0) fail('ctx score not reset');
  if (pads.some(p => p.classList.contains('is-bad'))) fail('is-bad persists');
  if (!Sfx.played.includes('start')) fail('restart sfx');
  console.log('restart ✓');

  /* ═══ H — keyboard Digit3 (pad 2) ═══ */
  st = waitPhase('input');
  window._fire('keydown', { code: 'Digit3' });
  st = inst.getState();
  if (st.phase !== 'inter' || st.round !== 2 || st.score !== 60)
    fail('keyboard press: ' + JSON.stringify({ p: st.phase, r: st.round, s: st.score }));
  console.log('keyboard 1·2·3·4 ✓');

  /* ═══ J — resize ═══ */
  inst.resize(500, 800);
  frames(10);
  st = inst.getState();
  if (st.W !== 500 || st.H !== 800) fail('resize dims ' + st.W + 'x' + st.H);
  if (!['inter', 'watch', 'input'].includes(st.phase)) fail('phase after resize ' + st.phase);
  console.log('resize ✓');

  /* ═══ K — destroy ═══ */
  inst.destroy();
  if (rafCb !== null) fail('raf not cancelled');
  if (container.children.length !== 0) fail('host not cleaned: ' + container.children.length);
  if (container.classList.contains('gsim-host')) fail('host class not removed');
  frames(10);
  console.log('destroy cleanup ✓');

  /* ═══ L — 2nd instance: SPACE starts ═══ */
  inst = gameDef.create(ctx);
  window._fire('keydown', { code: 'Space' });
  if (inst.getState().phase !== 'inter') fail('SPACE did not start: ' + inst.getState().phase);
  const m2 = findEl(container, el => (el.className || '').includes('gsim-menu'));
  if (!m2.classList.contains('is-out')) fail('menu not dismissed by SPACE');
  frames(10);
  inst.destroy();
  if (container.children.length !== 0) fail('second instance not cleaned');
  console.log('SPACE start + re-lifecycle ✓ | setScore calls:', scores.length);

  console.log('SMOKE OK');
  process.exit(0);
})();
