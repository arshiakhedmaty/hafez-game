/* particles.js : dust, sparks, hearts, speed lines, screen shake, floating
   text. All pooled so long play sessions do not churn the collector.   */

const FX = (() => {
  const parts = [];
  const texts = [];
  let shakeMag = 0, shakeT = 0, flashCol = null, flashT = 0, flashMax = 0;
  let slowmo = 0;

  function spawn(o) {
    parts.push(Object.assign({
      x: 0, y: 0, vx: 0, vy: 0, g: 260, life: 0.6, t: 0,
      r: 3, col: PAL.sand, kind: 'dot', spin: 0, rot: 0, drag: 0.0, alpha: 1
    }, o));
  }

  /* ---------- emitters ---------- */
  const dust = (x, y, n, dir) => {
    for (let i = 0; i < n; i++)
      spawn({ x: x + rnd(6, -6), y: y + rnd(2, -2),
              vx: (dir || 0) * rnd(40, 8) + rnd(35, -35), vy: rnd(-10, -70),
              g: 120, life: rnd(0.55, 0.28), r: rnd(3.4, 1.4),
              col: Math.random() < 0.5 ? PAL.sand : PAL.sandDark, drag: 1.6 });
  };
  const land = (x, y, power) => {
    for (let i = 0; i < 10 + power * 6; i++) {
      const a = rnd(Math.PI, 0);
      spawn({ x, y, vx: Math.cos(a) * rnd(150, 40) * (Math.random() < .5 ? -1 : 1),
              vy: -Math.abs(Math.sin(a)) * rnd(90, 20), g: 400,
              life: rnd(0.5, 0.25), r: rnd(3, 1.2), col: PAL.sand, drag: 2.2 });
    }
  };
  const sparks = (x, y, n, col) => {
    for (let i = 0; i < n; i++) {
      const a = rnd(Math.PI * 2);
      spawn({ x, y, vx: Math.cos(a) * rnd(260, 60), vy: Math.sin(a) * rnd(260, 60),
              g: 500, life: rnd(0.45, 0.2), r: rnd(2.4, 1), col: col || PAL.gold,
              kind: 'spark', drag: 1.2 });
    }
  };
  const hearts = (x, y, n, col) => {
    for (let i = 0; i < n; i++)
      spawn({ x: x + rnd(10, -10), y: y + rnd(6, -6),
              vx: rnd(30, -30), vy: rnd(-40, -90), g: -20,
              life: rnd(1.4, 0.9), r: rnd(5, 2.6), col: col || PAL.red,
              kind: 'heart', spin: rnd(2, -2), drag: 0.8 });
  };
  const smoke = (x, y, n, col) => {
    for (let i = 0; i < n; i++)
      spawn({ x: x + rnd(8, -8), y: y + rnd(8, -8),
              vx: rnd(24, -24), vy: rnd(-16, -50), g: -12,
              life: rnd(1.1, 0.6), r: rnd(7, 3), col: col || 'rgba(180,170,190,1)',
              kind: 'smoke', drag: 1.0 });
  };
  const shard = (x, y, n, col) => {
    for (let i = 0; i < n; i++)
      spawn({ x, y, vx: rnd(180, -180), vy: rnd(-40, -200), g: 700,
              life: rnd(1.1, 0.6), r: rnd(4, 2), col: col || PAL.mesaNear,
              kind: 'shard', spin: rnd(9, -9) });
  };
  const speedLine = (x, y, dir) => {
    spawn({ x, y, vx: dir * rnd(900, 500), vy: rnd(12, -12), g: 0,
            life: rnd(0.22, 0.11), r: rnd(34, 16), col: 'rgba(255,235,200,0.30)',
            kind: 'line' });
  };

  /* ---------- floating text ---------- */
  function say(x, y, s, col, size) {
    texts.push({ x, y, s, col: col || PAL.parch, size: size || 16, t: 0, life: 1.1 });
  }

  /* ---------- camera feel ---------- */
  function shake(mag, dur) { shakeMag = Math.max(shakeMag, mag); shakeT = Math.max(shakeT, dur || 0.25); }
  function flash(col, dur) { flashCol = col; flashT = flashMax = dur || 0.18; }
  function hitstop(d) { slowmo = Math.max(slowmo, d); }

  function update(dt) {
    if (slowmo > 0) slowmo -= dt;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.t += dt;
      if (p.t >= p.life) { parts.splice(i, 1); continue; }
      if (p.drag) { p.vx -= p.vx * p.drag * dt; p.vy -= p.vy * p.drag * dt; }
      p.vy += p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.spin * dt;
    }
    for (let i = texts.length - 1; i >= 0; i--) {
      const q = texts[i]; q.t += dt; q.y -= 34 * dt;
      if (q.t >= q.life) texts.splice(i, 1);
    }
    if (shakeT > 0) { shakeT -= dt; if (shakeT <= 0) shakeMag = 0; }
    if (flashT > 0) flashT -= dt;
  }

  function applyShake(c) {
    if (shakeT > 0 && shakeMag > 0) {
      const k = shakeMag * (shakeT / 0.25);
      c.translate(rnd(k, -k), rnd(k, -k));
    }
  }

  function draw(c) {
    for (const p of parts) {
      const f = 1 - p.t / p.life;
      c.save();
      c.globalAlpha = clamp(f * p.alpha, 0, 1);
      c.translate(p.x, p.y);
      if (p.rot) c.rotate(p.rot);
      switch (p.kind) {
        case 'heart': drawHeart(c, 0, 0, p.r * (0.6 + f * 0.6), p.col); break;
        case 'spark':
          c.strokeStyle = p.col; c.lineWidth = p.r * 0.8; c.lineCap = 'round';
          c.beginPath(); c.moveTo(0, 0);
          c.lineTo(-p.vx * 0.018, -p.vy * 0.018); c.stroke();
          break;
        case 'line':
          c.strokeStyle = p.col; c.lineWidth = 2; c.lineCap = 'round';
          c.beginPath(); c.moveTo(0, 0); c.lineTo(-Math.sign(p.vx) * p.r, 0); c.stroke();
          break;
        case 'smoke':
          c.globalAlpha *= 0.45;
          ell(c, 0, 0, p.r * (1.4 - f * 0.5), p.r * (1.4 - f * 0.5));
          c.fillStyle = p.col; c.fill();
          break;
        case 'shard':
          c.fillStyle = p.col;
          c.fillRect(-p.r / 2, -p.r / 2, p.r, p.r);
          c.strokeStyle = PAL.ink; c.lineWidth = 1;
          c.strokeRect(-p.r / 2, -p.r / 2, p.r, p.r);
          break;
        default:
          ell(c, 0, 0, p.r * f + 0.6, p.r * f + 0.6);
          c.fillStyle = p.col; c.fill();
      }
      c.restore();
    }
    for (const q of texts) {
      const f = 1 - q.t / q.life;
      c.save(); c.globalAlpha = clamp(f * 1.4, 0, 1);
      txt(c, q.s, q.x, q.y, { size: q.size, font: FONT.title, fill: q.col,
                              stroke: PAL.ink, lw: 4 });
      c.restore();
    }
  }

  /* full-screen colour flash, drawn in screen space after everything */
  function drawFlash(c, w, h) {
    if (flashT > 0 && flashCol) {
      c.save();
      c.globalAlpha = (flashT / flashMax) * 0.55;
      c.fillStyle = flashCol; c.fillRect(0, 0, w, h);
      c.restore();
    }
  }

  function clear() { parts.length = 0; texts.length = 0; shakeT = 0; shakeMag = 0; flashT = 0; }

  return { dust, land, sparks, hearts, smoke, shard, speedLine, say,
           shake, flash, hitstop, update, draw, drawFlash, applyShake, clear,
           get slowmo() { return slowmo; }, spawn };
})();
