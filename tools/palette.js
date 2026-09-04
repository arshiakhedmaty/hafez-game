/* =====================================================================
   tools/palette.js  --  is anything in this game invisible?

   Run:  node tools/palette.js

   Sergio Leone's cinematographer, on shooting a western: "you can't have
   too many colours -- red, brown, beige, earthy, off-white." The look
   the references describe is a bleached, desaturated warm palette under
   hard light, with deep shadows, and saturated colour spent SPARINGLY on
   the things that matter.

   This game is anime-bright rather than sun-bleached, which was a choice,
   so the useful question is not "does it match a 1966 Techniscope print"
   but the one underneath it: does the loud colour land on the things the
   players need to see, and can every important shape be told apart from
   the backgrounds it actually appears against?

   Two things this measures that a naive check gets wrong:

     - CONTRAST IS NOT LUMINANCE. The WCAG ratio is built for text, where
       lightness carries the letterform. A red cape on purple ground is
       obvious to the eye and terrible by that ratio. So the comparison
       here is CIE dE, which counts hue and chroma too, and luminance is
       only reported alongside it.
     - A CRATE IS NEVER IN THE SKY. Every shape is checked against the
       backgrounds it can genuinely be seen against, not all of them.

   Every shape is drawn as a coloured body inside a dark ink outline, so
   it gets two chances against any background and only has to win one.
   ===================================================================== */

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

const { PAL, LOOK } = new Function(read('js/config.js') + ';return { PAL, LOOK };')();

/* ---------------- colour maths ---------------- */
const rgb = hex => {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16 & 255, n >> 8 & 255, n & 255];
};
const chan = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const lum = hex => { const [r, g, b] = rgb(hex); return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b); };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

function lab(hex) {
  const [R, G, B] = rgb(hex).map(chan);
  let x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  let y = (R * 0.2126 + G * 0.7152 + B * 0.0722);
  let z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = t => t > 0.008856 ? Math.cbrt(t) : (7.787 * t) + 16 / 116;
  x = f(x); y = f(y); z = f(z);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
function dE(a, b) {
  const p = lab(a), q = lab(b);
  return Math.sqrt((p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2);
}
function hsl(hex) {
  const [r0, g0, b0] = rgb(hex);
  const r = r0 / 255, g = g0 / 255, b = b0 / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d) h = mx === r ? 60 * (((g - b) / d) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  return { h: Math.round((h + 360) % 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

/* dE 2.3 is the smallest difference an eye can see at all. For a solid
   shape tens of pixels across, 22 is comfortably "obviously not the
   same colour" without demanding the cartoon contrast of a warning sign. */
const FLOOR = 22;

/* ---------------- the backgrounds each thing can be seen against ------ */
const SKY = ['skyTop', 'skyHigh', 'skyMid', 'skyLow', 'skyHaze', 'sunCore'];
const FAR = ['mesaNear', 'mesaFar'];
const FLOOR_OF = ['ground', 'groundTop', 'sand', 'wood'];

const THINGS = [
  /* silver hangs in the air over everything */
  { name: 'silver dollar', body: PAL.gold, on: SKY.concat(FAR, FLOOR_OF) },
  /* these sit on a surface, so the sky is not behind them */
  { name: 'spikes', body: '#8fa06a', on: FLOOR_OF },
  { name: 'pressure plate', body: PAL.metal, on: ['groundTop', 'sand', 'wood'] },
  { name: 'crate', body: PAL.wood, on: ['ground', 'groundTop', 'sand'] },
  { name: 'checkpoint flag', body: PAL.teal, on: FLOOR_OF.concat(SKY) },
  /* these hang over a gap, so it is sky and rock behind them */
  { name: 'lasso ring', body: PAL.parchDk, on: SKY.concat(FAR) },
  { name: 'ghost timber', body: PAL.teal, on: SKY.concat(FAR, ['ground']) },
  /* the two of them, and the red that marks him at a glance */
  { name: 'ARSHIA coat', body: LOOK.arshia.vest, on: SKY.concat(FAR, FLOOR_OF) },
  { name: 'his cape', body: LOOK.arshia.cape, on: SKY.concat(FAR, FLOOR_OF) },
  { name: 'ROJINA dress', body: LOOK.rojina.dress, on: SKY.concat(FAR, FLOOR_OF) },
  /* hearts fly, and also sit in the HUD on its own dark bar */
  { name: 'a heart', body: PAL.red, on: SKY.concat(FAR, ['ink']) }
];

/* ---------------- the report ---------------- */
let fail = 0, rescued = 0, checks = 0, tightest = { d: 1e9 };
console.log('EVERY SHAPE AGAINST THE BACKGROUNDS IT CAN ACTUALLY APPEAR ON');
console.log('  a shape passes if its body OR its ink outline clears dE ' + FLOOR + '\n');

THINGS.forEach(t => {
  const trouble = [];
  t.on.forEach(key => {
    const back = PAL[key];
    if (!back) throw new Error('no palette entry called ' + key);
    checks++;
    const db = dE(t.body, back), de = dE(PAL.ink, back);
    const best = Math.max(db, de);
    if (best < tightest.d) tightest = { d: best, thing: t.name, back: key };
    if (best < FLOOR)
      trouble.push('INVISIBLE on ' + key + '  body dE ' + db.toFixed(0) +
                   ', outline dE ' + de.toFixed(0));
    else if (db < FLOOR) rescued++;
  });
  fail += trouble.length;
  console.log('  ' + (trouble.length ? 'FAIL' : 'ok  ') + ' ' + t.name);
  trouble.forEach(l => console.log('         ' + l));
});

console.log('\n  ' + checks + ' pairs checked');
console.log('  ' + rescued + ' of them the body alone would lose - the dark outline carries them.');
console.log('  closest call: ' + tightest.thing + ' on ' + tightest.back +
            ' at dE ' + tightest.d.toFixed(0));

/* ---------------- is the loud colour spent on the right things? ------- */
const SIGNAL = ['gold', 'red', 'redDk', 'teal', 'sun'];
const rows = Object.keys(PAL)
  .filter(k => /^#[0-9a-f]{6}$/i.test(PAL[k]))
  .map(k => Object.assign({ k, signal: SIGNAL.indexOf(k) >= 0 }, hsl(PAL[k])));
const mean = a => Math.round(a.reduce((n, r) => n + r.s, 0) / a.length);
const sig = mean(rows.filter(r => r.signal)), sc = mean(rows.filter(r => !r.signal));

console.log('\nWHERE THE LOUD COLOUR GOES');
console.log('  gameplay colours average ' + sig + '% saturation');
console.log('  scenery colours average  ' + sc + '%');
if (sig > sc) console.log('  ok   the saturated end belongs to the things you have to see');
else { console.log('  FAIL the scenery is shouting louder than the gameplay'); fail++; }

const ceiling = Math.max.apply(null, rows.filter(r => r.signal).map(r => r.s));
const loud = rows.filter(r => !r.signal && r.s >= ceiling);
if (loud.length)
  console.log('  note  as loud as anything in the game: ' +
              loud.map(r => r.k + ' ' + r.s + '%').join(', ') +
              ' - the sun and the highlights, which is where a western puts its light');

console.log('  note  ' + new Set(rows.map(r => Math.round(r.h / 30))).size +
            ' of 12 hue families in play. A western shot on film uses four or');
console.log('        five; this one is anime-bright on purpose.');

console.log('\n--------------------------------------------');
if (fail) { console.log(fail + ' PROBLEMS'); process.exit(1); }
console.log('nothing in this game is invisible');
