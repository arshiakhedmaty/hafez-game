/* =====================================================================
   tools/validate.js  --  level reachability checker.

   Run:  node tools/validate.js

   Loads the real config and level tables, rebuilds each platform stage
   as a graph of standable surfaces, and walks it with an honest
   projectile model of each character's jump. Anything the pair cannot
   actually reach -- a plate, a door, the exit -- is reported as a
   FAIL rather than discovered by a player getting stuck.
   ===================================================================== */

const fs = require('fs');
const path = require('path');

/* ---- load the browser files into this process ---- */
const root = path.join(__dirname, '..');
const src = ['js/config.js', 'js/levels.js']
  .map(f => fs.readFileSync(path.join(root, f), 'utf8'))
  .join('\n;\n');
const { CFG, STAGES } = new Function(src + '\n;return { CFG, STAGES };')();

/* ---- the movement model, mirroring js/platformer.js ---- */
const G = CFG.GRAV;
const CHARS = {
  arshia: { run: 212, jump: 660, w: 22, h: 42, dbl: false },
  rojina: { run: 236, jump: 620, w: 20, h: 40, dbl: true }
};
/* effective launch speed, folding the double jump into one arc */
function launch(c) {
  if (!c.dbl) return c.jump;
  const h1 = c.jump * c.jump / (2 * G);
  const j2 = c.jump;            /* the second jump fires at full strength */
  const h2 = j2 * j2 / (2 * G);
  return Math.sqrt(2 * G * (h1 + h2));
}
/* furthest horizontal travel that still lands `rise` px above the start
   (rise < 0 means landing lower). Returns -1 if the height is out of reach. */
function reach(c, rise) {
  const v = launch(c);
  const disc = v * v - 2 * G * rise;
  if (disc < 0) return -1;
  const t = (v + Math.sqrt(disc)) / G;
  return c.run * t;
}
const SAFETY = 0.80;          /* authored distances must sit inside 80% */

/* ---- surfaces ---- */
function surfaces(stage, opts) {
  const out = [];
  const push = (r, kind) => out.push({ x1: r.x, x2: r.x + r.w, y: r.y, kind });
  (stage.solids || []).forEach(r => { if (r.role !== 'lintel') push(r, 'solid'); });
  (stage.crumbles || []).forEach(r => push(r, 'crumble'));
  if (opts.phantoms) (stage.phantoms || []).forEach(r => push(r, 'phantom'));
  (stage.movers || []).forEach(m => {
    push({ x: m.ax, y: m.ay, w: m.w }, 'mover');
    push({ x: m.bx, y: m.by, w: m.w }, 'mover');
  });
  /* an open doorway is standable floor at the level it stands on, but the
     floor already runs underneath it, so gates add nothing here */
  return out;
}

/* can a character get from surface A to surface B? */
function canHop(c, a, b) {
  const rise = a.y - b.y;                    /* +ve means b is higher   */
  const r = reach(c, rise);
  if (r < 0) return false;
  /* horizontal separation between the two spans (0 if they overlap)    */
  const gap = b.x1 > a.x2 ? b.x1 - a.x2 : (a.x1 > b.x2 ? a.x1 - b.x2 : 0);
  if (gap === 0) return heightOnly(c, rise);
  return gap <= r * SAFETY;
}
function heightOnly(c, rise) {
  const v = launch(c);
  return rise <= (v * v) / (2 * G) * SAFETY;
}

/* Arshia only: hook a ring from surface `a` and swing. Once on the rope
   he can pump with A/D and jump off it, so treat anything below the ring
   and inside the rope's sweep as landable.                              */
const LASSO_RANGE = 230;
function lassoHops(c, a, b, rings) {
  if (c.jump !== CHARS.arshia.jump) return false;
  const ay = a.y - c.h / 2;
  for (const r of rings) {
    const ax = Math.max(a.x1, Math.min(r.x, a.x2));
    const len = Math.hypot(ax - r.x, ay - r.y);
    if (len > LASSO_RANGE || r.y > ay) continue;      /* must be overhead */
    const sweep = len * 0.90;
    if (b.y < r.y) continue;                          /* cannot land above it */
    if (b.x2 >= r.x - sweep && b.x1 <= r.x + sweep) return true;
  }
  return false;
}

