/* =====================================================================
   tools/playthrough.js  --  actually finish the game.

   Run:  node tools/playthrough.js

   validate.js reads the level tables. audit.js reads where things sit.
   Neither of them plays anything. This one does: it drives the real
   engine, frame by frame, with a bot that has no special powers -- it
   holds the same keys a person holds, and it can only do what the
   physics lets it do.

   The bot is deliberately stupid. It walks right, jumps when the ground
   runs out, throws the rope over a chasm, shoves the crate and stands on
   plates. It is NOT clever enough to solve a two-person puzzle on its
   own, and pretending otherwise would make this file lie: the chapters
   it cannot finish are its limit, not the game's.

   What it is good for is the thing a scripted walkthrough can never
   cover - five minutes of ignorant, relentless input per chapter. So
   the assertions here are about the engine holding up under that:

     - nothing throws
     - no position ever goes NaN or runs off to infinity
     - every fall is recovered from; nobody is left outside the level
     - the crate is never lost for good
     - all three minigames can actually be won

   Whether each chapter can be FINISHED is proved by validate.js, which
   walks the surface graph with the real jump arcs, and by playing them.
   ===================================================================== */

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

const held = new Set(), pressed = new Set();
const stubs = `
const Snd = { play(){}, music(){}, resume(){}, init(){}, vol(){}, S:{} };
const FX = { dust(){}, land(){}, sparks(){}, hearts(){}, smoke(){}, shard(){},
  speedLine(){}, say(){}, shake(){}, flash(){}, hitstop(){}, update(){}, draw(){},
  drawFlash(){}, applyShake(){}, clear(){}, spawn(){}, get slowmo(){ return 0; } };
const Sky = { draw(){} };
const Props = new Proxy({}, { get: () => () => {} });
function drawChar(){} function drawHeart(){} function drawPortrait(){}
function star(){} function drawGlasses(){} function drawPendant(){}
const Input = {
  MAPS: { p1:{ left:'KeyA', right:'KeyD', up:'KeyW', down:'KeyS', act:'KeyE', act2:'ShiftLeft', kiss:'KeyQ' },
          p2:{ left:'ArrowLeft', right:'ArrowRight', up:'ArrowUp', down:'ArrowDown', act:'Slash', act2:'Period', kiss:'ShiftRight' } },
  held: c => __held.has(c), hit: c => __pressed.has(c), up: () => false,
  p: (n,a) => __held.has(Input.MAPS['p'+n][a]),
  ph: (n,a) => __pressed.has(Input.MAPS['p'+n][a]), pu: () => false,
  axis(n){ return (__held.has(this.MAPS['p'+n].right)?1:0) - (__held.has(this.MAPS['p'+n].left)?1:0); },
  anyKey: () => false, last: () => '',
  menuUp: () => false, menuDown: () => false, menuLeft: () => false,
  menuRight: () => false, menuOk: () => false, menuBack: () => false,
  endFrame(){ __pressed.clear(); }
};
`;
const src = ['js/config.js', 'js/utils.js', 'js/levels.js'].map(read).join('\n;\n')
  + '\n;\n' + stubs + '\n;\n'
  + ['js/platformer.js', 'js/minigames.js', 'js/ride.js'].map(read).join('\n;\n')
  + '\n;\nreturn { CFG, STAGES, Play, Mini, Duel, Vault, Ride };';
const Save = { data: { best: {} } };
const { CFG, STAGES, Play, Mini } = new Function('__held', '__pressed', 'Save', src)(held, pressed, Save);

let pass = 0, fail = 0;
const ok = (n, c, d) => {
  if (c) { pass++; console.log('  ok   ' + n); }
  else { fail++; console.log('  FAIL ' + n + (d ? '   ' + d : '')); }
};

const K = { A: { l:'KeyA', r:'KeyD', u:'KeyW', d:'KeyS', act:'KeyE', pull:'ShiftLeft', kiss:'KeyQ' },
            R: { l:'ArrowLeft', r:'ArrowRight', u:'ArrowUp', d:'ArrowDown', act:'Slash', kiss:'ShiftRight' } };
const set = (k, on) => { on ? held.add(k) : held.delete(k); };
const tap = k => { pressed.add(k); held.add(k); };

/* =====================================================================
   The bot. One of these per character.
   ===================================================================== */
