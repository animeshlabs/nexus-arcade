/* ═══════════════════════════════════════════════════
   App boot — splash, nav wiring, router start
   ═══════════════════════════════════════════════════ */
(function () {
  const boot = document.getElementById('boot');
  const bar = document.getElementById('bootBar');
  const hint = document.getElementById('bootHint');
  const app = document.getElementById('app');

  /* apply saved prefs before first paint */
  document.documentElement.dataset.accent = Store.settings.accent;
  document.documentElement.dataset.mute = Store.settings.sound ? '0' : '1';

  const hints = [
    'initializing engine…',
    'loading neon shaders…',
    'calibrating hitboxes…',
    'warming up the arcade…',
    'inserting coins…',
  ];

  let p = 0;
  const iv = setInterval(() => {
    p = Math.min(100, p + 8 + Math.random() * 18);
    bar.style.width = p + '%';
    hint.textContent = hints[Math.min(hints.length - 1, Math.floor(p / 25))];
    if (p >= 100) {
      clearInterval(iv);
      setTimeout(reveal, 240);
    }
  }, 130);

  function reveal() {
    boot.classList.add('is-done');
    app.classList.add('is-ready');
    boot.setAttribute('aria-hidden', 'true');
  }

  /* ── sound button ── */
  const soundBtn = document.getElementById('soundBtn');
  soundBtn.addEventListener('click', () => {
    const muted = !Sfx.muted;
    Sfx.setMuted(muted);
    document.documentElement.dataset.mute = muted ? '1' : '0';
    UI.toast(muted ? 'Sound muted' : 'Sound enabled', muted ? 'warn' : 'win');
    if (!muted) Sfx.play('coin');
  });

  /* hover ticks on nav + buttons */
  document.addEventListener('pointerover', e => {
    if (e.target.closest('.btn, .chip, .topnav a')) Sfx.play('hover');
  });

  /* ── favorites badge ── */
  const favBadge = document.getElementById('favBadge');
  function syncFavBadge() {
    const n = Store.favorites.length;
    favBadge.hidden = n === 0;
    favBadge.textContent = n;
  }
  document.addEventListener('fav:changed', syncFavBadge);
  syncFavBadge();

  /* ── footer stats ── */
  const footStats = document.getElementById('footStats');
  footStats.textContent = `${Games.all().length} games installed · ${Store.totalPlays().toLocaleString()} sessions`;

  /* ── go ── */
  Router.start();

  /* auto-focus sound preference sync (in case changed elsewhere) */
  document.documentElement.dataset.mute = Store.settings.sound ? '0' : '1';
})();
