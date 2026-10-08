/* Headless smoke test for ARCHERY (canvas 2D).
   The game exposes bow / target / physics in getState(), so this test
   solves the real ballistic equation (low-angle branch) and feeds the
   pointer the exact screen point a player would drag to — the arrow
   then punches the ring it was aimed at.

   Math.random = 0.5  → target height 41% · wind exactly 0 (CALM)
   Math.random = 0.95 → one stage with a real tailwind (for the wind HUD)

   A — boot: HUD (quiver 10 · wind · hits · bull), geometry, physics, default aim
   B — drag aim: direction + power from the pull, angle clamped, cancel ≠ fire
   C — centre shot: analytic hit → value 10, score/hits/bull, quiver 9
   D — outer band: aim at 0.75·r → value 3 (ring maths is a real 10-ring face)
   E — a short throw lands in the grass → MISS, then the stage re-places with wind
   F — wind shot: HUD reads the gust, the arrow drifts off-centre
   G — shots 4…9 → game over payload, score == Σ values, input locked
   H — restart resets, keyboard aim/fire, pause gate (pointer + keys + physics)
   I — resize re-lays the range out, a shot still flies true
   J — destroy: raf + listeners + DOM all cleaned                        */
const fs = require('fs');

let gameDef = null;
global.registerGame = d => { gameDef = d; };
global.Sfx = { play() {} };

Math.random = () => 0.5;

/* ── fake canvas 2d context (no-op recording surface) ── */
function ctx2d() {
  const noop = () => {};
  const grad = { addColorStop: noop };
  return {
    canvas: null,
    fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1,
    shadowBlur: 0, shadowColor: '', font: '', textAlign: 'left',
    textBaseline: 'alphabetic', lineCap: 'butt', lineJoin: 'miter',
    lineDashOffset: 0, globalCompositeOperation: 'source-over',
    save: noop, restore: noop, translate: noop, rotate: noop, scale: noop,
    setTransform: noop, transform: noop, resetTransform: noop,
    clearRect: noop, fillRect: noop, strokeRect: noop,
    beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop,
    quadraticCurveTo: noop, bezierCurveTo: noop, arc: noop, arcTo: noop,
    ellipse: noop, rect: noop, fill: noop, stroke: noop, clip: noop,
    setLineDash: noop, getLineDash: () => [],
    fillText: noop, strokeText: noop, measureText: () => ({ width: 10 }),
    drawImage: noop,
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    createPattern: () => null,
  };
}
const flat2d = ctx2d();

function fakeEl(extra = {}) {
  const listeners = {};
  const el = {
    _cls: '', style: {}, textContent: '', innerHTML: '', children: [],
    parentNode: null, dataset: {}, type: '', disabled: false,
    clientWidth: undefined, clientHeight: undefined,
    get className() { return this._cls; },
    set className(v) { this._cls = v; },
    get firstChild() { return this.children[0] || null; },
    get classList() {
      const self = this;
      const parts = () => self._cls.split(/\s+/).filter(Boolean);
      return {
        add(c) { const s = parts(); if (s.indexOf(c) === -1) s.push(c); self._cls = s.join(' '); },
        remove(c) { self._cls = parts().filter(x => x !== c).join(' '); },
        contains(c) { return parts().indexOf(c) !== -1; },
        toggle(c, force) {
          const has = parts().indexOf(c) !== -1;
          const want = force === undefined ? !has : !!force;
          if (want) this.add(c); else this.remove(c);
          return want;
        },
      };
    },
    appendChild(c) { c.parentNode = this; this.children.push(c); },
    removeChild(c) { this.children = this.children.filter(x => x !== c); c.parentNode = null; },
    addEventListener(e, f) { (listeners[e] || (listeners[e] = [])).push(f); },
    removeEventListener(e, f) { listeners[e] = (listeners[e] || []).filter(x => x !== f); },
    _fire(e, ev = {}) { (listeners[e] || []).slice().forEach(f => f(ev)); },
    _count(e) { return (listeners[e] || []).length; },
    getContext: () => flat2d,
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }),
    focus: () => {},
  };
  return Object.assign(el, extra);
}

