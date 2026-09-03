/* =====================================================================
   ui.js : save data, the wanted-poster menu chrome, and every screen
   that is not actual play.
   ===================================================================== */

/* ------------------------------------------------------------------ */
const Save = (() => {
  const blank = () => ({
    /* every chapter open from the start: this is a game two people play
       on one couch, and being told to come back later is not the point */
    unlocked: STAGES.length,
    best: {},              /* stageId -> {time, coins, deaths} */
    difficulty: 'gunslinger',
    music: 0.55, sfx: 0.75, master: 0.8,
    shake: true, seenIntro: false, totalRevives: 0
  });
  let d = blank();
  function load() {
    try {
      const raw = localStorage.getItem(CFG.SAVE_KEY);
      if (raw) d = Object.assign(blank(), JSON.parse(raw));
      d.unlocked = STAGES.length;   /* honour the open-chapters rule for old saves too */
    } catch (e) { d = blank(); }
    Snd.S.music = d.music; Snd.S.sfx = d.sfx; Snd.S.master = d.master;
    return d;
  }
  function save() { try { localStorage.setItem(CFG.SAVE_KEY, JSON.stringify(d)); } catch (e) {} }
  function reset() { d = blank(); save(); Snd.S.music = d.music; Snd.S.sfx = d.sfx; Snd.vol(); }
  function record(stageId, res) {
    const b = d.best[stageId];
    if (!b || res.time < b.time) d.best[stageId] = { time: res.time, coins: res.coins, deaths: res.deaths };
    else if (res.coins > b.coins) b.coins = res.coins;
    save();
  }
  return { get data() { return d; }, load, save, reset, record };
})();

/* ------------------------------------------------------------------ */
/* Shared chrome: wood signs, wanted posters, rope dividers            */
const Chrome = {
  woodSign(c, x, y, w, h, tone) {
    c.save();
    /* two hanging chains */
    c.strokeStyle = PAL.metalDk; c.lineWidth = 2;
    [x + w * 0.18, x + w * 0.82].forEach(px => {
      c.beginPath(); c.moveTo(px, y - 26); c.lineTo(px, y); c.stroke();
    });
    rr(c, x, y, w, h, 6);
    ink(c, tone || PAL.wood, 3, PAL.woodDark);
    /* grain */
    c.save(); c.beginPath(); rr(c, x, y, w, h, 6); c.clip();
    c.strokeStyle = 'rgba(22,13,28,0.16)'; c.lineWidth = 1.2;
    for (let i = 1; i < h / 9; i++) {
      c.beginPath();
      c.moveTo(x, y + i * 9 + Math.sin(i) * 2);
      c.bezierCurveTo(x + w * 0.4, y + i * 9 - 2, x + w * 0.6, y + i * 9 + 3, x + w, y + i * 9);
      c.stroke();
    }
    c.restore();
    /* corner nails */
    [[x + 9, y + 9], [x + w - 9, y + 9], [x + 9, y + h - 9], [x + w - 9, y + h - 9]]
      .forEach(([nx, ny]) => { ell(c, nx, ny, 2.6, 2.6); ink(c, PAL.metal, 1); });
    c.restore();
  },

  poster(c, x, y, w, h) {
    c.save();
    c.translate(x, y);
    c.rotate(-0.012);
    /* torn paper edge */
    c.beginPath();
    const R = srand(4);
    c.moveTo(0, 0);
    for (let i = 0; i <= w; i += 22) c.lineTo(i, R() * 3);
    for (let i = 0; i <= h; i += 22) c.lineTo(w - R() * 3, i);
    for (let i = w; i >= 0; i -= 22) c.lineTo(i, h - R() * 3);
    for (let i = h; i >= 0; i -= 22) c.lineTo(R() * 3, i);
    c.closePath();
    c.fillStyle = PAL.parch; c.fill();
    c.strokeStyle = PAL.parchDk; c.lineWidth = 2; c.stroke();
    /* stain */
    c.save(); c.globalAlpha = 0.10;
    ell(c, w * 0.78, h * 0.16, 44, 30); c.fillStyle = '#8a6a3a'; c.fill();
    c.restore();
    c.restore();
  },

  /* the standard menu list */
  list(c, items, sel, x, y, gap, t, opt) {
    opt = opt || {};
    items.forEach((it, i) => {
      const on = i === sel;
      const yy = y + i * gap;
      const label = typeof it === 'string' ? it : it.label;
      const dim = typeof it === 'object' && it.locked;
      c.save();
      if (on) {
        const pulse = 1 + Math.sin(t * 5) * 0.02;
        c.translate(x, yy); c.scale(pulse, pulse); c.translate(-x, -yy);
        /* selection bar */
        const w = opt.w || 340;
        rr(c, x - w / 2, yy - 19, w, 38, 5);
        c.fillStyle = 'rgba(226,176,67,0.16)'; c.fill();
        c.lineWidth = 2; c.strokeStyle = PAL.gold; c.stroke();
        /* little revolver bullets either side */
        [-w / 2 + 16, w / 2 - 16].forEach(dx => {
          c.save(); c.translate(x + dx, yy);
          rr(c, -3, -6, 6, 9, 1); ink(c, PAL.gold, 1);
          c.beginPath(); c.moveTo(-3, -6); c.lineTo(0, -11); c.lineTo(3, -6); c.closePath();
          ink(c, '#c9954a', 1);
          c.restore();
        });
      }
      txt(c, label, x, yy,
          { size: on ? 25 : 21, font: FONT.title,
            fill: dim ? 'rgba(239,220,176,0.30)' : (on ? PAL.gold : PAL.parch),
            stroke: PAL.ink, lw: on ? 5 : 4, letter: 1 });
      if (typeof it === 'object' && it.value !== undefined) {
        txt(c, it.value, x + (opt.w || 340) / 2 + 90, yy,
            { size: 18, font: FONT.ui, fill: on ? PAL.gold : PAL.parchDk });
      }
      c.restore();
    });
  },

  footer(c, s) {
    c.save();
    c.fillStyle = 'rgba(22,13,28,0.55)';
    c.fillRect(0, CFG.H - 30, CFG.W, 30);
    txt(c, s, CFG.W / 2, CFG.H - 15, { size: 13, font: FONT.ui, fill: PAL.parchDk, letter: 1 });
    c.restore();
  },

  /* a slider row used by the options screen */
  slider(c, x, y, w, v, on) {
    c.save();
    c.fillStyle = 'rgba(22,13,28,0.6)';
    rr(c, x, y - 6, w, 12, 6); c.fill();
    c.lineWidth = 2; c.strokeStyle = on ? PAL.gold : PAL.parchDk; c.stroke();
    rr(c, x + 2, y - 4, (w - 4) * v, 8, 4);
    c.fillStyle = on ? PAL.gold : PAL.parchDk; c.fill();
    /* knob shaped like a poker chip */
    ell(c, x + 2 + (w - 4) * v, y, 8, 8);
    ink(c, on ? PAL.gold : PAL.parch, 2);
    c.restore();
  }
};