function drive(S, p, keys, goalX, ignore) {
  const solids = [];
  S.solids.forEach(s => { if (s.role !== 'lintel') solids.push(s); });
  S.movers.forEach(s => solids.push(s));
  S.crumbles.forEach(s => { if (!s.gone) solids.push(s); });
  S.phantoms.forEach(s => { if (s.lit > 0.35) solids.push(s); });
  S.gates.forEach(g => { if (!g.open) solids.push({ x: g.x, y: g.y, w: g.w, h: g.h }); });
  /* a crate we intend to shove is not a wall to be hopped over */
  S.crates.forEach(s => { if (s !== ignore) solids.push(s); });

  const cx = p.x + p.w / 2, feet = p.y + p.h;
  const want = goalX - cx;
  set(keys.l, want < -6);
  set(keys.r, want > 6);

  const dir = Math.sign(want) || 1;
  const probeX = cx + dir * 30;
  const floorAhead = solids.some(s =>
    probeX > s.x - 2 && probeX < s.x + s.w + 2 &&
    s.y >= feet - 14 && s.y < feet + 70);
  const wall = solids.some(s =>
    cx + dir * 24 > s.x && cx + dir * 24 < s.x + s.w &&
    s.y < feet - 8 && s.y + s.h > feet - 46);
  const needJump = (!floorAhead || wall) && Math.abs(want) > 8;
  const canDouble = keys === K.R && !p.grounded && p.jumps < 2 && p.vy > -120;
  if (needJump && (p.grounded || canDouble)) tap(keys.u);
  else held.delete(keys.u);
  return { floorAhead, wall, needJump };
}

/* =====================================================================
   Run one platform chapter to the exit.
   ===================================================================== */
