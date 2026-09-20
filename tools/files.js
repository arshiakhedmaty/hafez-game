/* =====================================================================
   tools/files.js  --  what the game is made of, and in what order.

   This list used to be written out by hand in nine separate places:
   index.html, three build scripts and five test tools. Adding js/ride.js
   and then js/custom.js meant finding and editing all nine, and missing
   one produced a build that loaded fine and then failed at the first
   call into the file nobody had included.

   Everything now reads it from here, and `checkIndexHtml` proves the
   page agrees, because the page is the one place that cannot require().
   ===================================================================== */

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

/* every script the page loads, in load order */
const GAME = [
  'js/config.js',
  'js/utils.js',
  'js/input.js',
  'js/audio.js',
  'js/art.js',
  'js/particles.js',
  'js/scenery.js',
  'js/levels.js',
  'js/platformer.js',
  'js/minigames.js',
  'js/ride.js',
  'js/ui.js',
  'js/custom.js',
  'js/game.js'
];

/* the tables a static checker needs, with nothing that draws or sounds */
const DATA = ['js/config.js', 'js/utils.js', 'js/levels.js'];

/* the stage engines, which need the stubs below standing in for the
   drawing, the audio and the keyboard */
const ENGINE = ['js/platformer.js', 'js/minigames.js', 'js/ride.js'];

/* Everything visual or audible, replaced by something that does nothing.
   Input is real in the sense that it reads two Sets the harness owns, so
   a test can hold and release keys exactly as a player does. */
const STUBS = `
const Snd = { play(){}, music(){}, resume(){}, init(){}, vol(){}, S:{} };
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

const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const join = list => list.map(read).join('\n;\n');

/* the engine, loaded against the stubs, ready to be driven frame by
   frame. Returns whatever `exports` names. */
function loadEngine(held, pressed, exports) {
  const src = join(DATA) + '\n;\n' + STUBS + '\n;\n' + join(ENGINE) +
              '\n;\nreturn { ' + exports.join(', ') + ' };';
  const Save = { data: { best: {}, runs: [] } };
  return new Function('__held', '__pressed', 'Save', src)(held, pressed, Save);
}

/* index.html cannot require() this file, so prove it agrees with it */
function checkIndexHtml() {
  const html = read('index.html');
  const found = [];
  html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) => found.push(src));
  const missing = GAME.filter(f => found.indexOf(f) < 0);
  const extra = found.filter(f => GAME.indexOf(f) < 0);
  const order = found.join(',') === GAME.join(',');
  return { ok: !missing.length && !extra.length && order, missing, extra, order, found };
}

module.exports = { GAME, DATA, ENGINE, STUBS, read, join, loadEngine, checkIndexHtml, root };