/* =====================================================================
   SCREENS
   Each screen is { enter(), update(dt) -> next|null, draw(c) }
   ===================================================================== */
const Screens = {};
let UIT = 0;                      /* shared animation clock */

/* --------------------------- TITLE -------------------------------- */
Screens.title = {
  enter() { Snd.music('title'); this.t = 0; },
  update(dt) {
    this.t += dt;
    if (Input.anyKey() && this.t > 0.4) { Snd.play('click'); return 'main'; }
    return null;
  },
  draw(c) {
    Sky.draw(c, 'gulch', UIT * 12, 0, CFG.W, CFG.H, UIT);
    /* ground */
    c.fillStyle = PAL.ground; c.fillRect(0, CFG.H - 96, CFG.W, 96);
    c.fillStyle = PAL.groundTop; c.fillRect(0, CFG.H - 96, CFG.W, 4);

    /* the two of them, standing together against the sun */
    const gy = CFG.H - 96;
    drawChar(c, 'arshia', { x: CFG.W / 2 - 62, y: gy, face: 1, anim: 'idle',
                            t: UIT, expr: 'normal', scale: 2.1 });
    drawChar(c, 'rojina', { x: CFG.W / 2 + 62, y: gy, face: -1, anim: 'idle',
                            t: UIT + 0.8, expr: 'happy', scale: 2.1,
                            blinkSeed: 0.45, closeness: 0.9 });
    /* hearts drifting up between them */
    if (Math.random() < 0.04) FX.hearts(CFG.W / 2, gy - 60, 1, PAL.red);
    FX.update(1 / 60); FX.draw(c);

    /* title plate */
    c.save();
    const bob = Math.sin(UIT * 1.2) * 3;
    txt(c, CFG.TITLE, CFG.W / 2, 128 + bob,
        { size: 78, font: FONT.title, fill: PAL.gold, stroke: PAL.ink, lw: 10, letter: 5, shadow: 4 });
    txt(c, CFG.SUBTITLE, CFG.W / 2, 182 + bob,
        { size: 22, font: FONT.title, fill: PAL.parch, stroke: PAL.ink, lw: 5, letter: 7 });
    /* rope divider */
    c.strokeStyle = PAL.parchDk; c.lineWidth = 3; c.setLineDash([9, 7]);
    c.beginPath(); c.moveTo(CFG.W / 2 - 210, 206 + bob); c.lineTo(CFG.W / 2 + 210, 206 + bob); c.stroke();
    c.setLineDash([]);
    c.restore();

    const blink = (Math.sin(UIT * 3) + 1) / 2;
    c.save(); c.globalAlpha = 0.4 + blink * 0.6;
    txt(c, 'PRESS ANY KEY', CFG.W / 2, CFG.H - 56,
        { size: 22, font: FONT.title, fill: PAL.parch, stroke: PAL.ink, lw: 5, letter: 3 });
    c.restore();
    Chrome.footer(c, 'A TWO PLAYER STORY  ·  ONE KEYBOARD  ·  W A S D  +  ARROW KEYS');
  }
};

