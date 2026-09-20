/* tools/payload.js : collect the shippable files into one JSON blob so the
   whole game can be handed to a deploy step in a single piece.          */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

const { GAME } = require('./files');
const FILES = [
  'index.html', 'preview.html', 'README.md', 'vercel.json', '.gitignore',
  'server.js', 'css/style.css'
].concat(GAME).concat([
  'tools/files.js', 'tools/validate.js', 'tools/simulate.js',
  'tools/uisim.js', 'tools/audit.js', 'tools/playthrough.js', 'tools/payload.js'
]);

const out = FILES.map(f => ({
  file: f,
  data: fs.readFileSync(path.join(root, f), 'utf8')
}));

fs.writeFileSync(path.join(root, '.deploy-payload.json'), JSON.stringify(out));
console.log('files: ' + out.length);
console.log('bytes: ' + out.reduce((n, f) => n + f.data.length, 0));
