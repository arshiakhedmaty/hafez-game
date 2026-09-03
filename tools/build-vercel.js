/* =====================================================================
   tools/build-vercel.js  --  produce a single, self-contained page small
   enough to hand to a deploy step in one piece.

   Run:  node tools/build-vercel.js
   Out:  dist/vercel-index.html

   The game is ~210 KB of source. Minified and gzipped it is ~38 KB, so
   the page ships the compressed bundle as base64 and inflates it in the
   browser with DecompressionStream. No CDN, no external script, no build
   step on the host: one HTML file that works from any static server.
   ===================================================================== */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
fs.mkdirSync(dist, { recursive: true });

const JS = [
  'js/config.js', 'js/utils.js', 'js/input.js', 'js/audio.js', 'js/art.js',
  'js/particles.js', 'js/scenery.js', 'js/levels.js', 'js/platformer.js',
  'js/minigames.js', 'js/ride.js', 'js/ui.js', 'js/custom.js', 'js/game.js'
];

/* the bundle normally boots on DOMContentLoaded; once it is inflated that
   event has already fired, so boot it directly instead */
const BOOT = '\n;if(document.readyState!=="loading"){try{Game.boot();}catch(e){}}\n';

const raw = JS.map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n;\n') + BOOT;
fs.writeFileSync(path.join(dist, '_bundle.js'), raw);

/* Windows needs the shell to resolve npx.cmd, and the shell then needs the
   paths quoted because this project lives in a directory with a space. */
const win = process.platform === 'win32';
const NPX = win ? 'npx.cmd' : 'npx';
const q = s => (win ? '"' + s + '"' : s);
const min = f => {
  const src = path.join(dist, f);
  const out = path.join(dist, f.replace('.', '.min.'));
  execFileSync(NPX, ['--yes', 'esbuild', q(src),
    '--minify', '--target=es2019', q('--outfile=' + out),
    '--log-level=error'], { stdio: 'inherit', shell: win });
  return fs.readFileSync(out, 'utf8');
};

const js = min('_bundle.js');
fs.writeFileSync(path.join(dist, '_style.css'), fs.readFileSync(path.join(root, 'css/style.css')));
const css = min('_style.css').trim();

/* compress and wrap the base64 so the page stays readable */
const gz = zlib.gzipSync(Buffer.from(js, 'utf8'), { level: 9 });
const b64 = gz.toString('base64');
if (/<\/script>/i.test(b64)) throw new Error('payload would close the script block');
const payload = b64.replace(/(.{110})/g, '$1\n');

const loader = `(async function () {
  var boot = document.getElementById('boot');
  try {
    var el = document.getElementById('pl');
    var b64 = el.textContent.replace(/[^A-Za-z0-9+/=]/g, '');
    var bin = Uint8Array.from(atob(b64), function (c) { return c.charCodeAt(0); });
    var stream = new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'));
    var buf = await new Response(stream).arrayBuffer();
    (0, eval)(new TextDecoder().decode(buf));
  } catch (e) {
    console.error(e);
    if (boot) boot.innerHTML =
      '<div class="bootTitle">HAFEZ GAME</div>' +
      '<div class="bootHint">This browser could not start the game. ' +
      'Try Chrome, Edge, Safari or Firefox.</div>';
  }
})();`;

const S = '<' + 'script', ES = '<' + '/script>';
const html = [
  '<!DOCTYPE html>',
  '<html lang="en">',
  '<head>',
  '<meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">',
  '<title>Hafez Game</title>',
  '<meta name="description" content="A two-player old-west co-op game for one keyboard. Arshia on WASD, Rojina on the arrow keys.">',
  '<meta property="og:title" content="Hafez Game">',
  '<meta property="og:description" content="A two-player old-west co-op game for one keyboard.">',
  '<meta property="og:image" content="https://arshiakhedmaty.github.io/hafez-game/assets/og-card.png">',
  '<meta name="twitter:card" content="summary_large_image">',
  '<meta name="twitter:image" content="https://arshiakhedmaty.github.io/hafez-game/assets/og-card.png">',
  '<link href="https://fonts.googleapis.com/css2?family=Rye&family=Special+Elite&display=swap" rel="stylesheet">',
  '<style>' + css + '</style>',
  '</head>',
  '<body>',
  '<div id="frame"><canvas id="game" width="960" height="540" aria-label="Hafez Game"></canvas>',
  '<div id="boot"><div class="bootTitle">HAFEZ GAME</div><div class="bootSub">ARSHIA &amp; ROJINA</div>',
  '<div class="bootHint">saddling up&hellip;</div></div></div>',
  S + ' id="pl" type="text/plain">',
  payload,
  ES,
  S + '>',
  loader,
  ES,
  '</body>',
  '</html>'
].join('\n');

const out = path.join(dist, 'vercel-index.html');
fs.writeFileSync(out, html);

/* prove the payload round-trips before anyone tries to deploy it */
const back = zlib.gunzipSync(Buffer.from(b64, 'base64')).toString('utf8');
if (back !== js) throw new Error('payload does not round-trip');
new Function(back);

console.log('minified js   ' + (js.length / 1024).toFixed(1) + ' KB');
console.log('gzipped       ' + (gz.length / 1024).toFixed(1) + ' KB');
console.log('page          ' + (html.length / 1024).toFixed(1) + ' KB');
console.log('payload round-trips and parses: ok');
console.log('wrote ' + path.relative(root, out));