/* --------------------------- MAIN MENU ---------------------------- */
Screens.main = {
  sel: 0,
  items: ['NEW RIDE', 'CONTINUE', 'CHAPTERS', 'HOW TO PLAY', 'OPTIONS', 'CREDITS'],
  enter() { Snd.music('menu'); },
  update() {
    const n = this.items.length;
    if (Input.menuUp()) { this.sel = (this.sel + n - 1) % n; Snd.play('move'); }
    if (Input.menuDown()) { this.sel = (this.sel + 1) % n; Snd.play('move'); }
    if (Input.menuOk()) {
      Snd.play('click');
      switch (this.sel) {
        case 0: return 'difficulty';
        case 1: return Save.data.unlocked > 1 ? 'continue' : 'difficulty';
        case 2: return 'chapters';
        case 3: return 'howto';
        case 4: return 'options';
        case 5: return 'credits';
      }
    }
    return null;
  },
  draw(c) {
    Sky.draw(c, 'gulch', 400 + UIT * 6, 0, CFG.W, CFG.H, UIT);
    c.fillStyle = 'rgba(22,13,28,0.35)'; c.fillRect(0, 0, CFG.W, CFG.H);

    /* the pair leaning on the sign, off to one side */
    const gy = CFG.H - 60;
    drawChar(c, 'arshia', { x: 120, y: gy, face: 1, anim: 'idle', t: UIT, scale: 2.0 });
    drawChar(c, 'rojina', { x: CFG.W - 120, y: gy, face: -1, anim: 'idle',
                            t: UIT + 0.8, scale: 2.0, blinkSeed: 0.45, expr: 'happy' });

    Chrome.woodSign(c, CFG.W / 2 - 230, 44, 460, 74);
    txt(c, CFG.TITLE, CFG.W / 2, 82,
        { size: 40, font: FONT.title, fill: PAL.parch, stroke: PAL.ink, lw: 6, letter: 3 });

    const items = this.items.map((s, i) => ({
      label: s,
      locked: i === 1 && Save.data.unlocked <= 1
    }));
    Chrome.list(c, items, this.sel, CFG.W / 2, 190, 52, UIT);

    Chrome.footer(c, 'W/S or ARROWS to move  ·  ENTER or SPACE to choose');
  }
};

/* --------------------------- DIFFICULTY --------------------------- */
Screens.difficulty = {
  sel: 1,
  keys: ['greenhorn', 'gunslinger', 'legend'],
  enter() { this.sel = this.keys.indexOf(Save.data.difficulty); if (this.sel < 0) this.sel = 1; },
  update() {
    if (Input.menuUp()) { this.sel = (this.sel + 2) % 3; Snd.play('move'); }
    if (Input.menuDown()) { this.sel = (this.sel + 1) % 3; Snd.play('move'); }
    if (Input.menuBack()) { Snd.play('back'); return 'main'; }
    if (Input.menuOk()) {
      Save.data.difficulty = this.keys[this.sel]; Save.save();
      Snd.play('click');
      return 'startNew';
    }
    return null;
  },
  draw(c) {
    Sky.draw(c, 'duel', 900, 0, CFG.W, CFG.H, UIT);
    c.fillStyle = 'rgba(22,13,28,0.45)'; c.fillRect(0, 0, CFG.W, CFG.H);
    Chrome.woodSign(c, CFG.W / 2 - 200, 44, 400, 62);
    txt(c, 'PICK YOUR TROUBLE', CFG.W / 2, 76,
        { size: 27, font: FONT.title, fill: PAL.parch, stroke: PAL.ink, lw: 5, letter: 2 });

    const items = this.keys.map(k => DIFF[k].name);
    Chrome.list(c, items, this.sel, CFG.W / 2, 200, 62, UIT);

    const d = DIFF[this.keys[this.sel]];
    txt(c, d.hint, CFG.W / 2, 400, { size: 17, font: FONT.ui, fill: PAL.parch });
    /* hearts preview */
    for (let i = 0; i < d.hearts; i++)
      drawHeart(c, CFG.W / 2 - (d.hearts - 1) * 15 + i * 30, 442, 10, PAL.red);
    Chrome.footer(c, 'ESC to go back');
  }
};

