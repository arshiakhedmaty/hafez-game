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
    else M = Ride.start(stage, ts);
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

    const window_ = 0.80 * S.ts;      /* how long the marshal gives them */
    const sync = 0.30 * S.ts;         /* how together the two shots must be */

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
const Ride = (() => {
  function start(def, ts) {
    const S = {
      ts, dist: 0, goal: def.distance, speed: 300,
      y: 0, vy: 0, grounded: true,
      lane: 0,                                  /* -1 .. 1 across the trail */
      cross: { x: CFG.W * 0.62, y: CFG.H * 0.55 },
      things: [], spawnT: 0,
      hp: 3, score: 0, maxScore: 12, fails: 0, kisses: 0, elapsed: 0,
      shotCool: 0, msg: '', msgT: 0,
      lostMsg: 'THEY WERE RUN DOWN'
    };
    S.reset = () => {
      S.dist = 0; S.things = []; S.hp = 3; S.score = 0; S.y = 0; S.vy = 0;
      S.grounded = true; S.lane = 0; S.spawnT = 0;
    };
    S.update = dt => update(S, dt);
    S.draw = c => draw(S, c);
    return S;
  }

  const GROUND = () => CFG.H - 120;

  function update(S, dt) {
    S.elapsed += dt;
    S.msgT = Math.max(0, S.msgT - dt);
    S.speed = 300 + (S.dist / S.goal) * 190;
    S.dist += S.speed * dt;

    /* ---- ARSHIA rides ---- */
    const steer = Input.axis(1);
    S.lane = clamp(S.lane + steer * 1.8 * dt, -1, 1);
    if (Input.ph(1, 'up') && S.grounded) {
      S.vy = -640; S.grounded = false;
      Snd.play('jump'); FX.dust(CFG.W * 0.30, GROUND(), 10, -1);
    }
    if (!S.grounded) {
      S.vy += 1900 * dt; S.y += S.vy * dt;
      if (S.y >= 0) { S.y = 0; S.vy = 0; S.grounded = true; Snd.play('land'); FX.land(CFG.W * 0.30, GROUND(), 0.6); }
    }
    if (S.grounded && Math.random() < dt * 7) { Snd.play('horse'); FX.dust(CFG.W * 0.28, GROUND(), 2, -1); }

    /* ---- ROJINA aims and fires ---- */
    const cs = 420;
    S.cross.x = clamp(S.cross.x + (Input.p(2, 'right') - Input.p(2, 'left')) * cs * dt, 40, CFG.W - 40);
    S.cross.y = clamp(S.cross.y + (Input.p(2, 'down') - Input.p(2, 'up')) * cs * dt, 90, CFG.H - 70);
    S.shotCool = Math.max(0, S.shotCool - dt);
    if (Input.ph(2, 'act') && S.shotCool <= 0) {
      S.shotCool = 0.26;
      Snd.play('shot'); FX.shake(3, 0.14);
      FX.sparks(S.cross.x, S.cross.y, 8, PAL.gold);
      let hit = null;
      for (const o of S.things)
        if (o.kind === 'rider' && !o.dead && dist(o.x, o.y, S.cross.x, S.cross.y) < 46) { hit = o; break; }
      if (hit) {
        hit.dead = 1; S.score++;
        Snd.play('coin'); FX.sparks(hit.x, hit.y, 20, PAL.red);
        FX.say(hit.x, hit.y - 24, 'DOWN', PAL.gold, 16);
      } else {
        FX.say(S.cross.x, S.cross.y - 20, 'MISS', PAL.parchDk, 13);
      }
    }

    /* ---- spawn obstacles and pursuers ---- */
    S.spawnT -= dt;
    if (S.spawnT <= 0) {
      S.spawnT = rnd(1.5, 0.75) * S.ts;
      if (Math.random() < 0.55) {
        S.things.push({ kind: 'rock', x: CFG.W + 60, y: GROUND(), lane: rnd(1, -1), w: 42, h: 34 });
      } else {
        S.things.push({ kind: 'rider', x: CFG.W + 70, y: GROUND() - rnd(120, 40), dead: 0, bob: rnd(6) });
      }
    }

    /* ---- move and resolve ---- */
    const riderX = CFG.W * 0.30;
    const riderY = GROUND() + S.y;
    for (let i = S.things.length - 1; i >= 0; i--) {
      const o = S.things[i];
      o.x -= (o.kind === 'rock' ? S.speed : S.speed * 0.55) * dt;
      if (o.dead) { o.dead += dt; o.y += 220 * dt; if (o.dead > 1.2) S.things.splice(i, 1); continue; }
      if (o.x < -120) { S.things.splice(i, 1); continue; }

      if (o.kind === 'rock') {
        const laneNear = Math.abs(o.lane - S.lane) < 0.55;
        if (laneNear && Math.abs(o.x - riderX) < 40 && S.y > -34) {
          S.things.splice(i, 1);
          hitRider(S);
        }
      } else {
        o.bob += dt * 3;
        /* a pursuer that closes all the way costs a heart */
        if (o.x < riderX + 46) { S.things.splice(i, 1); hitRider(S); }
      }
    }

    if (S.hp <= 0) { S.phase = 'lost'; S.phaseT = 0; Snd.play('lose'); return; }
    if (S.dist >= S.goal) {
      S.phase = 'won'; S.phaseT = 0; S.maxScore = Math.max(S.score, 1);
      Snd.play('win'); FX.hearts(CFG.W / 2, CFG.H / 2, 22); FX.flash('#ffd66b', 0.4);
    }
  }

  function hitRider(S) {
    S.hp--;
    S.msg = 'THEY TOOK A HIT'; S.msgT = 1.4;
    Snd.play('dead'); FX.shake(9, 0.4); FX.flash(PAL.redDk, 0.3);
  }

  function draw(S, c) {
    Sky.draw(c, 'canyon', S.dist * 0.55, 0, CFG.W, CFG.H, S.t);
    const gy = GROUND();

    /* the trail, scrolling underfoot */
    c.fillStyle = PAL.ground; c.fillRect(0, gy, CFG.W, CFG.H - gy);
    c.fillStyle = PAL.groundTop; c.fillRect(0, gy, CFG.W, 5);
    c.save();
    c.strokeStyle = 'rgba(224,169,105,0.30)'; c.lineWidth = 3;
    for (let i = 0; i < 30; i++) {
      const x = ((i * 70 - S.dist * 1.4) % (CFG.W + 140)) - 70;
      c.beginPath(); c.moveTo(x, gy + 24); c.lineTo(x + 34, gy + 24); c.stroke();
    }
    c.restore();

    /* motion streaks */
    if (Math.random() < 0.30) FX.speedLine(CFG.W + 20, rnd(gy - 10, gy - 190), -1);

    /* ---- obstacles and pursuers ---- */
    for (const o of S.things) {
      c.save();
      if (o.dead) { c.globalAlpha = clamp(1 - o.dead, 0, 1); c.translate(o.x, o.y); c.rotate(o.dead * 2.4); c.translate(-o.x, -o.y); }
      if (o.kind === 'rock') {
        const yy = gy - o.lane * 16;
        c.beginPath();
        c.moveTo(o.x - o.w / 2, yy);
        c.lineTo(o.x - o.w * 0.3, yy - o.h);
        c.lineTo(o.x + o.w * 0.25, yy - o.h * 0.85);
        c.lineTo(o.x + o.w / 2, yy);
        c.closePath();
        ink(c, PAL.mesaNear, 2.4);
      } else {
        /* a pursuing rider, drawn as a hard silhouette */
        c.translate(o.x, o.y + Math.sin(o.bob) * 3);
        c.fillStyle = '#1d1020';
        ell(c, 0, 0, 22, 12); c.fill();
        c.fillRect(-4, -26, 9, 26);
        ell(c, 0, -32, 6, 7); c.fill();
        c.beginPath();
        c.moveTo(-13, -36); c.quadraticCurveTo(0, -32, 13, -36);
        c.quadraticCurveTo(0, -40, -13, -36); c.closePath(); c.fill();
        c.restore(); c.save();
        /* target ring so she can find it fast */
        c.globalAlpha = 0.5;
        ell(c, o.x, o.y, 30, 30);
        c.lineWidth = 1.5; c.setLineDash([4, 5]);
        c.strokeStyle = LOOK.rojina.accent; c.stroke(); c.setLineDash([]);
      }
      c.restore();
    }

    /* ---- the horse and the two of them ---- */
    const rx = CFG.W * 0.30, ry = gy + S.y + S.lane * 14;
    /* ground shadow, squashed while airborne */
    c.save();
    c.globalAlpha = clamp(0.35 + S.y / 160, 0.10, 0.35);
    ell(c, rx, gy + 4, 54, 9); c.fillStyle = PAL.ink; c.fill();
    c.restore();

    c.save();
    c.translate(rx, ry);
    c.scale(1.55, 1.55);
    const gal = Math.sin(S.t * 15);
    const HIDE = '#6b452c', HIDE_D = '#4a2d1b', MANE = '#2e1c12';

    /* hind legs, behind the body */
    c.lineCap = 'round'; c.lineJoin = 'round';
    [[-17, gal, HIDE_D], [-12, -gal, HIDE_D]].forEach(([lx, ph, col]) => {
      c.beginPath();
      c.moveTo(lx, -16);
      c.lineTo(lx - 3 + ph * 4, -9);
      c.lineTo(lx - 1 + ph * 9, S.grounded ? -0.5 : -6);
      c.lineWidth = 5.4; c.strokeStyle = PAL.ink; c.stroke();
      c.lineWidth = 3.6; c.strokeStyle = col; c.stroke();
    });

    /* barrel of the body */
    c.beginPath();
    c.moveTo(-22, -20);
    c.quadraticCurveTo(-4, -30, 16, -25);
    c.quadraticCurveTo(24, -22, 22, -14);
    c.quadraticCurveTo(4, -6, -18, -10);
    c.quadraticCurveTo(-25, -14, -22, -20);
    c.closePath();
    ink(c, HIDE, 2.2);

    /* neck and head, reaching forward */
    c.beginPath();
    c.moveTo(14, -26);
    c.quadraticCurveTo(26, -34, 31, -42);
    c.lineTo(38, -40);
    c.quadraticCurveTo(33, -30, 23, -20);
    c.closePath();
    ink(c, HIDE, 2.2);
    c.beginPath();
    c.moveTo(30, -43);
    c.quadraticCurveTo(38, -48, 44, -44);
    c.quadraticCurveTo(45, -39, 39, -38);
    c.lineTo(31, -39);
    c.closePath();
    ink(c, HIDE, 2);
    /* ear + eye */
    poly(c, [[33, -46], [35, -51], [37, -45]]); ink(c, HIDE_D, 1.2);
    ell(c, 37, -43, 1.2, 1.2); ink(c, PAL.ink, 0.6);
    /* mane whipping back */
    c.beginPath();
    c.moveTo(29, -44);
    c.quadraticCurveTo(20 - gal * 2, -40, 13, -27);
    c.lineWidth = 4.4; c.strokeStyle = MANE; c.stroke();

    /* saddle blanket */
    c.beginPath();
    c.moveTo(-10, -25); c.lineTo(8, -27); c.lineTo(7, -17); c.lineTo(-11, -15);
    c.closePath(); ink(c, '#9c3546', 1.6);

    /* front legs */
    [[8, -gal, HIDE], [15, gal, HIDE]].forEach(([lx, ph, col]) => {
      c.beginPath();
      c.moveTo(lx, -17);
      c.lineTo(lx + 2 + ph * 5, -9);
      c.lineTo(lx + 1 + ph * 10, S.grounded ? -0.5 : -6);
      c.lineWidth = 5.4; c.strokeStyle = PAL.ink; c.stroke();
      c.lineWidth = 3.6; c.strokeStyle = col; c.stroke();
    });

    /* tail */
    c.beginPath();
    c.moveTo(-21, -22);
    c.quadraticCurveTo(-34 - gal * 3, -20, -38, -6);
    c.lineWidth = 5.5; c.strokeStyle = MANE; c.stroke();
    c.restore();

    /* riders : him forward in the saddle, her behind with the gun */
    drawChar(c, 'rojina', { x: rx - 24, y: ry - 32, face: 1, anim: 'aim', t: S.t + 0.4,
                            expr: 'determined', scale: 1.35, shadow: false,
                            blinkSeed: 0.45, prop: 'revolver' });
    drawChar(c, 'arshia', { x: rx + 2, y: ry - 34, face: 1, anim: 'ride', t: S.t,
                            expr: 'determined', scale: 1.4, shadow: false });

    /* ---- her crosshair ---- */
    c.save();
    c.translate(S.cross.x, S.cross.y);
    c.strokeStyle = LOOK.rojina.accent; c.lineWidth = 2;
    ell(c, 0, 0, 18, 18); c.stroke();
    ell(c, 0, 0, 4, 4); c.stroke();
    [[-26, 0, -10, 0], [26, 0, 10, 0], [0, -26, 0, -10], [0, 26, 0, 10]].forEach(([x1, y1, x2, y2]) => {
      c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
    });
    if (S.shotCool > 0.14) { c.globalAlpha = 0.6; ell(c, 0, 0, 24, 24); c.fillStyle = PAL.gold; c.fill(); }
    c.restore();

    /* ---- HUD ---- */
    c.save();
    c.fillStyle = 'rgba(22,13,28,0.55)'; c.fillRect(0, 0, CFG.W, 40);
    txt(c, 'RIDE OR DIE', CFG.W / 2, 20, { size: 18, font: FONT.title, fill: PAL.parch, letter: 3 });
    txt(c, 'RIDERS DOWN  ' + S.score, 130, 20, { size: 14, font: FONT.ui, fill: PAL.gold });
    for (let i = 0; i < 3; i++) {
      c.save(); c.globalAlpha = i < S.hp ? 1 : 0.22;
      drawHeart(c, CFG.W - 120 + i * 26, 20, 8, i < S.hp ? PAL.red : PAL.ink);
      c.restore();
    }
    c.restore();

    /* distance bar */
    const bw = 460;
    rr(c, CFG.W / 2 - bw / 2, 52, bw, 12, 6);
    c.fillStyle = 'rgba(22,13,28,0.7)'; c.fill();
    rr(c, CFG.W / 2 - bw / 2 + 2, 54, (bw - 4) * clamp(S.dist / S.goal, 0, 1), 8, 4);
    c.fillStyle = PAL.teal; c.fill();
    txt(c, 'TO THE BORDER', CFG.W / 2, 80, { size: 12, font: FONT.ui, fill: PAL.parchDk, letter: 2 });

    txt(c, 'ARSHIA  ·  A/D STEER  ·  W JUMP', 20, CFG.H - 34,
        { size: 12, font: FONT.ui, fill: LOOK.arshia.accent, align: 'left' });
    txt(c, 'ROJINA  ·  ARROWS AIM  ·  /  FIRES', CFG.W - 20, CFG.H - 34,
        { size: 12, font: FONT.ui, fill: LOOK.rojina.accent, align: 'right' });

    if (S.msgT > 0) {
      c.save(); c.globalAlpha = clamp(S.msgT, 0, 1);
      txt(c, S.msg, CFG.W / 2, 150, { size: 24, font: FONT.title, fill: PAL.red, stroke: PAL.ink, lw: 5 });
      c.restore();
    }
    FX.draw(c);
  }

  return { start };
})();
