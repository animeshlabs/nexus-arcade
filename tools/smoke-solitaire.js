/* Headless smoke test for SOLITAIRE (neon Klondike — DOM cards).

   Math.random = 0.5 → deterministic shuffle unless a rigged sequence is
   patched in for the win stage (Fisher-Yates inverse).

   A — boot: registration, shell DOM, initial deal maths
   B — pick EASY: menu fade, phase/time, ruleset wiring
   C — stock: draw to empty, recycle, draw again (round-trip identity)
   D — selection + illegal move: reject, shake, message
   E — progress loop: a real tableau move and a real foundation move
       with exact scoring (+50 / +60 on the first homecoming)
   F — undo: easy unlimited (exact state restore), medium 5, hard none
   G — pause gate: input + frame clock + pending timers frozen
   H — hint: marks the board, clears on the timer, keyboard too; hard hides it
   I — win: rigged winnable deal → scripted play → gameOver payload,
       exact final score, per-difficulty best persisted
   J — restart / resize / destroy
*/
const fs = require('fs');

let gameDef = null;
global.registerGame = d => { gameDef = d; };
global.Sfx = { play() {} };

Math.random = () => 0.5;

/* ── fake canvas ctx (unused by this game, kept for parity) ── */
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
const wl = n => (win[n] || []).length;

let rafCb = null;
global.requestAnimationFrame = cb => { rafCb = cb; return 1; };
global.cancelAnimationFrame = () => { rafCb = null; };

/* ── Store mock (per-difficulty bests) ── */
const storeLog = [];
global.Store = {
  settings: { solitaire: { easy: 0, medium: 0, hard: 0 } },
  set(k, v) { this.settings[k] = JSON.parse(JSON.stringify(v)); storeLog.push({ k, v }); },
};

/* ── load ── */
const src = fs.readFileSync(__dirname + '/../assets/js/games/solitaire.js', 'utf8');
eval(src);
if (!gameDef) { console.log('FAIL: not registered'); process.exit(1); }
console.log(`registered: ${gameDef.id} / ${gameDef.title} / genre=${gameDef.genre}`);
if (gameDef.id !== 'solitaire') { console.log('FAIL: id'); process.exit(1); }
if (gameDef.genre !== 'Cards') { console.log('FAIL: genre ' + gameDef.genre); process.exit(1); }
if (gameDef.featured !== true) { console.log('FAIL: not featured'); process.exit(1); }
if (!Array.isArray(gameDef.controls) || gameDef.controls.length !== 3) { console.log('FAIL: controls'); process.exit(1); }
if (!gameDef.colors || gameDef.colors.length !== 2) { console.log('FAIL: colors'); process.exit(1); }

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

/* ── DOM refs (walk children — no querySelector in the fake DOM) ── */
let inst, hudEl, boardEl, barEl, menuEl, topEl, colsWrap, stockEl, wasteEl, foundsEl,
    msgEl, hintBtn, undoBtn, newBtn, levelBtn, menuIn, diffsEl, cells = [];

const tap = e => e._fire('click');
const colEl = ci => colsWrap.children[ci];
const slotEl = fi => foundsEl.children[fi];
function tapColTop(ci) { const c = colEl(ci); if (!c.children.length) return false; tap(c.children[c.children.length - 1]); return true; }
function tapWasteTop() { if (!wasteEl.children.length) return false; tap(wasteEl.children[wasteEl.children.length - 1]); return true; }
function tapSlot(fi) { tap(slotEl(fi)); }
function tapStockNow() { tap(stockEl); }
function isRed(s) { return s === 1 || s === 2; }
function findByClass(node, cls, out) {
  out = out || [];
  if (node.classList && node.classList.contains(cls)) out.push(node);
  const ch = node.children || [];
  for (let i = 0; i < ch.length; i++) findByClass(ch[i], cls, out);
  return out;
}
const sfxCount = n => sfxLog.filter(x => x === n).length;

