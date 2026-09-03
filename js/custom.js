/* =====================================================================
   custom.js : the level editor and the share code behind `?lvl=`.

   A level is a plain object of arrays. `Lvl.encode` folds one into a
   short string you can hang off a URL, `Lvl.decode` unfolds it, and
   `Lvl.toDef` turns it into exactly the shape js/levels.js hands to
   Play.start -- so a shared level runs through the real engine, with
   the real physics, and nothing about it is a special case.

   Everything snaps to a 10px grid and every number is written in base
   36, which keeps a full level down to a link you can paste into a
   chat window.

   Doors and plates are wired by CHANNEL, not by hand-written ids: a
   door opens when every plate sharing its number is held down. One
   number is the whole mental model, and it is drawn on both pieces.
   ===================================================================== */

const Lvl = (() => {

  const GRID = 10;
  const snap = v => Math.round(v / GRID) * GRID;

  /* ---- a blank level: one street, both of them standing on it ---- */
  function blank() {
    return {
      title: 'UNTITLED TRAIL',
      g: [{ x: 0, y: 470, w: 900, h: 190 }],
      p: [], h: [], f: [], b: [], m: [],
      c: [], k: [], r: [], v: [], t: [], d: [],
      e: { x: 780, y: 370 },
      s: { x: 80, y: 428 }
    };
  }

  /* ---------------- the share code ---------------- */
  /* Every number goes in raw, not divided by the grid. Quantising them
     cost four pixels off every plank the first time round: a 16px board
     came back 20px thick. Base 36 is short enough without it.        */
  const n36 = v => Math.round(v).toString(36);
  const p36 = s => parseInt(s, 36);
  /* channels, owners and latches are small counts, not distances */
  const c36 = v => Math.round(v).toString(36);
  const q36 = s => parseInt(s, 36);

  const RECT = ['g', 'p', 'h', 'f', 'b'];
  const PT = ['c', 'k', 'r', 'v'];
  const WHO = ['any', 'arshia', 'rojina', 'crate'];

  function encode(L) {
    const parts = [];
    RECT.forEach(key => {
      if (!L[key].length) return;
      parts.push(key + ':' + L[key]
        .map(o => [o.x, o.y, o.w, o.h].map(n36).join(','))
        .join(';'));
    });
    PT.forEach(key => {
      if (!L[key].length) return;
      parts.push(key + ':' + L[key]
        .map(o => [o.x, o.y].map(n36).join(','))
        .join(';'));
    });
    if (L.m.length)
      parts.push('m:' + L.m.map(o =>
        [n36(o.x), n36(o.y), n36(o.w), n36(o.h), n36(o.bx), n36(o.by),
         c36(Math.round(o.period * 10))].join(',')).join(';'));
    if (L.t.length)
      parts.push('t:' + L.t.map(o =>
        [n36(o.x), n36(o.y), c36(o.ch), c36(WHO.indexOf(o.who) + 1 || 1)]
          .join(',')).join(';'));
    if (L.d.length)
      parts.push('d:' + L.d.map(o =>
        [n36(o.x), n36(o.y), c36(o.ch), c36(o.latch ? 1 : 0)].join(',')).join(';'));
    parts.push('e:' + n36(L.e.x) + ',' + n36(L.e.y));
    parts.push('s:' + n36(L.s.x) + ',' + n36(L.s.y));

    const body = '2~' + encodeURIComponent(L.title || '') + '~' + parts.join('|');
    return b64url(body);
  }

  function decode(code) {
    try {
      const body = unb64url(code);
      const bits = body.split('~');
      if (bits[0] !== '2') return null;
      const L = blank();
      L.title = decodeURIComponent(bits[1] || '') || 'SHARED TRAIL';
      RECT.concat(PT).forEach(k => { L[k] = []; });
      L.m = []; L.t = []; L.d = [];

      (bits.slice(2).join('~') || '').split('|').forEach(sec => {
        const i = sec.indexOf(':');
        if (i < 0) return;
        const key = sec.slice(0, i);
        const rows = sec.slice(i + 1).split(';').filter(Boolean).map(r => r.split(','));
        if (RECT.indexOf(key) >= 0)
          L[key] = rows.map(f => ({ x: p36(f[0]), y: p36(f[1]), w: p36(f[2]), h: p36(f[3]) }));
        else if (PT.indexOf(key) >= 0)
          L[key] = rows.map(f => ({ x: p36(f[0]), y: p36(f[1]) }));
        else if (key === 'm')
          L.m = rows.map(f => ({ x: p36(f[0]), y: p36(f[1]), w: p36(f[2]), h: p36(f[3]),
                                 bx: p36(f[4]), by: p36(f[5]), period: q36(f[6]) / 10 }));
        else if (key === 't')
          L.t = rows.map(f => ({ x: p36(f[0]), y: p36(f[1]), ch: q36(f[2]),
                                 who: WHO[q36(f[3]) - 1] || 'any' }));
        else if (key === 'd')
          L.d = rows.map(f => ({ x: p36(f[0]), y: p36(f[1]), ch: q36(f[2]),
                                 latch: q36(f[3]) === 1 }));
        else if (key === 'e') L.e = { x: p36(rows[0][0]), y: p36(rows[0][1]) };
        else if (key === 's') L.s = { x: p36(rows[0][0]), y: p36(rows[0][1]) };
      });
      return L;
    } catch (err) { return null; }
  }

  /* base64 that survives being pasted into a URL bar or a chat app */
  function b64url(s) {
    const bin = new TextEncoder().encode(s);
    let out = '';
    for (let i = 0; i < bin.length; i++) out += String.fromCharCode(bin[i]);
    return btoa(out).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function unb64url(s) {
    const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    const bin = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) bin[i] = b.charCodeAt(i);
    return new TextDecoder().decode(bin);
  }

  /* ---------------- level -> something Play.start can run ---------- */
  function bounds(L) {
    let mx = 960, my = 560;
    const all = [].concat(L.g, L.p, L.h, L.f, L.b, L.m);
    all.forEach(o => { mx = Math.max(mx, o.x + o.w); my = Math.max(my, o.y + o.h); });
    [].concat(L.c, L.k, L.r, L.v, [L.e], [L.s])
      .forEach(o => { mx = Math.max(mx, o.x + 80); my = Math.max(my, o.y + 80); });
    return { w: mx + 200, h: my + 120 };
  }

  function toDef(L) {
    const bd = bounds(L);
    const solids = [];
    L.g.forEach(o => solids.push({ x: o.x, y: o.y, w: o.w, h: o.h, type: 'ground' }));
    L.p.forEach(o => solids.push({ x: o.x, y: o.y, w: o.w, h: o.h, type: 'plank' }));

    /* every plate carries a channel; a door opens when all of its
       channel's plates are down */
    const plates = L.t.map((o, i) => ({ id: 'p' + i, x: o.x, y: o.y - 11,
                                        w: 70, who: o.who || 'any', ch: o.ch }));
    const gates = L.d.map((o, i) => {
      const ids = plates.filter(p => p.ch === o.ch).map(p => p.id);
      solids.push({ x: o.x, y: o.y - 250, w: 44, h: 160, type: 'ground', role: 'lintel' });
      return { id: 'd' + i, x: o.x, y: o.y - 90, w: 44, h: 90,
               openBy: ids.length ? ids : ['never'], mode: 'all', latch: !!o.latch };
    });
    plates.forEach(p => { delete p.ch; });

    return {
      id: 'custom', kind: 'platform', name: L.title || 'SHARED TRAIL',
      sub: 'Someone Else’s Trail', theme: 'gulch', music: 'gulch',
      story: 'Somebody built this and dared the two of you to finish it.',
      hint: 'Same rules. His rope and his shoulders, her light and her second jump.',
      custom: true,
      w: bd.w, h: bd.h, deathY: bd.h + 120, parTime: 90,
      spawn: { a: [L.s.x, L.s.y], r: [L.s.x + 50, L.s.y] },
      solids,
      movers: L.m.map(o => ({ x: o.x, y: o.y, w: o.w, h: o.h, ax: o.x, ay: o.y,
                              bx: o.bx, by: o.by, period: o.period || 4,
                              type: 'plank', ph: 0 })),
      phantoms: L.f.map(o => ({ x: o.x, y: o.y, w: o.w, h: o.h })),
      crumbles: L.b.map(o => ({ x: o.x, y: o.y, w: o.w, h: o.h })),
      crates: L.k.map(o => ({ x: o.x, y: o.y, w: 46, h: 46 })),
      plates, gates,
      rings: L.r.map(o => ({ x: o.x, y: o.y })),
      hazards: L.h.map(o => ({ x: o.x, y: o.y, w: o.w, h: o.h, type: 'spikes' })),
      coins: L.c.map(o => ({ x: o.x, y: o.y })),
      checkpoints: L.v.map(o => ({ x: o.x, y: o.y })),
      exit: { x: L.e.x, y: L.e.y, w: 60, h: 100 }
    };
  }

  /* ---------------- is it finishable at all? ---------------- */
  function check(L) {
    const out = [];
    if (!L.g.length && !L.p.length) out.push('nothing to stand on');
    const under = (x, y) => [].concat(L.g, L.p, L.m).some(
      o => x > o.x - 30 && x < o.x + o.w + 30 && o.y >= y - 10 && o.y < y + 260);
    if (!under(L.s.x, L.s.y)) out.push('no ground under the start');
    if (!under(L.e.x, L.e.y + 100)) out.push('no ground under the door out');
    L.d.forEach(d => {
      if (!L.t.some(t => t.ch === d.ch))
        out.push('door on channel ' + d.ch + ' has no plate');
    });
    if (L.e.x < L.s.x + 200) out.push('the way out is right next to the start');
    return out;
  }

  return { blank, encode, decode, toDef, check, bounds, snap, GRID, WHO };
})();


