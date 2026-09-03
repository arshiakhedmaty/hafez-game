/* scenery.js : parallax skies, mesas, frontier-town silhouettes and the
   set dressing that sells the old-west setting.                        */

const Sky = (() => {
  const cache = {};

  function grad(c, w, h, stops) {
    const g = c.createLinearGradient(0, 0, 0, h);
    stops.forEach(([p, col]) => g.addColorStop(p, col));
    return g;
  }

  const THEMES = {
    gulch: [[0, PAL.skyTop], [0.28, PAL.skyHigh], [0.52, PAL.skyMid],
            [0.76, PAL.skyLow], [1, PAL.skyHaze]],
    duel:  [[0, '#3a1d4e'], [0.30, '#7c2c58'], [0.58, '#c9482c'],
            [0.82, '#e8843c'], [1, '#f6c17a']],
    mine:  [[0, '#0e0913'], [0.45, '#1a1020'], [1, '#2a1830']],
    canyon:[[0, '#2a1141'], [0.30, '#63204f'], [0.58, '#b53a3f'],
            [0.84, '#e2703a'], [1, '#f3a45c']],
    vault: [[0, '#120c1a'], [0.5, '#1d1426'], [1, '#2c1e35']],
    finale:[[0, '#150b22'], [0.26, '#3d1440'], [0.52, '#8e2a4e'],
            [0.78, '#d9542b'], [1, '#ffcf7a']]
  };

  /* ---- distant mesa band, generated once per theme/seed ---- */
  function mesaBand(seed, w, h, amp, flatness) {
    const key = 'm' + seed + w + h + amp;
    if (cache[key]) return cache[key];
    const R = srand(seed);
    const pts = [];
    let x = 0, y = h * 0.5;
    while (x < w) {
      const run = 40 + R() * flatness;
      if (R() < 0.42) y = clamp(y + (R() - 0.5) * amp, h * 0.16, h * 0.92);
      pts.push([x, y]); pts.push([x + run, y]);
      x += run;
    }
    cache[key] = pts;
    return pts;
  }

  function drawBand(c, pts, camX, par, baseY, height, col, w) {
    const off = -camX * par;
    const span = pts[pts.length - 1][0];
    c.beginPath();
    for (let rep = -1; rep <= Math.ceil(w / span) + 1; rep++) {
      const ox = off % span + rep * span;
      pts.forEach(([px, py], i) => {
        const X = px + ox, Y = baseY - py * (height / 100);
        (i === 0 && rep === -1) ? c.moveTo(X, Y) : c.lineTo(X, Y);
      });
    }
    c.lineTo(w + 400, baseY + 400); c.lineTo(-400, baseY + 400);
    c.closePath();
    c.fillStyle = col; c.fill();
  }

  /* ---- a frontier-town skyline silhouette ---- */
  function townRow(c, camX, par, baseY, w, col, seed, scale) {
    const R = srand(seed);
    const span = 1400;
    const off = (-camX * par) % span;
    c.fillStyle = col;
    for (let rep = -1; rep <= Math.ceil(w / span) + 1; rep++) {
      const R2 = srand(seed);
      let x = off + rep * span;
      while (x < off + rep * span + span) {
        const bw = (36 + R2() * 46) * scale;
        const bh = (44 + R2() * 60) * scale;
        const style = R2();
        c.beginPath();
        if (style < 0.34) {                       /* false-front store   */
          c.rect(x, baseY - bh, bw, bh);
          c.fill();
          c.beginPath();
          c.rect(x - 2 * scale, baseY - bh - 7 * scale, bw + 4 * scale, 8 * scale);
          c.fill();
        } else if (style < 0.62) {                /* pitched roof        */
          c.moveTo(x, baseY);
          c.lineTo(x, baseY - bh);
          c.lineTo(x + bw / 2, baseY - bh - 13 * scale);
          c.lineTo(x + bw, baseY - bh);
          c.lineTo(x + bw, baseY);
          c.closePath(); c.fill();
        } else if (style < 0.80) {                /* water tower         */
          c.rect(x + bw * 0.32, baseY - bh * 0.55, bw * 0.14, bh * 0.55); c.fill();
          c.beginPath();
          c.rect(x + bw * 0.12, baseY - bh, bw * 0.56, bh * 0.48); c.fill();
          c.beginPath();
          c.moveTo(x + bw * 0.08, baseY - bh);
          c.lineTo(x + bw * 0.40, baseY - bh - 12 * scale);
          c.lineTo(x + bw * 0.72, baseY - bh);
          c.closePath(); c.fill();
        } else {                                  /* windmill            */
          c.rect(x + bw * 0.42, baseY - bh, bw * 0.10, bh); c.fill();
          const cx = x + bw * 0.47, cy = baseY - bh;
          for (let b = 0; b < 6; b++) {
            const a = b / 6 * Math.PI * 2 + (camX * 0.0008);
            c.beginPath();
            c.moveTo(cx, cy);
            c.lineTo(cx + Math.cos(a) * 13 * scale, cy + Math.sin(a) * 13 * scale);
            c.lineTo(cx + Math.cos(a + 0.34) * 11 * scale, cy + Math.sin(a + 0.34) * 11 * scale);
            c.closePath(); c.fill();
          }
        }
        x += bw + (10 + R2() * 34) * scale;
      }
    }
  }

  /* ---- saguaro cactus ---- */
  function cactus(c, x, y, s, col) {
    c.save(); c.translate(x, y); c.scale(s, s);
    c.fillStyle = col;
    rr(c, -4, -46, 8, 46, 4); c.fill();
    rr(c, -15, -34, 7, 20, 3.5); c.fill();
    rr(c, -15, -34, 18, 7, 3.5); c.fill();
    rr(c, 9, -40, 7, 24, 3.5); c.fill();
    rr(c, -3, -40, 19, 7, 3.5); c.fill();
    c.restore();
  }

  /* ---- telegraph pole ---- */
  function pole(c, x, y, s, col) {
    c.save(); c.translate(x, y); c.scale(s, s);
    c.fillStyle = col;
    c.fillRect(-2, -64, 4, 64);
    c.fillRect(-14, -58, 28, 3);
    c.fillRect(-11, -48, 22, 3);
    c.restore();
  }

  /* ---- main entry ---- */
  function draw(c, theme, camX, camY, w, h, t) {
    const stops = THEMES[theme] || THEMES.gulch;
    c.fillStyle = grad(c, w, h, stops);
    c.fillRect(0, 0, w, h);

    if (theme === 'mine' || theme === 'vault') {
      /* damp cavern haze instead of a sky */
      c.save();
      const g = c.createRadialGradient(w / 2, h * 0.4, 20, w / 2, h * 0.4, w * 0.75);
      g.addColorStop(0, 'rgba(90,60,110,0.30)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      c.restore();
      return;
    }

    /* ---- the sun, low and huge ---- */
    const sunX = w * 0.68 - camX * 0.02, sunY = h * 0.58;
    c.save();
    for (let i = 7; i > 0; i--) {
      c.globalAlpha = 0.045;
      ell(c, sunX, sunY, 86 + i * 30, 86 + i * 30);
      c.fillStyle = PAL.sun; c.fill();
    }
    c.restore();
    ell(c, sunX, sunY, 84, 84); c.fillStyle = PAL.sun; c.fill();
    ell(c, sunX, sunY, 66, 66); c.fillStyle = PAL.sunCore; c.fill();

    /* ---- clouds, long and flat ---- */
    const R = srand(7);
    c.save(); c.globalAlpha = 0.22;
    for (let i = 0; i < 9; i++) {
      const cx = (R() * 2400 - camX * 0.06) % 2400;
      const cy = h * (0.10 + R() * 0.32);
      const cw = 70 + R() * 150, ch = 7 + R() * 9;
      c.fillStyle = i % 2 ? PAL.parch : PAL.skyHaze;
      ell(c, cx, cy, cw, ch); c.fill();
      ell(c, cx + cw * 0.4, cy + ch * 0.5, cw * 0.5, ch * 0.7); c.fill();
    }
    c.restore();

    /* ---- three mesa bands ---- */
    const horizon = h * 0.70;
    drawBand(c, mesaBand(11, 1800, 100, 34, 130), camX, 0.06, horizon, 120, PAL.mesaFar, w);
    drawBand(c, mesaBand(23, 1600, 100, 46, 100), camX, 0.13, horizon + 22, 130, PAL.mesaMid, w);

    /* ---- town silhouette ---- */
    if (theme === 'gulch' || theme === 'duel' || theme === 'finale')
      townRow(c, camX, 0.22, horizon + 44, w, PAL.mesaNear, 5, 1);

    drawBand(c, mesaBand(37, 1400, 100, 30, 90), camX, 0.30, horizon + 74, 90, PAL.mesaNear, w);

    /* ---- mid-ground cacti and poles ---- */
    const R2 = srand(91);
    for (let i = 0; i < 26; i++) {
      const wx = R2() * 3000;
      const sx = wx - camX * 0.42;
      const m = ((sx % 3000) + 3000) % 3000;
      if (m > w + 60) continue;
      const s = 0.6 + R2() * 0.5;
      if (R2() < 0.7) cactus(c, m, horizon + 96, s, '#3a1c3c');
      else pole(c, m, horizon + 96, s, '#33183a');
    }
  }

  return { draw, cactus, pole, townRow, THEMES };
})();

/* ---------------------------------------------------------------------
   World props drawn inside the level (in world space).
   ------------------------------------------------------------------ */
const Props = {
  /* wooden plank platform */
  plank(c, x, y, w, h) {
    rr(c, x, y, w, h, 3);
    ink(c, PAL.wood, 2);
    c.save(); c.beginPath(); rr(c, x, y, w, h, 3); c.clip();
    c.strokeStyle = 'rgba(22,13,28,0.30)'; c.lineWidth = 1.4;
    for (let i = 1; i < Math.max(2, Math.floor(w / 26)); i++) {
      c.beginPath(); c.moveTo(x + i * 26, y); c.lineTo(x + i * 26, y + h); c.stroke();
    }
    c.fillStyle = '#b07a45'; c.fillRect(x, y, w, 3.5);
    c.fillStyle = '#e0a969'; c.fillRect(x, y, w, 1.8);
    c.restore();
  },

  /* solid rock / earth block. The top edge is deliberately loud: it is
     the single most important line in a platformer, so it gets a sunlit
     sand cap, a warm rim and a dark shelf under it.                    */
  ground(c, x, y, w, h) {
    rr(c, x, y, w, h, 4);
    ink(c, '#3a2033', 2.5);
    c.save(); c.beginPath(); rr(c, x, y, w, h, 4); c.clip();
    /* body gradient : lighter at the surface, black at depth */
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#5c3350');
    g.addColorStop(0.16, '#3a2033');
    g.addColorStop(1, '#1d1024');
    c.fillStyle = g; c.fillRect(x, y, w, h);
    /* the sunlit cap */
    c.fillStyle = PAL.sandDark; c.fillRect(x, y, w, 9);
    c.fillStyle = PAL.sand; c.fillRect(x, y, w, 5);
    c.fillStyle = '#f6d3a0'; c.fillRect(x, y, w, 2);
    /* a scatter of grass tufts along the lip */
    const R = srand(Math.floor(x * 7 + y * 13));
    c.strokeStyle = 'rgba(143,160,106,0.75)'; c.lineWidth = 1.4; c.lineCap = 'round';
    for (let i = 0; i < w / 26; i++) {
      const gx = x + 6 + R() * (w - 12);
      for (let b = -1; b <= 1; b++) {
        c.beginPath(); c.moveTo(gx + b * 2, y);
        c.lineTo(gx + b * 3.4, y - 4 - R() * 3); c.stroke();
      }
    }
    /* speckled rock */
    c.fillStyle = 'rgba(255,235,215,0.055)';
    for (let i = 0; i < w * h / 700; i++)
      c.fillRect(x + R() * w, y + 12 + R() * (h - 12), 2 + R() * 6, 2);
    c.restore();
  },

  /* mine timber support */
  timber(c, x, y, w, h) {
    rr(c, x, y, w, h, 2);
    ink(c, PAL.woodDark, 2);
    c.fillStyle = 'rgba(122,74,43,0.55)';
    c.fillRect(x + 2, y + 2, w - 4, 3);
  },

  /* crate the two of them push around */
  crate(c, x, y, w, h, held) {
    rr(c, x, y, w, h, 3);
    ink(c, held ? '#9a6a3a' : PAL.wood, 2.4);
    c.save(); c.beginPath(); rr(c, x, y, w, h, 3); c.clip();
    c.strokeStyle = 'rgba(22,13,28,0.45)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + w, y + h);
    c.moveTo(x + w, y); c.lineTo(x, y + h); c.stroke();
    c.strokeRect(x + 3, y + 3, w - 6, h - 6);
    c.restore();
  },

  /* barrel */
  barrel(c, x, y, w, h) {
    c.save();
    rr(c, x, y, w, h, w * 0.28);
    ink(c, '#7d4a29', 2);
    c.fillStyle = 'rgba(22,13,28,0.35)';
    c.fillRect(x, y + h * 0.22, w, 3);
    c.fillRect(x, y + h * 0.68, w, 3);
    c.restore();
  },

  /* lasso ring anchor */
  ring(c, x, y, t, active) {
    c.save();
    c.translate(x, y);
    const pulse = 1 + Math.sin(t * 3) * 0.06;
    c.scale(pulse, pulse);
    /* post */
    c.fillStyle = PAL.woodDark; c.fillRect(-2.5, 0, 5, 16);
    ell(c, 0, 0, 11, 11);
    c.lineWidth = 5; c.strokeStyle = PAL.ink; c.stroke();
    c.lineWidth = 3; c.strokeStyle = active ? PAL.gold : PAL.metal; c.stroke();
    if (active) {
      c.save(); c.globalAlpha = 0.35;
      ell(c, 0, 0, 18, 18); c.fillStyle = PAL.gold; c.fill();
      c.restore();
    }
    c.restore();
  },

  /* pressure plate */
  plate(c, x, y, w, on, who) {
    const d = on ? 4 : 0;
    c.fillStyle = PAL.metalDk;
    c.fillRect(x, y + 6, w, 5);
    rr(c, x + 2, y + d, w - 4, 8, 2);
    ink(c, on ? PAL.gold : PAL.metal, 2);
    /* who this plate answers to: A, R, a crate glyph, or nothing */
    if (who && who !== 'any') {
      c.save(); c.globalAlpha = 0.85;
      if (who === 'crate') {
        const bx = x + w / 2 - 6, by = y - 18;
        rr(c, bx, by, 12, 12, 2); ink(c, PAL.wood, 1.6);
        c.strokeStyle = 'rgba(22,13,28,0.55)'; c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(bx, by); c.lineTo(bx + 12, by + 12);
        c.moveTo(bx + 12, by); c.lineTo(bx, by + 12); c.stroke();
      } else {
        txt(c, who === 'arshia' ? 'A' : 'R', x + w / 2, y - 7,
            { size: 12, font: FONT.title, fill: LOOK[who].accent, stroke: PAL.ink, lw: 3 });
      }
      c.restore();
    }
  },

  /* the door out of a stage */
  gate(c, x, y, w, h, open, t) {
    /* frame */
    rr(c, x - 4, y - 4, w + 8, h + 4, 4);
    ink(c, PAL.woodDark, 2);
    if (open) {
      c.save();
      const g = c.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, 'rgba(255,214,107,0.85)');
      g.addColorStop(1, 'rgba(224,169,105,0.25)');
      c.fillStyle = g; c.fillRect(x, y, w, h);
      c.globalAlpha = 0.5 + Math.sin(t * 4) * 0.2;
      for (let i = 0; i < 5; i++) {
        const yy = y + ((t * 40 + i * h / 5) % h);
        c.fillStyle = 'rgba(255,246,230,0.35)';
        c.fillRect(x + 3, h + y - (yy - y) - 2, w - 6, 2);
      }
      c.restore();
    } else {
      c.fillStyle = '#3a2333'; c.fillRect(x, y, w, h);
      c.strokeStyle = PAL.metalDk; c.lineWidth = 3;
      for (let i = 1; i < 4; i++) {
        c.beginPath(); c.moveTo(x, y + i * h / 4); c.lineTo(x + w, y + i * h / 4); c.stroke();
      }
      /* padlock */
      c.save(); c.translate(x + w / 2, y + h / 2);
      rr(c, -7, -4, 14, 12, 2); ink(c, PAL.metal, 2);
      c.beginPath(); c.arc(0, -4, 5, Math.PI, 0); c.lineWidth = 3;
      c.strokeStyle = PAL.metalDk; c.stroke();
      c.restore();
    }
  },

  /* spikes / cactus hazard */
  spikes(c, x, y, w, h) {
    const n = Math.max(2, Math.round(w / 12));
    c.beginPath();
    for (let i = 0; i < n; i++) {
      c.moveTo(x + i * w / n, y + h);
      c.lineTo(x + (i + 0.5) * w / n, y);
      c.lineTo(x + (i + 1) * w / n, y + h);
    }
    c.closePath();
    ink(c, '#8fa06a', 1.6);
    c.save(); c.globalAlpha = 0.5;
    c.fillStyle = PAL.white;
    for (let i = 0; i < n; i++) {
      c.beginPath();
      c.moveTo(x + (i + 0.45) * w / n, y + 2);
      c.lineTo(x + (i + 0.55) * w / n, y + h * 0.6);
      c.lineTo(x + (i + 0.4) * w / n, y + h * 0.6);
      c.closePath(); c.fill();
    }
    c.restore();
  },

  /* the collectible : a silver dollar */
  coin(c, x, y, t) {
    const k = Math.abs(Math.cos(t * 3));
    c.save(); c.translate(x, y);
    c.save(); c.globalAlpha = 0.25;
    ell(c, 0, 0, 13, 13); c.fillStyle = PAL.gold; c.fill();
    c.restore();
    ell(c, 0, 0, 8 * (0.25 + k * 0.75), 8);
    ink(c, PAL.gold, 2);
    if (k > 0.5) { ell(c, 0, 0, 4 * k, 4); ink(c, '#fff0b8', 1); }
    c.restore();
  },

  /* tumbleweed rolling through the frame */
  tumbleweed(c, x, y, r, rot) {
    c.save(); c.translate(x, y); c.rotate(rot);
    c.strokeStyle = '#8a6a3a'; c.lineWidth = 1.6; c.lineCap = 'round';
    const R = srand(3);
    for (let i = 0; i < 16; i++) {
      const a = R() * Math.PI * 2, a2 = a + rnd(1.6, 0.5);
      c.beginPath();
      c.moveTo(Math.cos(a) * r * R(), Math.sin(a) * r * R());
      c.lineTo(Math.cos(a2) * r, Math.sin(a2) * r);
      c.stroke();
    }
    c.restore();
  }
};
