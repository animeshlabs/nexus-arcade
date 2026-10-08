/* ═══════════════════════════════════════════════════════════
   SOLITAIRE — neon Klondike
   3 rulesets (draw 1/3 · undo · hints) · classic 52-card rules
   DOM cards — tap-to-move or drag (mobile first)
   ═══════════════════════════════════════════════════════════ */
registerGame({
  id: 'solitaire',
  title: 'Solitaire',
  genre: 'Cards',
  emoji: '🃏',
  colors: ['#ffd23c', '#00f0ff'],
  description: 'Classic Klondike under neon lights — send all 52 cards home. Three rulesets with undo, hints and endless deals.',
  controls: [
    { key: 'CLICK / TAP', label: 'Pick a card, then its destination' },
    { key: 'DRAG', label: 'Slide cards across the felt' },
    { key: 'H / U', label: 'Hint / Undo' },
  ],
  featured: true,

  create(ctx) {
    'use strict';

    /* ── constants ────────────────────────────────────── */
    const SUITS = ['♠', '♥', '♦', '♣'];
    const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const DIFFS = {
      easy:   { label: 'EASY',   tag: 'Draw 1 · unlimited undo · hints', draw: 1, undos: -1, hints: true,  mult: 1 },
      medium: { label: 'MEDIUM', tag: 'Draw 1 · 5 undo · hints',         draw: 1, undos: 5,  hints: true,  mult: 2 },
      hard:   { label: 'HARD',   tag: 'Draw 3 · no undo · no hints',     draw: 3, undos: 0,  hints: false, mult: 3 },
    };
    const UNDO_CAP = 200;

    /* ── state ────────────────────────────────────────── */
    const state = {
      phase: 'menu',            // menu | play | win
      difficulty: null,
      tableau: [[], [], [], [], [], [], []],
      foundations: [[], [], [], []],
      stock: [],
      waste: [],
      revealStart: 0,
      drawCount: 1,
      undoLeft: -1,
      undoStack: [],
      selected: null,           // { card, from }
      score: 0,
      moves: 0,
      elapsed: 0,               // ms of active play
    };

    let paused = false;
    let clock = 0;
    const timers = [];
    let lastFlipped = null;     // card that just turned face-up (anim)
    const hintEls = [];

    function blocked() { return paused || !!ctx.paused; }
    function sfx(name) { try { if (ctx.sfx) ctx.sfx(name); } catch (e) { /* audio off */ } }
    function addScore(n) { state.score += n; try { ctx.setScore(state.score); } catch (e) { /* shell gone */ } }
    function after(ms, fn) { timers.push({ due: clock + ms, fn: fn }); }
    function clearTimers() { timers.length = 0; }
    function tickTimers() {
      for (let i = timers.length - 1; i >= 0; i--) {
        if (clock >= timers[i].due) { const t = timers.splice(i, 1)[0]; t.fn(); }
      }
    }
    function el(tag, cls, txt) {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (txt != null) e.textContent = txt;
      return e;
    }
    function clearNode(node) { while (node.firstChild) node.removeChild(node.firstChild); }
    function isRed(s) { return s === 1 || s === 2; }
    function stop(e) { if (e && e.stopPropagation) e.stopPropagation(); }
    function fmt(ms) {
      const s = Math.floor(ms / 1000);
      return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    }
    function label(c) { return RANKS[c.rank] + SUITS[c.suit]; }
    function msg(t) { msgEl.textContent = t; }
    function shake() {
      board.classList.add('is-shake');
      after(420, function () { board.classList.remove('is-shake'); });
    }
    function dragEndedRecent() { return clock - dragEndedAt < 300; }

    /* ── persistence: best score per difficulty ───────── */
    function bests() {
      const base = { easy: 0, medium: 0, hard: 0 };
      try {
        if (typeof Store !== 'undefined' && Store.settings && Store.settings.solitaire) {
          const s = Store.settings.solitaire;
          base.easy = s.easy | 0; base.medium = s.medium | 0; base.hard = s.hard | 0;
        }
      } catch (e) { /* private mode */ }
      return base;
    }
    function saveBest(d, score) {
      if (!d) return;
      const b = bests();
      if (score > (b[d] || 0)) {
        b[d] = score;
        try { if (typeof Store !== 'undefined') Store.set('solitaire', b); } catch (e) { /* ignore */ }
        try { if (ctx.toast) ctx.toast('New best on ' + DIFFS[d].label + ': ' + score.toLocaleString() + '!', 'win'); } catch (e) { /* ignore */ }
      }
    }

    /* ══ DOM ═══════════════════════════════════════════ */
    const host = ctx.container;
    host.classList.add('gsol-host');

    /* HUD row */
    const hud = el('div', 'gsol-hud');
    function hudCell(labelTxt, gold) {
      const c = el('div', 'gsol-cell' + (gold ? ' is-gold' : ''));
      c.appendChild(el('span', null, labelTxt));
      const b = el('b');
      c.appendChild(b);
      hud.appendChild(c);
      return b;
    }
    const timeB = hudCell('TIME');
    const movesB = hudCell('MOVES');
    const undoB = hudCell('UNDO');
    const cardsB = hudCell('CARDS', true);

    /* board: top row + tableau */
    const board = el('div', 'gsol-board');
    const top = el('div', 'gsol-top');
    const stockEl = el('div', 'gsol-stock');
    stockEl.addEventListener('click', onStock);
    const wasteEl = el('div', 'gsol-waste');
    const foundsEl = el('div', 'gsol-founds');
    const foundEls = [];
    for (let i = 0; i < 4; i++) {
      const slot = el('div', 'gsol-found');
      slot.dataset.i = String(i);
      (function (fi) {
        slot.addEventListener('click', function (e) {
          stop(e);
          if (state.selected) tryMove({ type: 'foundation', index: fi });
        });
      })(i);
      foundsEl.appendChild(slot);
      foundEls.push(slot);
    }
    top.appendChild(stockEl); top.appendChild(wasteEl); top.appendChild(foundsEl);
    board.appendChild(top);

    const colsEl = el('div', 'gsol-cols');
    const colEls = [];
    for (let i = 0; i < 7; i++) {
      const col = el('div', 'gsol-col');
      col.dataset.i = String(i);
      (function (ci) {
        col.addEventListener('click', function (e) {
          stop(e);
          if (state.selected) tryMove({ type: 'tableau', index: ci });
        });
      })(i);
      colsEl.appendChild(col);
      colEls.push(col);
    }
    board.appendChild(colsEl);
    board.addEventListener('click', function (e) {          /* dead zone → deselect */
      stop(e);
      if (state.selected) { clearSelection(); sfx('click'); render(); }
    });

    /* action bar */
    const bar = el('div', 'gsol-bar');
    const msgEl = el('span', 'gsol-msg', 'PICK A DIFFICULTY');
    bar.appendChild(msgEl);
    function barBtn(text, cls) {
      const b = el('button', 'gsol-btn' + (cls ? ' ' + cls : ''), text);
      b.type = 'button';
      bar.appendChild(b);
      return b;
    }
    const hintBtn = barBtn('HINT');
    const undoBtn = barBtn('UNDO');
    const newBtn = barBtn('NEW');
    const levelBtn = barBtn('LEVEL', 'is-accent');
    hintBtn.addEventListener('click', function () { showHint(); });
    undoBtn.addEventListener('click', function () { undo(); });
    newBtn.addEventListener('click', function () {
      if (!state.difficulty) return;
      sfx('start');
      startRun();
    });
    levelBtn.addEventListener('click', function () {
      sfx('click');
      showMenu();
    });

    /* difficulty menu */
    const menu = el('div', 'gsol-menu');
    const menuIn = el('div', 'gsol-menu__in');
    menuIn.appendChild(el('div', 'gsol-logo', 'SOLITAIRE'));
    menuIn.appendChild(el('p', 'gsol-sub', 'Classic Klondike under neon lights — send all 52 cards home. Pick your ruleset.'));
    const diffs = el('div', 'gsol-diffs');
    const diffEls = {};
    Object.keys(DIFFS).forEach(function (k) {
      const b = el('button', 'gsol-diff');
      b.type = 'button';
      b.dataset.d = k;
      b.appendChild(el('b', null, DIFFS[k].label));
      b.appendChild(el('i', null, DIFFS[k].tag));
      const best = el('span', 'gsol-diff__best', 'NEW');
      b.appendChild(best);
      b.addEventListener('click', function () { pickDiff(k); });
      diffs.appendChild(b);
      diffEls[k] = best;
    });
    menuIn.appendChild(diffs);
    menuIn.appendChild(el('div', 'gsol-menu__foot', 'TIP: free the buried cards first — build long alternating runs.'));
    menu.appendChild(menuIn);

    host.appendChild(hud);
    host.appendChild(board);
    host.appendChild(bar);
    host.appendChild(menu);

    function refreshMenuBests() {
      const b = bests();
      Object.keys(DIFFS).forEach(function (k) {
        diffEls[k].textContent = b[k] > 0 ? 'BEST · ' + b[k].toLocaleString() : 'NEW';
      });
    }

    /* ══ rules ═════════════════════════════════════════ */
    function topOf(arr) { return arr.length ? arr[arr.length - 1] : null; }
    function colTop(ci) { return topOf(state.tableau[ci]); }
    function foundCount() { let n = 0; for (let i = 0; i < 4; i++) n += state.foundations[i].length; return n; }

    function canToFoundation(card, fi) {
      if (fi !== card.suit) return false;               /* slot i ↔ suit i */
      const pile = state.foundations[fi];
      if (!pile.length) return card.rank === 1;
      const t = pile[pile.length - 1];
      return t.suit === card.suit && t.rank === card.rank - 1;
    }
    function canToTableau(card, ci, fromCi) {
      if (fromCi === ci) return false;
      const col = state.tableau[ci];
      if (!col.length) return card.rank === 13;          /* kings run empty columns */
      const t = col[col.length - 1];
      return t.faceUp && isRed(t.suit) !== isRed(card.suit) && t.rank === card.rank + 1;
    }
    function cardsFor(card, from) {
      if (!card) return [];
      if (from.type === 'tableau') {
        const col = state.tableau[from.index];
        const i = col.indexOf(card);
        return i === -1 ? [] : col.slice(i);
      }
      return [card];                                     /* waste / foundation tops */
    }
    function removeFrom(from, cards) {
      if (from.type === 'tableau') {
        const col = state.tableau[from.index];
        const i = col.indexOf(cards[0]);
        if (i !== -1) col.splice(i, cards.length);
      } else if (from.type === 'waste') {
        state.waste.pop();
      } else if (from.type === 'foundation') {
        state.foundations[from.index].pop();
      }
    }
    function expose(col) {
      const t = topOf(col);
      if (t && !t.faceUp) {
        t.faceUp = true;
        lastFlipped = t;
        addScore(10 * DIFFS[state.difficulty || 'easy'].mult);
        return true;
      }
      return false;
    }

    /* ══ snapshots / undo ══════════════════════════════ */
    function pack(col) {
      const out = [];
      for (let i = 0; i < col.length; i++) out.push({ suit: col[i].suit, rank: col[i].rank, faceUp: col[i].faceUp });
      return out;
    }
    function unpack(arr) {
      const out = [];
      for (let i = 0; i < arr.length; i++) out.push({ suit: arr[i].suit, rank: arr[i].rank, faceUp: arr[i].faceUp });
      return out;
    }
    function snap() {
      return {
        t: state.tableau.map(pack),
        f: state.foundations.map(pack),
        st: pack(state.stock),
        w: pack(state.waste),
        rs: state.revealStart,
        sc: state.score,
        mv: state.moves,
      };
    }
    function restore(s) {
      state.tableau = s.t.map(unpack);
      state.foundations = s.f.map(unpack);
      state.stock = unpack(s.st);
      state.waste = unpack(s.w);
      state.revealStart = s.rs;
      state.score = s.sc;
      state.moves = s.mv;
      try { ctx.setScore(s.sc); } catch (e) { /* shell gone */ }
    }
    function pushUndo() {
      state.undoStack.push(snap());
      if (state.undoStack.length > UNDO_CAP) state.undoStack.shift();
    }
    function undo() {
      if (blocked() || state.phase !== 'play') return false;
      if (!state.undoStack.length) { msg('NOTHING TO UNDO'); sfx('hit'); return false; }
      if (state.undoLeft === 0) { msg('NO UNDOS LEFT'); sfx('hit'); return false; }
      const s = state.undoStack.pop();
      restore(s);
      if (state.undoLeft > 0) state.undoLeft--;
      clearSelection();
      clearHintEls();
      lastFlipped = null;
      sfx('toggle');
      msg('MOVE UNDONE');
      render(); updateHud(); updateBar();
      return true;
    }

    /* ══ selection + moves ═════════════════════════════ */
    function clearSelection() { state.selected = null; }
    function select(card, from) {
      state.selected = { card: card, from: from };
      sfx('click');
      msg(label(card) + ' SELECTED');
      render();
    }
    function reject() {
      clearSelection();
      shake();
      sfx('hit');
      msg('THAT MOVE DOES NOT WORK');
      render(); updateBar();
      return false;
    }

    function tryMove(to) {
      const sel = state.selected;
      if (!sel || blocked() || state.phase !== 'play') return false;
      const cards = cardsFor(sel.card, sel.from);
      if (!cards.length) { clearSelection(); render(); return false; }
      const from = sel.from;
      const head = cards[0];
      const mult = DIFFS[state.difficulty || 'easy'].mult;

      if (to.type === 'tableau' && from.type === 'tableau' && from.index === to.index) {
        clearSelection(); render(); return false;        /* quiet no-op */
      }
      if (to.type === 'foundation') {
        if (cards.length !== 1 || !canToFoundation(head, to.index)) return reject();
        if (from.type === 'foundation' && from.index === to.index) { clearSelection(); render(); return true; }
        pushUndo();
        removeFrom(from, cards);
        state.foundations[to.index].push(head);
        addScore(50 * mult);
        sfx('coin');
        msg('HOME: ' + label(head) + '  +' + (50 * mult));
      } else {
        if (!canToTableau(head, to.index, from.type === 'tableau' ? from.index : -1)) return reject();
        pushUndo();
        removeFrom(from, cards);
        const dest = state.tableau[to.index];
        for (let i = 0; i < cards.length; i++) dest.push(cards[i]);
        if (from.type === 'waste') { addScore(5 * mult); }
        sfx('tick');
        msg(cards.length > 1 ? 'MOVED ' + cards.length + ' CARDS' : 'MOVED ' + label(head));
      }

      clearSelection();
      state.moves++;
      if (from.type === 'tableau') expose(state.tableau[from.index]);
      render(); updateHud(); updateBar();
      checkWin();
      return true;
    }

    function onCardTap(card, from, e) {
      stop(e);
      if (dragEndedRecent()) return;
      if (blocked() || state.phase !== 'play') return;
      if (!card.faceUp) return;
      if (from.type === 'waste' && topOf(state.waste) !== card) return;

      if (!state.selected) { select(card, from); return; }
      const sel = state.selected;
      if (sel.card === card) {
        /* second tap on the same card → auto home if legal */
        if (from.type !== 'foundation') {
          const cards = cardsFor(sel.card, sel.from);
          if (cards.length === 1 && canToFoundation(card, card.suit)) {
            tryMove({ type: 'foundation', index: card.suit });
            return;
          }
        }
        clearSelection(); sfx('click'); render(); return;
      }
      if (from.type === 'tableau') {
        if (sel.from.type === 'tableau' && sel.from.index === from.index) { select(card, from); return; }
        tryMove({ type: 'tableau', index: from.index });
        return;
      }
      if (from.type === 'foundation') { tryMove({ type: 'foundation', index: from.index }); return; }
      if (from.type === 'waste') { select(card, from); return; }
    }

    /* ══ stock ═════════════════════════════════════════ */
    function onStock(e) {
      stop(e);
      if (dragEndedRecent()) return;
      if (blocked() || state.phase !== 'play') return;
      if (state.stock.length) {
        pushUndo();
        const n = Math.min(state.drawCount, state.stock.length);
        const chunk = state.stock.splice(state.stock.length - n);
        for (let i = 0; i < chunk.length; i++) chunk[i].faceUp = true;
        for (let i = 0; i < chunk.length; i++) state.waste.push(chunk[i]);
        state.revealStart = Math.max(0, state.waste.length - state.drawCount);
        state.moves++;
        clearSelection();
        sfx('click');
        msg(state.stock.length ? 'DREW ' + n + ' CARD' + (n > 1 ? 'S' : '') : 'STOCK EMPTY — TAP TO RESHUFFLE');
      } else if (state.waste.length) {
        pushUndo();
        /* flip the waste pile over: its top becomes the stock bottom, so
           reverse() keeps the next pass drawing the exact same sequence */
        state.stock = state.waste.slice().reverse();
        state.waste = [];
        for (let i = 0; i < state.stock.length; i++) state.stock[i].faceUp = false;
        state.revealStart = 0;
        state.moves++;
        clearSelection();
        sfx('toggle');
        msg('RESHUFFLED THE STOCK');
      } else {
        msg('NO CARDS LEFT TO DRAW');
        return;
      }
      render(); updateHud(); updateBar();
    }

    /* ══ hints ═════════════════════════════════════════ */
    function clearHintEls() {
      for (let i = 0; i < hintEls.length; i++) hintEls[i].classList.remove('is-hint');
      hintEls.length = 0;
    }
    function markHint(e) { if (e) { e.classList.add('is-hint'); hintEls.push(e); } }
    function findHint() {
      const wTop = topOf(state.waste);
      if (wTop && canToFoundation(wTop, wTop.suit)) return { card: wTop, to: { type: 'foundation', index: wTop.suit } };
      for (let c = 0; c < 7; c++) {
        const t = colTop(c);
        if (t && canToFoundation(t, t.suit)) return { card: t, to: { type: 'foundation', index: t.suit } };
      }
      if (wTop) {
        for (let c = 0; c < 7; c++) if (canToTableau(wTop, c, -1)) return { card: wTop, to: { type: 'tableau', index: c } };
      }
      for (let c = 0; c < 7; c++) {
        const col = state.tableau[c];
        for (let i = col.length - 1; i >= 0; i--) {
          if (!col[i].faceUp) break;
          for (let c2 = 0; c2 < 7; c2++) {
            if (c2 === c) continue;
            if (canToTableau(col[i], c2, c)) return { card: col[i], to: { type: 'tableau', index: c2 } };
          }
        }
      }
      if (state.stock.length) return { stock: true };
      return null;
    }
    function showHint() {
      if (blocked() || state.phase !== 'play') return;
      clearHintEls();
      const h = findHint();
      if (!h) {
        msg('NO MOVES — DRAW, UNDO OR DEAL AGAIN');
        sfx('hit');
        return;
      }
      if (h.stock) {
        markHint(stockEl);
        msg('HINT: DRAW A CARD');
      } else {
        markHint(h.card._el);
        if (h.to.type === 'tableau') {
          markHint(colEls[h.to.index]);
          msg('HINT: MOVE ' + label(h.card) + ' TO COLUMN ' + (h.to.index + 1));
        } else {
          markHint(foundEls[h.to.index]);
          msg('HINT: SEND ' + label(h.card) + ' HOME');
        }
      }
      sfx('tick');
      after(1600, clearHintEls);
    }

    /* ══ win ═══════════════════════════════════════════ */
    function checkWin() { if (foundCount() === 52) win(); }
    function win() {
      state.phase = 'win';
      clearSelection();
      clearHintEls();
      const sec = Math.floor(state.elapsed / 1000);
      const bonus = (1500 + Math.max(0, 1000 - sec * 4)) * DIFFS[state.difficulty].mult;
      addScore(bonus);
      sfx('win');
      msg('ALL 52 HOME — YOU WIN!  +' + bonus);
      saveBest(state.difficulty, state.score);
      updateHud(); updateBar();
      after(750, function () {
        try {
          ctx.gameOver({
            title: 'YOU WIN!',
            message: DIFFS[state.difficulty].label + ' · ' + fmt(state.elapsed) + ' · ' + state.moves + ' moves',
          });
        } catch (e) { /* shell gone */ }
      });
    }

    /* ══ render ════════════════════════════════════════ */
    function cardEl(card, from, afterCls, selRole) {
      const classes = ['gsol-card', card.faceUp ? 'gsol-up' : 'gsol-down', isRed(card.suit) ? 'is-red' : 'is-black'];
      if (afterCls) classes.push(afterCls);
      if (selRole) classes.push(selRole);
      const e = el('div', classes.join(' '));
      if (card.faceUp) {
        const tl = el('span', 'gsol-tl');
        tl.appendChild(el('b', null, RANKS[card.rank]));
        tl.appendChild(el('i', null, SUITS[card.suit]));
        const br = el('span', 'gsol-br');
        br.appendChild(el('b', null, RANKS[card.rank]));
        br.appendChild(el('i', null, SUITS[card.suit]));
        e.appendChild(tl);
        e.appendChild(br);
        if (from) {
          e.addEventListener('click', function (ev) { onCardTap(card, from, ev); });
          e.addEventListener('pointerdown', function (ev) { dragStart(ev, card, from); });
          card._el = e;
        }
      }
      return e;
    }

    function render() {
      /* tableau */
      for (let ci = 0; ci < 7; ci++) {
        const colEl = colEls[ci];
        clearNode(colEl);
        const col = state.tableau[ci];
        let selIdx = -1;
        const sel = state.selected;
        if (sel && sel.from.type === 'tableau' && sel.from.index === ci) selIdx = col.indexOf(sel.card);
        for (let i = 0; i < col.length; i++) {
          const c = col[i];
          const after = i === 0 ? null : (col[i - 1].faceUp ? 'is-after-up' : 'is-after-down');
          let role = null;
          if (i === selIdx) role = 'is-sel';
          else if (selIdx !== -1 && i > selIdx) role = 'is-sel-run';
          else if (sel && sel.card === c) role = 'is-sel';
          const extra = c === lastFlipped ? 'is-flip' : null;
          const e = cardEl(c, { type: 'tableau', index: ci }, after, role);
          if (extra) e.classList.add(extra);
          colEl.appendChild(e);
          c._el = e;
        }
      }

      /* foundations */
      for (let fi = 0; fi < 4; fi++) {
        const slot = foundEls[fi];
        clearNode(slot);
        const pile = state.foundations[fi];
        if (pile.length) {
          const c = pile[pile.length - 1];
          const sel = state.selected;
          const e = cardEl(c, { type: 'foundation', index: fi }, null, sel && sel.card === c ? 'is-sel' : null);
          slot.appendChild(e);
          c._el = e;
        } else {
          slot.appendChild(el('span', 'gsol-ph' + (isRed(fi) ? ' is-red' : ''), SUITS[fi]));
        }
      }

      /* stock */
      clearNode(stockEl);
      stockEl.classList.toggle('is-empty', state.stock.length === 0);
      if (state.stock.length) {
        stockEl.appendChild(el('div', 'gsol-card gsol-down'));
        const n = el('span', 'gsol-stock-n', String(state.stock.length));
        stockEl.appendChild(n);
      }

      /* waste */
      clearNode(wasteEl);
      const vis = state.waste.slice(state.revealStart);
      for (let i = 0; i < vis.length; i++) {
        const c = vis[i];
        const isTop = i === vis.length - 1;
        const sel = state.selected;
        const e = cardEl(c, isTop ? { type: 'waste' } : null, null, sel && sel.card === c ? 'is-sel' : null);
        if (vis.length > 1) e.style.left = (i * 15) + '%';
        if (!isTop) e.classList.add('is-under');
        wasteEl.appendChild(e);
        if (isTop) c._el = e;
      }

      lastFlipped = null;
    }

    function updateHud() {
      timeB.textContent = fmt(state.elapsed);
      movesB.textContent = String(state.moves);
      undoB.textContent = state.undoLeft < 0 ? '∞' : String(Math.max(0, state.undoLeft));
      cardsB.textContent = foundCount() + '/52';
    }
    function updateBar() {
      const d = DIFFS[state.difficulty || 'easy'];
      hintBtn.style.display = d.hints ? '' : 'none';
      undoBtn.style.display = d.undos === 0 ? 'none' : '';
      undoBtn.disabled = !state.undoStack.length || state.undoLeft === 0;
      undoBtn.textContent = 'UNDO' + (state.undoLeft > 0 ? ' ×' + state.undoLeft : '');
      hintBtn.disabled = state.phase !== 'play';
      newBtn.disabled = !state.difficulty;
    }

    /* ══ drag (pointer) ════════════════════════════════ */
    let drag = null;
    let dragEndedAt = -1e9;

    function dragStart(ev, card, from) {
      if (!ev || blocked() || state.phase !== 'play') return;
      if (ev.button !== undefined && ev.button !== 0) return;
      if (!card.faceUp) return;
      if (from.type === 'waste' && topOf(state.waste) !== card) return;
      drag = { card: card, from: from, x: ev.clientX || 0, y: ev.clientY || 0, touch: ev.pointerType === 'touch', active: false, offX: 0, offY: 0, ghost: null };
    }
    function activateDrag(d, x, y) {
      const cards = cardsFor(d.card, d.from);
      if (!cards.length) return false;
      const r = d.card._el && d.card._el.getBoundingClientRect ? d.card._el.getBoundingClientRect() : null;
      const w = r && r.width ? r.width : 64;
      const g = el('div', 'gsol-ghost');
      g.style.width = w + 'px';
      for (let i = 0; i < cards.length; i++) {
        const e = cardEl(cards[i], null, null, null);
        if (i > 0) e.style.marginTop = (-0.95 * w) + 'px';
        g.appendChild(e);
      }
      (document.body || host).appendChild(g);
      d.ghost = g;
      d.offX = x - (r ? r.left : x);
      d.offY = y - (r ? r.top : y);
      g.style.left = (x - d.offX) + 'px';
      g.style.top = (y - d.offY) + 'px';
      for (let i = 0; i < cards.length; i++) {
        if (cards[i]._el) cards[i]._el.classList.add('is-drag-src');
      }
      clearHintEls();
      d.active = true;
      sfx('click');
      return true;
    }
    function onPointerMove(ev) {
      if (!drag || !ev) return;
      const x = ev.clientX || 0, y = ev.clientY || 0;
      if (!drag.active) {
        const dx = Math.abs(x - drag.x), dy = Math.abs(y - drag.y);
        if (drag.touch) { if (dx < 12 || dx < dy) return; }      /* vertical = page scroll */
        else if (dx < 8 && dy < 8) return;
        if (!activateDrag(drag, x, y)) { drag = null; return; }
      }
      drag.ghost.style.left = (x - drag.offX) + 'px';
      drag.ghost.style.top = (y - drag.offY) + 'px';
    }
    function endDrag(ev) {
      if (!drag) return;
      const d = drag;
      drag = null;
      if (!d.active) return;                                 /* plain tap → click handles it */
      dragEndedAt = clock;
      if (d.ghost && d.ghost.parentNode) d.ghost.parentNode.removeChild(d.ghost);
      if (ev) dropAt(d, ev.clientX || 0, ev.clientY || 0);
      render();
    }
    function cancelDrag() {
      if (!drag) return;
      const d = drag;
      drag = null;
      if (d.ghost && d.ghost.parentNode) d.ghost.parentNode.removeChild(d.ghost);
      if (d.active) { dragEndedAt = clock; render(); }
    }
    function dropAt(d, x, y) {
      let n = document.elementFromPoint ? document.elementFromPoint(x, y) : null;
      let target = null;
      while (n) {
        const ci = colEls.indexOf(n);
        if (ci !== -1) { target = { type: 'tableau', index: ci }; break; }
        const fi = foundEls.indexOf(n);
        if (fi !== -1) { target = { type: 'foundation', index: fi }; break; }
        n = n.parentNode;
      }
      state.selected = { card: d.card, from: d.from };
      if (!target) {
        clearSelection();
        shake();
        sfx('hit');
        msg('DROP IT ON A PILE');
        return;
      }
      tryMove(target);
    }
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', cancelDrag);

    /* ══ keyboard ══════════════════════════════════════ */
    function onKey(e) {
      if (!e || !e.key) return;
      const k = String(e.key).toLowerCase();
      if (k === 'h') showHint();
      else if (k === 'u') undo();
    }
    window.addEventListener('keydown', onKey);

    /* ══ flow ══════════════════════════════════════════ */
    function showMenu() {
      state.phase = 'menu';
      clearTimers();
      clearSelection();
      clearHintEls();
      menu.style.display = '';
      menu.classList.remove('is-out');
      refreshMenuBests();
      msg('PICK A DIFFICULTY');
      render(); updateBar(); updateHud();
    }

    function deal() {
      const deck = createDeck();
      state.tableau = [[], [], [], [], [], [], []];
      state.foundations = [[], [], [], []];
      state.stock = [];
      state.waste = [];
      state.revealStart = 0;
      let idx = 0;
      for (let c = 0; c < 7; c++) {
        for (let i = 0; i <= c; i++) {
          const card = deck[idx++];
          card.faceUp = (i === c);
          state.tableau[c].push(card);
        }
      }
      while (idx < 52) state.stock.push(deck[idx++]);
    }
    function createDeck() {
      const deck = [];
      for (let s = 0; s < 4; s++) {
        for (let r = 1; r <= 13; r++) deck.push({ suit: s, rank: r, faceUp: false });
      }
      return shuffle(deck);
    }
    function shuffle(a) {
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = a[i]; a[i] = a[j]; a[j] = t;
      }
      return a;
    }

    function startRun() {
      const d = DIFFS[state.difficulty];
      deal();
      state.drawCount = d.draw;
      state.undoLeft = d.undos;
      state.undoStack = [];
      state.selected = null;
      state.score = 0;
      state.moves = 0;
      state.elapsed = 0;
      lastFlipped = null;
      state.phase = 'play';
      try { ctx.setScore(0); } catch (e) { /* shell gone */ }
      clearHintEls();
      msg('TAP A CARD, THEN ITS DESTINATION');
      render(); updateHud(); updateBar();
      sfx('start');
    }

    function pickDiff(d) {
      if (blocked()) return;
      state.difficulty = d;
      sfx('coin');
      menu.classList.add('is-out');
      after(260, function () { menu.style.display = 'none'; });
      startRun();
    }

    /* ══ frame loop ════════════════════════════════════ */
    let raf = 0, last = 0, alive = true, lastTimePaint = -1e9;
    function frame(ts) {
      if (!alive) return;
      const dt = last ? Math.min(80, ts - last) : 16;
      last = ts;
      if (!blocked()) {
        clock += dt;
        tickTimers();
        if (state.phase === 'play') state.elapsed += dt;
        if (clock - lastTimePaint > 250) {
          lastTimePaint = clock;
          if (state.phase !== 'menu') timeB.textContent = fmt(state.elapsed);
        }
      }
      raf = requestAnimationFrame(frame);
    }

    /* ══ boot ══════════════════════════════════════════ */
    deal();                       /* fresh layout behind the menu overlay */
    showMenu();
    raf = requestAnimationFrame(frame);

    /* ══ shell contract ════════════════════════════════ */
    return {
      pause() { paused = true; },
      resume() { paused = false; },
      restart() {
        clearTimers();
        clearHintEls();
        if (state.difficulty) startRun();
        else showMenu();
      },
      resize() { /* layout is pure CSS — nothing to recompute */ },
      destroy() {
        alive = false;
        cancelAnimationFrame(raf);
        clearTimers();
        window.removeEventListener('keydown', onKey);
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', endDrag);
        window.removeEventListener('pointercancel', cancelDrag);
        clearNode(host);
        host.classList.remove('gsol-host');
      },
      getState() {
        const sel = state.selected;
        return {
          phase: state.phase,
          difficulty: state.difficulty,
          drawCount: state.drawCount,
          score: state.score,
          moves: state.moves,
          elapsed: state.elapsed,
          seconds: Math.floor(state.elapsed / 1000),
          undoLeft: state.undoLeft,
          undoMax: DIFFS[state.difficulty || 'easy'].undos,
          undos: state.undoStack.length,
          hints: DIFFS[state.difficulty || 'easy'].hints,
          stock: state.stock.length,
          waste: state.waste.length,
          reveal: state.revealStart,
          wasteTop: topOf(state.waste) ? { suit: topOf(state.waste).suit, rank: topOf(state.waste).rank, faceUp: topOf(state.waste).faceUp } : null,
          found: state.foundations.map(function (p) { const t = topOf(p); return t ? { suit: t.suit, rank: t.rank } : null; }),
          foundCount: foundCount(),
          cols: state.tableau.map(function (col) {
            return {
              len: col.length,
              up: col.filter(function (c) { return c.faceUp; }).length,
              top: col.length ? { suit: col[col.length - 1].suit, rank: col[col.length - 1].rank, faceUp: col[col.length - 1].faceUp } : null,
              cards: pack(col),
            };
          }),
          selected: sel ? { suit: sel.card.suit, rank: sel.card.rank, from: sel.from.type, index: sel.from.index === undefined ? -1 : sel.from.index } : null,
          timers: timers.length,
        };
      },
    };
  },
});
