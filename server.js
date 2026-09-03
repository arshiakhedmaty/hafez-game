/* Tiny static file server for local development / preview.
   Run:  node server.js      then open http://localhost:5173/          */
const http = require('http'), fs = require('fs'), path = require('path'), url = require('url');

const ROOT = __dirname;
const PORT = process.env.PORT || 5173;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2'
};

http.createServer((req, res) => {
  let p = decodeURIComponent(url.parse(req.url).pathname);

  /* Development only: tools/art.html renders the share images with the
     game's own renderer and posts them back here, so the cover art can
     never drift out of step with what the game actually looks like.
     Local requests only, png only, and only into assets/.            */
  const save = /^\/__dev-save\/([a-z0-9._-]+\.png)$/.exec(p);
  if (save && req.method === 'POST') {
    const from = req.socket.remoteAddress || '';
    if (!/^(::1|::ffff:127\.|127\.)/.test(from)) { res.writeHead(403); return res.end('local only'); }
    let body = '';
    req.on('data', ch => { body += ch; if (body.length > 12e6) req.destroy(); });
    req.on('end', () => {
      const b64 = body.replace(/^data:image\/png;base64,/, '');
      fs.mkdirSync(path.join(ROOT, 'assets'), { recursive: true });
      fs.writeFileSync(path.join(ROOT, 'assets', save[1]), Buffer.from(b64, 'base64'));
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('saved assets/' + save[1]);
      console.log('wrote assets/' + save[1] + '  ' + (b64.length / 1365).toFixed(0) + ' KB');
    });
    return;
  }

  if (p === '/') p = '/index.html';
  const file = path.join(ROOT, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('404 ' + p); }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(data);
  });
}).listen(PORT, () => console.log('HAFEZ GAME dev server -> http://localhost:' + PORT + '/'));
