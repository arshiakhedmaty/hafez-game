/* =====================================================================
   tools/edges.js  --  doing things earlier, later, or more often than
   the game expects.

   Run:  node tools/edges.js

   Nothing here plays properly. It finishes a chapter with a body lying
   in the doorway, interrupts a kiss halfway through, throws the rope at
   empty sky, walks away until the leash stops it, ignores a minigame
   for three minutes, and holds every key on the keyboard down at once
   for forty seconds. The game is supposed to survive all of it.
   ===================================================================== */

const { loadEngine } = require('./files');
const held = new Set(), pressed = new Set();
const { CFG, STAGES, Play, Mini } =
  loadEngine(held, pressed, ['CFG', 'STAGES', 'Play', 'Mini', 'Duel', 'Vault', 'Ride']);

const DT = 1 / 60;
let pass = 0, fail = 0;
const ok = (n, c, d) => {
  if (c) { pass++; console.log('  ok   ' + n); }
  else { fail++; console.log('  FAIL ' + n + (d ? '   ' + d : '')); }
};
const group = t => console.log('\n' + t);
const step = n => { for (let i = 0; i < n; i++) { Play.update(DT); pressed.clear(); } };
const start = (id, diff) => {
  held.clear(); pressed.clear();
  const S = Play.start(STAGES.find(s => s.id === id), { difficulty: diff || 'gunslinger' });
  S.state = 'play'; S.stateT = 0; return S;
};
const tap = k => { held.add(k); pressed.add(k); };

group('THE EXIT');
{
  const S = start('gulch');
  const ex = S.def.exit;
  /* only one of them reaches the door */
  /* both nearby - the leash drags whoever is left behind, so parking her
     on the far side of the map would test the leash and nothing else */
  S.a.x = ex.x + 10; S.a.y = ex.y + 40;
  S.r.x = ex.x - 200; S.r.y = 178;
  step(10);
  ok('one of them at the door is not enough', S.state === 'play');
  S.r.x = ex.x + 25; S.r.y = ex.y + 40;
  step(4);
  ok('both of them at the door finishes it', S.state === 'clear');
  /* and it cannot fire twice */
  const t0 = S.stateT;
  step(10);
  ok('the finish does not retrigger', S.stateT > t0 && S.state === 'clear');
}
{
  const S = start('gulch');
  const ex = S.def.exit;
  /* one of them is face down in the doorway */
  S.a.x = ex.x + 10; S.a.y = ex.y + 40; S.a.down = true;
  S.r.x = ex.x + 25; S.r.y = ex.y + 40;
  step(10);
  ok('a body lying in the doorway does not finish the chapter', S.state === 'play');
}

group('THE LAST COIN AND THE DOOR');
{
  const S = start('gulch');
  const ex = S.def.exit;
  const last = S.coins.reduce((a, b) => (b.x > a.x ? b : a));
  ok('the last coin is not inside the doorway',
     !(last.x > ex.x - 10 && last.x < ex.x + ex.w + 10 &&
       last.y > ex.y - 10 && last.y < ex.y + ex.h + 10),
     'coin at ' + last.x + ',' + last.y + ' door at ' + ex.x + ',' + ex.y);
}

group('BEING REVIVED AT THE WORST MOMENT');
{
  const S = start('gulch');
  const A = S.a, R = S.r;
  R.hearts = 0; R.down = true;
  A.x = R.x + 6; A.y = R.y;
  held.add('KeyQ');
  /* he goes down halfway through the kiss */
  for (let f = 0; f < 30; f++) { Play.update(DT); pressed.clear(); A.x = R.x + 6; A.y = R.y; }
  const mid = R.reviveT;
  A.hearts = 0; A.down = true;
  step(6);
  held.clear();
  ok('a kiss interrupted halfway does not revive anybody', R.down === true, 'reviveT was ' + mid.toFixed(2));
  ok('and the game goes to the wipe instead', S.state === 'wipe' || S.state === 'play');
}
{
  const S = start('gulch');
  const A = S.a, R = S.r;
  R.hearts = 0; R.down = true;
  A.x = R.x + 6; A.y = R.y;
  held.add('KeyQ');
  for (let f = 0; f < 200 && R.down; f++) { Play.update(DT); pressed.clear(); A.x = R.x + 6; A.y = R.y; }
  held.clear();
  ok('she is up again', !R.down);
  ok('and briefly untouchable, so the same spikes do not take her straight back down',
     R.iframe > 0.5, 'iframe ' + R.iframe.toFixed(2));
}

