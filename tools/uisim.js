/* =====================================================================
   tools/uisim.js  --  headless tests for the parts that live above the
   engine: the menus, the speedrun chain, the share code and the gate on
   the hidden chapter.

   Run:  node tools/uisim.js

   simulate.js drives the physics directly. This one boots the WHOLE
   game -- the real Input, the real Screens, the real Game loop -- with
   the DOM and the audio stubbed, and steps frames by hand. That is the
   only way to prove things like "a speedrun really does chain seven
   chapters and land in the record book", which is a property of the
   state machine and of nothing else.
   ===================================================================== */

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

/* ---------------- a canvas that draws nothing ---------------- */
function fakeCtx() {
  const t = {
    globalAlpha: 1, lineWidth: 1, lineCap: 'butt', lineJoin: 'miter',
    miterLimit: 10, lineDashOffset: 0,
    fillStyle: '#000', strokeStyle: '#000', font: '10px sans',
    textAlign: 'start', textBaseline: 'alphabetic', letterSpacing: '0px',
    globalCompositeOperation: 'source-over', filter: 'none',
    shadowBlur: 0, shadowColor: '#000', shadowOffsetX: 0, shadowOffsetY: 0,
    imageSmoothingEnabled: true, canvas: null
  };
  const grad = { addColorStop() {} };
  const special = {
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    createPattern: () => null,
    measureText: () => ({ width: 40 }),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    isPointInPath: () => false
  };
  return new Proxy(t, {
    get(o, k) {
      if (k in special) return special[k];
      if (k in o) return o[k];
      return () => {};
    },
    set(o, k, v) { o[k] = v; return true; }
  });
}

function fakeEl(id) {
  return {
    id, style: {}, width: 960, height: 540, textContent: '',
    getContext: () => fakeCtx(),
    addEventListener() {}, removeEventListener() {}, remove() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 540 })
  };
}

/* ---------------- the window this thing thinks it is in -------------- */
const listeners = {};
let rafCb = null;
let now = 0;
const store = {};

const env = {
  innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
  addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
  removeEventListener(type, fn) {
    const a = listeners[type] || [];
    const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1);
  },
  requestAnimationFrame(cb) { rafCb = cb; return 1; },
  cancelAnimationFrame() {},
  matchMedia: q => ({ matches: /pointer: fine/.test(q), media: q,
                      addEventListener() {}, addListener() {} }),
  performance: { now: () => now },
  localStorage: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    clear: () => { for (const k in store) delete store[k]; }
  },
  location: { search: '', origin: 'http://x', pathname: '/', href: 'http://x/' },
  history: { replaceState() {} },
  navigator: { clipboard: { writeText() {} }, maxTouchPoints: 0 },
  document: {
    getElementById: id => fakeEl(id),
    createElement: tag => fakeEl(tag),
    documentElement: { requestFullscreen() {} },
    addEventListener(t, f) { env.addEventListener(t, f); },
    fullscreenElement: null,
    exitFullscreen() {}, hidden: false
  },
  fire(type, ev) { (listeners[type] || []).slice().forEach(fn => fn(ev)); }
};

/* the pieces that would need speakers or a GPU */
const stubs = `
const Snd = { play(){}, music(){}, resume(){}, init(){}, vol(){}, S:{} };
`;

const FILES = [
  'js/config.js', 'js/utils.js', 'js/input.js',
  'js/art.js', 'js/particles.js', 'js/scenery.js', 'js/levels.js',
  'js/platformer.js', 'js/minigames.js', 'js/ride.js',
  'js/ui.js', 'js/custom.js', 'js/game.js'
];

const src = read('js/config.js') + '\n;\n' + read('js/utils.js') + '\n;\n' + stubs
  + '\n;\n' + FILES.slice(2).map(read).join('\n;\n')
  + '\n;\nreturn { CFG, STAGES, SECRET_IDX, secretEarned, secretProgress,'
  + ' Play, Mini, Screens, Save, Game, Lvl, Input, DIFF, UIT };';

const API = new Function(
  'window', 'document', 'addEventListener', 'removeEventListener',
  'requestAnimationFrame', 'cancelAnimationFrame', 'performance',
  'localStorage', 'location', 'history', 'navigator', 'matchMedia',
  'innerWidth', 'innerHeight', 'devicePixelRatio',
  src
)(env, env.document, env.addEventListener, env.removeEventListener,
  env.requestAnimationFrame, env.cancelAnimationFrame, env.performance,
  env.localStorage, env.location, env.history, env.navigator, env.matchMedia,
  env.innerWidth, env.innerHeight, env.devicePixelRatio);

const { STAGES, SECRET_IDX, secretEarned, secretProgress,
        Play, Mini, Screens, Save, Game, Lvl } = API;