/* --------------------------- CHAPTERS ----------------------------- */
Screens.chapters = {
  sel: 0,
  enter() { this.sel = clamp(this.sel, 0, STAGES.length - 1); },
  update() {
    const n = STAGES.length;
    if (Input.menuUp()) { this.sel = (this.sel + n - 1) % n; Snd.play('move'); }
    if (Input.menuDown()) { this.sel = (this.sel + 1) % n; Snd.play('move'); }
    if (Input.menuBack()) { Snd.play('back'); return 'main'; }
    if (Input.menuOk()) {
      Snd.play('click');
      return 'startAt:' + this.sel;
    }
    return null;
  },
  draw(c) {
    Sky.draw(c, 'canyon', 1500, 0, CFG.W, CFG.H, UIT);
    c.fillStyle = 'rgba(22,13,28,0.55)'; c.fillRect(0, 0, CFG.W, CFG.H);
    Chrome.woodSign(c, CFG.W / 2 - 170, 30, 340, 54);
    txt(c, 'CHAPTERS', CFG.W / 2, 58, { size: 26, font: FONT.title, fill: PAL.parch, stroke: PAL.ink, lw: 5, letter: 3 });

    STAGES.forEach((s, i) => {
      const y = 128 + i * 54;
      const on = i === this.sel;
      const open = i < Save.data.unlocked;
      const best = Save.data.best[s.id];
      c.save();
      rr(c, 130, y - 21, CFG.W - 260, 42, 5);
      c.fillStyle = on ? 'rgba(226,176,67,0.16)' : 'rgba(22,13,28,0.45)'; c.fill();
      c.lineWidth = 2; c.strokeStyle = on ? PAL.gold : 'rgba(239,220,176,0.22)'; c.stroke();
      txt(c, String(i + 1).padStart(2, '0'), 162, y,
          { size: 18, font: FONT.title, fill: open ? PAL.gold : 'rgba(239,220,176,0.3)' });
      txt(c, open ? s.name : 'LOCKED', 200, y,
          { size: 19, font: FONT.title, fill: open ? (on ? PAL.gold : PAL.parch) : 'rgba(239,220,176,0.3)',
            align: 'left', letter: 1 });
      txt(c, s.kind === 'platform' ? 'STAGE' : 'SHOWDOWN', 560, y,
          { size: 12, font: FONT.ui, fill: PAL.parchDk, align: 'left' });
      if (best) {
        txt(c, fmtTime(best.time), CFG.W - 250, y, { size: 14, font: FONT.ui, fill: PAL.teal, align: 'right' });
        txt(c, 'SILVER ' + best.coins, CFG.W - 160, y, { size: 13, font: FONT.ui, fill: PAL.gold, align: 'right' });
      } else if (!open) {
        /* padlock */
        c.save(); c.translate(CFG.W - 175, y);
        rr(c, -7, -3, 14, 11, 2); ink(c, 'rgba(154,162,177,0.5)', 2);
        c.beginPath(); c.arc(0, -3, 5, Math.PI, 0); c.lineWidth = 2.5;
        c.strokeStyle = 'rgba(154,162,177,0.5)'; c.stroke();
        c.restore();
      }
      c.restore();
    });
    Chrome.footer(c, 'ENTER to ride  ·  ESC to go back');
  }
};