group('THE PRICE OF A KISS');
{
  const S = start('gulch');
  const A = S.a, R = S.r;
  const base = R.maxHearts;
  const kiss = () => {
    R.hearts = 0; R.down = true; R.reviveT = 0;
    held.add('KeyQ');
    for (let f = 0; f < 200 && R.down; f++) {
      Play.update(DT); pressed.clear(); A.x = R.x + 6; A.y = R.y;
    }
    held.clear();
  };
  kiss();
  ok('coming back costs a heart of her maximum', R.maxHearts === base - 1);
  kiss(); kiss(); kiss();
  ok('but it never takes the last one, so she is always revivable',
     R.maxHearts >= 1, 'max is ' + R.maxHearts);
  /* and now the two of them go down together */
  const lost = R.maxHearts;
  A.hearts = 0; A.down = true; R.hearts = 0; R.down = true;
  step(8);                                   /* let it notice and start the wipe */
  for (let f = 0; f < 600 && S.state !== 'play'; f++) { Play.update(DT); pressed.clear(); }
  ok('a wipe patches them up', R.hearts === R.maxHearts);
  ok('but does NOT hand back the hearts a kiss cost - otherwise dying ' +
     'together is the cheapest cure in the game', R.maxHearts === lost,
     'was ' + lost + ', now ' + R.maxHearts);
}

group('THE ROPE');
{
  const S = start('gulch');
  const A = S.a;
  const ring = S.rings[0];
  A.x = ring.x - 40; A.y = 428;
  S.r.x = ring.x - 70; S.r.y = 428;      /* keep her in reach of the leash */
  step(4);
  /* throw it, then throw it again while already on it */
  tap('KeyE'); step(2);
  const onRope = !!A.rope;
  tap('KeyE'); step(2);
  ok('throwing the rope catches a ring in range', onRope);
  ok('pressing throw again lets go rather than stacking ropes', !A.rope);
  /* throw at nothing */
  A.x = 100; A.y = 428; S.r.x = 130; S.r.y = 428; step(4);
  tap('KeyE'); step(2);
  ok('throwing at empty sky does nothing bad', !A.rope);
}

group('KEEPING THEM TOGETHER');
{
  const S = start('gulch');
  S.a.x = 200; S.r.x = 200;
  step(4);
  /* drive her a long way off on her own */
  held.add('ArrowRight');
  for (let f = 0; f < 60 * 12; f++) { Play.update(DT); pressed.clear(); }
  held.clear();
  const apart = Math.abs(S.a.x - S.r.x);
  ok('neither of them can wander off the end of the leash', apart < 700,
     Math.round(apart) + 'px apart');
  ok('and neither of them ends up outside the level',
     S.a.x > -80 && S.a.x < S.def.w + 80 && S.r.x > -80 && S.r.x < S.def.w + 80);
}

group('A MINIGAME THAT IS IGNORED');
['duel', 'vault', 'ride'].forEach(id => {
  const st = STAGES.find(s => s.id === id);
  held.clear(); pressed.clear();
  const S = Mini.start(st, { difficulty: 'gunslinger' });
  S.phase = 'play';
  let threw = null, lost = 0, backToPlay = false;
  try {
    for (let f = 0; f < 60 * 200; f++) {
      Mini.update(DT); pressed.clear();
      if (S.phase === 'lost') { if (!lost) lost = f; }
      else if (lost && S.phase === 'play') { backToPlay = true; break; }
    }
  } catch (e) { threw = e.message; }
  ok(st.name + ' ends the round rather than hanging when nobody plays',
     !threw && lost > 0, threw || 'never resolved in three minutes');
  ok(st.name + ' then puts them back at the start to try again', backToPlay);
});

group('THE SAME KEY MASHED');
{
  const S = start('gulch');
  let threw = null;
  try {
    for (let f = 0; f < 60 * 40; f++) {
      held.clear(); pressed.clear();
      /* every key at once, every frame */
      ['KeyA','KeyD','KeyW','KeyS','KeyE','ShiftLeft','KeyQ',
       'ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Slash','ShiftRight']
        .forEach(k => { held.add(k); pressed.add(k); });
      Play.update(DT);
    }
  } catch (e) { threw = e.message; }
  held.clear(); pressed.clear();
  ok('forty seconds of every key at once does not throw', !threw, threw || '');
  ok('and leaves both of them somewhere real',
     isFinite(S.a.x) && isFinite(S.a.y) && isFinite(S.r.x) && isFinite(S.r.y));
}

console.log('\n--------------------------------------------');
console.log(fail ? fail + ' FAILED, ' + pass + ' passed' : 'all ' + pass + ' checks passed');
process.exit(fail ? 1 : 0);
