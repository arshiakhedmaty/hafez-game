/* audio.js : fully procedural western soundtrack + SFX (no asset files).
   Guitar-ish plucks, harmonica reeds, hand percussion, gunshots, whip. */

const Snd = (() => {
  let ctx = null, master = null, musicBus = null, sfxBus = null;
  const S = { master: 0.8, music: 0.55, sfx: 0.75, muted: false };

  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = S.master; master.connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.gain.value = S.music; musicBus.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = S.sfx; sfxBus.connect(master);
  }
  function resume() { init(); if (ctx && ctx.state === 'suspended') ctx.resume(); }
  function vol() {
    if (!ctx) return;
    master.gain.value = S.muted ? 0 : S.master;
    musicBus.gain.value = S.music;
    sfxBus.gain.value = S.sfx;
  }

  /* ---------- primitive voices ---------- */
  function noiseBuf(len) {
    const b = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * len)), ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  /* nylon guitar pluck */
  function pluck(freq, t, dur, gain, bus) {
    dur = dur || 0.9; gain = gain || 0.5; bus = bus || sfxBus;
    const o = ctx.createOscillator(), o2 = ctx.createOscillator();
    o.type = 'triangle'; o2.type = 'sawtooth';
    o.frequency.setValueAtTime(freq, t);
    o2.frequency.setValueAtTime(freq * 2.005, t);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(freq * 7, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(60, freq * 1.6), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); o2.connect(f); f.connect(g); g.connect(bus);
    o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }

  /* harmonica / accordion reed */
  function reed(freq, t, dur, gain, bus) {
    dur = dur || 1.2; gain = gain || 0.16; bus = bus || musicBus;
    const o = ctx.createOscillator(), o2 = ctx.createOscillator();
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    o.type = 'sawtooth'; o2.type = 'square';
    o.frequency.value = freq; o2.frequency.value = freq * 1.003;
    lfo.frequency.value = 5.2; lg.gain.value = freq * 0.006;
    lfo.connect(lg); lg.connect(o.frequency);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass';
    f.frequency.value = freq * 2.2; f.Q.value = 2.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.12);
    g.gain.setValueAtTime(gain, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); o2.connect(f); f.connect(g); g.connect(bus);
    o.start(t); o2.start(t); lfo.start(t);
    o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
  }

  function bass(freq, t, dur, gain, bus) {
    dur = dur || 0.5; gain = gain || 0.35; bus = bus || musicBus;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.05);
  }

  function noise(t, dur, gain, type, freq, bus, q) {
    type = type || 'highpass'; freq = freq || 1200; bus = bus || sfxBus; q = q || 1;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf(Math.max(dur, 0.05));
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(bus); s.start(t); s.stop(t + dur + 0.02);
  }

  const N = n => 440 * Math.pow(2, (n - 69) / 12);   /* midi -> hz */

  /* ---------- SFX ---------- */
  const sfx = {
    jump() { const t = ctx.currentTime; pluck(N(64), t, 0.22, 0.22); pluck(N(71), t + 0.05, 0.2, 0.16); },
    dblJump() { const t = ctx.currentTime; pluck(N(71), t, 0.2, 0.2); pluck(N(78), t + 0.04, 0.25, 0.18); noise(t, 0.12, 0.10, 'highpass', 2600); },
    land() { const t = ctx.currentTime; noise(t, 0.10, 0.22, 'lowpass', 420); },
    step() { const t = ctx.currentTime; noise(t, 0.05, 0.07, 'bandpass', 900, sfxBus, 1.5); },
    lasso() {
      const t = ctx.currentTime;
      noise(t, 0.28, 0.18, 'bandpass', 2400, sfxBus, 3);
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(1400, t);
      o.frequency.exponentialRampToValueAtTime(500, t + 0.25);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.10, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.3);
    },
    latch() { const t = ctx.currentTime; pluck(N(76), t, 0.3, 0.3); noise(t, 0.06, 0.15, 'highpass', 3000); },
    shot() {
      const t = ctx.currentTime;
      noise(t, 0.16, 0.9, 'lowpass', 1800); noise(t, 0.05, 0.6, 'highpass', 3000);
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.18);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.6, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.25);
    },
    click() { const t = ctx.currentTime; pluck(N(72), t, 0.14, 0.22); },
    move() { const t = ctx.currentTime; pluck(N(67), t, 0.10, 0.16); },
    back() { const t = ctx.currentTime; pluck(N(60), t, 0.18, 0.20); },
    coin() { const t = ctx.currentTime; pluck(N(84), t, 0.25, 0.3); pluck(N(88), t + 0.06, 0.3, 0.25); },
    dead() {
      const t = ctx.currentTime;
      [67, 64, 60, 55].forEach((n, i) => pluck(N(n), t + i * 0.11, 0.7, 0.32));
      noise(t, 0.4, 0.25, 'lowpass', 300);
    },
    kiss() {
      const t = ctx.currentTime;
      [72, 76, 79, 84].forEach((n, i) => pluck(N(n), t + i * 0.07, 0.9, 0.28));
      reed(N(76), t + 0.1, 1.0, 0.10, sfxBus);
    },
    revive() { const t = ctx.currentTime; [60, 64, 67, 72, 76].forEach((n, i) => pluck(N(n), t + i * 0.05, 0.8, 0.26)); },
    win() {
      const t = ctx.currentTime;
      [60, 64, 67, 72, 76, 79, 84].forEach((n, i) => pluck(N(n), t + i * 0.09, 1.1, 0.34));
      reed(N(72), t + 0.5, 1.6, 0.14, sfxBus);
    },
    lose() {
      const t = ctx.currentTime;
      [62, 59, 55, 50, 43].forEach((n, i) => { pluck(N(n), t + i * 0.15, 1.0, 0.32); bass(N(n - 24), t + i * 0.15, 0.5, 0.3, sfxBus); });
    },
    tick() { const t = ctx.currentTime; noise(t, 0.03, 0.20, 'bandpass', 2600, sfxBus, 6); },
    thud() { const t = ctx.currentTime; noise(t, 0.18, 0.4, 'lowpass', 220); bass(58, t, 0.25, 0.35, sfxBus); },
    gear() { const t = ctx.currentTime; noise(t, 0.07, 0.22, 'bandpass', 1500, sfxBus, 4); },
    horse() { const t = ctx.currentTime; for (let i = 0; i < 2; i++) noise(t + i * 0.09, 0.07, 0.26, 'lowpass', 500); },
    wrong() {
      const t = ctx.currentTime;
      const o = ctx.createOscillator(); o.type = 'square';
      o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.3);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.22, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
      o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.35);
    },
    bell() { const t = ctx.currentTime; pluck(N(88), t, 1.4, 0.3); pluck(N(95), t + 0.02, 1.2, 0.16); }
  };

  function play(name) {
    if (!ctx || S.muted) return;
    try { (sfx[name] || sfx.click)(); } catch (e) { /* audio hiccup - never break the game */ }
  }

  /* ---------- MUSIC : lightweight sequencer, several western moods ---------- */
  const SCALE_MIN = [0, 2, 3, 5, 7, 8, 10];   /* aeolian  - lonesome  */
  const SCALE_MIX = [0, 2, 4, 5, 7, 9, 10];   /* mixolydian - swagger */
  const TRACKS = {
    title:   { root: 57, scale: SCALE_MIN, bpm: 78,  pad: true,  density: 0.55, perc: false },
    menu:    { root: 57, scale: SCALE_MIN, bpm: 80,  pad: true,  density: 0.45, perc: false },
    gulch:   { root: 59, scale: SCALE_MIX, bpm: 106, pad: false, density: 0.80, perc: true },
    mine:    { root: 53, scale: SCALE_MIN, bpm: 92,  pad: true,  density: 0.60, perc: true },
    chase:   { root: 57, scale: SCALE_MIN, bpm: 140, pad: false, density: 0.95, perc: true },
    duel:    { root: 52, scale: SCALE_MIN, bpm: 64,  pad: true,  density: 0.25, perc: false },
    vault:   { root: 55, scale: SCALE_MIN, bpm: 112, pad: false, density: 0.70, perc: true },
    finale:  { root: 60, scale: SCALE_MIX, bpm: 120, pad: true,  density: 0.85, perc: true },
    victory: { root: 60, scale: SCALE_MIX, bpm: 96,  pad: true,  density: 0.70, perc: false }
  };
  let cur = null, nextTime = 0, step = 0, timer = null;

  function schedule() {
    if (!ctx || !cur || S.muted) return;
    const T = TRACKS[cur];
    const spb = 60 / T.bpm / 2;                  /* eighth notes */
    let guard = 0;
    while (nextTime < ctx.currentTime + 0.4 && guard++ < 64) {
      const t = nextTime, s = step;
      const bar = Math.floor(s / 8), beat = s % 8;
      const deg = T.scale[(bar * 2 + (beat === 0 ? 0 : beat === 4 ? 2 : 4)) % T.scale.length];
      if (beat === 0 || beat === 4) bass(N(T.root - 12 + (beat === 0 ? 0 : 7)), t, spb * 1.6, 0.30);
      if (Math.random() < T.density) {
        const oct = Math.random() < 0.3 ? 12 : 0;
        pluck(N(T.root + deg + oct), t, spb * 2.2, 0.18, musicBus);
      }
      if (T.pad && s % 32 === 0) reed(N(T.root + 12 + T.scale[bar % T.scale.length]), t, spb * 14, 0.10);
      if (T.perc) {
        if (beat === 2 || beat === 6) noise(t, 0.06, 0.14, 'bandpass', 1800, musicBus, 2);
        if (beat % 2 === 0) noise(t, 0.04, 0.06, 'lowpass', 300, musicBus);
      }
      nextTime += spb; step++;
    }
  }

  function music(name) {
    init();
    if (!ctx || cur === name) return;
    cur = name; step = 0; nextTime = ctx.currentTime + 0.05;
    if (!timer) timer = setInterval(schedule, 120);
  }
  function stopMusic() { cur = null; }

  return { init, resume, play, music, stopMusic, S, vol, get ctx() { return ctx; } };
})();
