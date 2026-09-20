/* =====================================================================
   tools/audit.js  --  where everything SITS.

   Run:  node tools/audit.js

   validate.js asks whether a stage can be walked from end to end.
   This one asks a different question, the one a tester asks while
   actually playing: is anything buried in a wall, stuck inside a door,
   sitting on top of something else, or visible but impossible to pick
   up?

   That last one used to be a footnote. It is not any more: the hidden
   chapter is paid for with EVERY silver dollar in every ordinary
   chapter, so a single coin nobody can reach does not cost a
   completionist a footnote, it locks a whole chapter out of the game
   forever. Unreachable coins are therefore failures here, not notes.

   A collectible is reachable if either of them can touch it from
   somewhere they can stand. That is worked out from the real jump -
   the same launch speed and gravity the engine uses - by asking, for
   every surface they can reach, whether the coin falls inside the arc
   of a jump from anywhere along it.
   ===================================================================== */

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

const Save = { data: { best: {} } };
const API = new Function('Save',
  read('js/config.js') + '\n;\n' + read('js/utils.js') + '\n;\n' + read('js/levels.js') +
  '\n;\nreturn { CFG, STAGES, DIFF };')(Save);
const { CFG, STAGES } = API;

/* the numbers the engine actually runs on, lifted from platformer.js so
   they cannot drift apart from it silently */
const TUNE = (() => {
  const src = read('js/platformer.js');
  const grab = who => {
    const m = src.match(new RegExp(who + ':\\s*\\{([^}]*)\\}'));
    const o = {};
    m[1].split(',').forEach(kv => {
      const [k, v] = kv.split(':').map(s => s.trim());
      o[k] = parseFloat(v);
    });
    return o;
  };
  return { arshia: grab('arshia'), rojina: grab('rojina') };
})();
const GRAV = CFG.GRAV;

const CHARS = {
  arshia: { w: 22, h: 42, run: TUNE.arshia.run, jump: TUNE.arshia.jump, dbl: 0 },
  rojina: { w: 20, h: 40, run: TUNE.rojina.run, jump: TUNE.rojina.jump, dbl: 1 }
};
/* a double jump taken at the top of the first is worth sqrt(2) of one */
const launch = c => (c.dbl ? Math.sqrt(c.jump * c.jump * 2) : c.jump);
const COIN_R = 26;          /* how close a body has to pass to collect one */

let fails = 0, warns = 0, notes = 0;
let stageName = '';
const bad = m => { fails++; console.log('   FAIL  ' + m); };
const warn = m => { warns++; console.log('   warn  ' + m); };

/* ---------------- the pieces of a stage, as rectangles ---------------- */
function rects(st) {
  const out = [];
  const add = (r, kind, id) => out.push({
    x: r.x, y: r.y, w: r.w, h: r.h, kind, id: id || kind
  });
  (st.solids || []).forEach((s, i) =>
    add(s, s.role === 'lintel' ? 'lintel' : (s.type || 'solid'), (s.role || s.type || 'solid') + i));
  (st.movers || []).forEach((m, i) => add(m, 'mover', 'mover' + i));
  (st.crumbles || []).forEach((m, i) => add(m, 'crumble', 'crumble' + i));
  (st.phantoms || []).forEach((m, i) => add(m, 'phantom', 'phantom' + i));
  (st.gates || []).forEach(g => add(g, 'gate', 'gate ' + g.id));
  (st.crates || []).forEach((c, i) => add(c, 'crate', 'crate' + i));
  return out;
}

const inside = (px, py, r, pad) =>
  px > r.x + (pad || 0) && px < r.x + r.w - (pad || 0) &&
  py > r.y + (pad || 0) && py < r.y + r.h - (pad || 0);

/* ---------------- standable surfaces, and who can get to them -------- */
function surfaces(st, withGhosts) {
  const out = [];
  const push = (r, kind) => out.push({ x1: r.x, x2: r.x + r.w, y: r.y, kind });
  (st.solids || []).forEach(s => { if (s.role !== 'lintel') push(s, s.type || 'ground'); });
  (st.crumbles || []).forEach(r => push(r, 'crumble'));
  if (withGhosts) (st.phantoms || []).forEach(r => push(r, 'phantom'));
  (st.movers || []).forEach(m => {
    push(m, 'mover');
    push({ x: m.bx, y: m.by, w: m.w, h: m.h }, 'mover');
  });
  return out;
}

