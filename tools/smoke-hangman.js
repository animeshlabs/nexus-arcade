/* Headless smoke test for HANGMAN (DOM word/keypad + canvas gallows).

   Math.random = 0.5 → deterministic shuffle / tier draws / free-letter pick.

   A — boot: registration, menu DOM, state, canvas fit
   B — difficulty pick: EASY starts level 1 (ANIMALS, easy tier, 1 free letter)
   C — keypad + physical keyboard guesses: reveal, scoring, hit keys
   D — wrong guess: life lost, pip off, miss key, shake, message
   E — pause gate: input + frame clock frozen (state byte-identical)
   F — word solved: clear bonus maths, best-level persistence, pause-frozen
       clear timer, ENTER skips the splash
   G — levels 2…3 clear on the timer → level 4 escalates to the normal tier
   H — six misses: reveal the word, gameOver payload, input locked
   I — restart: fresh run, keys/pips reset, difficulty remembered
   J — resize re-fits the canvas, destroy tears everything down
*/
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

/* ── Store mock (best-level persistence) ── */
const storeLog = [];
global.Store = {
  settings: { hangman: { easy: 0, normal: 0, hard: 0 } },
  set(k, v) { this.settings[k] = v; storeLog.push({ k, v }); },
};

/* ── load ── */
const src = fs.readFileSync(__dirname + '/../assets/js/games/hangman.js', 'utf8');
eval(src);
if (!gameDef) { console.log('FAIL: not registered'); process.exit(1); }
console.log(`registered: ${gameDef.id} / ${gameDef.title} / genre=${gameDef.genre}`);
if (gameDef.id !== 'hangman') { console.log('FAIL: id'); process.exit(1); }
if (gameDef.genre !== 'Word') { console.log('FAIL: genre ' + gameDef.genre); process.exit(1); }
if (gameDef.featured !== true) { console.log('FAIL: not featured'); process.exit(1); }
if (!Array.isArray(gameDef.controls) || gameDef.controls.length !== 3) { console.log('FAIL: controls'); process.exit(1); }

/* ── helpers ── */
const fail = m => { console.log('FAIL: ' + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); };
function eq(got, want, label) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { console.log('FAIL ' + label); console.log('  got : ' + g); console.log('  want: ' + w); process.exit(1); }
}

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

/* ── ctx mock ── */
const scores = [], sfxLog = [], toasts = [];
let over = null, pausedFlag = false;
const ctx = {
  container, width: 900, height: 700,
  setScore: n => { scores.push(n); return n; },
  get score() { return scores.length ? scores[scores.length - 1] : 0; },
  get paused() { return pausedFlag; },
  gameOver: o => { over = o; },
  toast: (m, k) => toasts.push({ m, k }),
  sfx: n => sfxLog.push(n),
};

/* ── DOM refs (no querySelector in the fake DOM → walk children) ── */
const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
let inst, hudEl, mainEl, artEl, cvEl, flashEl, flashT, flashS, sideEl, wordEl, msgEl, keysEl,
    menuEl, menuIn, diffsEl, levelB, catB, bestB, pipsEl, pips = [];

const keyBtn = ch => keysEl.children[A.indexOf(ch)];
const letterEl = i => wordEl.children[i];
const click = e => e._fire('click');
const distinct = w => w.split('').filter((c, i, a) => a.indexOf(c) === i);
const TMULT = { easy: 1, normal: 2, hard: 3 };
const sfxCount = n => sfxLog.filter(x => x === n).length;

/** click every remaining distinct letter until the level clears */
function solveWord() {
  const r = { clicks: 0, lastBefore: 0, lastInstances: 0, livesAtClear: 0, mult: 0 };
  for (let guard = 0; guard < 40; guard++) {
    const s = inst.getState();
    if (s.phase !== 'play') break;
    const remain = distinct(s.word).filter(c => s.guessed.indexOf(c) === -1);
    if (!remain.length) break;
    const target = remain[0];
    if (remain.length === 1) {
      r.lastBefore = s.score;
      r.lastInstances = s.word.split('').filter(c => c === target).length;
      r.livesAtClear = s.lives;
      r.mult = TMULT[s.tier];
    }
    click(keyBtn(target));
    r.clicks++;
  }
  return r;
}

