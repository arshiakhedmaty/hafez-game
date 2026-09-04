/* =====================================================================
   tools/build-itch.js  --  package the game for itch.io.

   Run:  node tools/build-vercel.js && node tools/build-itch.js

   itch.io serves an HTML game out of a ZIP whose root contains an
   index.html. The single-file build is already that, so this is mostly
   a matter of putting it in the right shape and writing down every
   number the upload form is going to ask for, so nobody has to guess
   at the embed size or the cover dimensions on the day.
   ===================================================================== */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/* A one-entry ZIP, written by hand. `tar -a` is bsdtar on Windows but GNU
   tar under Git Bash, where it reads "D:\..." as a remote host and gives
   up; PowerShell's Compress-Archive is not on a mac. Forty lines of
   deflate and a CRC table depend on nothing at all. */
const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return buf => {
    let c = -1;
    for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
})();

function zipOne(name, data) {
  const body = zlib.deflateRawSync(data, { level: 9 });
  const nm = Buffer.from(name, 'utf8');
  const crc = CRC(data);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);              /* version needed        */
  local.writeUInt16LE(0, 6);               /* flags                 */
  local.writeUInt16LE(8, 8);               /* deflate               */
  local.writeUInt16LE(0, 10);              /* time                  */
  local.writeUInt16LE(0x21, 12);           /* date: a valid 1980    */
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(body.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nm.length, 26);
  local.writeUInt16LE(0, 28);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);            /* version made by       */
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt16LE(0, 12);
  central.writeUInt16LE(0x21, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(body.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(nm.length, 28);
  central.writeUInt32LE(0, 42);            /* offset of local header */

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + nm.length, 12);
  end.writeUInt32LE(local.length + nm.length + body.length, 16);

  return Buffer.concat([local, nm, body, central, nm, end]);
}

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const out = path.join(dist, 'itch');

const src = path.join(dist, 'vercel-index.html');
if (!fs.existsSync(src))
  throw new Error('run tools/build-vercel.js first - dist/vercel-index.html is missing');

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(src, path.join(out, 'index.html'));

const zip = path.join(dist, 'hafez-game-itch.zip');
fs.writeFileSync(zip, zipOne('index.html', fs.readFileSync(src)));

const kb = n => (n / 1024).toFixed(1) + ' KB';
const assets = fs.existsSync(path.join(root, 'assets'))
  ? fs.readdirSync(path.join(root, 'assets')) : [];

console.log('');
console.log('  upload            dist/hafez-game-itch.zip   ' + kb(fs.statSync(zip).size));
console.log('  contains          index.html                 ' + kb(fs.statSync(src).size));
console.log('');
console.log('  Kind of project   HTML');
console.log('  tick              "This file will be played in the browser"');
console.log('  Viewport          960 x 540');
console.log('  Embed             Embed in page, fullscreen button ON,');
console.log('                    scrollbars OFF, mobile-friendly OFF');
console.log('  Cover image       assets/itch-cover.png  (630 x 500, required)');
console.log('  Screenshots       ' + assets.filter(f => /^shot-/.test(f)).join(', '));
console.log('  Page text         dist/itch-page.md');
console.log('');
console.log('  Mobile-friendly stays OFF on purpose: this is a two-player');
console.log('  game for one keyboard, and the game says so on a phone.');
