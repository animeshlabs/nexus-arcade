/* Headless smoke test for CHESS — the user's Cyber Chess engine, NEXUS edition.
   A — registration + their mode screen (CYBER CHESS, two mode buttons)
   B — Vs Friend boot: 64 squares / 32 pieces / 8+8 coords / turn chip / FEN
   C — selection hints (2 targets, cyan ring) + deselect on an enemy square
   D — 1.e4 through the real board click path (trail, pop, label flip)
   E — en passant: the phantom-pawn bug is fixed (their dead code)
   F — castling: king to g1 drags the rook to f1 (rook guard)
   G — promotion overlay → Queen lands on h8, material tracked
   H — Fool's mate → shell gameOver payload + pulsing check square
   I — restart / pause gates / NEW GAME reset
   J — MODE → menu → Vs AI: one reply, then silence
   K — pause blocks a pending AI reply, resume re-arms it
   L — destroy: listener removed, stale AI timer killed                                  */
const fs = require('fs');

let gameDef = null;
global.registerGame = d => { gameDef = d; };
global.Sfx = { played: [], play(n) { this.played.push(n); } };

Math.random = () => 0.5;                 // AI pick = middle of the best-move list

function fakeEl(extra = {}) {
  const listeners = {};
  const el = {
    _cls: '', style: {}, textContent: '', innerHTML: '', children: [], parentNode: null,
    dataset: {}, type: '', hidden: false,
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
    closest(sel) {
      const cls = sel.charAt(0) === '.' ? sel.slice(1) : null;
      let n = this;
      while (n) {
        if (cls && n.classList && n.classList.contains(cls)) return n;
        n = n.parentNode;
      }
      return null;
    },
  };
  return Object.assign(el, extra);
}

const container = fakeEl({ clientWidth: 900, clientHeight: 700 });
global.document = { createElement: () => fakeEl(), documentElement: {} };
global.window = {
  addEventListener() {}, removeEventListener() {},
};
global.requestAnimationFrame = () => 1;
global.cancelAnimationFrame = () => {};

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
const all = (root, cls) => {
  const out = [];
  (function walk(n) {
    for (const k of n.children || []) {
      if (typeof k.className === 'string' && k.className.split(' ').indexOf(cls) !== -1) out.push(k);
      walk(k);
    }
  })(root);
  return out;
};

/* ── load ── */
const src = fs.readFileSync(__dirname + '/../assets/js/games/chess.js', 'utf8');
eval(src);
if (!gameDef) fail('not registered');
ok(gameDef.id === 'chess', 'id: ' + gameDef.id);
ok(gameDef.genre === 'Board', 'genre: ' + gameDef.genre);
ok(Array.isArray(gameDef.controls) && gameDef.controls.length > 0, 'controls missing');
ok(typeof gameDef.description === 'string' && gameDef.description.length > 20, 'description missing');
console.log(`registered: ${gameDef.id} / ${gameDef.title} / genre=${gameDef.genre}`);

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

let inst = null;
let menuEl, gameEl, boardEl, headEl, chipEl, turnEl, badgeEl, promoEl, promoRowEl, trayEl;

function squares() { return boardEl.children; }
function sqEl(r, c) {
  return findEl(boardEl, e => e.dataset && e.dataset.row === r && e.dataset.col === c);
}
function click(r, c) {
  const el = sqEl(r, c);
  if (!el) fail(`square ${r},${c} missing`);
  boardEl._fire('click', { target: el });          // real path: target.closest('.gchess-sq')
}
function step(fr, fc, tr, tc) { click(fr, fc); click(tr, tc); }
function trayGlyphs(group) {
  return group.children.filter(c => c.classList.contains('gchess-tray__p')).length;
}
function pieceCount() {
  return squares().filter(sq => sq.children.some(c => typeof c.className === 'string' && c.className.indexOf('gchess-p') !== -1)).length;
}
const countCls = cls => squares().filter(sq => sq.classList.contains(cls)).length;
const cls = el => el.classList.contains('is-off');
const press = el => el._fire('click', {});

async function until(fn, ms = 8000, label = 'condition') {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (fn()) return;
    await sleep(30);
  }
  fail('timeout waiting for ' + label);
}