function playChapter(st, budget) {
  const S = Play.start(st, { difficulty: 'greenhorn' });
  S.state = 'play';
  const dt = 1 / 60;
  const A = S.a, R = S.r;
  const log = { deaths: 0, stalls: 0, maxX: 0, ropeThrows: 0, where: [],
                crateLost: 0, escaped: 0, belowWorld: 0, threw: null,
                nan: false, runaway: false };
  let lastProgress = 0, lastX = 0, ropeT = 0;

  const frames = Math.round(budget * 60);
  for (let f = 0; f < frames; f++) {
    held.clear(); pressed.clear();

    const goal = st.exit.x + st.exit.w / 2;
    /* both head for the exit, but she hangs back near him so the leash
       never snaps and her lantern stays over his ghost timbers */
    const aGoal = goal;
    const rGoal = Math.min(goal, A.x + 40);
    drive(S, A, K.A, aGoal);
    drive(S, R, K.R, rGoal);

    /* if a door in front of us is shut, go and stand on its plates */
    const shut = S.gates.find(g => !g.open && g.x > A.x - 60 && g.x < A.x + 900);
    if (shut) {
      const plates = S.plates.filter(pl => shut.openBy.indexOf(pl.id) >= 0);
      const mine = plates.find(pl => pl.who === 'arshia' || pl.who === 'any');
      const hers = plates.find(pl => pl.who === 'rojina');
      const crate = plates.find(pl => pl.who === 'crate');
      if (crate && S.crates.length) {
        /* Shoving only works from the far side, so if he is standing on
           the wrong side of the crate he has to get round it first -
           and for that it IS a wall, and he hops it. */
        const cr = S.crates[0];
        const target = crate.x + crate.w / 2 - cr.w / 2;
        if (cr.x < target - 8) {
          if (A.x + A.w <= cr.x + 8) drive(S, A, K.A, cr.x + cr.w + 600, cr);
          else drive(S, A, K.A, cr.x - 80);
        } else if (cr.x > target + 8) {
          if (A.x >= cr.x + cr.w - 8) drive(S, A, K.A, cr.x - 600, cr);
          else drive(S, A, K.A, cr.x + cr.w + 80);
        } else drive(S, A, K.A, A.x + A.w / 2, cr);
      } else if (mine) {
        drive(S, A, K.A, mine.x + mine.w / 2);
        if (mine.y < A.y - 20 && A.x + A.w > mine.x - 30 &&
            A.x < mine.x + mine.w + 30 && A.grounded) tap(K.A.u);
      }
      if (hers) {
        drive(S, R, K.R, hers.x + hers.w / 2);
        /* hers is the one up on a ledge - walk under it, then go up */
        if (hers.y < R.y - 20 && R.x + R.w > hers.x - 40 && R.x < hers.x + hers.w + 40) {
          if (R.grounded) tap(K.R.u);
          else if (R.jumps < 2 && R.vy > -120) tap(K.R.u);
        }
      }
    }

    /* rope over anything too wide to jump */
    if (!A.rope) {
      ropeT = 0;
      const ring = S.rings.find(r => Math.abs(r.x - (A.x + A.w / 2)) < 210 && r.y < A.y - 30);
      const floors = S.solids.filter(s => s.role !== 'lintel')
        .concat(S.movers)
        .concat(S.phantoms.filter(ph => ph.lit > 0.35))
        .concat(S.crumbles.filter(cb => !cb.gone));
      const gapAhead = !floors.some(s =>
        A.x + 90 > s.x && A.x + 90 < s.x + s.w && s.y >= A.y + A.h - 12 && s.y < A.y + A.h + 90);
      if (ring && gapAhead && ring.x > A.x) { tap(K.A.act); log.ropeThrows++; }
    } else {
      held.add(K.A.pull);
      set(K.A.r, true);
      ropeT++;
      /* swing for a second and a half, then let go - hanging there
         forever is how the bot used to wedge itself in the mine */
      if (A.x > A.rope.x + 40 || ropeT > 90) { tap(K.A.act); ropeT = 0; }
    }

    /* she holds the lantern up whenever he is over ghost timber */
    if (S.phantoms.some(ph => Math.abs(ph.x + ph.w / 2 - (A.x + A.w / 2)) < 260))
      held.add(K.R.act);

    /* kiss the other one awake */
    if (A.down && !R.down && Math.abs(A.x - R.x) < 40) held.add(K.R.kiss);
    if (R.down && !A.down && Math.abs(A.x - R.x) < 40) held.add(K.A.kiss);

    const before = S.deaths;
    let res;
    try { res = Play.update(dt); }
    catch (e) { log.threw = e.message + ' (frame ' + f + ')'; break; }
    log.deaths += S.deaths - before;
    log.maxX = Math.max(log.maxX, A.x);

    /* the engine must never produce a number it cannot come back from */
    [A, R].concat(S.crates).forEach(b => {
      if (!isFinite(b.x) || !isFinite(b.y)) log.nan = true;
      if (Math.abs(b.x) > 1e6 || Math.abs(b.y) > 1e6) log.runaway = true;
    });
    /* a crate below the kill line for more than a moment is a crate the
       level will never see again */
    S.crates.forEach(cr => { if (cr.y > st.deathY + 40) log.crateLost++; });
    /* and neither of them should ever be left outside the walls */
    [A, R].forEach(b => {
      if (b.x < -120 || b.x > st.w + 120) log.escaped++;
      if (b.y > st.deathY + 400) log.belowWorld++;
    });
    if (res && res.done) {
      return Object.assign(log, { won: true, at: f / 60, coins: res.coins, total: res.total });
    }
    if (A.x > lastX + 30) { lastX = A.x; lastProgress = f; }
    if (f - lastProgress > 60 * 12) {
      log.stalls++; lastProgress = f;
      if (log.where.length < 6) log.where.push(
        'x' + Math.round(A.x) + '/' + Math.round(R.x) +
        (S.gates.some(g => !g.open && g.x > A.x - 40 && g.x < A.x + 200) ? ' at a shut door' : '') +
        (A.rope ? ' on the rope' : ''));
    }
  }
  held.clear();
  return Object.assign(log, { won: false, at: budget });
}

/* =====================================================================
   The minigames, played by rule rather than by reflex.
   ===================================================================== */
function playDuel(st) {
  const S = Mini.start(st, { difficulty: 'greenhorn' });
  S.phase = 'play';
  const dt = 1 / 60;
  for (let f = 0; f < 60 * 120; f++) {
    held.clear(); pressed.clear();
    const s = Mini.state;
    /* fire the instant the call comes, both at once */
    if (s.stage === 'draw' || s.drawT > 0) { tap(K.A.act); tap(K.R.act); }
    const res = Mini.update(dt);
    if (res && res.done) return { won: true, at: f / 60 };
    if (s.phase === 'lost') return { won: false, why: 'lost' };
  }
  return { won: false, why: 'never ended' };
}

