/* =====================================================================
   tools/simulate.js  --  headless regression tests.

   Run:  node tools/simulate.js

   Loads the REAL game logic (config, utils, levels, platformer,
   minigames) with the drawing and audio stubbed out, then drives it
   frame by frame with synthetic input and asserts the things that have
   actually broken before:

     - you cannot walk off the left edge of a level
     - the crate door needs the crate, not a footstep
     - a latching door stays open once solved
     - Rojina can really reach the ledges marked as hers
     - Arshia cannot reach those same ledges by jumping
     - the lasso builds a swing instead of dying on the rope
     - a lost duel resets its miss counter
   ===================================================================== */

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

/* ---------------- stubs for everything visual or audible ------------- */
const held = new Set();
const pressed = new Set();

const stubs = `
const Snd = { play(){}, music(){}, stopMisic(){}, stopMusic(){}, resume(){}, init(){}, vol(){}, S:{} };
const FX = {
  dust(){}, land(){}, sparks(){}, hearts(){}, smoke(){}, shard(){}, speedLine(){},
  say(){}, shake(){}, flash(){}, hitstop(){}, update(){}, draw(){}, drawFlash(){},
  applyShake(){}, clear(){}, spawn(){}, get slowmo(){ return 0; }
};
const Sky = { draw(){} };
const Props = new Proxy({}, { get: () => () => {} });
function drawChar(){} function drawHeart(){} function drawPortrait(){}
function star(){} function drawGlasses(){} function drawPendant(){}
const Input = {
  MAPS: {
    p1:{ left:'KeyA', right:'KeyD', up:'KeyW', down:'KeyS', act:'KeyE', act2:'ShiftLeft', kiss:'KeyQ' },
    p2:{ left:'ArrowLeft', right:'ArrowRight', up:'ArrowUp', down:'ArrowDown', act:'Slash', act2:'Period', kiss:'ShiftRight' }
  },
  held: c => __held.has(c),
  hit:  c => __pressed.has(c),
  up:   () => false,
  p:  (n,a) => __held.has(Input.MAPS['p'+n][a]),
  ph: (n,a) => __pressed.has(Input.MAPS['p'+n][a]),
  pu: () => false,
  axis(n){ return (__held.has(this.MAPS['p'+n].right)?1:0) - (__held.has(this.MAPS['p'+n].left)?1:0); },
  anyKey: () => false, last: () => '',
  menuUp: () => false, menuDown: () => false, menuLeft: () => false,
  menuRight: () => false, menuOk: () => false, menuBack: () => false,
  endFrame(){ __pressed.clear(); }
};
`;

const src = [
  'js/config.js', 'js/utils.js', 'js/levels.js'
].map(read).join('\n;\n')
  + '\n;\n' + stubs + '\n;\n'
  + [ 'js/platformer.js', 'js/minigames.js' ].map(read).join('\n;\n')
  + '\n;\nreturn { CFG, STAGES, Play, Duel, Vault, Ride, Mini, LOOK, DIFF };';

const API = new Function('__held', '__pressed', src)(held, pressed);
const { CFG, STAGES, Play, Duel, Mini } = API;

/* ---------------- tiny test harness ---------------- */
let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '   -> ' + detail : '')); }
}
function section(s) { console.log('\n' + s); }

/* drive the stage forward at a fixed step */
const DT = 1 / 120;
function step(frames) {
  for (let i = 0; i < frames; i++) { Play.update(DT); pressed.clear(); }
}
function tap(code) { held.add(code); pressed.add(code); }
function release(code) { held.delete(code); }
function clearKeys() { held.clear(); pressed.clear(); }

function startStage(id, diff) {
  const st = STAGES.find(s => s.id === id);
  clearKeys();
  const S = Play.start(st, { difficulty: diff || 'gunslinger' });
  S.state = 'play'; S.stateT = 0;      /* skip the intro card */
  return S;
}

/* how high a character can actually get, driven through the real engine */
function measureRise(S, p, keyUp, holdMs, doubleJump) {
  /* keep the other one alongside: the co-op leash yanks whoever is left
     behind, and that would quietly corrupt the measurement */
  const other = p === S.a ? S.r : S.a;
  other.x = p.x + 30; other.y = p.y; other.vx = 0; other.vy = 0;
  p.vx = 0; p.vy = 0; p.jumps = 0; p.rope = null;
  step(6);
  const y0 = p.y;
  let peak = y0;
  tap(keyUp);
  const holdFrames = Math.round(holdMs / 1000 / DT);
  for (let i = 0; i < holdFrames; i++) { Play.update(DT); pressed.clear(); peak = Math.min(peak, p.y); }
  release(keyUp);
  step(4); peak = Math.min(peak, p.y);
  if (doubleJump) {
    tap(keyUp);
    Play.update(DT); pressed.clear();
    release(keyUp);
  }
  for (let i = 0; i < 90; i++) { Play.update(DT); pressed.clear(); peak = Math.min(peak, p.y); }
  return y0 - peak;
}

