/* Headless smoke test for ROCK · PAPER · SCISSORS.
   Math.random = 0.5 → the bot's random branch always lands on PAPER
   (the adaptive branch needs Math.random() < adapt ≤ 0.5, so it never
   fires until we deliberately lower the rng).
   A — boot: HUD, arena, three throw buttons, idle state (3 lives, 12% read)
   B — a win: reveal lock → result → back to pick (score/streak/sfx)
   C — a streak milestone toast
   D — the adaptive bot: rng 0 → it throws the counter of your habit
   E — a tie keeps score, lives and streak
   F — two losses → OUT OF LIVES payload + input lock
   G — restart resets everything
   H — pause gates throws   I — keyboard throws (2, r)
   J — destroy: raf + keydown listener + DOM cleanup                        */
const fs = require('fs');

let gameDef = null;
global.registerGame = d => { gameDef = d; };
global.Sfx = { played: [], play(n) { this.played.push(n); } };

Math.random = () => 0.5;

function fakeEl(extra = {}) {
  const listeners = {};
  const el = {
    _cls: '', style: {}, textContent: '', innerHTML: '', children: [], parentNode: null,
    dataset: {}, type: '', disabled: false,
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
  };
  return Object.assign(el, extra);
}

const container = fakeEl({ clientWidth: 900, clientHeight: 700 });
global.document = { createElement: () => fakeEl(), documentElement: {} };

const winListeners = {};
global.window = {
  addEventListener(e, f) { (winListeners[e] || (winListeners[e] = [])).push(f); },
  removeEventListener(e, f) { winListeners[e] = (winListeners[e] || []).filter(x => x !== f); },
};
const key = k => (winListeners.keydown || []).slice().forEach(f => f({ key: k, preventDefault() {} }));

let rafCb = null;
global.requestAnimationFrame = cb => { rafCb = cb; return 1; };
global.cancelAnimationFrame = () => { rafCb = null; };

/* ── load ── */
const src = fs.readFileSync(__dirname + '/../assets/js/games/rps.js', 'utf8');
eval(src);
if (!gameDef) { console.log('FAIL: not registered'); process.exit(1); }
console.log(`registered: ${gameDef.id} / ${gameDef.title} / genre=${gameDef.genre}`);
if (gameDef.id !== 'rps') { console.log('FAIL: bad id'); process.exit(1); }
if (gameDef.genre !== 'Arcade') { console.log('FAIL: genre ' + gameDef.genre); process.exit(1); }
if (!Array.isArray(gameDef.controls) || !gameDef.controls.length) { console.log('FAIL: controls'); process.exit(1); }

/* ── helpers ── */
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fail = msg => { console.log('FAIL: ' + msg); process.exit(1); };
function ok(cond, msg) { if (!cond) fail(msg); }
function eq(got, want, label) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { console.log('FAIL ' + label); console.log('  got : ' + g); console.log('  want: ' + w); process.exit(1); }
}
function findEl(root, pred) {
  for (const k of root.children || []) {
    if (pred(k)) return k;
    const hit = findEl(k, pred);
    if (hit) return hit;
  }
  return null;
}
const find = (root, cls) =>
  findEl(root, e => typeof e.className === 'string' && e.className.split(' ').indexOf(cls) !== -1);

let now = 0;
function frames(n, step = 17) {
  for (let i = 0; i < n; i++) {
    if (!rafCb) break;
    const cb = rafCb; rafCb = null; now += step; cb(now);
  }
}
const advance = ms => frames(Math.ceil(ms / 17) + 3);   // clear REVEAL / RESULT beat
const REVEAL_MS = 700, RESULT_MS = 1300;

/* ── ctx mock ── */
const scores = [];
const sfxLog = [];
const toasts = [];
let over = null;
const ctx = {
  container, width: 900, height: 700,
  setScore: n => { scores.push(n); return n; },
  get score() { return scores.length ? scores[scores.length - 1] : 0; },
  gameOver: o => { over = o; },
  toast: (m, k) => toasts.push({ m, k }),
  sfx: n => sfxLog.push(n),
};

