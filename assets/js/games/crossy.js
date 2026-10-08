/* ═══════════════════════════════════════════════════════
   CROSSY ROAD — daylight voxel hopper (Three.js 3D)
   Hop lanes of speeding cars · ride drifting logs ·
   beat the rising danger line. Distance = score + coins.
   Classic reference camera rig (orthographic 50°/20°/10°).
   ═══════════════════════════════════════════════════════ */
registerGame({
  id: 'crossy',
  title: 'Crossy Road',
  genre: 'Arcade',
  emoji: '🐔',
  colors: ['#8ee83c', '#2f7dff'],
  description: 'Tap to hop forward, swipe to dodge. Thread moving traffic, hop across rivers on drifting logs and outrun the danger line — every row crossed is a point.',
  featured: true,
  controls: [
    { key: 'TAP / SWIPE', label: 'Tap = hop forward · swipe = left/right/back' },
    { key: 'D-PAD', label: 'On-screen D-pad for precise mobile moves' },
    { key: 'ARROWS / WASD', label: 'Keyboard hops (hold to keep hopping)' },
  ],
  create(ctx) {
    'use strict';

    const host = ctx.container;
    host.classList.add('cx-host');

    /* ── constants ─────────────────────────────────── */
    const ROW_W = 1;
    const X_LIMIT = 9;                 // cells −9..9
    const HOP_T = 0.14;                // hop duration (s)
    const KEEP_BACK = 17, KEEP_AHEAD = 26;   // ≥ bottom-edge reach of the tilted ortho camera
    const STRIP_W = 52;                // ground strip: covers the whole tilted frame
    const SPAWN_X = 21, DESPAWN_X = 22.5;    // vehicles spawn/despawn off-screen
    const LOG_SPAWN = 18, LOG_DESPAWN = 20;
    const TYPES = ['grass', 'road', 'river'];
    const CAR_COLORS = [0xa52523, 0xbdb638, 0x78b14b, 0x3a7bd5, 0xe4e4e4];
    const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
    const lerp = (a, b, t) => a + (b - a) * t;

    /* ── renderer / scene / camera ─────────────────── */
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xd8ecff, 67, 77);  // pale daylight haze (ortho depth ≈ 60 at focus)

    /* The reference clone's signature rig (orthographic 50°/20°/10° tilt).
       VIEW_D / VIEW_UP are its exact view direction + up vector re-expressed
       for our +Z-forward / +Y-up world — lanes and forward project on screen
       *identically* to the original game. */
    const VIEW_D = [0.342, -0.604, 0.720];
    const VIEW_UP = [0.163, 0.793, 0.588];
    const VIEW_DIST = 60;
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.5, 260);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0xd8ecff, 1);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const glCanvas = renderer.domElement;
    glCanvas.classList.add('cx-gl');
    host.appendChild(glCanvas);

    /* daylight lighting + real shadows */
    const hemi = new THREE.HemisphereLight(0xcfe6ff, 0x6fae5a, 0.8);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff6e0, 1.05);
    sun.castShadow = true;
    const smap = (host.clientWidth || 800) > 768 ? 2048 : 1024;
    sun.shadow.mapSize.width = smap;
    sun.shadow.mapSize.height = smap;
    sun.shadow.camera.left = -16;
    sun.shadow.camera.right = 16;
    sun.shadow.camera.top = 16;
    sun.shadow.camera.bottom = -16;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 52;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.03;
    sun.shadow.camera.updateProjectionMatrix();
    const sunTarget = new THREE.Object3D();
    scene.add(sunTarget);
    sun.target = sunTarget;
    scene.add(sun);

    /* ── shared geometry + cached materials ────────── */
    const mats = [];
    const matCache = new Map();
    const texList = [];
    const geoBox = new THREE.BoxGeometry(1, 1, 1);
    const geoCyl = new THREE.CylinderGeometry(1, 1, 1, 8);
    const geoCone = new THREE.CylinderGeometry(0.03, 1, 1, 7);
    const geoCircle = new THREE.CircleGeometry(1, 18);
    const geoSphere = new THREE.SphereGeometry(1, 8, 6);

    /* vehicle cabin faces — window textures drawn on canvas
       (same trick as the reference clone) */
    function faceTex(w, h, draw) {
      const c2 = document.createElement('canvas');
      c2.width = w; c2.height = h;
      const g2 = c2.getContext ? c2.getContext('2d') : null;
      if (g2) draw(g2);
      const t = new THREE.CanvasTexture(c2);
      texList.push(t);
      return t;
    }
    const CAB_BG = '#e9eefb';
    const texSide = faceTex(64, 32, g => {
      g.fillStyle = CAB_BG; g.fillRect(0, 0, 64, 32);
      g.fillStyle = 'rgba(18,26,46,.92)'; g.fillRect(7, 6, 21, 15); g.fillRect(36, 6, 21, 15);
      g.fillStyle = 'rgba(10,14,26,.45)'; g.fillRect(0, 24, 64, 3);
    });
    const texFront = faceTex(40, 32, g => {
      g.fillStyle = CAB_BG; g.fillRect(0, 0, 40, 32);
      g.fillStyle = 'rgba(18,26,46,.92)'; g.fillRect(5, 6, 30, 14);
      g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(7, 8, 10, 10);
    });
    const texBack = faceTex(40, 32, g => {
      g.fillStyle = CAB_BG; g.fillRect(0, 0, 40, 32);
      g.fillStyle = 'rgba(18,26,46,.85)'; g.fillRect(7, 7, 26, 12);
    });
    const cabSideMat = new THREE.MeshPhongMaterial({ map: texSide, flatShading: true, shininess: 20 });
    const cabFrontMat = new THREE.MeshPhongMaterial({ map: texFront, flatShading: true, shininess: 20 });
    const cabBackMat = new THREE.MeshPhongMaterial({ map: texBack, flatShading: true, shininess: 20 });
    const cabPlainMat = new THREE.MeshPhongMaterial({ color: 0xdde5f6, flatShading: true, shininess: 34 });
    mats.push(cabSideMat, cabFrontMat, cabBackMat, cabPlainMat);
    /* BoxGeometry material order: +x, −x, +y, −y, +z, −z */
    const CAB_MATS = [cabFrontMat, cabBackMat, cabPlainMat, cabPlainMat, cabSideMat, cabSideMat];

    function mat(hex, kind, opts) {
      const key = (kind || 'l') + '|' + hex + '|' + ((opts && opts.emissive) || '') + '|' + ((opts && opts.opacity) || '');
      if (matCache.has(key)) return matCache.get(key);
      let m;
      if ((kind || 'l') === 'b') m = new THREE.MeshBasicMaterial(Object.assign({ color: hex }, opts || {}));
      else if (kind === 'p') m = new THREE.MeshPhongMaterial(Object.assign({ color: hex, flatShading: true, shininess: 26, specular: 0x2e2e2e }, opts || {}));
      else m = new THREE.MeshLambertMaterial(Object.assign({ color: hex }, opts || {}));
      mats.push(m);
      matCache.set(key, m);
      return m;
    }
    function box(w, h, d, hex, kind, opts) {
      const m = new THREE.Mesh(geoBox, mat(hex, kind, opts));
      m.scale.set(w, h, d);
      if (!(opts && opts.transparent)) { m.castShadow = true; m.receiveShadow = true; }
      return m;
    }
    function cyl(r, len, hex, kind, opts) {
      const m = new THREE.Mesh(geoCyl, mat(hex, kind, opts));
      m.scale.set(r, len, r);
      if (!(opts && opts.transparent)) { m.castShadow = true; m.receiveShadow = true; }
      return m;
    }
    function cone(r, len, hex, opts) {
      const m = new THREE.Mesh(geoCone, mat(hex, 'p', opts));
      m.scale.set(r, len, r);
      m.castShadow = true; m.receiveShadow = true;
      return m;
    }

    /* ── the chicken (detailed, realistic voxel build) ─ */
    const chicken = new THREE.Group();
    chicken.scale.set(1, 1, 1);
    const legL = box(0.07, 0.26, 0.07, 0xff8a3d, 'p'); legL.position.set(-0.12, 0.13, 0.04);
    const legR = box(0.07, 0.26, 0.07, 0xff8a3d, 'p'); legR.position.set(0.12, 0.13, 0.04);
    const toe = (x, z, rot) => {
      const t = box(0.05, 0.04, 0.16, 0xf5923c, 'p');
      t.position.set(x, 0.02, z); t.rotation.y = rot;
      chicken.add(t);
    };
    toe(-0.12, 0.1, 0); toe(-0.17, 0.0, 0.55); toe(-0.07, 0.0, -0.55);
    toe(0.12, 0.1, 0); toe(0.17, 0.0, 0.55); toe(0.07, 0.0, -0.55);
    const body = box(0.5, 0.44, 0.62, 0xfbfaf4, 'p'); body.position.set(0, 0.48, 0);
    const bodyTop = box(0.44, 0.16, 0.5, 0xefe9dc, 'p'); bodyTop.position.set(0, 0.66, -0.04);
    const wingL = box(0.08, 0.26, 0.4, 0xf1eee6, 'p'); wingL.position.set(-0.3, 0.5, -0.02);
    const wingR = box(0.08, 0.26, 0.4, 0xf1eee6, 'p'); wingR.position.set(0.3, 0.5, -0.02);
    const wingTL = box(0.07, 0.1, 0.17, 0xd8d2c4, 'p'); wingTL.position.set(-0.3, 0.42, -0.17);
    const wingTR = box(0.07, 0.1, 0.17, 0xd8d2c4, 'p'); wingTR.position.set(0.3, 0.42, -0.17);
    const tail1 = box(0.1, 0.3, 0.07, 0xe8e2d4, 'p'); tail1.position.set(-0.1, 0.66, -0.32); tail1.rotation.x = -0.45; tail1.rotation.z = 0.28;
    const tail2 = box(0.1, 0.36, 0.07, 0xf6f2e8, 'p'); tail2.position.set(0, 0.7, -0.35); tail2.rotation.x = -0.52;
    const tail3 = box(0.1, 0.3, 0.07, 0xe8e2d4, 'p'); tail3.position.set(0.1, 0.66, -0.32); tail3.rotation.x = -0.45; tail3.rotation.z = -0.28;
    const neck = box(0.22, 0.26, 0.2, 0xfbfaf4, 'p'); neck.position.set(0, 0.72, 0.11);
    const head = box(0.3, 0.28, 0.28, 0xfbfaf4, 'p'); head.position.set(0, 0.92, 0.15);
    const combC = box(0.08, 0.15, 0.15, 0xe63950, 'p'); combC.position.set(0, 1.12, 0.13);
    const combF = box(0.07, 0.1, 0.11, 0xe63950, 'p'); combF.position.set(0, 1.07, 0.25);
    const combB = box(0.07, 0.11, 0.11, 0xd62f47, 'p'); combB.position.set(0, 1.08, 0.02);
    const beak = box(0.14, 0.08, 0.15, 0xff9f1c, 'p'); beak.position.set(0, 0.9, 0.34);
    const beakLo = box(0.12, 0.05, 0.13, 0xe8850c, 'p'); beakLo.position.set(0, 0.85, 0.33);
    const wattleL = box(0.05, 0.09, 0.06, 0xe63950, 'p'); wattleL.position.set(-0.05, 0.8, 0.3);
    const wattleR = box(0.05, 0.09, 0.06, 0xe63950, 'p'); wattleR.position.set(0.05, 0.8, 0.3);
    const eyeL = box(0.06, 0.07, 0.05, 0x14181f, 'p'); eyeL.position.set(-0.14, 0.96, 0.27);
    const eyeR = box(0.06, 0.07, 0.05, 0x14181f, 'p'); eyeR.position.set(0.14, 0.96, 0.27);
    const glintL = box(0.022, 0.022, 0.02, 0xffffff, 'b'); glintL.position.set(-0.13, 0.98, 0.3);
    const glintR = box(0.022, 0.022, 0.02, 0xffffff, 'b'); glintR.position.set(0.15, 0.98, 0.3);
    chicken.add(legL, legR, body, bodyTop, wingL, wingR, wingTL, wingTR,
      tail1, tail2, tail3, neck, head, combC, combF, combB,
      beak, beakLo, wattleL, wattleR, eyeL, eyeR, glintL, glintR);
    scene.add(chicken);

    /* ── drifting clouds ───────────────────────────── */
    const clouds = [];
    for (let i = 0; i < 6; i++) {
      const grp = new THREE.Group();
      grp.scale.set(1, 1, 1);
      const n = 2 + (i % 2);
      for (let k = 0; k < n; k++) {
        const c = box(1.6 - k * 0.35, 0.5, 1, k % 2 ? 0xffffff : 0xf2f6ff, 'p');
        c.castShadow = false;
        c.position.set(k * 0.9 - 0.5, k * 0.22, (k % 2) * 0.4);
        grp.add(c);
      }
      grp.position.set(-24 + i * 9.5, 5.2 + (i % 3) * 0.9, 5 + (i % 4) * 3);
      scene.add(grp);
      clouds.push({ grp, spd: 0.35 + (i % 3) * 0.14 });
    }

    /* grass apron behind the start line — the tilted frame reaches
       ~15 units behind the chicken (the reference fills this with its
       negative-index lanes) */
    const apron = box(STRIP_W, 0.32, 22, 0xa9e04a, 'p');
    apron.position.set(0, -0.16, -11);
    apron.castShadow = false;
    apron.receiveShadow = true;
    scene.add(apron);

    /* ── danger (kill) line ────────────────────────── */
    const killBar = box(STRIP_W, 0.5, 0.08, 0xff2e7e, 'b', { transparent: true, opacity: 0.85 });
    const killVeil = box(STRIP_W, 0.04, 1.6, 0xff2e7e, 'b', { transparent: true, opacity: 0.16 });
    killVeil.position.y = 0.03;
    const killGrp = new THREE.Group();
    killGrp.scale.set(1, 1, 1);
    killGrp.add(killBar);
    killGrp.add(killVeil);
    killGrp.position.set(0, 0.2, -2);
    scene.add(killGrp);

    /* ── menu + hint overlays ──────────────────────── */
    const menu = document.createElement('div');
    menu.className = 'cx-menu';
    const menuIn = document.createElement('div');
    menuIn.className = 'cx-menu__in';
    const mTitle = document.createElement('h3');
    mTitle.textContent = 'CROSSY ROAD';
    const mHint = document.createElement('p');
    mHint.textContent = 'Tap to hop forward · swipe to dodge · use the neon D-pad for precision · ride the logs across rivers. Every row = 1 pt, coins = +10. Don\'t let the red line catch you!';
    const btnPlay = document.createElement('button');
    btnPlay.className = 'cx-play';
    btnPlay.textContent = '▶ PLAY';
    menuIn.appendChild(mTitle);
    menuIn.appendChild(mHint);
    menuIn.appendChild(btnPlay);
    menu.appendChild(menuIn);
    host.appendChild(menu);

    const hint = document.createElement('div');
    hint.className = 'cx-hint is-out';
    hint.textContent = 'TAP = HOP · SWIPE = MOVE · OR USE THE PAD';
    host.appendChild(hint);

    /* death flash */
    const flash = document.createElement('div');
    flash.className = 'cx-flash';
    host.appendChild(flash);

    /* on-screen D-pad (touch friendly, mirrors keyboard) */
    const pad = document.createElement('div');
    pad.className = 'cx-pad';
    const padBtn = (label, dir, cls) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cx-pad__b ' + cls;
      b.textContent = label;
      b.addEventListener('pointerdown', e => {
        e.stopPropagation();          // keep host swipe logic from double-firing
        if (e.cancelable) e.preventDefault();
        requestHop(dir);
      });
      return b;
    };
    pad.appendChild(padBtn('▲', 'up', 'is-up'));
    pad.appendChild(padBtn('◀', 'left', 'is-left'));
    pad.appendChild(padBtn('▼', 'down', 'is-down'));
    pad.appendChild(padBtn('▶', 'right', 'is-right'));
    host.appendChild(pad);

    /* ── world state ───────────────────────────────── */
    let rows = [];                      // sparse: rows[i] = row | null
    const ch = {
      x: 0, z: 0.5, y: 0, row: 0, vy: 0,
      hopping: false, hopT: 0,
      fromX: 0, fromZ: 0, toX: 0, toZ: 0, toRow: 0,
      queued: null, ride: null, rideSpd: 0, sink: 0,
      facing: 0, faceT: 0, deathSpin: 0,
    };
    let phase = 'menu';                 // menu | ready | playing | dying | over
    let maxRow = 0, coinBonus = 0, coins = 0;
    let killT = 0, killZ = -2;
    let deathT = 0, deathCause = '';
    let overCalled = false;
    let camX = 0, camZ = 0.5, shakeT = 0;
    let paused = false, alive = true, worldT = 0;
    let bump = 0;                       // blocked-hop wiggle timer

    const rowZ = i => i * ROW_W + ROW_W / 2;

    /* ── realistic trees: tapered trunk + branch stub + layered canopy ──
       variants: 0 = pine (stacked cones) · 1 = leafy (shaded tiers) · 2 = fruit */
    function buildTree(row, grp, x, zc) {
      const v = Math.floor(Math.random() * 3);
      const bark = Math.random() < 0.5 ? 0x6b4a2f : 0x5d3f26;
      const tb = box(0.3, 0.34, 0.3, bark, 'p'); tb.position.set(x, 0.17, zc);
      const tt = box(0.2, 0.3, 0.2, bark, 'p'); tt.position.set(x, 0.46, zc);
      const br = box(0.1, 0.26, 0.1, bark, 'p');
      br.position.set(x + 0.15, 0.44, zc + 0.1); br.rotation.z = -0.7;
      grp.add(tb, tt, br);
      if (v === 0) {
        const c1 = cone(0.58, 0.62, 0x2e7d3a); c1.position.set(x, 0.87, zc);
        const c2 = cone(0.45, 0.56, 0x3c9444); c2.position.set(x, 1.3, zc);
        const c3 = cone(0.31, 0.48, 0x4cae52); c3.position.set(x, 1.72, zc);
        grp.add(c1, c2, c3);
      } else {
        const s = 0.86 + Math.random() * 0.2;
        const l1 = box(0.84 * s, 0.5 * s, 0.84 * s, 0x2f8a3e, 'p'); l1.position.set(x, 0.86, zc);
        const l2 = box(0.7 * s, 0.42 * s, 0.7 * s, 0x43a84b, 'p'); l2.position.set(x - 0.06, 1.22, zc + 0.05);
        const l3 = box(0.5 * s, 0.36 * s, 0.5 * s, 0x5cc25a, 'p'); l3.position.set(x + 0.04, 1.54, zc - 0.03);
        const tp = box(0.28 * s, 0.24 * s, 0.28 * s, 0x74d168, 'p'); tp.position.set(x, 1.8, zc);
        grp.add(l1, l2, l3, tp);
        if (v === 2) {
          for (let k = 0; k < 4; k++) {
            const fr = box(0.12, 0.12, 0.12, k % 2 ? 0xff4d4d : 0xff9f1c, 'p');
            fr.position.set(x + (k % 2 ? 0.3 : -0.28), 0.92 + (k >> 1) * 0.4, zc + (k < 2 ? 0.32 : -0.3));
            grp.add(fr);
          }
        }
      }
      row.trees.push(x);
    }

    /* ── row factory ───────────────────────────────── */
    function makeRow(i) {
      const grp = new THREE.Group();
      grp.scale.set(1, 1, 1);
      const zc = rowZ(i);
      /* type: random phase per row (deterministic under stubbed rng) */
      let type = TYPES[(i + Math.floor(Math.random() * 3)) % 3];
      if (i < 5) type = 'grass';
      else if (type === 'river' && rows[i - 1] && rows[i - 1].type === 'river') type = 'grass';

      const row = {
        i, type, group: grp, z: zc,
        trees: [], coins: [], cars: [], logs: [], striders: [],
        dir: 1, speed: 0, carPeriod: 0, carTimer: 0, logPeriod: 0, logTimer: 0, logLen: 3,
        water: null, t: Math.random() * 6,
      };
      const W = STRIP_W;

      if (type === 'grass') {
        /* soil skirt + bright turf top (classic daylight look) */
        const soil = box(W, 0.3, ROW_W, 0x7a5230, 'p');
        soil.position.set(0, -0.2, zc); soil.castShadow = false;
        grp.add(soil);
        const base = box(W, 0.06, ROW_W, i % 2 ? 0xbaf455 : 0xa9e04a, 'p');
        base.position.set(0, -0.03, zc); base.castShadow = false;
        grp.add(base);
        const edge = box(W, 0.05, 0.06, 0xf4fff0, 'b');
        edge.position.set(0, 0.03, zc - ROW_W / 2 + 0.03);
        edge.castShadow = false;
        grp.add(edge);
        /* sidewalk strip on the back edge */
        const walk = box(W, 0.07, 0.16, 0xc9cfda, 'p');
        walk.position.set(0, 0.035, zc + ROW_W / 2 - 0.07);
        walk.castShadow = false;
        grp.add(walk);

        /* coin (rolled before trees; cell must stay clear) */
        let coinX = null;
        if (i >= 5 && Math.random() < 0.55) coinX = Math.floor(Math.random() * (2 * X_LIMIT + 1)) - X_LIMIT;

        /* trees: dense in the play band, sparser out to the frame edges */
        if (i > 0) {
          for (let x = -16; x <= 16; x++) {
            if (x === coinX) continue;
            const p = Math.abs(x) <= X_LIMIT ? 0.3 : 0.14;
            if (Math.random() < p) buildTree(row, grp, x, zc);
          }
        }

        /* path-edge decor: flowers + grass tufts (never on the walking line) */
        const FC = [0xff6fa5, 0xffd45c, 0x7ec8ff, 0xffffff];
        const decorN = 4 + (i % 3);
        for (let k = 0; k < decorN; k++) {
          const dx = Math.floor(Math.random() * 33) - 16;
          if (row.trees.indexOf(dx) !== -1 || dx === coinX) continue;
          const side = Math.random() < 0.5 ? -1 : 1;
          const dz = side * (0.3 + Math.random() * 0.12);
          const jx = (Math.random() - 0.5) * 0.4;
          if (Math.random() < 0.55) {
            const pick = FC[Math.floor(Math.random() * FC.length)];
            const fl = box(0.1, 0.1, 0.1, pick, 'p');
            fl.position.set(dx + jx, 0.07, zc + dz);
            grp.add(fl);
          } else {
            const tuft = box(0.07, 0.18, 0.07, 0x3fa34d, 'p');
            tuft.position.set(dx + jx, 0.09, zc + dz);
            grp.add(tuft);
          }
        }

        if (coinX !== null) {
          const cgrp = new THREE.Group();
          cgrp.scale.set(1, 1, 1);
          const disc = cyl(0.24, 0.07, 0xffd23c, 'l', { emissive: 0x806000 });
          disc.rotation.x = Math.PI / 2;
          cgrp.add(disc);
          /* soft gold pad on the ground under the coin */
          const ring = cyl(0.4, 0.02, 0xffe066, 'b', { transparent: true, opacity: 0.32 });
          ring.position.y = -0.57;
          cgrp.add(ring);
          cgrp.position.set(coinX, 0.6, zc);
          grp.add(cgrp);
          row.coins.push({ x: coinX, grp: cgrp, taken: false, anim: 0 });
        }
      }

      if (type === 'road') {
        const base = box(W, 0.32, ROW_W, 0x454a59, 'p');
        base.position.set(0, -0.16, zc);
        base.castShadow = false;
        grp.add(base);
        /* white curbs on both edges */
        const c1 = box(W, 0.05, 0.06, 0xe8eeff, 'b');
        c1.position.set(0, 0.03, zc - ROW_W / 2 + 0.03);
        const c2 = box(W, 0.05, 0.06, 0xc9d2e8, 'b');
        c2.position.set(0, 0.03, zc + ROW_W / 2 - 0.03);
        c1.castShadow = false; c2.castShadow = false;
        grp.add(c1, c2);
        for (let x = -19; x <= 19; x += 2) {
          const dash = box(0.7, 0.02, 0.06, 0xf0f4ff, 'b');
          dash.position.set(x, 0.01, zc);
          dash.castShadow = false;
          grp.add(dash);
          /* reflective road stud between dashes */
          const stud = box(0.1, 0.03, 0.1, 0xffffff, 'b');
          stud.position.set(x + 1, 0.015, zc);
          stud.castShadow = false;
          grp.add(stud);
        }
        row.dir = i % 2 === 0 ? 1 : -1;
        row.speed = (5.5 + i * 0.22) * (0.8 + Math.random() * 0.4);
        row.carPeriod = (9 + Math.random() * 6) / row.speed;
        row.carTimer = Math.random() * row.carPeriod;
        /* pre-seed traffic so the road is alive immediately */
        spawnCar(row, -row.dir * 13);
        spawnCar(row, -row.dir * 19.5);
      }

      if (type === 'river') {
        const water = box(W, 0.24, ROW_W, 0x2f7dff, 'p');
        water.position.set(0, -0.2, zc);
        water.castShadow = false;
        water.receiveShadow = true;
        grp.add(water);
        row.water = water;
        /* light bank edge + foam at both banks */
        const edge = box(W, 0.05, 0.06, 0x9adcff, 'b');
        edge.position.set(0, 0.03, zc - ROW_W / 2 + 0.03);
        edge.castShadow = false;
        grp.add(edge);
        const foam1 = box(W, 0.03, 0.1, 0xffffff, 'b', { transparent: true, opacity: 0.55 });
        foam1.position.set(0, -0.04, zc - ROW_W / 2 + 0.09);
        const foam2 = box(W, 0.03, 0.1, 0xffffff, 'b', { transparent: true, opacity: 0.4 });
        foam2.position.set(0, -0.04, zc + ROW_W / 2 - 0.09);
        grp.add(foam1, foam2);
        /* lily pads drift with the current */
        for (let k = 0; k < 3; k++) {
          const s = cyl(0.32 - k * 0.05, 0.05, k % 2 ? 0x3fa34d : 0x4db85a, 'p');
          s.castShadow = false;
          s.position.set(-14 + k * 6 + Math.random() * 4, -0.06, zc + (k - 1) * 0.28);
          grp.add(s);
          row.striders.push({ mesh: s, x: s.position.x, spd: (0.7 + Math.random() * 0.6) * (i % 2 === 0 ? 1 : -1) });
        }
        row.dir = i % 2 === 0 ? 1 : -1;
        row.speed = (2.4 + i * 0.05) * (0.8 + Math.random() * 0.4);
        row.logPeriod = (6 + Math.random() * 4) / row.speed;
        row.logTimer = Math.random() * row.logPeriod;
        row.logLen = 2 + Math.floor(Math.random() * 3);
        /* pre-seed logs so the river is crossable right away */
        spawnLog(row, -row.dir * 12);
        spawnLog(row, -row.dir * 18);
      }

      scene.add(grp);
      return row;
    }

    function spawnCar(row, atX) {
      const grp = new THREE.Group();
      grp.scale.set(1, 1, 1);
      const col = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
      const truck = Math.random() < 0.3;
      let half;
      const wheel = (x, z, r) => {
        const w = cyl(r, 0.16, 0x23262e, 'p');
        w.rotation.x = Math.PI / 2;
        w.position.set(x, r, z);
        grp.add(w);
      };
      if (!truck) {
        /* classic car: body + window-textured cabin */
        const b = box(1.7, 0.3, 0.7, col, 'p'); b.position.set(0, 0.3, 0);
        const cab = new THREE.Mesh(geoBox, CAB_MATS);
        cab.scale.set(0.9, 0.3, 0.62); cab.position.set(-0.1, 0.58, 0);
        cab.castShadow = true; cab.receiveShadow = true;
        grp.add(b, cab);
        const lamp1 = box(0.07, 0.09, 0.14, 0xfff6d8, 'b'); lamp1.position.set(0.86, 0.3, -0.22);
        const lamp2 = box(0.07, 0.09, 0.14, 0xfff6d8, 'b'); lamp2.position.set(0.86, 0.3, 0.22);
        const tail1 = box(0.06, 0.08, 0.13, 0xe63950, 'b'); tail1.position.set(-0.86, 0.3, -0.22);
        const tail2 = box(0.06, 0.08, 0.13, 0xe63950, 'b'); tail2.position.set(-0.86, 0.3, 0.22);
        grp.add(lamp1, lamp2, tail1, tail2);
        wheel(0.55, -0.36, 0.15); wheel(0.55, 0.36, 0.15);
        wheel(-0.55, -0.36, 0.15); wheel(-0.55, 0.36, 0.15);
        half = 0.85;
      } else {
        /* box truck: lead cabin + cargo body */
        const base = box(3.0, 0.14, 0.66, 0x2f3542, 'p'); base.position.set(0, 0.24, 0);
        const cargo = box(1.9, 0.74, 0.68, 0xeef2fb, 'p'); cargo.position.set(-0.5, 0.66, 0);
        const stripe = box(1.94, 0.16, 0.7, col, 'p'); stripe.position.set(-0.5, 0.36, 0);
        const cab = new THREE.Mesh(geoBox, CAB_MATS);
        cab.scale.set(0.95, 0.55, 0.64); cab.position.set(1.0, 0.55, 0);
        cab.castShadow = true; cab.receiveShadow = true;
        grp.add(base, cargo, stripe, cab);
        const lamp1 = box(0.07, 0.1, 0.14, 0xfff6d8, 'b'); lamp1.position.set(1.48, 0.36, -0.22);
        const lamp2 = box(0.07, 0.1, 0.14, 0xfff6d8, 'b'); lamp2.position.set(1.48, 0.36, 0.22);
        const tail1 = box(0.06, 0.1, 0.13, 0xe63950, 'b'); tail1.position.set(-1.5, 0.34, -0.24);
        const tail2 = box(0.06, 0.1, 0.13, 0xe63950, 'b'); tail2.position.set(-1.5, 0.34, 0.24);
        grp.add(lamp1, lamp2, tail1, tail2);
        wheel(1.0, -0.36, 0.17); wheel(1.0, 0.36, 0.17);
        wheel(-0.8, -0.36, 0.17); wheel(-0.8, 0.36, 0.17);
        wheel(-1.4, -0.36, 0.17); wheel(-1.4, 0.36, 0.17);
        half = 1.6;
      }
      grp.rotation.y = row.dir > 0 ? 0 : Math.PI;
      const spawnX = atX !== undefined ? atX : -row.dir * SPAWN_X;
      grp.position.set(spawnX, 0, row.z);
      scene.add(grp);
      row.cars.push({ grp, x: spawnX, half });
    }

    function spawnLog(row, atX) {
      const grp = new THREE.Group();
      grp.scale.set(1, 1, 1);
      const log = cyl(0.3, row.logLen, 0xa9713f, 'p');
      log.rotation.z = Math.PI / 2;
      grp.add(log);
      const band = box(row.logLen * 0.4, 0.1, 0.1, 0x8a5a30, 'p');
      band.position.y = 0.24;
      grp.add(band);
      const cap1 = cyl(0.31, 0.06, 0xc08a52, 'p');
      cap1.rotation.z = Math.PI / 2; cap1.position.x = row.logLen / 2;
      const cap2 = cyl(0.31, 0.06, 0xc08a52, 'p');
      cap2.rotation.z = Math.PI / 2; cap2.position.x = -row.logLen / 2;
      grp.add(cap1, cap2);
      const spawnX = atX !== undefined ? atX : -row.dir * LOG_SPAWN;
      grp.position.set(spawnX, 0.1, row.z);
      scene.add(grp);
      row.logs.push({ grp, x: spawnX, len: row.logLen });
    }

    /* ── row streaming ─────────────────────────────── */
    function ensureRows() {
      const from = Math.max(0, ch.row - KEEP_BACK);
      const to = ch.row + KEEP_AHEAD;
      for (let i = from; i <= to; i++) if (!rows[i]) rows[i] = makeRow(i);
    }
    function disposeRow(row) {
      scene.remove(row.group);
      rows[row.i] = null;
    }
    function clearWorld() {
      for (const r of rows) if (r) scene.remove(r.group);
      rows = [];
    }

    /* ── flow ──────────────────────────────────────── */
    function start() {
      clearWorld();
      maxRow = 0; coinBonus = 0; coins = 0;
      ch.x = 0; ch.z = rowZ(0); ch.y = 0; ch.row = 0; ch.vy = 0;
      ch.hopping = false; ch.queued = null; ch.ride = null; ch.sink = 0;
      ch.facing = 0; ch.faceT = 0; ch.deathSpin = 0;
      chicken.rotation.set(0, 0, 0);
      chicken.position.set(0, 0, rowZ(0));
      killT = 0; killZ = ch.z - 2.5;
      deathT = 0; deathCause = ''; overCalled = false;
      camX = 0; camZ = ch.z; shakeT = 0;
      bump = 0;
      clearFx();
      ensureRows();
      killGrp.position.z = killZ;
      ctx.setScore(0);
      phase = 'ready';
      hint.classList.remove('is-out');
      menu.classList.add('is-out');
      Sfx.play('start');
    }

    function updateScore() {
      ctx.setScore(maxRow + coinBonus);
      if (maxRow > 0 && maxRow % 10 === 0) {
        ctx.toast('★ ' + maxRow + ' ROWS ★');
        Sfx.play('power');
      }
    }

    function startHop(d) {
      /* screen-space semantics: under this rig world +X renders screen-LEFT,
         so a "left" input must move +X in the world */
      const dx = d === 'left' ? 1 : d === 'right' ? -1 : 0;
      const dz = d === 'up' ? 1 : d === 'down' ? -1 : 0;
      const tx = ch.x + dx;
      const tr = ch.row + dz;
      if (tr < 0 || tx < -X_LIMIT || tx > X_LIMIT) { blocked(); return; }
      ensureRows();
      const target = rows[tr];
      if (!target) { blocked(); return; }
      if (target.type === 'grass' && target.trees.indexOf(tx) !== -1) { blocked(); return; }
      ch.hopping = true;
      ch.hopT = 0;
      ch.hopY0 = ch.y;
      ch.fromX = ch.x; ch.fromZ = ch.z;
      ch.toX = tx; ch.toZ = rowZ(tr); ch.toRow = tr;
      ch.queued = null;
      const face = d === 'up' ? 0 : d === 'down' ? Math.PI : d === 'right' ? -Math.PI / 2 : Math.PI / 2;
      ch.facing = face;
      Sfx.play('jump');
    }

    function requestHop(d) {
      if (paused || !alive) return;
      if (phase === 'menu' || phase === 'dying' || phase === 'over') return;
      if (phase === 'ready') {
        phase = 'playing';
        killT = 0; killZ = ch.z - 2.5;
        hint.classList.add('is-out');
      }
      if (phase !== 'playing') return;
      if (ch.hopping) { ch.queued = d; return; }
      startHop(d);
    }

    function land() {
      ch.x = ch.toX;
      ch.z = ch.toZ;
      ch.row = ch.toRow;
      ch.hopping = false;
      ch.ride = null;
      ch.sink = 0;
      if (ch.row > maxRow) { maxRow = ch.row; updateScore(); }
      burst('puff', ch.x, 0, ch.z);
      const rw = rows[ch.row];
      if (rw) {
        for (const c of rw.coins) {
          if (!c.taken && c.x === ch.x) {
            c.taken = true;
            c.anim = 0.001;
            coinBonus += 10;
            coins++;
            updateScore();
            Sfx.play('coin');
          }
        }
      }
      if (ch.queued) { const q = ch.queued; ch.queued = null; startHop(q); }
    }

    /* blocked hop: wiggle + soft click so controls never feel dead */
    function blocked() {
      bump = 0.24;
      Sfx.play('click');
    }

    /* ── particle bursts (feathers / splash / dust) ── */
    const fx = [];
    function burst(kind, x, y, z) {
      const cols = kind === 'splash' ? [0xbfeaff, 0x4dd7ff, 0xffffff]
        : kind === 'puff' ? [0xf2f4ff, 0xc9d2e8]
        : [0xf6f7ff, 0xff2e55, 0xffb02e, 0xdfe6ff];
      const n = kind === 'puff' ? 3 : 14;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = kind === 'puff' ? 0.5 + Math.random() * 0.7 : 2 + Math.random() * 4;
        const m = box(kind === 'puff' ? 0.07 : 0.1 + Math.random() * 0.12,
          0.05 + Math.random() * 0.1, 0.1, cols[i % cols.length], 'b');
        m.position.set(x, y + (kind === 'splash' ? 0.1 : 0.35), z);
        scene.add(m);
        fx.push({
          m,
          vx: Math.cos(a) * sp, vz: Math.sin(a) * sp * 0.7,
          vy: kind === 'splash' ? 3.4 + Math.random() * 4
            : kind === 'puff' ? 1 + Math.random() * 1.2
            : 2.6 + Math.random() * 4.4,
          t: 0, life: kind === 'puff' ? 0.34 : 0.55 + Math.random() * 0.55,
          rx: (Math.random() - 0.5) * 14, ry: (Math.random() - 0.5) * 14,
        });
      }
    }
    function updateFx(dt) {
      for (let i = fx.length - 1; i >= 0; i--) {
        const p = fx[i];
        p.t += dt;
        p.vy -= 13 * dt;
        p.m.position.x += p.vx * dt;
        p.m.position.y += p.vy * dt;
        p.m.position.z += p.vz * dt;
        if (p.m.position.y < 0.05) { p.m.position.y = 0.05; p.vy *= -0.35; }
        p.m.rotation.x += p.rx * dt;
        p.m.rotation.y += p.ry * dt;
        if (p.t >= p.life) { scene.remove(p.m); fx.splice(i, 1); }
      }
    }
    function clearFx() {
      for (const p of fx) scene.remove(p.m);
      fx.length = 0;
    }

    function die(cause) {
      if (phase !== 'playing') return;
      phase = 'dying';
      deathT = 0;
      deathCause = cause;
      shakeT = 0.32;
      bump = 0;
      /* quick white flash (re-trigger animation) */
      flash.classList.remove('cx-on');
      void flash.offsetWidth;
      flash.classList.add('cx-on');
      if (cause === 'water') {
        ch.vy = 0;
        burst('splash', ch.x, 0, ch.z);
      } else {
        ch.vy = 4.6 + Math.random() * 1.6;
        ch.deathSpin = 7 + Math.random() * 3;
        ch.facing += (Math.random() - 0.5) * 1.4;
        burst('feather', ch.x, 0.3, ch.z);
      }
      Sfx.play('hit');
    }

    function finish() {
      if (overCalled) return;
      overCalled = true;
      phase = 'over';
      const title = deathCause === 'car' ? 'FLATTENED!'
        : deathCause === 'water' ? 'SPLASHED!'
        : 'TOO SLOW!';
      const score = maxRow + coinBonus;
      const msg = coinBonus ? `${score} pts · ${coins} 🪙` : `${score} pts`;
      Sfx.play('lose');
      ctx.gameOver({ title, message: msg });
    }

    /* ── input: swipe / tap / keyboard ─────────────── */
    let ptr = null;
    const onDown = e => {
      if (e.cancelable) e.preventDefault();
      /* capture only from the game surface so releases outside still land —
         capturing from UI buttons would retarget their click events */
      if (e.pointerId != null && typeof host.setPointerCapture === 'function'
          && (e.target === glCanvas || e.target === host)) {
        try { host.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
      }
      ptr = { x: e.clientX || 0, y: e.clientY || 0, t: performance.now() };
    };
    const onUp = e => {
      if (!ptr) return;
      const dx = (e.clientX || 0) - ptr.x;
      const dy = (e.clientY || 0) - ptr.y;
      const dt = performance.now() - ptr.t;
      ptr = null;
      const adx = Math.abs(dx), ady = Math.abs(dy);
      /* small / quick movement = forward hop; anything bigger commits to a swipe */
      if (adx < 18 && ady < 18) { if (dt < 450) requestHop('up'); return; }
      if (ady >= adx) requestHop(dy < 0 ? 'up' : 'down');
      else requestHop(dx < 0 ? 'left' : 'right');
    };
    const onCancel = () => { ptr = null; };
    const onKey = e => {
      /* note: e.repeat is allowed — holding a key keeps hopping */
      const k = e.key;
      if (k === 'ArrowUp' || k === 'w' || k === 'W' || k === ' ') {
        e.preventDefault(); requestHop('up');
      } else if (k === 'ArrowDown' || k === 's' || k === 'S') {
        e.preventDefault(); requestHop('down');
      } else if (k === 'ArrowLeft' || k === 'a' || k === 'A') {
        e.preventDefault(); requestHop('left');
      } else if (k === 'ArrowRight' || k === 'd' || k === 'D') {
        e.preventDefault(); requestHop('right');
      }
    };

    host.addEventListener('pointerdown', onDown);
    host.addEventListener('pointerup', onUp);
    host.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey);
    btnPlay.addEventListener('click', () => { if (phase === 'menu') start(); });

    /* ── update ────────────────────────────────────── */
    function updatePlaying(dt) {
      ensureRows();
      /* hop tween */
      if (ch.hopping) {
        ch.hopT += dt;
        const p = Math.min(1, ch.hopT / HOP_T);
        ch.x = lerp(ch.fromX, ch.toX, p);
        ch.z = lerp(ch.fromZ, ch.toZ, p);
        ch.y = lerp(ch.hopY0 || 0, 0, p) + Math.sin(Math.PI * p) * 0.5;
        const flap = Math.sin(p * Math.PI);
        wingL.rotation.z = flap * 0.7;
        wingR.rotation.z = -flap * 0.7;
        legL.position.y = 0.13 + flap * 0.1;
        legR.position.y = 0.13 + flap * 0.1;
        if (ch.hopT >= HOP_T) {
          wingL.rotation.z = 0; wingR.rotation.z = 0;
          legL.position.y = 0.13; legR.position.y = 0.13;
          land();
        }
      } else {
        /* water ride / drown */
        const zRow = Math.max(0, Math.floor(ch.z));
        const rw = rows[zRow];
        if (rw && rw.type === 'river') {
          let sup = null;
          for (const l of rw.logs) {
            if (Math.abs(ch.x - l.x) <= l.len / 2 + 0.2) { sup = l; break; }
          }
          if (sup) {
            ch.ride = sup;
            ch.sink = 0;
            ch.x = clamp(ch.x + rw.dir * rw.speed * dt, -X_LIMIT - 0.6, X_LIMIT + 0.6);
            ch.y += (0.4 - ch.y) * Math.min(1, dt * 12);
          } else {
            ch.ride = null;
            ch.sink += dt;
            ch.y += (0 - ch.y) * Math.min(1, dt * 12);
            if (ch.sink > 0.3) { die('water'); return; }
          }
        } else {
          ch.ride = null;
          ch.sink = 0;
          ch.y += (0 - ch.y) * Math.min(1, dt * 12);
        }
      }

      /* car collision (row under the chicken's current z) */
      const zRow2 = Math.max(0, Math.floor(ch.z));
      const road = rows[zRow2];
      if (road && road.type === 'road') {
        for (const c of road.cars) {
          if (Math.abs(c.x - ch.x) < (c.half || 0.85) + 0.3) { die('car'); return; }
        }
      }

      /* danger line */
      killT += dt;
      if (killT > 8) {
        killZ += (0.35 + Math.min(maxRow, 60) * 0.01) * dt;
        killGrp.position.z = killZ;
        if (killZ > ch.z - 0.35) { die('slow'); return; }
      }

      /* stream rows */
      const cut = ch.row - KEEP_BACK;
      for (let i = 0; i < cut; i++) if (rows[i]) disposeRow(rows[i]);
    }

    function updateWorld(dt) {
      /* always-on ambience: clouds, coins, water shimmer, logs/cars only while playing */
      for (const c of clouds) {
        c.grp.position.x += c.spd * dt;
        if (c.grp.position.x > 26) c.grp.position.x = -26;
      }
      const active = phase === 'playing';
      for (const row of rows) {
        if (!row) continue;
        if (row.water) {
          row.water.position.y = -0.2 + Math.sin(worldT * 2 + row.i) * 0.015;
        }
        for (const s of row.striders) {
          s.x += s.spd * dt;
          if (s.x > 20) s.x = -20;
          if (s.x < -20) s.x = 20;
          s.mesh.position.x = s.x;
        }
        for (const c of row.coins) {
          if (c.anim > 0) {
            c.anim += dt;
            const k = Math.min(1, c.anim / 0.28);
            c.grp.scale.set(1 + k * 1.6, 1 + k * 1.6, 1 + k * 1.6);
            c.grp.position.y = 0.6 + k * 0.9;
            if (k >= 1) { c.grp.position.y = -8; }  // fly away done → hide
          } else {
            c.grp.rotation.y += dt * 2.8;
            c.grp.position.y = 0.6 + Math.sin(worldT * 3 + row.i) * 0.08;
          }
        }
        if (!active) continue;
        if (Math.abs(row.i - ch.row) > 15) continue;   // simulate traffic near the chicken
        /* traffic + logs advance only during play */
        if (row.type === 'road') {
          row.carTimer -= dt;
          if (row.carTimer <= 0 && row.cars.length < 6) {
            spawnCar(row);
            row.carTimer = row.carPeriod;
          }
          for (let k = row.cars.length - 1; k >= 0; k--) {
            const c = row.cars[k];
            c.x += row.dir * row.speed * dt;
            c.grp.position.x = c.x;
            if (Math.abs(c.x) > DESPAWN_X) {
              scene.remove(c.grp);
              row.cars.splice(k, 1);
            }
          }
        }
        if (row.type === 'river') {
          row.logTimer -= dt;
          if (row.logTimer <= 0 && row.logs.length < 6) {
            spawnLog(row);
            row.logTimer = row.logPeriod;
          }
          for (let k = row.logs.length - 1; k >= 0; k--) {
            const l = row.logs[k];
            l.x += row.dir * row.speed * dt;
            l.grp.position.x = l.x;
            l.grp.position.y = 0.1 + Math.sin(worldT * 2.4 + l.x * 0.6) * 0.03;
            if (Math.abs(l.x) > LOG_DESPAWN) {
              scene.remove(l.grp);
              row.logs.splice(k, 1);
            }
          }
        }
      }
    }

    function updateDying(dt) {
      deathT += dt;
      if (deathCause === 'water') {
        ch.y -= dt * 1.15;
        chicken.rotation.z = Math.sin(deathT * 7) * 0.35;
        chicken.rotation.y = ch.facing;
      } else {
        ch.vy -= 14 * dt;
        ch.y += ch.vy * dt;
        chicken.rotation.x += ch.deathSpin * dt;
        chicken.rotation.y = ch.facing;
        if (ch.y < 0) { ch.y = 0; ch.vy = 0; ch.deathSpin *= 0.9; }
      }
      if (deathT >= 0.95) finish();
    }

    function updateCamera(dt) {
      camX = lerp(camX, ch.x, Math.min(1, dt * 7));
      camZ = lerp(camZ, ch.z, Math.min(1, dt * 8));
      let sx = 0, sy = 0;
      if (shakeT > 0) {
        shakeT = Math.max(0, shakeT - dt);
        const m = shakeT * 7;
        sx = (Math.random() - 0.5) * m;
        sy = (Math.random() - 0.5) * m;
      }
      /* reference rig: aim 4 ahead of the chicken, chicken lands low-third */
      const ax = camX + sx, ay = 1.6 + sy, az = camZ + 4;
      camera.position.set(
        ax - VIEW_D[0] * VIEW_DIST,
        ay - VIEW_D[1] * VIEW_DIST,
        az - VIEW_D[2] * VIEW_DIST
      );
      camera.up.set(VIEW_UP[0], VIEW_UP[1], VIEW_UP[2]);
      camera.lookAt(ax, ay, az);
      /* sun tracks the chicken so shadows stay crisp in frame
         (light from behind-left → shadows fall screen-right, classic look) */
      sun.position.set(camX + 9, 15, camZ - 6);
      sun.target.position.set(camX, 0, camZ + 4);
      sun.target.updateMatrixWorld();
    }

    function update(dt) {
      if (!alive || paused) return;
      worldT += dt;
      updateWorld(dt);
      updateFx(dt);
      if (phase === 'playing') {
        updatePlaying(dt);
        /* facing lerp */
        let d = ch.facing - chicken.rotation.y;
        d = ((d + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
        chicken.rotation.y += d * Math.min(1, dt * 14);
      } else if (phase === 'dying') {
        updateDying(dt);
      } else if (phase === 'ready' || phase === 'menu') {
        chicken.position.set(ch.x, Math.sin(worldT * 3) * 0.03, ch.z);
        chicken.rotation.y = lerp(chicken.rotation.y, 0, Math.min(1, dt * 8));
        /* idle wing flutter */
        const wig = Math.sin(worldT * 6) * 0.12;
        wingL.rotation.z = wig; wingR.rotation.z = -wig;
      }
      /* danger-line warning vignette */
      if (phase === 'playing' && killT > 8 && killZ > ch.z - 1.6) host.classList.add('cx-danger');
      else host.classList.remove('cx-danger');
      /* sync chicken transform to numeric state */
      if (phase === 'playing') {
        const bob = ch.hopping ? 0 : Math.sin(worldT * 5) * 0.02;
        chicken.position.set(ch.x, ch.y + bob, ch.z);
        if (bump > 0) {
          bump = Math.max(0, bump - dt);
          chicken.rotation.z = Math.sin(bump * 46) * 0.16 * (bump / 0.24);
        } else if (!ch.hopping) chicken.rotation.z = 0;
      } else if (phase === 'dying') {
        chicken.position.set(ch.x, ch.y, ch.z);
      }
      updateCamera(dt);
    }

    /* ── render loop ───────────────────────────────── */
    function resize(w, h) {
      w = w || host.clientWidth || 800;
      h = h || host.clientHeight || 600;
      renderer.setSize(w, h);
      const aspect = w / h;
      /* ortho frame height — a little taller on narrow portrait phones */
      const fh = aspect < 0.8 ? 21 : 16;
      camera.left = -fh * aspect / 2;
      camera.right = fh * aspect / 2;
      camera.top = fh / 2;
      camera.bottom = -fh / 2;
      camera.updateProjectionMatrix();
    }

    let raf = 0, last = 0;
    function frame(now) {
      if (!alive) return;
      raf = requestAnimationFrame(frame);
      if (!last) last = now;
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.05) dt = 0.05;
      update(dt);
      renderer.render(scene, camera);
    }

    /* boot */
    resize();
    chicken.position.set(0, 0, rowZ(0));
    updateCamera(0.02);
    ensureRows();
    killGrp.position.z = killZ;
    raf = requestAnimationFrame(frame);

    /* ── lifecycle ─────────────────────────────────── */
    return {
      pause() { paused = true; },
      resume() { paused = false; last = 0; },
      restart() { start(); },
      resize(w, h) { resize(w, h); },
      destroy() {
        alive = false;
        cancelAnimationFrame(raf);
        host.removeEventListener('pointerdown', onDown);
        host.removeEventListener('pointerup', onUp);
        host.removeEventListener('pointercancel', onCancel);
        window.removeEventListener('keydown', onKey);
        clearWorld();
        clearFx();
        if (pad.parentNode) pad.parentNode.removeChild(pad);
        if (flash.parentNode) flash.parentNode.removeChild(flash);
        geoBox.dispose(); geoCyl.dispose(); geoCone.dispose(); geoCircle.dispose(); geoSphere.dispose();
        for (const t of texList) t.dispose();
        for (const m of mats) m.dispose();
        renderer.dispose();
        if (glCanvas.parentNode) glCanvas.parentNode.removeChild(glCanvas);
        if (menu.parentNode) menu.parentNode.removeChild(menu);
        if (hint.parentNode) hint.parentNode.removeChild(hint);
        host.classList.remove('cx-host', 'cx-danger');
      },
      /* read-only introspection for headless smoke tests */
      getState() {
        const lanes = [];
        const top = Math.min(rows.length - 1, ch.row + 12);
        for (let i = 0; i <= top; i++) lanes.push(rows[i] ? rows[i].type : null);
        return {
          phase, row: ch.row, x: ch.x,
          score: maxRow + coinBonus, coins,
          lanes, killZ,
        };
      },
    };
  },
});