const container = fakeEl({ clientWidth: 900, clientHeight: 700 });
global.document = { createElement: () => fakeEl(), documentElement: {} };

const win = {};
global.window = {
  devicePixelRatio: 1,
  addEventListener(e, f) { (win[e] || (win[e] = [])).push(f); },
  removeEventListener(e, f) { win[e] = (win[e] || []).filter(x => x !== f); },
};
const key = k => (win.keydown || []).slice().forEach(f => f({ key: k, preventDefault() {} }));

let rafCb = null;
global.requestAnimationFrame = cb => { rafCb = cb; return 1; };
global.cancelAnimationFrame = () => { rafCb = null; };

/* ── load ── */
const src = fs.readFileSync(__dirname + '/../assets/js/games/archery.js', 'utf8');
eval(src);
if (!gameDef) { console.log('FAIL: not registered'); process.exit(1); }
console.log(`registered: ${gameDef.id} / ${gameDef.title} / genre=${gameDef.genre}`);
if (gameDef.id !== 'archery') { console.log('FAIL: id'); process.exit(1); }
if (gameDef.genre !== 'Arcade') { console.log('FAIL: genre ' + gameDef.genre); process.exit(1); }
if (!Array.isArray(gameDef.controls) || gameDef.controls.length !== 3) { console.log('FAIL: controls'); process.exit(1); }

/* ── helpers ── */
const fail = m => { console.log('FAIL: ' + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); };
function eq(got, want, label) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { console.log('FAIL ' + label); console.log('  got : ' + g); console.log('  want: ' + w); process.exit(1); }
}
const near = (got, want, tol, label) => {
  if (!(Math.abs(got - want) <= tol)) { console.log('FAIL ' + label + ' → got ' + got + ' want ±' + tol + ' of ' + want); process.exit(1); }
};

let now = 0;
const step = (ms = 17) => {
  if (!rafCb) return false;
  const cb = rafCb; rafCb = null; now += ms; cb(now);
  return true;
};
const advance = ms => { const n = Math.ceil(ms / 17) + 3; for (let i = 0; i < n; i++) if (!step()) break; };
function advanceUntil(pred, max = 900) {
  for (let i = 0; i < max; i++) {
    if (pred()) return true;
    if (!step()) break;
  }
  return pred();
}
const phase = () => inst.getState().phase;

/* pointer helpers (stage rect is 0,0 → client == local) */
const ev = (x, y) => ({ clientX: x, clientY: y, cancelable: true, pointerId: 1, preventDefault() {} });
const pd = (x, y) => stageEl._fire('pointerdown', ev(x, y));
const pm = (x, y) => (win.pointermove || []).slice().forEach(f => f(ev(x, y)));
const pu = () => (win.pointerup || []).slice().forEach(f => f({ cancelable: true, preventDefault() {} }));
const pc = () => (win.pointercancel || []).slice().forEach(f => f({}));

/** solve the low-angle launch that passes through (tx, ty) */
function solve(st, tx, ty) {
  const dx = tx - st.bow.x;
  const hUp = st.bow.y - ty;
  const g = st.physics.g;
  const { vmin, vmax, maxDrag } = st.physics;
  let theta = null, v = 0;
  for (let f = 0.4; f <= 1.0001; f += 0.005) {
    const vv = vmin + f * (vmax - vmin);
    const u = vv * vv;
    const term = u * u - g * (g * dx * dx + 2 * hUp * u);
    if (term >= 0) { theta = Math.atan((u - Math.sqrt(term)) / (g * dx)); v = vv; break; }
  }
  if (theta === null) fail('no ballistic solution for ' + tx + ',' + ty);
  const deg = theta * 180 / Math.PI;
  if (deg < 3.1 || deg > 84.9) fail('solved angle ' + deg.toFixed(1) + '° outside the aim clamp');
  const p = (v - vmin) / (vmax - vmin);
  const d = p * maxDrag;
  return { x: st.bow.x + Math.cos(theta) * d, y: st.bow.y - Math.sin(theta) * d, deg, p };
}

