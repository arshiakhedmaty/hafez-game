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

  /* a speedrun is the seven ordinary chapters on one clock. The clock
     only advances inside a stage, so menus and the pause screen are
     free and nobody has to race the loading of a menu.              */
  const Run = { on: false, time: 0, splits: [], deaths: 0,
                silver: 0, silverMax: 0, pb: null };
  /* a level someone built and shared; stageIdx is -1 while one runs */
  let customDef = null, customBack = 'main';

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

  function startCustom(L, back) {
    customDef = Lvl.toDef(L);
    customBack = back || 'main';
    Snd.music('gulch');
    Play.start(customDef, { difficulty: Save.data.difficulty });
    mode = 'play'; stageIdx = -1; paused = false;
  }

  function startRun() {
    Run.on = true; Run.time = 0; Run.splits = []; Run.deaths = 0;
    Run.silver = 0; Run.silverMax = 0;
    Run.pb = (Save.data.runs[0] || {}).splits || null;
    startStage(0);
  }

  function endRun(finished) {
    if (!finished) { Run.on = false; return; }
    const run = { time: Run.time, splits: Run.splits.slice(), deaths: Run.deaths,
                  silver: Run.silver, silverMax: Run.silverMax,
                  diff: Save.data.difficulty, when: Date.now() };
    Run.on = false;
    Screens.runend.place = Save.recordRun(run);
    Screens.runend.data = Object.assign({}, run, { pb: Run.pb });
    goto('runend');
  }

  function stageDone(res) {
    /* a shared level is not part of anybody's save file */
    if (stageIdx < 0) {
      res.name = customDef.name;
      Screens.results.data = res;
      Screens.results.custom = true;
      goto('results');
      return;
    }
    Screens.results.custom = false;
    res.name = STAGES[stageIdx].name;
    Save.record(STAGES[stageIdx].id, res);
    if (stageIdx + 1 > Save.data.unlocked - 1) {
      Save.data.unlocked = Math.min(SECRET_IDX, stageIdx + 2);
      Save.save();
    }
    if (Run.on) {
      Run.time += res.time; Run.splits.push(res.time);
      Run.deaths += res.deaths;
      Run.silver += res.coins; Run.silverMax += res.total;
      if (stageIdx + 1 >= SECRET_IDX) { endRun(true); return; }
      startStage(stageIdx + 1);
      return;
    }
    /* the hidden chapter sits past the ending, so it does not replace it */
    if (stageIdx === SECRET_IDX - 1) { goto('ending'); return; }
    Screens.results.data = res;
    goto('results');
  }

  /* ---------------- screen routing ---------------- */
  function routeScreen(next) {
    if (!next) return;
    if (next === 'startNew') { Save.data.unlocked = Math.max(1, Save.data.unlocked); Save.save(); startStage(0); return; }
    if (next === 'continue') { startStage(Save.data.unlocked - 1); return; }
    if (next.startsWith('startAt:')) { startStage(parseInt(next.slice(8), 10)); return; }
    if (next === 'runStart') { startRun(); return; }
    if (next === 'test') { startCustom(Screens.editor.level, 'editor'); return; }
    if (next === 'next') {
      if (stageIdx + 1 >= SECRET_IDX) { goto('chapters'); return; }
      startStage(stageIdx + 1); return;
    }
    if (next === 'retry') {
      if (stageIdx < 0) { startCustom(Screens.editor.level, customBack); return; }
      startStage(stageIdx); return;
    }
    goto(next);
  }

  function routePause(next) {
    switch (next) {
      case 'resume': paused = false; break;
      case 'restart': paused = false; startStage(stageIdx); break;
      case 'chapters': pauseReturn = 'pause'; screen = 'chapters'; Screens.chapters.enter(); break;
      case 'howto': pauseReturn = 'pause'; screen = 'howto'; break;
      case 'options': pauseReturn = 'pause'; screen = 'options'; break;
      /* walking away from a speedrun ends it - that is the whole point
         of a clock you cannot stop */
      case 'quit': paused = false; endRun(false); goto('main'); Snd.music('menu'); break;
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
        if (Run.on) drawRunClock();
        if (res && res.done) stageDone(res);
        if (res && res.failed) { startStage(stageIdx); }
      }
    }

    Input.endFrame();
  }

  /* the running total, plus how far ahead or behind the best run you
     are on this chapter alone */
  function drawRunClock() {
    const st = (mode === 'play' ? Play : Mini).state;
    const here = (st && st.elapsed) || 0;
    c.save();
    rr(c, CFG.W / 2 - 86, 52, 172, 42, 5);
    c.fillStyle = 'rgba(22,13,28,0.72)'; c.fill();
    c.lineWidth = 2; c.strokeStyle = PAL.gold; c.stroke();
    txt(c, fmtTime(Run.time + here), CFG.W / 2, 72,
        { size: 21, font: FONT.title, fill: PAL.gold, letter: 2 });
    const pb = Run.pb && Run.pb[stageIdx];
    if (pb !== undefined && pb !== null) {
      const dv = here - pb;
      txt(c, (dv <= 0 ? '-' : '+') + fmtTime(Math.abs(dv)), CFG.W / 2, 88,
          { size: 12, font: FONT.ui, fill: dv <= 0 ? PAL.teal : PAL.red });
    } else {
      txt(c, 'CHAPTER ' + (stageIdx + 1) + ' OF ' + SECRET_IDX, CFG.W / 2, 88,
          { size: 11, font: FONT.ui, fill: PAL.parchDk, letter: 1 });
    }
    c.restore();
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

    /* Two people on one keyboard is the whole game. A phone has neither
       the keys nor the second seat, so say so instead of loading a game
       nobody there can play. A tap gets in anyway, for the laptop that
       reports its touchscreen and nothing else. */
    const fine = !window.matchMedia || window.matchMedia('(pointer: fine)').matches;
    if (!fine) {
      goto('desktop');
      const letIn = () => { if (screen === 'desktop') goto('title'); };
      addEventListener('pointerdown', letIn, { once: true });
      addEventListener('keydown', letIn, { once: true });
      last = performance.now();
      requestAnimationFrame(frame);
      return;
    }

    /* ?lvl=... is somebody else's level, packed into the link itself */
    if (q.has('lvl')) {
      const L = Lvl.decode(q.get('lvl'));
      if (L) {
        Screens.editor.level = L;
        startCustom(L, 'main');
        last = performance.now();
        requestAnimationFrame(frame);
        return;
      }
    }

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