function reachable(c, surfs, startX, rings) {
  /* find the surface under the spawn */
  let start = surfs
    .filter(s => startX >= s.x1 - 40 && startX <= s.x2 + 40)
    .sort((p, q) => p.y - q.y)[0];
  if (!start) start = surfs.slice().sort((p, q) => p.x1 - q.x1)[0];
  const seen = new Set([surfs.indexOf(start)]);
  const queue = [start];
  while (queue.length) {
    const a = queue.shift();
    surfs.forEach((b, i) => {
      if (seen.has(i)) return;
      if (canHop(c, a, b) || lassoHops(c, a, b, rings || [])) { seen.add(i); queue.push(b); }
    });
  }
  return [...seen].map(i => surfs[i]);
}

const cr0 = crate => crate.y + crate.h;

/* is a point standing-height above one of these surfaces? */
function standsOn(surfs, x, top, slack) {
  slack = slack || 26;
  return surfs.some(s => x >= s.x1 - slack && x <= s.x2 + slack &&
                          Math.abs(s.y - top) <= slack);
}

/* ---------------------------------------------------------------- */
let fails = 0, warns = 0;
const bad = m => { fails++; console.log('   FAIL  ' + m); };
const warn = m => { warns++; console.log('   warn  ' + m); };

for (const st of STAGES) {
  if (st.kind !== 'platform') continue;
  console.log('\n=== ' + st.name + '  (' + st.id + ') ===');

  const all = surfaces(st, { phantoms: true });
  const noGhost = surfaces(st, { phantoms: false });

  const rings = st.rings || [];
  const R = reachable(CHARS.rojina, all, st.spawn.r[0], []);
  const A = reachable(CHARS.arshia, all, st.spawn.a[0], rings);
  const Ahard = reachable(CHARS.arshia, noGhost, st.spawn.a[0], rings);

  console.log('   surfaces ' + all.length +
              '   reachable  ARSHIA ' + A.length + '   ROJINA ' + R.length);

  /* every surface should be standable by at least one of them */
  all.forEach(s => {
    if (!A.includes(s) && !R.includes(s))
      bad('surface at x' + s.x1 + '-' + s.x2 + ' y' + s.y + ' (' + s.kind + ') is unreachable by BOTH');
  });

  /* the exit has to take both of them */
  const exTop = st.exit.y + st.exit.h;
  ['arshia', 'rojina'].forEach(who => {
    const set = who === 'arshia' ? A : R;
    if (!standsOn(set, st.exit.x + st.exit.w / 2, exTop, 40))
      bad(who.toUpperCase() + ' cannot stand at the exit (x' + st.exit.x + ' top' + exTop + ')');
  });

  /* every plate must be reachable by whoever is allowed to press it */
  (st.plates || []).forEach(p => {
    const top = p.y + 11;
    let ok;
    if (p.who === 'crate') {
      /* a crate plate needs a crate that starts on the same shelf and a
         clear push to it, so check both sit on ground he can walk       */
      const crate = (st.crates || []).find(cr => Math.abs((cr.y + cr.h) - top) < 60);
      ok = !!crate && standsOn(A, p.x + p.w / 2, top, 30) &&
           standsOn(A, crate.x + crate.w / 2, cr0(crate), 40);
      if (!ok) bad('plate ' + p.id + ' is crate-only but no crate can be pushed onto it');
    } else {
      const who = p.who === 'rojina' ? ['rojina'] : (p.who === 'arshia' ? ['arshia'] : ['arshia', 'rojina']);
      ok = who.some(w => standsOn(w === 'arshia' ? A : R, p.x + p.w / 2, top, 30));
      if (!ok) bad('plate ' + p.id + ' at x' + p.x + ' top' + top + ' is not reachable by ' + p.who);
    }
    /* a rojina-only plate should genuinely be out of his reach */
    if (p.who === 'rojina' && standsOn(Ahard, p.x + p.w / 2, top, 22))
      warn('plate ' + p.id + ' is marked rojina-only but ARSHIA can stand there too');
  });

  /* gates : each one needs at least one plate that opens it */
  (st.gates || []).forEach(g => {
    const plates = (st.plates || []).filter(p => g.openBy.includes(p.id));
    if (plates.length !== g.openBy.length)
      bad('gate ' + g.id + ' names a plate that does not exist: ' + g.openBy.join(','));
    if (g.mode !== 'any' && plates.length > 1)
      warn('gate ' + g.id + ' needs ALL of ' + g.openBy.join(' + ') +
           ' held at once - check that is really possible');
    /* the lintel must be too high to hop over */
    const lint = (st.solids || []).find(s => Math.abs(s.x - g.x) < 2 && s.y < g.y);
    if (!lint) warn('gate ' + g.id + ' has no lintel above it - it can be jumped');
    else {
      const floor = g.y + g.h;
      const over = floor - lint.y;
      if (over <= launch(CHARS.rojina) ** 2 / (2 * G))
        warn('gate ' + g.id + ' lintel top is only ' + over.toFixed(0) +
             'px up - ROJINA can jump over it (she reaches ' +
             (launch(CHARS.rojina) ** 2 / (2 * G)).toFixed(0) + ')');
    }
    /* an open door must have floor running under it */
    const floorY = g.y + g.h;
    const hasFloor = (st.solids || []).some(s =>
      s.y === floorY && s.x <= g.x && s.x + s.w >= g.x + g.w);
    if (!hasFloor) bad('gate ' + g.id + ' has no floor underneath - opening it leaves a hole');
  });

  /* ghost timbers : she must be able to stand somewhere that lights them */
  const LANTERN = 200;
  (st.phantoms || []).forEach(p => {
    const c = { x: p.x + p.w / 2, y: p.y + p.h / 2 };
    const lit = R.some(s => {
      /* nearest point she could stand on that surface */
      const sx = Math.max(s.x1, Math.min(c.x, s.x2));
      const sy = s.y - CHARS.rojina.h / 2;
      return Math.hypot(sx - c.x, sy - c.y) < LANTERN;
    });
    if (!lit) bad('ghost timber x' + p.x + ' y' + p.y + ' is never inside her lantern');
  });

  /* lasso rings should be in range of somewhere he can stand */
  (st.rings || []).forEach(r => {
    const ok = A.some(s => {
      const sx = Math.max(s.x1, Math.min(r.x, s.x2));
      const sy = s.y - CHARS.arshia.h / 2;
      return Math.hypot(sx - r.x, sy - r.y) < 230 && r.y < sy + 40;
    });
    if (!ok) warn('ring at (' + r.x + ',' + r.y + ') is out of lasso range from anywhere he can stand');
  });

  /* coins are optional, so only a note */
  (st.coins || []).forEach(co => {
    const near = all.some(s => co.x >= s.x1 - 130 && co.x <= s.x2 + 130 &&
                                co.y > s.y - 175 && co.y < s.y + 60);
    if (!near) warn('coin at (' + co.x + ',' + co.y + ') looks stranded');
  });

  /* checkpoints must sit on ground */
  (st.checkpoints || []).forEach(cp => {
    if (!standsOn(all, cp.x, cp.y, 24))
      warn('checkpoint at x' + cp.x + ' y' + cp.y + ' is not on a surface');
  });
}

console.log('\n--------------------------------------------');
console.log(fails ? fails + ' FAILURES, ' + warns + ' warnings'
                  : 'all stages traversable  (' + warns + ' warnings)');
process.exit(fails ? 1 : 0);