/* ── ctx mock ── */
const scores = [], sfxLog = [], toasts = [];
let over = null;
const ctx = {
  container, width: 900, height: 700,
  setScore: n => { scores.push(n); return n; },
  get score() { return scores.length ? scores[scores.length - 1] : 0; },
  gameOver: o => { over = o; },
  toast: (m, k) => toasts.push({ m, k }),
  sfx: n => sfxLog.push(n),
};

let inst, hudEl, stageEl, hintEl, dotsEl, windRow, windBar, windVal, hitsVal, bullVal, hintMsg, hintKeys;
const acc = { score: 0, hits: 0, bulls: 0 };

/** press → drag → release → land → next aim. Returns { rec, mid }. */
function shoot(pt) {
  pd(pt.x, pt.y);
  if (phase() !== 'aim') fail('pointerdown did not aim');
  pu();
  if (phase() !== 'fly') fail('release did not fire (phase ' + phase() + ')');
  const shotNo = inst.getState().shot;
  if (!advanceUntil(() => phase() !== 'fly')) fail('arrow never landed');
  if (phase() !== 'settle') fail('expected settle, got ' + phase());
  const mid = inst.getState();             // captured on the landing frame
  if (mid.shot !== shotNo) fail('shot counter moved on landing');
  acc.score += mid.lastShot.value;
  if (mid.lastShot.onTarget) acc.hits++;
  if (mid.lastShot.value === 10) acc.bulls++;
  advanceUntil(() => phase() === 'aim' || phase() === 'over');
  return { rec: mid.lastShot, mid };
}
const countIsOn = () => dotsEl.children.filter(d => d.classList.contains('is-on')).length;

