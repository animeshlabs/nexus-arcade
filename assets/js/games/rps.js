/* ═══════════════════════════════════════════════════════
   ROCK · PAPER · SCISSORS — neon duel
   Three throws, three lives, endless run.
   The bot starts pure random; from your 3rd throw it can
   read your habit — with rising probability (capped 50%)
   it throws whatever beats your most-used move. Bait it,
   break the pattern, bank rounds.
   Score = rounds won · streak resets on a loss · ties are
   free. Out of lives → shell game-over.
   ═══════════════════════════════════════════════════════ */
registerGame({
  id: 'rps',
  title: 'Rock Paper Scissors',
  genre: 'Arcade',
  emoji: '✊',
  colors: ['#ff4d6d', '#00f0ff'],
  description:
    'Rock, paper, scissors against a bot that studies your throws. Bank rounds, guard your three lives and build a monster streak.',
  featured: true,
  controls: [
    { key: 'TAP', label: 'Throw rock, paper or scissors' },
    { key: '1 · 2 · 3', label: 'Keyboard throws (R · P · S work too)' },
    { key: 'BOT READ', label: 'Rising % = it is onto your habit' },
  ],
  create(ctx) {
    'use strict';

    const host = ctx.container;
    host.classList.add('grps-host');

    const NAMES = ['ROCK', 'PAPER', 'SCISSORS'];
    const HANDS = ['✊', '✋', '✌️'];
    const KEYMAP = { '1': 0, '2': 1, '3': 2, r: 0, R: 0, p: 1, P: 1, s: 2, S: 2 };
    const REVEAL = 0.62;              // shuffling beat
    const RESULT = 1.15;              // read-the-outcome beat

    /* ══ state ══ */
    let score = 0, lives = 3, streak = 0, bestStreak = 0, rounds = 0;
    let phase = 'pick';               // pick | reveal | result | over
    let timer = 0;
    let you = -1, cpu = -1, outcome = '';
    const history = [];               // your throws, oldest first
    const freq = [0, 0, 0];           // how often you throw each move
    let paused = false, alive = true;

    /* ══ dom helpers ══ */
    const mk = (tag, cls, txt) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (txt != null) e.textContent = txt;
      return e;
    };
    const clear = el => { while (el && el.firstChild) el.removeChild(el.firstChild); };
    const on = (el, ev, fn) => el.addEventListener(ev, fn);

    const wrap = mk('div', 'grps-wrap');

    /* ── top HUD ── */
    function stat(label, mod) {
      const s = mk('div', 'grps-stat' + (mod ? ' ' + mod : ''));
      s.appendChild(mk('span', null, label));
      const b = mk('b', null, '0');
      s.appendChild(b);
      return { el: s, val: b };
    }
    const sScore = stat('SCORE');
    const sStreak = stat('STREAK', 'is-streak');
    const sLives = stat('LIVES', 'is-lives');
    clear(sLives.val);
    const lifeEls = [0, 1, 2].map(() => {
      const i = mk('i', 'grps-life');
      sLives.val.appendChild(i);
      return i;
    });

    const read = mk('div', 'grps-read');
    read.appendChild(mk('span', null, 'BOT READ'));
    const readTrack = mk('i', 'grps-read__track');
    const readBar = mk('i', 'grps-read__bar');
    readTrack.appendChild(readBar);
    read.appendChild(readTrack);
    const readPct = mk('b', 'grps-read__pct', '12%');
    read.appendChild(readPct);

    const top = mk('div', 'grps-top');
    top.appendChild(sScore.el);
    top.appendChild(sStreak.el);
    top.appendChild(sLives.el);
    top.appendChild(read);

    /* ── arena ── */
    function side(mod, name) {
      const s = mk('div', 'grps-side ' + mod);
      const h = mk('div', 'grps-hand', '?');
      s.appendChild(h);
      s.appendChild(mk('div', 'grps-name', name));
      return { el: s, hand: h };
    }
    const youSide = side('is-you', 'YOU');
    const cpuSide = side('is-cpu', 'BOT');
    const mid = mk('div', 'grps-mid');
    mid.appendChild(mk('div', 'grps-vs', 'VS'));
    const out = mk('div', 'grps-out');
    mid.appendChild(out);
    const arena = mk('div', 'grps-arena');
    arena.appendChild(youSide.el);
    arena.appendChild(mid);
    arena.appendChild(cpuSide.el);

    const msg = mk('div', 'grps-msg', 'Pick your move');

    /* ── controls ── */
    const ctrl = mk('div', 'grps-ctrl');
    const moveBtns = [0, 1, 2].map(i => {
      const btn = mk('button', 'grps-move');
      btn.type = 'button';
      btn.appendChild(mk('i', null, String(i + 1)));
      btn.appendChild(mk('b', null, HANDS[i]));
      btn.appendChild(mk('span', null, NAMES[i]));
      on(btn, 'click', () => throwMove(i));
      ctrl.appendChild(btn);
      return btn;
    });

    wrap.appendChild(top);
    wrap.appendChild(arena);
    wrap.appendChild(msg);
    wrap.appendChild(ctrl);
    host.appendChild(wrap);

    /* ══ the bot ══ */
    const adapt = () => Math.min(0.5, 0.12 + score * 0.02);
    const readValue = () => Math.round(adapt() * 100);

    function botPick() {
      if (history.length >= 3 && Math.random() < adapt()) {
        let best = 0;
        if (freq[1] > freq[best]) best = 1;
        if (freq[2] > freq[best]) best = 2;
        return (best + 1) % 3;           // the throw that beats your habit
      }
      return Math.floor(Math.random() * 3);
    }

    /* ══ round flow ══ */
    function throwMove(m) {
      if (!alive || paused || phase !== 'pick') return;
      you = m;
      cpu = botPick();
      const d = (you - cpu + 3) % 3;
      outcome = d === 0 ? 'tie' : d === 1 ? 'win' : 'lose';
      history.push(m);
      freq[m]++;
      rounds++;
      phase = 'reveal';
      timer = REVEAL;
      ctx.sfx('click');
      render();
    }

    function settle() {
      if (outcome === 'win') {
        score++;
        streak++;
        if (streak > bestStreak) bestStreak = streak;
        ctx.setScore(score);
        ctx.sfx('coin');
        if (streak % 3 === 0) { ctx.toast('🔥 Streak ' + streak + '!', 'win'); ctx.sfx('power'); }
      } else if (outcome === 'lose') {
        lives--;
        streak = 0;
        ctx.sfx('hit');
      } else {
        ctx.sfx('tick');
      }
      phase = 'result';
      timer = RESULT;
      render();
    }

    function nextRound() {
      if (lives <= 0) {
        phase = 'over';
        render();
        ctx.gameOver({ title: 'OUT OF LIVES', message: rounds + ' rounds · best streak ' + bestStreak });
        return;
      }
      phase = 'pick';
      you = -1;
      cpu = -1;
      outcome = '';
      render();
    }

    /* ══ render ══ */
    function render() {
      sScore.val.textContent = String(score);
      sStreak.val.textContent = String(streak);
      sStreak.el.classList.toggle('is-hot', streak >= 3);
      for (let i = 0; i < 3; i++) {
        lifeEls[i].textContent = i < lives ? '♥' : '♡';
        lifeEls[i].classList.toggle('is-on', i < lives);
      }
      const pc = readValue();
      readBar.style.width = pc + '%';
      readPct.textContent = pc + '%';
      read.classList.toggle('is-hot', pc >= 50);

      youSide.hand.textContent = (phase === 'reveal' || you < 0) ? '?' : HANDS[you];
      cpuSide.hand.textContent = (phase === 'reveal' || cpu < 0) ? '?' : HANDS[cpu];

      const isRes = phase === 'result';
      arena.classList.toggle('is-reveal', phase === 'reveal');
      arena.classList.toggle('is-win', isRes && outcome === 'win');
      arena.classList.toggle('is-lose', isRes && outcome === 'lose');
      arena.classList.toggle('is-tie', isRes && outcome === 'tie');
      msg.classList.toggle('is-win', isRes && outcome === 'win');
      msg.classList.toggle('is-lose', isRes && outcome === 'lose');
      msg.classList.toggle('is-tie', isRes && outcome === 'tie');

      if (phase === 'pick') {
        out.textContent = '';
        msg.textContent = 'Pick your move';
      } else if (phase === 'reveal') {
        out.textContent = '···';
        msg.textContent = 'Throwing…';
      } else if (isRes) {
        out.textContent = outcome === 'win' ? 'YOU WIN' : outcome === 'lose' ? 'YOU LOSE' : 'TIE';
        if (outcome === 'tie') msg.textContent = NAMES[you] + ' vs ' + NAMES[cpu] + ' — draw';
        else if (outcome === 'win') msg.textContent = NAMES[you] + ' beats ' + NAMES[cpu];
        else msg.textContent = NAMES[cpu] + ' beats ' + NAMES[you];
      } else {
        out.textContent = '';
        msg.textContent = 'Run over';
      }

      const locked = phase !== 'pick';
      for (let i = 0; i < 3; i++) moveBtns[i].disabled = locked;
      ctrl.classList.toggle('is-lock', locked);
    }

    /* ══ loop ══ */
    function update(dt) {
      if (phase === 'reveal') {
        timer -= dt;
        if (timer <= 0) settle();
      } else if (phase === 'result') {
        timer -= dt;
        if (timer <= 0) nextRound();
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

    /* ══ input ══ */
    const onKey = e => {
      if (!e || e.repeat) return;
      const k = e.key;
      if (!k) return;
      const m = KEYMAP[k];
      if (m === undefined) return;
      if (e.preventDefault) e.preventDefault();
      throwMove(m);
    };
    window.addEventListener('keydown', onKey);

    function reset() {
      score = 0; lives = 3; streak = 0; bestStreak = 0; rounds = 0;
      phase = 'pick'; timer = 0;
      you = -1; cpu = -1; outcome = '';
      history.length = 0;
      freq[0] = 0; freq[1] = 0; freq[2] = 0;
      ctx.setScore(0);
      render();
    }

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
          score, lives, streak, bestStreak, rounds,
          phase, you, cpu, outcome,
          read: adapt(), history: history.slice(),
        };
      },
      destroy() {
        alive = false;
        cancelAnimationFrame(raf);
        window.removeEventListener('keydown', onKey);
        if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
        host.classList.remove('grps-host');
      },
    };
  },
});
