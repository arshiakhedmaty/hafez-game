/* =====================================================================
   platformer.js : the co-op stage engine.

   The whole design rests on ASYMMETRY OF CONTROL, not of information.
   Both players see the same screen; neither can do the other's job.

     ARSHIA  - heavier. Pushes crates, holds heavy plates, and is the
               only one who can throw the LASSO at a ring and swing.
     ROJINA  - lighter and quicker. Double jump, and she carries the
               LANTERN: ghost timbers are only solid inside her light,
               so he physically cannot cross without her standing near.

   Death is not a respawn. The fallen one lies where they dropped and
   the other has to reach them and hold the KISS key to bring them back
   -- at the cost of one heart of maximum health, for good.
   ===================================================================== */

const Play = (() => {

  /* Reach budget these numbers produce (see README):
       ARSHIA  rise  95px   flat gap 122px  -> design to 70 / 95
       ROJINA  rise 159px   flat gap 184px  -> design to 125 / 145
     Anything between 95 and 150 of rise is hers alone.                */
  const TUNE = {
    arshia: { run: 212, acc: 1700, air: 1050, fric: 2100, jump: 660, mass: 1.0, dbl: 0 },
    rojina: { run: 236, acc: 1950, air: 1200, fric: 2250, jump: 620, mass: 0.55, dbl: 1 }
  };
  const LASSO_RANGE = 230;
  const LANTERN_R = 200;
  const KISS_RANGE = 46;
  const KISS_TIME = 1.15;
  const LEASH = 540;          /* how far apart they may drift */

  let S = null;               /* live stage state */

  /* ---------------------------------------------------------------- */
  function mkPlayer(who, x, y, maxHearts) {
    return {
      who, x, y, w: who === 'arshia' ? 22 : 20, h: who === 'arshia' ? 42 : 40,
      vx: 0, vy: 0, face: 1, grounded: false, coyote: 0, buf: 0, jumps: 0,
      anim: 'idle', expr: 'normal', t: rnd(4), airT: 0,
      maxHearts, hearts: maxHearts, iframe: 0, down: false, downT: 0,
      rope: null, ropeLen: 0, reviveT: 0, carry: null, stepT: 0,
      blinkSeed: who === 'rojina' ? 0.45 : 0, pushT: 0, deadPose: 0,
      /* last patch of trustworthy ground - a fall returns them here, so a
         missed jump costs a heart and some time, never the run itself */
      safeX: x, safeY: y, safeT: 0
    };
  }
  const cx = p => p.x + p.w / 2;
  const cy = p => p.y + p.h / 2;

  /* ---------------------------------------------------------------- */
  function start(stage, opts) {
    const hearts = DIFF[opts.difficulty].hearts;
    S = {
      def: stage,
      t: 0, elapsed: 0, state: 'intro', stateT: 0,
      a: mkPlayer('arshia', stage.spawn.a[0], stage.spawn.a[1], hearts),
      r: mkPlayer('rojina', stage.spawn.r[0], stage.spawn.r[1], hearts),
      cam: { x: 0, y: 0, zoom: 1, tx: 0, ty: 0 },
      solids: (stage.solids || []).map(s => Object.assign({}, s)),
      walls: edgeWalls(stage),
      movers: (stage.movers || []).map(m => Object.assign({}, m, { px: m.x, py: m.y })),
      phantoms: (stage.phantoms || []).map(p => Object.assign({}, p, { lit: 0 })),
      crumbles: (stage.crumbles || []).map(p => Object.assign({}, p, { t: -1, gone: 0 })),
      crates: (stage.crates || []).map(cr => Object.assign({}, cr, { vx: 0, vy: 0, grounded: false })),
      plates: (stage.plates || []).map(p => Object.assign({}, p, { on: false, wasOn: false })),
      gates: (stage.gates || []).map(g => Object.assign({}, g, { open: false, anim: 0 })),
      rings: (stage.rings || []).map(r => Object.assign({}, r)),
      hazards: (stage.hazards || []).map(h => Object.assign({}, h)),
      coins: (stage.coins || []).map(c2 => Object.assign({}, c2, { got: false })),
      checkpoints: (stage.checkpoints || []).map(c3 => Object.assign({}, c3, { hit: false })),
      cpA: [stage.spawn.a[0], stage.spawn.a[1]],
      cpR: [stage.spawn.r[0], stage.spawn.r[1]],
      coinsGot: 0, deaths: 0, revives: 0,
      difficulty: opts.difficulty,
      tumble: { x: 0, y: 0, r: 0, rot: 0, on: false, wait: rnd(6, 2) },
      done: false, result: null, hintT: 0
    };
    S.cam.x = S.cam.tx = clamp(cx(S.a) - CFG.W / 2, 0, stage.w - CFG.W);
    S.cam.y = S.cam.ty = 0;
    FX.clear();
    return S;
  }

  /* =============================== PHYSICS ======================== */
  /* Invisible walls sealing both ends of the level. Without them you can
     simply walk off the left edge of the first screen and drop out of
     the world, which is not a challenge, just a hole in the floor.    */
  function edgeWalls(stage) {
    const top = -400, h = (stage.deathY || stage.h) + 600;
    return [
      { x: -60, y: top, w: 60, h, type: 'wall', role: 'wall' },
      { x: stage.w, y: top, w: 60, h, type: 'wall', role: 'wall' }
    ];
  }

  function allSolids() {
    const out = S.solids.slice();
    out.push.apply(out, S.walls);
    for (const m of S.movers) out.push(m);
    for (const p of S.phantoms) if (p.lit > 0.35) out.push(p);
    for (const cb of S.crumbles) if (!cb.gone) out.push(cb);
    for (const g of S.gates) if (!g.open) out.push({ x: g.x, y: g.y, w: g.w, h: g.h, type: 'gate' });
    for (const cr of S.crates) out.push(cr);
    return out;
  }

  function moveBody(b, dx, dy, solids, skip) {
    /* horizontal */
    b.x += dx;
    for (const s of solids) {
      if (s === skip || s === b) continue;
      if (b.x < s.x + s.w && b.x + b.w > s.x && b.y < s.y + s.h && b.y + b.h > s.y) {
        if (dx > 0) b.x = s.x - b.w; else if (dx < 0) b.x = s.x + s.w;
        b.vx = 0; b.hitWall = s;
      }
    }
    /* vertical */
    b.y += dy;
    b.grounded = false;
    for (const s of solids) {
      if (s === skip || s === b) continue;
      if (b.x < s.x + s.w && b.x + b.w > s.x && b.y < s.y + s.h && b.y + b.h > s.y) {
        if (dy > 0) { b.y = s.y - b.h; b.grounded = true; b.ground = s; b.vy = 0; }
        else if (dy < 0) { b.y = s.y + s.h; b.vy = 0; }
      }
    }
  }

  /* =============================== PLAYER ========================= */
  function updatePlayer(p, n, dt, solids) {
    const T = TUNE[p.who];
    p.t += dt;
    if (p.iframe > 0) p.iframe -= dt;

    /* ---- downed: no control, just lie there and wait ---- */
    if (p.down) {
      p.downT += dt;
      p.anim = 'down'; p.expr = 'ko';
      p.vy = Math.min(p.vy + CFG.GRAV * dt, CFG.TERMINAL);
      moveBody(p, 0, p.vy * dt, solids);
      return;
    }

    const ax = Input.axis(n);
    const wantJump = Input.ph(n, 'up');
    const holdJump = Input.p(n, 'up');

    /* ---- lasso (Arshia only) ---- */
    if (p.who === 'arshia') updateLasso(p, n, dt);
    if (p.rope) p.swingT = (p.swingT || 0) + dt; else p.swingT = 0;

    /* ---- horizontal ----
       While he is on the rope this is skipped entirely. Running the
       normal ground/air controller alongside the pendulum was flattening
       the swing velocity every single frame, which is why the rope felt
       like it barely moved. applyRope owns him until he lets go.       */
    if (!p.rope) {
      const accel = p.grounded ? T.acc : T.air;
      if (ax !== 0) {
        p.vx = approach(p.vx, ax * T.run, accel * dt);
        p.face = ax;
      } else if (p.grounded) {
        p.vx = approach(p.vx, 0, T.fric * dt);
      } else {
        p.vx = approach(p.vx, 0, 220 * dt);
      }
    }

    /* ---- jump with coyote time and an input buffer ---- */
    if (p.grounded) { p.coyote = CFG.COYOTE; p.jumps = 0; p.airT = 0; }
    else { p.coyote -= dt; p.airT += dt; }
    if (wantJump) p.buf = CFG.JUMP_BUFFER;
    p.buf -= dt;

    p.jumpGrace = Math.max(0, (p.jumpGrace || 0) - dt);

    if (p.buf > 0) {
      if (p.coyote > 0 || p.rope) {
        p.vy = -T.jump; p.buf = 0; p.coyote = 0; p.jumps = 1;
        p.jumpGrace = 0.11;
        if (p.rope) { p.rope = null; }
        Snd.play('jump'); FX.dust(cx(p), p.y + p.h, 7, -p.face);
      } else if (T.dbl && p.jumps < 2) {
        /* full strength: the second jump has to actually clear the ledges
           that are meant to be hers, even when the timing is sloppy */
        p.vy = -T.jump; p.buf = 0; p.jumps = 2;
        p.jumpGrace = 0.11;
        Snd.play('dblJump');
        FX.sparks(cx(p), p.y + p.h, 10, LOOK[p.who].accent);
        for (let i = 0; i < 6; i++)
          FX.spawn({ x: cx(p) + rnd(12, -12), y: p.y + p.h, vx: rnd(60, -60), vy: rnd(60, 10),
                     g: 60, life: 0.4, r: 3, col: LOOK.rojina.accent, drag: 2 });
      }
    }
    /* Variable jump height, with a grace window. Without the window,
       letting go of UP in order to press it again for the double jump
       would cut the first jump short and put her ledges out of reach.  */
    if (p.vy < 0 && !holdJump && p.jumpGrace <= 0) p.vy += CFG.GRAV * 1.5 * dt;

    /* ---- gravity ---- */
    if (!p.rope) p.vy = Math.min(p.vy + CFG.GRAV * dt, CFG.TERMINAL);

    /* ---- rope constraint ---- */
    if (p.rope) applyRope(p, n, dt);

    /* ---- integrate ---- */
    const wasGrounded = p.grounded;
    p.hitWall = null;
    moveBody(p, p.vx * dt, p.vy * dt, solids);

    /* landing feedback */
    if (!wasGrounded && p.grounded && p.airT > 0.18) {
      Snd.play('land');
      FX.land(cx(p), p.y + p.h, clamp(p.airT, 0, 1.4));
      FX.shake(clamp(p.airT * 2.2, 0, 4), 0.14);
    }
    /* carried along by a moving platform */
    if (p.grounded && p.ground && p.ground.px !== undefined) {
      p.x += p.ground.x - p.ground.px;
      p.y += p.ground.y - p.ground.py;
    }

    /* ---- remember the last solid footing ---- */
    if (p.grounded && p.ground && p.ground.px === undefined &&
        S.crumbles.indexOf(p.ground) < 0) {
      p.safeT += dt;
      if (p.safeT > 0.15) { p.safeX = p.x; p.safeY = p.y; }
    } else p.safeT = 0;

    /* ---- footstep dust ---- */
    if (p.grounded && Math.abs(p.vx) > 60) {
      p.stepT -= dt;
      if (p.stepT <= 0) { p.stepT = 0.26; Snd.play('step'); FX.dust(cx(p), p.y + p.h, 2, -Math.sign(p.vx)); }
    }

    /* ---- animation selection ---- */
    if (p.rope) p.anim = 'swing';
    else if (!p.grounded) p.anim = p.vy < -30 ? 'jump' : 'fall';
    else if (p.pushT > 0) p.anim = 'push';
    else if (Math.abs(p.vx) > 26) p.anim = 'run';
    else if (Input.p(n, 'down')) p.anim = 'crouch';
    else p.anim = 'idle';
    p.speed = clamp(Math.abs(p.vx) / T.run, 0, 1.4);
    p.pushT = Math.max(0, p.pushT - dt);

    /* expression reacts to the situation */
    if (p.hearts <= 1) p.expr = 'scared';
    else if (p.anim === 'run' && p.speed > 0.8) p.expr = 'determined';
    else p.expr = 'normal';
  }

  /* ---------------- lasso ---------------- */
  function updateLasso(p, n, dt) {
    if (Input.ph(n, 'act')) {
      if (p.rope) { p.rope = null; Snd.play('back'); return; }
      /* grab the nearest ring in range and roughly ahead of him */
      let best = null, bd = LASSO_RANGE;
      for (const r of S.rings) {
        const d = dist(cx(p), cy(p), r.x, r.y);
        if (d < bd && r.y < cy(p) + 40) { bd = d; best = r; }
      }
      if (best) {
        p.rope = best;
        /* take up a little slack so the rope lifts him off the lip */
        p.ropeLen = clamp(bd - 26, 46, LASSO_RANGE);
        p.grounded = false; p.coyote = 0;
        /* and launch him ALONG the arc the way he is facing. A plain
           upward hop pushed him backwards round the circle instead.   */
        const dx0 = cx(p) - best.x, dy0 = cy(p) - best.y;
        const d0 = Math.hypot(dx0, dy0) || 1;
        let tx0 = -dy0 / d0, ty0 = dx0 / d0;
        if (tx0 * p.face < 0) { tx0 = -tx0; ty0 = -ty0; }
        p.vx = tx0 * 300; p.vy = ty0 * 300;
        Snd.play('lasso'); Snd.play('latch');
        FX.sparks(best.x, best.y, 10, PAL.gold);
        FX.dust(cx(p), p.y + p.h, 6, -p.face);
      } else {
        Snd.play('lasso');
        FX.say(cx(p), p.y - 14, 'NO RING', PAL.parchDk, 13);
      }
    }
    if (p.rope) {
      /* SHIFT hauls himself up the rope, S pays it out. This used to be
         on W, which also jumps off the rope, so hauling never happened. */
      if (Input.p(n, 'act2')) p.ropeLen = Math.max(40, p.ropeLen - 190 * dt);
      if (Input.p(n, 'down')) p.ropeLen = Math.min(LASSO_RANGE, p.ropeLen + 190 * dt);
    }
  }

  /* A proper rigid pendulum. The rope is held taut at all times, gravity
     drives the swing, and A/D pump it the way you would on a real rope:
     push along the direction of travel and the arc grows every pass.   */
  function applyRope(p, n, dt) {
    const r = p.rope;
    let dx = cx(p) - r.x, dy = cy(p) - r.y;
    let d = Math.hypot(dx, dy) || 1;
    let nx = dx / d, ny = dy / d;
    const tx = -ny, ty = nx;                       /* unit tangent      */

    /* gravity */
    p.vy += CFG.GRAV * dt;

    /* Pumping. The force can only run along the rope's tangent, but WHICH
       way along it has to match the key the player pressed - otherwise
       holding right shoves him left whenever he is on the left of the
       ring, which is exactly what made the rope feel dead.             */
    const ax = Input.axis(n);
    if (ax) {
      const s = (tx * ax) >= 0 ? 1 : -1;
      p.vx += tx * s * 1250 * dt;
      p.vy += ty * s * 1250 * dt;
      p.face = ax;
    }

    /* A rope PULLS, it never pushes. Applying the correction while it was
       slack shoved him back into the ledge he had just left, which is
       what pinned him in place instead of letting him swing.           */
    if (d > p.ropeLen) {
      const pull = d - p.ropeLen;
      p.x -= nx * pull; p.y -= ny * pull;
      const radial = p.vx * nx + p.vy * ny;
      if (radial > 0) { p.vx -= nx * radial; p.vy -= ny * radial; }
      /* cap the sweep so it stays controllable, and bleed only a whisper
         of energy so the arc actually builds instead of dying           */
      let tan = p.vx * tx + p.vy * ty;
      const MAXT = 660;
      if (Math.abs(tan) > MAXT) { tan = Math.sign(tan) * MAXT; p.vx = tx * tan; p.vy = ty * tan; }
      p.vx *= 1 - 0.05 * dt; p.vy *= 1 - 0.05 * dt;
    }

    /* bookkeeping the renderer uses to tilt and animate him */
    p.swingTilt = -Math.atan2(dx, Math.max(18, dy));
    p.swingSpeed = p.vx * tx + p.vy * ty;

    if (dist(cx(p), cy(p), r.x, r.y) > LASSO_RANGE + 60) p.rope = null;
  }

  /* =============================== WORLD ========================== */
  function updateWorld(dt) {
    const A = S.a, R = S.r;

    /* ---- moving platforms ---- */
    for (const m of S.movers) {
      m.px = m.x; m.py = m.y;
      m.ph = (m.ph + dt / m.period) % 1;
      const k = (1 - Math.cos(m.ph * Math.PI * 2)) / 2;
      m.x = lerp(m.ax, m.bx, k);
      m.y = lerp(m.ay, m.by, k);
    }

    /* ---- her lantern lights the ghost timbers ---- */
    for (const ph of S.phantoms) {
      const d = dist(ph.x + ph.w / 2, ph.y + ph.h / 2, cx(R), cy(R));
      const want = d < LANTERN_R ? 1 : 0;
      ph.lit = approach(ph.lit, want, dt * 5);
    }

    /* ---- crumbling ledges ---- */
    for (const cb of S.crumbles) {
      if (cb.gone) {
        cb.gone += dt;
        if (cb.gone > 2.6) { cb.gone = 0; cb.t = -1; }   /* it grows back */
        continue;
      }
      const stood = [A, R].some(p => !p.down && p.grounded && p.ground === cb);
      if (stood && cb.t < 0) { cb.t = 0; Snd.play('gear'); }
      if (cb.t >= 0) {
        cb.t += dt;
        if (cb.t > 0.55) {
          cb.gone = 0.0001;
          FX.shard(cb.x + cb.w / 2, cb.y, 12, PAL.mesaNear);
          FX.shake(3, 0.16); Snd.play('thud');
        }
      }
    }

    /* ---- crates : only Arshia is heavy enough to shift one ---- */
    for (const cr of S.crates) {
      cr.vy = Math.min(cr.vy + CFG.GRAV * dt, CFG.TERMINAL);
      const solids = allSolids().filter(s => s !== cr);
      /* push detection */
      cr.vx = 0;
      if (!A.down) {
        const touching = A.y + A.h > cr.y + 4 && A.y < cr.y + cr.h - 4;
        if (touching) {
          if (A.vx > 20 && Math.abs(A.x + A.w - cr.x) < 8) { cr.vx = A.vx * 0.72; A.pushT = 0.12; }
          if (A.vx < -20 && Math.abs(cr.x + cr.w - A.x) < 8) { cr.vx = A.vx * 0.72; A.pushT = 0.12; }
        }
      }
      moveBody(cr, cr.vx * dt, cr.vy * dt, solids);
      if (cr.vx) FX.dust(cr.x + cr.w / 2, cr.y + cr.h, 1, -Math.sign(cr.vx));
    }

    /* ---- pressure plates ---- */
    for (const pl of S.plates) {
      const zone = { x: pl.x, y: pl.y - 10, w: pl.w, h: 22 };
      let on = false;
      for (const p of [A, R]) {
        if (p.down) continue;
        if (pl.who !== 'any' && pl.who !== p.who) continue;
        if (aabb({ x: p.x, y: p.y, w: p.w, h: p.h }, zone)) on = true;
      }
      /* a crate can hold a plate down too - that is the puzzle */
      for (const cr of S.crates) if (aabb(cr, zone)) on = true;
      /* the wrong one standing on it is the single easiest way to get
         stuck, so say so out loud rather than sitting there silently */
      if (!on && pl.who !== 'any') {
        const wrong = [A, R].find(q => q.who !== pl.who && !q.down &&
                                       aabb({ x: q.x, y: q.y, w: q.w, h: q.h }, zone));
        pl.nagT = Math.max(0, (pl.nagT || 0) - dt);
        if (wrong && pl.nagT <= 0) {
          pl.nagT = 2.2;
          const owner = LOOK[pl.who];
          FX.say(pl.x + pl.w / 2, pl.y - 40,
                 owner ? 'THIS ONE IS ' + owner.name + "'S" : 'TOO LIGHT  ·  PUSH THE CRATE ON',
                 owner ? owner.accent : PAL.gold, 14);
          Snd.play('wrong');
        }
      }
      pl.wasOn = pl.on; pl.on = on;
      if (on && !pl.wasOn) { Snd.play('gear'); FX.sparks(pl.x + pl.w / 2, pl.y, 6, PAL.gold); }
    }

    /* ---- gates ---- */
    for (const g of S.gates) {
      const test = id => { const pl = S.plates.find(q => q.id === id); return !!(pl && pl.on); };
      let open = g.mode === 'any' ? g.openBy.some(test) : g.openBy.every(test);
      /* a latching gate drops its bolt for good the first time it opens */
      if (g.latch) { if (open) g.latched = true; open = open || !!g.latched; }
      if (open !== g.open) {
        g.open = open;
        Snd.play(open ? 'coin' : 'thud');
        FX.shake(2.5, 0.2);
        if (open) FX.say(g.x + g.w / 2, g.y - 12, 'OPEN', PAL.gold, 15);
      }
      g.anim = approach(g.anim, g.open ? 1 : 0, dt * 4);
    }

    /* ---- coins ---- */
    for (const co of S.coins) {
      if (co.got) continue;
      for (const p of [A, R]) {
        if (p.down) continue;
        if (dist(co.x, co.y, cx(p), cy(p)) < 26) {
          co.got = true; S.coinsGot++;
          Snd.play('coin');
          FX.sparks(co.x, co.y, 12, PAL.gold);
          FX.say(co.x, co.y - 10, '+1', PAL.gold, 14);
          break;
        }
      }
    }

    /* ---- checkpoints ---- */
    for (const c4 of S.checkpoints) {
      if (c4.hit) continue;
      if (dist(c4.x, c4.y, cx(A), cy(A)) < 60 && dist(c4.x, c4.y, cx(R), cy(R)) < 160) {
        c4.hit = true;
        S.cpA = [c4.x - 30, c4.y - 60]; S.cpR = [c4.x + 30, c4.y - 60];
        Snd.play('bell');
        FX.say(c4.x, c4.y - 50, 'CHECKPOINT', PAL.teal, 16);
        FX.hearts(c4.x, c4.y - 30, 6, PAL.teal);
      }
    }

    /* ---- hazards and pits ---- */
    for (const p of [A, R]) {
      if (p.down) continue;
      for (const hz of S.hazards) {
        if (aabb({ x: p.x + 3, y: p.y + 3, w: p.w - 6, h: p.h - 6 }, hz)) hurt(p, 1, 'spike');
      }
      if (p.y > S.def.deathY) fell(p);
    }

    /* ---- kiss revive ---- */
    reviveCheck(A, 1, R);
    reviveCheck(R, 2, A);

    /* ---- both down -> restart from the checkpoint ---- */
    if (A.down && R.down && S.state === 'play') {
      S.state = 'wipe'; S.stateT = 0;
      Snd.play('lose');
    }

    /* ---- her pendant answers to how close he is ---- */
    const gap = dist(cx(A), cy(A), cx(R), cy(R));
    R.closeness = clamp(1 - (gap - 40) / 200, 0, 1);

    /* ---- leash: neither may drag the camera off the other ---- */
    const mid = (cx(A) + cx(R)) / 2;
    for (const p of [A, R]) {
      if (cx(p) - mid > LEASH / 2) { p.x = mid + LEASH / 2 - p.w / 2; p.vx = Math.min(p.vx, 0); }
      if (mid - cx(p) > LEASH / 2) { p.x = mid - LEASH / 2 - p.w / 2; p.vx = Math.max(p.vx, 0); }
    }

    /* ---- tumbleweed, purely for flavour ---- */
    /* It has to roll along the ground THEY are standing on. Pinned to a
       fixed world height it just floated through the sky looking broken. */
    const tw = S.tumble;
    const standing = (A.grounded && A.ground) ? A.ground
                   : (R.grounded && R.ground) ? R.ground : null;
    if (standing) tw.groundY = standing.y;
    if (!tw.on) {
      tw.wait -= dt;
      if (tw.wait <= 0 && tw.groundY !== undefined) {
        tw.on = true; tw.x = S.cam.x - 50;
        tw.r = rnd(15, 9); tw.rot = 0; tw.hop = 0; tw.hv = 0;
      }
    } else {
      tw.x += 165 * dt;
      tw.rot += 6.2 * dt;
      /* a little bounce, the way they actually tumble */
      tw.hv += 900 * dt;
      tw.hop += tw.hv * dt;
      if (tw.hop >= 0) { tw.hop = 0; tw.hv = -rnd(230, 120); }
      if (tw.x > S.cam.x + CFG.W / S.cam.zoom + 70) { tw.on = false; tw.wait = rnd(16, 7); }
    }

    /* ---- exit ---- */
    const ex = S.def.exit;
    if (!A.down && !R.down &&
        aabb({ x: A.x, y: A.y, w: A.w, h: A.h }, ex) &&
        aabb({ x: R.x, y: R.y, w: R.w, h: R.h }, ex) &&
        S.state === 'play') {
      S.state = 'clear'; S.stateT = 0;
      Snd.play('win'); FX.hearts(ex.x + ex.w / 2, ex.y + 20, 22);
      FX.flash('#ffd66b', 0.5);
    }
  }

  /* ---------------- damage / down / revive ---------------- */
  function hurt(p, n, cause) {
    if (p.iframe > 0 || p.down) return;
    p.hearts -= n;
    p.iframe = 1.1;
    p.vy = -300; p.vx = -p.face * 200;
    p.expr = 'hurt';
    Snd.play('dead');
    FX.shake(6, 0.3); FX.flash(PAL.redDk, 0.2);
    FX.sparks(cx(p), cy(p), 14, PAL.red);
    FX.say(cx(p), p.y - 12, '-1', PAL.red, 18);
    if (p.hearts <= 0) knockDown(p);
  }

  /* Off the bottom of the world. This is deliberately NOT instant death:
     it costs a heart and puts them back on the last ground they stood on,
     so a missed jump can never strand the pair with no way forward.     */
  function fell(p) {
    if (p.down) return;
    p.x = p.safeX; p.y = p.safeY - 6;
    p.vx = 0; p.vy = 0; p.rope = null;
    FX.smoke(cx(p), cy(p), 10);
    if (p.iframe > 0) return;              /* already reeling - free pass */
    p.hearts -= 1;
    p.iframe = 1.2;
    Snd.play('dead');
    FX.shake(6, 0.3); FX.flash(PAL.redDk, 0.2);
    FX.say(cx(p), p.y - 14, 'CAUGHT THE LEDGE', PAL.parchDk, 14);
    if (p.hearts <= 0) knockDown(p);
  }

  function knockDown(p) {
    if (p.down) return;
    p.down = true; p.downT = 0; p.hearts = 0; p.rope = null;
    S.deaths++;
    Snd.play('dead');
    FX.shake(7, 0.35);
    FX.say(cx(p), p.y - 16, LOOK[p.who].name + ' IS DOWN', LOOK[p.who].accent, 17);
  }

  function reviveCheck(fallen, helperN, helper) {
    if (!fallen.down || helper.down) { fallen.reviveT = 0; return; }
    const near = dist(cx(fallen), cy(fallen), cx(helper), cy(helper)) < KISS_RANGE;
    /* the HELPER presses their own kiss key */
    const hold = Input.p(helper.who === 'arshia' ? 1 : 2, 'kiss');
    if (near && hold) {
      fallen.reviveT += 1 / 60;
      helper.anim = 'kiss'; helper.expr = 'love';
      if (Math.random() < 0.3) FX.hearts(cx(fallen), cy(fallen) - 10, 1, LOOK[fallen.who].accent);
      if (fallen.reviveT >= KISS_TIME) revive(fallen, helper);
    } else {
      fallen.reviveT = Math.max(0, fallen.reviveT - 1 / 30);
    }
  }

  function revive(p, helper) {
    p.down = false; p.reviveT = 0; p.iframe = 1.6;
    p.maxHearts = Math.max(1, p.maxHearts - 1);   /* the price of coming back */
    p.hearts = p.maxHearts;
    p.expr = 'love'; p.anim = 'idle';
    S.revives++;
    Snd.play('kiss'); Snd.play('revive');
    FX.hearts(cx(p), cy(p) - 12, 20);
    FX.flash('#ffb8cf', 0.35);
    FX.say(cx(p), p.y - 26, 'BACK FROM THE DEAD', LOOK[p.who].accent, 16);
    FX.say(cx(helper), helper.y - 40, '-1 MAX HEART', PAL.parchDk, 13);
  }

  function respawn() {
    const A = S.a, R = S.r;
    const base = DIFF[S.difficulty].hearts;
    [[A, S.cpA], [R, S.cpR]].forEach(([p, cp]) => {
      p.x = cp[0]; p.y = cp[1]; p.vx = 0; p.vy = 0;
      p.down = false; p.downT = 0; p.reviveT = 0; p.rope = null;
      p.maxHearts = base; p.hearts = base; p.iframe = 1.2;
      p.safeX = cp[0]; p.safeY = cp[1]; p.safeT = 0;
      p.anim = 'idle'; p.expr = 'normal';
    });
    for (const cb of S.crumbles) { cb.t = -1; cb.gone = 0; }
    FX.clear();
  }

  /* =============================== CAMERA ========================= */
  function updateCam(dt) {
    const A = S.a, R = S.r;
    const mx = (cx(A) + cx(R)) / 2, my = (cy(A) + cy(R)) / 2;
    const spread = Math.abs(cx(A) - cx(R));
    const zoom = clamp(1.15 - (spread - 300) / 1300, 0.92, 1.15);
    S.cam.zoom = lerp(S.cam.zoom, zoom, dt * 3);
    S.cam.tx = mx - CFG.W / (2 * S.cam.zoom);
    S.cam.ty = my - CFG.H / (2 * S.cam.zoom) + 40;
    S.cam.tx = clamp(S.cam.tx, 0, Math.max(0, S.def.w - CFG.W / S.cam.zoom));
    S.cam.ty = clamp(S.cam.ty, -60, Math.max(0, S.def.h - CFG.H / S.cam.zoom));
    S.cam.x = lerp(S.cam.x, S.cam.tx, clamp(dt * 6.5, 0, 1));
    S.cam.y = lerp(S.cam.y, S.cam.ty, clamp(dt * 5.0, 0, 1));
  }

  /* =============================== UPDATE ========================= */
  function update(dt) {
    if (!S) return null;
    S.t += dt;
    S.stateT += dt;
    S.hintT = Math.max(0, S.hintT - dt);

    if (S.state === 'intro') {
      updateCam(dt); FX.update(dt);
      if (S.stateT > 2.6 || Input.menuOk()) { S.state = 'play'; S.stateT = 0; S.hintT = 5.0; }
      return null;
    }
    if (S.state === 'wipe') {
      FX.update(dt);
      if (S.stateT > 1.5) { respawn(); S.state = 'play'; S.stateT = 0; }
      return null;
    }
    if (S.state === 'clear') {
      FX.update(dt); updateCam(dt);
      S.a.anim = S.r.anim = 'cheer'; S.a.expr = S.r.expr = 'happy';
      S.a.t += dt; S.r.t += dt;
      if (S.stateT > 2.2) {
        return { done: true, coins: S.coinsGot, total: S.coins.length,
                 time: S.elapsed, deaths: S.deaths, revives: S.revives };
      }
      return null;
    }

    S.elapsed += dt;
    const solids = allSolids();
    updatePlayer(S.a, 1, dt, solids);
    updatePlayer(S.r, 2, dt, solids);
    updateWorld(dt);
    updateCam(dt);
    FX.update(dt);
    return null;
  }

  /* =============================== DRAW =========================== */
  function draw(c) {
    if (!S) return;
    const cam = S.cam, D = S.def;

    Sky.draw(c, D.theme, cam.x, cam.y, CFG.W, CFG.H, S.t);

    c.save();
    FX.applyShake(c);
    c.scale(cam.zoom, cam.zoom);
    c.translate(-cam.x, -cam.y);

    /* --- terrain --- */
    for (const s of S.solids) {
      if (s.type === 'plank') Props.plank(c, s.x, s.y, s.w, s.h);
      else if (s.type === 'timber') Props.timber(c, s.x, s.y, s.w, s.h);
      else Props.ground(c, s.x, s.y, s.w, s.h);
    }
    for (const m of S.movers) {
      if (m.type === 'timber') Props.timber(c, m.x, m.y, m.w, m.h);
      else Props.plank(c, m.x, m.y, m.w, m.h);
      /* chain up to the ceiling so it reads as machinery */
      c.strokeStyle = 'rgba(154,162,177,0.35)'; c.lineWidth = 2;
      c.setLineDash([4, 5]);
      c.beginPath(); c.moveTo(m.x + m.w / 2, m.y); c.lineTo(m.x + m.w / 2, Math.min(m.ay, m.by) - 60); c.stroke();
      c.setLineDash([]);
    }

    /* --- crumbling ledges --- */
    for (const cb of S.crumbles) {
      if (cb.gone) continue;
      c.save();
      if (cb.t >= 0) {
        const k = cb.t / 0.55;
        c.translate(rnd(k * 3, -k * 3), rnd(k * 2, -k * 2));
        c.globalAlpha = 1 - k * 0.35;
      }
      Props.plank(c, cb.x, cb.y, cb.w, cb.h);
      c.restore();
    }

    /* --- ghost timbers: solid only inside her lantern --- */
    for (const ph of S.phantoms) {
      c.save();
      c.globalAlpha = 0.16 + ph.lit * 0.84;
      if (ph.lit > 0.35) Props.timber(c, ph.x, ph.y, ph.w, ph.h);
      else {
        c.setLineDash([6, 5]);
        rr(c, ph.x, ph.y, ph.w, ph.h, 2);
        c.lineWidth = 2; c.strokeStyle = LOOK.rojina.accent; c.stroke();
        c.setLineDash([]);
      }
      c.restore();
    }

    /* --- tumbleweed, rolling along the ground in front of the scenery --- */
    if (S.tumble.on && S.tumble.groundY !== undefined) {
      const tw = S.tumble;
      c.save(); c.globalAlpha = 0.9;
      ell(c, tw.x, tw.groundY - 1, tw.r * 0.8, 2.6);
      c.fillStyle = 'rgba(22,13,28,0.30)'; c.fill();
      Props.tumbleweed(c, tw.x, tw.groundY - tw.r + tw.hop, tw.r, tw.rot);
      c.restore();
    }

    /* --- crates, plates, gates, rings, hazards --- */
    for (const cr of S.crates) Props.crate(c, cr.x, cr.y, cr.w, cr.h, false);
    for (const pl of S.plates) Props.plate(c, pl.x, pl.y, pl.w, pl.on, pl.who);
    for (const g of S.gates) Props.gate(c, g.x, g.y, g.w, g.h, g.open, S.t);
    drawGateGuides(c);
    for (const hz of S.hazards) Props.spikes(c, hz.x, hz.y, hz.w, hz.h);
    for (const r of S.rings) {
      const inRange = !S.a.down && dist(cx(S.a), cy(S.a), r.x, r.y) < LASSO_RANGE;
      Props.ring(c, r.x, r.y, S.t, inRange || S.a.rope === r);
    }
    for (const c5 of S.checkpoints) drawCheckpoint(c, c5, S.t);
    for (const co of S.coins) if (!co.got) Props.coin(c, co.x, co.y, S.t);

    /* --- exit --- */
    const ex = D.exit;
    Props.gate(c, ex.x, ex.y, ex.w, ex.h, true, S.t);
    txt(c, 'OUT', ex.x + ex.w / 2, ex.y - 14,
        { size: 14, font: FONT.title, fill: PAL.gold, stroke: PAL.ink, lw: 4 });

    /* --- her lantern glow, laid over the world --- */
    if (!S.r.down) drawLantern(c, S.r);

    /* --- the rope --- */
    if (S.a.rope) drawRope(c, S.a);

    /* --- the two of them --- */
    FX.draw(c);
    drawActor(c, S.r);
    drawActor(c, S.a);
    drawReviveRing(c, S.a, S.r);
    drawReviveRing(c, S.r, S.a);

    c.restore();

    /* --- darkness pass for the mine --- */
    if (D.dark) drawDarkness(c);

    drawHUD(c);
    FX.drawFlash(c, CFG.W, CFG.H);

    if (S.state === 'intro') drawIntroCard(c);
    if (S.state === 'wipe') drawWipe(c);
    if (S.state === 'clear') drawClearBanner(c);
  }

  function drawActor(c, p) {
    const blink = p.iframe > 0 && Math.floor(p.iframe * 14) % 2 === 0;
    drawChar(c, p.who, {
      x: cx(p), y: p.y + p.h, face: p.face, anim: p.anim, t: p.t,
      expr: p.expr, scale: 1, speed: p.speed || 0, airT: p.airT,
      alpha: blink ? 0.35 : 1, blinkSeed: p.blinkSeed,
      tilt: p.rope ? p.swingTilt : 0,
      swing: p.rope ? clamp(Math.abs(p.swingSpeed) / 420, 0, 1.6) : 0,
      closeness: p.closeness || 0,
      prop: p.who === 'rojina' ? 'lantern' : null
    });
    /* name tag, so it is always obvious who is who */
    const col = LOOK[p.who].accent;
    const tagY = p.y - (p.who === 'rojina' ? 44 : 16);
    txt(c, LOOK[p.who].name, cx(p), tagY,
        { size: 11, font: FONT.title, fill: col, stroke: PAL.ink, lw: 3.5, letter: 1 });
    /* hearts above the head */
    const n = p.maxHearts;
    for (let i = 0; i < n; i++) {
      const hx = cx(p) - (n - 1) * 5 + i * 10;
      c.save();
      c.globalAlpha = i < p.hearts ? 1 : 0.22;
      drawHeart(c, hx, tagY - 14, 3.6, i < p.hearts ? PAL.red : PAL.ink);
      c.restore();
    }
  }

  /* A locked door has to explain itself. Whenever either of them is near
     one, draw a dashed line from the door to each plate that opens it and
     name whose weight the plate is waiting for. Nobody should ever stand
     in front of a lock wondering what the game wants.                   */
  function drawGateGuides(c) {
    for (const g of S.gates) {
      if (g.open) continue;
      const gx = g.x + g.w / 2, gy = g.y + g.h / 2;
      const near = Math.min(dist(cx(S.a), cy(S.a), gx, gy),
                            dist(cx(S.r), cy(S.r), gx, gy));
      if (near > 340) continue;
      const fade = clamp((340 - near) / 120, 0, 1);

      c.save();
      c.globalAlpha = fade;

      /* the sign hanging on the door */
      const plates = g.openBy.map(id => S.plates.find(q => q.id === id)).filter(Boolean);
      const owner = plates.length === 1 ? plates[0].who : 'any';
      const label = g.mode === 'any' ? 'ONE OF THESE' : 'ALL OF THESE';
      const w = 190;
      rr(c, gx - w / 2, g.y - 46, w, 30, 5);
      c.fillStyle = 'rgba(22,13,28,0.82)'; c.fill();
      c.lineWidth = 2; c.strokeStyle = PAL.gold; c.stroke();
      txt(c, plates.length > 1 ? label : 'NEEDS A PLATE', gx, g.y - 38,
          { size: 10, font: FONT.ui, fill: PAL.parchDk, letter: 1 });
      const ownerLabel = owner === 'crate' ? 'THE CRATE ON THE PLATE'
                       : owner === 'any' ? 'SOMEBODY STANDING ON IT'
                       : LOOK[owner].name + "'S WEIGHT";
      txt(c, ownerLabel, gx, g.y - 25,
          { size: 12, font: FONT.title,
            fill: LOOK[owner] ? LOOK[owner].accent : PAL.gold });

      /* a dashed thread from the door to each plate, with an arrow head */
      for (const pl of plates) {
        const px = pl.x + pl.w / 2, py = pl.y;
        const col = LOOK[pl.who] ? LOOK[pl.who].accent : PAL.gold;
        c.save();
        c.globalAlpha = fade * (pl.on ? 0.85 : 0.55);
        c.setLineDash([7, 7]);
        c.lineDashOffset = -S.t * 26;
        c.lineWidth = 2.4; c.strokeStyle = col;
        c.beginPath();
        c.moveTo(gx, g.y - 6);
        c.quadraticCurveTo((gx + px) / 2, Math.min(g.y, py) - 70, px, py - 16);
        c.stroke();
        c.setLineDash([]);
        /* marker over the plate itself */
        const bob = Math.sin(S.t * 3.4) * 3;
        c.beginPath();
        c.moveTo(px, py - 12 + bob);
        c.lineTo(px - 7, py - 24 + bob);
        c.lineTo(px + 7, py - 24 + bob);
        c.closePath();
        c.fillStyle = col; c.fill();
        c.lineWidth = 1.5; c.strokeStyle = PAL.ink; c.stroke();
        if (LOOK[pl.who]) {
          txt(c, LOOK[pl.who].name, px, py - 34 + bob,
              { size: 11, font: FONT.title, fill: col, stroke: PAL.ink, lw: 3.5 });
        }
        if (pl.on) {
          c.globalAlpha = fade;
          txt(c, 'HELD', px, py - 48 + bob,
              { size: 11, font: FONT.title, fill: PAL.teal, stroke: PAL.ink, lw: 3.5 });
        }
        c.restore();
      }
      c.restore();
    }
  }

  function drawRope(c, p) {
    const r = p.rope;
    c.save();
    c.strokeStyle = '#e0c48c'; c.lineWidth = 2.4; c.lineCap = 'round';
    c.beginPath();
    /* a little sag in the line */
    const mx = (cx(p) + r.x) / 2, my = (cy(p) + r.y) / 2 + 8;
    c.moveTo(r.x, r.y);
    c.quadraticCurveTo(mx, my, cx(p), cy(p) - 4);
    c.stroke();
    c.strokeStyle = 'rgba(22,13,28,0.5)'; c.lineWidth = 0.9; c.stroke();
    ell(c, r.x, r.y, 4, 4); ink(c, PAL.gold, 1.4);
    c.restore();
  }

  function drawLantern(c, p) {
    c.save();
    c.globalCompositeOperation = 'lighter';
    const g = c.createRadialGradient(cx(p), cy(p), 8, cx(p), cy(p), LANTERN_R);
    g.addColorStop(0, 'rgba(255,214,107,0.34)');
    g.addColorStop(0.45, 'rgba(255,180,90,0.13)');
    g.addColorStop(1, 'rgba(255,160,80,0)');
    c.fillStyle = g;
    c.beginPath(); c.arc(cx(p), cy(p), LANTERN_R, 0, Math.PI * 2); c.fill();
    c.restore();
  }

  /* The darkness is built on its own canvas and the light punched out of
     THAT, then laid over the scene. Punching holes straight into the main
     canvas would erase the game underneath, not just the shadow.

     It used to cost 4.7ms a frame -- more than everything else in the mine
     put together -- because it rebuilt three radial gradients and filled
     three big arcs every frame at full resolution. Two things fixed that:

       - the lamp is baked ONCE into a small sprite and blitted. Every
         stop in the old gradient scaled linearly with the strength, so
         drawing one full-strength sprite under globalAlpha is the same
         picture, and moving it is a blit instead of a gradient build.
       - the layer is rendered at half resolution and stretched back up.
         It is nothing but soft gradients, so a quarter of the fill rate
         buys a blur nobody can see.                                    */
  const DARK_SCALE = 0.5;
  const LAMP_R = 256;                    /* the baked sprite radius */
  let darkCv = null, darkCtx = null, lampCv = null;

  function lampSprite() {
    if (lampCv) return lampCv;
    lampCv = document.createElement('canvas');
    lampCv.width = lampCv.height = LAMP_R * 2;
    const g2 = lampCv.getContext('2d');
    const g = g2.createRadialGradient(LAMP_R, LAMP_R, LAMP_R * 0.024,
                                      LAMP_R, LAMP_R, LAMP_R);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.85)');
    g.addColorStop(0.85, 'rgba(0,0,0,0.30)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    g2.fillStyle = g;
    g2.fillRect(0, 0, LAMP_R * 2, LAMP_R * 2);
    return lampCv;
  }

  function drawDarkness(c) {
    const W = Math.round(CFG.W * DARK_SCALE), H = Math.round(CFG.H * DARK_SCALE);
    if (!darkCv) { darkCv = document.createElement('canvas'); darkCtx = darkCv.getContext('2d'); }
    if (darkCv.width !== W || darkCv.height !== H) { darkCv.width = W; darkCv.height = H; }

    const d = darkCtx, cam = S.cam, z = cam.zoom * DARK_SCALE;
    const sx = q => (q - cam.x) * z, sy = q => (q - cam.y) * z;
    const lamp = lampSprite();

    /* copy clears and fills in one pass instead of clearRect + fillRect */
    d.setTransform(1, 0, 0, 1, 0, 0);
    d.globalAlpha = 1;
    d.globalCompositeOperation = 'copy';
    d.fillStyle = 'rgba(9,5,13,0.88)';
    d.fillRect(0, 0, W, H);

    d.globalCompositeOperation = 'destination-out';
    const punch = (px, py, rad, str) => {
      d.globalAlpha = str;
      d.drawImage(lamp, px - rad, py - rad, rad * 2, rad * 2);
    };
    [[S.r, LANTERN_R * z, 1.0], [S.a, 86 * z, 0.80]].forEach(([q, rad, str]) => {
      punch(sx(cx(q)), sy(cy(q)), rad, q.down ? str * 0.5 : str);
    });
    /* the exit always shows a faint glow so they know where they are going */
    const ex = S.def.exit;
    punch(sx(ex.x + ex.w / 2), sy(ex.y + ex.h / 2), 120 * z, 0.55);

    d.globalAlpha = 1;
    d.globalCompositeOperation = 'source-over';
    c.save();
    c.drawImage(darkCv, 0, 0, W, H, 0, 0, CFG.W, CFG.H);
    c.restore();
  }

  function drawCheckpoint(c, cp, t) {
    c.save();
    c.translate(cp.x, cp.y);
    c.fillStyle = PAL.woodDark; c.fillRect(-2.5, -52, 5, 52);
    const wave = Math.sin(t * 3) * 3;
    c.beginPath();
    c.moveTo(2, -52);
    c.quadraticCurveTo(18 + wave, -46, 26, -38);
    c.quadraticCurveTo(16 + wave, -34, 2, -32);
    c.closePath();
    ink(c, cp.hit ? PAL.teal : PAL.parchDk, 1.6);
    if (cp.hit) { c.save(); c.globalAlpha = 0.3; ell(c, 0, -26, 26, 30); c.fillStyle = PAL.teal; c.fill(); c.restore(); }
    c.restore();
  }

  function drawReviveRing(c, fallen, helper) {
    if (!fallen.down) return;
    const near = dist(cx(fallen), cy(fallen), cx(helper), cy(helper)) < KISS_RANGE;
    const helperKey = helper.who === 'arshia' ? 'Q' : 'R-SHIFT';
    c.save();
    /* prompt over the body */
    const bob = Math.sin(S.t * 4) * 3;
    txt(c, near ? 'HOLD  ' + helperKey + '  TO KISS' : LOOK[helper.who].name + ', GET TO THEM',
        cx(fallen), fallen.y - 34 + bob,
        { size: 13, font: FONT.title, fill: near ? PAL.red : PAL.parchDk,
          stroke: PAL.ink, lw: 4 });
    /* progress ring */
    if (fallen.reviveT > 0) {
      const k = fallen.reviveT / KISS_TIME;
      c.beginPath();
      c.arc(cx(fallen), cy(fallen), 30, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2);
      c.lineWidth = 5; c.strokeStyle = PAL.red; c.lineCap = 'round'; c.stroke();
      drawHeart(c, cx(fallen), cy(fallen) - 30, 4 + k * 3, PAL.red);
    }
    c.restore();
  }

  /* =============================== HUD ============================ */
  function drawHUD(c) {
    const D = S.def;
    /* top banner */
    c.save();
    c.fillStyle = 'rgba(22,13,28,0.55)';
    c.fillRect(0, 0, CFG.W, 40);
    c.fillStyle = 'rgba(226,176,67,0.5)';
    c.fillRect(0, 39, CFG.W, 1.5);
    txt(c, D.name, CFG.W / 2, 20, { size: 18, font: FONT.title, fill: PAL.parch, letter: 2 });
    txt(c, 'TIME  ' + fmtTime(S.elapsed), 96, 20, { size: 14, font: FONT.ui, fill: PAL.parchDk });
    txt(c, 'SILVER  ' + S.coinsGot + '/' + S.coins.length, CFG.W - 96, 20,
        { size: 14, font: FONT.ui, fill: PAL.gold });
    c.restore();

    /* per-player corner cards */
    playerCard(c, S.a, 12, 48, 'left');
    playerCard(c, S.r, CFG.W - 12, 48, 'right');

    /* the hint line, only at the start */
    if (S.hintT > 0) {
      c.save();
      c.globalAlpha = clamp(S.hintT, 0, 1);
      const w = 640;
      rr(c, CFG.W / 2 - w / 2, CFG.H - 62, w, 34, 6);
      c.fillStyle = 'rgba(22,13,28,0.72)'; c.fill();
      c.lineWidth = 1.5; c.strokeStyle = 'rgba(226,176,67,0.5)'; c.stroke();
      txt(c, D.hint, CFG.W / 2, CFG.H - 45, { size: 14, font: FONT.ui, fill: PAL.parch });
      c.restore();
    }
  }

  function playerCard(c, p, x, y, align) {
    const L = LOOK[p.who];
    const w = 178, h = 52;
    const bx = align === 'left' ? x : x - w;
    c.save();
    rr(c, bx, y, w, h, 6);
    c.fillStyle = 'rgba(22,13,28,0.62)'; c.fill();
    c.lineWidth = 2; c.strokeStyle = L.accent; c.stroke();
    /* face chip */
    c.save();
    c.beginPath(); c.arc(bx + 24, y + h / 2, 17, 0, Math.PI * 2); c.clip();
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(bx + 7, y + 4, 34, 38);
    drawPortrait(c, p.who, bx + 24, y + h / 2 + 3, 30,
                 p.down ? 'ko' : (p.hearts <= 1 ? 'scared' : 'normal'), p.t);
    c.restore();
    c.beginPath(); c.arc(bx + 24, y + h / 2, 17, 0, Math.PI * 2);
    c.lineWidth = 2; c.strokeStyle = L.accent; c.stroke();

    /* name on its own line so nothing can collide with it */
    txt(c, L.name, bx + 50, y + 16,
        { size: 14, font: FONT.title, fill: L.accent, align: 'left', letter: 1 });
    /* hearts underneath */
    for (let i = 0; i < p.maxHearts; i++) {
      c.save(); c.globalAlpha = i < p.hearts ? 1 : 0.22;
      drawHeart(c, bx + 57 + i * 15, y + 36, 5.4, i < p.hearts ? PAL.red : PAL.ink);
      c.restore();
    }
    /* ability pip, in its own little slot on the far side */
    const pip = p.who === 'arshia' ? (p.rope ? 'SWING' : 'LASSO') : 'LANTERN';
    const pw = 54;
    rr(c, bx + w - pw - 6, y + 30, pw, 15, 3);
    c.fillStyle = 'rgba(239,220,176,0.10)'; c.fill();
    c.lineWidth = 1; c.strokeStyle = 'rgba(239,220,176,0.30)'; c.stroke();
    txt(c, pip, bx + w - pw / 2 - 6, y + 38,
        { size: 9, font: FONT.ui, fill: PAL.parchDk, letter: 1 });
    c.restore();
  }

  /* =============================== CARDS ========================== */
  function drawIntroCard(c) {
    const k = clamp(S.stateT / 0.5, 0, 1) * clamp((2.6 - S.stateT) / 0.5, 0, 1);
    c.save();
    c.globalAlpha = k;
    c.fillStyle = 'rgba(22,13,28,0.75)';
    c.fillRect(0, CFG.H / 2 - 96, CFG.W, 192);
    c.fillStyle = 'rgba(226,176,67,0.55)';
    c.fillRect(0, CFG.H / 2 - 96, CFG.W, 2);
    c.fillRect(0, CFG.H / 2 + 94, CFG.W, 2);
    txt(c, S.def.sub, CFG.W / 2, CFG.H / 2 - 60, { size: 15, font: FONT.ui, fill: PAL.parchDk, letter: 5 });
    txt(c, S.def.name, CFG.W / 2, CFG.H / 2 - 20, { size: 46, font: FONT.title, fill: PAL.gold, stroke: PAL.ink, lw: 6, letter: 3 });
    txt(c, S.def.story, CFG.W / 2, CFG.H / 2 + 32, { size: 15, font: FONT.ui, fill: PAL.parch });
    txt(c, S.def.hint, CFG.W / 2, CFG.H / 2 + 62, { size: 13, font: FONT.ui, fill: LOOK.rojina.accent });
    c.restore();
  }

  function drawWipe(c) {
    const k = clamp(S.stateT / 0.4, 0, 1);
    c.save();
    c.globalAlpha = k * clamp((1.5 - S.stateT) / 0.4, 0, 1);
    c.fillStyle = 'rgba(22,13,28,0.85)'; c.fillRect(0, 0, CFG.W, CFG.H);
    txt(c, 'BOTH OF THEM WENT DOWN', CFG.W / 2, CFG.H / 2 - 16,
        { size: 30, font: FONT.title, fill: PAL.red, stroke: PAL.ink, lw: 5 });
    txt(c, 'back to the last checkpoint', CFG.W / 2, CFG.H / 2 + 22,
        { size: 15, font: FONT.ui, fill: PAL.parchDk });
    c.restore();
  }

  function drawClearBanner(c) {
    const k = clamp(S.stateT / 0.4, 0, 1);
    c.save(); c.globalAlpha = k;
    c.fillStyle = 'rgba(22,13,28,0.6)';
    c.fillRect(0, CFG.H / 2 - 70, CFG.W, 140);
    txt(c, 'STAGE CLEAR', CFG.W / 2, CFG.H / 2 - 10,
        { size: 50, font: FONT.title, fill: PAL.gold, stroke: PAL.ink, lw: 6, letter: 4 });
    txt(c, fmtTime(S.elapsed) + '   ·   SILVER ' + S.coinsGot + '/' + S.coins.length,
        CFG.W / 2, CFG.H / 2 + 36, { size: 16, font: FONT.ui, fill: PAL.parch });
    c.restore();
  }

  return { start, update, draw, get state() { return S; } };
})();
