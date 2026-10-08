/* ═══════════════════════════════════════════════════
   Page: Settings — accent, sound, FX, data
   ═══════════════════════════════════════════════════ */
(function () {
  Router.add('/settings', function ({ stage }) {
    const s = Store.settings;
    const view = Router.renderView(stage, `
      <div class="phead">
        <h1>Game <span class="g">Settings</span></h1>
        <p>Tune the arcade to your taste — saved instantly.</p>
      </div>

      <div class="panel">
        <h3>⚙️ APPEARANCE</h3>
        <p>Accent color flows through the whole UI.</p>
        <div class="row">
          <div class="row__t"><b>Accent color</b><span>Neon theme highlight</span></div>
          <div class="swatches" id="swatches">
            <button class="swatch ${s.accent === 'cyan' ? 'is-on' : ''}" data-a="cyan"
              style="background:linear-gradient(135deg,#00f0ff,#7c5cff);color:#00f0ff" title="Cyan"></button>
            <button class="swatch ${s.accent === 'magenta' ? 'is-on' : ''}" data-a="magenta"
              style="background:linear-gradient(135deg,#ff2ecd,#ff9a3d);color:#ff2ecd" title="Magenta"></button>
            <button class="swatch ${s.accent === 'lime' ? 'is-on' : ''}" data-a="lime"
              style="background:linear-gradient(135deg,#2dff9e,#9dff2e);color:#2dff9e" title="Lime"></button>
            <button class="swatch ${s.accent === 'violet' ? 'is-on' : ''}" data-a="violet"
              style="background:linear-gradient(135deg,#7c5cff,#ff2ecd);color:#7c5cff" title="Violet"></button>
          </div>
        </div>
        <div class="row">
          <div class="row__t"><b>Reduced effects</b><span>Disable the 3D hero background</span></div>
          <button class="toggle ${s.reducedFx ? 'is-on' : ''}" id="tFx" role="switch"
            aria-checked="${!!s.reducedFx}"></button>
        </div>
      </div>

      <div class="panel">
        <h3>🔊 AUDIO</h3>
        <p>Retro synth sound effects — no audio files needed.</p>
        <div class="row">
          <div class="row__t"><b>Sound effects</b><span>UI clicks, coins, win/lose stingers</span></div>
          <button class="toggle ${s.sound ? 'is-on' : ''}" id="tSnd" role="switch"
            aria-checked="${!!s.sound}"></button>
        </div>
      </div>

      <div class="panel">
        <h3>📊 DATA</h3>
        <p>Everything lives in your browser's local storage.</p>
        <div class="row">
          <div class="row__t"><b>Sessions played</b><span>Total across all games</span></div>
          <b style="font-family:var(--font-d);color:var(--c1)">${Store.totalPlays().toLocaleString()}</b>
        </div>
        <div class="row">
          <div class="row__t"><b>Favorites</b><span>Starred titles</span></div>
          <b style="font-family:var(--font-d);color:var(--c2)">${Store.favorites.length}</b>
        </div>
        <div class="row">
          <div class="row__t"><b>Reset everything</b><span>Scores, favorites & settings</span></div>
          <button class="danger-btn" id="resetBtn">Reset data</button>
        </div>
      </div>
    `);

    /* accent swatches */
    view.querySelectorAll('.swatch').forEach(b => {
      b.addEventListener('click', () => {
        const a = b.dataset.a;
        document.documentElement.dataset.accent = a;
        Store.set('accent', a);
        view.querySelectorAll('.swatch').forEach(x => x.classList.toggle('is-on', x === b));
        Sfx.play('toggle');
        UI.toast(`Accent set to ${a}`, '');
      });
    });

    /* FX toggle */
    const tFx = view.querySelector('#tFx');
    tFx.addEventListener('click', () => {
      const on = !Store.settings.reducedFx;
      Store.set('reducedFx', on);
      tFx.classList.toggle('is-on', on);
      tFx.setAttribute('aria-checked', String(on));
      Sfx.play('toggle');
      UI.toast(on ? 'Reduced FX on — 3D hero disabled' : 'Full FX enabled', '');
    });

    /* sound toggle */
    const tSnd = view.querySelector('#tSnd');
    tSnd.addEventListener('click', () => {
      const muted = !Sfx.muted;
      Sfx.setMuted(muted);
      document.documentElement.dataset.mute = muted ? '1' : '0';
      tSnd.classList.toggle('is-on', !muted);
      tSnd.setAttribute('aria-checked', String(!muted));
      if (!muted) Sfx.play('coin');
      UI.toast(muted ? 'Sound muted' : 'Sound enabled', muted ? 'warn' : 'win');
    });

    /* reset */
    view.querySelector('#resetBtn').addEventListener('click', () => {
      UI.modal({
        title: 'Reset everything?',
        body: 'This clears all high scores, favorites and settings. This cannot be undone.',
        actions: [
          { label: 'Cancel' },
          {
            label: 'Reset', primary: true,
            onClick: () => {
              Store.resetAll();
              document.documentElement.dataset.accent = Store.settings.accent;
              document.documentElement.dataset.mute = Store.settings.sound ? '0' : '1';
              UI.toast('All data has been reset', 'warn');
              Router.start && location.reload();
            },
          },
        ],
      });
    });

    return { dispose() {} };
  });
})();
