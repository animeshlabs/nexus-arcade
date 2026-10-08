/* ═══════════════════════════════════════════════════════
   2048 — faithful port of the user's clone logic
   move → combine → move → generate (spawn always, always a 2)
   · combineRow pairs flat i0..14 (their exact pass)
   · combineColumn pairs flat i0..11 (i, i+4)
   · lose = board full right after a spawn (their rule)
   · win  = a 2048 tile appears → input locks, "You WIN"
   Layout = their design: big 2048 title + score box,
   result line, 4×4 grid — restyled dark-neon for NEXUS.
   ═══════════════════════════════════════════════════════ */
registerGame({
  id: '2048',
  title: '2048',
  genre: 'Puzzle',
  emoji: '🔢',
  colors: ['#ffd94d', '#00f0ff'],
  description: 'Join the numbers and get to the 2048 tile — slide the grid, fuse equal numbers and chase the high score.',
  featured: true,
  controls: [
    { key: 'SWIPE', label: 'Flick to push every tile that way' },
    { key: 'ARROWS / WASD', label: 'Push tiles with the keyboard' },
    { key: 'MERGE', label: 'Equal tiles fuse — reach 2048 to win' },
  ],
  create(ctx) {
    'use strict';

    const host = ctx.container;
    host.classList.add('g2048-host');

    /* ══ state — their model: 16 raw values on a flat board ══ */
    const vals = new Array(16).fill(0);
    let score = 0, presses = 0;
    let phase = 'play';                  // play | ending | over
    let result = '';                     // 'You WIN' | 'You LOSE'
    let overT = 0;
    const END_DELAY = 1.15;              // beat to read the result line
    let paused = false, alive = true;

    /* ══ DOM — their layout: info (title · score) / result / grid ══ */
    const mk = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };

    const wrap = mk('div', 'g2048-wrap');

    const info = mk('div', 'g2048-info');
    const title = mk('h1', 'g2048-title');
    title.textContent = '2048';
    const box = mk('div', 'g2048-score');
    const boxLab = mk('div', 'g2048-score__t');
    boxLab.textContent = 'score';
    const boxVal = mk('span', 'g2048-score__v');
    boxVal.textContent = '0';
    box.appendChild(boxLab);
    box.appendChild(boxVal);
    info.appendChild(title);
    info.appendChild(box);

    const line = mk('span', 'g2048-result');
    const TAGLINE = 'Join the numbers and get to the <b>2048</b> tile!';

    const grid = mk('div', 'g2048-grid');
    const cells = [];
    for (let i = 0; i < 16; i++) {
      const c = mk('div', 'g2048-cell v0');
      grid.appendChild(c);
      cells.push(c);
    }

    wrap.appendChild(info);
    wrap.appendChild(line);
    wrap.appendChild(grid);
    host.appendChild(wrap);

    /* ══ their move pass — filter non-zeros, pad the gap ══ */
    let pmap = null;                     // records old→new flat positions (2nd move only)

    function slideH(i0, left) {
      const idx = [i0, i0 + 1, i0 + 2, i0 + 3];
      const keep = idx.filter(k => vals[k]);
      const saved = keep.map(k => vals[k]);           // snapshot — writes may clobber sources
      const pad = [0, 0, 0, 0].slice(0, 4 - keep.length);
      const out = left ? saved.concat(pad) : pad.concat(saved);
      for (let p = 0; p < 4; p++) vals[idx[p]] = out[p];
      if (pmap) keep.forEach((oldK, p) => { pmap[oldK] = idx[left ? p : p + 4 - keep.length]; });
    }
    function slideV(i0, up) {
      const idx = [i0, i0 + 4, i0 + 8, i0 + 12];
      const keep = idx.filter(k => vals[k]);
      const saved = keep.map(k => vals[k]);
      const pad = [0, 0, 0, 0].slice(0, 4 - keep.length);
      const out = up ? saved.concat(pad) : pad.concat(saved);
      for (let p = 0; p < 4; p++) vals[idx[p]] = out[p];
      if (pmap) keep.forEach((oldK, p) => { pmap[oldK] = idx[up ? p : p + 4 - keep.length]; });
    }
    const moveLeft = () => { for (let i = 0; i < 16; i += 4) slideH(i, true); };
    const moveRight = () => { for (let i = 0; i < 16; i += 4) slideH(i, false); };
    const moveUp = () => { for (let i = 0; i < 4; i++) slideV(i, true); };
    const moveDown = () => { for (let i = 0; i < 4; i++) slideV(i, false); };

    /* ══ their combine pass — flat loops, zero pairs included ══ */
    const spawns = [];
    const merged = [];

    function pairMerge(i, j, at) {
      const t = vals[i] + vals[j];
      vals[i] = t;
      vals[j] = 0;
      score += t;
      if (t > 0) {                        // 0+0 pairs are their harmless no-ops
        merged.push(at);
        boxVal.textContent = String(score);
        ctx.setScore(score);
        Sfx.play(t >= 64 ? 'coin' : 'click');
      }
    }

    function combineRow() {               // their for (i = 0; i < 15; i++)
      for (let i = 0; i < 15; i++) {
        if (vals[i] === vals[i + 1]) pairMerge(i, i + 1, i);
      }
      checkForWin();
    }
    function combineColumn() {            // their for (i = 0; i < 12; i++)
      for (let i = 0; i < 12; i++) {
        if (vals[i] === vals[i + 4]) pairMerge(i, i + 4, i);
      }
      checkForWin();
    }

    function checkForWin() {              // their checkForWin
      for (let i = 0; i < 16; i++) {
        if (vals[i] === 2048) { endGame('win'); return; }
      }
    }

    /* ══ their generate — always a 2, then their checkForGameOver ══
       Theirs rejection-samples all 16 cells with retry; picking
       uniformly from the empty list is the same distribution, minus
       the infinite-recursion hazard when the board is nearly full.  */
    function generate() {
      const e = [];
      for (let i = 0; i < 16; i++) if (!vals[i]) e.push(i);
      if (!e.length) { endGame('lose'); return; }      // defensive: theirs recurses forever
      const idx = e[Math.floor(Math.random() * e.length)];
      spawns.push(idx);
      vals[idx] = 2;
      for (let i = 0; i < 16; i++) if (!vals[i]) return;   // zeros remain → alive
      endGame('lose');                                  // zeros === 0 → their LOSE
    }

    function endGame(kind) {
      result = kind === 'win' ? 'You WIN' : 'You LOSE';
      line.textContent = result;
      line.classList.remove('is-win');
      line.classList.remove('is-lose');
      line.classList.add(kind === 'win' ? 'is-win' : 'is-lose');
      if (phase === 'play') {
        phase = 'ending';                 // locks input (their removeEventListener)
        overT = END_DELAY;
        Sfx.play(kind === 'win' ? 'power' : 'tick');
      }
      /* a later check in the same press only overwrites the text —
         exactly like their resultDisplay being reassigned */
    }

    /* ══ one keypress = their keyLeft/Right/Up/Down sequence ══ */
    function press(dir) {
      if (paused || phase !== 'play') return false;
      merged.length = 0;
      spawns.length = 0;

      if (dir === 'left') moveLeft();
      else if (dir === 'right') moveRight();
      else if (dir === 'up') moveUp();
      else moveDown();

      if (dir === 'left' || dir === 'right') combineRow();
      else combineColumn();

      pmap = new Array(16);
      for (let i = 0; i < 16; i++) pmap[i] = i;

      if (dir === 'left') moveLeft();
      else if (dir === 'right') moveRight();
      else if (dir === 'up') moveUp();
      else moveDown();

      /* merged targets may have shifted in the 2nd move → remap for the pop */
      if (pmap) for (let k = 0; k < merged.length; k++) merged[k] = pmap[merged[k]];
      pmap = null;

      generate();                         // theirs: ALWAYS, moved or not
      presses++;
      render();
      if (!merged.length) Sfx.play('tick');   // plain slide feedback
      return true;
    }

    /* ══ render — their addColours, applied on change instead of a 50ms timer ══ */
    function render() {
      for (let i = 0; i < 16; i++) {
        const v = vals[i];
        const s = String(v);
        let cls = 'g2048-cell ' + (v && v <= 2048 ? 'v' + v : v ? 'vX' : 'v0');
        if (v) {
          if (s.length >= 5) cls += ' d5';
          else if (s.length === 4) cls += ' d4';
          else if (s.length === 3) cls += ' d3';
        }
        const c = cells[i];
        const pop = v ? (spawns.indexOf(i) !== -1 ? ' is-new' : merged.indexOf(i) !== -1 ? ' is-mrg' : '') : '';
        if (pop) {
          c.className = cls;              // reset → reflow → re-add so pops replay
          void c.offsetWidth;
          c.className = cls + pop;
        } else {
          c.className = cls;
        }
        c.textContent = v ? s : '';
      }
    }

    function maxTile() {
      let m = 0;
      for (let i = 0; i < 16; i++) if (vals[i] > m) m = vals[i];
      return m;
    }

    /* ══ reset — their createBoard: 16 zeroes + generate ×2 ══ */
    function reset() {
      for (let i = 0; i < 16; i++) vals[i] = 0;
      score = 0;
      presses = 0;
      phase = 'play';
      result = '';
      overT = 0;
      spawns.length = 0;
      merged.length = 0;
      line.innerHTML = TAGLINE;
      line.classList.remove('is-win');
      line.classList.remove('is-lose');
      boxVal.textContent = '0';
      ctx.setScore(0);
      generate();
      generate();
      render();
    }

    /* ══ input ══ */
    const KEYMAP = {
      ArrowLeft: 'left', a: 'left', A: 'left',
      ArrowRight: 'right', d: 'right', D: 'right',
      ArrowUp: 'up', w: 'up', W: 'up',
      ArrowDown: 'down', s: 'down', S: 'down',
    };
    const onKey = e => {
      if (!e || e.repeat) return;         // one move per press (their keyup feel)
      const k = e.key;
      if (!k) return;
      if (k.indexOf('Arrow') === 0 && e.preventDefault) e.preventDefault();
      const dir = KEYMAP[k];
      if (dir) press(dir);
    };

    let pd = null;
    const onDown = e => { pd = { x: e.clientX || 0, y: e.clientY || 0 }; };
    const onUp = e => {
      if (!pd) return;
      const dx = (e.clientX || 0) - pd.x;
      const dy = (e.clientY || 0) - pd.y;
      pd = null;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
      if (e.cancelable && e.preventDefault) e.preventDefault();
      press(Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    };
    const onCancel = () => { pd = null; };

    window.addEventListener('keydown', onKey);
    host.addEventListener('pointerdown', onDown);
    host.addEventListener('pointerup', onUp);
    host.addEventListener('pointercancel', onCancel);

    /* ══ loop — only carries the end-of-run delay ══ */
    function update(dt) {
      if (phase === 'ending') {
        overT -= dt;
        if (overT <= 0) {
          phase = 'over';
          ctx.gameOver({
            title: result,
            message: score + ' pts · best tile ' + maxTile(),
          });
        }
      }
    }

    let raf = 0, last = 0;
    function loop(now) {
      if (!alive) return;
      raf = requestAnimationFrame(loop);
      if (!last) last = now;
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.05) dt = 0.05;
      if (!paused) update(dt);
    }

    /* ══ boot — their game starts instantly (no menu) ══ */
    reset();
    raf = requestAnimationFrame(loop);

    /* ══ lifecycle ══ */
    return {
      pause() { paused = true; },
      resume() { paused = false; last = 0; },
      restart() { reset(); },
      resize() {},                        // pure CSS layout
      getState() {
        return {
          phase,
          score,
          presses,
          result,
          max: maxTile(),
          grid: vals.slice(),
        };
      },
      destroy() {
        alive = false;
        cancelAnimationFrame(raf);
        window.removeEventListener('keydown', onKey);
        host.removeEventListener('pointerdown', onDown);
        host.removeEventListener('pointerup', onUp);
        host.removeEventListener('pointercancel', onCancel);
        if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
        host.classList.remove('g2048-host');
      },
    };
  },
});