(async () => {
  /* ═══ A — boot ═══ */
  inst = gameDef.create(ctx);
  ok(container.classList.contains('grch-host'), 'host class missing');
  eq(container.children.length, 3, 'host children (hud/stage/hint)');
  hudEl = container.children[0];
  stageEl = container.children[1];
  hintEl = container.children[2];
  eq(hudEl.children.length, 4, 'HUD cells');
  dotsEl = hudEl.children[0].children[1];
  windRow = hudEl.children[1].children[1];
  windBar = windRow.children[0].children[0];
  windVal = windRow.children[1];
  hitsVal = hudEl.children[2].children[1];
  bullVal = hudEl.children[3].children[1];
  hintMsg = hintEl.children[0];
  hintKeys = hintEl.children[1];
  eq(dotsEl.children.length, 10, 'quiver dots');
  eq(countIsOn(), 10, 'quiver full at boot');
  eq(stageEl.children.length, 1, 'canvas mounted');
  eq(hitsVal.textContent, '0/10', 'hits read-out');
  eq(bullVal.textContent, '0', 'bull read-out');
  eq(windVal.textContent, 'CALM', 'wind at boot');
  ok(/DRAG TO AIM/.test(hintMsg.textContent), 'aim hint missing');
  ok(/SPACE/.test(hintKeys.textContent), 'keyboard hint missing');

  let st = inst.getState();
  eq(st.phase, 'aim', 'phase at boot');
  eq(st.shot, 0, 'shot at boot');
  eq(st.shotsLeft, 10, 'shots left');
  eq(st.score, 0, 'score at boot');
  eq(st.hits, 0, 'hits at boot');
  eq(st.bulls, 0, 'bulls at boot');
  eq(st.stage, 0, 'stage at boot');
  eq(st.wind, 0, 'wind at boot');
  eq(st.lastShot, null, 'no shot yet');
  eq(st.hint, hintMsg.textContent, 'hint mirror');
  near(st.aim.angleDeg, -46, 0.01, 'default angle');
  near(st.aim.power, 0.7, 0.001, 'default power');
  /* geometry: 900×700 stage → k = 1 */
  near(st.physics.g, 980, 0.01, 'gravity k=1');
  near(st.physics.vmin, 430, 0.01, 'speed floor');
  near(st.physics.vmax, 1250, 0.01, 'speed ceiling');
  near(st.physics.maxDrag, 300, 0.01, 'max drag');
  near(st.bow.x, 117, 0.5, 'bow x');
  near(st.bow.y, 597, 0.5, 'bow y');
  near(st.target.x, 504, 0.5, 'target x');
  near(st.target.y, 287, 0.5, 'target y');
  near(st.target.r, 52, 0.5, 'target r');
  eq(ctx.score, 0, 'shell score at boot');
  console.log('A → HUD + range geometry + physics + default aim ✓');

  /* ═══ B — drag aim: direction/power, clamping, cancel ≠ fire ═══ */
  pd(st.bow.x + 200, st.bow.y - 100);
  st = inst.getState();
  near(st.aim.angleDeg, -26.565, 0.02, 'drag angle');
  near(st.aim.power, Math.hypot(200, 100) / 300, 0.001, 'drag power');
  pm(st.bow.x - 60, st.bow.y - 40);                    // behind the bow
  near(inst.getState().aim.angleDeg, -85, 0.01, 'angle clamp (steep)');
  near(inst.getState().aim.power, Math.hypot(60, 40) / 300, 0.001, 'power from drag distance');
  pm(st.bow.x + 10, st.bow.y + 60);                    // pointing down
  near(inst.getState().aim.angleDeg, -3, 0.01, 'angle clamp (flat)');
  pc();                                                // cancelled → no shot
  st = inst.getState();
  eq(st.phase, 'aim', 'cancel must not fire');
  eq(st.shot, 0, 'cancel burned no arrow');
  console.log('B → drag aim maths + clamps + cancel ✓');

  /* ═══ C — centre shot (wind 0) ═══ */
  const centre = solve(inst.getState(), inst.getState().target.x, inst.getState().target.y);
  pd(centre.x, centre.y);
  st = inst.getState();
  near(st.aim.angleDeg, -centre.deg, 0.02, 'aim took the solved angle');
  near(st.aim.power, centre.p, 0.001, 'aim took the solved power');
  pu();
  st = inst.getState();
  eq(st.phase, 'fly', 'arrow in flight');
  eq(st.shot, 1, 'arrow spent');
  eq(st.shotsLeft, 9, 'shots left after release');
  eq(hintMsg.textContent, '', 'hint cleared in flight');
  eq(countIsOn(), 9, 'quiver dimmed on release');
  pd(st.bow.x + 100, st.bow.y - 100);                  // must be ignored mid-flight
  eq(inst.getState().shot, 1, 'input leaked during flight');
  if (!advanceUntil(() => phase() !== 'fly')) fail('arrow 1 never landed');
  eq(phase(), 'settle', 'landed → settle');
  st = inst.getState();
  eq(st.lastShot.onTarget, true, 'centre shot missed');
  eq(st.lastShot.value, 10, 'centre shot must be gold');
  ok(st.lastShot.dist < 1, 'centre shot off by ' + st.lastShot.dist + 'px');
  eq(st.score, 10, 'score after gold');
  eq(st.hits, 1, 'hits after gold');
  eq(st.bulls, 1, 'bulls after gold');
  eq(st.boardArrows, 1, 'arrow stuck in the board');
  eq(hitsVal.textContent, '1/10', 'hits HUD');
  eq(bullVal.textContent, '1', 'bull HUD');
  ok(sfxLog.indexOf('coin') !== -1, 'bullseye sfx');
  acc.score += st.lastShot.value;          // fold this hand-aimed shot in
  acc.hits += 1;
  acc.bulls += 1;
  advanceUntil(() => phase() === 'aim');
  st = inst.getState();
  eq(st.shot, 1, 'advanced to shot 1');
  eq(st.stage, 0, 'still stage 0');
  near(st.target.x, 504, 0.5, 'board did not move mid-stage');
  eq(st.boardArrows, 1, 'previous arrow stays in the board');
  ok(/DRAG TO AIM/.test(hintMsg.textContent), 'aim hint back after landing');
  console.log('C → analytic centre shot → +10 gold, quiver 9 ✓');

  /* ═══ D — outer band: 0.75·r down the face ═══ */
  const outer = solve(inst.getState(), inst.getState().target.x,
                      inst.getState().target.y + inst.getState().target.r * 0.75);
  const { rec: recOuter, mid: midOuter } = shoot(outer);
  eq(recOuter.onTarget, true, 'outer shot not on the face');
  eq(recOuter.value, 3, '0.75·r must score the black band (3)');
  near(recOuter.dist, inst.getState().target.r * 0.75, 0.05, 'impact distance');
  eq(midOuter.score, 13, 'score after two hits');
  eq(midOuter.hits, 2, 'hits after two hits');
  eq(midOuter.bulls, 1, 'bulls unchanged');
  eq(countIsOn(), 8, 'quiver after 2');
  console.log('D → ring maths: 0.75·r → +3 (score 13) ✓');

  /* ═══ E — short throw = MISS, then a new stage with wind ═══ */
  Math.random = () => 0.95;                            // next placement gets a tailwind
  const weak = { x: inst.getState().bow.x + 30, y: inst.getState().bow.y - 30 };
  const { rec: recWeak, mid: midWeak } = shoot(weak);
  eq(recWeak.onTarget, false, 'a toothless throw should never reach the face');
  eq(recWeak.value, 0, 'miss must score 0');
  eq(midWeak.score, 13, 'miss does not score');
  eq(midWeak.hits, 2, 'miss does not count as a hit');
  eq(midWeak.floats, 1, 'MISS floater on the landing frame');
  st = inst.getState();
  eq(st.groundArrows, 1, 'arrow stuck in the grass');
  eq(phase(), 'aim', 'back to the line');
  eq(st.shot, 3, 'three arrows gone');
  eq(st.stage, 1, 'stage 1 after three shots');
  ok(st.target.r < 52, 'board shrank: ' + st.target.r);
  ok(st.target.x > 504, 'board moved back: ' + st.target.x);
  ok(st.wind > 0, 'expected a tailwind, got ' + st.wind);
  ok(/^→ \d+$/.test(windVal.textContent), 'wind read-out: ' + windVal.textContent);
  eq(hudEl.children[1].classList.contains('is-right'), true, 'right-wind class');
  eq(countIsOn(), 7, 'quiver after 3');
  eq(hitsVal.textContent, '2/10', 'hits HUD after 3');
  Math.random = () => 0.5;                             // calm again for every later gust
  console.log(`E → MISS on the grass · stage 1 · ${windVal.textContent} wind ✓`);

  /* ═══ F — flight in a real wind drifts off the aim line ═══ */
  const windShot = solve(inst.getState(), inst.getState().target.x, inst.getState().target.y);
  const { rec: recWind, mid: midWind } = shoot(windShot);
  ok(recWind.onTarget, 'still on the face in a ' + Math.round(inst.getState().wind) + ' gust');
  ok(recWind.dist > 0.5, 'wind must bend the arrow (drifted ' + recWind.dist.toFixed(2) + 'px)');
  ok(recWind.value >= 6, 'gusty but catchable: +' + recWind.value);
  eq(midWind.hits, acc.hits, 'hits tally');
  console.log(`F → wind bent the shot ${recWind.dist.toFixed(1)}px off centre ✓`);

  /* ═══ G — the last six arrows → OUT OF ARROWS ═══ */
  over = null;
  while (phase() === 'aim' && inst.getState().shot < 10) {
    const s = inst.getState();
    shoot(solve(s, s.target.x, s.target.y));
  }
  eq(phase(), 'over', 'run finished');
  ok(over, 'shell gameOver never fired');
  eq(over.title, 'OUT OF ARROWS', 'gameOver title: ' + over.title);
  eq(inst.getState().score, acc.score, 'score == Σ ring values');
  eq(inst.getState().hits, acc.hits, 'hits == Σ hits');
  eq(inst.getState().bulls, acc.bulls, 'bulls == Σ golds');
  eq(over.message,
     `${acc.hits}/10 hits · ${acc.bulls} bullseye${acc.bulls === 1 ? '' : 's'}`,
     'gameOver message: ' + over.message);
  eq(acc.hits, 9, 'nine hits over ten arrows');
  ok(acc.bulls >= 7, 'the calm shots are gold: ' + acc.bulls + ' bullseyes');
  ok(acc.score >= 70 && acc.score <= 92, 'total lands in range: ' + acc.score);
  eq(countIsOn(), 0, 'quiver empty');
  eq(hintMsg.textContent, 'OUT OF ARROWS', 'end hint');
  ok(sfxLog.indexOf('lose') !== -1, 'out-of-arrows sting');
  const before = inst.getState().shot;
  pd(inst.getState().bow.x + 200, inst.getState().bow.y - 200);
  pu(); key(' ');
  eq(inst.getState().shot, before, 'input leaked after game over');
  eq(phase(), 'over', 'phase stuck after game over');
  console.log(`G → ${over.title} | ${over.message} (score ${acc.score}) ✓`);

  /* ═══ H — restart + keyboard + pause ═══ */
  over = null;
  inst.restart();
  st = inst.getState();
  eq(st.phase, 'aim', 'restart phase');
  eq(st.shot, 0, 'restart shot');
  eq(st.score, 0, 'restart score');
  eq(st.hits, 0, 'restart hits');
  eq(st.bulls, 0, 'restart bulls');
  eq(st.lastShot, null, 'restart lastShot');
  eq(st.boardArrows, 0, 'restart board arrows');
  eq(st.groundArrows, 0, 'restart grass arrows');
  eq(st.wind, 0, 'restart wind');
  eq(countIsOn(), 10, 'restart quiver');
  eq(ctx.score, 0, 'restart shell score');
  eq(over, null, 'restart must not fire gameOver');

  const a0 = st.aim.angleDeg, p0 = st.aim.power;
  key('ArrowUp'); key('ArrowRight');
  st = inst.getState();
  near(st.aim.angleDeg, a0 - 1.5, 0.01, 'ArrowUp steepens');
  near(st.aim.power, p0 + 0.05, 0.001, 'ArrowRight pulls');
  for (let i = 0; i < 40; i++) key('ArrowDown');
  near(inst.getState().aim.angleDeg, -3, 0.01, 'ArrowDown clamped flat');
  key(' ');

  inst.pause();
  const p1 = phase();
  pd(st.bow.x + 200, st.bow.y - 200); pu();            // ignored
  key('ArrowUp');                                       // ignored
  advance(400); advance(400);
  st = inst.getState();
  eq(st.phase, p1, 'physics frozen while paused');
  eq(st.shot, 1, 'pointer blocked while paused');
  near(st.aim.angleDeg, -3, 0.01, 'keys blocked while paused');
  inst.resume();
  advanceUntil(() => phase() === 'aim' || phase() === 'over');
  eq(inst.getState().phase, 'aim', 'resumed');
  console.log('H → restart clean · keyboard aim/fire · pause gate ✓');

  /* ═══ I — resize re-lays the range out, shot still true ═══ */
  inst.resize(600, 500);
  st = inst.getState();
  near(st.bow.x, 78, 0.5, 'bow x after resize');
  near(st.physics.g, 980 * (500 / 700), 0.5, 'gravity scales with the stage');
  near(st.target.x, 336, 0.5, 'target x after resize');
  near(st.target.r, 37.5, 0.5, 'target r after resize');
  ok(st.target.y + st.target.r < 500 && st.target.y > 0, 'target inside the stage');
  const { rec: rec2 } = shoot(solve(st, st.target.x, st.target.y));
  eq(rec2.onTarget, true, 'shot at 600×500');
  eq(rec2.value, 10, 'still gold after resize');
  console.log('I → resize re-geometry + true flight ✓');

  /* ═══ J — destroy ═══ */
  inst.destroy();
  if (rafCb !== null) fail('raf not cancelled');
  if ((win.pointermove || []).length) fail('pointermove leaked');
  if ((win.pointerup || []).length) fail('pointerup leaked');
  if ((win.pointercancel || []).length) fail('pointercancel leaked');
  if ((win.keydown || []).length) fail('keydown leaked');
  if (stageEl._count('pointerdown')) fail('stage pointerdown leaked');
  if (container.children.length !== 0) fail('host not cleaned: ' + container.children.length);
  if (container.classList.contains('grch-host')) fail('host class not removed');
  console.log(`J → lifecycle ok | setScore ${scores.length} · sfx ${sfxLog.length}`);

  console.log('SMOKE OK');
  process.exit(0);
})();
