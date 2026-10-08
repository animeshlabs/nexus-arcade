/* Headless smoke test for Tetris (mocked DOM + 2D canvas).
   Math.random=0.5 → deterministic 7-bag.
   Bot: greedy placement from getState().board — minimise max stack
   height, then variance → clears rows until lines ≥ 12 (level 2),
   then dumb hard-drops at spawn until top-out → GAME OVER.
   Flow: menu (well + pad + tips static; pad ignored at menu) →
         PLAY → gravity → arrows/rotate/soft-drop/pad + hard drop
         (score/lines asserts) → pause freeze → greedy bot to 12
         lines & level 2 → top-out GAME OVER → restart fresh →
         resize math → destroy → 2nd instance                      */
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
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 640 }),
});
const container = fakeEl({ clientWidth: 800, clientHeight: 640 });

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
const src = fs.readFileSync(__dirname + '/../assets/js/games/tetris.js', 'utf8');
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
  container, width: 800, height: 640,
  setScore: n => scores.push(n),
  get score() { return scores.length ? scores[scores.length - 1] : 0; },
  gameOver: o => { over = o; },
  toast() {}, sfx() {},
};
const fail = m => { console.log('SMOKE FAIL:', m); process.exit(1); };
const key = code => window._fire('keydown', { code, preventDefault() {} });
const keyUp = code => window._fire('keyup', { code, preventDefault() {} });

/* el-tetris evaluator: 0.76·cleared − 0.51·aggH − 0.36·holes − 0.18·bump */
function rotCWsim(m) {
  const n = m.length;
  return m.map((row, y) => row.map((_, x) => m[n - 1 - x][y]));
}
function bestX(st, m) {
  const w = m[0].length;
  const board = st.board.map(r => r.split('').map(Number));
  const fitsSim = (x, y) => {
    for (let r = 0; r < m.length; r++) {
      for (let c = 0; c < w; c++) {
        if (!m[r][c]) continue;
        const cx = x + c, cy = y + r;
        if (cx < 0 || cx >= 10 || cy >= 20) return false;
        if (cy >= 0 && board[cy][cx]) return false;
      }
    }
    return true;
  };
  let best = null;
  for (let x = 0; x + w <= 10; x++) {
    if (!fitsSim(x, 0)) continue;
    let y = 0;
    while (fitsSim(x, y + 1)) y++;
    const nb = board.map(r => r.slice());
    for (let r = 0; r < m.length; r++) {
      for (let c = 0; c < w; c++) {
        if (m[r][c]) nb[y + r][x + c] = 1;
      }
    }
    /* clear full rows (keep order, pad top) */
    let cleared = 0;
    const kept = [];
    for (const row of nb) {
      if (row.every(v => v)) cleared++;
      else kept.push(row);
    }
    while (kept.length < 20) kept.unshift(new Array(10).fill(0));
    /* metrics */
    let agg = 0, bump = 0, holes = 0, prevH = -1;
    for (let c = 0; c < 10; c++) {
      let t = 0;
      while (t < 20 && !kept[t][c]) t++;
      const hgt = 20 - t;
      agg += hgt;
      if (prevH >= 0) bump += Math.abs(hgt - prevH);
      prevH = hgt;
      for (let r = t; r < 20; r++) if (!kept[r][c]) holes++;
    }
    const sc = 0.760666 * cleared - 0.510066 * agg - 0.713 * holes - 0.35 * bump;
    if (!best || sc > best.score) best = { x, score: sc };
  }
  return best;
}
function botPlan(st) {
  const cur = st.piece.m.map(r => r.split('').map(Number));
  const seen = new Set([cur.map(r => r.join('')).join('|')]);
  const rots = [{ m: cur, presses: 0 }];
  let mm = cur;
  for (let i = 1; i < 4; i++) {
    mm = rotCWsim(mm);
    const k = mm.map(r => r.join('')).join('|');
    if (!seen.has(k)) { seen.add(k); rots.push({ m: mm, presses: i }); }
  }
  let best = null;
  for (const rr of rots) {
    const b = bestX(st, rr.m);
    if (b && (!best || b.score > best.score)) best = { rot: rr.presses, x: b.x, score: b.score };
  }
  return best;
}