/* ==================================================================== */
section('EDGE WALLS');
{
  const S = startStage('gulch');
  S.a.x = 12; S.a.y = 428; S.a.vx = 0; S.a.vy = 0;
  held.add('KeyA');
  step(140);
  release('KeyA');
  check('Arshia is stopped by the left wall', S.a.x >= -1 && S.a.x < 30, 'x=' + S.a.x.toFixed(1));
  check('Arshia did not fall out of the world', !S.a.down && S.a.y < S.def.deathY,
        'y=' + S.a.y.toFixed(1) + ' down=' + S.a.down);
  clearKeys();
}

/* ==================================================================== */
section('THE CRATE DOOR');
{
  const S = startStage('gulch');
  const gate = S.gates.find(g => g.id === 'p1' || g.openBy.includes('p1'));
  const plate = S.plates.find(p => p.id === 'p1');
  check('plate p1 answers only to a crate', plate.who === 'crate', 'who=' + plate.who);
  check('the crate door does not latch', gate.latch === false, 'latch=' + gate.latch);

  /* a player standing on it must do nothing */
  S.a.x = plate.x + 20; S.a.y = 428; S.a.vx = 0; S.a.vy = 0;
  S.r.x = plate.x + 40; S.r.y = 428; S.r.vx = 0; S.r.vy = 0;
  step(40);
  check('standing on it does NOT press the plate', plate.on === false);
  check('standing on it does NOT open the door', gate.open === false);

  /* the crate does */
  const cr = S.crates[0];
  cr.x = plate.x + 8; cr.y = 470 - cr.h; cr.vx = 0; cr.vy = 0;
  S.a.x = plate.x - 90; S.r.x = plate.x - 130;
  step(40);
  check('the crate presses the plate', plate.on === true);
  check('the crate opens the door', gate.open === true);

  /* and taking it away shuts the door again */
  cr.x = plate.x - 300;
  step(40);
  check('removing the crate shuts the door', gate.open === false);
  clearKeys();
}

/* ==================================================================== */
section('THE LATCHING DOOR');
{
  const S = startStage('gulch');
  const gate = S.gates.find(g => g.id === 'g2');
  const plate = S.plates.find(p => p.id === 'p2a');
  check('door two latches', gate.latch === true);
  check('plate p2a is hers alone', plate.who === 'rojina');

  S.a.x = plate.x + 10; S.a.y = plate.y - 60;
  step(30);
  check('Arshia on her plate does not open it', gate.open === false);

  S.a.x = 2340; S.a.y = 428;
  S.r.x = plate.x + 10; S.r.y = plate.y - 44; S.r.vy = 0;
  step(30);
  check('Rojina on her plate opens it', gate.open === true);

  S.r.x = 2340; S.r.y = 428;
  step(60);
  check('it stays open after she steps off', gate.open === true);
  clearKeys();
}

/* ==================================================================== */
section('THE REACH BUDGET');
{
  const S = startStage('gulch');
  S.r.x = 2380; S.r.y = 428; S.a.x = 2340; S.a.y = 428;
  const sloppy = measureRise(S, S.r, 'ArrowUp', 60, true);
  S.r.x = 2380; S.r.y = 428; S.a.x = 2340; S.a.y = 428;
  const good = measureRise(S, S.r, 'ArrowUp', 250, true);
  S.a.x = 2380; S.a.y = 428; S.r.x = 2340; S.r.y = 428;
  const his = measureRise(S, S.a, 'KeyW', 400, false);

  /* read the real ledge out of the level rather than hard-coding it,
     so tuning the geometry can never drift away from the test */
  const plate = S.plates.find(p => p.id === 'p2a');
  const ledge = 470 - (plate.y + 11);
  check('Rojina clears her ledge even with sloppy timing',
        sloppy >= ledge, sloppy.toFixed(0) + 'px vs ' + ledge + ' needed');
  check('Rojina clears it comfortably when played well',
        good >= ledge + 25, good.toFixed(0) + 'px');
  check('Arshia genuinely cannot reach her ledge',
        his < ledge - 8, his.toFixed(0) + 'px vs ' + ledge + ' needed');
  clearKeys();
}

