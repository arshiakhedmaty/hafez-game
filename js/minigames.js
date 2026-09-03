/* =====================================================================
   minigames.js : the three western set-pieces between the platform
   chapters. All three obey the same rule as the stages -- both players
   see everything, but neither can do the other's job.
   ===================================================================== */

const Mini = (() => {
  let M = null;

  function start(stage, opts) {
    const ts = DIFF[opts.difficulty].tScale;
    if (stage.kind === 'duel') M = Duel.start(stage, ts);
    else if (stage.kind === 'vault') M = Vault.start(stage, ts);
    else M = Ride.start(stage, ts, DIFF[opts.difficulty].hearts);
    M.def = stage; M.t = 0; M.phase = 'intro'; M.phaseT = 0;
    M.difficulty = opts.difficulty; M.ts = ts;
    FX.clear();
    return M;
  }

  function update(dt) {
    if (!M) return null;
    M.t += dt; M.phaseT += dt;
    FX.update(dt);
    if (M.phase === 'intro') {
      if (M.phaseT > 2.6 || Input.menuOk()) { M.phase = 'play'; M.phaseT = 0; }
      return null;
    }
    if (M.phase === 'won') {
      if (M.phaseT > 2.0)
        return { done: true, coins: M.score || 0, total: M.maxScore || 0,
                 time: M.elapsed || 0, deaths: M.fails || 0, revives: M.kisses || 0 };
      return null;
    }
    if (M.phase === 'lost') {
      if (M.phaseT > 2.2) { M.reset(); M.phase = 'play'; M.phaseT = 0; }
      return null;
    }
    M.update(dt);
    return null;
  }

  function draw(c) {
    if (!M) return;
    M.draw(c);
    FX.drawFlash(c, CFG.W, CFG.H);
    if (M.phase === 'intro') introCard(c);
    if (M.phase === 'won') banner(c, 'CLEAR', PAL.gold);
    if (M.phase === 'lost') banner(c, M.lostMsg || 'NOT THIS TIME', PAL.red);
  }

  function introCard(c) {
    const k = clamp(M.phaseT / 0.5, 0, 1) * clamp((2.6 - M.phaseT) / 0.5, 0, 1);
    c.save(); c.globalAlpha = k;
    c.fillStyle = 'rgba(22,13,28,0.78)';
    c.fillRect(0, CFG.H / 2 - 96, CFG.W, 192);
    c.fillStyle = 'rgba(226,176,67,0.55)';
    c.fillRect(0, CFG.H / 2 - 96, CFG.W, 2);
    c.fillRect(0, CFG.H / 2 + 94, CFG.W, 2);
    txt(c, M.def.sub, CFG.W / 2, CFG.H / 2 - 60, { size: 15, font: FONT.ui, fill: PAL.parchDk, letter: 5 });
    txt(c, M.def.name, CFG.W / 2, CFG.H / 2 - 20,
        { size: 46, font: FONT.title, fill: PAL.gold, stroke: PAL.ink, lw: 6, letter: 3 });
    txt(c, M.def.story, CFG.W / 2, CFG.H / 2 + 32, { size: 15, font: FONT.ui, fill: PAL.parch });
    txt(c, M.def.hint, CFG.W / 2, CFG.H / 2 + 62, { size: 13, font: FONT.ui, fill: LOOK.rojina.accent });
    c.restore();
  }

  function banner(c, s, col) {
    const k = clamp(M.phaseT / 0.3, 0, 1);
    c.save(); c.globalAlpha = k;
    c.fillStyle = 'rgba(22,13,28,0.62)';
    c.fillRect(0, CFG.H / 2 - 60, CFG.W, 120);
    txt(c, s, CFG.W / 2, CFG.H / 2, { size: 52, font: FONT.title, fill: col, stroke: PAL.ink, lw: 6, letter: 4 });
    c.restore();
  }

  return { start, update, draw, get state() { return M; } };
})();

/* =====================================================================
   1. HIGH NOON  -- pure reaction, and it only counts if they fire
      together. One early trigger and the round is lost for both.
   ===================================================================== */