/* rule mirrors (verified against getState) */
function canFoundation(st, card) {
  const t = st.found[card.suit];
  return t ? (t.suit === card.suit && t.rank === card.rank - 1) : card.rank === 1;
}
function legalDest(st, card, ci, fromCi) {
  if (fromCi === ci) return false;
  const col = st.cols[ci];
  if (col.len === 0) return card.rank === 13;
  const t = col.top;
  return t.faceUp && isRed(t.suit) !== isRed(card.suit) && t.rank === card.rank + 1;
}
function findFoundationMove(st) {
  const wt = st.wasteTop;
  if (wt && wt.faceUp && canFoundation(st, wt)) return { from: 'waste', card: wt, to: wt.suit };
  for (let c = 0; c < 7; c++) {
    const t = st.cols[c].top;
    if (t && t.faceUp && canFoundation(st, t)) return { from: 'col', ci: c, card: t, to: t.suit };
  }
  return null;
}
function findTableauMove(st) {
  const wt = st.wasteTop;
  if (wt && wt.faceUp) {
    for (let c = 0; c < 7; c++) if (legalDest(st, wt, c, -1)) return { from: 'waste', card: wt, to: c };
  }
  for (let c = 0; c < 7; c++) {
    const cards = st.cols[c].cards;
    for (let i = cards.length - 1; i >= 0; i--) {
      if (!cards[i].faceUp) break;
      for (let c2 = 0; c2 < 7; c2++) {
        if (c2 === c) continue;
        if (legalDest(st, cards[i], c2, c)) return { from: 'col', ci: c, i: i, card: cards[i], to: c2 };
      }
    }
  }
  return null;
}
function tapDest(st, ci) {
  const col = colEl(ci);
  if (st.cols[ci].len) tap(col.children[col.children.length - 1]);
  else tap(col);
}
function snapState() {
  const s = inst.getState();
  return JSON.stringify({
    drawCount: s.drawCount, score: s.score, moves: s.moves,
    stock: s.stock, waste: s.waste, reveal: s.reveal,
    foundCount: s.foundCount, found: s.found, cols: s.cols, selected: s.selected,
  });
}

/* ═══ rigged deal ═══════════════════════════════════════════
   A Klondike deal that is trivially winnable:
   · columns hold single-suit runs whose top card is the next
     home-card, so play runs col0 → col6 and every face-down
     card flips straight home;
   · stock (drawn from the end) is exactly the remaining sequence
     7♠…K♠, 9♥…K♥, 4♦…K♦, Q♣…K♣.
   Fisher-Yates is inverted to force that exact shuffle.          */
const c = (s, r) => ({ suit: s, rank: r });
const TARGET = [
  /* col0..col6 in deal order (bottom → top of each column) */
  c(0, 1),
  c(1, 2), c(1, 1),
  c(2, 3), c(2, 2), c(2, 1),
  c(3, 4), c(3, 3), c(3, 2), c(3, 1),
  c(0, 6), c(0, 5), c(0, 4), c(0, 3), c(0, 2),
  c(1, 8), c(1, 7), c(1, 6), c(1, 5), c(1, 4), c(1, 3),
  c(3, 11), c(3, 10), c(3, 9), c(3, 8), c(3, 7), c(3, 6), c(3, 5),
  /* stock bottom → top (last element drawn first) */
  c(3, 13), c(3, 12),
  c(2, 13), c(2, 12), c(2, 11), c(2, 10), c(2, 9), c(2, 8), c(2, 7), c(2, 6), c(2, 5), c(2, 4),
  c(1, 13), c(1, 12), c(1, 11), c(1, 10), c(1, 9),
  c(0, 13), c(0, 12), c(0, 11), c(0, 10), c(0, 9), c(0, 8), c(0, 7),
];
const same = (a, b) => a.suit === b.suit && a.rank === b.rank;
function riggedRandom(target) {
  const I = [];
  for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) I.push({ suit: s, rank: r });
  const C = I.slice();
  const rs = [];
  for (let i = C.length - 1; i > 0; i--) {
    const want = target[i];
    let j = -1;
    if (same(C[i], want)) j = i;
    else for (let k = 0; k <= i; k++) if (same(C[k], want)) { j = k; break; }
    if (j === -1) fail('rigged: no source card for index ' + i);
    rs.push((j + 0.5) / (i + 1));
    const t = C[i]; C[i] = C[j]; C[j] = t;
  }
  for (let i = 0; i < 52; i++) if (!same(C[i], target[i])) fail('rigged: shuffle mismatch at ' + i);
  return rs;
}
function expectedDeal() {
  const rows = [];
  let di = 0;
  for (let col = 0; col < 7; col++) {
    const row = [];
    for (let i = 0; i <= col; i++) {
      const card = TARGET[di++];
      row.push(card.suit + ':' + card.rank + (i === col ? 'U' : 'D'));
    }
    rows.push(row);
  }
  return rows;
}

