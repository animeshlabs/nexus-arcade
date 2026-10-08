/* ═══════════════════════════════════════════════════
   Page: Play — the game shell / host
   Provides: HUD (score, best), pause, restart, back,
             fullscreen, controls legend, game-over overlay.
   Games receive a context object (ctx) and return
   { start?, pause?, resume?, restart?, destroy }.
   ═══════════════════════════════════════════════════ */
(function () {
  Router.add('/play/:id', function ({ params, stage }) {
    const game = Games.get(params.id);
    if (!game) {
      UI.modal({
        title: 'Game not found',
        body: `No game registered with id “${params.id}”.`,
        actions: [{ label: 'Back to arcade', primary: true, onClick: () => location.hash = '#/' }],
      });
      location.hash = '#/';
      return { dispose() {} };
    }

    /* full-screen shell replaces normal stage layout */
    document.body.style.overflow = 'hidden';
    stage.innerHTML = '';
    Store.countPlay(game.id);

    const shell = document.createElement('div');
    shell.className = 'play';
    shell.innerHTML = `
      <div class="play__bar">
        <button class="play__back" id="pBack">${UI.icon('back')} Arcade</button>
        <div class="play__title">
          <span class="g">${game.title}</span>
          <span class="play__genre">${game.genre}</span>
        </div>
        <div class="play__hud">
          <div class="hud-pill">${UI.icon('bolt')} <span>Score</span> <b id="pScore">0</b></div>
          <div class="hud-pill hud-pill--best">${UI.icon('trophy')} <span>Best</span> <b id="pBest">${Store.best(game.id).toLocaleString()}</b></div>
          <button class="iconbtn" id="pPause" title="Pause"><svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg></button>
          <button class="iconbtn" id="pFull" title="Fullscreen">
            <svg viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7zm-2-4h2V7h3V5H5zm12 7h-3v2h5v-5h-2zM14 5v2h3v3h2V5z"/></svg>
          </button>
        </div>
      </div>
      <div class="play__viewport">
        <div class="play__mount" id="pMount"></div>
      </div>
      <div class="play__foot" id="pFoot"></div>
    `;
    stage.appendChild(shell);

    const mount = shell.querySelector('#pMount');
    const scoreEl = shell.querySelector('#pScore');
    const bestEl = shell.querySelector('#pBest');
    const footEl = shell.querySelector('#pFoot');
    const pauseBtn = shell.querySelector('#pPause');

    /* ── controls legend ── */
    if (game.controls && game.controls.length) {
      footEl.innerHTML = game.controls.map(c =>
        `<span><span class="key">${c.key}</span> ${c.label}</span>`
      ).join('<span style="opacity:.35">|</span>');
    } else {
      footEl.textContent = '';
      footEl.style.display = 'none';
    }

    /* ── ctx handed to every game ── */
    let score = 0;
    let paused = false;
    let ended = false;

    const ctx = {
      game,
      container: mount,
      width: mount.clientWidth,
      height: mount.clientHeight,

      get paused() { return paused; },

      /* update HUD + return whether it's a new best */
      setScore(n) {
        score = Math.max(0, Math.round(n));
        scoreEl.textContent = score.toLocaleString();
        return score;
      },
      addScore(n) { return this.setScore(score + n); },
      get score() { return score; },

      /* end the run — shows shared game-over overlay */
      gameOver({ title = 'GAME OVER', message = '' } = {}) {
        if (ended) return;
        ended = true;
        paused = true;
        const res = Store.submitScore(game.id, score);
        bestEl.textContent = Store.best(game.id).toLocaleString();
        Sfx.play(res.newBest ? 'win' : 'lose');
        if (res.newBest) UI.toast(`🏆 New personal best on ${game.title}!`, 'win');

        const ov = document.createElement('div');
        ov.className = 'go-overlay';
        ov.innerHTML = `
          <h2 class="go-t">${res.newBest ? 'NEW BEST!' : title}</h2>
          ${message ? `<p style="color:var(--txt-dim);margin:4px 0 0">${message}</p>` : ''}
          <p class="go-score">Score <b>${score.toLocaleString()}</b></p>
          <p class="go-best ${res.newBest ? 'is-new' : ''}">
            ${res.newBest ? `Previous best: ${res.prev.toLocaleString()} → ${Store.best(game.id).toLocaleString()}` : `Best: ${Store.best(game.id).toLocaleString()}`}
          </p>
          <div class="go-cta">
            <button class="btn btn--primary" data-act="retry">${UI.icon('restart')} Play again</button>
            <button class="btn btn--ghost" data-act="exit">${UI.icon('back')} Arcade</button>
          </div>`;
        mount.appendChild(ov);
        ov.querySelector('[data-act="retry"]').onclick = () => {
          Sfx.play('start');
          ov.remove();
          ended = false;
          score = 0;
          scoreEl.textContent = '0';
          paused = false;
          syncPauseBtn();
          if (instance && instance.restart) instance.restart();
          else if (instance && instance.start) { instance.destroy && instance.destroy(); instance = instance.start(ctx); }
        };
        ov.querySelector('[data-act="exit"]').onclick = () => { Sfx.play('click'); location.hash = '#/'; };
      },

      /* lightweight helpers games can use */
      toast: (m, k) => UI.toast(m, k),
      sfx: name => Sfx.play(name),
    };

    const ICON_PAUSE = '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>';
    const ICON_PLAY = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
    function syncPauseBtn() {
      pauseBtn.classList.toggle('is-on', paused);
      pauseBtn.style.color = paused ? 'var(--c1)' : '';
      pauseBtn.innerHTML = paused ? ICON_PLAY : ICON_PAUSE;
      pauseBtn.title = paused ? 'Resume' : 'Pause';
    }

    /* ── pause / resume ── */
    function togglePause() {
      if (ended) return;
      paused = !paused;
      syncPauseBtn();
      Sfx.play('toggle');
      if (paused) {
        if (instance && instance.pause) instance.pause();
        let ov = mount.querySelector('.pause-ov');
        if (!ov) {
          ov = document.createElement('div');
          ov.className = 'go-overlay pause-ov';
          ov.innerHTML = `
            <h2 class="go-t">PAUSED</h2>
            <p class="go-best">Take a breath. The grid waits for you.</p>
            <div class="go-cta">
              <button class="btn btn--primary" data-act="resume">${UI.icon('play')} Resume</button>
              <button class="btn btn--ghost" data-act="restart">${UI.icon('restart')} Restart</button>
              <button class="btn btn--ghost" data-act="exit">${UI.icon('back')} Arcade</button>
            </div>`;
          mount.appendChild(ov);
          ov.querySelector('[data-act="resume"]').onclick = togglePause;
          ov.querySelector('[data-act="restart"]').onclick = () => {
            ov.remove(); ended = false; paused = false; score = 0;
            scoreEl.textContent = '0'; syncPauseBtn(); Sfx.play('start');
            if (instance && instance.restart) instance.restart();
          };
          ov.querySelector('[data-act="exit"]').onclick = () => { Sfx.play('click'); location.hash = '#/'; };
        }
      } else {
        const ov = mount.querySelector('.pause-ov');
        if (ov) ov.remove();
        if (instance && instance.resume) instance.resume();
      }
    }
    pauseBtn.addEventListener('click', togglePause);

    /* Esc = pause (also handled by games optionally) */
    const onKey = e => {
      if (e.key === 'Escape') { e.preventDefault(); togglePause(); }
      if (e.key.toLowerCase() === 'r' && e.ctrlKey === false && !isTyping()) { /* R handled by games */ }
    };
    function isTyping() {
      const a = document.activeElement;
      return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA');
    }
    window.addEventListener('keydown', onKey);

    /* fullscreen */
    shell.querySelector('#pFull').addEventListener('click', () => {
      Sfx.play('click');
      const el = document.documentElement;
      if (!document.fullscreenElement) el.requestFullscreen && el.requestFullscreen();
      else document.exitFullscreen && document.exitFullscreen();
    });

    /* back button */
    shell.querySelector('#pBack').addEventListener('click', () => {
      Sfx.play('click');
      location.hash = '#/';
    });

    /* ── launch the game ── */
    let instance = null;
    function launch() {
      ctx.width = mount.clientWidth;
      ctx.height = mount.clientHeight;
      try {
        instance = game.create(ctx);
      } catch (err) {
        console.error(`[${game.id}] failed to start:`, err);
        mount.innerHTML = `
          <div class="empty">
            <div class="empty__ic">💥</div>
            <h3>GAME CRASHED</h3>
            <p>${game.title} failed to start. ${err && err.message ? err.message : ''}</p>
          </div>`;
      }
    }
    /* wait a frame so layout is settled */
    requestAnimationFrame(launch);

    const onResize = () => {
      if (instance && instance.resize) instance.resize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener('resize', onResize);

    return {
      dispose() {
        window.removeEventListener('keydown', onKey);
        window.removeEventListener('resize', onResize);
        document.body.style.overflow = '';
        if (document.fullscreenElement) document.exitFullscreen && document.exitFullscreen();
        try { instance && instance.destroy && instance.destroy(); }
        catch (e) { console.warn(e); }
      },
    };
  });
})();