/* =====================================================================
   The editor itself.
   ===================================================================== */

const Mouse = (() => {
  const M = { x: 0, y: 0, down: false, hit: false, rhit: false, wheel: 0, on: false };
  function attach() {
    if (M.on) return;
    const cv = document.getElementById('game');
    if (!cv) return;
    M.on = true;
    const map = e => {
      const r = cv.getBoundingClientRect();
      M.x = (e.clientX - r.left) / r.width * CFG.W;
      M.y = (e.clientY - r.top) / r.height * CFG.H;
    };
    cv.addEventListener('mousemove', map);
    cv.addEventListener('mousedown', e => {
      map(e);
      if (e.button === 2) M.rhit = true; else { M.down = true; M.hit = true; }
    });
    addEventListener('mouseup', () => { M.down = false; });
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('wheel', e => { M.wheel += e.deltaY; e.preventDefault(); },
                        { passive: false });
  }
  function endFrame() { M.hit = false; M.rhit = false; M.wheel = 0; }
  return { M, attach, endFrame };
})();


Screens.editor = (() => {

  const TOOLS = [
    { k: 'g', name: 'GROUND', rect: true, col: '#7a5a3c' },
    { k: 'p', name: 'PLANK', rect: true, col: '#b98a4e' },
    { k: 'h', name: 'SPIKES', rect: true, col: '#b8455a', fixH: 18 },
    { k: 'f', name: 'GHOST', rect: true, col: '#6f7fd0' },
    { k: 'b', name: 'CRUMBLE', rect: true, col: '#9a7a5a' },
    { k: 'm', name: 'MOVER', rect: true, col: '#4ea39a' },
    { k: 'c', name: 'SILVER', rect: false, col: '#e2b043' },
    { k: 'k', name: 'CRATE', rect: false, col: '#c08a4a' },
    { k: 'r', name: 'ROPE RING', rect: false, col: '#cfa96a' },
    { k: 'v', name: 'CAMP', rect: false, col: '#57c2b4' },
    { k: 't', name: 'PLATE', rect: false, col: '#d98ab5' },
    { k: 'd', name: 'DOOR', rect: false, col: '#8a5fb0' },
    { k: 'e', name: 'WAY OUT', rect: false, col: '#f0d48a' },
    { k: 's', name: 'START', rect: false, col: '#8ad6a0' }
  ];

  const S = {
    /* the sheet opens looking at the street, not at empty sky: a fresh
       level's floor sits at y 470 and the status bar owns the bottom 74 */
    L: null, tool: 0, ch: 1, whoI: 0, camX: 0, camY: 150,
    drag: null, moverA: null, msg: '', msgT: 0, help: true
  };

  const w2s = x => x - S.camX;
  const s2w = x => x + S.camX;

  function enter() {
    Mouse.attach();
    if (!S.L) S.L = Lvl.blank();
    Snd.music('menu');
  }

  function toast(m) { S.msg = m; S.msgT = 2.4; }

  /* ---------------- input ---------------- */
  function update(dt) {
    const M = Mouse.M;
    S.msgT = Math.max(0, S.msgT - dt);

    /* pan */
    const pan = (Input.p(1, 'right') - Input.p(1, 'left') +
                 Input.p(2, 'right') - Input.p(2, 'left'));
    S.camX = Math.max(0, S.camX + pan * 700 * dt + M.wheel * 0.7);
    const vert = (Input.p(1, 'down') - Input.p(1, 'up') +
                  Input.p(2, 'down') - Input.p(2, 'up'));
    S.camY = clamp(S.camY + vert * 500 * dt, -200, 400);

    /* tool picking: 1-9 then 0, and Q/E to step through all of them */
    for (let i = 0; i < 10; i++)
      if (Input.hit('Digit' + ((i + 1) % 10))) { S.tool = i; Snd.play('move'); }
    /* Q already means 'back' everywhere else, so the tool steps live on
       the two keys next to it instead */
    if (Input.hit('Comma')) { S.tool = (S.tool + TOOLS.length - 1) % TOOLS.length; Snd.play('move'); }
    if (Input.hit('Period')) { S.tool = (S.tool + 1) % TOOLS.length; Snd.play('move'); }
    if (Input.hit('BracketLeft')) { S.ch = S.ch === 1 ? 4 : S.ch - 1; Snd.play('move'); }
    if (Input.hit('BracketRight')) { S.ch = S.ch === 4 ? 1 : S.ch + 1; Snd.play('move'); }
    if (Input.hit('KeyO')) { S.whoI = (S.whoI + 1) % Lvl.WHO.length; Snd.play('move'); }
    if (Input.hit('KeyH')) S.help = !S.help;

    if (Input.hit('KeyN')) { S.L = Lvl.blank(); S.camX = 0; toast('NEW SHEET'); Snd.play('back'); }
    if (Input.hit('KeyT')) { Snd.play('click'); return 'test'; }
    if (Input.hit('KeyC')) { copyLink(); }
    if (Input.hit('Escape')) { Snd.play('back'); return 'main'; }

    const mx = Lvl.snap(s2w(M.x)), my = Lvl.snap(M.y + S.camY);
    const inCanvas = M.y > 44 && M.y < CFG.H - 74;

    /* right button rubs things out wherever they are */
    if (M.rhit && inCanvas) erase(mx, my);

    const T = TOOLS[S.tool];
    if (T.rect) {
      if (M.hit && inCanvas) S.drag = { x: mx, y: my };
      if (S.drag && !M.down) {
        const r = rectOf(S.drag, mx, my, T);
        if (r.w >= 20 && r.h >= 10) {
          if (T.k === 'm') S.L.m.push({ x: r.x, y: r.y, w: r.w, h: 16,
                                        bx: r.x, by: r.y - 120, period: 4 });
          else S.L[T.k].push(r);
          Snd.play('click');
        }
        S.drag = null;
      }
    } else if (M.hit && inCanvas) {
      place(T.k, mx, my);
      Snd.play('click');
    }
    return null;
  }

  function rectOf(a, x, y, T) {
    const r = { x: Math.min(a.x, x), y: Math.min(a.y, y),
                w: Math.abs(x - a.x), h: Math.abs(y - a.y) };
    if (T.fixH) { r.h = T.fixH; }
    if (T.k === 'p' || T.k === 'f' || T.k === 'b') r.h = 16;
    return r;
  }

  function place(k, x, y) {
    if (k === 'e') { S.L.e = { x, y }; return; }
    if (k === 's') { S.L.s = { x, y }; return; }
    if (k === 't') { S.L.t.push({ x, y, ch: S.ch, who: Lvl.WHO[S.whoI] }); return; }
    if (k === 'd') { S.L.d.push({ x, y, ch: S.ch, latch: true }); return; }
    S.L[k].push({ x, y });
  }

  function erase(x, y) {
    const near = (o, w, h) => x >= o.x - 8 && x <= o.x + (w || 0) + 8 &&
                              y >= o.y - (h ? 0 : 24) && y <= o.y + (h || 24) + 8;
    let gone = false;
    ['g', 'p', 'h', 'f', 'b', 'm'].forEach(k => {
      for (let i = S.L[k].length - 1; i >= 0; i--) {
        const o = S.L[k][i];
        if (near(o, o.w, o.h)) { S.L[k].splice(i, 1); gone = true; }
      }
    });
    ['c', 'k', 'r', 'v', 't', 'd'].forEach(k => {
      for (let i = S.L[k].length - 1; i >= 0; i--) {
        const o = S.L[k][i];
        if (Math.abs(o.x - x) < 34 && Math.abs(o.y - y) < 40) { S.L[k].splice(i, 1); gone = true; }
      }
    });
    if (gone) Snd.play('back');
  }

  /* ---------------- the share link ---------------- */
  function link() {
    const base = location.origin + location.pathname;
    return base + '?lvl=' + Lvl.encode(S.L);
  }
  function copyLink() {
    const url = link();
    try {
      navigator.clipboard.writeText(url);
      toast('LINK COPIED  ·  ' + url.length + ' CHARACTERS');
    } catch (e) {
      toast('COPY FAILED - THE LINK IS IN THE ADDRESS BAR');
    }
    try { history.replaceState(null, '', '?lvl=' + Lvl.encode(S.L)); } catch (e) {}
    Snd.play('coin');
  }

  /* ---------------- drawing ---------------- */
  function draw(c) {
    const L = S.L;
    Sky.draw(c, 'gulch', S.camX * 0.5, 0, CFG.W, CFG.H, UIT);
    c.fillStyle = 'rgba(22,13,28,0.30)'; c.fillRect(0, 0, CFG.W, CFG.H);

    c.save();
    c.translate(-S.camX, -S.camY);

    /* the grid, so distances are readable while you build */
    c.save();
    c.globalAlpha = 0.16; c.strokeStyle = PAL.parch; c.lineWidth = 1;
    const x0 = Math.floor(S.camX / 40) * 40;
    for (let x = x0; x < S.camX + CFG.W + 40; x += 40) {
      c.beginPath(); c.moveTo(x, S.camY - 40); c.lineTo(x, S.camY + CFG.H + 40); c.stroke();
    }
    for (let y = -200; y < 700; y += 40) {
      c.beginPath(); c.moveTo(S.camX, y); c.lineTo(S.camX + CFG.W, y); c.stroke();
    }
    c.restore();

    const box = (o, col, label) => {
      c.fillStyle = col; c.globalAlpha = 0.75;
      c.fillRect(o.x, o.y, o.w, o.h);
      c.globalAlpha = 1;
      c.lineWidth = 2; c.strokeStyle = PAL.ink;
      c.strokeRect(o.x, o.y, o.w, o.h);
      if (label && o.w > 44)
        txt(c, label, o.x + o.w / 2, o.y + Math.min(o.h, 18) / 2 + 4,
            { size: 10, font: FONT.ui, fill: PAL.ink });
    };
    L.g.forEach(o => box(o, TOOLS[0].col));
    L.p.forEach(o => box(o, TOOLS[1].col));
    L.b.forEach(o => box(o, TOOLS[4].col, 'CRUMBLE'));
    L.f.forEach(o => { c.setLineDash([6, 5]); box(o, TOOLS[3].col, 'GHOST'); c.setLineDash([]); });
    L.h.forEach(o => {
      box(o, TOOLS[2].col);
      c.fillStyle = PAL.ink;
      for (let x = o.x + 4; x < o.x + o.w - 4; x += 12) {
        c.beginPath(); c.moveTo(x, o.y + o.h); c.lineTo(x + 5, o.y + 2);
        c.lineTo(x + 10, o.y + o.h); c.closePath(); c.fill();
      }
    });
    L.m.forEach(o => {
      c.strokeStyle = TOOLS[5].col; c.lineWidth = 2; c.setLineDash([5, 5]);
      c.beginPath();
      c.moveTo(o.x + o.w / 2, o.y + 8); c.lineTo(o.bx + o.w / 2, o.by + 8); c.stroke();
      c.setLineDash([]);
      box(o, TOOLS[5].col, 'MOVES');
      c.globalAlpha = 0.35; box({ x: o.bx, y: o.by, w: o.w, h: o.h }, TOOLS[5].col);
      c.globalAlpha = 1;
    });

    const pin = (o, col, glyph, sub) => {
      ell(c, o.x, o.y, 13, 13); ink(c, col, 2);
      txt(c, glyph, o.x, o.y + 4, { size: 12, font: FONT.title, fill: PAL.ink });
      if (sub) txt(c, sub, o.x, o.y + 26, { size: 9, font: FONT.ui, fill: col });
    };
    L.c.forEach(o => pin(o, TOOLS[6].col, '$'));
    L.k.forEach(o => box({ x: o.x, y: o.y, w: 46, h: 46 }, TOOLS[7].col, 'CRATE'));
    L.r.forEach(o => pin(o, TOOLS[8].col, 'O'));
    L.v.forEach(o => pin(o, TOOLS[9].col, 'C'));
    L.t.forEach(o => {
      box({ x: o.x, y: o.y - 11, w: 70, h: 11 }, TOOLS[10].col);
      txt(c, o.ch + '  ' + o.who.toUpperCase(), o.x + 35, o.y - 18,
          { size: 10, font: FONT.ui, fill: TOOLS[10].col });
    });
    L.d.forEach(o => {
      box({ x: o.x, y: o.y - 250, w: 44, h: 160 }, '#5a3a22');
      box({ x: o.x, y: o.y - 90, w: 44, h: 90 }, TOOLS[11].col);
      txt(c, String(o.ch), o.x + 22, o.y - 40,
          { size: 18, font: FONT.title, fill: PAL.parch, stroke: PAL.ink, lw: 3 });
    });
    box({ x: L.e.x, y: L.e.y, w: 60, h: 100 }, TOOLS[12].col, 'WAY OUT');
    pin(L.s, TOOLS[13].col, 'S', 'START');

    /* the rectangle being dragged right now */
    if (S.drag) {
      const M = Mouse.M;
      const r = rectOf(S.drag, Lvl.snap(s2w(M.x)), Lvl.snap(M.y + S.camY), TOOLS[S.tool]);
      c.globalAlpha = 0.5; box(r, TOOLS[S.tool].col); c.globalAlpha = 1;
    }
    c.restore();

    /* ---- the chrome around it ---- */
    c.fillStyle = 'rgba(22,13,28,0.82)'; c.fillRect(0, 0, CFG.W, 44);
    txt(c, 'LEVEL EDITOR', 16, 22,
        { size: 17, font: FONT.title, fill: PAL.gold, align: 'left', letter: 2 });
    txt(c, S.L.title, 176, 22, { size: 13, font: FONT.ui, fill: PAL.parch, align: 'left' });

    const T = TOOLS[S.tool];
    txt(c, 'TOOL', CFG.W - 300, 15, { size: 10, font: FONT.ui, fill: PAL.parchDk, align: 'left' });
    txt(c, T.name, CFG.W - 300, 31,
        { size: 15, font: FONT.title, fill: T.col, align: 'left', letter: 1 });
    if (T.k === 't' || T.k === 'd') {
      txt(c, 'CHANNEL ' + S.ch, CFG.W - 150, 15,
          { size: 12, font: FONT.ui, fill: PAL.gold, align: 'left' });
      if (T.k === 't')
        txt(c, 'HELD BY ' + Lvl.WHO[S.whoI].toUpperCase(), CFG.W - 150, 31,
            { size: 11, font: FONT.ui, fill: PAL.parch, align: 'left' });
    } else {
      txt(c, 'X ' + Math.round(s2w(Mouse.M.x)), CFG.W - 150, 22,
          { size: 12, font: FONT.ui, fill: PAL.parchDk, align: 'left' });
    }

    /* problems, called out while you build rather than after you share */
    const bad = Lvl.check(S.L);
    c.fillStyle = 'rgba(22,13,28,0.82)';
    c.fillRect(0, CFG.H - 74, CFG.W, 74);
    if (bad.length)
      txt(c, 'PROBLEM  ·  ' + bad[0].toUpperCase(), CFG.W / 2, CFG.H - 58,
          { size: 13, font: FONT.ui, fill: PAL.red, letter: 1 });
    else
      txt(c, 'READY TO RIDE  ·  ' + Lvl.encode(S.L).length + ' CHARACTER LINK',
          CFG.W / 2, CFG.H - 58, { size: 13, font: FONT.ui, fill: PAL.teal, letter: 1 });

    if (S.help)
      txt(c, 'DRAG to build  ·  RIGHT-CLICK to erase  ·  , . or 1-0 tool  ·  ' +
             '[ ] channel  ·  O owner  ·  T test  ·  C copy link  ·  ' +
             'N new  ·  H hide  ·  ESC out',
          CFG.W / 2, CFG.H - 32, { size: 11, font: FONT.ui, fill: PAL.parchDk });

    if (S.msgT > 0) {
      c.save(); c.globalAlpha = clamp(S.msgT, 0, 1);
      txt(c, S.msg, CFG.W / 2, 78,
          { size: 16, font: FONT.title, fill: PAL.gold, stroke: PAL.ink, lw: 4, letter: 1 });
      c.restore();
    }
    Mouse.endFrame();
  }

  return { enter, update, draw, S,
           get level() { return S.L; },
           set level(v) { S.L = v; } };
})();
