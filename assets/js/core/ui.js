/* ═══════════════════════════════════════════════════
   UI — icons, toasts, modals, game cards
   ═══════════════════════════════════════════════════ */
window.UI = (function () {

  const ICONS = {
    play:   '<path d="M8 5v14l11-7z"/>',
    heart:  '<path d="M12 21s-7.5-4.7-10-9.3C.6 8.7 2.4 5 6 5c2.2 0 3.7 1.2 4.5 2.6h3C14.3 6.2 15.8 5 18 5c3.6 0 5.4 3.7 4 6.7C19.5 16.3 12 21 12 21z"/>',
    trophy: '<path d="M19 4h-4V2H9v2H5a2 2 0 0 0-2 2v3a5 5 0 0 0 4 4.9V17H7a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1h-1v-3.1A5 5 0 0 0 21 9V6a2 2 0 0 0-2-2zM5 8V6h3v4.8A3 3 0 0 1 5.8 8zm14 1a3 3 0 0 1-2.2 2.9V6H19z"/>',
    back:   '<path d="M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20z"/>',
    search: '<path d="M15.5 14h-.8l-.3-.3a6.5 6.5 0 1 0-.7.7l.3.3v.8l5 5 1.5-1.5zm-6 0a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z"/>',
    bolt:   '<path d="M13 2 3 14h7l-1 8 10-12h-7z"/>',
    gamepad:'<path d="M17 6H7a5 5 0 0 0-5 5 4 4 0 0 0 4 4h1.3l.9 2h3.6l.9-2H17a4 4 0 0 0 4-4 5 5 0 0 0-5-5zM7.5 14A1.5 1.5 0 1 1 7.5 11a1.5 1.5 0 0 1 0 3zm3-4A1.5 1.5 0 1 1 10.5 5a1.5 1.5 0 0 1 0 4zm5 4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm1-4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/>',
    restart:'<path d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z"/>',
    star:   '<path d="m12 17.3-6.2 3.7 1.7-7L2 9.2l7.1-.6L12 2l2.9 6.6 7.1.6-5.5 4.8 1.7 7z"/>',
    volume: '<path d="M4 9v6h4l5 4V5L8 9zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z"/>',
    close:  '<path d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3z"/>',
  };

  function icon(name, cls = '') {
    return `<svg class="${cls}" viewBox="0 0 24 24">${ICONS[name] || ''}</svg>`;
  }

  /* ── toasts ── */
  function toast(msg, kind = '') {
    const root = document.getElementById('toasts');
    const el = document.createElement('div');
    el.className = 'toast ' + (kind ? 'toast--' + kind : '');
    el.innerHTML = `<i></i><span></span>`;
    el.querySelector('span').textContent = msg;
    root.appendChild(el);
    setTimeout(() => {
      el.classList.add('is-out');
      el.addEventListener('animationend', () => el.remove(), { once: true });
    }, 2800);
  }

  /* ── modal ── */
  function modal({ title, body, actions }) {
    const root = document.getElementById('modalRoot');
    root.innerHTML = `
      <div class="modal__bd"></div>
      <div class="modal__box" role="dialog" aria-modal="true">
        <h3><span class="g">${title}</span></h3>
        <p>${body}</p>
        <div class="modal__row"></div>
      </div>`;
    root.classList.add('is-open');
    const row = root.querySelector('.modal__row');
    (actions || [{ label: 'OK', primary: true }]).forEach(a => {
      const b = document.createElement('button');
      b.className = 'btn btn--sm ' + (a.primary ? 'btn--primary' : 'btn--ghost');
      b.textContent = a.label;
      b.onclick = () => { closeModal(); a.onClick && a.onClick(); };
      row.appendChild(b);
    });
    root.querySelector('.modal__bd').onclick = closeModal;
    Sfx.play('click');
  }
  function closeModal() {
    const root = document.getElementById('modalRoot');
    root.classList.remove('is-open');
    root.innerHTML = '';
  }

  /* ── game card ── */
  function card(game, index = 0) {
    const best = Store.best(game.id);
    const fav = Store.isFav(game.id);
    const el = document.createElement('article');
    el.className = 'card';
    el.style.animationDelay = (index * 55) + 'ms';
    el.style.setProperty('--a1', game.colors[0]);
    el.style.setProperty('--a2', game.colors[1]);
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', 'Play ' + game.title);

    el.innerHTML = `
      <div class="card__art">
        <span class="card__genre">${game.genre}</span>
        <button class="card__fav ${fav ? 'is-on' : ''}" aria-label="Favorite">
          ${icon('heart')}
        </button>
        <span class="card__emoji">${game.emoji}</span>
      </div>
      <div class="card__body">
        <h3 class="card__title">${game.title}</h3>
        <p class="card__desc">${game.description}</p>
        <div class="card__meta">
          <span class="card__score">${icon('trophy')} Best <b>${best.toLocaleString()}</b></span>
          <span class="card__play">${icon('play')} PLAY</span>
        </div>
      </div>`;

    /* favorite toggle (stops card navigation) */
    el.querySelector('.card__fav').addEventListener('click', e => {
      e.stopPropagation();
      const nowFav = Store.toggleFav(game.id);
      e.currentTarget.classList.toggle('is-on', nowFav);
      Sfx.play(nowFav ? 'coin' : 'toggle');
      toast(nowFav ? `Added “${game.title}” to favorites` : `Removed “${game.title}”`, nowFav ? 'win' : '');
      document.dispatchEvent(new CustomEvent('fav:changed'));
    });

    const open = () => { Sfx.play('click'); location.hash = '#/play/' + game.id; };
    el.addEventListener('click', open);
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });

    return el;
  }

  return { icon, toast, modal, closeModal, card };
})();
