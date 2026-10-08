/* ═══════════════════════════════════════════════════════
   TOWER BLOCKS — 3D stacker (Three.js), tap to drop
   Perfect drops grow your combo · miss and the tower falls
   ═══════════════════════════════════════════════════════ */
registerGame({
  id: 'tower',
  title: 'Tower Blocks',
  genre: 'Arcade',
  emoji: '🏗️',
  colors: ['#7c5cff', '#2dff9e'],
  description: 'A neon block sweeps across the tower — tap to drop it dead-center. Perfect hits stack a combo; drift too far and the block topples.',
  featured: true,
  controls: [
    { key: 'TAP · CLICK', label: 'Drop block' },
    { key: 'SPACE', label: 'Drop block' },
  ],
  create(ctx) {
    'use strict';

    if (typeof THREE === 'undefined') {
      ctx.container.innerHTML =
        '<div class="empty"><div class="empty__ic">🧊</div><h3>THREE.JS MISSING</h3></div>';
      return { pause() {}, resume() {}, restart() {}, resize() {}, destroy() {} };
    }

    /* ── constants ──────────────────────────────────── */
    const BH = 1;               // block height
    const BASE = 5;             // base width/depth
    const SWEEP = 3.1;          // oscillation margin (must ≥ w/2 so misses are possible)
    const BG = 0x0a0b1d;        // fog = .tb-host CSS gradient mid-tone (sky blends)
    const BASE_COL = 0x18224a;  // dark plinth for the foundation block
    const COARSE = matchMedia('(pointer:coarse)').matches;

    /* ── renderer / scene ───────────────────────────── */
    const host = ctx.container;
    host.classList.add('tb-host');
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(DPR);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(BG, 22, 80);

    const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 300);
    camera.position.set(0, 7, 17);

    /* lights */
    scene.add(new THREE.AmbientLight(0x5a5f8f, 0.85));
    const key = new THREE.DirectionalLight(0xffffff, 1.05);
    key.castShadow = true;
    key.shadow.mapSize.set(COARSE ? 512 : 1024, COARSE ? 512 : 1024);
    key.shadow.camera.left = -11; key.shadow.camera.right = 11;
    key.shadow.camera.top = 11; key.shadow.camera.bottom = -11;
    key.shadow.camera.far = 55;
    key.shadow.bias = -0.0015;
    scene.add(key, key.target);
    const rim = new THREE.PointLight(0x00e5ff, 0.9, 50);
    rim.position.set(-8, 4, -6);
    scene.add(rim);

    /* ground */
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400),
      new THREE.MeshStandardMaterial({ color: 0x0a0e1e, roughness: 1, metalness: 0 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const grid = new THREE.GridHelper(160, 64, 0x00e5ff, 0x7c5cff);
    grid.material.transparent = true;
    grid.material.opacity = 0.16;
    grid.position.y = 0.01;
    scene.add(grid);

    /* radial glow texture (one canvas, reused by all sprites) */
    function makeGlowTexture() {
      const c = document.createElement('canvas');
      c.width = 128; c.height = 128;
      const x = c.getContext('2d');
      const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.3, 'rgba(255,255,255,.5)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = gr;
      x.fillRect(0, 0, 128, 128);
      return new THREE.CanvasTexture(c);
    }
    const glowTex = makeGlowTexture();

    /* pedestal: two glowing rings hugging the ground */
    const ringMat1 = new THREE.MeshBasicMaterial({
      color: 0x00e5ff, transparent: true, opacity: 0.65,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const ringMat2 = new THREE.MeshBasicMaterial({
      color: 0x7c5cff, transparent: true, opacity: 0.45,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const ring1 = new THREE.Mesh(new THREE.TorusGeometry(4.4, 0.07, 6, 72), ringMat1);
    ring1.rotation.x = -Math.PI / 2;
    ring1.position.y = 0.05;
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(5.4, 0.05, 6, 72), ringMat2);
    ring2.rotation.x = -Math.PI / 2;
    ring2.position.y = 0.04;
    scene.add(ring1, ring2);

    /* soft light pool under the tower */
    const baseGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0x2f6bff, transparent: true, opacity: 0.55,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    baseGlow.position.set(0, 0.5, 0);
    baseGlow.scale.set(17, 17, 1);
    scene.add(baseGlow);

    /* star dust (twinkles in the loop) */
    const starMat = new THREE.PointsMaterial({
      size: 0.3, color: 0x8fa8ff, transparent: true, opacity: 0.7,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    (function stars() {
      const n = COARSE ? 170 : 260, pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, r = 26 + Math.random() * 30;
        pos[i * 3] = Math.cos(a) * r;
        pos[i * 3 + 1] = -6 + Math.random() * 120;
        pos[i * 3 + 2] = Math.sin(a) * r;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      scene.add(new THREE.Points(g, starMat));
    })();

    /* rising neon embers around the camera column */
    const EMBER_N = COARSE ? 36 : 64;
    const emberPos = new Float32Array(EMBER_N * 3);
    const emberCol = new Float32Array(EMBER_N * 3);
    const emberBase = new Float32Array(EMBER_N * 3);
    const emberPhase = new Float32Array(EMBER_N);
    const emberGeo = new THREE.BufferGeometry();
    const emberAttr = new THREE.BufferAttribute(emberPos, 3);
    (function embers() {
      for (let i = 0; i < EMBER_N; i++) {
        emberPos[i * 3] = (Math.random() - 0.5) * 36;
        emberPos[i * 3 + 1] = Math.random() * 44 - 6;
        emberPos[i * 3 + 2] = (Math.random() - 0.5) * 22;
        emberPhase[i] = Math.random();
        const cyan = Math.random() < 0.55;
        emberBase[i * 3] = cyan ? 0.0 : 0.49;
        emberBase[i * 3 + 1] = cyan ? 0.9 : 0.36;
        emberBase[i * 3 + 2] = cyan ? 1.0 : 1.0;
      }
      emberGeo.setAttribute('position', emberAttr);
      emberGeo.setAttribute('color', new THREE.BufferAttribute(emberCol, 3));
      scene.add(new THREE.Points(emberGeo, new THREE.PointsMaterial({
        size: 0.42, vertexColors: true, transparent: true, opacity: 0.9,
        depthWrite: false, blending: THREE.AdditiveBlending,
      })));
    })();

    /* neon rail: shows exactly where the block will land */
    const railMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff, transparent: true, opacity: 0.3,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const rail = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), railMat);
    rail.visible = false;
    scene.add(rail);

    /* shared geometry + material cache (small draw setup) */
    const BOX = new THREE.BoxGeometry(1, 1, 1);
    const EDGES = new THREE.EdgesGeometry(BOX);
    const matCache = new Map();
    const MatClass = COARSE ? THREE.MeshStandardMaterial : THREE.MeshPhysicalMaterial;
    function faceParams(hex, over) {
      const p = {
        color: hex, roughness: 0.32, metalness: 0.18,
        emissive: hex, emissiveIntensity: 0.2,
      };
      if (!COARSE) { p.clearcoat = 0.55; p.clearcoatRoughness = 0.3; }
      return Object.assign(p, over);
    }
    function sideMatFor(hex) {
      const k = 's' + hex;
      if (!matCache.has(k)) matCache.set(k, new MatClass(faceParams(hex)));
      return matCache.get(k);
    }
    function topMatFor(hex) {
      const k = 't' + hex;
      if (!matCache.has(k)) {
        const lite = new THREE.Color(hex).lerp(new THREE.Color(0xffffff), 0.28);
        matCache.set(k, new MatClass(faceParams(hex, {
          color: lite, roughness: 0.2, emissiveIntensity: 0.55,
        })));
      }
      return matCache.get(k);
    }
    function botMatFor(hex) {
      const k = 'b' + hex;
      if (!matCache.has(k)) {
        const dark = new THREE.Color(hex).multiplyScalar(0.5);
        matCache.set(k, new MatClass(faceParams(hex, {
          color: dark, emissiveIntensity: 0.05, roughness: 0.7,
        })));
      }
      return matCache.get(k);
    }
    function facesFor(hex) {
      const s = sideMatFor(hex);          // BoxGeometry order: +x,−x,+y,−y,+z,−z
      return [s, s, topMatFor(hex), botMatFor(hex), s, s];
    }
    function edgeMatFor(colorHex) {
      const k = 'e' + colorHex;
      if (!matCache.has(k)) {
        const c = new THREE.Color(colorHex).lerp(new THREE.Color(0xffffff), 0.55);
        matCache.set(k, new THREE.LineBasicMaterial({
          color: c, transparent: true, opacity: 0.9,
        }));
      }
      return matCache.get(k);
    }

    function makeBlock(w, d, colorHex) {
      const mesh = new THREE.Mesh(BOX, facesFor(colorHex));
      mesh.scale.set(w, BH, d);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.hex = colorHex;
      mesh.add(new THREE.LineSegments(EDGES, edgeMatFor(colorHex)));
      return mesh;
    }

    /* curated neon ramp — reads as a designed palette, not raw HSL */
    const PALETTE = [
      0x00e5ff, 0x2dff9e, 0x7cff5e, 0xffd23c, 0xff8a3d,
      0xff2ecd, 0xff5ea8, 0x7c5cff, 0x4d7cff, 0x00ffce,
    ];
    function blockColor(n) { return PALETTE[n % PALETTE.length]; }

    /* ── game state ─────────────────────────────────── */
    const towerGroup = new THREE.Group();
    scene.add(towerGroup);

    let top = null;            // { x, z, w, d } top block footprint
    let topY = 0;              // world Y of stack top
    let mover = null;          // oscillating block mesh
    let axis = 'x';            // active sweep axis for current mover
    let phase = 0, omega = 1.7, amp = 0, cX = 0, cZ = 0;
    let placed = 0, combo = 0, score = 0;
    let over = false, paused = false, droppedOnce = false;
    let introT = 1;              // camera entrance ease (1 → 0)
    const fallingPieces = [];
    const flashes = [];          // { s, m, t, dur, size }

    /* particle burst pool (vertex-coloured additive points) */
    const BURST_N = 90;
    const burstPos = new Float32Array(BURST_N * 3);
    const burstCol = new Float32Array(BURST_N * 3);
    const burstBase = new Float32Array(BURST_N * 3);
    const burstVel = new Float32Array(BURST_N * 3);
    const burstLife = new Float32Array(BURST_N);
    const burstGeo = new THREE.BufferGeometry();
    const burstPosAttr = new THREE.BufferAttribute(burstPos, 3);
    const burstColAttr = new THREE.BufferAttribute(burstCol, 3);
    (function initBurst() {
      burstGeo.setAttribute('position', burstPosAttr);
      burstGeo.setAttribute('color', burstColAttr);
      scene.add(new THREE.Points(burstGeo, new THREE.PointsMaterial({
        size: 0.5, vertexColors: true, transparent: true,
        depthWrite: false, blending: THREE.AdditiveBlending,
      })));
    })();

    function burstAt(x, y, z, n, spd, hex) {
      const r = ((hex >> 16) & 255) / 255;
      const g = ((hex >> 8) & 255) / 255;
      const b = (hex & 255) / 255;
      for (let i = 0; i < BURST_N && n > 0; i++) {
        if (burstLife[i] > 0) continue;
        n--;
        burstLife[i] = 0.5 + Math.random() * 0.4;
        burstPos[i * 3] = x; burstPos[i * 3 + 1] = y; burstPos[i * 3 + 2] = z;
        const a = Math.random() * Math.PI * 2;
        const up = Math.random();
        const v = spd * (0.5 + Math.random() * 0.8);
        burstVel[i * 3] = Math.cos(a) * v;
        burstVel[i * 3 + 1] = v * (0.4 + up * 1.1);
        burstVel[i * 3 + 2] = Math.sin(a) * v;
        burstBase[i * 3] = r; burstBase[i * 3 + 1] = g; burstBase[i * 3 + 2] = b;
        burstCol[i * 3] = r; burstCol[i * 3 + 1] = g; burstCol[i * 3 + 2] = b;
      }
      burstPosAttr.needsUpdate = true;
      burstColAttr.needsUpdate = true;
    }

    /* expanding glow flash */
    function flashAt(x, y, z, size, hex) {
      const m = new THREE.SpriteMaterial({
        map: glowTex, color: hex, transparent: true, opacity: 0.9,
        depthWrite: false, blending: THREE.AdditiveBlending,
      });
      const s = new THREE.Sprite(m);
      s.position.set(x, y, z);
      s.scale.set(size, size, 1);
      scene.add(s);
      flashes.push({ s, m, t: 0, dur: 0.42, size });
    }
    function clearFlashes() {
      while (flashes.length) {
        const f = flashes.pop();
        scene.remove(f.s);
        f.m.dispose();
      }
    }

    /* DOM juice */
    const pop = document.createElement('div');
    pop.className = 'tb-pop';
    host.appendChild(pop);
    const hint = document.createElement('div');
    hint.className = 'tb-hint';
    hint.textContent = 'TAP OR CLICK TO DROP';
    host.appendChild(hint);
    let popTimer = 0;
    function showPop(txt, kind) {
      pop.textContent = txt;
      pop.className = 'tb-pop tb-pop--show' + (kind ? ' tb-pop--' + kind : '');
      popTimer = 0.85;
    }

    /* base block */
    (function buildBase() {
      const base = makeBlock(BASE, BASE, BASE_COL);
      base.position.set(0, BH / 2, 0);
      towerGroup.add(base);
      top = { x: 0, z: 0, w: BASE, d: BASE };
      topY = BH;
    })();

    function spawnMover() {
      axis = Math.random() < 0.5 ? 'x' : 'z';
      amp = (axis === 'x' ? top.w : top.d) / 2 + SWEEP;
      cX = top.x; cZ = top.z;
      phase = Math.random() < 0.5 ? 0 : Math.PI;
      omega = Math.min(3.5, 1.7 + placed * 0.065);
      mover = makeBlock(top.w, top.d, blockColor(placed + 1));
      mover.position.set(cX, topY + BH / 2, cZ);
      mover.userData.spawn = 1;          // scale-in tween
      scene.add(mover);
      /* rail marks the landing plane across the whole sweep */
      rail.visible = true;
      rail.position.set(cX, topY + 0.06, cZ);
      if (axis === 'x') rail.scale.set(amp * 2, 0.05, 0.16);
      else rail.scale.set(0.16, 0.05, amp * 2);
    }

    /* sliced remnant / missed block tumble away */
    function tumbles(mesh, dirX, dirZ) {
      scene.remove(mesh);
      scene.add(mesh);
      mesh.userData.vy = 2 + Math.random() * 2;
      mesh.userData.vx = dirX * (3 + Math.random() * 3);
      mesh.userData.vz = dirZ * (3 + Math.random() * 3);
      mesh.userData.rx = (Math.random() - 0.5) * 6;
      mesh.userData.rz = (Math.random() - 0.5) * 6;
      fallingPieces.push(mesh);
    }

    function dropBlock() {
      if (!mover || over || paused) return;
      const b = mover; mover = null;
      rail.visible = false;
      if (b.userData.spawn > 0) {         // finish spawn tween at full size
        b.userData.spawn = 0;
        b.scale.set(top.w, BH, top.d);
      }
      const p = axis === 'x' ? b.position.x : b.position.z;
      const t = axis === 'x' ? top.x : top.z;
      const w = axis === 'x' ? top.w : top.d;
      const diff = Math.abs(p - t);
      const tol = Math.max(0.14, w * 0.05);

      /* MISS — nothing overlapping */
      if (diff >= w) {
        over = true;
        Sfx.play('hit');
        tumbles(b, axis === 'x' ? Math.sign(p - t) : 0, axis === 'z' ? Math.sign(p - t) : 0);
        setTimeout(() => {
          if (!over) return;
          ctx.gameOver({
            title: 'TOWER DOWN',
            message: `You stacked ${placed} blocks${combo ? ` · best combo ×${combo}` : ''}.`,
          });
        }, 650);
        return;
      }

      /* PERFECT — snap back to centre, keep full size */
      if (diff <= tol) {
        combo++;
        placed++;
        const bonus = 2 * combo;
        score += 1 + bonus;
        if (axis === 'x') b.position.x = top.x; else b.position.z = top.z;
        b.position.y = topY + BH / 2;
        showPop(combo > 1 ? `PERFECT ×${combo}  +${1 + bonus}` : 'PERFECT!  +1',
                combo >= 3 ? 'gold' : '');
        Sfx.play(combo >= 3 ? 'power' : 'coin');
        flashAt(b.position.x, topY + 0.4, b.position.z, 4.5 + combo * 0.6, b.userData.hex);
        burstAt(b.position.x, topY + 0.5, b.position.z,
                10 + Math.min(combo, 8) * 3, 6, b.userData.hex);
        squash(b);
      } else {
        /* slice off the overhang */
        combo = 0;
        placed++;
        score += 1;
        const mid = (top[axis] + p) / 2;
        const newW = w - diff;
        if (axis === 'x') {
          b.position.x = mid; top.x = mid; top.w = newW; b.scale.x = newW;
        } else {
          b.position.z = mid; top.z = mid; top.d = newW; b.scale.z = newW;
        }
        b.position.y = topY + BH / 2;
        /* remnant = slice of mover hanging outside [t-w/2, t+w/2] */
        const sign = Math.sign(p - t) || 1;
        const remesh = makeBlock(
          axis === 'x' ? diff : top.w,
          axis === 'z' ? diff : top.d,
          b.userData.hex
        );
        remesh.position.set(
          axis === 'x' ? mid + sign * (w / 2) : top.x,
          topY + BH / 2,
          axis === 'z' ? mid + sign * (w / 2) : top.z
        );
        tumbles(remesh, axis === 'x' ? sign * 0.7 : 0, axis === 'z' ? sign * 0.7 : 0);
        /* spark at the cut seam */
        burstAt(
          axis === 'x' ? mid + sign * (newW / 2) : top.x,
          topY + 0.5,
          axis === 'z' ? mid + sign * (newW / 2) : top.z,
          7, 4.5, b.userData.hex
        );
        Sfx.play('click');
        squash(b);
      }

      /* every 10 blocks: milestone fanfare */
      if (placed % 10 === 0) {
        showPop(`★ ${placed} BLOCKS! ★`, 'gold');
        flashAt(b.position.x, topY + 0.5, b.position.z, 9, 0xffffff);
        burstAt(b.position.x, topY + 1, b.position.z, 34, 10, b.userData.hex);
        Sfx.play('win');
      }

      ctx.setScore(score);
      if (!droppedOnce) { droppedOnce = true; hint.classList.add('is-out'); }
      topY += BH;
      spawnMover();
    }

    function squash(m) {
      scene.remove(m);        // adopt into tower (restart clears this group)
      towerGroup.add(m);
      m.userData.squash = 1;
    }

    /* ── input ──────────────────────────────────────── */
    const onPointer = e => { e.preventDefault(); dropBlock(); };
    const onKey = e => {
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowDown') {
        e.preventDefault(); dropBlock();
      }
    };
    renderer.domElement.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);

    /* ── camera follow ──────────────────────────────── */
    const cam = { x: 0, y: 7, lookX: 0, lookY: 0 };

    /* ── resize ─────────────────────────────────────── */
    function resize(w, h) {
      w = w || host.clientWidth;
      h = h || host.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
    }
    const onWinResize = () => resize();
    window.addEventListener('resize', onWinResize);

    /* ── main loop ──────────────────────────────────── */
    let raf = 0, last = 0, alive = true;
    function loop(now) {
      if (!alive) return;
      raf = requestAnimationFrame(loop);
      if (!last) last = now;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      if (!paused && !over) {
        /* sweep the mover */
        if (mover) {
          phase += omega * dt;
          if (axis === 'x') mover.position.x = cX + Math.cos(phase) * amp;
          else mover.position.z = cZ + Math.cos(phase) * amp;
          mover.rotation.y = Math.sin(phase) * 0.04;
        }
      }

      /* squash tweens on freshly placed blocks */
      towerGroup.children.forEach(m => {
        if (m.userData && m.userData.squash > 0) {
          m.userData.squash = Math.max(0, m.userData.squash - dt * 6);
          const k = m.userData.squash;
          m.scale.y = BH * (1 - 0.28 * Math.sin(k * Math.PI));
        }
      });

      /* spawn pop-in on the moving block */
      if (mover && mover.userData.spawn > 0) {
        mover.userData.spawn = Math.max(0, mover.userData.spawn - dt * 8);
        const s = 1 - mover.userData.spawn;
        const e = s * (2 - s);                       // easeOutQuad
        const sc = 0.55 + 0.45 * e;
        mover.scale.set(top.w * sc, BH * sc, top.d * sc);
      }

      /* glow flashes expand + fade */
      for (let i = flashes.length - 1; i >= 0; i--) {
        const f = flashes[i];
        f.t += dt;
        if (f.t >= f.dur) {
          scene.remove(f.s);
          f.m.dispose();
          flashes.splice(i, 1);
          continue;
        }
        const k = f.t / f.dur;
        const sz = f.size * (0.55 + k * 1.5);
        f.s.scale.set(sz, sz, 1);
        f.m.opacity = 0.9 * (1 - k);
      }

      /* particle bursts */
      let burstDirty = false;
      for (let i = 0; i < BURST_N; i++) {
        if (burstLife[i] <= 0) continue;
        burstLife[i] -= dt;
        if (burstLife[i] <= 0) {
          burstCol[i * 3] = 0; burstCol[i * 3 + 1] = 0; burstCol[i * 3 + 2] = 0;
          burstDirty = true;
          continue;
        }
        burstVel[i * 3 + 1] -= 9 * dt;
        burstPos[i * 3] += burstVel[i * 3] * dt;
        burstPos[i * 3 + 1] += burstVel[i * 3 + 1] * dt;
        burstPos[i * 3 + 2] += burstVel[i * 3 + 2] * dt;
        const fade = Math.min(1, burstLife[i] * 2.4);
        burstCol[i * 3] = burstBase[i * 3] * fade;
        burstCol[i * 3 + 1] = burstBase[i * 3 + 1] * fade;
        burstCol[i * 3 + 2] = burstBase[i * 3 + 2] * fade;
        burstDirty = true;
      }
      if (burstDirty) {
        burstPosAttr.needsUpdate = true;
        burstColAttr.needsUpdate = true;
      }

      /* embers rise with the camera, twinkle slowly */
      const tSec = now * 0.001;
      const camY = camera.position.y;
      for (let i = 0; i < EMBER_N; i++) {
        let y = emberPos[i * 3 + 1] + (1.1 + emberPhase[i] * 1.4) * dt;
        if (y > camY + 20) y -= 46;
        else if (y < camY - 26) y += 46;
        emberPos[i * 3 + 1] = y;
        const tw = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(tSec * 2.4 + emberPhase[i] * 6.3));
        emberCol[i * 3] = emberBase[i * 3] * tw;
        emberCol[i * 3 + 1] = emberBase[i * 3 + 1] * tw;
        emberCol[i * 3 + 2] = emberBase[i * 3 + 2] * tw;
      }
      emberAttr.needsUpdate = true;
      emberGeo.attributes.color.needsUpdate = true;

      /* ambient pulses: rings, rail, stars */
      const pr = 1 + 0.014 * Math.sin(tSec * 2.2);
      ring1.scale.set(pr, pr, 1);
      ring2.scale.set(2 - pr, 2 - pr, 1);
      railMat.opacity = 0.22 + 0.14 * Math.sin(tSec * 5);
      starMat.opacity = 0.55 + 0.25 * Math.sin(tSec * 1.7);

      /* tumbling pieces */
      for (let i = fallingPieces.length - 1; i >= 0; i--) {
        const f = fallingPieces[i];
        f.userData.vy -= 22 * dt;
        f.position.x += f.userData.vx * dt;
        f.position.y += f.userData.vy * dt;
        f.position.z += f.userData.vz * dt;
        f.rotation.x += f.userData.rx * dt;
        f.rotation.z += f.userData.rz * dt;
        if (f.position.y < camera.position.y - 30) {
          scene.remove(f);
          fallingPieces.splice(i, 1);
        }
      }

      /* pop timer */
      if (popTimer > 0) {
        popTimer -= dt;
        if (popTimer <= 0) pop.classList.remove('tb-pop--show');
      }

      /* camera glides up the tower (with entrance ease + idle sway) */
      if (introT > 0) introT = Math.max(0, introT - dt * 0.9);
      const wantY = Math.max(7, topY * 0.55 + 6);
      cam.lookX += ((top ? top.x : 0) - cam.lookX) * Math.min(1, dt * 3);
      cam.y += (wantY - cam.y) * Math.min(1, dt * 3.2);
      const sway = Math.sin(tSec * 0.35) * 0.5;
      camera.position.set(
        cam.lookX * 0.4 + sway,
        cam.y + topY * 0.42 + introT * 3.5,
        17 + introT * 7
      );
      camera.lookAt(cam.lookX, Math.max(2.2, topY - 4.5), 0);

      /* key light rides the tower */
      key.position.set(cam.lookX + 9, topY + 13, 8);
      key.target.position.set(cam.lookX, topY - 4, 0);
      key.target.updateMatrixWorld();

      renderer.render(scene, camera);
    }

    /* ── boot ───────────────────────────────────────── */
    spawnMover();
    resize();
    ctx.setScore(0);
    raf = requestAnimationFrame(loop);

    return {
      pause() { paused = true; },
      resume() { paused = false; last = 0; },
      restart() {
        /* clear everything */
        while (towerGroup.children.length) towerGroup.remove(towerGroup.children[0]);
        fallingPieces.forEach(f => scene.remove(f));
        fallingPieces.length = 0;
        clearFlashes();
        burstLife.fill(0);
        burstCol.fill(0);
        burstPosAttr.needsUpdate = true;
        burstColAttr.needsUpdate = true;
        if (mover) { scene.remove(mover); mover = null; }
        const base = makeBlock(BASE, BASE, BASE_COL);
        base.position.set(0, BH / 2, 0);
        towerGroup.add(base);
        top = { x: 0, z: 0, w: BASE, d: BASE };
        topY = BH;
        placed = 0; combo = 0; score = 0;
        over = false; paused = false; droppedOnce = false;
        introT = 1;
        cam.x = 0; cam.y = 7; cam.lookX = 0;
        hint.classList.remove('is-out');
        pop.classList.remove('tb-pop--show');
        ctx.setScore(0);
        spawnMover();
        Sfx.play('start');
      },
      resize(w, h) { resize(w, h); },
      destroy() {
        alive = false;
        cancelAnimationFrame(raf);
        renderer.domElement.removeEventListener('pointerdown', onPointer);
        window.removeEventListener('keydown', onKey);
        window.removeEventListener('resize', onWinResize);
        scene.traverse(o => {
          if (o.geometry && !o.isSprite && o.geometry !== BOX && o.geometry !== EDGES) o.geometry.dispose();
          if (o.material && o.material.dispose) o.material.dispose();
        });
        BOX.dispose(); EDGES.dispose();
        glowTex.dispose();
        matCache.forEach(m => m.dispose()); matCache.clear();
        renderer.dispose();
        host.classList.remove('tb-host');
        host.innerHTML = '';
      },
    };
  },
});
