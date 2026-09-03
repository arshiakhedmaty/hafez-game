/* =====================================================================
   tools/bundle.js  --  fold the whole game into one self-contained file.

   Run:  node tools/bundle.js

   The game has no images and no audio files, so everything really does
   fit in a single HTML document. Produces two things:

     dist/index.html      a normal standalone page (open it directly)
     dist/artifact.html   the same page without the html/head/body
                          wrapper, for hosts that supply their own

   Only the Google Fonts link stays external, and the page falls back to
   system serif/monospace if it cannot be reached.
   ===================================================================== */

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');

const CSS = ['css/style.css'];
const JS = [
  'js/config.js', 'js/utils.js', 'js/input.js', 'js/audio.js', 'js/art.js',
  'js/particles.js', 'js/scenery.js', 'js/levels.js', 'js/platformer.js',
  'js/minigames.js', 'js/ui.js', 'js/game.js'
];

const read = f => fs.readFileSync(path.join(root, f), 'utf8');
/* a closing script tag inside a string literal would end the block early */
const safe = s => s.replace(/<\/script>/gi, '<\\/script>');

const css = CSS.map(read).join('\n');
const js = JS.map(f => '/* ===== ' + f + ' ===== */\n' + safe(read(f))).join('\n;\n');

const head = `<title>Hafez Game</title>
<meta name="description" content="A two-player old-west co-op game for one keyboard.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Rye&family=Special+Elite&display=swap" rel="stylesheet">
<style>
${css}
</style>`;

const body = `<div id="frame">
  <canvas id="game" width="960" height="540" aria-label="Hafez Game"></canvas>
  <div id="boot">
    <div class="bootTitle">HAFEZ GAME</div>
    <div class="bootSub">ARSHIA &amp; ROJINA</div>
    <div class="bootHint">saddling up&hellip;</div>
  </div>
</div>
<script>
${js}
</script>`;

fs.mkdirSync(dist, { recursive: true });

fs.writeFileSync(path.join(dist, 'index.html'),
  '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n' +
  '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n' +
  head + '\n</head>\n<body>\n' + body + '\n</body>\n</html>\n');

fs.writeFileSync(path.join(dist, 'artifact.html'), head + '\n' + body + '\n');

const size = f => (fs.statSync(path.join(dist, f)).size / 1024).toFixed(0) + ' KB';
console.log('dist/index.html     ' + size('index.html'));
console.log('dist/artifact.html  ' + size('artifact.html'));