/* --------------------------- HOW TO PLAY -------------------------- */
Screens.howto = {
  page: 0,
  update() {
    if (Input.menuBack()) { Snd.play('back'); return 'main'; }
    if (Input.menuRight() || Input.menuOk()) { this.page = (this.page + 1) % 2; Snd.play('move'); }
    if (Input.menuLeft()) { this.page = (this.page + 1) % 2; Snd.play('move'); }
    return null;
  },
  draw(c) {
    Sky.draw(c, 'gulch', 300, 0, CFG.W, CFG.H, UIT);
    c.fillStyle = 'rgba(22,13,28,0.62)'; c.fillRect(0, 0, CFG.W, CFG.H);
    Chrome.woodSign(c, CFG.W / 2 - 190, 26, 380, 52);
    txt(c, 'HOW TO PLAY', CFG.W / 2, 53, { size: 24, font: FONT.title, fill: PAL.parch, stroke: PAL.ink, lw: 5, letter: 3 });

    if (this.page === 0) this.controls(c); else this.rules(c);

    txt(c, this.page === 0 ? 'CONTROLS  ( 1 / 2 )' : 'THE RULES  ( 2 / 2 )',
        CFG.W / 2, CFG.H - 52, { size: 14, font: FONT.ui, fill: PAL.gold, letter: 2 });
    Chrome.footer(c, 'LEFT / RIGHT to turn the page  ·  ESC to go back');
  },

  controls(c) {
    const cols = [
      { who: 'arshia', x: CFG.W * 0.27,
        keys: [['W', 'JUMP'], ['A / D', 'MOVE'], ['S', 'CROUCH  /  PAY OUT ROPE'],
               ['E', 'THROW  /  DROP LASSO'], ['Q', 'KISS  ( revive her )']] },
      { who: 'rojina', x: CFG.W * 0.73,
        keys: [['UP', 'JUMP  ( twice for a double )'], ['LEFT / RIGHT', 'MOVE'],
               ['DOWN', 'CROUCH'], ['/', 'RAISE THE LANTERN'],
               ['R-SHIFT', 'KISS  ( revive him )']] }
    ];
    cols.forEach(col => {
      const L = LOOK[col.who];
      drawPortrait(c, col.who, col.x, 148, 68, 'happy', UIT + (col.who === 'rojina' ? 0.7 : 0));
      txt(c, L.name, col.x, 214, { size: 22, font: FONT.title, fill: L.accent, stroke: PAL.ink, lw: 4, letter: 2 });
      txt(c, L.nameFa, col.x, 238, { size: 16, font: FONT.ui, fill: PAL.parchDk });
      col.keys.forEach(([k, v], i) => {
        const y = 276 + i * 38;
        /* key cap */
        const kw = Math.max(46, k.length * 11 + 18);
        rr(c, col.x - 150, y - 14, kw, 28, 5);
        c.fillStyle = 'rgba(239,220,176,0.14)'; c.fill();
        c.lineWidth = 2; c.strokeStyle = L.accent; c.stroke();
        txt(c, k, col.x - 150 + kw / 2, y, { size: 13, font: FONT.ui, fill: PAL.parch });
        txt(c, v, col.x - 150 + kw + 12, y, { size: 13, font: FONT.ui, fill: PAL.parchDk, align: 'left' });
      });
    });
  },

  rules(c) {
    const rules = [
      ['NEITHER OF YOU CAN FINISH ALONE',
       'He has the rope and the weight. She has the light and the second jump.'],
      ['THE LANTERN MAKES THINGS REAL',
       'Ghost timbers hold weight only inside her light. He needs her standing close.'],
      ['WHEN ONE OF YOU FALLS, THEY STAY DOWN',
       'Reach them and HOLD your kiss key. They come back with one less heart, forever.'],
      ['IF YOU BOTH GO DOWN',
       'Back to the last checkpoint, hearts restored. The clock does not stop.'],
      ['SILVER DOLLARS ARE OPTIONAL',
       'Nothing forces you to take them. Nothing but pride.']
    ];
    rules.forEach(([h, b], i) => {
      const y = 122 + i * 74;
      c.save();
      rr(c, 96, y - 26, CFG.W - 192, 62, 5);
      c.fillStyle = 'rgba(22,13,28,0.5)'; c.fill();
      c.lineWidth = 1.5; c.strokeStyle = 'rgba(226,176,67,0.35)'; c.stroke();
      drawHeart(c, 122, y, 7, i % 2 ? LOOK.rojina.accent : LOOK.arshia.accent);
      txt(c, h, 146, y - 9, { size: 16, font: FONT.title, fill: PAL.gold, align: 'left', letter: 1 });
      txt(c, b, 146, y + 14, { size: 13, font: FONT.ui, fill: PAL.parch, align: 'left' });
      c.restore();
    });
  }
};

