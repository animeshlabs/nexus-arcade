/* ═══════════════════════════════════════════════════
   Audio — tiny WebAudio SFX engine (no asset files)
   ═══════════════════════════════════════════════════ */
window.Sfx = (function () {
  let ctx = null;
  let muted = !Store.settings.sound;

  function ac() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  /** core tone blip */
  function tone({ f = 440, f2 = null, t = 0.12, type = 'sine', vol = 0.16, delay = 0 }) {
    if (muted) return;
    const a = ac(); if (!a) return;
    const t0 = a.currentTime + delay;
    const osc = a.createOscillator();
    const g = a.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f, t0);
    if (f2) osc.frequency.exponentialRampToValueAtTime(Math.max(f2, 1), t0 + t);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + t);
    osc.connect(g).connect(a.destination);
    osc.start(t0);
    osc.stop(t0 + t + 0.03);
  }

  /** short noise burst (impacts, blocks) */
  function noise({ t = 0.15, vol = 0.14, hp = 800, delay = 0 }) {
    if (muted) return;
    const a = ac(); if (!a) return;
    const t0 = a.currentTime + delay;
    const len = Math.floor(a.sampleRate * t);
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = a.createBufferSource(); src.buffer = buf;
    const filt = a.createBiquadFilter(); filt.type = 'highpass'; filt.frequency.value = hp;
    const g = a.createGain(); g.gain.value = vol;
    src.connect(filt).connect(g).connect(a.destination);
    src.start(t0);
  }

  const lib = {
    click:   () => tone({ f: 660, f2: 880, t: 0.07, type: 'triangle', vol: 0.1 }),
    hover:   () => tone({ f: 1200, t: 0.04, type: 'sine', vol: 0.045 }),
    toggle:  () => tone({ f: 500, f2: 750, t: 0.09, type: 'square', vol: 0.07 }),
    coin:    () => { tone({ f: 988, t: 0.07, type: 'square', vol: 0.11 });
                     tone({ f: 1319, t: 0.14, type: 'square', vol: 0.11, delay: 0.07 }); },
    power:   () => { tone({ f: 440, f2: 1760, t: 0.28, type: 'sawtooth', vol: 0.09 }); },
    jump:    () => tone({ f: 320, f2: 720, t: 0.13, type: 'square', vol: 0.09 }),
    hit:     () => { noise({ t: 0.1, vol: 0.12 }); tone({ f: 220, f2: 90, t: 0.16, type: 'sawtooth', vol: 0.1 }); },
    lose:    () => { tone({ f: 392, f2: 196, t: 0.3, type: 'sawtooth', vol: 0.11 });
                     tone({ f: 262, f2: 110, t: 0.45, type: 'sawtooth', vol: 0.1, delay: 0.16 }); },
    win:     () => [523, 659, 784, 1047].forEach((f, i) =>
                     tone({ f, t: 0.16, type: 'triangle', vol: 0.12, delay: i * 0.09 })),
    start:   () => { tone({ f: 523, t: 0.09, type: 'triangle', vol: 0.1 });
                     tone({ f: 784, t: 0.14, type: 'triangle', vol: 0.1, delay: 0.09 }); },
    tick:    () => tone({ f: 1500, t: 0.03, type: 'square', vol: 0.05 }),
  };

  return {
    play(name) { const fn = lib[name]; if (fn) fn(); },
    get muted() { return muted; },
    setMuted(v) { muted = v; Store.set('sound', !v); },
  };
})();
