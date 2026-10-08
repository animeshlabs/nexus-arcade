/* ═══════════════════════════════════════════════════════
   SIMON SAYS — four neon tones, watch the glow, tap it back
   Every round adds one more step and the tempo climbs.
   One wrong pad ends the run.
   ═══════════════════════════════════════════════════════ */
registerGame({
  id: 'simon',
  title: 'Simon Says',
  genre: 'Puzzle',
  emoji: '🧠',
  colors: ['#00f0ff', '#ff2ecd'],
  description: 'The ring glows a neon sequence — tap it back in order. Each round adds another beat and the tempo climbs until you slip. One wrong pad ends the run.',
  featured: true,
  controls: [
    { key: 'TAP THE GLOW', label: 'Repeat the pattern' },
    { key: '1 · 2 · 3 · 4', label: 'Keyboard pads' },
    { key: 'SPACE', label: 'Start the run' },
  ],
  create(ctx) {
    'use strict';

    const host = ctx.container;
    host.classList.add('gsim-host');

    /* ── constants ─────────────────────────────────── */
    const TONES = ['jump', 'toggle', 'click', 'coin'];   // low → high
    const INTER = 0.95;                                  // "ROUND n" beat
    const GAP = 0.13;                                    // dark gap between steps
    const FLASH = 0.25;                                  // player press glow
    const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
    const stepOnOf = round => clamp(0.56 - (round - 1) * 0.025, 0.26, 0.56);
    const setCls = (el, c, on) => { if (on) el.classList.add(c); else el.classList.remove(c); };

    /* ── state ─────────────────────────────────────── */
    let phase = 'menu';                 // menu | inter | watch | input | over
    let paused = false, alive = true, overCalled = false;
    let seq = [], inputIdx = 0, score = 0;
    let tState = 0;                     // time in 'inter'
    let pbIdx = 0, pbT = 0;             // playback cursor
    let litPad = -1, toneFired = false;
    let badPad = -1;
    const flashT = [0, 0, 0, 0];
    let W = ctx.width || host.clientWidth || 900;
    let H = ctx.height || host.clientHeight || 640;

    /* ── DOM ───────────────────────────────────────── */
    const menu = document.createElement('div');
    menu.className = 'gsim-menu';
    const menuIn = document.createElement('div');
    menuIn.className = 'gsim-menu__in';
    const mTitle = document.createElement('h3');
    mTitle.textContent = 'SIMON SAYS';
    const mHint = document.createElement('p');
    mHint.textContent = 'The ring glows a sequence — tap every pad back in order. Each round adds a beat and the tempo climbs until you slip.';
    const btnPlay = document.createElement('button');
    btnPlay.className = 'gsim-play';
    btnPlay.textContent = '▶ PLAY';
    const tips = document.createElement('div');
    tips.className = 'gsim-tips';
    ['WATCH THE GLOW', 'TAP IT BACK', 'ONE MISTAKE = OUT'].forEach(t => {
      const s = document.createElement('span');
      s.textContent = t;
      tips.appendChild(s);
    });
    menuIn.appendChild(mTitle);
    menuIn.appendChild(mHint);
    menuIn.appendChild(btnPlay);
    menuIn.appendChild(tips);
    menu.appendChild(menuIn);
    host.appendChild(menu);

    const stage = document.createElement('div');
    stage.className = 'gsim-stage';
    const pads = [];
    for (let i = 0; i < 4; i++) {
      const p = document.createElement('button');
      p.className = 'gsim-pad gsim-p' + i;
      p.textContent = '';
      stage.appendChild(p);
      pads.push(p);
    }
    const hub = document.createElement('div');
    hub.className = 'gsim-hub';
    const hubRound = document.createElement('b');
    hubRound.className = 'gsim-round';
    hubRound.textContent = '?';
    const hubLabel = document.createElement('span');
    hubLabel.className = 'gsim-label';
    hubLabel.textContent = 'READY';
    hub.appendChild(hubRound);
    hub.appendChild(hubLabel);
    stage.appendChild(hub);
    host.appendChild(stage);

    /* ── run flow ──────────────────────────────────── */
    const pick = () => Math.floor(Math.random() * 4);

    function setPhase(p) {
      phase = p;
      tState = 0;
      if (p === 'watch') { pbIdx = 0; pbT = 0; litPad = -1; toneFired = false; }
      if (p === 'input') inputIdx = 0;
    }

    function startRun() {
      seq = [pick()];
      score = 0;
      inputIdx = 0;
      badPad = -1;
      overCalled = false;
      ctx.setScore(0);
      menu.classList.add('is-out');
      setPhase('inter');
      Sfx.play('start');
      paint();
    }

    function press(i) {
      if (phase !== 'input') return;                 // playback / inter / over ignore taps
      if (i === seq[inputIdx]) {
        flashT[i] = FLASH;
        Sfx.play(TONES[i]);
        score += 10;
        ctx.setScore(score);
        inputIdx++;
        if (inputIdx >= seq.length) {
          /* round cleared → grow the sequence */
          score += 50;
          ctx.setScore(score);
          Sfx.play('power');
          seq.push(pick());
          setPhase('inter');
        }
      } else {
        /* one wrong pad = out */
        overCalled = true;
        badPad = i;
        shakeT = 0.5;
        phase = 'over';
        Sfx.play('hit');
        Sfx.play('lose');
        ctx.gameOver({
          title: 'GAME OVER',
          message: `Round ${seq.length} · ${score} pts`,
        });
      }
      paint();
    }

    let shakeT = 0;

    /* ── input ─────────────────────────────────────── */
    pads.forEach((p, i) => {
      p.addEventListener('click', () => press(i));
      p.addEventListener('pointerenter', () => { if (phase === 'play' || phase === 'input') Sfx.play('hover'); });
    });
    btnPlay.addEventListener('click', () => { if (phase === 'menu') startRun(); });

    const onKeyD = e => {
      switch (e.code) {
        case 'Space': case 'Enter':
          if (e.preventDefault) e.preventDefault();
          if (phase === 'menu') startRun();
          return;
        case 'Digit1': case 'Numpad1': press(0); break;
        case 'Digit2': case 'Numpad2': press(1); break;
        case 'Digit3': case 'Numpad3': press(2); break;
        case 'Digit4': case 'Numpad4': press(3); break;
        default: return;
      }
      if (e.preventDefault) e.preventDefault();
    };
    window.addEventListener('keydown', onKeyD);

    /* ── resize (pure-DOM ring: CSS does the layout) ── */
    function resize(w, h) {
      W = Math.max(260, Math.round(w || host.clientWidth || W));
      H = Math.max(260, Math.round(h || host.clientHeight || H));
    }

    /* ── update ────────────────────────────────────── */
    function update(dt) {
      if (paused) return;
      if (shakeT > 0) shakeT = Math.max(0, shakeT - dt);
      for (let i = 0; i < 4; i++) if (flashT[i] > 0) flashT[i] = Math.max(0, flashT[i] - dt);

      if (phase === 'inter') {
        tState += dt;
        if (tState >= INTER) setPhase('watch');
      } else if (phase === 'watch') {
        const on = stepOnOf(seq.length);
        const cyc = on + GAP;
        pbT += dt;
        const wantLit = pbT < on;
        const idx = seq[pbIdx];
        if (wantLit) {
          if (litPad !== idx) { litPad = idx; if (!toneFired) { Sfx.play(TONES[idx]); toneFired = true; } }
        } else if (litPad !== -1) litPad = -1;
        if (pbT >= cyc) {
          pbT -= cyc;
          pbIdx++;
          toneFired = false;
          if (pbIdx >= seq.length) setPhase('input');
        }
      }
    }

    /* ── paint (DOM sync) ──────────────────────────── */
    function paint() {
      for (let i = 0; i < 4; i++) {
        setCls(pads[i], 'is-lit', litPad === i || flashT[i] > 0);
        setCls(pads[i], 'is-bad', phase === 'over' && badPad === i);
      }
      let roundTxt = '?', label = 'READY';
      if (phase === 'menu') { roundTxt = '?'; label = 'READY'; }
      else if (phase === 'inter') { roundTxt = String(seq.length); label = 'ROUND ' + seq.length; }
      else if (phase === 'watch') { roundTxt = String(seq.length); label = 'WATCH'; }
      else if (phase === 'input') { roundTxt = String(seq.length); label = 'YOUR TURN'; }
      else { roundTxt = '✕'; label = 'GAME OVER'; }
      if (hubRound.textContent !== roundTxt) hubRound.textContent = roundTxt;
      if (hubLabel.textContent !== label) hubLabel.textContent = label;
    }

    /* ── boot ──────────────────────────────────────── */
    resize();
    paint();

    let raf = 0, last = 0;
    function frame(now) {
      if (!alive) return;
      raf = requestAnimationFrame(frame);
      if (!last) last = now;
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.05) dt = 0.05;
      if (dt < 0) dt = 0;
      update(dt);
      paint();
    }
    raf = requestAnimationFrame(frame);

    /* ── shell contract ── */
    return {
      pause() { paused = true; },
      resume() { paused = false; last = 0; },
      restart() { paused = false; last = 0; startRun(); },
      resize(w, h) { resize(w, h); },
      destroy() {
        alive = false;
        cancelAnimationFrame(raf);
        window.removeEventListener('keydown', onKeyD);
        if (menu.parentNode) menu.parentNode.removeChild(menu);
        if (stage.parentNode) stage.parentNode.removeChild(stage);
        host.classList.remove('gsim-host');
      },
      getState() {
        return {
          phase, score, round: seq.length, seq: seq.slice(),
          inputIdx, pbIdx, pbT: Math.round(pbT * 1000) / 1000,
          tState: Math.round(tState * 1000) / 1000,
          litPad, badPad, W, H,
        };
      },
    };
  },
});