function playVault(st) {
  const S = Mini.start(st, { difficulty: 'greenhorn' });
  S.phase = 'play';
  const dt = 1 / 60;
  for (let f = 0; f < 60 * 400; f++) {
    held.clear(); pressed.clear();
    const s = Mini.state;
    if (s.phase === 'lost') break;
    /* hold still while the lamp is on them */
    if (s.guardWarn > 0.05) { held.add(K.A.d); held.add(K.R.d); }
    else {
      const d = s.dials[s.sel];
      if (s.listen !== s.sel) { tap(s.listen < s.sel ? K.R.r : K.R.l); }
      else if (d.solved) { tap(K.A.u); }
      else {
        /* turn towards the notch, and lock it when it is there */
        let diff = (d.angle - d.target) % (Math.PI * 2);
        if (diff > Math.PI) diff -= Math.PI * 2;
        if (diff < -Math.PI) diff += Math.PI * 2;
        if (Math.abs(diff) < 0.1) tap(K.A.act);
        else held.add(diff > 0 ? K.A.l : K.A.r);
      }
    }
    const res = Mini.update(dt);
    if (res && res.done) return { won: true, at: f / 60, score: res.coins };
    if (s.phase === 'lost') return { won: false, why: 'the guard won' };
  }
  return { won: false, why: 'never ended' };
}

function playRide(st) {
  const S = Mini.start(st, { difficulty: 'greenhorn' });
  S.phase = 'play';
  const dt = 1 / 60;
  const GROUND = CFG.H - 118;
  for (let f = 0; f < 60 * 400; f++) {
    held.clear(); pressed.clear();
    const s = Mini.state;
    if (s.phase === 'lost') break;
    /* jump anything sitting on the trail before it arrives */
    const rock = s.things.find(o => o.kind !== 'bird' && o.x > CFG.W * 0.30 &&
                                    o.x < CFG.W * 0.30 + 120);
    if (rock && s.grounded) tap(K.A.u);
    /* put the sights on the nearest bird and fire */
    const bird = s.things.find(o => o.kind === 'bird' && !o.dead);
    if (bird) {
      if (s.cross.x < bird.x - 8) held.add(K.R.r);
      if (s.cross.x > bird.x + 8) held.add(K.R.l);
      if (s.cross.y < bird.y - 8) held.add(K.R.d);
      if (s.cross.y > bird.y + 8) held.add(K.R.u);
      if (Math.abs(s.cross.x - bird.x) < 30 && Math.abs(s.cross.y - bird.y) < 30)
        tap(K.R.act);
    }
    const res = Mini.update(dt);
    if (res && res.done) return { won: true, at: f / 60, score: res.coins };
    if (s.phase === 'lost') return { won: false, why: 'ran out of hearts' };
  }
  return { won: false, why: 'never ended' };
}

/* ===================================================================== */
console.log('PLAYING EVERY CHAPTER THROUGH TO ITS EXIT\n');
const BUDGET = { gulch: 300, mine: 220, canyon: 220, sunset: 220, ghost: 260 };
const results = [];

STAGES.forEach(st => {
  if (st.kind === 'platform') {
    const r = playChapter(st, BUDGET[st.id] || 240);
    results.push([st, r]);
    ok(st.name + ' survives five minutes of ignorant input', !r.threw, r.threw || '');
    ok(st.name + ' never produces a broken number', !r.nan && !r.runaway);
    ok(st.name + ' never leaves either of them outside the level',
       r.escaped === 0 && r.belowWorld === 0,
       r.escaped + ' escapes, ' + r.belowWorld + ' below the world');
    ok(st.name + ' never loses the crate for good', r.crateLost === 0,
       r.crateLost + ' frames with a crate under the kill line');
    console.log('         reached x' + Math.round(r.maxX) + ' of ' + st.w +
                (r.won ? ' AND FINISHED IT' : '') +
                ', ' + r.deaths + ' falls, all recovered');
  } else {
    const r = st.kind === 'duel' ? playDuel(st)
            : st.kind === 'vault' ? playVault(st) : playRide(st);
    results.push([st, r]);
    ok(st.name + ' can be won', r.won, r.why || '');
    if (r.won) console.log('         ' + r.at.toFixed(0) + 's');
  }
});

/* How far a player who only ever runs right and jumps gets. Not a pass
   or a fail - a two-person puzzle is SUPPOSED to stop someone doing only
   that - but a number worth watching: if it collapses after a change,
   something in the plain traversal broke. */
console.log('\nHOW FAR IGNORANCE ALONE GETS YOU');
results.forEach(([st, r]) => {
  if (st.kind !== 'platform') return;
  const pct = Math.round(r.maxX / st.w * 100);
  console.log('  ' + st.name.padEnd(18) + String(pct).padStart(3) + '%   ' +
              r.stalls + ' times it had to stop and think, ' + r.deaths + ' falls');
});

console.log('\n--------------------------------------------');
if (fail) { console.log(fail + ' FAILED, ' + pass + ' passed'); process.exit(1); }
console.log('all ' + pass + ' checks passed');