let inst = null;
(async () => {
  /* ═══ A — menu: well + tips + pad, all static ═══ */
  inst = gameDef.create(ctx);
  const menu = findEl(container, el => (el.className || '').includes('gtet-menu'));
  if (!menu) fail('no menu');
  const btn = findEl(container, el => el.className === 'gtet-play');
  if (!btn) fail('no PLAY button');
  const mTitle = menu.children[0] && menu.children[0].children[0];
  if (!mTitle || mTitle.textContent !== 'TETRIS') fail('title: ' + (mTitle && mTitle.textContent));
  const mHint = menu.children[0] && menu.children[0].children[1];
  if (!mHint || !/^Stack the/.test(mHint.textContent || '')) fail('hint: ' + (mHint && mHint.textContent));
  const tips = [];
  (function walk(n) {
    for (const k of n.children || []) {
      if ((k.className || '').includes('gtet-tips')) tips.push(...k.children.map(c => c.textContent));
      walk(k);
    }
  })(container);
  if (tips.length !== 3) fail('tips: ' + tips.join(','));
  const pad = findEl(container, el => (el.className || '').includes('gtet-pad'));
  if (!pad) fail('no touch pad');
  if (pad.children.length !== 5) fail('pad buttons: ' + pad.children.length);
  const bDrop = pad.children[4];
  if (!(bDrop.className || '').includes('gtet-b--drop')) fail('drop btn: ' + bDrop.className);
  if (!canvasMock.parentNode) fail('canvas not mounted');
  let st = inst.getState();
  if (st.phase !== 'menu' || st.piece !== null || st.score !== 0 || st.lines !== 0 || st.level !== 1)
    fail('init ' + JSON.stringify({ p: st.phase, piece: st.piece, s: st.score, l: st.lines, lv: st.level }));
  if (st.board.length !== 20 || st.board.some(r => r !== '0000000000'))
    fail('board not empty: ' + st.board.length);
  /* pad is inert while at menu */
  bDrop._fire('pointerdown', { preventDefault() {} });
  bDrop._fire('pointerup', {});
  if (inst.getState().phase !== 'menu' || inst.getState().score !== 0) fail('pad active at menu');
  frames(30);
  st = inst.getState();
  if (st.phase !== 'menu' || st.piece !== null) fail('menu moved');
  console.log('menu + well + tips (3) + pad (5) static ✓');

  /* ═══ B — PLAY → gravity ═══ */
  btn._fire('click', {});
  st = inst.getState();
  if (st.phase !== 'play') fail('PLAY: ' + st.phase);
  if (!menu.classList.contains('is-out')) fail('menu not dismissed');
  if (!Sfx.played.includes('start')) fail('start sfx');
  if (!st.piece || !st.next) fail('no piece/next: ' + JSON.stringify({ p: st.piece, n: st.next }));
  frames(55); /* 935ms > 800ms gravity */
  st = inst.getState();
  if (!st.piece || st.piece.y < 1) fail('gravity did not step: y=' + (st.piece && st.piece.y));
  console.log(`PLAY → piece ${st.piece.t} next ${st.next} gravity y=${st.piece.y} ✓`);

  /* ═══ C — keyboard + pad + hard drop ═══ */
  const x0 = st.piece.x;
  key('ArrowLeft');
  if (inst.getState().piece.x !== x0 - 1) fail('ArrowLeft: ' + inst.getState().piece.x + ' vs ' + (x0 - 1));
  key('ArrowRight');
  key('ArrowRight');
  if (inst.getState().piece.x !== x0 + 1) fail('ArrowRight net: ' + inst.getState().piece.x);
  key('ArrowUp');
  st = inst.getState();
  if (st.piece.rot !== 1) fail('rotate: rot=' + st.piece.rot);
  /* touch-pad button moves the piece */
  const bRight = pad.children[2];
  bRight._fire('pointerdown', { preventDefault() {} });
  bRight._fire('pointerup', {});
  if (inst.getState().piece.x !== x0 + 2) fail('pad right: ' + inst.getState().piece.x);
  /* soft drop */
  const yB = inst.getState().piece.y;
  key('ArrowDown');
  frames(25);
  const yA = inst.getState().piece.y;
  keyUp('ArrowDown');
  if (yA < yB + 3) fail('soft drop: ' + yB + ' → ' + yA);
  /* hard drop locks + spawns */
  const scoreBefore = inst.getState().score;
  key('Space');
  st = inst.getState();
  if (st.score < scoreBefore + 2) fail('hard drop score: ' + scoreBefore + ' → ' + st.score);
  if (st.score < 2) fail('score too low: ' + st.score);
  if (!st.piece || st.piece.y > 1) fail('no fresh piece after drop: ' + JSON.stringify(st.piece));
  if (!st.board.some(r => r !== '0000000000')) fail('board empty after lock');
  if (!Sfx.played.includes('hit')) fail('drop sfx');
  console.log(`keys + pad + hard drop → score ${st.score} ✓`);

  /* ═══ D — pause freeze ═══ */
  frames(55);
  const d1 = inst.getState();
  if (!d1.piece || d1.piece.y < 1) fail('pre-pause gravity y=' + (d1.piece && d1.piece.y));
  inst.pause();
  const snap = inst.getState();
  frames(40);
  const d2 = inst.getState();
  if (d2.score !== snap.score || d2.board.join() !== snap.board.join() ||
      JSON.stringify(d2.piece) !== JSON.stringify(snap.piece) || d2.lines !== snap.lines)
    fail('not frozen while paused');
  inst.resume();
  frames(55);
  const d3 = inst.getState();
  if (!d3.piece || d3.piece.y <= d2.piece.y) fail('no gravity after resume: ' + (d2.piece && d2.piece.y) + ' → ' + (d3.piece && d3.piece.y));
  console.log('pause freeze ✓');

  /* ═══ E — greedy bot clears 12 lines → level 2 ═══ */
  let guard = 0;
  while (true) {
    st = inst.getState();
    if (st.lines >= 12) break;
    if (++guard > 900) fail('bot stuck: ' + JSON.stringify({ lines: st.lines, level: st.level, phase: st.phase }));
    if (st.phase !== 'play') fail('bot ended early: ' + JSON.stringify({ phase: st.phase, lines: st.lines, over }));
    if (st.clearing) { frames(30); continue; }
    if (!st.piece) { frames(3); continue; }
    const plan = botPlan(st);
    if (!plan) { key('Space'); frames(3); continue; }
    for (let i = 0; i < plan.rot; i++) key('ArrowUp');
    let s2 = inst.getState();
    if (s2.phase !== 'play' || !s2.piece) { frames(3); continue; }
    const bx = bestX(s2, s2.piece.m.map(r => r.split('').map(Number)));
    const tx = bx ? bx.x : s2.piece.x;
    let dx = tx - s2.piece.x;
    for (let i = 0; i < Math.abs(dx); i++) key(dx < 0 ? 'ArrowLeft' : 'ArrowRight');
    const s3 = inst.getState();
    if (s3.piece && s3.piece.x !== tx) {
      dx = tx - s3.piece.x;
      for (let i = 0; i < Math.min(12, Math.abs(dx)); i++) key(dx < 0 ? 'ArrowLeft' : 'ArrowRight');
    }
    key('Space');
    frames(3);
  }
  st = inst.getState();
  const wantLevel = Math.floor(st.lines / 10) + 1;
  if (st.level !== wantLevel) fail('level ' + st.level + ' != ' + wantLevel + ' for ' + st.lines + ' lines');
  if (st.level < 2) fail('expected level 2, got ' + st.level);
  if (st.score < 100 * st.lines) fail('score ' + st.score + ' < 100*lines ' + (100 * st.lines));
  if (!(Sfx.played.includes('coin') || Sfx.played.includes('power'))) fail('clear sfx');
  if (st.board.length !== 20 || st.board.some(r => r.length !== 10)) fail('board corrupt');
  console.log(`bot cleared ${st.lines} lines in ${guard} drops | level ${st.level} | score ${st.score} ✓`);

  /* ═══ F — dumb hard-drops → top-out GAME OVER ═══ */
  over = null;
  guard = 0;
  while (inst.getState().phase !== 'over' && guard++ < 500) {
    key('Space');
    frames(4);
  }
  st = inst.getState();
  if (st.phase !== 'over') fail('never topped out: ' + JSON.stringify({ lines: st.lines, phase: st.phase }));
  if (!over || over.title !== 'GAME OVER') fail('over title: ' + (over && over.title));
  const wantMsg = `${st.lines} lines · level ${st.level} · ${st.score} pts`;
  if (over.message !== wantMsg) fail(`over message: "${over.message}" != "${wantMsg}"`);
  if (!st.overCalled) fail('overCalled not set');
  if (!Sfx.played.includes('lose')) fail('lose sfx');
  console.log(`top-out after ${guard} drops | ${over.message} | score ${st.score} ✓`);

  /* ═══ G — restart → fresh well ═══ */
  inst.restart();
  st = inst.getState();
  if (st.phase !== 'play' || st.score !== 0 || st.lines !== 0 || st.level !== 1)
    fail('restart state: ' + JSON.stringify({ p: st.phase, s: st.score, l: st.lines, lv: st.level }));
  if (st.board.some(r => r !== '0000000000')) fail('board not cleared on restart');
  if (!st.piece || !st.next) fail('no piece after restart');
  if (ctx.score !== 0) fail('ctx score not reset');
  if (!menu.classList.contains('is-out')) fail('menu resurfaced');
  console.log('restart → fresh well ✓');

  /* ═══ H — resize math ═══ */
  inst.resize(500, 760);
  frames(5);
  st = inst.getState();
  if (st.W !== 500 || st.H !== 760) fail('resize dims ' + st.W + 'x' + st.H);
  if (st.cell !== 34) fail('cell ' + st.cell + ' != 34');
  const right = st.fieldX + 10 * st.cell + 8 + 4 * st.cell;
  if (right > 500) fail('layout overflows width: right=' + right);
  if (st.fieldY + 20 * st.cell > 760) fail('layout overflows height: ' + (st.fieldY + 20 * st.cell));
  if (st.board.length !== 20) fail('board lost on resize');
  console.log(`resize 500x760 → cell ${st.cell}, right ${right} ✓`);

  /* ═══ I — destroy ═══ */
  inst.destroy();
  if (rafCb !== null) fail('raf not cancelled');
  if (container.children.length !== 0) fail('host not cleaned: ' + container.children.length);
  if (container.classList.contains('gtet-host')) fail('host class not removed');
  frames(10);
  console.log('destroy cleanup ✓');

  /* ═══ J — 2nd instance: PLAY starts ═══ */
  inst = gameDef.create(ctx);
  const menu2 = findEl(container, el => (el.className || '').includes('gtet-menu'));
  const btn2 = findEl(container, el => el.className === 'gtet-play');
  btn2._fire('click', {});
  if (inst.getState().phase !== 'play') fail('2nd instance PLAY failed');
  if (!menu2.classList.contains('is-out')) fail('2nd menu not dismissed');
  frames(20);
  inst.destroy();
  if (container.children.length !== 0) fail('second instance not cleaned');
  console.log('re-lifecycle ✓ | setScore calls:', scores.length);

  console.log('SMOKE OK');
  process.exit(0);
})();