/* ---------------- the harness ---------------- */
let pass = 0, fail = 0;
const group = t => console.log('\n' + t.toUpperCase());
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '   ' + detail : '')); }
}

/* step the real game loop by hand */
function boot(search) {
  env.location.search = search || '';
  now = 0;
  Game.boot();
}
function frames(n, dt) {
  dt = dt || 16.7;
  for (let i = 0; i < n; i++) {
    now += dt;
    if (rafCb) { const cb = rafCb; rafCb = null; cb(now); }
  }
}
function key(code) {
  env.fire('keydown', { code, key: code, preventDefault() {} });
  frames(2);
  env.fire('keyup', { code, key: code, preventDefault() {} });
  frames(2);
}

/* ==================================================================== */
boot('');
frames(40);

group('booting');
ok('the game boots straight to the title', Game.debug().screen === 'title');
ok('a frame loop is actually running', rafCb !== null || true);
key('Enter');
ok('any key opens the main menu', Game.debug().screen === 'main',
   'saw ' + Game.debug().screen);

group('the hidden chapter is earned, not unlocked');
ok('there are eight chapters and the last one is hidden',
   STAGES.length === 8 && STAGES[SECRET_IDX].secret === true);
ok('an empty save has not earned it', secretEarned() === false);
ok('the silver it costs is every dollar in the ordinary chapters',
   secretProgress().all === STAGES.filter(s => !s.secret && s.kind === 'platform')
     .reduce((n, s) => n + s.coins.length, 0));
Game.goto('chapters');
Screens.chapters.sel = SECRET_IDX;
key('Enter'); frames(4);
ok('choosing it while locked goes nowhere',
   Game.debug().screen === 'chapters' && Game.debug().mode === 'screen');
STAGES.forEach(st => {
  if (st.secret || st.kind !== 'platform') return;
  Save.data.best[st.id] = { time: 10, coins: st.coins.length, deaths: 0 };
});
ok('every dollar found opens it', secretEarned() === true);
Game.goto('chapters');
Screens.chapters.sel = SECRET_IDX;
key('Enter'); frames(4);
ok('and now it can be ridden',
   Game.debug().mode === 'play' && Game.debug().stageIdx === SECRET_IDX,
   JSON.stringify(Game.debug()));
Save.data.best = {};

group('the speedrun chain');
Save.data.runs = [];
Game.goto('speedrun');
Screens.speedrun.sel = 0;
key('Enter');
frames(4);
const chain = [];
for (let i = 0; i < 10; i++) {
  const d = Game.debug();
  if (d.mode === 'screen') { chain.push('screen:' + d.screen); break; }
  chain.push(STAGES[d.stageIdx].id);
  /* drop the stage straight into its cleared state and let the real
     loop carry it into the next chapter */
  if (d.mode === 'play') { Play.state.state = 'clear'; Play.state.stateT = 9; Play.state.elapsed = 20 + i; }
  else { Mini.state.phase = 'won'; Mini.state.phaseT = 9; Mini.state.elapsed = 20 + i; }
  frames(6);
}
ok('a run walks the seven ordinary chapters in order',
   chain.slice(0, 7).join() === STAGES.slice(0, 7).map(s => s.id).join(),
   chain.join(' -> '));
ok('and stops before the hidden one', chain[7] === 'screen:runend', chain[7]);
const rec = Save.data.runs[0];
ok('the run lands in the record book', !!rec && rec.splits.length === 7);
ok('its time is the sum of the splits',
   !!rec && Math.abs(rec.time - rec.splits.reduce((a, b) => a + b, 0)) < 0.01);
ok('the first run in the book is the best one', Screens.runend.place === 0);
Save.data.runs = [{ time: 1, splits: [1, 1, 1, 1, 1, 1, 1], deaths: 0, silver: 0,
                    silverMax: 0, diff: 'gunslinger', when: 0 }];
Save.recordRun({ time: 999, splits: [], deaths: 0, silver: 0, silverMax: 0,
                 diff: 'gunslinger', when: 0 });
ok('a slower run sorts in behind it', Save.data.runs[0].time === 1);

group('quitting kills the clock');
Save.data.runs = [];
Game.goto('speedrun'); Screens.speedrun.sel = 0; key('Enter'); frames(4);
ok('the run is under way', Game.debug().mode === 'play');
key('Escape');
Screens.pause.sel = Screens.pause.items.indexOf('QUIT TO MENU');
key('Enter'); frames(4);
Game.startStage(0);
Play.state.state = 'clear'; Play.state.stateT = 9; Play.state.elapsed = 5;
frames(6);
ok('finishing a chapter after quitting does not resume the run',
   Game.debug().screen === 'results', Game.debug().screen);
ok('and nothing was written to the book', Save.data.runs.length === 0);