const riseOf = c => launch(c) ** 2 / (2 * GRAV);
function canHop(c, a, b) {
  const rise = a.y - b.y;
  if (rise > riseOf(c) * 0.86) return false;
  const gapL = b.x1 - a.x2, gapR = a.x1 - b.x2;
  const gap = Math.max(gapL, gapR, 0);
  const v = launch(c);
  if (rise <= 0) {
    const t = (v + Math.sqrt(v * v + 2 * GRAV * -rise)) / GRAV;
    return gap <= c.run * t * 0.86;
  }
  const disc = v * v - 2 * GRAV * rise;
  if (disc < 0) return false;
  const t = (v + Math.sqrt(disc)) / GRAV;
  return gap <= c.run * t * 0.86;
}
function lassoHops(c, a, b, rings) {
  for (const r of rings) {
    const near = s => r.x >= s.x1 - 230 && r.x <= s.x2 + 230 && r.y < s.y - 30;
    if (near(a) && near(b)) return true;
  }
  return false;
}
function reachable(c, surfs, startX, rings) {
  let start = -1, bestY = -1e9;
  surfs.forEach((s, i) => {
    if (startX >= s.x1 - 40 && startX <= s.x2 + 40 && s.y > bestY) { bestY = s.y; start = i; }
  });
  if (start < 0) return [];
  const seen = new Set([start]), q = [surfs[start]];
  while (q.length) {
    const a = q.pop();
    surfs.forEach((b, i) => {
      if (seen.has(i)) return;
      if (canHop(c, a, b) || lassoHops(c, a, b, rings || [])) { seen.add(i); q.push(b); }
    });
  }
  return [...seen].map(i => surfs[i]);
}

/* Can a body standing somewhere on `s` touch the point (px, py)?
   Solved on the real arc: rise to a height, and the horizontal distance
   covered by the time it is at that height, both up and coming down. */
function arcReaches(c, s, px, py) {
  const feet = s.y;
  const dy = feet - py;                       /* + is above the surface   */
  const v = launch(c);
  if (dy > riseOf(c)) return false;           /* higher than she can jump */
  let t;
  if (dy >= 0) {
    const disc = v * v - 2 * GRAV * dy;
    if (disc < 0) return false;
    t = (v + Math.sqrt(disc)) / GRAV;         /* on the way back down     */
  } else {
    t = (v + Math.sqrt(v * v + 2 * GRAV * -dy)) / GRAV;   /* fell off     */
  }
  const span = c.run * t + COIN_R;
  /* nearest point of the surface she could launch from */
  const nx = Math.max(s.x1, Math.min(px, s.x2));
  return Math.abs(px - nx) <= span;
}

