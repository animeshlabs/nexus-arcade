/* ═══════════════════════════════════════════════════════
   CHESS — port of the user's "Cyber Chess" build
   Engine by he-is-talha (rules · castling · en passant ·
   promotion · checkmate/stalemate · depth-2 alpha-beta AI)
   kept faithful; layout follows their mode screen + header,
   re-skinned for the NEXUS dark-neon theme.

   Three fixes over their copy:
   1. en passant — they overwrite lastMove *before* their
      victim-removal test, so the captured pawn survived
      (phantom pawn). We snapshot the previous move first.
   2. castling — require the rook to still be on the board.
   3. pawns attack their two diagonals even when empty, so a
      king can never step onto a pawn-attacked square.
   ═══════════════════════════════════════════════════════ */
registerGame({
  id: 'chess',
  title: 'Chess',
  genre: 'Board',
  emoji: '♟️',
  colors: ['#dbe9f6', '#00f0ff'],
  description:
    'The full royal game with glowing legal-move hints — castling, en passant, promotion and a minimax engine. Duel a friend hotseat or face the AI.',
  featured: true,
  controls: [
    { key: 'TAP', label: 'Pick a piece, then tap a glowing square' },
    { key: 'MODE', label: 'Swap between hotseat and the AI' },
    { key: 'NEW GAME', label: 'Reset the board in this mode' },
  ],
  create(ctx) {
    'use strict';

    const host = ctx.container;
    host.classList.add('gchess-host');

    /* ══ their tables ══ */
    const PIECES = {
      K: { w: '♔', b: '♚' },
      Q: { w: '♕', b: '♛' },
      R: { w: '♖', b: '♜' },
      B: { w: '♗', b: '♝' },
      N: { w: '♘', b: '♞' },
      P: { w: '♙', b: '♟' },
    };
    const PIECE_VALUES = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 0 };

    /* ══ state (their globals) ══ */
    let board = [];
    let turn = 'w';
    let selected = null;
    let validMoves = [];
    let mode = 'friend';
    let kingMoved = { w: false, b: false };
    let rookMoved = { w: [false, false], b: [false, false] };
    let lastMove = null;
    let pendingPromotion = null;
    let gameOver = false;
    let aiToken = 0;                  // bumped per game: kills stale AI timers
    let aiTimer = null;
    let gameShown = false;
    let paused = false;
    let alive = true;
    let popSq = null;                 // square that plays the "land" pop once
    const taken = { w: [], b: [] };   // w = pieces White has captured

    /* ══ dom helpers ══ */
    const mk = (tag, cls, txt) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (txt != null) e.textContent = txt;
      return e;
    };
    const clear = el => { while (el && el.firstChild) el.removeChild(el.firstChild); };
    const on = (el, ev, fn) => el.addEventListener(ev, fn);

    /* ═══════════ DOM — their two screens ═══════════ */
    const wrap = mk('div', 'gchess-wrap');

    /* — their mode screen — */
    const menu = mk('div', 'gchess-menu');
    const logo = mk('h1', 'gchess-logo');
    logo.innerHTML = 'CYBER<span>CHESS</span>';
    const tagline = mk('p', 'gchess-tag', 'Tactical grid arena');
    const modes = mk('div', 'gchess-modes');

    function modeBtn(id, glyph, title, sub, primary) {
      const b = mk('button', 'gchess-mode' + (primary ? ' is-primary' : ''));
      b.type = 'button';
      b.appendChild(mk('span', 'gchess-mode__g', glyph));
      const t = mk('span', 'gchess-mode__t');
      t.appendChild(mk('b', null, title));
      t.appendChild(mk('i', null, sub));
      b.appendChild(t);
      on(b, 'click', () => { if (alive) { ctx.sfx('click'); showGame(id); } });
      return b;
    }
    const btnFriend = modeBtn('friend', '♔', 'VS FRIEND', '2 players · hotseat', true);
    const btnAi = modeBtn('ai', '⚙', 'VS AI', 'minimax engine', false);
    modes.appendChild(btnFriend);
    modes.appendChild(btnAi);
    const credits = mk('p', 'gchess-credits', 'Original engine · he-is-talha');
    menu.appendChild(logo);
    menu.appendChild(tagline);
    menu.appendChild(modes);
    menu.appendChild(credits);

    /* — their game screen — */
    const game = mk('div', 'gchess-game');
    game.classList.add('is-off');

    const head = mk('div', 'gchess-head');
    const mark = mk('h2', 'gchess-mark', 'CHESS');
    const info = mk('div', 'gchess-info');
    const chip = mk('div', 'gchess-chip');
    chip.appendChild(mk('span', null, 'TURN'));
    const turnLabel = mk('b', null, 'White to move');
    chip.appendChild(turnLabel);
    const badge = mk('span', 'gchess-badge', 'Vs Friend');
    info.appendChild(chip);
    info.appendChild(badge);
    const actions = mk('div', 'gchess-actions');
    const newBtn = mk('button', 'gchess-btn', 'NEW GAME');
    const modeBtnEl = mk('button', 'gchess-btn is-ghost', 'MODE');
    newBtn.type = 'button';
    modeBtnEl.type = 'button';
    actions.appendChild(newBtn);
    actions.appendChild(modeBtnEl);
    head.appendChild(mark);
    head.appendChild(info);
    head.appendChild(actions);

    const stage = mk('main', 'gchess-stage');
    const boardEl = mk('div', 'gchess-board');
    stage.appendChild(boardEl);

    const promo = mk('div', 'gchess-promo');
    promo.classList.add('is-off');
    const promoP = mk('div', 'gchess-promo__p');
    promoP.appendChild(mk('p', null, 'Promote pawn to'));
    const promoRow = mk('div', 'gchess-promo__row');
    promoP.appendChild(promoRow);
    promo.appendChild(promoP);
    stage.appendChild(promo);

    const tray = mk('div', 'gchess-tray');
    const trayW = mk('div', 'gchess-tray__g is-w');
    const trayB = mk('div', 'gchess-tray__g is-b');
    tray.appendChild(trayW);
    tray.appendChild(trayB);

    game.appendChild(head);
    game.appendChild(stage);
    game.appendChild(tray);

    wrap.appendChild(menu);
    wrap.appendChild(game);
    host.appendChild(wrap);

    /* ═══════════ their rules engine ═══════════ */
    function initBoard() {
      board = [
        ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'].map(t => ({ type: t, color: 'b' })),
        Array(8).fill(null).map(() => ({ type: 'P', color: 'b' })),
        ...Array(4).fill(null).map(() => Array(8).fill(null)),
        Array(8).fill(null).map(() => ({ type: 'P', color: 'w' })),
        ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'].map(t => ({ type: t, color: 'w' })),
      ];
      turn = 'w';
      selected = null;
      validMoves = [];
      kingMoved = { w: false, b: false };
      rookMoved = { w: [false, false], b: [false, false] };
      lastMove = null;
      pendingPromotion = null;
      gameOver = false;
      popSq = null;
      taken.w.length = 0;
      taken.b.length = 0;
      promo.classList.add('is-off');
      aiToken++;
      clearAI();
    }

    const inBounds = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
    const getPiece = (r, c) => (inBounds(r, c) ? board[r][c] : null);

    function isSquareAttacked(r, c, byColor) {
      for (let ri = 0; ri < 8; ri++) {
        for (let ci = 0; ci < 8; ci++) {
          const p = getPiece(ri, ci);
          if (!p || p.color !== byColor) continue;
          if (getRawMoves(ri, ci, true).some(m => m[0] === r && m[1] === c)) return true;
        }
      }
      return false;
    }

    function getKingPos(color) {
      for (let r = 0; r < 8; r++)
        for (let c = 0; c < 8; c++) {
          const p = getPiece(r, c);
          if (p && p.type === 'K' && p.color === color) return [r, c];
        }
      return null;
    }

    function rookHome(r, c) {
      const p = getPiece(r, c);
      return !!(p && p.type === 'R');
    }

    function getRawMoves(r, c, forAttackOnly) {
      const piece = getPiece(r, c);
      if (!piece) return [];
      const { type, color } = piece;
      const moves = [];
      const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];
      const knightDirs = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];

      function add(r1, c1) {
        if (!inBounds(r1, c1)) return;
        const target = getPiece(r1, c1);
        if (!target || target.color !== color) moves.push([r1, c1]);
      }
      function slide(dr, dc) {
        let r1 = r + dr, c1 = c + dc;
        while (inBounds(r1, c1)) {
          const target = getPiece(r1, c1);
          if (!target) { moves.push([r1, c1]); r1 += dr; c1 += dc; continue; }
          if (target.color !== color) moves.push([r1, c1]);
          break;
        }
      }

      if (type === 'R') {
        slide(-1, 0); slide(1, 0); slide(0, -1); slide(0, 1);
      } else if (type === 'B') {
        slide(-1, -1); slide(-1, 1); slide(1, -1); slide(1, 1);
      } else if (type === 'Q') {
        dirs.forEach(([dr, dc]) => slide(dr, dc));
      } else if (type === 'N') {
        knightDirs.forEach(([dr, dc]) => add(r + dr, c + dc));
      } else if (type === 'K') {
        dirs.forEach(([dr, dc]) => add(r + dr, c + dc));
        if (!forAttackOnly) {
          /* their castling tests + FIX: the rook must still be home */
          const rook = (rr, cc) => {
            const p = getPiece(rr, cc);
            return p && p.type === 'R' && p.color === color;
          };
          if (color === 'w' && !kingMoved.w && !rookMoved.w[0] && rook(7, 0) &&
              !getPiece(7, 1) && !getPiece(7, 2) && !getPiece(7, 3) &&
              !isSquareAttacked(7, 4, 'b') && !isSquareAttacked(7, 3, 'b') && !isSquareAttacked(7, 2, 'b'))
            moves.push([7, 2]);
          if (color === 'w' && !kingMoved.w && !rookMoved.w[1] && rook(7, 7) &&
              !getPiece(7, 5) && !getPiece(7, 6) &&
              !isSquareAttacked(7, 4, 'b') && !isSquareAttacked(7, 5, 'b') && !isSquareAttacked(7, 6, 'b'))
            moves.push([7, 6]);
          if (color === 'b' && !kingMoved.b && !rookMoved.b[0] && rook(0, 0) &&
              !getPiece(0, 1) && !getPiece(0, 2) && !getPiece(0, 3) &&
              !isSquareAttacked(0, 4, 'w') && !isSquareAttacked(0, 3, 'w') && !isSquareAttacked(0, 2, 'w'))
            moves.push([0, 2]);
          if (color === 'b' && !kingMoved.b && !rookMoved.b[1] && rook(0, 7) &&
              !getPiece(0, 5) && !getPiece(0, 6) &&
              !isSquareAttacked(0, 4, 'w') && !isSquareAttacked(0, 5, 'w') && !isSquareAttacked(0, 6, 'w'))
            moves.push([0, 6]);
        }
      } else if (type === 'P') {
        const forward = color === 'w' ? -1 : 1;
        const startRow = color === 'w' ? 6 : 1;
        if (!forAttackOnly) {
          if (!getPiece(r + forward, c)) {
            moves.push([r + forward, c]);
            if (r === startRow && !getPiece(r + 2 * forward, c)) moves.push([r + 2 * forward, c]);
          }
        }
        [[r + forward, c - 1], [r + forward, c + 1]].forEach(([r1, c1]) => {
          if (!inBounds(r1, c1)) return;
          const target = getPiece(r1, c1);
          /* FIX: a pawn attacks both front diagonals even when empty —
             otherwise a king may step onto a pawn-controlled square. */
          if (forAttackOnly) { moves.push([r1, c1]); return; }
          if (target && target.color !== color) moves.push([r1, c1]);
          if (lastMove && lastMove.piece === 'P' && lastMove.fromC === lastMove.toC &&
              lastMove.toR === r && lastMove.fromR === r + 2 * forward && lastMove.toC === c1)
            moves.push([r1, c1]);   // en passant
        });
      }
      return moves;
    }

    function getLegalMoves(r, c) {
      const piece = getPiece(r, c);
      if (!piece || piece.color !== turn) return [];
      const raw = getRawMoves(r, c, false);
      const legal = [];
      const kr = piece.type === 'K' ? r : getKingPos(turn)[0];
      const kc = piece.type === 'K' ? r : getKingPos(turn)[1];

      for (const [toR, toC] of raw) {
        const captured = board[toR][toC];
        const fromPiece = board[r][c];
        board[toR][toC] = fromPiece;
        board[r][c] = null;

        let epRestore = null;
        if (piece.type === 'P' && lastMove && lastMove.piece === 'P' && lastMove.fromC === lastMove.toC &&
            lastMove.toR === r && lastMove.fromR === r + (turn === 'w' ? -2 : 2) && lastMove.toC === toC) {
          epRestore = [lastMove.toR, lastMove.toC];
          board[lastMove.toR][lastMove.toC] = null;
        }

        let castlingRook = null;
        if (piece.type === 'K' && Math.abs(toC - c) === 2) {
          const rookCol = toC === 2 ? 0 : 7;
          const newRookCol = toC === 2 ? 3 : 5;
          castlingRook = { from: [r, rookCol], to: [r, newRookCol], piece: board[r][rookCol] };
          board[r][newRookCol] = board[r][rookCol];
          board[r][rookCol] = null;
        }

        const kingR = piece.type === 'K' ? toR : kr;
        const kingC = piece.type === 'K' ? toC : kc;
        const inCheck = isSquareAttacked(kingR, kingC, turn === 'w' ? 'b' : 'w');

        board[r][c] = fromPiece;
        board[toR][toC] = captured;
        if (epRestore) board[epRestore[0]][epRestore[1]] = { type: 'P', color: turn === 'w' ? 'b' : 'w' };
        if (castlingRook) {
          board[castlingRook.from[0]][castlingRook.from[1]] = castlingRook.piece;
          board[castlingRook.to[0]][castlingRook.to[1]] = null;
        }

        if (!inCheck) legal.push([toR, toC]);
      }
      return legal;
    }

    function getAllMoves(color) {
      const moves = [];
      for (let r = 0; r < 8; r++)
        for (let c = 0; c < 8; c++) {
          const piece = getPiece(r, c);
          if (piece && piece.color === color) {
            getLegalMoves(r, c).forEach(([toR, toC]) => moves.push({ from: [r, c], to: [toR, toC] }));
          }
        }
      return moves;
    }

    function isCheck(color) {
      const k = getKingPos(color);
      return !!(k && isSquareAttacked(k[0], k[1], color === 'w' ? 'b' : 'w'));
    }
    const isCheckmate = color => isCheck(color) && getAllMoves(color).length === 0;
    const isStalemate = color => !isCheck(color) && getAllMoves(color).length === 0;

    function makeMove(fromR, fromC, toR, toC, promotionType) {
      const piece = board[fromR][fromC];
      if (!piece) return false;
      const legal = getLegalMoves(fromR, fromC);
      if (!legal.some(([r, c]) => r === toR && c === toC)) return false;

      /* FIX: snapshot the *previous* move — theirs overwrote it first,
         which made the en passant victim-removal test dead code. */
      const prev = lastMove;
      lastMove = { piece: piece.type, fromR, fromC, toR, toC };

      if (piece.type === 'K') {
        if (piece.color === 'w') kingMoved.w = true;
        else kingMoved.b = true;
        if (Math.abs(toC - fromC) === 2) {
          const rookCol = toC === 2 ? 0 : 7;
          const newRookCol = toC === 2 ? 3 : 5;
          /* FIX: only drag the rook if it is actually there */
          if (rookHome(fromR, rookCol) && board[fromR][rookCol].color === piece.color) {
            board[fromR][newRookCol] = board[fromR][rookCol];
            board[fromR][rookCol] = null;
          }
        }
      }
      if (piece.type === 'R') {
        if (piece.color === 'w') {
          if (fromC === 0) rookMoved.w[0] = true;
          if (fromC === 7) rookMoved.w[1] = true;
        } else {
          if (fromC === 0) rookMoved.b[0] = true;
          if (fromC === 7) rookMoved.b[1] = true;
        }
      }

      /* en passant: remove the pawn that actually just double-pushed */
      if (piece.type === 'P' && prev && prev.piece === 'P' && prev.fromC === prev.toC &&
          prev.toR === fromR && prev.fromR === fromR + (piece.color === 'w' ? -2 : 2) &&
          prev.toC === toC) {
        board[prev.toR][prev.toC] = null;
      }

      let promo = promotionType;
      if (piece.type === 'P' && (toR === 0 || toR === 7)) promo = promo || 'Q';
      board[toR][toC] = promo ? { type: promo, color: piece.color } : piece;
      board[fromR][fromC] = null;

      turn = turn === 'w' ? 'b' : 'w';
      return true;
    }

    const copyBoard = () => board.map(row => row.map(cell => (cell ? { ...cell } : null)));
    const copyFlags = () => ({
      kingMoved: { ...kingMoved },
      rookMoved: { w: [...rookMoved.w], b: [...rookMoved.b] },
    });
    function restoreBoard(b, flags, t, lm) {
      board = b.map(row => row.map(c => (c ? { ...c } : null)));
      kingMoved = flags.kingMoved;
      rookMoved = { w: [...flags.rookMoved.w], b: [...flags.rookMoved.b] };
      turn = t;
      lastMove = lm;
    }

    function evaluate() {
      let score = 0;
      for (let r = 0; r < 8; r++)
        for (let c = 0; c < 8; c++) {
          const p = getPiece(r, c);
          if (!p) continue;
          const v = PIECE_VALUES[p.type];
          score += p.color === 'w' ? v : -v;
        }
      return score;
    }

    function getBestMove(depth) {
      const moves = getAllMoves('b');
      if (moves.length === 0) return null;
      const b0 = copyBoard();
      const f0 = copyFlags();
      const t0 = turn;
      const lm0 = lastMove ? { ...lastMove } : null;

      let bestScore = -Infinity;
      let bestMove = moves[0];

      for (const move of moves) {
        makeMove(move.from[0], move.from[1], move.to[0], move.to[1]);
        const score = -minimax(depth - 1, -Infinity, Infinity, false);
        restoreBoard(b0, f0, t0, lm0);
        if (score > bestScore) { bestScore = score; bestMove = move; }
      }
      return bestMove;
    }

    function minimax(depth, alpha, beta, isMax) {
      if (depth === 0) return evaluate();
      const color = isMax ? 'b' : 'w';
      const moves = getAllMoves(color);
      if (moves.length === 0) {
        if (isCheck(color)) return isMax ? -10000 : 10000;
        return 0;
      }

      const b0 = copyBoard();
      const f0 = copyFlags();
      const t0 = turn;
      const lm0 = lastMove ? { ...lastMove } : null;

      if (isMax) {
        let maxEval = -Infinity;
        for (const move of moves) {
          makeMove(move.from[0], move.from[1], move.to[0], move.to[1]);
          const e = minimax(depth - 1, alpha, beta, false);
          restoreBoard(b0, f0, t0, lm0);
          maxEval = Math.max(maxEval, e);
          alpha = Math.max(alpha, e);
          if (beta <= alpha) break;
        }
        return maxEval;
      }
      let minEval = Infinity;
      for (const move of moves) {
        makeMove(move.from[0], move.from[1], move.to[0], move.to[1]);
        const e = minimax(depth - 1, alpha, beta, true);
        restoreBoard(b0, f0, t0, lm0);
        minEval = Math.min(minEval, e);
        beta = Math.min(beta, e);
        if (beta <= alpha) break;
      }
      return minEval;
    }

    /* ═══════════ render ═══════════ */
    function render() {
      clear(boardEl);
      const kingPos = getKingPos(turn);
      const inCheckKing = kingPos && isSquareAttacked(kingPos[0], kingPos[1], turn === 'w' ? 'b' : 'w');
      const pop = popSq;
      popSq = null;

      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const sq = mk('div', 'gchess-sq ' + ((r + c) % 2 === 0 ? 'is-light' : 'is-dark'));
          sq.dataset.row = r;
          sq.dataset.col = c;

          const piece = getPiece(r, c);
          if (piece) sq.appendChild(mk('span', 'gchess-p is-' + piece.color, PIECES[piece.type][piece.color]));

          const isTarget = validMoves.some(([a, b]) => a === r && b === c);
          if (selected && selected[0] === r && selected[1] === c) sq.classList.add('is-hl');
          if (isTarget) {
            sq.classList.add('is-target');
            if (piece) sq.classList.add('is-capture');
          }
          if (kingPos && r === kingPos[0] && c === kingPos[1] && inCheckKing) sq.classList.add('is-check');
          if (lastMove && ((r === lastMove.fromR && c === lastMove.fromC) ||
                           (r === lastMove.toR && c === lastMove.toC))) sq.classList.add('is-last');
          if (pop && r === pop[0] && c === pop[1]) sq.classList.add('is-pop');

          if (c === 0) sq.appendChild(mk('i', 'gchess-coord is-rank', String(8 - r)));
          if (r === 7) sq.appendChild(mk('i', 'gchess-coord is-file', 'abcdefgh'[c]));

          boardEl.appendChild(sq);
        }
      }
    }

    function updateTurnLabel() {
      turnLabel.dataset.side = turn;
      turnLabel.classList.toggle('in-check', !gameOver && isCheck(turn));
      if (gameOver) return;
      turnLabel.textContent = turn === 'w' ? 'White to move' : 'Black to move';
    }

    const materialOf = list => list.reduce((s, p) => s + PIECE_VALUES[p.type], 0);

    function renderTray() {
      const build = (el, list, side) => {
        clear(el);
        el.appendChild(mk('span', 'gchess-tray__lab', side === 'w' ? 'WHITE' : 'BLACK'));
        if (side === 'b') el.appendChild(mk('b', 'gchess-tray__n', '+' + materialOf(list)));
        list.forEach(p => el.appendChild(mk('span', 'gchess-tray__p', PIECES[p.type][p.color])));
        if (side === 'w') el.appendChild(mk('b', 'gchess-tray__n', '+' + materialOf(list)));
      };
      build(trayW, taken.w, 'w');
      build(trayB, taken.b, 'b');
    }

    const syncScore = () => { ctx.setScore(materialOf(taken.w)); renderTray(); };

    function fen() {
      const rows = [];
      for (let r = 0; r < 8; r++) {
        let s = '', empty = 0;
        for (let c = 0; c < 8; c++) {
          const p = board[r][c];
          if (!p) { empty++; continue; }
          if (empty) { s += empty; empty = 0; }
          s += p.color === 'w' ? p.type : p.type.toLowerCase();
        }
        if (empty) s += empty;
        rows.push(s);
      }
      return rows.join('/') + ' ' + turn;
    }

    /* ═══════════ moves through the click path ═══════════ */
    function captureAt(fr, fc, tr, tc) {
      const onTarget = board[tr][tc];
      if (onTarget) return onTarget;
      const moving = board[fr][fc];
      if (moving && moving.type === 'P' && tr !== fr && tc !== fc) {
        const victim = board[fr][tc];
        if (victim) return victim;          // en passant victim
      }
      return null;
    }

    function commitMove(fr, fc, tr, tc, promoType) {
      const mover = board[fr][fc] ? board[fr][fc].color : turn;
      const cap = captureAt(fr, fc, tr, tc);
      if (!makeMove(fr, fc, tr, tc, promoType)) return false;

      if (cap) { taken[mover].push(cap); ctx.sfx('coin'); }
      else ctx.sfx('click');

      selected = null;
      validMoves = [];
      popSq = [tr, tc];
      syncScore();
      render();
      updateTurnLabel();
      afterMove();
      return true;
    }

    function showPromotion(fromR, fromC, toR, toC) {
      pendingPromotion = { fromR, fromC, toR, toC };
      promo.classList.remove('is-off');
      const color = board[fromR][fromC].color;
      const options = ['Q', 'R', 'B', 'N'];
      clear(promoRow);
      ctx.sfx('power');
      options.forEach(type => {
        const btn = mk('button', 'gchess-promo__b is-' + color, PIECES[type][color]);
        btn.type = 'button';
        on(btn, 'click', () => {
          if (!alive || !pendingPromotion) return;
          const pp = pendingPromotion;
          pendingPromotion = null;
          promo.classList.add('is-off');
          commitMove(pp.fromR, pp.fromC, pp.toR, pp.toC, type);
        });
        promoRow.appendChild(btn);
      });
    }

    function endGame(title, message) {
      gameOver = true;
      selected = null;
      validMoves = [];
      turnLabel.textContent = title;       // keep the pulsing in-check dot
      if (title === 'Stalemate') ctx.sfx('tick');
      else if (mode === 'ai' && message === 'Black wins.') ctx.sfx('lose');
      else ctx.sfx('win');
      ctx.gameOver({ title, message });
    }

    function afterMove() {
      if (gameOver) return;
      if (isCheckmate('w')) { endGame('Checkmate!', 'Black wins.'); return; }
      if (isCheckmate('b')) { endGame('Checkmate!', 'White wins.'); return; }
      if (isStalemate(turn)) { endGame('Stalemate', 'Draw.'); return; }
      if (isCheck(turn)) {
        turnLabel.textContent = (turn === 'w' ? 'White' : 'Black') + ' is in check!';
        ctx.sfx('toggle');
      }
      if (mode === 'ai' && turn === 'b') {
        turnLabel.textContent = 'AI is thinking…';
        scheduleAI(300);
      }
    }

    /* ═══════════ their AI — depth 2, 300 ms think delay ═══════════ */
    const clearAI = () => { if (aiTimer) { clearTimeout(aiTimer); aiTimer = null; } };

    function scheduleAI(delay) {
      clearAI();
      if (!alive || paused || gameOver || !gameShown || mode !== 'ai' || turn !== 'b') return;
      const token = aiToken;
      aiTimer = setTimeout(() => {
        aiTimer = null;
        if (!alive || paused || token !== aiToken || gameOver || turn !== 'b' || !gameShown) return;
        const move = getBestMove(2);
        if (!move) return;
        const piece = board[move.from[0]][move.from[1]];
        const isPromo = piece && piece.type === 'P' && (move.to[0] === 0 || move.to[0] === 7);
        commitMove(move.from[0], move.from[1], move.to[0], move.to[1], isPromo ? 'Q' : undefined);
      }, delay);
    }

    /* ═══════════ input ═══════════ */
    function onSquareClick(r, c) {
      if (!alive || paused || gameOver || pendingPromotion || !gameShown) return;
      if (mode === 'ai' && turn === 'b') return;

      const piece = getPiece(r, c);
      if (selected) {
        const [sr, sc] = selected;
        if (validMoves.some(([tr, tc]) => tr === r && tc === c)) {
          const movingPiece = board[sr][sc];
          if (movingPiece && movingPiece.type === 'P' && (r === 0 || r === 7)) {
            showPromotion(sr, sc, r, c);   // theirs: show, clear selection, repaint
            selected = null;
            validMoves = [];
            render();
            return;
          }
          commitMove(sr, sc, r, c);
          return;
        }
        selected = null;
        validMoves = [];
      }
      if (piece && piece.color === turn) {
        selected = [r, c];
        validMoves = getLegalMoves(r, c);
        ctx.sfx('tick');
      }
      render();
    }

    /* bound ONCE — their bindBoard() re-ran on every mode pick */
    function onBoardClick(e) {
      const sq = e && e.target && e.target.closest ? e.target.closest('.gchess-sq') : null;
      if (!sq) return;
      const r = parseInt(sq.dataset.row, 10);
      const c = parseInt(sq.dataset.col, 10);
      if (isNaN(r) || isNaN(c)) return;
      onSquareClick(r, c);
    }
    on(boardEl, 'click', onBoardClick);

    /* ═══════════ screens ═══════════ */
    function showGame(m) {
      mode = m;
      gameShown = true;
      menu.classList.add('is-off');
      game.classList.remove('is-off');
      badge.textContent = m === 'ai' ? 'Vs AI' : 'Vs Friend';
      initBoard();
      render();
      updateTurnLabel();
      syncScore();
    }

    function showMenu() {
      gameShown = false;
      aiToken++;
      clearAI();
      pendingPromotion = null;
      promo.classList.add('is-off');
      game.classList.add('is-off');
      menu.classList.remove('is-off');
    }

    on(newBtn, 'click', () => { if (alive) { ctx.sfx('click'); if (gameShown) showGame(mode); } });
    on(modeBtnEl, 'click', () => { if (alive) { ctx.sfx('click'); showMenu(); } });

    /* ═══════════ lifecycle ═══════════ */
    return {
      pause() { paused = true; clearAI(); },
      resume() {
        paused = false;
        if (gameShown && !gameOver && mode === 'ai' && turn === 'b') {
          turnLabel.textContent = 'AI is thinking…';
          scheduleAI(300);
        }
      },
      restart() {
        if (!gameShown) return;            // sitting on the menu → stay there
        showGame(mode);
      },
      resize() {},                          // pure CSS layout
      getState() {
        return {
          mode,
          turn,
          gameOver,
          gameShown,
          selected: selected ? selected.slice() : null,
          valid: validMoves.map(m => m.slice()),
          check: !gameOver && isCheck(turn),
          fen: fen(),
          board: copyBoard(),
          lastMove: lastMove ? { ...lastMove } : null,
          pendingPromotion: !!pendingPromotion,
          captured: { w: taken.w.map(p => p.color + p.type), b: taken.b.map(p => p.color + p.type) },
          material: { w: materialOf(taken.w), b: materialOf(taken.b) },
        };
      },
      destroy() {
        alive = false;
        aiToken++;
        clearAI();
        boardEl.removeEventListener('click', onBoardClick);
        if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
        host.classList.remove('gchess-host');
      },
    };
  },
});