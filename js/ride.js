/* =====================================================================
   ride.js : RIDE OR DIE -- one horse, two jobs.

     ARSHIA holds the reins: A/D lean the horse back and forward along
            the trail, W jumps it over whatever is in the way.
     ROJINA rides behind him with the gun: arrows move the sights,
            "/" fires. Birds come at them; only she can drive them off.

   The old version had three things wrong with it that were not the
   player's fault:

     - rocks sat in one of three "lanes" that were only sixteen pixels
       apart on screen, so there was no way to see which lane a rock was
       in before it hit. Lanes are gone; rocks are jumped, and that
       reads at a glance.
     - the pursuers came from in front of them, which makes no sense for
       something chasing them.
     - the run ended the instant the distance counter filled, with no
       finish and no reason.

   Now the trail is nearly three times longer, it opens with easy
   spacing and tightens, and it ends at their front door.
   ===================================================================== */

const Ride = (() => {

  const GROUND = () => CFG.H - 118;
  const RIDER_X = CFG.W * 0.30;

  /* ------------------------------------------------------------------ */
  function start(def, ts, hearts) {
    const S = {
      ts,
      stage: 'ride',                 /* ride -> arrive -> done          */
      dist: 0, goal: def.distance,
      speed: 0, targetSpeed: 235,
      y: 0, vy: 0, grounded: true,
      pitch: 0,                      /* the horse leans as it works     */
      cross: { x: CFG.W * 0.60, y: CFG.H * 0.46 },
      things: [], spawnT: 1.6, warn: [],
      hp: hearts || 3, maxHp: hearts || 3,
      score: 0, maxScore: 0, fails: 0, kisses: 0, elapsed: 0,
      shotCool: 0, msg: '', msgT: 0,
      house: null, arriveT: 0, walk: 0,
      lostMsg: 'THE TRAIL BEAT THEM'
    };
    S.reset = () => {
      S.stage = 'ride'; S.dist = 0; S.things = []; S.warn = [];
      S.hp = S.maxHp; S.score = 0; S.maxScore = 0; S.y = 0; S.vy = 0;
      S.grounded = true; S.speed = 0; S.spawnT = 1.6;
      S.house = null; S.arriveT = 0; S.walk = 0; S.pitch = 0;
      /* without this the retry never plays the arrival */
      S.doneHearts = false; S.msg = ''; S.msgT = 0; S.shotCool = 0;
      S.cross.x = CFG.W * 0.60; S.cross.y = CFG.H * 0.46;
    };
    S.update = dt => update(S, dt);
    S.draw = c => draw(S, c);
    return S;
  }

  /* ------------------------------------------------------------------ */
  function update(S, dt) {
    S.elapsed += dt;
    S.msgT = Math.max(0, S.msgT - dt);

    if (S.stage === 'arrive') return arrive(S, dt);

    /* Speed climbs gently across the run instead of starting fast. The
       ceiling is well below the old one so there is time to react.     */
    const k = clamp(S.dist / S.goal, 0, 1);
    S.targetSpeed = 235 + k * 95;
    S.speed = approach(S.speed, S.targetSpeed, 120 * dt);
    S.dist += S.speed * dt;

    /* ---------------- ARSHIA rides ---------------- */
    const steer = Input.axis(1);
    /* leaning does not move him across lanes any more - it changes how
       hard the horse is driving, which is what the reins are for */
    S.pitch = approach(S.pitch, steer * 0.16, 1.4 * dt);
    if (steer > 0) S.dist += 34 * dt;          /* urging it on */

    if (Input.ph(1, 'up') && S.grounded) {
      S.vy = -595; S.grounded = false;
      Snd.play('jump');
      FX.dust(RIDER_X, GROUND(), 12, -1);
    }
    if (!S.grounded) {
      S.vy += 1700 * dt;
      S.y += S.vy * dt;
      if (S.y >= 0) {
        S.y = 0; S.vy = 0; S.grounded = true;
        Snd.play('land'); FX.land(RIDER_X, GROUND(), 0.7);
      }
    }
    /* hoofbeats and kicked-up dust, paced to the gallop */
    S.hoof = (S.hoof || 0) + dt * (S.speed / 46);
    if (S.grounded && S.hoof > 1) {
      S.hoof = 0; Snd.play('horse');
      FX.dust(RIDER_X - 18, GROUND(), 2, -1);
    }

    /* ---------------- ROJINA shoots ---------------- */
    const cs = 400;
    S.cross.x = clamp(S.cross.x + (Input.p(2, 'right') - Input.p(2, 'left')) * cs * dt,
                      RIDER_X + 40, CFG.W - 30);
    S.cross.y = clamp(S.cross.y + (Input.p(2, 'down') - Input.p(2, 'up')) * cs * dt,
                      70, GROUND() - 24);
    S.shotCool = Math.max(0, S.shotCool - dt);
    if (Input.ph(2, 'act') && S.shotCool <= 0) {
      S.shotCool = 0.24;
      Snd.play('shot'); FX.shake(3, 0.13);
      FX.sparks(S.cross.x, S.cross.y, 8, PAL.gold);
      let hit = null;
      for (const o of S.things)
        if (o.kind === 'bird' && !o.dead &&
            dist(o.x, o.y, S.cross.x, S.cross.y) < 42) { hit = o; break; }
      if (hit) {
        hit.dead = 0.001; hit.vy = -60; S.score++;
        Snd.play('coin');
        FX.sparks(hit.x, hit.y, 16, '#e8d6bb');
        for (let i = 0; i < 5; i++)
          FX.spawn({ x: hit.x, y: hit.y, vx: rnd(90, -90), vy: rnd(-30, -90),
                     g: 90, life: rnd(1.1, 0.6), r: rnd(2.6, 1.4),
                     col: '#efdcb0', drag: 1.4 });
      } else {
        FX.say(S.cross.x, S.cross.y - 18, 'MISS', PAL.parchDk, 12);
      }
    }

    spawn(S, dt, k);
    move(S, dt);

    if (S.hp <= 0) { S.phase = 'lost'; S.phaseT = 0; Snd.play('lose'); return; }

    /* the house comes into view before the counter fills, so the end of
       the run is something they can see coming */
    if (!S.house && S.dist >= S.goal - 900) {
      S.house = { x: CFG.W + 260 };
      S.msg = 'HOME, DEAD AHEAD'; S.msgT = 2.6;
      Snd.play('bell');
    }
    if (S.house) {
      S.house.x -= S.speed * dt;
      if (S.house.x <= CFG.W * 0.66) {
        S.stage = 'arrive'; S.arriveT = 0;
        S.things.length = 0; S.warn.length = 0;
      }
    }
  }

  /* ---------------- the arrival ---------------- */
  function arrive(S, dt) {
    S.arriveT += dt;
    /* the horse pulls up at the door */
    S.speed = approach(S.speed, 0, 210 * dt);
    S.dist += S.speed * dt;
    S.house.x -= S.speed * dt;
    S.pitch = approach(S.pitch, -0.13, 1.2 * dt);   /* reined back */
    if (S.speed > 20 && Math.random() < dt * 6) FX.dust(RIDER_X, GROUND(), 2, -1);

    /* then the two of them get down and walk to the door */
    if (S.speed < 12) {
      S.walk = Math.min(1, S.walk + dt * 0.42);
      if (S.walk === 1 && !S.doneHearts) {
        S.doneHearts = true;
        FX.hearts(S.house.x + 74, GROUND() - 46, 18);
        Snd.play('win'); FX.flash('#ffd66b', 0.4);
      }
    }
    if (S.walk >= 1 && S.arriveT > 4.6) {
      S.phase = 'won'; S.phaseT = 0;
    }
  }

  /* ---------------- spawning ---------------- */
  function spawn(S, dt, k) {
    S.spawnT -= dt;
    if (S.spawnT > 0 || S.house) return;
    /* opens roomy, closes in - and never tighter than a jump can clear */
    S.spawnT = rnd(2.4 - k * 0.9, 1.5 - k * 0.55) * S.ts;

    const roll = Math.random();
    if (roll < 0.44) {
      S.things.push({ kind: 'rock', x: CFG.W + 70, seed: Math.floor(rnd(9999)),
                      w: rnd(52, 34), h: rnd(40, 26) });
    } else if (roll < 0.62) {
      S.things.push({ kind: 'cactus', x: CFG.W + 70, seed: Math.floor(rnd(9999)),
                      w: 26, h: rnd(52, 38) });
    } else {
      /* a flight of birds, coming in as a loose line */
      const n = 1 + (Math.random() < 0.45 ? 1 : 0) + (k > 0.5 && Math.random() < 0.3 ? 1 : 0);
      const base = GROUND() - rnd(190, 70);
      for (let i = 0; i < n; i++) {
        S.things.push({ kind: 'bird', x: CFG.W + 60 + i * rnd(90, 46),
                        y: base + rnd(30, -30), y0: 0, dead: 0,
                        flap: rnd(6), vy: 0, dive: rnd(0.5, 0.15) });
        S.maxScore++;
      }
    }
    /* tell them what is coming before it arrives */
    const last = S.things[S.things.length - 1];
    S.warn.push({ y: last.kind === 'bird' ? last.y : GROUND() - 26,
                  kind: last.kind, t: 0 });
  }

  /* ---------------- movement and collisions ---------------- */
  function move(S, dt) {
    for (let i = S.warn.length - 1; i >= 0; i--) {
      S.warn[i].t += dt;
      if (S.warn[i].t > 1.1) S.warn.splice(i, 1);
    }

    const ry = GROUND() + S.y;
    for (let i = S.things.length - 1; i >= 0; i--) {
      const o = S.things[i];

      if (o.dead) {
        o.dead += dt;
        o.vy += 620 * dt; o.y += o.vy * dt; o.x -= S.speed * 0.5 * dt;
        if (o.dead > 1.4 || o.y > CFG.H + 40) S.things.splice(i, 1);
        continue;
      }

      if (o.kind === 'bird') {
        /* birds beat toward the riders and drop as they close */
        o.flap += dt * 9;
        o.x -= (S.speed * 0.55 + 90) * dt;
        const closing = clamp((CFG.W - o.x) / CFG.W, 0, 1);
        o.y += Math.sin(o.flap * 0.5) * 14 * dt + o.dive * closing * 46 * dt;
        if (o.x < RIDER_X + 30 && Math.abs(o.y - (ry - 42)) < 46) {
          S.things.splice(i, 1); hurt(S, 'A BIRD GOT THROUGH');
        } else if (o.x < -80) S.things.splice(i, 1);
        continue;
      }

      /* rocks and cactus sit on the trail and have to be jumped */
      o.x -= S.speed * dt;
      if (o.x < -110) { S.things.splice(i, 1); continue; }
      const top = GROUND() - o.h;
      const overlapX = Math.abs(o.x - RIDER_X) < (o.w * 0.5 + 16);
      const feetBelowTop = ry > top - 6;
      if (overlapX && feetBelowTop) {
        S.things.splice(i, 1);
        hurt(S, o.kind === 'rock' ? 'STRAIGHT INTO THE ROCK' : 'CAUGHT THE CACTUS');
      }
    }
  }

  function hurt(S, why) {
    S.hp--; S.fails++;
    S.msg = why; S.msgT = 1.5;
    Snd.play('dead');
    FX.shake(9, 0.4); FX.flash(PAL.redDk, 0.3);
    FX.hitstop(0.10);
  }

  /* ==================================================================
     DRAWING
     ================================================================== */

  /* ---- a horse that reads as a horse: arched neck, deep chest, a
          proper equine head, and legs that carry a gallop cycle ---- */
  function drawHorse(c, x, y, t, speed, pitch, airborne) {
    const HIDE = '#7a4f30', HIDE_D = '#573520', HIDE_L = '#9d693f';
    const MANE = '#2b1a11';
    const g = t * (speed / 30);                 /* gallop phase */
    const gal = Math.sin(g);

    c.save();
    c.translate(x, y);
    c.scale(1.9, 1.9);
    c.rotate(pitch * 0.5);
    c.lineCap = 'round'; c.lineJoin = 'round';

    /* a leg is hip -> knee -> hoof; the gallop swings the two pairs
       against each other, and in the air they all reach forward */
    const leg = (hx, hy, phase, col, len, w) => {
      const kn = airborne ? 0.9 : Math.sin(phase) * 0.95;
      const ft = airborne ? 1.4 : Math.sin(phase + 0.8) * 1.05;
      c.beginPath();
      c.moveTo(hx, hy);
      c.lineTo(hx + kn * 5, hy + len * 0.54);
      c.lineTo(hx + kn * 5 + ft * 5, hy + len);
      c.lineWidth = w + 2.6; c.strokeStyle = PAL.ink; c.stroke();
      c.lineWidth = w; c.strokeStyle = col; c.stroke();
      c.beginPath();
      c.ellipse(hx + kn * 5 + ft * 5, hy + len + 0.4, 2.6, 1.7, 0, 0, Math.PI * 2);
      c.fillStyle = '#241a14'; c.fill();
    };

    /* a hind leg folds the other way: stifle forward, hock back. Drawing
       it as four points instead of three is the whole difference between
       a horse and a dog on stilts. */
    const hind = (hx, hy, phase, col, w) => {
      const sw = airborne ? 0.8 : Math.sin(phase);
      const pts = [[hx, hy],
                   [hx + 4.5 + sw * 2.5, hy + 8],
                   [hx - 2.5 + sw * 4.5, hy + 13.5],
                   [hx + 2 + sw * 8, hy + 19],
                   [hx + 3.5 + (airborne ? 4 : sw * 9), hy + 22]];
      c.beginPath();
      pts.forEach((q, i) => i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]));
      c.lineWidth = w + 2.6; c.strokeStyle = PAL.ink; c.stroke();
      c.lineWidth = w; c.strokeStyle = col; c.stroke();
      const f = pts[4];
      c.beginPath();
      c.ellipse(f[0], f[1] + 0.4, 2.6, 1.7, 0, 0, Math.PI * 2);
      c.fillStyle = '#241a14'; c.fill();
    };

    /* --- off-side legs, behind the barrel --- */
    hind(-15, -22, g + Math.PI, HIDE_D, 4.2);
    leg(15, -20, g + Math.PI + 0.55, HIDE_D, 20, 4.0);

    /* --- tail, streaming off the dock --- */
    c.beginPath();
    c.moveTo(-21, -33);
    c.bezierCurveTo(-31 - gal * 2, -31, -39 - gal * 3, -21, -39 - gal * 2, -6);
    c.lineWidth = 5; c.strokeStyle = MANE; c.stroke();
    c.lineWidth = 2.2; c.strokeStyle = '#432a1a'; c.stroke();
    c.beginPath();
    c.moveTo(-21.5, -34.5);
    c.bezierCurveTo(-30 - gal, -33, -37 - gal * 2, -25, -35 - gal, -10);
    c.moveTo(-20.5, -32);
    c.bezierCurveTo(-32 - gal * 2, -28, -41 - gal * 3, -19, -43 - gal * 2, -3);
    c.lineWidth = 2; c.strokeStyle = '#3a2317'; c.stroke();

    /* --- barrel: round haunch, deep girth, sloped shoulder --- */
    c.beginPath();
    c.moveTo(-23, -34);
    c.bezierCurveTo(-14, -41, -2, -41, 10, -38);        /* croup and back  */
    c.bezierCurveTo(17, -37, 22, -34, 24, -29);         /* withers         */
    c.bezierCurveTo(26, -24, 25, -18, 21, -15);         /* chest           */
    c.bezierCurveTo(12, -11, -6, -11, -16, -14);        /* belly           */
    c.bezierCurveTo(-22, -18, -24, -27, -23, -34);      /* flank           */
    c.closePath();
    ink(c, HIDE, 2.2);
    c.save();
    c.beginPath();
    c.moveTo(-23, -34);
    c.bezierCurveTo(-14, -41, -2, -41, 10, -38);
    c.bezierCurveTo(17, -37, 22, -34, 24, -29);
    c.bezierCurveTo(26, -24, 25, -18, 21, -15);
    c.bezierCurveTo(12, -11, -6, -11, -16, -14);
    c.bezierCurveTo(-22, -18, -24, -27, -23, -34);
    c.closePath();
    c.clip();
    /* girth and belly fall away into shadow */
    c.globalAlpha = 0.32;
    c.beginPath();
    c.moveTo(-20, -16); c.bezierCurveTo(-4, -9, 12, -10, 26, -18);
    c.lineTo(26, -6); c.lineTo(-20, -6); c.closePath();
    c.fillStyle = HIDE_D; c.fill();
    /* the low sun rakes across the topline and the haunch */
    c.globalAlpha = 0.3;
    c.beginPath();
    c.moveTo(-20, -33); c.bezierCurveTo(-6, -42, 12, -41, 24, -31);
    c.lineTo(20, -35); c.bezierCurveTo(6, -43, -10, -43, -20, -36);
    c.closePath();
    c.fillStyle = HIDE_L; c.fill();
    c.globalAlpha = 0.22;
    ell(c, -13, -27, 8, 9); c.fillStyle = HIDE_L; c.fill();
    c.restore();

    /* --- neck: thick at the shoulder, arched, tapering to the poll --- */
    c.beginPath();
    c.moveTo(13, -37);
    c.bezierCurveTo(20, -46, 26, -53, 31, -58);         /* crest           */
    c.lineTo(40, -56);
    c.bezierCurveTo(37, -48, 32, -39, 25, -31);         /* throat          */
    c.closePath();
    ink(c, HIDE, 2.1);
    c.save(); c.globalAlpha = 0.22;
    c.beginPath();
    c.moveTo(15, -37);
    c.bezierCurveTo(21, -45, 27, -52, 31.5, -57);
    c.lineTo(35.5, -56.5);
    c.bezierCurveTo(30, -50, 24, -42, 18, -35);
    c.closePath();
    c.fillStyle = HIDE_L; c.fill();
    c.restore();

    /* --- head: broad forehead, hollow cheek, tapering muzzle --- */
    c.beginPath();
    c.moveTo(31, -59);
    c.bezierCurveTo(35, -65, 43, -66, 47, -62);         /* brow            */
    c.bezierCurveTo(52, -58, 53, -53, 51, -50);         /* face            */
    c.bezierCurveTo(49, -46, 44, -45, 41, -47);         /* muzzle and chin */
    c.bezierCurveTo(37, -51, 32, -55, 31, -59);         /* jaw             */
    c.closePath();
    ink(c, HIDE, 1.9);
    c.save(); c.globalAlpha = 0.3;
    c.beginPath();
    c.moveTo(47, -56); c.bezierCurveTo(52, -55, 53, -51, 50, -48);
    c.bezierCurveTo(46, -45, 43, -47, 45, -51);
    c.closePath();
    c.fillStyle = HIDE_D; c.fill();
    c.restore();
    ell(c, 48.6, -51.4, 1.1, 0.85); c.fillStyle = '#1d140f'; c.fill();
    ell(c, 43, -58.6, 1.7, 1.5); ink(c, '#17100c', 0.8);
    ell(c, 43.4, -59.1, 0.6, 0.6); c.fillStyle = '#fff6e6'; c.fill();
    /* ears, pricked at whatever is ahead of them */
    poly(c, [[34.6, -62.6], [35.6, -67.6], [38.6, -63.2]]); ink(c, HIDE_D, 1.2);
    poly(c, [[39, -62.8], [41.2, -67.2], [43.4, -61.6]]); ink(c, HIDE, 1.2);

    /* --- mane: a mass standing off the crest, so it silhouettes against
           the sky instead of disappearing into the neck's own outline --- */
    c.beginPath();
    c.moveTo(12, -36.5);
    c.bezierCurveTo(19, -46, 25, -53.5, 30.5, -58.5);      /* along the crest */
    c.lineTo(34.5, -62.5);
    c.bezierCurveTo(28 - gal * 1.2, -65.5, 21, -58,
                    15.5, -48);                            /* outer edge      */
    c.bezierCurveTo(12, -43.5, 9.5, -40, 8.5, -35.5);
    c.closePath();
    ink(c, MANE, 1.7);
    c.save(); c.globalAlpha = 0.55;
    [[30, -59.5], [24.5, -52], [18, -43]].forEach(([mx, my]) => {
      c.beginPath();
      c.moveTo(mx, my);
      c.quadraticCurveTo(mx - 3.5, my - 2.6, mx - 6 - gal, my - 4.6);
      c.lineWidth = 1.7; c.strokeStyle = '#7a4c2e'; c.stroke();
    });
    c.restore();
    /* forelock over the brow */
    c.beginPath();
    c.moveTo(36.5, -64); c.quadraticCurveTo(43, -63, 45.5, -58.5);
    c.lineWidth = 2.6; c.strokeStyle = MANE; c.stroke();

    /* --- tack: bridle, rein into his hands, blanket and saddle --- */
    c.beginPath();
    c.moveTo(41, -62.5); c.lineTo(47.5, -52.5);
    c.moveTo(43, -54); c.lineTo(52, -52.6);
    c.lineWidth = 1.2; c.strokeStyle = '#3a2114'; c.stroke();
    c.beginPath();
    c.moveTo(49, -53.5);
    c.quadraticCurveTo(33, -47, 14, -34);
    c.lineWidth = 1.4; c.strokeStyle = '#4a2a17'; c.stroke();

    c.beginPath();
    c.moveTo(-7, -38.5); c.lineTo(12, -37.2); c.lineTo(11, -25); c.lineTo(-8, -26.4);
    c.closePath(); ink(c, '#a03a56', 1.5);
    c.beginPath();
    c.moveTo(-3, -39.2); c.lineTo(7, -38.6); c.lineTo(7, -35.4); c.lineTo(-3, -36);
    c.closePath(); ink(c, '#e2b043', 0.9);
    /* the saddle sitting on top of it */
    c.beginPath();
    c.moveTo(-5, -38.6);
    c.bezierCurveTo(-7, -42, 0, -42.6, 3, -40.4);
    c.bezierCurveTo(6, -42.8, 11, -41.6, 9.5, -38);
    c.closePath(); ink(c, '#6b4326', 1.4);

    /* --- near-side legs, in front of everything --- */
    hind(-15, -22, g, HIDE, 4.6);
    leg(15, -20, g + 0.55, HIDE, 20, 4.4);
    c.restore();
  }

  /* ---- a rock that reads as a rock: dark mass, hard sunlit facet,
          a rim of light and a shadow pooled under it ---- */
  function drawRock(c, x, gy, w, h, seed) {
    const R = srand(seed);
    const pts = [];
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = Math.PI + (i / (n - 1)) * Math.PI;
      pts.push([x + Math.cos(a) * w * 0.5 * (0.82 + R() * 0.34),
                gy - Math.abs(Math.sin(a)) * h * (0.72 + R() * 0.42)]);
    }
    c.save();
    /* the shadow it casts, so it sits ON the trail */
    c.globalAlpha = 0.42;
    ell(c, x, gy + 2, w * 0.62, 5);
    c.fillStyle = '#160d1c'; c.fill();
    c.globalAlpha = 1;

    c.beginPath();
    c.moveTo(x - w * 0.5, gy);
    pts.forEach(p => c.lineTo(p[0], p[1]));
    c.lineTo(x + w * 0.5, gy);
    c.closePath();
    ink(c, '#4a3346', 2.6);

    /* sunlit facet on the side the light comes from */
    c.save();
    c.beginPath();
    c.moveTo(x - w * 0.5, gy);
    pts.forEach(p => c.lineTo(p[0], p[1]));
    c.lineTo(x + w * 0.5, gy);
    c.closePath();
    c.clip();
    c.beginPath();
    c.moveTo(x + w * 0.06, gy + 4);
    c.lineTo(x + w * 0.02, gy - h * 0.9);
    c.lineTo(x + w * 0.6, gy - h * 0.4);
    c.lineTo(x + w * 0.6, gy + 4);
    c.closePath();
    c.fillStyle = '#8a6076'; c.fill();
    c.globalAlpha = 0.5;
    c.beginPath();
    c.moveTo(x - w * 0.36, gy - h * 0.30);
    c.lineTo(x - w * 0.04, gy - h * 0.66);
    c.lineTo(x + w * 0.10, gy - h * 0.36);
    c.closePath();
    c.fillStyle = '#2f2036'; c.fill();
    c.restore();

    /* a hot rim so it never sinks into the background */
    c.beginPath();
    pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]));
    c.lineWidth = 1.8; c.strokeStyle = 'rgba(255,214,140,0.85)'; c.stroke();
    c.restore();
  }

  function drawCactus(c, x, gy, h, seed) {
    c.save();
    c.globalAlpha = 0.4;
    ell(c, x, gy + 2, 14, 4); c.fillStyle = '#160d1c'; c.fill();
    c.globalAlpha = 1;
    const arm = (ax, ay, up) => {
      rr(c, ax - 3.4, ay - up, 6.8, up, 3.4); ink(c, '#4e7247', 2.2);
    };
    rr(c, x - 5, gy - h, 10, h, 5); ink(c, '#5a8250', 2.4);
    arm(x - 12, gy - h * 0.44, h * 0.42);
    rr(c, x - 12, gy - h * 0.44, 8, 6.6, 3.2); ink(c, '#5a8250', 2.2);
    arm(x + 12, gy - h * 0.58, h * 0.34);
    rr(c, x + 4.6, gy - h * 0.58, 8, 6.6, 3.2); ink(c, '#5a8250', 2.2);
    /* sunlit edge + spines, so it is unmistakably an obstacle */
    c.beginPath(); c.moveTo(x + 4, gy - h + 4); c.lineTo(x + 4, gy - 4);
    c.lineWidth = 2; c.strokeStyle = 'rgba(255,214,140,0.7)'; c.stroke();
    c.strokeStyle = 'rgba(255,246,230,0.55)'; c.lineWidth = 1;
    for (let i = 1; i < 5; i++) {
      const yy = gy - h * (i / 5);
      c.beginPath(); c.moveTo(x - 6, yy); c.lineTo(x - 9, yy - 2);
      c.moveTo(x + 6, yy); c.lineTo(x + 9, yy - 2); c.stroke();
    }
    c.restore();
  }

  function drawBird(c, o) {
    const f = Math.sin(o.flap);
    c.save();
    c.translate(o.x, o.y);
    if (o.dead) c.rotate(o.dead * 5);
    /* body */
    c.beginPath();
    c.moveTo(9, 0);
    c.quadraticCurveTo(2, -4.5, -8, -1.5);
    c.quadraticCurveTo(-2, 3.5, 9, 0);
    c.closePath();
    ink(c, '#2b1f2c', 1.6);
    /* head and beak */
    ell(c, 8.5, -1.6, 3.2, 2.8); ink(c, '#2b1f2c', 1.4);
    poly(c, [[11, -1.8], [15.5, -0.6], [11, 0.6]]); ink(c, PAL.gold, 1);
    ell(c, 9.6, -2.4, 0.7, 0.7); c.fillStyle = '#ffe9b0'; c.fill();
    /* wings, beating */
    [[1, -1], [1, 1]].forEach(([sx, sy], i) => {
      c.save();
      c.beginPath();
      c.moveTo(1, -1);
      c.quadraticCurveTo(-3 + f * 3 * sy, -6 - f * 13 * sy - i * 2,
                         -14 - f * 4, -2 - f * 15 * sy);
      c.quadraticCurveTo(-8, 1 - f * 5 * sy, 1, 1);
      c.closePath();
      ink(c, i ? '#3a2b3c' : '#241a26', 1.5);
      c.restore();
    });
    /* tail */
    poly(c, [[-7, -1.6], [-14, -3.4], [-13, 1.4], [-6, 1]]);
    ink(c, '#241a26', 1.3);
    c.restore();
  }

  function drawHouse(c, x, gy, t) {
    c.save();
    /* fence running up to it */
    for (let i = -5; i < 4; i++) {
      const fx = x + i * 34;
      c.fillStyle = '#5a3a22'; c.fillRect(fx, gy - 30, 5, 30);
      c.fillStyle = '#6d4a2c'; c.fillRect(fx - 30, gy - 24, 60, 4);
      c.fillRect(fx - 30, gy - 14, 60, 4);
    }
    /* the house */
    const w = 168, h = 116;
    c.beginPath();
    c.rect(x, gy - h, w, h);
    ink(c, '#7a4a2b', 3);
    /* roof */
    c.beginPath();
    c.moveTo(x - 16, gy - h);
    c.lineTo(x + w / 2, gy - h - 46);
    c.lineTo(x + w + 16, gy - h);
    c.closePath();
    ink(c, '#4a2a17', 3);
    /* planking */
    c.save();
    c.beginPath(); c.rect(x, gy - h, w, h); c.clip();
    c.strokeStyle = 'rgba(22,13,28,0.22)'; c.lineWidth = 1.4;
    for (let i = 1; i < 8; i++) {
      c.beginPath(); c.moveTo(x, gy - h + i * 15); c.lineTo(x + w, gy - h + i * 15); c.stroke();
    }
    c.restore();
    /* a lit window and the door they are heading for */
    const glow = 0.75 + Math.sin(t * 2.2) * 0.12;
    c.save(); c.globalAlpha = glow;
    rr(c, x + 20, gy - h + 26, 40, 34, 3); ink(c, '#ffd66b', 2.4);
    c.strokeStyle = '#4a2a17'; c.lineWidth = 2;
    c.beginPath();
    c.moveTo(x + 40, gy - h + 26); c.lineTo(x + 40, gy - h + 60);
    c.moveTo(x + 20, gy - h + 43); c.lineTo(x + 60, gy - h + 43); c.stroke();
    c.restore();
    /* warm light spilling out of the window onto the ground */
    c.save(); c.globalAlpha = 0.16 * glow;
    c.beginPath();
    c.moveTo(x + 20, gy - h + 60); c.lineTo(x + 60, gy - h + 60);
    c.lineTo(x + 96, gy); c.lineTo(x - 22, gy);
    c.closePath();
    c.fillStyle = PAL.sun; c.fill();
    c.restore();

    rr(c, x + 96, gy - 68, 44, 68, 3); ink(c, '#4a2a17', 2.6);
    ell(c, x + 132, gy - 34, 2.4, 2.4); ink(c, PAL.gold, 1);
    /* porch lamp */
    c.save(); c.globalAlpha = 0.5 + Math.sin(t * 3) * 0.12;
    ell(c, x + 88, gy - 76, 16, 16); c.fillStyle = 'rgba(255,214,107,0.5)'; c.fill();
    c.restore();
    rr(c, x + 85, gy - 82, 7, 10, 2); ink(c, PAL.sun, 1.6);
    c.restore();
  }

  /* ------------------------------------------------------------------ */
  function draw(S, c) {
    Sky.draw(c, 'canyon', S.dist * 0.5, 0, CFG.W, CFG.H, S.t);
    const gy = GROUND();

    /* the trail */
    c.fillStyle = PAL.ground; c.fillRect(0, gy, CFG.W, CFG.H - gy);
    c.fillStyle = PAL.sandDark; c.fillRect(0, gy, CFG.W, 7);
    c.fillStyle = PAL.sand; c.fillRect(0, gy, CFG.W, 3);
    c.save();
    c.strokeStyle = 'rgba(224,169,105,0.24)'; c.lineWidth = 3;
    for (let i = 0; i < 26; i++) {
      const x = ((i * 78 - S.dist * 1.25) % (CFG.W + 156)) - 78;
      c.beginPath(); c.moveTo(x, gy + 26); c.lineTo(x + 38, gy + 26); c.stroke();
    }
    c.restore();

    if (Math.random() < 0.22 && S.speed > 40)
      FX.speedLine(CFG.W + 20, rnd(gy - 10, gy - 200), -1);

    if (S.house) drawHouse(c, S.house.x, gy, S.t);

    /* obstacles */
    for (const o of S.things) {
      if (o.kind === 'bird') { drawBird(c, o); continue; }
      c.save();
      if (o.dead) { c.globalAlpha = clamp(1 - o.dead, 0, 1); }
      if (o.kind === 'rock') drawRock(c, o.x, gy, o.w, o.h, o.seed);
      else drawCactus(c, o.x, gy, o.h, o.seed);
      c.restore();
    }

    /* what is about to arrive, flagged at the edge of the screen */
    for (const wn of S.warn) {
      const a = Math.max(0, 1 - wn.t / 1.1) * (0.5 + 0.5 * Math.sin(wn.t * 18));
      c.save(); c.globalAlpha = a;
      const col = wn.kind === 'bird' ? LOOK.rojina.accent : LOOK.arshia.accent;
      c.beginPath();
      c.moveTo(CFG.W - 8, wn.y);
      c.lineTo(CFG.W - 26, wn.y - 11);
      c.lineTo(CFG.W - 26, wn.y + 11);
      c.closePath();
      c.fillStyle = col; c.fill();
      c.lineWidth = 1.5; c.strokeStyle = PAL.ink; c.stroke();
      txt(c, wn.kind === 'bird' ? 'SHOOT' : 'JUMP', CFG.W - 62, wn.y,
          { size: 11, font: FONT.title, fill: col, stroke: PAL.ink, lw: 3 });
      c.restore();
    }

    /* ---- the horse and the two of them ---- */
    const ry = gy + S.y;
    c.save();
    c.globalAlpha = clamp(0.36 + S.y / 170, 0.10, 0.36);
    ell(c, RIDER_X + 6, gy + 4, 58, 9); c.fillStyle = PAL.ink; c.fill();
    c.restore();

    if (S.stage === 'arrive' && S.walk > 0) {
      /* they have dismounted: the horse waits, they walk to the door */
      drawHorse(c, RIDER_X - 60, ry, S.t, Math.max(S.speed, 8), -0.05, false);
      const wx = RIDER_X - 10 + S.walk * (S.house.x + 104 - RIDER_X);
      const walking = S.walk < 1;
      drawChar(c, 'arshia', { x: wx, y: gy, face: 1, anim: walking ? 'run' : 'idle',
                              t: S.t, expr: 'happy', scale: 1.5, speed: 0.4 });
      drawChar(c, 'rojina', { x: wx - 30, y: gy, face: 1, anim: walking ? 'run' : 'idle',
                              t: S.t + 0.4, expr: 'love', scale: 1.45,
                              blinkSeed: 0.45, closeness: 1, speed: 0.4 });
    } else {
      drawHorse(c, RIDER_X, ry, S.t, S.speed, S.pitch, !S.grounded);
      drawChar(c, 'rojina', { x: RIDER_X - 26, y: ry - 66, face: 1, anim: 'aim',
                              t: S.t + 0.4, expr: 'determined', scale: 1.35,
                              shadow: false, blinkSeed: 0.45, prop: 'revolver' });
      drawChar(c, 'arshia', { x: RIDER_X + 8, y: ry - 69, face: 1, anim: 'ride',
                              t: S.t, expr: 'determined', scale: 1.4, shadow: false });
    }

    /* ---- her sights ---- */
    if (S.stage === 'ride') {
      c.save();
      c.translate(S.cross.x, S.cross.y);
      c.strokeStyle = LOOK.rojina.accent; c.lineWidth = 2;
      ell(c, 0, 0, 17, 17); c.stroke();
      ell(c, 0, 0, 3.4, 3.4); c.stroke();
      [[-25, 0, -10, 0], [25, 0, 10, 0], [0, -25, 0, -10], [0, 25, 0, 10]]
        .forEach(([x1, y1, x2, y2]) => {
          c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
        });
      if (S.shotCool > 0.13) { c.globalAlpha = 0.6; ell(c, 0, 0, 23, 23); c.fillStyle = PAL.gold; c.fill(); }
      c.restore();
    }

    /* ---- HUD ---- */
    c.save();
    c.fillStyle = 'rgba(22,13,28,0.55)'; c.fillRect(0, 0, CFG.W, 40);
    txt(c, 'RIDE OR DIE', CFG.W / 2, 20, { size: 18, font: FONT.title, fill: PAL.parch, letter: 3 });
    txt(c, 'BIRDS DOWN  ' + S.score, 130, 20, { size: 14, font: FONT.ui, fill: PAL.gold });
    for (let i = 0; i < S.maxHp; i++) {
      c.save(); c.globalAlpha = i < S.hp ? 1 : 0.22;
      drawHeart(c, CFG.W - 30 - (S.maxHp - 1 - i) * 26, 20, 8, i < S.hp ? PAL.red : PAL.ink);
      c.restore();
    }
    c.restore();

    /* distance, with the house marked on it */
    const bw = 460, bx = CFG.W / 2 - bw / 2;
    rr(c, bx, 52, bw, 12, 6);
    c.fillStyle = 'rgba(22,13,28,0.7)'; c.fill();
    rr(c, bx + 2, 54, (bw - 4) * clamp(S.dist / S.goal, 0, 1), 8, 4);
    c.fillStyle = PAL.teal; c.fill();
    c.save();
    c.translate(bx + bw - 6, 58);
    poly(c, [[-5, 4], [0, -7], [5, 4]]); ink(c, PAL.gold, 1.2);
    c.restore();
    txt(c, S.house ? 'ALMOST HOME' : 'THE ROAD HOME', CFG.W / 2, 80,
        { size: 12, font: FONT.ui, fill: S.house ? PAL.gold : PAL.parchDk, letter: 2 });

    txt(c, 'ARSHIA  ·  W JUMPS  ·  D URGES HER ON', 20, CFG.H - 34,
        { size: 12, font: FONT.ui, fill: LOOK.arshia.accent, align: 'left' });
    txt(c, 'ROJINA  ·  ARROWS AIM  ·  /  FIRES', CFG.W - 20, CFG.H - 34,
        { size: 12, font: FONT.ui, fill: LOOK.rojina.accent, align: 'right' });

    if (S.msgT > 0) {
      c.save(); c.globalAlpha = clamp(S.msgT, 0, 1);
      txt(c, S.msg, CFG.W / 2, 150,
          { size: 23, font: FONT.title, fill: S.house ? PAL.gold : PAL.red,
            stroke: PAL.ink, lw: 5 });
      c.restore();
    }
    if (S.stage === 'arrive' && S.walk >= 1) {
      txt(c, 'THEY MADE IT HOME', CFG.W / 2, 150,
          { size: 26, font: FONT.title, fill: PAL.gold, stroke: PAL.ink, lw: 5, letter: 2 });
    }
    FX.draw(c);
  }

  return { start };
})();
