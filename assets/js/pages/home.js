/* ═══════════════════════════════════════════════════
   Page: Home — hero (Three.js) + stats + game library
   ═══════════════════════════════════════════════════ */
(function () {
  Router.add('/', function ({ stage }) {
    const view = Router.renderView(stage, `
      <section class="hero">
        <div id="holoHost"></div>
        <span class="hero__chip"><i></i> ${Games.all().length} games online</span>
        <h1>PLAY THE<br><span class="g">IMPOSSIBLE.</span></h1>
        <p>A premium arcade of hand-crafted games — pure vanilla JavaScript,
           zero frameworks, console-grade polish. Pick a title and drop in.</p>
        <div class="hero__cta">
          <button class="btn btn--primary" id="ctaPlay">
            ${UI.icon('play')} <span id="ctaPlayLabel">Play now</span>
          </button>
          <a class="btn btn--ghost" href="#library">${UI.icon('gamepad')} Browse library</a>
        </div>

        <div class="stats">
          <div class="stat"><b id="stGames">${Games.all().length}</b><span>Games</span></div>
          <div class="stat"><b id="stPlays">${Store.totalPlays().toLocaleString()}</b><span>Sessions</span></div>
          <div class="stat"><b id="stFavs">${Store.favorites.length}</b><span>Favorites</span></div>
          <div class="stat"><b id="stBest">${bestOverall().toLocaleString()}</b><span>Top score</span></div>
        </div>
      </section>

      <section class="sec" id="library">
        <div class="sec__head">
          <div>
            <h2 class="sec__title">Game <span class="g">Library</span></h2>
            <p class="sec__sub" id="libCount"></p>
          </div>
          <div class="sec__tools">
            <div class="search">
              ${UI.icon('search')}
              <input type="search" id="libSearch" placeholder="Search games…" autocomplete="off">
            </div>
            <div class="chips" id="libChips"></div>
          </div>
        </div>
        <div class="grid" id="libGrid"></div>
      </section>
    `);

    /* ── Three.js hero ── */
    const holo = Holo.create(view.querySelector('#holoHost'));

    /* ── hero CTA: jump to random / first game ── */
    const all = Games.all();
    const ctaLabel = view.querySelector('#ctaPlayLabel');
    const pick = all.find(g => g.featured) || all[0];
    if (ctaLabel) ctaLabel.textContent = pick ? `Play ${pick.title}` : 'No games yet';
    view.querySelector('#ctaPlay').addEventListener('click', () => {
      Sfx.play('start');
      if (pick) location.hash = '#/play/' + pick.id;
      else UI.toast('No games installed yet — check back soon!', 'warn');
    });

    /* ── library filter + search ── */
    let activeGenre = 'All';
    let query = '';
    const grid = view.querySelector('#libGrid');
    const chips = view.querySelector('#libChips');
    const countEl = view.querySelector('#libCount');

    function buildChips() {
      const genres = ['All', ...Games.genres()];
      chips.innerHTML = '';
      genres.forEach(g => {
        const b = document.createElement('button');
        b.className = 'chip' + (g === activeGenre ? ' is-on' : '');
        b.textContent = g;
        b.addEventListener('click', () => {
          activeGenre = g;
          Sfx.play('toggle');
          buildChips();
          renderGrid();
        });
        chips.appendChild(b);
      });
    }

    function filtered() {
      return Games.all().filter(g => {
        const okGenre = activeGenre === 'All' || g.genre === activeGenre;
        const q = query.trim().toLowerCase();
        const okQuery = !q ||
          g.title.toLowerCase().includes(q) ||
          g.genre.toLowerCase().includes(q) ||
          (g.description || '').toLowerCase().includes(q);
        return okGenre && okQuery;
      });
    }

    function renderGrid() {
      const list = filtered();
      grid.innerHTML = '';
      countEl.textContent = Games.all().length === 0
        ? 'No games installed yet'
        : `${list.length} of ${Games.all().length} titles`;

      if (Games.all().length === 0) {
        grid.innerHTML = `
          <div class="empty">
            <div class="empty__ic">🕹️</div>
            <h3>NO GAMES INSTALLED</h3>
            <p>The arcade shell is ready — drop game files into
               <code>assets/js/games/</code> and they'll appear here automatically.</p>
          </div>`;
        return;
      }
      if (list.length === 0) {
        grid.innerHTML = `
          <div class="empty">
            <div class="empty__ic">🔍</div>
            <h3>NO MATCHES</h3>
            <p>Nothing found for “${query}”. Try another keyword or genre.</p>
          </div>`;
        return;
      }
      list.forEach((g, i) => grid.appendChild(UI.card(g, i)));
    }

    view.querySelector('#libSearch').addEventListener('input', e => {
      query = e.target.value;
      renderGrid();
    });

    buildChips();
    renderGrid();

    /* live-update when favorites change elsewhere */
    const onFav = () => renderGrid();
    document.addEventListener('fav:changed', onFav);

    return {
      dispose() {
        holo.dispose();
        document.removeEventListener('fav:changed', onFav);
      },
    };
  });

  function bestOverall() {
    return Object.values(Store.scores).reduce((a, b) => Math.max(a, b), 0);
  }
})();