(async () => {
  /* ═══ A — their mode screen ═══ */
  inst = gameDef.create(ctx);
  ok(container.classList.contains('gchess-host'), 'host class missing');
  menuEl = find(container, 'gchess-menu');
  gameEl = find(container, 'gchess-game');
  ok(menuEl && gameEl, 'screens missing');
  ok(!cls(menuEl), 'menu hidden at boot');
  ok(cls(gameEl), 'game screen shown at boot');
  const logo = find(menuEl, 'gchess-logo');
  ok(logo && /CYBER/.test(logo.innerHTML) && /CHESS/.test(logo.innerHTML), 'logo: ' + (logo && logo.innerHTML));
  const modes = find(menuEl, 'gchess-modes');
  eq(modes.children.length, 2, 'mode buttons');
  const tagline = find(menuEl, 'gchess-tag');
  ok(tagline && /Tactical grid arena/.test(tagline.textContent), 'tagline: ' + (tagline && tagline.textContent));
  console.log('A → mode screen (CYBER·CHESS, 2 modes, tagline) ✓');

  /* ═══ B — Vs Friend boot ═══ */
  press(modes.children[0]);
  ok(cls(menuEl), 'menu still visible after picking a mode');
  ok(!cls(gameEl), 'game screen not shown');
  boardEl = find(container, 'gchess-board');
  headEl = find(container, 'gchess-head');
  chipEl = find(container, 'gchess-chip');
  turnEl = chipEl.children[1];
  badgeEl = find(container, 'gchess-badge');
  promoEl = find(container, 'gchess-promo');
  promoRowEl = find(promoEl, 'gchess-promo__row');
  trayEl = find(container, 'gchess-tray');
  ok(boardEl, 'board missing');
  eq(squares().length, 64, 'squares');
  eq(pieceCount(), 32, 'pieces at start');
  eq(squares().filter(sq => sq.children.some(c => c.classList && c.classList.contains('is-rank'))).length, 8, 'rank coords');
  eq(squares().filter(sq => sq.children.some(c => c.classList && c.classList.contains('is-file'))).length, 8, 'file coords');
  eq(badgeEl.textContent, 'Vs Friend', 'badge');
  eq(turnEl.textContent, 'White to move', 'turn label');
  eq(turnEl.dataset.side, 'w', 'turn side');
  ok(cls(promoEl), 'promotion overlay visible at start');
  let st = inst.getState();
  eq(st.fen, 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w', 'start FEN');
  eq(st.mode, 'friend', 'mode');
  eq(st.turn, 'w', 'turn');
  eq(st.gameOver, false, 'gameOver at start');
  eq(countCls('is-check'), 0, 'no check square at start');
  eq(countCls('is-last'), 0, 'no trail at start');
  ok(find(container, 'gchess-tray'), 'capture tray missing');
  console.log('B → board 64/32, coords 8/8, FEN + turn chip ✓');

  /* ═══ C — selection hints ═══ */
  click(6, 4);                                  // e2
  st = inst.getState();
  eq(st.selected, [6, 4], 'selected e2');
  eq(st.valid, [[5, 4], [4, 4]], 'e2 valid moves');
  eq(countCls('is-target'), 2, 'move hints');
  eq(countCls('is-hl'), 1, 'selection ring');
  eq(sqEl(6, 4).classList.contains('is-hl'), true, 'ring on e2');
  click(1, 3);                                  // d7 — enemy square → deselect
  st = inst.getState();
  eq(st.selected, null, 'deselected');
  eq(st.valid, [], 'valid cleared');
  eq(countCls('is-target'), 0, 'hints cleared');
  console.log('C → selection hints (2 targets) + deselect ✓');

  /* ═══ D — 1.e4 ═══ */
  step(6, 4, 4, 4);
  st = inst.getState();
  eq(st.turn, 'b', 'turn flipped');
  eq(st.board[4][4], { type: 'P', color: 'w' }, 'pawn on e4');
  eq(st.board[6][4], null, 'e2 vacated');
  eq(turnEl.textContent, 'Black to move', 'label after e4');
  eq(turnEl.dataset.side, 'b', 'side after e4');
  eq(countCls('is-last'), 2, 'trail squares');
  eq(countCls('is-pop'), 1, 'land pop');
  eq(st.lastMove, { piece: 'P', fromR: 6, fromC: 4, toR: 4, toC: 4 }, 'lastMove');
  ok(sfxLog.indexOf('tick') !== -1, 'select sfx missing');
  ok(sfxLog.indexOf('click') !== -1, 'move sfx missing');
  console.log('D → 1.e4 (trail 2, pop 1, label flipped, sfx) ✓');

  /* ═══ E — en passant (their dead-code bug, fixed) ═══ */
  inst.restart();
  step(6, 4, 4, 4);      // 1.e4
  step(1, 0, 2, 0);      // 1...a6
  step(4, 4, 3, 4);      // 2.e5
  step(1, 3, 3, 3);      // 2...d5
  click(3, 4);           // select e5
  st = inst.getState();
  ok(st.valid.some(m => m[0] === 2 && m[1] === 3), 'ep target missing: ' + JSON.stringify(st.valid));
  click(2, 3);           // 3.exd6 e.p.
  st = inst.getState();
  eq(st.board[3][3], null, 'ep victim still on the board (phantom pawn)');
  eq(st.board[2][3], { type: 'P', color: 'w' }, 'white pawn on d6');
  eq(st.board[3][4], null, 'e5 vacated');
  eq(st.turn, 'b', 'turn after ep');
  eq(st.captured.w, ['bP'], 'captured by white');
  eq(st.material.w, 1, 'white material');
  eq(ctx.score, 1, 'score = captured material');
  ok(sfxLog.indexOf('coin') !== -1, 'capture sfx missing');
  eq(trayGlyphs(trayEl.children[0]), 1, 'tray glyph');
  console.log('E → en passant removes the victim, score 1, tray 1 ✓');

  /* ═══ F — castling ═══ */
  inst.restart();
  step(6, 4, 4, 4);      // e4
  step(1, 0, 2, 0);      // a6
  step(7, 6, 5, 5);      // Nf3
  step(2, 0, 3, 0);      // a5
  step(7, 5, 6, 4);      // Be2
  step(3, 0, 4, 0);      // a4
  click(7, 4);           // select the king
  st = inst.getState();
  eq(st.valid, [[7, 5], [7, 6]], 'king valid moves (d1 still holds the queen)');
  ok(st.valid.some(m => m[0] === 7 && m[1] === 6), 'castling square missing');
  click(7, 6);           // O-O
  st = inst.getState();
  eq(st.board[7][6], { type: 'K', color: 'w' }, 'king on g1');
  eq(st.board[7][5], { type: 'R', color: 'w' }, 'rook on f1');
  eq(st.board[7][7], null, 'h1 vacated');
  eq(st.board[7][4], null, 'e1 vacated');
  eq(st.fen.split(' ')[0].split('/')[7], 'RNBQ1RK1', 'back-rank FEN');
  console.log('F → castling: king g1, rook f1 ✓');

  /* ═══ G — promotion ═══ */
  inst.restart();
  step(6, 7, 4, 7);      // h4
  step(1, 0, 2, 0);      // a6
  step(4, 7, 3, 7);      // h5
  step(2, 0, 3, 0);      // a5
  step(3, 7, 2, 7);      // h6
  step(3, 0, 4, 0);      // a4
  step(2, 7, 1, 6);      // hxg7
  step(4, 0, 5, 0);      // a3
  click(1, 6);           // select the pawn on g7
  st = inst.getState();
  ok(st.valid.some(m => m[0] === 0 && m[1] === 7), 'h8 capture missing: ' + JSON.stringify(st.valid));
  click(0, 7);           // gxh8 → promotion
  st = inst.getState();
  eq(st.pendingPromotion, true, 'promotion not pending');
  eq(cls(promoEl), false, 'promotion overlay hidden');
  eq(promoRowEl.children.length, 4, 'promotion choices');
  eq(promoRowEl.children[0].textContent, '\u2655', 'first choice is not a queen');  // ♕
  eq(st.board[1][6], { type: 'P', color: 'w' }, 'pawn moved before choosing');
  press(promoRowEl.children[0]);      // Queen
  st = inst.getState();
  eq(cls(promoEl), true, 'promotion overlay not closed');
  eq(st.board[0][7], { type: 'Q', color: 'w' }, 'queen on h8');
  eq(st.board[1][6], null, 'g7 vacated');
  eq(st.turn, 'b', 'turn after promotion');
  eq(st.material.w, 6, 'material after gxh8 (pawn + rook)');
  eq(ctx.score, 6, 'score after promotion');
  eq(st.captured.w, ['bP', 'bR'], 'captured list');
  console.log('G → promotion overlay → ♕ on h8, score 6 ✓');

  /* ═══ H — Fool's mate ═══ */
  inst.restart();
  over = null;
  step(6, 5, 5, 5);      // f3
  step(1, 4, 3, 4);      // e5
  step(6, 6, 4, 6);      // g4
  step(0, 3, 4, 7);      // Qh4#
  st = inst.getState();
  eq(st.gameOver, true, 'no checkmate detected');
  ok(over, 'shell gameOver never fired');
  eq(over.title, 'Checkmate!', 'gameOver title: ' + (over && over.title));
  eq(over.message, 'Black wins.', 'gameOver message: ' + (over && over.message));
  eq(turnEl.textContent, 'Checkmate!', 'turn chip at mate');
  eq(turnEl.classList.contains('in-check'), true, 'check flag lost at mate');
  eq(countCls('is-check'), 1, 'red check square');
  eq(sqEl(7, 4).classList.contains('is-check'), true, 'check square is not the king');
  click(6, 4); click(4, 4);       // input locked after the mate
  eq(inst.getState().turn, 'w', 'input leaked after mate');
  console.log(`H → ${over.title} | ${over.message} + pulsing check square ✓`);

  /* ═══ I — restart + pause gates ═══ */
  inst.restart();
  st = inst.getState();
  eq(st.gameOver, false, 'restart did not clear gameOver');
  eq(st.turn, 'w', 'restart turn');
  eq(pieceCount(), 32, 'restart pieces');
  eq(st.fen, 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w', 'restart FEN');
  eq(ctx.score, 0, 'restart score');
  eq(trayGlyphs(trayEl.children[0]), 0, 'tray not reset');
  eq(trayGlyphs(trayEl.children[1]), 0, 'tray not reset (black)');
  inst.pause();
  click(6, 4); click(4, 4);
  eq(inst.getState().selected, null, 'selection leaked through pause');
  eq(inst.getState().turn, 'w', 'move leaked through pause');
  inst.resume();
  step(6, 4, 4, 4);
  eq(inst.getState().turn, 'b', 'input dead after resume');
  console.log('I → restart clean + pause/resume gates ✓');

  /* ═══ J — MODE → menu → Vs AI ═══ */
  const actions = headEl.children[2];
  eq(actions.children[0].textContent, 'NEW GAME', 'NEW GAME button');
  eq(actions.children[1].textContent, 'MODE', 'MODE button');
  press(actions.children[1]);                    // MODE
  eq(cls(gameEl), true, 'game screen still visible');
  eq(cls(menuEl), false, 'menu not restored');
  eq(inst.getState().gameShown, false, 'gameShown flag');
  press(modes.children[1]);                      // Vs AI
  st = inst.getState();
  eq(st.mode, 'ai', 'mode after AI pick');
  eq(badgeEl.textContent, 'Vs AI', 'badge after AI pick');
  eq(st.gameShown, true, 'gameShown after AI pick');
  step(6, 4, 4, 4);                              // 1.e4
  eq(inst.getState().turn, 'b', 'turn before AI reply');
  await until(() => { const s = inst.getState(); return s.turn === 'w' && s.lastMove && s.lastMove.fromR < 4; },
    12000, 'the AI reply');
  const afterAI = inst.getState();
  ok(afterAI.lastMove.fromR < 4, 'reply is not Black\'s: ' + JSON.stringify(afterAI.lastMove));
  await sleep(800);                              // a second stray timer would show up here
  const settled = inst.getState();
  eq(settled.turn, 'w', 'AI replied twice or never settled');
  eq(turnEl.textContent, 'White to move', 'label after AI reply');
  eq(turnEl.dataset.side, 'w', 'side after AI reply');
  console.log('J → AI answered exactly once (depth-2 minimax) ✓');

  /* ═══ K — pause blocks a pending reply, resume re-arms it ═══ */
  step(6, 3, 4, 3);                              // 1.d4 (AI is now thinking)
  inst.pause();
  await sleep(600);                              // past the 300 ms think delay
  eq(inst.getState().turn, 'b', 'AI moved while paused');
  inst.resume();
  await until(() => inst.getState().turn === 'w', 12000, 'AI reply after resume');
  console.log('K → pause holds the engine, resume re-arms it ✓');

  /* ═══ L — NEW GAME resets inside the same mode ═══ */
  press(actions.children[0]);
  st = inst.getState();
  eq(st.mode, 'ai', 'NEW GAME changed the mode');
  eq(st.turn, 'w', 'NEW GAME turn');
  eq(pieceCount(), 32, 'NEW GAME pieces');
  eq(ctx.score, 0, 'NEW GAME score');
  console.log('L → NEW GAME resets in place ✓');

  /* ═══ M — destroy: listener + stale AI timer ═══ */
  const clicksBefore = boardEl._count('click');
  eq(clicksBefore, 1, 'board listeners: ' + clicksBefore + ' (bind once!)');
  step(6, 4, 4, 4);                              // AI pending
  inst.destroy();
  eq(container.children.length, 0, 'host not cleaned');
  eq(container.classList.contains('gchess-host'), false, 'host class not removed');
  eq(boardEl._count('click'), 0, 'board listener leaked');
  await sleep(700);
  eq(inst.getState().turn, 'b', 'stale AI timer fired after destroy');
  console.log('M → destroy cleans up and kills the pending engine ✓');

  console.log('SMOKE OK');
  process.exit(0);
})();