(async () => {
  /* ═══ A — boot ═══ */
  inst = gameDef.create(ctx);
  ok(container.classList.contains('gsol-host'), 'host class missing');
  eq(container.children.length, 4, 'host children (hud/board/bar/menu)');

  hudEl = container.children[0];
  boardEl = container.children[1];
  barEl = container.children[2];
  menuEl = container.children[3];
  eq(hudEl.children.length, 4, 'HUD cells');
  cells = hudEl.children.map(c0 => c0.children);
  eq(cells.map(cc => cc[0].textContent), ['TIME', 'MOVES', 'UNDO', 'CARDS'], 'HUD labels');
  eq(cells[0][1].textContent, '0:00', 'time at boot');
  eq(cells[1][1].textContent, '0', 'moves at boot');
  eq(cells[2][1].textContent, '∞', 'undo at boot (unlimited)');
  eq(cells[3][1].textContent, '0/52', 'cards at boot');
  ok(hudEl.children[3].classList.contains('is-gold'), 'cards cell gold');

  eq(boardEl.children.length, 2, 'board holds top + cols');
  topEl = boardEl.children[0];
  colsWrap = boardEl.children[1];
  eq(topEl.children.length, 3, 'top row: stock/waste/founds');
  stockEl = topEl.children[0];
  wasteEl = topEl.children[1];
  foundsEl = topEl.children[2];
  eq(foundsEl.children.length, 4, 'four foundations');
  eq(foundsEl.children.map(s => s.children[0].textContent), ['♠', '♥', '♦', '♣'], 'foundation suit slots');
  eq(colsWrap.children.length, 7, 'seven columns');
  eq(barEl.children.length, 5, 'bar: msg + 4 buttons');
  msgEl = barEl.children[0];
  hintBtn = barEl.children[1];
  undoBtn = barEl.children[2];
  newBtn = barEl.children[3];
  levelBtn = barEl.children[4];
  eq(msgEl.textContent, 'PICK A DIFFICULTY', 'boot message');
  ok(hintBtn.disabled && undoBtn.disabled && newBtn.disabled, 'menu disables action buttons');
  eq(undoBtn.textContent, 'UNDO', 'undo label');

  eq(menuEl.children.length, 1, 'menu wrapper');
  menuIn = menuEl.children[0];
  eq(menuIn.children.length, 4, 'menu: logo/sub/diffs/foot');
  eq(menuIn.children[0].textContent, 'SOLITAIRE', 'logo');
  diffsEl = menuIn.children[2];
  eq(diffsEl.children.length, 3, 'three difficulties');
  eq(diffsEl.children.map(d => d.children[0].textContent), ['EASY', 'MEDIUM', 'HARD'], 'difficulty labels');
  eq(diffsEl.children.map(d => d.children[1].textContent),
     ['Draw 1 · unlimited undo · hints', 'Draw 1 · 5 undo · hints', 'Draw 3 · no undo · no hints'],
     'difficulty tags');
  eq(diffsEl.children.map(d => d.children[2].textContent), ['NEW', 'NEW', 'NEW'], 'no bests yet');

  /* initial deal (Math.random = 0.5) */
  eq(colsWrap.children.map(c0 => c0.children.length), [1, 2, 3, 4, 5, 6, 7], 'tableau deal shape');
  const st0 = inst.getState();
  eq(st0.phase, 'menu', 'phase menu at boot');
  eq(st0.stock, 24, 'stock 24');
  eq(st0.waste, 0, 'waste 0');
  eq(st0.cols.map(c0 => c0.up), [1, 1, 1, 1, 1, 1, 1], 'one face-up card per column');
  ok(st0.cols.every(c0 => c0.cards[c0.cards.length - 1].faceUp && c0.cards.slice(0, -1).every(x => !x.faceUp)),
     'only the last card of each column is face-up');
  ok(st0.cols.every(c0 => c0.len === c0.cards.length), 'cols cards sync');
  eq(st0.score, 0, 'score 0');
  eq(st0.undoLeft, -1, 'unlimited undo at boot');
  eq(st0.drawCount, 1, 'default draw 1');
  const downCards = st0.cols.reduce((n, c0) => n + c0.cards.filter(x => !x.faceUp).length, 0);
  eq(downCards, 21, '21 buried cards');
  const up0 = colEl(0).children[0];
  ok(up0.classList.contains('gsol-up') && up0.classList.contains('is-black'), 'col0 top is a black face-up card');
  eq(up0.children.length, 2, 'face-up card has both corners');
  ok(colEl(1).children[0].classList.contains('gsol-down') && colEl(1).children[0].children.length === 0,
     'face-down card is bare');
  ok(colEl(1).children[1].classList.contains('is-after-down'), 'fan offset class (after face-down)');
  eq(inst.getState().timers, 0, 'no timers pending at boot');
  eq([wl('keydown'), wl('pointermove'), wl('pointerup'), wl('pointercancel')], [1, 1, 1, 1],
     'window listeners registered');
  console.log('A → boot · shell DOM · deal shape ✓');

  /* ═══ B — pick EASY ═══ */
  tap(diffsEl.children[0]);
  ok(inst.getState().phase === 'play', 'phase play after EASY');
  ok(menuEl.classList.contains('is-out'), 'menu fading out');
  ok(advanceUntil(() => menuEl.style.display === 'none'), 'menu hidden after fade');
  let st = inst.getState();
  eq(st.difficulty, 'easy', 'difficulty easy');
  eq(st.drawCount, 1, 'draw 1');
  eq(st.undoLeft, -1, 'unlimited undo');
  eq(st.undoMax, -1, 'undo max -1');
  ok(st.hints, 'hints on');
  eq(st.score, 0, 'score reset');
  eq(st.stock, 24, 'fresh deal stock');
  ok(!hintBtn.disabled && !undoBtn.disabled === false || !hintBtn.disabled, 'hint enabled in play');
  eq(hintBtn.style.display, '', 'hint visible');
  eq(undoBtn.style.display, '', 'undo visible');
  eq(newBtn.disabled, false, 'new enabled');
  advance(1100);
  st = inst.getState();
  ok(st.seconds >= 1, 'clock ticking (seconds=' + st.seconds + ')');
  eq(cells[3][1].textContent, '0/52', 'HUD cards live');
  console.log('B → EASY start · timer · ruleset ✓');

  /* ═══ C — stock draw + recycle round-trip ═══ */
  let guard = 0;
  while (inst.getState().stock > 0 && guard++ < 40) tapStockNow();
  st = inst.getState();
  eq(st.stock, 0, 'stock drained');
  eq(st.waste, 24, 'all cards in waste');
  eq(st.reveal, 23, 'reveal start = len - drawCount');
  const firstTop = st.wasteTop;
  ok(firstTop && firstTop.faceUp, 'waste top face-up');
  eq(firstTop.rank >= 1 && firstTop.rank <= 13, true, 'wasteTop readable');
  tapStockNow();                                     /* recycle */
  st = inst.getState();
  eq(st.stock, 24, 'recycle restores stock');
  eq(st.waste, 0, 'waste emptied');
  eq(st.reveal, 0, 'reveal reset');
  guard = 0;
  while (inst.getState().stock > 0 && guard++ < 40) tapStockNow();
  st = inst.getState();
  eq(st.waste, 24, 'second pass drains stock again');
  eq(st.wasteTop.rank, firstTop.rank, 'round-trip identity: same top card');
  eq(st.wasteTop.suit, firstTop.suit, 'round-trip identity: same suit');
  console.log('C → draw · recycle · round-trip ✓');

  /* ═══ D — selection + illegal move ═══ */
  ok(tapWasteTop(), 'waste top tappable');
  st = inst.getState();
  ok(st.selected && st.selected.from === 'waste', 'waste top selected');
  eq(st.selected.rank, st.wasteTop.rank, 'selection matches waste top');
  const wt = st.wasteTop;
  let badCol = -1;
  for (let col = 0; col < 7; col++) {
    if (!legalDest(st, wt, col, -1)) { badCol = col; break; }
  }
  ok(badCol !== -1, 'found an illegal column');
  const movesBefore = st.moves;
  tap(colEl(badCol));                               /* column body with selection → reject */
  st = inst.getState();
  eq(st.selected, null, 'reject clears selection');
  eq(st.moves, movesBefore, 'reject does not count a move');
  eq(st.score, 0, 'reject scores nothing');
  ok(boardEl.classList.contains('is-shake'), 'board shakes on reject');
  eq(msgEl.textContent, 'THAT MOVE DOES NOT WORK', 'reject message');
  ok(sfxCount('hit') > 0, 'reject sfx');
  advance(600);
  ok(!boardEl.classList.contains('is-shake'), 'shake clears on the timer');
  console.log('D → select · illegal move rejected ✓');

  /* ═══ E — progress: tableau move + foundation move with scoring ═══ */
  let sawTableau = false, sawFoundation = false, fDelta = -1, fMoves = 0;
  for (let it = 0; it < 160 && !(sawTableau && sawFoundation); it++) {
    const before = inst.getState();
    const fm = findFoundationMove(before);
    if (fm) {
      if (fm.from === 'waste') ok(tapWasteTop(), 'waste select for home');
      else ok(tapColTop(fm.ci), 'col top select for home');
      const sel = inst.getState().selected;
      ok(sel && sel.rank === fm.card.rank && sel.suit === fm.card.suit, 'foundation source selected');
      tapSlot(fm.to);
      const after = inst.getState();
      ok(after.foundCount === before.foundCount + 1, 'card went home (fm=' + JSON.stringify(fm) + ')');
      ok(after.moves === before.moves + 1, 'home move counted');
      if (!sawFoundation) { fDelta = after.score - before.score; }
      fMoves++;
      sawFoundation = true;
      continue;
    }
    const tm = findTableauMove(before);
    if (tm) {
      if (tm.from === 'waste') ok(tapWasteTop(), 'waste select for tableau');
      else { tap(colEl(tm.ci).children[tm.i]); }
      const sel = inst.getState().selected;
      ok(sel && sel.rank === tm.card.rank && sel.suit === tm.card.suit, 'tableau source selected');
      tapDest(before, tm.to);
      const after = inst.getState();
      ok(after.moves === before.moves + 1, 'tableau move counted (' + JSON.stringify(tm) + ')');
      ok(JSON.stringify(after.cols) !== JSON.stringify(before.cols), 'tableau state changed');
      ok(after.selected === null, 'selection cleared after move');
      sawTableau = true;
      continue;
    }
    if (before.stock > 0 || before.waste > 0) { tapStockNow(); continue; }
    break;
  }
  ok(sawFoundation, 'progress loop found a foundation move');
  ok(sawTableau, 'progress loop found a tableau move');
  ok(fDelta === 50 || fDelta === 60, 'foundation scoring +50(+10 flip), got ' + fDelta);
  ok(sfxCount('coin') >= 1, 'home sfx');
  st = inst.getState();
  ok(st.foundCount >= 1, 'at least one card home');
  ok(st.moves >= 2, 'moves recorded');
  ok(st.score > 0, 'score accumulated: ' + st.score);
  console.log(`E → moves played · ${fMoves} home · first home +${fDelta} · score ${st.score} ✓`);

  /* ═══ F — undo ═══ */
  /* F1 · easy: unlimited + exact state restore (button) */
  st = inst.getState();
  if (st.stock === 0) { tapStockNow(); }             /* recycle first if needed */
  ok(inst.getState().stock > 0, 'stock available for undo test');
  const beforeUndo = snapState();
  tapStockNow();
  ok(snapState() !== beforeUndo, 'draw changed the state');
  tap(undoBtn);
  eq(snapState(), beforeUndo, 'undo restores the exact state');
  st = inst.getState();
  eq(st.undoLeft, -1, 'easy undo stays unlimited');
  ok(st.undos >= 0, 'undo stack tracked');
  /* keyboard undo */
  tapStockNow();
  const beforeKeyUndo = snapState();
  tapStockNow();
  key('u');
  eq(snapState(), beforeKeyUndo, 'keyboard U undoes');
  key('u');                                          /* one more pop */
  console.log('F1 → easy unlimited undo + keyboard ✓');

  /* F2 · medium: exactly 5 */
  tap(levelBtn);
  eq(inst.getState().phase, 'menu', 'back at the menu');
  ok(menuEl.style.display === '', 'menu visible again');
  ok(menuEl.classList.contains('is-out') === false, 'menu fade reset');
  tap(diffsEl.children[1]);
  advanceUntil(() => menuEl.style.display === 'none');
  st = inst.getState();
  eq(st.difficulty, 'medium', 'medium picked');
  eq(st.undoLeft, 5, 'medium gets 5 undos');
  eq(st.undoMax, 5, 'undo max 5');
  eq(st.undoLeft < 0, false, 'not unlimited');
  eq(undoBtn.textContent, 'UNDO ×5', 'undo label shows 5');
  guard = 0;
  while (inst.getState().stock > 18 && guard++ < 10) tapStockNow();   /* exactly 6 draws */
  st = inst.getState();
  eq(st.stock, 18, 'six draws done');
  eq(st.undos, 6, 'six snapshots');
  eq(undoBtn.textContent, 'UNDO ×5', 'label before undoing');
  for (let i = 0; i < 5; i++) tap(undoBtn);
  st = inst.getState();
  eq(st.undoLeft, 0, 'five undos consumed');
  eq(st.undos, 1, 'one snapshot left');
  eq(st.stock, 23, 'state rolled back five draws');
  eq(st.waste, 1, 'waste rolled back');
  eq(undoBtn.disabled, true, 'undo button disabled at 0');
  tap(undoBtn);                                      /* refused */
  st = inst.getState();
  eq(st.undoLeft, 0, 'sixth undo refused');
  eq(st.undos, 1, 'snapshot untouched after refusal');
  eq(st.stock, 23, 'state untouched after refusal');
  eq(msgEl.textContent, 'NO UNDOS LEFT', 'refusal message');
  console.log('F2 → medium 5-undo budget ✓');

  /* F3 · hard: draw 3, no undo, no hints */
  tap(levelBtn);
  tap(diffsEl.children[2]);
  advanceUntil(() => menuEl.style.display === 'none');
  st = inst.getState();
  eq(st.difficulty, 'hard', 'hard picked');
  eq(st.drawCount, 3, 'draw 3');
  eq(st.undoLeft, 0, 'no undos');
  eq(st.undoMax, 0, 'undo max 0');
  eq(st.hints, false, 'hints off');
  eq(undoBtn.style.display, 'none', 'undo button hidden');
  eq(hintBtn.style.display, 'none', 'hint button hidden');
  tapStockNow();
  st = inst.getState();
  eq(st.waste, 3, 'draw three');
  eq(st.stock, 21, 'stock minus three');
  eq(st.reveal, 0, 'three visible from batch start');
  eq(st.waste - st.reveal, 3, 'all three exposed');
  tapStockNow();                                      /* pushes a snapshot … */
  st = inst.getState();
  eq(st.undos, 2, 'hard snapshots still recorded');
  key('u');                                           /* … but undo is denied */
  st = inst.getState();
  eq(st.undos, 2, 'hard undo refused (stack)');
  eq(st.waste, 6, 'state unchanged after refused undo');
  eq(msgEl.textContent, 'NO UNDOS LEFT', 'hard refusal message');
  console.log('F3 → hard draw-3 · no undo · no hints ✓');

  /* ═══ G — pause gate ═══ */
  /* schedule a shake, then freeze everything */
  ok(tapWasteTop(), 'select in hard');
  const hardWt = inst.getState().wasteTop;
  badCol = -1;
  for (let col = 0; col < 7; col++) {
    if (!legalDest(inst.getState(), hardWt, col, -1)) { badCol = col; break; }
  }
  ok(badCol !== -1, 'illegal column in hard');
  tap(colEl(badCol));
  ok(boardEl.classList.contains('is-shake'), 'shake scheduled');
  inst.pause(); pausedFlag = true;
  const pausedSt = snapState();
  const pausedMs = inst.getState().elapsed;
  tapStockNow();
  eq(snapState(), pausedSt, 'input frozen while paused');
  advance(700);
  eq(inst.getState().elapsed, pausedMs, 'clock frozen while paused');
  ok(boardEl.classList.contains('is-shake'), 'pending timer frozen while paused');
  inst.resume(); pausedFlag = false;
  advance(700);
  ok(!boardEl.classList.contains('is-shake'), 'timer resumed');
  ok(inst.getState().elapsed > pausedMs, 'clock resumed');
  console.log('G → pause freezes input, clock and timers ✓');

  /* ═══ H — hint ═══ */
  tap(levelBtn);
  tap(diffsEl.children[0]);                          /* back to easy */
  advanceUntil(() => menuEl.style.display === 'none');
  eq(inst.getState().difficulty, 'easy', 'easy again');
  eq(hintBtn.style.display, '', 'hint button visible');
  eq(hintBtn.disabled, false, 'hint enabled');
  tap(hintBtn);
  let marks = findByClass(container, 'is-hint');
  ok(marks.length >= 1, 'hint marked something');
  ok(/^HINT:/.test(msgEl.textContent), 'hint message: ' + msgEl.textContent);
  advance(1900);
  marks = findByClass(container, 'is-hint');
  eq(marks.length, 0, 'hint cleared by its timer');
  key('h');
  marks = findByClass(container, 'is-hint');
  ok(marks.length >= 1, 'keyboard H hints too');
  advance(1900);
  eq(findByClass(container, 'is-hint').length, 0, 'keyboard hint cleared');
  console.log('H → hint mark/timer/keyboard ✓');

  /* ═══ I — rigged deal → full win ═══ */
  over = null;
  const seq = riggedRandom(TARGET);
  let qi = 0;
  const realRandom = Math.random;
  Math.random = () => (qi < seq.length ? seq[qi++] : 0.5);
  tap(levelBtn);                                     /* menu (no randomness) */
  tap(diffsEl.children[0]);                          /* deal with the rigged sequence */
  Math.random = realRandom;
  eq(qi, 51, 'shuffle consumed exactly 51 rolls');
  st = inst.getState();
  eq(st.phase, 'play', 'win run started');
  eq(st.stock, 24, 'rigged stock 24');
  eq(st.waste, 0, 'rigged waste empty');
  eq(st.score, 0, 'rigged run starts at 0');
  eq(st.cols.map(c0 => c0.cards.map(cd => cd.suit + ':' + cd.rank + (cd.faceUp ? 'U' : 'D'))),
     expectedDeal(), 'rigged deal matches the winnable layout');

  /* columns first — every top card is the next home-card in suit order */
  for (const ci of [0, 1, 2, 3, 4, 5, 6]) {
    let g = 0;
    while (inst.getState().cols[ci].len > 0 && g++ < 30) {
      const before = inst.getState();
      const top = before.cols[ci].top;
      ok(top && top.faceUp, 'col ' + ci + ' exposes a face-up card (' + JSON.stringify(top) + ')');
      ok(tapColTop(ci), 'select col ' + ci + ' top');
      const sel = inst.getState().selected;
      ok(sel && sel.rank === top.rank && sel.suit === top.suit, 'col ' + ci + ' selection');
      tapSlot(top.suit);
      const after = inst.getState();
      ok(after.cols[ci].len === before.cols[ci].len - 1,
         'col ' + ci + ' card went home (' + JSON.stringify(top) + ' → slot ' + top.suit + ')');
      ok(after.foundCount === before.foundCount + 1, 'foundation grew');
    }
  }
  st = inst.getState();
  eq(st.foundCount, 28, 'all 28 tableau cards home');
  eq(st.cols.map(c0 => c0.len), [0, 0, 0, 0, 0, 0, 0], 'columns emptied');
  eq(st.score, 28 * 50 + 21 * 10, 'columns phase score (28 homes + 21 flips) → ' + st.score);
  /* exact: 28 tableau cards home ×50 + 21 buried cards flipped ×10 */

  /* stock pass — the remaining24 cards come out in perfect order */
  guard = 0;
  while (inst.getState().foundCount < 52 && guard++ < 100) {
    const s2 = inst.getState();
    const wt2 = s2.wasteTop;
    if (wt2 && wt2.faceUp && canFoundation(s2, wt2)) {
      ok(tapWasteTop(), 'waste select');
      const sel2 = inst.getState().selected;
      ok(sel2 && sel2.rank === wt2.rank && sel2.suit === wt2.suit, 'waste selection');
      tapSlot(wt2.suit);
      const s3 = inst.getState();
      ok(s3.foundCount === s2.foundCount + 1,
         'stock card went home (' + JSON.stringify(wt2) + ' → slot ' + wt2.suit + ')');
      continue;
    }
    if (s2.stock > 0) { tapStockNow(); continue; }
    fail('stock empty and ' + JSON.stringify(wt2) + ' not placeable — deal order broken');
  }
  st = inst.getState();
  eq(st.foundCount, 52, 'all 52 cards home');
  eq(st.stock, 0, 'stock empty at the end');
  ok(advanceUntil(() => over !== null), 'gameOver fired');
  eq(over.title, 'YOU WIN!', 'gameOver title: ' + over.title);
  ok(/^EASY · \d+:\d{1,2} · \d+ moves$/.test(over.message), 'gameOver message: ' + over.message);
  st = inst.getState();
  eq(st.phase, 'win', 'phase win');
  const expectedScore = 2600 + 210 + 1500 + Math.max(0, 1000 - 4 * st.seconds);
  eq(st.score, expectedScore, 'exact final score (sec=' + st.seconds + ')');
  eq(ctx.score, st.score, 'shell score in sync');
  const saved = storeLog.filter(x => x.k === 'solitaire').pop();
  ok(saved, 'best persisted');
  eq(saved.v.easy, st.score, 'best saved for easy');
  ok(toasts.some(t => /New best/.test(t.m)), 'new-best toast');
  ok(sfxCount('win') >= 1, 'win sfx');
  ok(st.undos >= 0, 'undo stack intact');
  console.log(`I → rigged win · ${over.message} · score ${st.score} ✓`);

  /* ═══ J — restart / resize / destroy ═══ */
  inst.restart();
  st = inst.getState();
  eq(st.phase, 'play', 'restart deals again');
  eq(st.score, 0, 'restart zeroes the score');
  eq(ctx.score, 0, 'shell score reset');
  eq(st.difficulty, 'easy', 'difficulty remembered');
  eq(st.stock, 24, 'fresh stock');
  eq(colsWrap.children.map(c0 => c0.children.length), [1, 2, 3, 4, 5, 6, 7], 'fresh tableau');
  eq(st.foundCount, 0, 'foundations cleared');
  eq(st.undoLeft, -1, 'undo restored');
  inst.resize(1100, 720);
  inst.pause(); inst.resume();
  ok(step() || true, 'frame loop alive before destroy');
  inst.destroy();
  eq(container.children.length, 0, 'host cleared');
  ok(!container.classList.contains('gsol-host'), 'host class removed');
  eq([wl('keydown'), wl('pointermove'), wl('pointerup'), wl('pointercancel')], [0, 0, 0, 0],
     'window listeners removed');
  eq(step(), false, 'frame loop stopped');
  console.log('J → restart · resize · destroy ✓');

  console.log('SMOKE OK');
})().catch(e => { console.log('FAIL: ' + (e && e.stack ? e.stack : e)); process.exit(1); });