/* --------------------------- OPTIONS ------------------------------ */
Screens.options = {
  sel: 0,
  rows: ['MUSIC', 'SOUND', 'MASTER', 'DIFFICULTY', 'SCREEN SHAKE', 'FULLSCREEN', 'ERASE SAVE'],
  confirmErase: 0,
  update(dt) {
    const d = Save.data, n = this.rows.length;
    if (Input.menuUp()) { this.sel = (this.sel + n - 1) % n; Snd.play('move'); this.confirmErase = 0; }
    if (Input.menuDown()) { this.sel = (this.sel + 1) % n; Snd.play('move'); this.confirmErase = 0; }
    const dir = (Input.menuRight() ? 1 : 0) - (Input.menuLeft() ? 1 : 0);
    if (dir) {
      switch (this.sel) {
        case 0: d.music = clamp(d.music + dir * 0.1, 0, 1); Snd.S.music = d.music; break;
        case 1: d.sfx = clamp(d.sfx + dir * 0.1, 0, 1); Snd.S.sfx = d.sfx; Snd.play('click'); break;
        case 2: d.master = clamp(d.master + dir * 0.1, 0, 1); Snd.S.master = d.master; break;
        case 3: {
          const ks = ['greenhorn', 'gunslinger', 'legend'];
          let i = ks.indexOf(d.difficulty) + dir;
          d.difficulty = ks[clamp(i, 0, 2)];
          Snd.play('move'); break;
        }
        case 4: d.shake = !d.shake; Snd.play('click'); break;
      }
      Snd.vol(); Save.save();
    }
    if (Input.menuOk()) {
      if (this.sel === 5) { toggleFullscreen(); Snd.play('click'); }
      else if (this.sel === 6) {
        if (this.confirmErase > 0) { Save.reset(); this.confirmErase = 0; Snd.play('wrong'); }
        else { this.confirmErase = 3; Snd.play('click'); }
      } else Snd.play('click');
    }
    if (this.confirmErase > 0) this.confirmErase -= dt;
    if (Input.menuBack()) { Snd.play('back'); Save.save(); return 'main'; }
    return null;
  },
  draw(c) {
    Sky.draw(c, 'gulch', 700, 0, CFG.W, CFG.H, UIT);
    c.fillStyle = 'rgba(22,13,28,0.66)'; c.fillRect(0, 0, CFG.W, CFG.H);
    Chrome.woodSign(c, CFG.W / 2 - 160, 26, 320, 52);
    txt(c, 'OPTIONS', CFG.W / 2, 53, { size: 25, font: FONT.title, fill: PAL.parch, stroke: PAL.ink, lw: 5, letter: 3 });

    const d = Save.data;
    this.rows.forEach((r, i) => {
      const y = 130 + i * 50, on = i === this.sel;
      c.save();
      if (on) {
        rr(c, 150, y - 20, CFG.W - 300, 40, 5);
        c.fillStyle = 'rgba(226,176,67,0.14)'; c.fill();
        c.lineWidth = 2; c.strokeStyle = PAL.gold; c.stroke();
      }
      txt(c, r, 180, y, { size: 18, font: FONT.title, fill: on ? PAL.gold : PAL.parch, align: 'left', letter: 1 });
      const vx = CFG.W - 360;
      if (i < 3) {
        const v = [d.music, d.sfx, d.master][i];
        Chrome.slider(c, vx, y, 150, v, on);
        txt(c, Math.round(v * 100) + '%', CFG.W - 195, y, { size: 15, font: FONT.ui, fill: on ? PAL.gold : PAL.parchDk, align: 'left' });
      } else if (i === 3) {
        txt(c, DIFF[d.difficulty].name, vx, y, { size: 17, font: FONT.title, fill: on ? PAL.gold : PAL.parch, align: 'left' });
      } else if (i === 4) {
        txt(c, d.shake ? 'ON' : 'OFF', vx, y, { size: 17, font: FONT.title, fill: d.shake ? PAL.teal : PAL.parchDk, align: 'left' });
      } else if (i === 5) {
        txt(c, 'PRESS ENTER', vx, y, { size: 15, font: FONT.ui, fill: on ? PAL.gold : PAL.parchDk, align: 'left' });
      } else {
        txt(c, this.confirmErase > 0 ? 'PRESS AGAIN TO ERASE' : 'PRESS ENTER',
            vx, y, { size: 15, font: FONT.ui, fill: this.confirmErase > 0 ? PAL.red : (on ? PAL.gold : PAL.parchDk), align: 'left' });
      }
      c.restore();
    });
    Chrome.footer(c, 'LEFT / RIGHT to change  ·  ESC to go back');
  }
};

/* --------------------------- CREDITS ------------------------------ */
Screens.credits = {
  scroll: 0,
  enter() { this.scroll = 0; },
  update(dt) {
    this.scroll += dt * 42;
    if (Input.menuBack() || Input.menuOk()) { Snd.play('back'); return 'main'; }
    return null;
  },
  draw(c) {
    Sky.draw(c, 'finale', 2000, 0, CFG.W, CFG.H, UIT);
    c.fillStyle = 'rgba(22,13,28,0.62)'; c.fillRect(0, 0, CFG.W, CFG.H);
    const lines = [
      ['t', CFG.TITLE], ['s', CFG.SUBTITLE], ['', ''],
      ['h', 'STARRING'],
      ['n', 'ARSHIA        عرشیا'],
      ['n', 'ROJINA        روژینا'],
      ['', ''],
      ['h', 'DESIGN'],
      ['b', 'Built together, one decision at a time.'],
      ['b', 'Every colour, hat and mechanic was argued over first.'],
      ['', ''],
      ['h', 'THE RULE THAT MATTERS'],
      ['b', 'Neither of them can finish this alone.'],
      ['b', 'When one falls, the other has to come back for them.'],
      ['', ''],
      ['h', 'MADE WITH'],
      ['b', 'HTML5 canvas · no engine · no asset files'],
      ['b', 'Every sound is generated as it plays.'],
      ['b', 'Every line of the art is drawn from maths.'],
      ['', ''], ['', ''],
      ['t', 'THE END'],
      ['b', 'for the two of them']
    ];
    lines.forEach(([kind, s], i) => {
      const y = CFG.H + 40 + i * 42 - this.scroll;
      if (y < -40 || y > CFG.H + 40) return;
      if (kind === 't') txt(c, s, CFG.W / 2, y, { size: 46, font: FONT.title, fill: PAL.gold, stroke: PAL.ink, lw: 6, letter: 4 });
      else if (kind === 's') txt(c, s, CFG.W / 2, y, { size: 22, font: FONT.title, fill: PAL.parch, letter: 6 });
      else if (kind === 'h') txt(c, s, CFG.W / 2, y, { size: 17, font: FONT.title, fill: LOOK.rojina.accent, letter: 4 });
      else if (kind === 'n') txt(c, s, CFG.W / 2, y, { size: 21, font: FONT.title, fill: PAL.parch, letter: 2 });
      else txt(c, s, CFG.W / 2, y, { size: 15, font: FONT.ui, fill: PAL.parchDk });
    });
    if (this.scroll > lines.length * 42 + CFG.H) this.scroll = 0;
    Chrome.footer(c, 'ESC to go back');
  }
};

