/* ═══════════════════════════════════════════════════
   Game Registry — games self-register here
   Each game file:  Games.register({ id, title, ... , create })
   ═══════════════════════════════════════════════════ */
window.Games = (function () {
  const map = new Map();

  function register(def) {
    if (!def || !def.id) throw new Error('Game must have an id');
    if (map.has(def.id)) { console.warn('[Games] duplicate id: ' + def.id); return; }
    /* required fields with sane defaults */
    map.set(def.id, {
      genre: 'Arcade',
      emoji: '🎮',
      colors: ['#00f0ff', '#7c5cff'],
      description: '',
      controls: [],
      featured: false,
      ...def,
    });
  }

  function get(id) { return map.get(id) || null; }
  function all() { return [...map.values()]; }
  function featured() { return all().filter(g => g.featured); }
  function genres() { return [...new Set(all().map(g => g.genre))].sort(); }

  return { register, get, all, featured, genres };
})();

/* convenience */
window.registerGame = Games.register;