/* ==================================================================== */
section('THE LASSO');
{
  const S = startStage('gulch');
  /* park him beside the first ring in the split section */
  const ring = S.rings.find(r => r.x === 3480);
  S.a.x = 3370; S.a.y = 428; S.a.vx = 0; S.a.vy = 0;
  S.r.x = 3340; S.r.y = 428;
  step(10);
  tap('KeyE');
  Play.update(DT); pressed.clear();
  release('KeyE');
  check('the lasso catches the ring', S.a.rope === ring,
        'rope=' + (S.a.rope ? S.a.rope.x : 'none'));

  /* pump the swing the way a player would: push in the travel direction */
  let maxSpeed = 0, maxX = S.a.x, minX = S.a.x;
  for (let i = 0; i < 420 && S.a.rope; i++) {
    const goingRight = S.a.vx >= 0;
    release('KeyA'); release('KeyD');
    held.add(goingRight ? 'KeyD' : 'KeyA');
    Play.update(DT); pressed.clear();
    maxSpeed = Math.max(maxSpeed, Math.abs(S.a.vx));
    maxX = Math.max(maxX, S.a.x); minX = Math.min(minX, S.a.x);
  }
  release('KeyA'); release('KeyD');
  check('pumping actually builds swing speed', maxSpeed > 240, 'peak ' + maxSpeed.toFixed(0) + ' px/s');
  check('the arc gets wide enough to cross', (maxX - minX) > 200,
        'arc ' + (maxX - minX).toFixed(0) + 'px');
  check('the far ledge is inside the arc', maxX + 22 >= 3600,
        'reached x=' + (maxX + 22).toFixed(0) + ', ledge at 3600');
  clearKeys();
}

/* ==================================================================== */
section('THE DUEL');
{
  const def = STAGES.find(s => s.id === 'duel');
  const D = Duel.start(def, 1);
  D.fails = 99; D.won = 1;
  D.reset();
  check('a reset duel clears its miss counter', D.fails === 0, 'fails=' + D.fails);
  check('a reset duel clears its wins', D.won === 0);
  check('the miss limit is configurable', D.maxFails === (def.maxFails || 4),
        'maxFails=' + D.maxFails);
  check('three rounds to win, not five', D.rounds === 3, 'rounds=' + D.rounds);
}

/* ==================================================================== */
section('FALLING');
{
  const S = startStage('gulch');
  S.a.x = 1040; S.a.y = 470; S.a.vx = 0; S.a.vy = 0;
  step(30);                                    /* let him record footing */
  const hearts = S.a.hearts;
  S.a.y = S.def.deathY + 50;                   /* drop him out of the world */
  step(4);
  check('a fall costs one heart, not a life', S.a.hearts === hearts - 1,
        S.a.hearts + ' of ' + hearts);
  check('a fall puts him back on solid ground', S.a.y < S.def.deathY && !S.a.down,
        'y=' + S.a.y.toFixed(0));
  clearKeys();
}

/* ==================================================================== */
section('WALKING THE WHOLE OF CHAPTER ONE');
{
  /* sanity: every checkpoint sits on something, and the exit is past
     the last piece of ground rather than floating in the sky          */
  const st = STAGES.find(s => s.id === 'gulch');
  const tops = st.solids.filter(s => s.role !== 'lintel');
  const exTop = st.exit.y + st.exit.h;
  const onGround = tops.some(s => st.exit.x >= s.x - 30 && st.exit.x <= s.x + s.w + 30 &&
                                   Math.abs(s.y - exTop) < 6);
  check('the exit stands on real ground', onGround, 'exit top ' + exTop);
  check('chapter one is about three times its old length', st.w >= 9000, 'w=' + st.w);
  const cpOk = st.checkpoints.every(cp =>
    tops.some(s => cp.x >= s.x - 30 && cp.x <= s.x + s.w + 30 && Math.abs(s.y - cp.y) < 8));
  check('every checkpoint stands on ground', cpOk);
}

/* ==================================================================== */
console.log('\n--------------------------------------------');
console.log(fail ? pass + ' passed, ' + fail + ' FAILED' : 'all ' + pass + ' checks passed');
process.exit(fail ? 1 : 0);