const Duel = (() => {
  function start(def, ts) {
    const S = {
      round: 0, rounds: def.rounds, won: 0,
      score: 0, maxScore: def.rounds, fails: 0, maxFails: def.maxFails || 4,
      kisses: 0, elapsed: 0,
      wait: 0, drawn: false, drawT: 0,
      aFired: -1, rFired: -1, resolved: 0, msg: '', msgCol: PAL.parch,
      recoil: 0, foeHit: 0, ts,
      lostMsg: 'THE MARSHAL WAS FASTER'
    };
    newRound(S);
    S.update = dt => update(S, dt);
    S.draw = c => draw(S, c);
    /* fails MUST be cleared here. Leaving it set meant the very next
       resolved round tripped the loss check again, forever.           */
    S.reset = () => { S.round = 0; S.won = 0; S.score = 0; S.fails = 0; newRound(S); };
    return S;
  }

  function newRound(S) {
    S.wait = rnd(3.4, 1.5) * S.ts;
    S.drawn = false; S.drawT = 0;
    S.aFired = -1; S.rFired = -1; S.resolved = 0;
    S.msg = ''; S.foeHit = 0;
  }

  function update(S, dt) {
    S.elapsed += dt;
    S.recoil = Math.max(0, S.recoil - dt * 4);

    if (S.resolved > 0) {
      S.resolved -= dt;
      if (S.resolved <= 0) {
        if (S.won >= S.rounds) { S.phase = 'won'; S.phaseT = 0; S.score = S.won; Snd.play('win'); }
        else if (S.fails >= S.maxFails) { S.phase = 'lost'; S.phaseT = 0; Snd.play('lose'); }
        else newRound(S);
      }
      return;
    }

    const aShot = Input.ph(1, 'act') || Input.ph(1, 'up');
    const rShot = Input.ph(2, 'act') || Input.ph(2, 'up');

    if (!S.drawn) {
      S.wait -= dt;
      /* firing before DRAW loses the round outright */
      if (aShot || rShot) {
        S.msg = (aShot ? 'ARSHIA' : 'ROJINA') + ' DREW TOO EARLY';
        S.msgCol = PAL.red;
        S.fails++; S.resolved = 1.6;
        Snd.play('wrong'); FX.shake(6, 0.3); FX.flash(PAL.redDk, 0.25);
        return;
      }
      if (S.wait <= 0) {
        S.drawn = true; S.drawT = 0;
        Snd.play('bell'); FX.flash('#ffd66b', 0.14);
      }
      return;
    }

    S.drawT += dt;
    if (aShot && S.aFired < 0) { S.aFired = S.drawT; Snd.play('shot'); S.recoil = 1; FX.shake(5, 0.2); }
    if (rShot && S.rFired < 0) { S.rFired = S.drawT; Snd.play('shot'); S.recoil = 1; FX.shake(5, 0.2); }

    /* 300ms to draw, and the two shots must land inside 200ms of each
       other. A third tighter than it was, and still winnable.        */
    /* 270 ms is about as fast as a person can answer a cue they were
       already waiting for, so LEGEND tightens everything else instead. */
    const window_ = Math.max(0.27, 0.30 * S.ts);
    const sync = 0.20 * S.ts;

    if (S.aFired >= 0 && S.rFired >= 0) {
      const gap = Math.abs(S.aFired - S.rFired);
      if (gap <= sync) {
        S.won++; S.msg = 'TOGETHER  ·  ' + (gap * 1000).toFixed(0) + ' ms APART';
        S.msgCol = PAL.gold; S.foeHit = 1;
        Snd.play('coin'); FX.sparks(CFG.W * 0.5, CFG.H * 0.44, 26, PAL.gold);
        FX.hearts(CFG.W * 0.5, CFG.H * 0.5, 8);
      } else {
        S.fails++;
        S.msg = 'OUT OF STEP  ·  ' + (gap * 1000).toFixed(0) + ' ms APART  ·  NEEDED ' +
                (sync * 1000).toFixed(0);
        S.msgCol = PAL.red;
        Snd.play('wrong'); FX.shake(6, 0.3);
      }
      S.resolved = 1.7;
      return;
    }
    if (S.drawT > window_) {
      S.fails++; S.msg = 'TOO SLOW'; S.msgCol = PAL.red;
      S.resolved = 1.6;
      Snd.play('lose'); FX.flash(PAL.redDk, 0.3); FX.shake(7, 0.35);
    }
  }

  function draw(S, c) {
    Sky.draw(c, 'duel', 500, 0, CFG.W, CFG.H, S.t);
    const gy = CFG.H - 96;
    c.fillStyle = PAL.ground; c.fillRect(0, gy, CFG.W, 96);
    c.fillStyle = PAL.groundTop; c.fillRect(0, gy, CFG.W, 4);

    /* the marshal, a hard silhouette against the sun */
    c.save();
    c.translate(CFG.W * 0.5, gy);
    if (S.foeHit) { c.rotate(clamp((1 - S.resolved / 1.7) * 1.4, 0, 1.4)); }
    c.scale(2.0, 2.0);
    c.fillStyle = '#1d1020';
    c.fillRect(-8, -40, 16, 40);
    ell(c, 0, -46, 7.4, 8.2); c.fill();
    /* hat */
    c.beginPath();
    c.moveTo(-16, -50); c.quadraticCurveTo(0, -46, 16, -50);
    c.quadraticCurveTo(0, -54, -16, -50); c.closePath(); c.fill();
    c.fillRect(-8, -62, 16, 12);
    /* long coat */
    c.beginPath();
    c.moveTo(-9, -38); c.lineTo(9, -38); c.lineTo(12, -2); c.lineTo(-12, -2);
    c.closePath(); c.fill();
    c.restore();
    txt(c, 'MARSHAL KADE', CFG.W * 0.5, gy - 118,
        { size: 14, font: FONT.title, fill: PAL.parchDk, stroke: PAL.ink, lw: 4, letter: 2 });

    /* the two of them, guns ready */
    const aim = S.drawn ? 'aim' : 'idle';
    drawChar(c, 'arshia', { x: CFG.W * 0.16, y: gy, face: 1, anim: aim, t: S.t,
                            expr: S.drawn ? 'determined' : 'normal', scale: 2.2,
                            prop: S.drawn ? 'revolver' : null });
    drawChar(c, 'rojina', { x: CFG.W * 0.84, y: gy, face: -1, anim: aim, t: S.t + 0.5,
                            expr: S.drawn ? 'determined' : 'normal', scale: 2.2,
                            blinkSeed: 0.45, prop: S.drawn ? 'revolver' : null });

    /* muzzle flash */
    if (S.recoil > 0.4) {
      [[CFG.W * 0.16 + 30, gy - 46], [CFG.W * 0.84 - 30, gy - 44]].forEach(([x, y]) => {
        c.save(); c.globalAlpha = (S.recoil - 0.4) * 1.6;
        star(c, x, y, 16, 6); c.fillStyle = '#fff0b8'; c.fill();
        c.restore();
      });
    }

    /* ---- the call ---- */
    if (!S.drawn && S.resolved <= 0) {
      const b = (Math.sin(S.t * 2.2) + 1) / 2;
      c.save(); c.globalAlpha = 0.45 + b * 0.4;
      txt(c, 'HOLD  ·  HOLD  ·  HOLD', CFG.W / 2, 150,
          { size: 26, font: FONT.title, fill: PAL.parch, stroke: PAL.ink, lw: 5, letter: 4 });
      c.restore();
    }
    if (S.drawn && S.resolved <= 0) {
      const k = clamp(1 - S.drawT * 2, 0, 1);
      c.save();
      c.translate(CFG.W / 2, 150);
      c.scale(1 + k * 0.7, 1 + k * 0.7);
      txt(c, 'DRAW', 0, 0, { size: 64, font: FONT.title, fill: PAL.red, stroke: PAL.ink, lw: 8, letter: 8 });
      c.restore();
      /* the shrinking window, drawn as a fuse burning down */
      const w = 420, k2 = clamp(1 - S.drawT / (0.62 * S.ts), 0, 1);
      rr(c, CFG.W / 2 - w / 2, 196, w, 12, 6);
      c.fillStyle = 'rgba(22,13,28,0.6)'; c.fill();
      rr(c, CFG.W / 2 - w / 2 + 2, 198, (w - 4) * k2, 8, 4);
      c.fillStyle = k2 > 0.35 ? PAL.gold : PAL.red; c.fill();
    }

    /* ---- who has fired ---- */
    [['arshia', S.aFired, CFG.W * 0.16], ['rojina', S.rFired, CFG.W * 0.84]].forEach(([who, f, x]) => {
      c.save();
      const L = LOOK[who];
      txt(c, L.name, x, gy + 34, { size: 16, font: FONT.title, fill: L.accent, stroke: PAL.ink, lw: 4, letter: 2 });
      txt(c, who === 'arshia' ? 'E  or  W' : '/  or  UP', x, gy + 56,
          { size: 12, font: FONT.ui, fill: PAL.parchDk });
      if (f >= 0) {
        txt(c, (f * 1000).toFixed(0) + ' ms', x, gy + 78,
            { size: 15, font: FONT.title, fill: PAL.gold });
      }
      c.restore();
    });

    if (S.msg) {
      txt(c, S.msg, CFG.W / 2, CFG.H - 150,
          { size: 24, font: FONT.title, fill: S.msgCol, stroke: PAL.ink, lw: 5, letter: 1 });
    }

    /* scoreboard */
    c.save();
    c.fillStyle = 'rgba(22,13,28,0.55)'; c.fillRect(0, 0, CFG.W, 40);
    txt(c, 'HIGH NOON', CFG.W / 2, 20, { size: 18, font: FONT.title, fill: PAL.parch, letter: 3 });
    txt(c, 'ROUNDS WON  ' + S.won + '/' + S.rounds, 120, 20, { size: 14, font: FONT.ui, fill: PAL.gold });
    txt(c, 'MISSES  ' + S.fails + '/' + S.maxFails, CFG.W - 110, 20, { size: 14, font: FONT.ui, fill: PAL.red });
    c.restore();
    FX.draw(c);
  }

  return { start };
})();

