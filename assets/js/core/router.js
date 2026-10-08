/* ═══════════════════════════════════════════════════
   Router — tiny hash router with view transitions
   Routes:  #/            home
            #/favorites   favorites
            #/settings    settings
            #/play/:id    game shell
   ═══════════════════════════════════════════════════ */
window.Router = (function () {
  const routes = [];
  let current = null;      // { dispose }
  let mountedView = null;

  function add(pattern, handler) {
    // pattern like '/play/:id'
    const parts = pattern.split('/').filter(Boolean);
    routes.push({ parts, handler });
  }

  function match(path) {
    const segs = path.split('/').filter(Boolean);
    for (const r of routes) {
      if (r.parts.length !== segs.length) continue;
      const params = {};
      let ok = true;
      for (let i = 0; i < r.parts.length; i++) {
        if (r.parts[i].startsWith(':')) params[r.parts[i].slice(1)] = decodeURIComponent(segs[i]);
        else if (r.parts[i] !== segs[i]) { ok = false; break; }
      }
      if (ok) return { handler: r.handler, params };
    }
    return null;
  }

  function parseHash() {
    const h = location.hash.replace(/^#/, '') || '/';
    const [path, query] = h.split('?');
    return { path: path || '/', query: new URLSearchParams(query || '') };
  }

  function navigate() {
    const { path, query } = parseHash();
    const m = match(path);
    if (!m) { location.hash = '#/'; return; }

    /* dispose previous (game loops, three.js, listeners) */
    if (current && current.dispose) { try { current.dispose(); } catch (e) { console.warn(e); } }
    current = null;

    const stage = document.getElementById('stage');
    const result = m.handler({ params: m.params, query, stage });

    /* handler may return { mount, dispose } where mount returns cleanup */
    if (result && typeof result.mount === 'function') {
      const cleanup = result.mount(stage) || {};
      current = { dispose: () => cleanup.dispose && cleanup.dispose(), name: result.name };
    } else if (result && typeof result.dispose === 'function') {
      current = result;
    }

    updateNav(path);
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }

  function updateNav(path) {
    let key = 'home';
    if (path.startsWith('/favorites')) key = 'favorites';
    else if (path.startsWith('/settings')) key = 'settings';
    document.querySelectorAll('[data-nav]').forEach(a => {
      a.classList.toggle('is-active', a.dataset.nav === key);
    });
  }

  function start() {
    window.addEventListener('hashchange', navigate);
    navigate();
  }

  /** swap inner view of stage with animation (used by pages) */
  function renderView(stage, html) {
    const view = document.createElement('div');
    view.className = 'view';
    view.innerHTML = html;
    stage.innerHTML = '';
    stage.appendChild(view);
    return view;
  }

  return { add, start, renderView, get path() { return parseHash().path; } };
})();
