/* =====================================================================
   game.js : boot, canvas scaling, the scene state machine and the loop.
   ===================================================================== */

const Game = (() => {
  let cv, c, scale = 1, offX = 0, offY = 0;
  let mode = 'screen';           /* 'screen' | 'play' | 'mini' */
  let screen = 'title';
  let stageIdx = 0;
  let paused = false;
  let pauseReturn = null;
  let fadeT = 0, fadeDir = 0, fadeNext = null;
  let last = 0, acc = 0;

  /* ---------------- canvas fitting ---------------- */
  function resize() {
    const W = window.innerWidth, H = window.innerHeight;
    scale = Math.min(W / CFG.W, H / CFG.H);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(CFG.W * scale * dpr);
    cv.height = Math.round(CFG.H * scale * dpr);
    cv.style.width = Math.round(CFG.W * scale) + 'px';
    cv.style.height = Math.round(CFG.H * scale) + 'px';
    c.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    c.imageSmoothingEnabled = true;
  }

  /* ---------------- scene control ---------------- */
  function goto(name) {
    screen = name; mode = 'screen';
    const s = Screens[name];
    if (s && s.enter) s.enter();
  }

  function startStage(i) {
    stageIdx = clamp(i, 0, STAGES.length - 1);
    const st = STAGES[stageIdx];
    const opts = { difficulty: Save.data.difficulty };
    Snd.music(st.music);
    if (st.kind === 'platform') { Play.start(st, opts); mode = 'play'; }
    else { Mini.start(st, opts); mode = 'mini'; }
    paused = false;
  }

  function stageDone(res) {
    res.name = STAGES[stageIdx].name;
    Save.record(STAGES[stageIdx].id, res);
    if (stageIdx + 1 > Save.data.unlocked - 1) {
      Save.data.unlocked = Math.min(STAGES.length, stageIdx + 2);
      Save.save();
    }
    if (stageIdx >= STAGES.length - 1) { goto('ending'); return; }
    Screens.results.data = res;
    goto('results');
  }

  /* ---------------- screen routing ---------------- */
  function routeScreen(next) {
    if (!next) return;
    if (next === 'startNew') { Save.data.unlocked = Math.max(1, Save.data.unlocked); Save.save(); startStage(0); return; }
    if (next === 'continue') { startStage(Save.data.unlocked - 1); return; }
    if (next.startsWith('startAt:')) { startStage(parseInt(next.slice(8), 10)); return; }
    if (next === 'next') { startStage(stageIdx + 1); return; }
    if (next === 'retry') { startStage(stageIdx); return; }
    goto(next);
  }

  function routePause(next) {
    switch (next) {
      case 'resume': paused = false; break;
      case 'restart': paused = false; startStage(stageIdx); break;
      case 'chapters': pauseReturn = 'pause'; screen = 'chapters'; Screens.chapters.enter(); break;
      case 'howto': pauseReturn = 'pause'; screen = 'howto'; break;
      case 'options': pauseReturn = 'pause'; screen = 'options'; break;
      case 'quit': paused = false; goto('main'); Snd.music('menu'); break;
    }
  }

  /* ---------------- the loop ---------------- */
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000; last = now;
    if (!isFinite(dt) || dt < 0) dt = 0;
    dt = Math.min(dt, 0.05);
    UIT += dt;

    /* hit-stop makes impacts land harder */
    const step = FX.slowmo > 0 ? dt * 0.25 : dt;

    if (mode === 'screen') {
      const s = Screens[screen];
      let next = s.update ? s.update(dt) : null;
      /* a sub-screen opened from the pause menu returns to it */
      if (next === 'main' && pauseReturn) { screen = pauseReturn; pauseReturn = null; next = null; }
      s.draw(c);
      routeScreen(next);
    } else {
      /* ---- in a stage ---- */
      if (Input.hit('Escape')) {
        paused = !paused;
        Snd.play(paused ? 'back' : 'click');
        if (paused) Screens.pause.enter();
      }
      if (paused) {
        (mode === 'play' ? Play : Mini).draw(c);
        const sc = pauseReturn ? Screens[screen] : Screens.pause;
        if (pauseReturn) {
          const nx = sc.update(dt);
          sc.draw(c);
          if (nx === 'main') { screen = pauseReturn; pauseReturn = null; Screens.pause.enter(); }
          /* CHAPTERS opened from the pause menu can jump straight into
             another stage, so it has to leave the pause behind it. */
          else if (nx) { pauseReturn = null; paused = false; routeScreen(nx); }
        } else {
          const nx = Screens.pause.update(dt);
          Screens.pause.draw(c);
          routePause(nx);
        }
      } else {
        const res = (mode === 'play' ? Play : Mini).update(step);
        (mode === 'play' ? Play : Mini).draw(c);
        if (res && res.done) stageDone(res);
        if (res && res.failed) { startStage(stageIdx); }
      }
    }

    Input.endFrame();
  }

  /* ---------------- boot ---------------- */
  function boot() {
    cv = document.getElementById('game');
    c = cv.getContext('2d');
    resize();
    addEventListener('resize', resize);
    Save.load();
    /* the audio context may only start after a real key or click */
    const wake = () => { Snd.resume(); Snd.vol(); };
    addEventListener('keydown', wake, { once: true });
    addEventListener('pointerdown', wake, { once: true });
    addEventListener('keydown', e => { if (e.key === 'F11') e.preventDefault(); });
    document.getElementById('boot').remove();

    /* ?stage=3 drops straight into a chapter, ?screen=options into a menu.
       Handy while building, and handy for replaying one bit.            */
    const q = new URLSearchParams(location.search);
    if (q.has('stage')) {
      const n = parseInt(q.get('stage'), 10);
      Save.data.unlocked = Math.max(Save.data.unlocked, n + 1);
      startStage(n);
    } else if (q.has('screen') && Screens[q.get('screen')]) {
      goto(q.get('screen'));
    } else {
      goto('title');
    }
    last = performance.now();
    requestAnimationFrame(frame);
  }

  /* development probe - handy when driving the game from the console */
  function debug() { return { mode, screen, stageIdx, paused, pauseReturn }; }

  return { boot, goto, debug, startStage, get ctx() { return c; } };
})();

addEventListener('DOMContentLoaded', () => Game.boot());