/* ====================================================================== */
STAGES.filter(s => s.kind === 'platform').forEach(st => {
  stageName = st.name;
  console.log('\n=== ' + st.name + '  (' + st.id + ') ===');
  const before = fails + warns;

  const R = rects(st);
  const solidish = R.filter(r => r.kind !== 'phantom' && r.kind !== 'crate');
  const all = surfaces(st, true);
  const rings = st.rings || [];
  const reachR = reachable(CHARS.rojina, all, st.spawn.r[0], []);
  const reachA = reachable(CHARS.arshia, all, st.spawn.a[0], rings);

  /* ---------- 1. is anything buried? ---------- */
  const buried = (px, py, what, hard) => {
    const hit = solidish.find(r => inside(px, py, r, 2));
    if (!hit) return false;
    const msg = what + ' at (' + px + ',' + py + ') is inside ' + hit.id;
    hard ? bad(msg) : warn(msg);
    return true;
  };
  (st.coins || []).forEach(c => buried(c.x, c.y, 'coin', true));
  (st.rings || []).forEach(r => buried(r.x, r.y, 'lasso ring', true));
  (st.checkpoints || []).forEach(c => buried(c.x, c.y - 20, 'checkpoint', true));
  buried(st.exit.x + st.exit.w / 2, st.exit.y + st.exit.h / 2, 'the exit', true);
  buried(st.spawn.a[0], st.spawn.a[1], 'arshia spawn', true);
  buried(st.spawn.r[0], st.spawn.r[1], 'rojina spawn', true);

  /* ---------- 2. anything stacked on anything else? ---------- */
  const coins = st.coins || [];
  for (let i = 0; i < coins.length; i++)
    for (let j = i + 1; j < coins.length; j++)
      if (Math.hypot(coins[i].x - coins[j].x, coins[i].y - coins[j].y) < 22)
        bad('two coins are on top of each other at (' + coins[i].x + ',' + coins[i].y + ')');
  coins.forEach(c => {
    (st.crates || []).forEach((cr, i) => {
      if (inside(c.x, c.y, cr, -10))
        warn('coin at (' + c.x + ',' + c.y + ') starts inside crate' + i);
    });
    if (inside(c.x, c.y, st.exit, -10))
      warn('coin at (' + c.x + ',' + c.y + ') is inside the exit door');
  });
  (st.plates || []).forEach(p => {
    (st.hazards || []).forEach(h => {
      if (p.x < h.x + h.w && p.x + p.w > h.x && Math.abs(p.y - h.y) < 30)
        bad('plate ' + p.id + ' overlaps spikes - standing on it kills you');
    });
  });

  /* ---------- 3. can every coin actually be taken? ---------- */
  coins.forEach(c => {
    const byR = reachR.some(s => arcReaches(CHARS.rojina, s, c.x, c.y));
    const byA = reachA.some(s => arcReaches(CHARS.arshia, s, c.x, c.y));
    const byRope = rings.some(r =>
      Math.hypot(r.x - c.x, r.y - c.y) < 230 &&
      reachA.some(s => r.x >= s.x1 - 230 && r.x <= s.x2 + 230 && r.y < s.y - 30));
    if (!byR && !byA && !byRope)
      bad('coin at (' + c.x + ',' + c.y + ') cannot be reached by either of them' +
          ' - which locks THE GHOST TRAIL out of the game');
  });

  /* ---------- 4. does anything block the way through a door? ---------- */
  (st.gates || []).forEach(g => {
    (st.crates || []).forEach((cr, i) => {
      if (cr.x < g.x + g.w && cr.x + cr.w > g.x)
        warn('crate' + i + ' starts in the mouth of gate ' + g.id);
    });
    /* a plate on the far side of its own door can never open it */
    const plates = (st.plates || []).filter(p => g.openBy.indexOf(p.id) >= 0);
    const spawnX = st.spawn.a[0];
    plates.forEach(p => {
      const gateSide = g.x > spawnX;
      const plateSide = p.x > g.x;
      if (gateSide && plateSide)
        bad('plate ' + p.id + ' (x' + p.x + ') is past gate ' + g.id +
            ' (x' + g.x + ') - you can only reach it once the door is already open');
    });
  });

  /* ---------- 5. movers: do they drive through the scenery? ---------- */
  (st.movers || []).forEach((m, i) => {
    const statics = (st.solids || []).filter(s => s.role !== 'lintel');
    const steps = 12;
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const mx = m.x + (m.bx - m.x) * t, my = m.y + (m.by - m.y) * t;
      const clash = statics.find(s =>
        mx < s.x + s.w - 2 && mx + m.w > s.x + 2 &&
        my < s.y + s.h - 2 && my + m.h > s.y + 2);
      if (clash) {
        bad('mover' + i + ' passes through solid ground at (' +
            Math.round(mx) + ',' + Math.round(my) + ')');
        break;
      }
    }
  });

  /* ---------- 6. hazards nobody can avoid ---------- */
  (st.hazards || []).forEach(h => {
    [['arshia', st.spawn.a], ['rojina', st.spawn.r]].forEach(([who, sp]) => {
      if (sp[0] > h.x - 30 && sp[0] < h.x + h.w + 30 && Math.abs(sp[1] - h.y) < 60)
        bad(who + ' spawns on top of spikes at x' + h.x);
    });
    (st.checkpoints || []).forEach(cp => {
      if (cp.x > h.x - 40 && cp.x < h.x + h.w + 40)
        bad('checkpoint at x' + cp.x + ' drops them onto the spikes at x' + h.x);
    });
  });

  /* ---------- 7. the exit ---------- */
  if (st.exit.x + st.exit.w > st.w)
    bad('the exit sticks out past the end of the level');
  (st.gates || []).forEach(g => {
    if (Math.abs(g.x - st.exit.x) < 60)
      warn('gate ' + g.id + ' sits on the exit');
  });

  const counted = (st.coins || []).length;
  if (fails + warns === before)
    console.log('   clean   ' + counted + ' coins, ' + (st.solids || []).length +
                ' solids, ' + (st.gates || []).length + ' doors');
});

/* ---------------- the silver that buys the hidden chapter ------------- */
console.log('\n=== THE SILVER GATE ===');
const plats = STAGES.filter(s => !s.secret && s.kind === 'platform');
const total = plats.reduce((n, s) => n + s.coins.length, 0);
console.log('   ' + plats.length + ' chapters, ' + total + ' dollars, every one of them required');
plats.forEach(s => console.log('     ' + s.name.padEnd(20) + s.coins.length));

console.log('\n--------------------------------------------');
if (fails) { console.log(fails + ' FAILURES, ' + warns + ' warnings'); process.exit(1); }
console.log('nothing is buried, stacked or out of reach  (' + warns + ' warnings)');
