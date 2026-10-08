/* ═══════════════════════════════════════════════════
   Store — persistent state (favorites, scores, settings)
   ═══════════════════════════════════════════════════ */
window.Store = (function () {
  const KEY = 'nexus.arcade.v1';

  const defaults = {
    favorites: [],            // [gameId]
    scores: {},               // { gameId: number }
    plays: {},                // { gameId: count }
    settings: { accent: 'cyan', sound: true, reducedFx: false },
  };

  let data = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return structuredClone(defaults);
      const parsed = JSON.parse(raw);
      return {
        ...structuredClone(defaults),
        ...parsed,
        settings: { ...defaults.settings, ...(parsed.settings || {}) },
      };
    } catch {
      return structuredClone(defaults);
    }
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* private mode */ }
  }

  return {
    get settings() { return data.settings; },

    /* ── favorites ── */
    isFav(id) { return data.favorites.includes(id); },
    toggleFav(id) {
      const i = data.favorites.indexOf(id);
      if (i === -1) data.favorites.push(id); else data.favorites.splice(i, 1);
      save();
      return i === -1; // now favorite?
    },
    get favorites() { return data.favorites.slice(); },

    /* ── high scores ── */
    best(id) { return data.scores[id] || 0; },
    submitScore(id, score) {
      const prev = data.scores[id] || 0;
      if (score > prev) {
        data.scores[id] = score;
        save();
        return { newBest: true, prev };
      }
      return { newBest: false, prev };
    },
    get scores() { return { ...data.scores }; },

    /* ── play counters ── */
    countPlay(id) { data.plays[id] = (data.plays[id] || 0) + 1; save(); },
    totalPlays() { return Object.values(data.plays).reduce((a, b) => a + b, 0); },

    /* ── settings ── */
    set(setting, value) { data.settings[setting] = value; save(); },

    resetAll() {
      data = structuredClone(defaults);
      save();
    },
  };
})();