(async () => {
  /* ═══ A — boot ═══ */
  inst = gameDef.create(ctx);
  ok(container.classList.contains('grhm-host'), 'host class missing');
  eq(container.children.length, 3, 'host children (hud/main/menu)');

  hudEl = container.children[0];
  mainEl = container.children[1];
  menuEl = container.children[2];
  eq(hudEl.children.length, 4, 'HUD cells');
  levelB = hudEl.children[0].children[1];
  catB = hudEl.children[1].children[1];
  bestB = hudEl.children[2].children[1];
  pipsEl = hudEl.children[3].children[1];
  pips = pipsEl.children;
  eq(pips.length, 6, 'six life pips');
  eq(pips.filter(p => p.classList.contains('is-off')).length, 0, 'pips full at boot');

  artEl = mainEl.children[0];
  sideEl = mainEl.children[1];
  eq(artEl.children.length, 2, 'art holds canvas + flash');
  cvEl = artEl.children[0];
  flashEl = artEl.children[1];
  ok(cvEl.classList.contains('grhm-canvas'), 'canvas class');
  eq(flashEl.style.display, 'none', 'flash hidden at boot');
  eq(flashEl.children.length, 2, 'flash lines');
  flashT = flashEl.children[0];
  flashS = flashEl.children[1];
  wordEl = sideEl.children[0];
  msgEl = sideEl.children[1];
  keysEl = sideEl.children[2];
  eq(keysEl.children.length, 26, 'keypad keys');
  eq(wordEl.children.length, 0, 'no word yet');

  eq(menuEl.style.display, '', 'menu visible at boot');
  menuIn = menuEl.children[0];
  eq(menuIn.children.length, 4, 'menu panel (logo/sub/diffs/foot)');
  eq(menuIn.children[0].textContent, 'HANGMAN', 'logo');
  diffsEl = menuIn.children[2];
  eq(diffsEl.children.length, 3, 'three difficulties');
  eq(diffsEl.children[0].dataset.d, 'easy', 'difficulty order');
  eq(diffsEl.children[1].dataset.d, 'normal', 'difficulty order 2');
  eq(diffsEl.children[2].dataset.d, 'hard', 'difficulty order 3');
  eq(diffsEl.children[0].children[0].textContent, 'EASY', 'EASY label');
  eq(diffsEl.children[2].children[2].textContent, 'NEW', 'no best yet');
  eq(msgEl.textContent, 'PICK A DIFFICULTY', 'boot message');
  eq(levelB.textContent, '1', 'level read-out at boot');
  eq(catB.textContent, '—', 'category placeholder at boot');
  eq(bestB.textContent, 'LV 0', 'best read-out at boot');

  let st = inst.getState();
  eq(st.phase, 'menu', 'phase at boot');
  eq(st.difficulty, null, 'difficulty at boot');
  eq(st.level, 1, 'level at boot');
  eq(st.lives, 6, 'lives at boot');
  eq(st.wrong, 0, 'wrong at boot');
  eq(st.word, '', 'word at boot');
  eq(st.score, 0, 'score at boot');
  eq(st.guessed.length, 0, 'guessed at boot');
  eq(ctx.score, 0, 'shell score at boot');
  eq(st.timers, 0, 'no timers at boot');
  eq(cvEl.width, 900, 'canvas backing width (host fallback)');
  eq(cvEl.height, 700, 'canvas backing height');
  ok(step(), 'frame loop running (draw executed without throwing)');
  console.log('A → registration + menu DOM + boot state + canvas fit ✓');

  /* ═══ B — pick EASY ═══ */
  click(diffsEl.children[0]);
  st = inst.getState();
  eq(st.phase, 'play', 'phase after pick');
  eq(st.difficulty, 'easy', 'difficulty recorded');
  eq(st.level, 1, 'starts at level 1');
  eq(st.category, 'ANIMALS', 'level 1 category');
  eq(st.tier, 'easy', 'level 1 tier');
  eq(st.lives, 6, 'fresh lives');
  eq(st.wrong, 0, 'no misses');
  ok(st.word.length >= 4 && st.word.length <= 6, 'easy word length: ' + st.word);
  eq(st.letters, st.word.length, 'letter count');
  ok(/ANIMALS/.test(catB.textContent), 'HUD category');
  eq(levelB.textContent, '1', 'HUD level');
  ok(sfxCount('coin') >= 1, 'pick sfx');
  ok(sfxCount('start') >= 1, 'level start sfx');
  ok(sfxCount('tick') >= 1, 'free-letter sfx');
  eq(st.guessed.length, 1, 'easy hands out one free letter');
  ok(distinct(st.word).length >= 3, 'word invariant: at least 3 distinct letters');
  const freeCh = st.guessed[0];
  const nFree = st.word.split('').filter(c => c === freeCh).length;
  eq(st.revealed, nFree, 'free letter revealed its instances');
  eq(wordEl.children.length, st.letters, 'letter cells built');
  eq(keyBtn(freeCh).disabled, true, 'free key disabled');
  ok(keyBtn(freeCh).classList.contains('is-hit'), 'free key marked hit');
  ok(letterEl(st.word.indexOf(freeCh)).classList.contains('is-on'), 'free letter flipped in');
  eq(msgEl.textContent, 'FREE LETTER: ' + freeCh, 'free-letter message');
  advance(350);                                   // menu fade-out timer
  eq(menuEl.style.display, 'none', 'menu faded out');
  eq(inst.getState().phase, 'play', 'still playing after fade');
  console.log('B → difficulty pick · level 1 ANIMALS · free letter · menu fade ✓');

  /* ═══ C — keypad + keyboard guesses ═══ */
  let s0 = inst.getState();
  const target = distinct(s0.word).filter(c => s0.guessed.indexOf(c) === -1)[0];
  ok(target, 'a letter left to guess');
  const nInst = s0.word.split('').filter(c => c === target).length;
  click(keyBtn(target));
  st = inst.getState();
  eq(st.phase, 'play', 'one guess must not solve the word');
  eq(st.guessed.indexOf(target) !== -1, true, 'letter guessed');
  eq(st.revealed, s0.revealed + nInst, 'instances revealed');
  eq(st.score, s0.score + 15 * nInst, 'letter score @easy tier');
  eq(st.lives, 6, 'correct guess costs nothing');
  eq(st.pattern.indexOf('.') !== -1, true, 'word still hidden');
  ok(keyBtn(target).classList.contains('is-hit'), 'key marked hit');
  eq(keyBtn(target).disabled, true, 'hit key disabled');
  ok(sfxCount('coin') >= 2, 'correct sfx');
  ok(/\+15/.test(msgEl.textContent), 'gain message: ' + msgEl.textContent);

  /* physical keyboard */
  const s1 = inst.getState();
  const target2 = distinct(s1.word).filter(c => s1.guessed.indexOf(c) === -1)[0];
  const nInst2 = s1.word.split('').filter(c => c === target2).length;
  key(target2.toLowerCase());
  st = inst.getState();
  eq(st.revealed, s1.revealed + nInst2, 'keyboard guess revealed');
  eq(st.score, s1.score + 15 * nInst2, 'keyboard guess scored');
  eq(keyBtn(target2).disabled, true, 'keyboard-disabled key');
  /* re-guessing is a no-op */
  const s2 = inst.getState();
  key(target2);
  eq(JSON.stringify(inst.getState()), JSON.stringify(s2), 'repeat guess ignored');
  console.log('C → keypad + physical keyboard · scoring · repeat guard ✓');

  /* ═══ D — wrong guess ═══ */
  const s3 = inst.getState();
  const miss = A.split('').filter(c => s3.word.indexOf(c) === -1 && s3.guessed.indexOf(c) === -1)[0];
  ok(miss, 'a miss letter available');
  click(keyBtn(miss));
  st = inst.getState();
  eq(st.lives, 5, 'life lost');
  eq(st.wrong, 1, 'body part drawn');
  eq(st.score, s3.score, 'wrong guess scores nothing');
  eq(pips.filter(p => p.classList.contains('is-off')).length, 1, 'one pip off');
  eq(pips[5].classList.contains('is-off'), true, 'last pip goes first');
  ok(keyBtn(miss).classList.contains('is-miss'), 'key marked miss');
  eq(keyBtn(miss).disabled, true, 'miss key disabled');
  ok(new RegExp('NO ' + miss + ' — 5 LEFT').test(msgEl.textContent), 'miss message: ' + msgEl.textContent);
  ok(sfxCount('hit') === 1, 'miss sfx');
  ok(mainEl.classList.contains('is-shake'), 'shake fired');
  console.log('D → wrong guess: life · pip · miss key · shake · message ✓');

  /* ═══ E — pause gate ═══ */
  const frozen = JSON.stringify(inst.getState());
  inst.pause();
  pausedFlag = true;
  const s4 = inst.getState();
  const untouched = distinct(s4.word).filter(c => s4.guessed.indexOf(c) === -1)[0];
  click(keyBtn(untouched));                     // ignored
  key(A[0]);                                    // ignored (A… but check any)
  advance(600);                                 // clock + timers frozen
  eq(JSON.stringify(inst.getState()), frozen, 'state frozen while paused');
  inst.resume();
  pausedFlag = false;
  ok(inst.getState().timers >= 1, 'shake timer resumes');
  advance(500);
  ok(!mainEl.classList.contains('is-shake'), 'shake timer completed after resume');
  console.log('E → pause freezes input, clock and timers ✓');

  /* ═══ F — solve → clear bonus · persistence · Enter skip ═══ */
  const r1 = solveWord();
  st = inst.getState();
  eq(st.phase, 'clear', 'level cleared');
  eq(flashEl.style.display, 'grid', 'clear splash shown');
  eq(flashT.textContent, 'LEVEL 1 CLEAR', 'splash title');
  ok(/^\+\d+$/.test(flashS.textContent), 'splash gain: ' + flashS.textContent);
  ok(/CLEARED/.test(msgEl.textContent), 'clear message');
  eq(st.score, r1.lastBefore + 15 * r1.lastInstances + (120 + 50 * r1.livesAtClear) * r1.mult, 'clear bonus');
  eq(Store.settings.hangman.easy, 1, 'best level persisted');
  eq(bestB.textContent, 'LV 1', 'best HUD read-out');
  ok(sfxCount('win') === 1, 'clear sfx');
  ok(toasts.some(t => /New best/.test(t.m)), 'best toast');

  /* the clear timer must not tick while paused */
  inst.pause(); pausedFlag = true;
  advance(2500);
  eq(inst.getState().phase, 'clear', 'clear timer frozen while paused');
  inst.resume(); pausedFlag = false;
  advance(150);
  eq(inst.getState().phase, 'clear', 'only a sliver of the timer elapsed');
  key('Enter');                                // skip the splash
  st = inst.getState();
  eq(st.phase, 'play', 'Enter skipped the splash');
  eq(st.level, 2, 'level 2');
  eq(st.category, 'FRUIT', 'category rotated');
  eq(flashEl.style.display, 'none', 'splash hidden');
  eq(st.lives, 6, 'lives refilled');
  eq(st.wrong, 0, 'gallows reset');
  eq(st.guessed.length, 1, 'free letter on level 2');
  eq(wordEl.children.length, st.letters, 'word rebuilt');
  eq(pips.filter(p => p.classList.contains('is-off')).length, 0, 'pips refilled');
  const cleanKey = A.split('').filter(c => st.word.indexOf(c) === -1 && st.guessed.indexOf(c) === -1)[0];
  eq(keyBtn(cleanKey).className, 'grhm-key', 'keys reset');
  eq(keyBtn(cleanKey).disabled, false, 'keys re-enabled');
  console.log('F → clear bonus maths · best persistence · pause-frozen timer · Enter ✓');

  /* ═══ G — levels 2…3 on the timer, tier escalates at level 4 ═══ */
  solveWord();                                  // level 2 clears on its timer
  st = inst.getState();
  eq(st.phase, 'clear', 'level 2 cleared');
  ok(advanceUntil(() => inst.getState().phase === 'play'), 'timer advanced level');
  eq(inst.getState().level, 3, 'level 3');
  eq(inst.getState().category, 'COUNTRY', 'level 3 category');
  solveWord();
  ok(advanceUntil(() => inst.getState().phase === 'play'), 'timer advanced again');
  st = inst.getState();
  eq(st.level, 4, 'level 4');
  eq(st.category, 'SPACE', 'level 4 category');
  eq(st.tier, 'normal', 'tier escalates at level 4');
  eq(Store.settings.hangman.easy, 3, 'best level 3 stored');
  const sG = inst.getState();
  const remainG = distinct(sG.word).filter(c => sG.guessed.indexOf(c) === -1);
  ok(remainG.length >= 2, 'letters left to probe');
  const gT = remainG[0];
  const gN = sG.word.split('').filter(c => c === gT).length;
  click(keyBtn(gT));
  eq(inst.getState().score, sG.score + 30 * gN, 'letter score @normal tier (30)');
  console.log('G → level chain on the timer · tier escalation · tier scoring ✓');

  /* ═══ H — six misses → reveal → gameOver ═══ */
  const sH = inst.getState();
  const misses = A.split('').filter(c => sH.word.indexOf(c) === -1 && sH.guessed.indexOf(c) === -1).slice(0, 6);
  eq(misses.length, 6, 'six miss letters available');
  for (let i = 0; i < misses.length; i++) click(keyBtn(misses[i]));
  st = inst.getState();
  eq(st.phase, 'reveal', 'death reveal phase');
  eq(st.lives, 0, 'no lives left');
  eq(st.wrong, 6, 'all six parts drawn');
  eq(st.revealed, st.letters, 'word fully revealed');
  for (let i = 0; i < st.letters; i++) eq(letterEl(i).textContent, st.word[i], 'letter ' + i + ' revealed');
  eq(pips.filter(p => p.classList.contains('is-off')).length, 6, 'all pips off');
  ok(sfxCount('lose') === 1, 'death sfx');
  ok(new RegExp('THE WORD WAS ' + st.word).test(msgEl.textContent), 'reveal message');
  const reachLevel = st.level, deadWord = st.word;
  const sD = inst.getState();
  key('q');                                     // still ignored in reveal
  eq(JSON.stringify(inst.getState()), JSON.stringify(sD), 'input locked during reveal');
  ok(advanceUntil(() => over !== null), 'gameOver fired');
  eq(over.title, 'HANGED!', 'game-over title');
  ok(over.message.indexOf('reached level ' + reachLevel) !== -1, 'message: ' + over.message);
  ok(over.message.indexOf(deadWord) !== -1, 'message names the word');
  eq(inst.getState().phase, 'over', 'phase over');
  console.log('H → death sequence · word reveal · gameOver payload ✓');

  /* ═══ I — restart ═══ */
  over = null;
  inst.restart();
  st = inst.getState();
  eq(st.phase, 'play', 'restart → playing');
  eq(st.level, 1, 'back to level 1');
  eq(st.difficulty, 'easy', 'difficulty remembered');
  eq(st.score, 0, 'score reset');
  eq(ctx.score, 0, 'shell score reset');
  eq(st.lives, 6, 'lives reset');
  eq(st.wrong, 0, 'wrong reset');
  eq(st.guessed.length, 1, 'free letter only');
  eq(st.timers, 0, 'no timers pending after restart');
  eq(over, null, 'restart must not fire gameOver');
  eq(menuEl.style.display, 'none', 'menu stays hidden');
  eq(wordEl.children.length, st.letters, 'fresh word cells');
  eq(pips.filter(p => p.classList.contains('is-off')).length, 0, 'pips full');
  A.split('').forEach(c => {
    const b = keyBtn(c);
    if (st.guessed.indexOf(c) !== -1) {          // the new free letter
      if (!b.disabled || !b.classList.contains('is-hit')) fail('free key not restored: ' + c);
      return;
    }
    if (b.disabled || b.classList.contains('is-hit') || b.classList.contains('is-miss')) fail('key not reset: ' + c);
  });
  console.log('I → restart resets run, keys, pips; remembers difficulty ✓');

  /* ═══ J — resize + destroy ═══ */
  container.clientWidth = 600; container.clientHeight = 480;
  inst.resize(600, 480);
  eq(cvEl.width, 600, 'resize re-fits backing width');
  eq(cvEl.height, 480, 'resize re-fits backing height');
  container.clientWidth = 900; container.clientHeight = 700;
  inst.resize(900, 700);
  eq(cvEl.width, 900, 'resize back to host size');
  ok(step(), 'frame after resize');
  const sJ = inst.getState();
  const jT = distinct(sJ.word).filter(c => sJ.guessed.indexOf(c) === -1)[0];
  click(keyBtn(jT));
  eq(inst.getState().guessed.indexOf(jT) !== -1, true, 'still playing after resize');

  inst.destroy();
  if (rafCb !== null) fail('raf not cancelled');
  if ((win.keydown || []).length) fail('keydown leaked');
  if (artEl._count('click')) fail('art click leaked');
  if (container.children.length !== 0) fail('host not cleaned: ' + container.children.length);
  if (container.classList.contains('grhm-host')) fail('host class not removed');
  console.log(`J → resize + lifecycle ok | setScore ${scores.length} · sfx ${sfxLog.length} · store ${storeLog.length}`);

  console.log('SMOKE OK');
  process.exit(0);
})();
