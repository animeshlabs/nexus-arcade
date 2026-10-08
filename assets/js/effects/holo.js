/* ═══════════════════════════════════════════════════
   Holo — Three.js animated hero background
   Particle nebula + floating neon wireframe shapes,
   mouse parallax, auto-disposed when leaving home.
   ═══════════════════════════════════════════════════ */
window.Holo = (function () {

  function create(canvasHost) {
    if (typeof THREE === 'undefined') return { dispose() {} };   // graceful no-three
    if (Store.settings.reducedFx) return { dispose() {} };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return { dispose() {} };

    const canvas = document.createElement('canvas');
    canvas.id = 'holo';
    canvasHost.appendChild(canvas);

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
    camera.position.z = 14;

    /* ── accent color from CSS ── */
    const cs = getComputedStyle(document.documentElement);
    const c1 = new THREE.Color(cs.getPropertyValue('--c1').trim() || '#00f0ff');
    const c2 = new THREE.Color(cs.getPropertyValue('--c2').trim() || '#ff2ecd');
    const c3 = new THREE.Color(cs.getPropertyValue('--c3').trim() || '#7c5cff');

    /* ── particle nebula ── */
    const COUNT = 900;
    const pos = new Float32Array(COUNT * 3);
    const col = new Float32Array(COUNT * 3);
    const seeds = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      pos[i * 3]     = (Math.random() - 0.5) * 44;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 22;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 22;
      const t = Math.random();
      const c = t < 0.45 ? c1 : t < 0.8 ? c3 : c2;
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      seeds[i] = Math.random() * Math.PI * 2;
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    pGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));

    /* soft round sprite generated on a 2d canvas */
    const sprite = (() => {
      const cv = document.createElement('canvas'); cv.width = cv.height = 64;
      const g = cv.getContext('2d');
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.35, 'rgba(255,255,255,.6)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(cv);
    })();

    const points = new THREE.Points(pGeo, new THREE.PointsMaterial({
      size: 0.19, map: sprite, vertexColors: true, transparent: true,
      opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    scene.add(points);

    /* ── floating wireframe shapes ── */
    const shapes = [];
    const geos = [
      new THREE.IcosahedronGeometry(1.15, 0),
      new THREE.TorusGeometry(0.9, 0.32, 10, 32),
      new THREE.OctahedronGeometry(1.1, 0),
      new THREE.TorusKnotGeometry(0.7, 0.24, 64, 8),
      new THREE.DodecahedronGeometry(1.05, 0),
    ];
    for (let i = 0; i < 7; i++) {
      const geo = geos[i % geos.length];
      const color = [c1, c2, c3][i % 3];
      const solid = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.07 })
      );
      const wire = new THREE.LineSegments(
        new THREE.WireframeGeometry(geo),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55 })
      );
      const grp = new THREE.Group();
      grp.add(solid, wire);
      const side = i % 2 ? 1 : -1;
      grp.position.set(
        side * (6 + Math.random() * 7),
        (Math.random() - 0.5) * 9,
        -3 - Math.random() * 7
      );
      const s = 0.6 + Math.random() * 0.9;
      grp.scale.setScalar(s);
      grp.userData = {
        rx: (Math.random() - 0.5) * 0.006,
        ry: (Math.random() - 0.5) * 0.008,
        floatSeed: Math.random() * Math.PI * 2,
        baseY: grp.position.y,
      };
      shapes.push(grp);
      scene.add(grp);
    }

    /* ── interaction ── */
    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    const onMove = e => {
      mouse.tx = (e.clientX / innerWidth - 0.5) * 2;
      mouse.ty = (e.clientY / innerHeight - 0.5) * 2;
    };
    window.addEventListener('pointermove', onMove, { passive: true });

    function resize() {
      const w = canvas.clientWidth || innerWidth;
      const h = canvas.clientHeight || innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
    }
    window.addEventListener('resize', resize);
    resize();

    /* ── loop ── */
    let raf = 0, t = 0, running = true;
    const posAttr = pGeo.getAttribute('position');
    function tick() {
      if (!running) return;
      raf = requestAnimationFrame(tick);
      t += 1;

      mouse.x += (mouse.tx - mouse.x) * 0.05;
      mouse.y += (mouse.ty - mouse.y) * 0.05;
      camera.position.x = mouse.x * 1.6;
      camera.position.y = -mouse.y * 1.0;
      camera.lookAt(0, 0, 0);

      points.rotation.y = t * 0.0006;
      points.rotation.x = Math.sin(t * 0.004) * 0.05;

      /* gentle particle breathing */
      const arr = posAttr.array;
      for (let i = 0; i < COUNT; i++) {
        arr[i * 3 + 1] += Math.sin(t * 0.01 + seeds[i]) * 0.0025;
      }
      posAttr.needsUpdate = true;

      shapes.forEach(g => {
        g.rotation.x += g.userData.rx;
        g.rotation.y += g.userData.ry;
        g.position.y = g.userData.baseY + Math.sin(t * 0.012 + g.userData.floatSeed) * 0.7;
      });

      renderer.render(scene, camera);
    }
    tick();

    /* pause when tab hidden */
    const onVis = () => {
      if (document.hidden) { running = false; cancelAnimationFrame(raf); }
      else if (!running) { running = true; tick(); }
    };
    document.addEventListener('visibilitychange', onVis);

    return {
      dispose() {
        running = false;
        cancelAnimationFrame(raf);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('resize', resize);
        document.removeEventListener('visibilitychange', onVis);
        geos.forEach(g => g.dispose());
        pGeo.dispose();
        points.material.dispose();
        shapes.forEach(g => {
          g.traverse(o => { o.geometry && o.geometry.dispose(); o.material && o.material.dispose(); });
        });
        sprite.dispose();
        renderer.dispose();
        canvas.remove();
      },
    };
  }

  return { create };
})();