let inst = null, wrapEl, topEl, arenaEl, msgEl, ctrlEl, btns, youHand, cpuHand, outEl, livesB, pctEl;

function throwByButton(i) { btns[i]._fire('click', {}); }
const phase = () => inst.getState().phase;

/** click → reveal → result → back to pick (or over) */
function playRound(i) {
  throwByButton(i);
  advance(REVEAL_MS);
  advance(RESULT_MS);
}

(async () => {
  /* ═══ A — boot ═══ */
  inst = gameDef.create(ctx);
  ok(container.classList.contains('grps-host'), 'host class missing');
  wrapEl = find(container, 'grps-wrap');
  topEl = find(container, 'grps-top');
  arenaEl = find(container, 'grps-arena');
  msgEl = find(container, 'grps-msg');
  ctrlEl = find(container, 'grps-ctrl');
  ok(wrapEl && topEl && arenaEl && msgEl && ctrlEl, 'layout parts missing');
  eq(topEl.children.length, 4, 'HUD cells (score/streak/lives/read)');
  eq(ctrlEl.children.length, 3, 'throw buttons');
  btns = ctrlEl.children;
  eq(btns.map(b => b.children.map(c => c.textContent).join('')), ['1✊ROCK', '2✋PAPER', '3✌️SCISSORS'], 'button labels');
  const sides = arenaEl.children;
  eq(sides.length, 3, 'arena columns');
  youHand = sides[0].children[0];
  cpuHand = sides[2].children[0];
  outEl = sides[1].children[1];
  const livesStat = find(container, 'is-lives');
  livesB = livesStat.children[1];
  pctEl = find(container, 'grps-read__pct');

  let st = inst.getState();
  eq(st.phase, 'pick', 'phase at boot');
  eq(st.score, 0, 'score at boot');
  eq(st.lives, 3, 'lives at boot');
  eq(st.streak, 0, 'streak at boot');
  eq(st.rounds, 0, 'rounds at boot');
  eq(st.history, [], 'history at boot');
  eq(Math.abs(st.read - 0.12) < 1e-9, true, 'read at boot: ' + st.read);
  eq(ctx.score, 0, 'shell score at boot');
  eq(livesB.children.length, 3, 'life pips');
  eq(livesB.children.filter(c => c.classList.contains('is-on')).length, 3, 'lives on');
  eq(livesB.children.map(c => c.textContent).join(''), '♥♥♥', 'heart glyphs');
  eq(pctEl.textContent, '12%', 'read %');
  eq(msgEl.textContent, 'Pick your move', 'idle message');
  eq(youHand.textContent, '?', 'your hand idle');
  eq(cpuHand.textContent, '?', 'bot hand idle');
  eq(outEl.textContent, '', 'outcome idle');
  eq(btns.some(b => b.disabled), false, 'buttons locked at boot');
  console.log('A → HUD (score·streak·lives·read) + arena + 3 throws ✓');

  /* ═══ B — a win (scissors beats the bot's paper) ═══ */
  throwByButton(2);
  st = inst.getState();
  eq(st.phase, 'reveal', 'phase right after throw');
  eq(st.rounds, 1, 'round counted');
  eq(st.you, 2, 'your throw');
  eq(st.cpu, 1, 'bot throw (rng 0.5 → paper)');
  eq(st.outcome, 'win', 'outcome');
  eq(youHand.textContent, '?', 'hand revealed early');
  eq(btns.some(b => b.disabled), true, 'buttons not locked during reveal');
  throwByButton(0);                              // must be ignored mid-reveal
  eq(inst.getState().rounds, 1, 'input leaked during reveal');

  advance(REVEAL_MS);
  st = inst.getState();
  eq(st.phase, 'result', 'phase after reveal beat');
  eq(youHand.textContent, '✌️', 'your hand revealed');
  eq(cpuHand.textContent, '✋', 'bot hand revealed');
  eq(outEl.textContent, 'YOU WIN', 'outcome banner');
  eq(msgEl.textContent, 'SCISSORS beats PAPER', 'result line');
  eq(arenaEl.classList.contains('is-win'), true, 'win class missing');
  eq(msgEl.classList.contains('is-win'), true, 'win line class missing');
  eq(st.score, 1, 'score after win');
  eq(st.streak, 1, 'streak after win');
  eq(st.bestStreak, 1, 'best streak');
  eq(ctx.score, 1, 'shell score after win');
  ok(sfxLog.indexOf('coin') !== -1, 'win sfx missing');

  advance(RESULT_MS);
  st = inst.getState();
  eq(st.phase, 'pick', 'did not return to pick');
  eq(youHand.textContent, '?', 'hands not reset');
  eq(msgEl.textContent, 'Pick your move', 'message not reset');
  eq(arenaEl.classList.contains('is-win'), false, 'win class stuck');
  eq(btns.some(b => b.disabled), false, 'buttons still locked');
  console.log('B → win round: lock → reveal → result → idle ✓');

  /* ═══ C — two more wins → streak milestone toast ═══ */
  playRound(2);
  playRound(2);
  st = inst.getState();
  eq(st.score, 3, 'score after 3 wins');
  eq(st.streak, 3, 'streak after 3 wins');
  eq(st.bestStreak, 3, 'best streak after 3 wins');
  eq(st.rounds, 3, 'rounds after 3 wins');
  eq(toasts.length, 1, 'streak toast missing');
  ok(/Streak 3/.test(toasts[0].m), 'toast text: ' + toasts[0].m);
  eq(toasts[0].k, 'win', 'toast kind');
  ok(sfxLog.indexOf('power') !== -1, 'milestone sfx missing');
  console.log('C → 3 wins: score 3 · streak 3 · toast ✓');

  /* ═══ D — the adaptive bot counters your habit ═══ */
  Math.random = () => 0;                          // force the read branch
  ok(inst.getState().history.length === 3, 'history needs 3 throws');
  throwByButton(2);                               // throw your favourite again
  st = inst.getState();
  eq(st.cpu, 0, 'bot did not counter your most-used throw');
  eq(st.outcome, 'lose', 'rock should beat scissors');
  eq(Math.abs(st.read - 0.18) < 1e-9, true, 'read at score 3: ' + st.read);
  eq(pctEl.textContent, '18%', 'read % display');
  advance(REVEAL_MS);
  st = inst.getState();
  eq(st.lives, 2, 'lives after the read');
  eq(st.streak, 0, 'streak reset on loss');
  eq(st.score, 3, 'score kept on loss');
  eq(livesB.children.filter(c => c.classList.contains('is-on')).length, 2, 'pip lost');
  eq(livesB.children.map(c => c.textContent).join(''), '♥♥♡', 'heart glyphs after loss');
  ok(sfxLog.indexOf('hit') !== -1, 'lose sfx missing');
  advance(RESULT_MS);
  Math.random = () => 0.5;
  console.log('D → bot read the habit (threw ROCK), life lost ✓');

  /* ═══ E — a tie changes nothing ═══ */
  throwByButton(1);                                  // paper vs paper
  st = inst.getState();
  eq(st.outcome, 'tie', 'not a tie');
  advance(REVEAL_MS);
  eq(outEl.textContent, 'TIE', 'tie banner');
  eq(msgEl.textContent, 'PAPER vs PAPER — draw', 'tie line');
  advance(RESULT_MS);
  st = inst.getState();
  eq(st.score, 3, 'score after tie');
  eq(st.lives, 2, 'lives after tie');
  eq(st.streak, 0, 'streak after tie');
  eq(st.rounds, 5, 'rounds after tie');
  eq(pctEl.textContent, '18%', 'read % after tie');
  eq(st.phase, 'pick', 'back to pick after tie');
  console.log('E → tie: score/lives untouched ✓');

  /* ═══ F — two losses → OUT OF LIVES ═══ */
  over = null;
  playRound(0);                                  // rock vs paper → lose (1 life left)
  st = inst.getState();
  eq(st.lives, 1, 'lives after first loss');
  throwByButton(0);                              // final loss
  advance(REVEAL_MS);
  st = inst.getState();
  eq(st.lives, 0, 'lives at the end');
  eq(st.phase, 'result', 'result must still play out');
  eq(outEl.textContent, 'YOU LOSE', 'final banner');
  eq(msgEl.textContent, 'PAPER beats ROCK', 'final line');
  advance(RESULT_MS);
  st = inst.getState();
  eq(st.phase, 'over', 'phase after the run');
  ok(over, 'shell gameOver never fired');
  eq(over.title, 'OUT OF LIVES', 'gameOver title: ' + (over && over.title));
  eq(over.message, '7 rounds · best streak 3', 'gameOver message: ' + (over && over.message));
  eq(st.rounds, 7, 'total rounds');
  eq(msgEl.textContent, 'Run over', 'final message');
  eq(btns.some(b => b.disabled), true, 'buttons not locked after the run');
  throwByButton(2);
  eq(inst.getState().rounds, 7, 'input leaked after game over');
  console.log(`F → ${over.title} | ${over.message} ✓`);

  /* ═══ G — restart ═══ */
  inst.restart();
  st = inst.getState();
  eq(st.phase, 'pick', 'restart phase');
  eq(st.score, 0, 'restart score');
  eq(st.lives, 3, 'restart lives');
  eq(st.streak, 0, 'restart streak');
  eq(st.rounds, 0, 'restart rounds');
  eq(st.history, [], 'restart history');
  eq(ctx.score, 0, 'restart shell score');
  eq(Math.abs(st.read - 0.12) < 1e-9, true, 'restart read');
  eq(livesB.children.map(c => c.textContent).join(''), '♥♥♥', 'restart hearts');
  eq(btns.some(b => b.disabled), false, 'restart buttons');
  console.log('G → restart clean ✓');

  /* ═══ H — pause gate ═══ */
  inst.pause();
  throwByButton(2); advance(REVEAL_MS); advance(RESULT_MS);
  st = inst.getState();
  eq(st.rounds, 0, 'throw leaked through pause');
  eq(st.phase, 'pick', 'phase moved while paused');
  inst.resume();
  playRound(2);
  st = inst.getState();
  eq(st.rounds, 1, 'input dead after resume');
  eq(st.score, 1, 'scoring after resume');
  console.log('H → pause gate ✓');

  /* ═══ I — keyboard throws ═══ */
  key('2');                                      // paper vs paper → tie
  st = inst.getState();
  eq(st.phase, 'reveal', 'key 2 did not throw');
  eq(st.you, 1, 'key 2 throw');
  key('2');                                      // still shaking → ignored
  eq(st.rounds, 2, 'key threw while busy');
  advance(REVEAL_MS);
  st = inst.getState();
  eq(st.phase, 'result', 'key 2 result beat');
  eq(st.outcome, 'tie', 'key 2 outcome');
  advance(RESULT_MS);
  eq(inst.getState().phase, 'pick', 'back to pick after key 2');
  eq(inst.getState().rounds, 2, 'key 2 round count');

  key('r');                                      // rock vs paper → loss
  st = inst.getState();
  eq(st.phase, 'reveal', 'key r did not throw');
  eq(st.you, 0, 'key r throw');
  advance(REVEAL_MS);
  eq(inst.getState().outcome, 'lose', 'key r outcome');
  advance(RESULT_MS);
  st = inst.getState();
  eq(st.lives, 2, 'key r life lost');
  eq(st.rounds, 3, 'key r round count');
  eq(inst.getState().phase, 'pick', 'back to pick after key r');

  key('x');                                      // unmapped key is a no-op
  eq(inst.getState().rounds, 3, 'unknown key threw');
  console.log('I → keyboard throws (2, r) + busy/no-op gates ✓');

  /* ═══ J — destroy ═══ */
  inst.destroy();
  if (rafCb !== null) fail('raf not cancelled');
  if ((winListeners.keydown || []).length !== 0) fail('keydown listener leaked');
  if (container.children.length !== 0) fail('host not cleaned: ' + container.children.length);
  if (container.classList.contains('grps-host')) fail('host class not removed');
  console.log(`J → lifecycle ok | setScore calls: ${scores.length}`);

  console.log('SMOKE OK');
  process.exit(0);
})();