/* =====================================================================
   2. CRACK THE SAFE
      Rebuilt so it makes sense on one shared screen: the split is in
      CONTROL, not in what each player can see.
        ROJINA moves the stethoscope. Only where she is listening does
               the tumbler read-out exist at all.
        ARSHIA turns the dial. He has no feedback of his own -- if she
               is listening somewhere else, he is turning blind.
      A guard patrols. When the lamp swings past, BOTH must freeze on
      the same beat or the open dial resets.
   ===================================================================== */
const Vault = (() => {
  const DIAL_N = 4;

  function start(def, ts) {
    const S = {
      ts, score: 0, maxScore: DIAL_N, fails: 0, kisses: 0, elapsed: 0,
      dials: [], sel: 0, listen: 0,
      guard: 0, guardSpeed: 0.20 / ts, guardWarn: 0, frozen: false,
      solvedCount: 0, msg: '', msgT: 0,
      lostMsg: 'THE GUARD CAUGHT THEM'
    };
    S.reset = () => reset(S);
    reset(S);
    S.update = dt => update(S, dt);
    S.draw = c => draw(S, c);
    return S;
  }

  function reset(S) {
    S.dials = [];
    for (let i = 0; i < DIAL_N; i++) {
      S.dials.push({ angle: rnd(Math.PI * 2), target: rnd(Math.PI * 2), solved: false, glow: 0 });
    }
    S.sel = 0; S.listen = 0; S.guard = 0; S.guardWarn = 0;
    S.solvedCount = 0; S.fails = 0; S.frozen = false;
  }

  function angDiff(a, b) {
    let d = (a - b) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  function update(S, dt) {
    S.elapsed += dt;
    S.msgT = Math.max(0, S.msgT - dt);

    /* ---- the guard's lamp sweeps across ---- */
    S.guard += S.guardSpeed * dt;
    if (S.guard >= 1) {
      /* the lamp is on them: both must be holding their freeze key */
      const aFreeze = Input.p(1, 'down');
      const rFreeze = Input.p(2, 'down');
      if (aFreeze && rFreeze) {
        S.msg = 'HELD STILL'; S.msgT = 1.4;
        Snd.play('tick');
        FX.say(CFG.W / 2, 190, 'HELD STILL', PAL.teal, 20);
      } else {
        S.fails++;
        const open = S.dials.find(d => d.solved);
        if (open) { open.solved = false; S.solvedCount--; }
        S.msg = 'SEEN  ·  A TUMBLER SLIPPED'; S.msgT = 2.0;
        Snd.play('wrong'); FX.shake(8, 0.4); FX.flash(PAL.redDk, 0.3);
        if (S.fails >= 3) { S.phase = 'lost'; S.phaseT = 0; Snd.play('lose'); return; }
      }
      S.guard = 0;
      S.guardWarn = 0;
    }
    S.guardWarn = S.guard > 0.78 ? (S.guard - 0.78) / 0.22 : 0;
    if (S.guardWarn > 0 && Math.random() < 0.10) Snd.play('tick');

    /* ---- ROJINA : slide the stethoscope between dials ---- */
    if (Input.ph(2, 'left')) { S.listen = (S.listen + DIAL_N - 1) % DIAL_N; Snd.play('move'); }
    if (Input.ph(2, 'right')) { S.listen = (S.listen + 1) % DIAL_N; Snd.play('move'); }

    /* ---- ARSHIA : pick a dial and turn it ---- */
    if (Input.ph(1, 'up')) { S.sel = (S.sel + DIAL_N - 1) % DIAL_N; Snd.play('gear'); }
    if (Input.ph(1, 'down') && !S.guardWarn) { S.sel = (S.sel + 1) % DIAL_N; Snd.play('gear'); }
    const turn = Input.axis(1);
    const d = S.dials[S.sel];
    if (turn && !d.solved) {
      d.angle = (d.angle + turn * 1.5 * dt + Math.PI * 2) % (Math.PI * 2);
      if (Math.random() < 0.25) Snd.play('gear');
    }

    /* ---- locking a tumbler needs BOTH of them on the same dial ---- */
    if (Input.ph(1, 'act')) {
      if (S.listen !== S.sel) {
        S.msg = 'SHE IS NOT LISTENING TO THAT ONE'; S.msgT = 1.8;
        Snd.play('wrong'); FX.shake(3, 0.2);
      } else if (Math.abs(angDiff(d.angle, d.target)) < 0.16) {
        d.solved = true; d.glow = 1; S.solvedCount++;
        Snd.play('latch'); Snd.play('coin');
        FX.sparks(CFG.W / 2 - 150 + S.sel * 100, 300, 18, PAL.gold);
        S.msg = 'TUMBLER ' + (S.sel + 1) + ' FELL'; S.msgT = 1.6;
        if (S.solvedCount >= DIAL_N) {
          S.phase = 'won'; S.phaseT = 0; S.score = DIAL_N;
          Snd.play('win'); FX.flash('#ffd66b', 0.5);
          FX.hearts(CFG.W / 2, CFG.H / 2, 24);
        }
      } else {
        S.msg = 'NOT ON THE NOTCH'; S.msgT = 1.4;
        Snd.play('wrong');
      }
    }

    for (const dd of S.dials) dd.glow = Math.max(0, dd.glow - dt * 1.5);
  }

  function draw(S, c) {
    Sky.draw(c, 'vault', 0, 0, CFG.W, CFG.H, S.t);

    /* the vault door */
    c.save();
    c.translate(CFG.W / 2, CFG.H / 2 - 10);
    ell(c, 0, 0, 260, 210);
    ink(c, '#2c2530', 6, '#120d16');
    ell(c, 0, 0, 236, 188);
    ink(c, '#3a3240', 4);
    /* rivets */
    for (let i = 0; i < 26; i++) {
      const a = i / 26 * Math.PI * 2;
      ell(c, Math.cos(a) * 246, Math.sin(a) * 198, 4, 4);
      ink(c, PAL.metalDk, 1);
    }
    txt(c, 'REDWATER  ·  FIRST  BANK', 0, -140,
        { size: 13, font: FONT.title, fill: PAL.parchDk, letter: 2 });
    c.restore();

    /* ---- the four tumblers ---- */
    S.dials.forEach((d, i) => {
      const x = CFG.W / 2 - 150 + i * 100, y = CFG.H / 2 - 10;
      const listening = S.listen === i;
      const selected = S.sel === i;
      c.save();
      c.translate(x, y);
      /* dial body */
      ell(c, 0, 0, 38, 38);
      ink(c, d.solved ? '#4a5f4a' : '#2f2a38', 3, PAL.ink);
      /* notches */
      c.strokeStyle = 'rgba(154,162,177,0.55)'; c.lineWidth = 1.4;
      for (let k = 0; k < 24; k++) {
        const a = k / 24 * Math.PI * 2;
        c.beginPath();
        c.moveTo(Math.cos(a) * 30, Math.sin(a) * 30);
        c.lineTo(Math.cos(a) * (k % 6 === 0 ? 22 : 26), Math.sin(a) * (k % 6 === 0 ? 22 : 26));
        c.stroke();
      }
      /* the pointer he is turning */
      c.save();
      c.rotate(d.angle);
      c.beginPath(); c.moveTo(0, 0); c.lineTo(30, 0);
      c.lineWidth = 5; c.strokeStyle = PAL.ink; c.stroke();
      c.lineWidth = 3; c.strokeStyle = d.solved ? PAL.teal : LOOK.arshia.accent; c.stroke();
      c.restore();
      ell(c, 0, 0, 6, 6); ink(c, PAL.metal, 2);

      /* ---- ONLY where she is listening does the reading exist ---- */
      if (listening && !d.solved) {
        const diff = angDiff(d.angle, d.target);
        const close = 1 - clamp(Math.abs(diff) / Math.PI, 0, 1);
        /* the waveform: it tightens as he nears the notch */
        c.save();
        c.translate(0, -62);
        c.strokeStyle = PAL.teal; c.lineWidth = 2;
        c.beginPath();
        for (let px = -34; px <= 34; px++) {
          const amp = 10 * Math.pow(close, 3) + 1.5;
          const fq = 0.35 + close * 1.8;
          const yy = Math.sin(px * fq + S.t * 12) * amp * (1 - Math.abs(px) / 46);
          px === -34 ? c.moveTo(px, yy) : c.lineTo(px, yy);
        }
        c.stroke();
        /* which way to turn */
        txt(c, diff > 0 ? '<<  TURN  LEFT' : 'TURN  RIGHT  >>', 0, 22,
            { size: 11, font: FONT.ui, fill: PAL.teal });
        c.restore();
        /* heat bar */
        rr(c, -30, 48, 60, 8, 4);
        c.fillStyle = 'rgba(22,13,28,0.7)'; c.fill();
        rr(c, -28, 50, 56 * close, 4, 2);
        c.fillStyle = close > 0.92 ? PAL.gold : PAL.teal; c.fill();
      }
      /* markers for who is where */
      if (listening) {
        c.save(); c.globalAlpha = 0.9;
        txt(c, 'R', 0, 74, { size: 15, font: FONT.title, fill: LOOK.rojina.accent, stroke: PAL.ink, lw: 4 });
        ell(c, 0, 0, 46, 46);
        c.lineWidth = 2; c.setLineDash([4, 4]);
        c.strokeStyle = LOOK.rojina.accent; c.stroke(); c.setLineDash([]);
        c.restore();
      }
      if (selected) {
        c.save();
        txt(c, 'A', 0, -84, { size: 15, font: FONT.title, fill: LOOK.arshia.accent, stroke: PAL.ink, lw: 4 });
        ell(c, 0, 0, 42, 42);
        c.lineWidth = 2; c.strokeStyle = LOOK.arshia.accent; c.stroke();
        c.restore();
      }
      if (d.solved) {
        c.save(); c.globalAlpha = 0.35 + d.glow * 0.5;
        ell(c, 0, 0, 44, 44); c.fillStyle = PAL.teal; c.fill();
        c.restore();
      }
      c.restore();
    });

    /* ---- the guard's lamp ---- */
    const gw = S.guardWarn;
    c.save();
    if (gw > 0) {
      c.globalAlpha = gw * 0.5;
      const g = c.createLinearGradient(0, 0, CFG.W, 0);
      g.addColorStop(0, 'rgba(255,214,107,0)');
      g.addColorStop(clamp(S.guard, 0, 1), 'rgba(255,214,107,0.6)');
      g.addColorStop(1, 'rgba(255,214,107,0)');
      c.fillStyle = g; c.fillRect(0, 0, CFG.W, CFG.H);
    }
    c.restore();

    /* guard meter */
    const bw = 520;
    rr(c, CFG.W / 2 - bw / 2, 58, bw, 16, 8);
    c.fillStyle = 'rgba(22,13,28,0.7)'; c.fill();
    c.lineWidth = 2; c.strokeStyle = gw > 0 ? PAL.red : 'rgba(239,220,176,0.4)'; c.stroke();
    rr(c, CFG.W / 2 - bw / 2 + 3, 61, (bw - 6) * clamp(S.guard, 0, 1), 10, 5);
    c.fillStyle = gw > 0 ? PAL.red : PAL.gold; c.fill();
    txt(c, gw > 0 ? 'LAMP INCOMING  ·  BOTH HOLD  S  +  DOWN' : 'GUARD PATROL',
        CFG.W / 2, 92, { size: 14, font: FONT.title, fill: gw > 0 ? PAL.red : PAL.parchDk, letter: 2 });

    /* ---- the two of them at the door ---- */
    const gy = CFG.H - 40;
    drawChar(c, 'arshia', { x: 96, y: gy, face: 1, anim: Input.p(1, 'down') ? 'crouch' : 'push',
                            t: S.t, expr: 'determined', scale: 1.9 });
    drawChar(c, 'rojina', { x: CFG.W - 96, y: gy, face: -1, anim: Input.p(2, 'down') ? 'crouch' : 'idle',
                            t: S.t + 0.6, expr: 'determined', scale: 1.9, blinkSeed: 0.45 });
    txt(c, 'ARSHIA  ·  A/D TURNS  ·  W/S PICKS  ·  E LOCKS', 190, gy - 10,
        { size: 12, font: FONT.ui, fill: LOOK.arshia.accent, align: 'left' });
    txt(c, 'ROJINA  ·  LEFT/RIGHT MOVES THE STETHOSCOPE', CFG.W - 190, gy - 10,
        { size: 12, font: FONT.ui, fill: LOOK.rojina.accent, align: 'right' });

    /* status */
    c.save();
    c.fillStyle = 'rgba(22,13,28,0.55)'; c.fillRect(0, 0, CFG.W, 40);
    txt(c, 'CRACK THE SAFE', CFG.W / 2, 20, { size: 18, font: FONT.title, fill: PAL.parch, letter: 3 });
    txt(c, 'TUMBLERS  ' + S.solvedCount + '/' + DIAL_N, 130, 20, { size: 14, font: FONT.ui, fill: PAL.gold });
    txt(c, 'SLIPS  ' + S.fails + '/3', CFG.W - 100, 20, { size: 14, font: FONT.ui, fill: PAL.red });
    c.restore();

    if (S.msgT > 0) {
      c.save(); c.globalAlpha = clamp(S.msgT, 0, 1);
      txt(c, S.msg, CFG.W / 2, CFG.H - 96,
          { size: 20, font: FONT.title, fill: PAL.parch, stroke: PAL.ink, lw: 5 });
      c.restore();
    }
    FX.draw(c);
  }

  return { start };
})();

/* =====================================================================
   3. RIDE OR DIE -- one horse, two jobs.
      ARSHIA steers and jumps the horse (W / A / D).
      ROJINA aims a crosshair and fires (arrows + /).
      Obstacles must be jumped; riders chasing them must be shot.
   ===================================================================== */
