/* ═══════════════════════════════════════════════════
   Page: Favorites
   ═══════════════════════════════════════════════════ */
(function () {
  Router.add('/favorites', function ({ stage }) {
    const view = Router.renderView(stage, `
      <div class="phead">
        <h1>Your <span class="g">Favorites</span></h1>
        <p>Titles you starred — always one click away.</p>
      </div>
      <div class="grid" id="favGrid"></div>
    `);

    const grid = view.querySelector('#favGrid');

    function render() {
      const favs = Store.favorites.map(id => Games.get(id)).filter(Boolean);
      grid.innerHTML = '';
      if (favs.length === 0) {
        grid.innerHTML = `
          <div class="empty">
            <div class="empty__ic">💜</div>
            <h3>NO FAVORITES YET</h3>
            <p>Tap the heart on any game card to pin it here for quick access.</p>
            <a class="btn btn--primary btn--sm" href="#/">${UI.icon('gamepad')} Browse games</a>
          </div>`;
        return;
      }
      favs.forEach((g, i) => grid.appendChild(UI.card(g, i)));
    }

    const onFav = () => render();
    document.addEventListener('fav:changed', onFav);
    render();

    return { dispose: () => document.removeEventListener('fav:changed', onFav) };
  });
})();