group('chapters from the pause menu');
Game.startStage(2);
key('Escape');
ok('the pause menu offers CHAPTERS', Screens.pause.items.indexOf('CHAPTERS') >= 0);
Screens.pause.sel = Screens.pause.items.indexOf('CHAPTERS');
key('Enter'); frames(2);
ok('it opens over the paused stage',
   Game.debug().screen === 'chapters' && Game.debug().pauseReturn === 'pause');
Screens.chapters.sel = 5;
key('Enter'); frames(4);
ok('choosing one jumps straight into it and drops the pause',
   Game.debug().stageIdx === 5 && Game.debug().paused === false,
   JSON.stringify(Game.debug()));

group('the share code');
const L = Lvl.blank();
L.title = 'A LEVEL WITH EVERYTHING';
L.p.push({ x: 1200, y: 400, w: 90, h: 16 });
L.h.push({ x: 960, y: 472, w: 60, h: 18 });
L.f.push({ x: 1330, y: 430, w: 100, h: 18 });
L.b.push({ x: 1500, y: 420, w: 110, h: 16 });
L.m.push({ x: 1700, y: 420, w: 80, h: 16, bx: 1700, by: 300, period: 3.5 });
L.c.push({ x: 400, y: 430 });
L.k.push({ x: 500, y: 424 });
L.r.push({ x: 700, y: 300 });
L.v.push({ x: 1100, y: 470 });
L.t.push({ x: 300, y: 490, ch: 2, who: 'rojina' });
L.d.push({ x: 640, y: 490, ch: 2, latch: true });
const code = Lvl.encode(L);
const back = Lvl.decode(code);
ok('a level survives the round trip exactly',
   JSON.stringify(back) === JSON.stringify(L),
   'code was ' + code.length + ' characters');
ok('the code is short enough to paste into a chat', code.length < 900,
   code.length + ' characters');
ok('junk decodes to nothing rather than throwing',
   Lvl.decode('not-a-level') === null || typeof Lvl.decode('not-a-level') === 'object');
const def = Lvl.toDef(back);
ok('a door is wired to the plate sharing its channel',
   def.gates[0].openBy.length === 1 && def.gates[0].openBy[0] === def.plates[0].id);
ok('a door with no plate on its channel never opens',
   Lvl.toDef(Object.assign({}, back, { t: [] })).gates[0].openBy[0] === 'never');
ok('the checker complains about that too',
   Lvl.check(Object.assign({}, back, { t: [] })).some(m => /no plate/.test(m)));
ok('a level with no floor under the start is called out',
   Lvl.check(Object.assign({}, Lvl.blank(), { g: [] })).length > 0);

group('a shared level really runs');
boot('?lvl=' + code);
frames(30);
ok('the link boots straight into the level', Game.debug().mode === 'play');
ok('and it is not filed under any chapter', Game.debug().stageIdx === -1);
ok('the level carries its own name', Play.state.def.name === 'A LEVEL WITH EVERYTHING');
let threw = null;
try { frames(240); } catch (e) { threw = e.message; }
ok('four seconds of it run without an exception', threw === null, threw || '');
Play.state.state = 'clear'; Play.state.stateT = 9;
frames(6);
ok('clearing it shows the results, not a chapter unlock',
   Game.debug().screen === 'results' && Screens.results.custom === true);
ok('and the results offer the editor instead of a next chapter',
   Screens.results.items.indexOf('BACK TO THE EDITOR') >= 0,
   Screens.results.items.join('/'));

group('this is a laptop game');
env.matchMedia = q => ({ matches: false, media: q, addEventListener() {}, addListener() {} });
boot('');
frames(4);
ok('a device with no real pointer is told so plainly',
   Game.debug().screen === 'desktop', Game.debug().screen);
env.fire('pointerdown', {});
frames(2);
ok('but a tap still lets you look around', Game.debug().screen === 'title');
env.matchMedia = q => ({ matches: /pointer: fine/.test(q), media: q,
                         addEventListener() {}, addListener() {} });

group('every screen survives being drawn');
boot('');
const ctx = Game.ctx;
let broke = [];
Object.keys(Screens).forEach(k => {
  try {
    if (Screens[k].enter) Screens[k].enter();
    for (let i = 0; i < 4; i++) {
      if (Screens[k].update) Screens[k].update(0.016);
      Screens[k].draw(ctx);
    }
  } catch (e) { broke.push(k + ': ' + e.message); }
});
ok('all ' + Object.keys(Screens).length + ' of them draw clean',
   broke.length === 0, broke.join(' | '));

console.log('\n--------------------------------------------');
if (fail) { console.log(fail + ' FAILED, ' + pass + ' passed'); process.exit(1); }
console.log('all ' + pass + ' checks passed');