/* --------------------------- PAUSE -------------------------------- */
Screens.pause = {
  sel: 0,
  items: ['RESUME', 'RESTART STAGE', 'HOW TO PLAY', 'OPTIONS', 'QUIT TO MENU'],
  enter() { this.sel = 0; },
  update() {
    const n = this.items.length;
    if (Input.menuUp()) { this.sel = (this.sel + n - 1) % n; Snd.play('move'); }
    if (Input.menuDown()) { this.sel = (this.sel + 1) % n; Snd.play('move'); }
    /* Escape is owned by the game loop, which toggles the pause. Reading
       it here too would consume the same press and un-pause instantly. */
    if (Input.menuOk()) {
      Snd.play('click');
      return ['resume', 'restart', 'howto', 'options', 'quit'][this.sel];
    }
    return null;
  },
  draw(c) {
    c.save();
    c.fillStyle = 'rgba(12,7,16,0.78)'; c.fillRect(0, 0, CFG.W, CFG.H);
    Chrome.woodSign(c, CFG.W / 2 - 150, 62, 300, 56);
    txt(c, 'HOLD UP', CFG.W / 2, 92, { size: 27, font: FONT.title, fill: PAL.parch, stroke: PAL.ink, lw: 5, letter: 3 });
    Chrome.list(c, this.items, this.sel, CFG.W / 2, 200, 50, UIT, { w: 320 });
    /* the two of them waiting it out */
    drawPortrait(c, 'arshia', CFG.W / 2 - 220, CFG.H - 120, 64, 'normal', UIT);
    drawPortrait(c, 'rojina', CFG.W / 2 + 220, CFG.H - 120, 64, 'normal', UIT + 0.7);
    c.restore();
    Chrome.footer(c, 'ESC to resume');
  }
};

/* --------------------------- RESULTS ------------------------------ */
Screens.results = {
  data: null, t: 0, sel: 0,
  items: ['NEXT', 'RETRY', 'CHAPTERS'],
  enter() { this.t = 0; this.sel = 0; Snd.music('victory'); },
  update(dt) {
    this.t += dt;
    const n = this.items.length;
    if (Input.menuLeft()) { this.sel = (this.sel + n - 1) % n; Snd.play('move'); }
    if (Input.menuRight()) { this.sel = (this.sel + 1) % n; Snd.play('move'); }
    if (Input.menuUp()) { this.sel = (this.sel + n - 1) % n; Snd.play('move'); }
    if (Input.menuDown()) { this.sel = (this.sel + 1) % n; Snd.play('move'); }
    if (Input.menuOk() && this.t > 0.6) {
      Snd.play('click');
      return ['next', 'retry', 'chapters'][this.sel];
    }
    return null;
  },
  draw(c) {
    const d = this.data || {};
    Sky.draw(c, 'finale', 1200, 0, CFG.W, CFG.H, UIT);
    c.fillStyle = 'rgba(22,13,28,0.6)'; c.fillRect(0, 0, CFG.W, CFG.H);

    Chrome.poster(c, CFG.W / 2 - 250, 40, 500, 380);
    c.save();
    c.translate(CFG.W / 2 - 250, 40); c.rotate(-0.012);
    const w = 500;
    txt(c, 'REWARD CLAIMED', w / 2, 46, { size: 26, font: FONT.title, fill: '#4a2a17', letter: 3 });
    c.strokeStyle = '#4a2a17'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(48, 66); c.lineTo(w - 48, 66); c.stroke();
    txt(c, d.name || '', w / 2, 96, { size: 21, font: FONT.title, fill: '#6d3b1c', letter: 2 });

    drawPortrait(c, 'arshia', w / 2 - 82, 168, 60, 'happy', UIT);
    drawPortrait(c, 'rojina', w / 2 + 82, 168, 60, 'happy', UIT + 0.7);

    const rows = [
      ['TIME', fmtTime(d.time || 0)],
      ['SILVER', (d.coins || 0) + ' / ' + (d.total || 0)],
      ['TIMES DOWN', String(d.deaths || 0)],
      ['KISSES', String(d.revives || 0)]
    ];
    rows.forEach(([k, v], i) => {
      const y = 244 + i * 30;
      txt(c, k, 96, y, { size: 15, font: FONT.ui, fill: '#6d3b1c', align: 'left' });
      txt(c, v, w - 96, y, { size: 17, font: FONT.title, fill: '#3d2010', align: 'right' });
    });
    /* the medal */
    const perfect = d.total && d.coins === d.total;
    txt(c, perfect ? 'ALL THE SILVER' : (d.deaths === 0 ? 'NOT A SCRATCH' : 'THEY MADE IT'),
        w / 2, 372, { size: 18, font: FONT.title, fill: '#8a2b43', letter: 2 });
    c.restore();

    /* three buttons laid out across the bottom */
    this.items.forEach((it, i) => {
      const bw = 190, gap = 22;
      const x = CFG.W / 2 + (i - 1) * (bw + gap);
      const on = i === this.sel;
      c.save();
      if (on) { const p = 1 + Math.sin(UIT * 5) * 0.025; c.translate(x, 472); c.scale(p, p); c.translate(-x, -472); }
      rr(c, x - bw / 2, 452, bw, 40, 5);
      c.fillStyle = on ? 'rgba(226,176,67,0.18)' : 'rgba(22,13,28,0.55)'; c.fill();
      c.lineWidth = 2; c.strokeStyle = on ? PAL.gold : 'rgba(239,220,176,0.28)'; c.stroke();
      txt(c, it, x, 472, { size: on ? 21 : 18, font: FONT.title,
                           fill: on ? PAL.gold : PAL.parch, stroke: PAL.ink, lw: 4, letter: 2 });
      c.restore();
    });
    Chrome.footer(c, 'LEFT / RIGHT to choose  ·  ENTER to confirm');
  }
};

/* --------------------------- ENDING ------------------------------- */
Screens.ending = {
  t: 0,
  enter() { this.t = 0; Snd.music('victory'); },
  update(dt) {
    this.t += dt;
    if (this.t > 3 && Input.menuOk()) { Snd.play('click'); return 'credits'; }
    return null;
  },
  draw(c) {
    Sky.draw(c, 'finale', 2600, 0, CFG.W, CFG.H, UIT);
    const gy = CFG.H - 92;
    c.fillStyle = PAL.ground; c.fillRect(0, gy, CFG.W, 92);
    c.fillStyle = PAL.groundTop; c.fillRect(0, gy, CFG.W, 4);

    /* they walk toward the border together */
    const walk = Math.min(this.t * 26, CFG.W * 0.5);
    drawChar(c, 'arshia', { x: 90 + walk, y: gy, face: 1, anim: this.t < 6 ? 'run' : 'idle',
                            t: this.t, expr: 'happy', scale: 2.2, speed: 0.6 });
    drawChar(c, 'rojina', { x: 150 + walk, y: gy, face: 1, anim: this.t < 6 ? 'run' : 'idle',
                            t: this.t + 0.4, expr: 'love', scale: 2.2, speed: 0.6,
                            blinkSeed: 0.45, closeness: 1 });
    if (Math.random() < 0.2) FX.hearts(120 + walk, gy - 70, 1);
    FX.update(1 / 60); FX.draw(c);

    const k = clamp((this.t - 1) / 1.5, 0, 1);
    c.save(); c.globalAlpha = k;
    txt(c, 'THEY CROSSED THE BORDER AT SUNDOWN', CFG.W / 2, 120,
        { size: 26, font: FONT.title, fill: PAL.parch, stroke: PAL.ink, lw: 5, letter: 2 });
    txt(c, 'and nobody ever came looking.', CFG.W / 2, 158,
        { size: 17, font: FONT.ui, fill: PAL.parchDk });
    c.restore();

    if (this.t > 3) {
      const b = (Math.sin(UIT * 3) + 1) / 2;
      c.save(); c.globalAlpha = 0.4 + b * 0.6;
      txt(c, 'PRESS ENTER', CFG.W / 2, CFG.H - 140,
          { size: 20, font: FONT.title, fill: PAL.gold, stroke: PAL.ink, lw: 5, letter: 3 });
      c.restore();
    }
  }
};

/* ------------------------------------------------------------------ */
function toggleFullscreen() {
  const el = document.documentElement;
  if (!document.fullscreenElement) { if (el.requestFullscreen) el.requestFullscreen(); }
  else if (document.exitFullscreen) document.exitFullscreen();
}
