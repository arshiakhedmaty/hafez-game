/* =====================================================================
   art.js : anime-styled character renderer + western scenery.
   Everything is drawn with vector paths so it stays crisp at any scale
   and can be re-skinned instantly from the LOOK sheet in config.js.
   ===================================================================== */

/* ---------------------------------------------------------------------
   CHARACTER
   st = { x, y(feet), face:+1/-1, anim, t, expr, scale, alpha }
   anim : idle | run | jump | fall | push | down | kiss | cheer | aim |
          hurt | ride | crouch | swing | dance1 .. dance10
   expr : normal | happy | love | scared | determined | hurt | ko | wink
   ------------------------------------------------------------------ */

/* the low sun, catching whichever edge of a shape faces forward */
const RIM = '#ffd9a2';

/* Paint a thin lit edge along the facing side of whatever `path` builds.
   Fill the shape with the rim colour, then refill it shifted back a
   little in its own colour: what is left uncovered is the sliver where
   the light lands. `path` must build the shape without filling it. */
function rimLight(c, path, base, amt) {
  const a0 = c.globalAlpha;
  c.save();
  path(); c.clip();
  c.globalAlpha = a0 * (amt || 0.55);
  c.fillStyle = RIM; c.fillRect(-500, -500, 1000, 1000);
  c.globalAlpha = a0;
  c.translate(-1.3, 0.35);
  path(); c.fillStyle = base; c.fill();
  c.restore();
}

/* a tapered capsule: radius ra at (ax,ay) narrowing to rb at (bx,by) */
function capsule(c, ax, ay, bx, by, ra, rb) {
  const th = Math.atan2(by - ay, bx - ax), q = Math.PI / 2;
  c.beginPath();
  c.moveTo(ax + Math.cos(th - q) * ra, ay + Math.sin(th - q) * ra);
  c.lineTo(bx + Math.cos(th - q) * rb, by + Math.sin(th - q) * rb);
  c.arc(bx, by, rb, th - q, th + q);
  c.lineTo(ax + Math.cos(th + q) * ra, ay + Math.sin(th + q) * ra);
  c.arc(ax, ay, ra, th + q, th + 3 * q);
  c.closePath();
}

/* A two-segment limb as one shape: both outlines go down first and both
   fills over them, so the joint has no seam. The segments taper, which
   is what stops an arm reading as a length of hose. */
function limb(c, p0, p1, p2, r0, r1, r2, col0, col1, lit) {
  c.save();
  c.lineJoin = 'round';
  c.lineWidth = 1.7; c.strokeStyle = PAL.ink;
  capsule(c, p0[0], p0[1], p1[0], p1[1], r0, r1); c.stroke();
  capsule(c, p1[0], p1[1], p2[0], p2[1], r1, r2); c.stroke();
  const seg = (a, b, ra, rb, col) => {
    const path = () => capsule(c, a[0], a[1], b[0], b[1], ra, rb);
    path(); c.fillStyle = col; c.fill();
    if (lit) rimLight(c, path, col, 0.5);
  };
  seg(p0, p1, r0, r1, col0);
  seg(p1, p2, r1, r2, col1);
  c.restore();
}

/* Secondary motion. The cape, the ringlets, the skirt and the ribbon
   used to move on a sine wave and a number the pose handed them, so the
   instant somebody stopped running the cape snapped back to hanging
   straight. Here the wind each frame is a damped spring chasing the
   pose's value, and vertical speed lifts things when falling: a stop
   swings the cape forward past the body and settles, a jump drags it
   down and a fall throws it up. State is per character, keyed by who is
   drawn, and resets whenever they jump a long way (a new screen). */
const SEC = {};
function settle(key, st, wind) {
  const t = st.t || 0;
  let s = SEC[key];
  if (!s || t < s.t || Math.abs(st.x - s.x) > 120 || Math.abs(st.y - s.y) > 120) {
    s = SEC[key] = { x: st.x, y: st.y, t, w: wind, wv: 0, l: 0, lv: 0 };
    return s;
  }
  const dt = t - s.t;
  if (dt <= 0) return s;                 /* drawn twice in one frame: hold */
  const h = Math.min(dt, 1 / 30);
  const vy = (st.y - s.y) / dt;
  s.wv += ((wind - s.w) * 70 - s.wv * 7.5) * h;
  s.w = clamp(s.w + s.wv * h, -0.7, 3.2);
  s.lv += ((clamp(vy / 520, -1, 1.3) - s.l) * 90 - s.lv * 11) * h;
  s.l += s.lv * h;
  s.x = st.x; s.y = st.y; s.t = t;
  return s;
}

function drawChar(c, who, st) {
  const L = LOOK[who];
  const H = L.height;
  const s = (st.scale || 1);
  const t = st.t || 0;
  const anim = st.anim || 'idle';
  const face = st.face >= 0 ? 1 : -1;

  c.save();
  c.globalAlpha = st.alpha === undefined ? 1 : st.alpha;
  c.translate(st.x, st.y);

  /* ground shadow (unflipped) */
  if (anim !== 'down' && st.shadow !== false) {
    const sh = clamp(1 - (st.airT || 0) * 1.4, 0.25, 1);
    c.save(); c.globalAlpha *= 0.35 * sh;
    ell(c, 0, 0, 11 * s * sh, 3.4 * s * sh); c.fillStyle = PAL.ink; c.fill();
    c.restore();
  }

  c.scale(face * s, s);

  /* hanging from the lasso: swing the whole body about the shoulders */
  if (st.tilt) { const sy = -H * 0.635; c.translate(0, sy); c.rotate(st.tilt * face); c.translate(0, -sy); }

  if (anim === 'down') { drawDowned(c, who, L, t, st); c.restore(); return; }

  /* ---------- pose solver ---------- */
  const P = pose(anim, t, st, who);
  /* a body turning its back on you, in two dimensions: squeeze it flat
     and out the other side, and everything it wears mirrors with it */
  if (P.turn !== undefined) c.scale(P.turn, 1);
  if (st.land) { P.squash -= st.land * 0.17; P.bob += st.land * 2.2; }
  /* the push-off: for the first few frames of a jump the body is still
     crouched and the arms still swinging back. Purely drawn - the jump
     itself left the ground on the frame the key went down.            */
  if (st.takeoff) {
    const k = st.takeoff;
    P.squash = lerp(P.squash, -0.15, k); P.bob += 2.4 * k;
    P.legF = { k: lerp(P.legF.k, 0.75, k), lift: lerp(P.legF.lift, 0, k) };
    P.legB = { k: lerp(P.legB.k, -0.75, k), lift: lerp(P.legB.lift, 0, k) };
    P.armF = { a: lerp(P.armF.a, -0.75, k), b: lerp(P.armF.b, 0.45, k) };
    P.armB = { a: lerp(P.armB.a, -0.95, k), b: lerp(P.armB.b, 0.40, k) };
  }
  const sec = settle(st.key || who, st, P.wind);
  P.wind = sec.w; P.lift = sec.l;

  /* body landmarks */
  const headTop = -H + P.bob,
        headBot = -H * 0.665 + P.bob,
        headCY = (headTop + headBot) / 2,
        headRy = (headBot - headTop) / 2,
        headRx = headRy * 0.90;
  const shY = -H * 0.635 + P.bob;
  const hipY = -H * 0.375 + P.bob * 0.6;
  const shW = 7.6 * L.build, hipW = 5.6 * L.build;

  /* hands that go somewhere on purpose: to the other one's hand, to the
     hat brim, behind an ear. Targets are in body space, measured from
     the feet; the arm is solved to reach them and blended in by k.     */
  let propSide = 1;
  if (st.hold && st.hold.k > 0) {
    const front = st.hold.x >= 0;
    reachArm(front ? P.armF : P.armB, (front ? 1 : -1) * shW * 0.78, shY,
             st.hold.x - P.hipShift, st.hold.y, st.hold.k, 'low');
    if (front) propSide = -1;             /* the lantern changes hands */
  }
  if (st.fidget && anim === 'idle') {
    const f = st.fidget, p = f.p;
    const e = smooth01(p / 0.22) * (1 - smooth01((p - 0.78) / 0.22));
    if (who === 'arshia') {
      /* a thumb and finger to the brim, a small tug, a nod */
      const tug = Math.sin(p * Math.PI * 6) * 0.9 * e;
      reachArm(P.armF, shW * 0.78, shY, 6.5, -H * 0.915 + P.bob + tug, e, 'front');
      P.headTilt += 0.09 * e;
    } else {
      /* fingers to the temple, then drawn back past the ear */
      const slide = smooth01((p - 0.3) / 0.4);
      reachArm(P.armF, shW * 0.78, shY, -0.5 - slide * 5,
               -H * 0.83 + P.bob - slide * 1.5, e, 'front');
      P.headTilt -= 0.12 * e;
      propSide = -1;
    }
  }

  /* squash-and-stretch about the feet */
  if (P.squash) c.scale(1 / (1 + P.squash), 1 + P.squash);

  /* The upper body rotates about the hips and carries the shoulder
     counter-rotation; the pelvis itself tips and shifts over the
     supporting leg. Legs are hung off the tipped pelvis so the whole
     figure moves as one linkage instead of as stacked boxes.          */
  const leanOn = () => {
    c.save();
    c.translate(P.hipShift, hipY);
    c.rotate(P.lean);
    c.translate(0, -hipY);
    /* shoulders turn against the pelvis, pivoting at the shoulder line */
    if (P.shTilt) { c.translate(0, shY); c.rotate(P.shTilt); c.translate(0, -shY); }
  };
  const leanOff = () => c.restore();
  /* the head's own frame: anything that belongs to the skull - including
     the hair falling behind the shoulders - has to be drawn in this or
     it detaches the moment the body leans */
  const headOn = () => { leanOn(); c.translate(P.headX, 0); c.rotate(P.headTilt); };
  /* the pelvis: tips with the stride, carries the legs with it */
  const hipOn = () => {
    c.save();
    c.translate(P.hipShift, hipY);
    c.rotate(P.hipTilt);
    c.translate(0, -hipY);
  };
  const hipOff = () => c.restore();

  /* ================= BACK LAYER ================= */

  /* ---- red cape, streaming behind him ---- */
  if (L.cape) {
    leanOn();
    const gust = Math.sin(t * 2.6) * 2.0 + P.wind * 7;
    const tail = hipY + 12 + P.wind * 2 - P.lift * 5;
    c.beginPath();
    c.moveTo(-shW * 0.86, shY - 1.6);
    c.quadraticCurveTo(-shW * 1.9 - gust * 0.5, (shY + hipY) / 2,
                       -shW * 2.1 - gust, tail);
    /* ragged hem */
    c.lineTo(-shW * 1.3 - gust * 0.7, tail - 3.2);
    c.lineTo(-shW * 0.9 - gust * 0.5, tail + 1.0);
    c.lineTo(-shW * 0.2 - gust * 0.3, tail - 3.6);
    c.lineTo(shW * 0.28 - gust * 0.15, tail - 1.4);
    c.quadraticCurveTo(shW * 0.75, (shY + hipY) / 2, shW * 0.62, shY - 1.6);
    c.closePath();
    ink(c, L.cape, 2);
    /* fold shading */
    c.save(); c.globalAlpha *= 0.30;
    c.beginPath();
    c.moveTo(-shW * 0.86, shY - 1.4);
    c.quadraticCurveTo(-shW * 1.5 - gust * 0.4, (shY + hipY) / 2, -shW * 1.5 - gust * 0.7, tail - 2);
    c.lineTo(-shW * 0.6 - gust * 0.4, tail - 1);
    c.quadraticCurveTo(-shW * 0.5, (shY + hipY) / 2, -shW * 0.3, shY - 1.4);
    c.closePath();
    c.fillStyle = L.capeDark || PAL.ink; c.fill();
    c.restore();
    /* clasp at the throat */
    ell(c, 0, shY - 0.6, 1.9, 1.9); ink(c, PAL.gold, 1.2);
    leanOff();
  }

  /* the big curly mass that sits behind the shoulders, in the head's frame */
  if (L.hairStyle === 'curlyLong') {
    headOn();
    const sway = Math.sin(t * 3 + 1) * (1.2 + P.wind * 2) - P.lift * 1.5;
    const cs = L.curlSize || 2.8;
    const back = [];
    for (let i = 0; i <= 9; i++) {
      const f = i / 9;                                  /* 0 = crown, 1 = tips */
      const yy = headCY + headRy * (0.1 + f * 2.35);
      const spread = headRx * (0.98 + Math.sin(f * 3.1) * 0.20);
      back.push([-spread + sway * f * f * 1.4, yy, cs * (0.95 - f * 0.22), f]);
      back.push([spread * 0.92 + sway * f * f * 1.3, yy + headRy * 0.18, cs * (0.92 - f * 0.22), f]);
      if (i % 2 === 0) back.push([sway * f * f - headRx * 0.15, yy + headRy * 0.3, cs * (0.85 - f * 0.18), f]);
    }
    curlMass(c, back, L, 0.9, 0.25);
    leanOff();
  }

  /* back arm */
  leanOn();
  drawArm(c, L, shY, -shW * 0.78, P.armB, -1, st, who, propSide);
  leanOff();

  /* back leg, hung off the tipped pelvis */
  hipOn();
  drawLeg(c, L, hipY, -hipW * 0.62, P.legB, -1, H);
  hipOff();

  /* ================= TORSO ================= */
  let skirtCmds = null;
  leanOn();
  if (who === 'rojina') {
    /* prairie dress : fitted bodice + flared skirt */
    const skirtY = hipY + 1, skirtBot = -H * 0.16;
    const flare = 9.5 + Math.abs(P.legF.k) * 1.2 + P.wind * 2 + Math.abs(P.lift) * 2.4;
    /* the hem trails the way she is travelling and rides up in a fall */
    const trail = -P.wind * 0.9, hemY = skirtBot - Math.max(0, P.lift) * 2.2;
    /* bodice : a real ribcage and a nipped waist under the dress */
    const bodice = () => torsoPath(c, shY, hipY - 1, shW, hipW * 0.95, 0.72);
    bodice(); ink(c, L.dress, 2);
    rimLight(c, bodice, L.dress);
    torsoShade(c, shY, hipY - 1, shW, hipW * 0.95, L.dressDark);
    /* buttons down the bodice */
    for (let i = 0; i < 3; i++) {
      ell(c, 0.4, shY + 4.2 + i * 2.6, 0.62, 0.62); ink(c, L.collar, 0.5);
    }
    /* skirt */
    skirtCmds = () => {
      c.moveTo(-hipW, skirtY - 2);
      c.lineTo(hipW, skirtY - 2);
      c.quadraticCurveTo(flare * 0.9 + trail * 0.5, (skirtY + hemY) / 2, flare + trail, hemY);
      for (let i = 3; i >= -3; i--) c.lineTo(flare * (i / 3) + trail, hemY + (i % 2 ? 1.6 : 0));
      c.quadraticCurveTo(-flare * 0.9 + trail * 0.5, (skirtY + hemY) / 2, -hipW, skirtY - 2);
      c.closePath();
    };
    const skirt = () => { c.beginPath(); skirtCmds(); };
    skirt(); ink(c, L.dress, 2);
    rimLight(c, skirt, L.dress);
    /* two soft folds falling from the waist */
    c.save(); c.globalAlpha *= 0.28;
    c.strokeStyle = L.dressDark; c.lineWidth = 0.9; c.lineCap = 'round';
    [-0.45, 0.35].forEach(k => {
      c.beginPath();
      c.moveTo(hipW * k, skirtY + 1);
      c.quadraticCurveTo(flare * k * 0.9 + trail * 0.4, (skirtY + hemY) / 2, flare * k * 1.1 + trail, hemY - 0.6);
      c.stroke();
    });
    c.restore();
    /* lace along the hem */
    for (let i = -3; i <= 3; i++) {
      c.beginPath();
      c.arc(flare * (i / 3.4) + trail, hemY + 0.9, 1.15, 0, Math.PI);
      c.fillStyle = L.collar; c.fill();
      c.lineWidth = 0.5; c.strokeStyle = PAL.ink; c.stroke();
    }
    /* apron */
    c.beginPath();
    c.moveTo(-hipW * 0.62, hipY);
    c.lineTo(hipW * 0.62, hipY);
    c.quadraticCurveTo(flare * 0.55 + trail * 0.5, hemY - 1, flare * 0.42 + trail, hemY + 0.5);
    c.lineTo(-flare * 0.42 + trail, hemY + 0.5);
    c.quadraticCurveTo(-flare * 0.55 + trail * 0.5, hemY - 1, -hipW * 0.62, hipY);
    c.closePath();
    ink(c, L.apron, 1.6);
    /* skirt shade */
    c.save(); c.globalAlpha *= 0.22;
    poly(c, [[hipW * 0.2, skirtY], [hipW, skirtY], [flare + trail, hemY], [flare * 0.35 + trail, hemY]]);
    c.fillStyle = L.dressDark; c.fill(); c.restore();
    /* collar */
    poly(c, [[-3.6, shY + 0.5], [3.6, shY + 0.5], [2.6, shY + 3.4], [-2.6, shY + 3.4]]);
    ink(c, L.collar, 1.4);
    /* waist ribbon */
    c.fillStyle = L.hatBand;
    c.fillRect(-hipW * 0.98, hipY - 2.6, hipW * 1.96, 2.6);
    c.strokeStyle = PAL.ink; c.lineWidth = 1;
    c.strokeRect(-hipW * 0.98, hipY - 2.6, hipW * 1.96, 2.6);
    /* the black heart pendant - glows as the two of them close the gap */
    if (L.pendant) drawPendant(c, L, headBot + 0.6, t, st.closeness || 0);
  } else {
    /* black shirt over a real ribcage */
    const shirt = () => torsoPath(c, shY, hipY, shW, hipW, 0.88);
    shirt(); ink(c, L.shirt, 2);
    rimLight(c, shirt, L.shirt, 0.35);
    torsoShade(c, shY, hipY, shW, hipW, '#0d0b10');
    /* open canvas trail-coat, hanging past the belt */
    const coatBot = hipY + 5.5;
    [-1, 1].forEach(sgn => {
      const panel = () => {
        c.beginPath();
        c.moveTo(sgn * shW, shY + 1.2);
        c.quadraticCurveTo(sgn * shW * 0.55, shY - 1.2, sgn * shW * 0.18, shY + 0.6);
        c.lineTo(sgn * hipW * 0.42, coatBot);
        c.lineTo(sgn * (hipW + 1.6), coatBot);
        c.quadraticCurveTo(sgn * (hipW + 2.0), (shY + hipY) / 2, sgn * shW, shY + 1.2);
        c.closePath();
      };
      panel(); ink(c, L.vest, 1.8);
      if (sgn > 0) rimLight(c, panel, L.vest);
      /* stitching down the front edge */
      c.save();
      c.setLineDash([0.8, 0.9]); c.lineWidth = 0.45; c.strokeStyle = L.vestDark;
      c.beginPath();
      c.moveTo(sgn * shW * 0.28, shY + 1.4);
      c.lineTo(sgn * hipW * 0.54, coatBot - 0.8);
      c.stroke();
      c.restore();
      /* the lapel folded back at the collar */
      poly(c, [[sgn * shW * 0.20, shY + 0.7], [sgn * shW * 0.66, shY + 0.4], [sgn * shW * 0.34, shY + 5.2]]);
      ink(c, mixHex(L.vest, '#fff4e0', 0.18), 0.9);
    });
    /* a flapped pocket on the chest */
    poly(c, [[shW * 0.36, (shY + hipY) / 2 - 0.4], [shW * 0.86, (shY + hipY) / 2 - 0.2],
             [shW * 0.84, (shY + hipY) / 2 + 1.3], [shW * 0.38, (shY + hipY) / 2 + 1.1]]);
    ink(c, L.vestDark, 0.8);
    /* vest shade */
    c.save(); c.globalAlpha *= 0.3;
    poly(c, [[shW * 0.55, shY], [shW, shY], [hipW, hipY], [hipW * 0.6, hipY]]);
    c.fillStyle = L.vestDark; c.fill(); c.restore();
    /* sheriff-ish star pin */
    star(c, -shW * 0.55, shY + 4.2, 2.1, 5);
    ink(c, PAL.gold, 0.8);
    /* belt + buckle */
    c.fillStyle = L.belt; c.fillRect(-hipW - 0.6, hipY - 2.6, hipW * 2 + 1.2, 2.9);
    c.strokeStyle = PAL.ink; c.lineWidth = 1; c.strokeRect(-hipW - 0.6, hipY - 2.6, hipW * 2 + 1.2, 2.9);
    c.fillStyle = L.buckle; c.fillRect(-1.6, hipY - 2.4, 3.2, 2.5);
    /* holster */
    poly(c, [[hipW * 0.4, hipY + 0.4], [hipW + 1.4, hipY + 0.4], [hipW + 1.0, hipY + 5], [hipW * 0.5, hipY + 5]]);
    ink(c, L.boots, 1.2);
    c.fillStyle = PAL.metalDk; c.fillRect(hipW * 0.6, hipY - 0.6, 1.6, 2.2);
  }

  leanOff();   /* torso group ends */

  /* ================= FRONT LEG =================
     Hers is clipped to everything OUTSIDE the skirt: the thigh under the
     dress is not painted across the front of it, but a kick or a stride
     that carries the leg past the hem still shows - and because nothing
     changes layer, it never pops in front mid-stride. */
  if (skirtCmds) {
    c.save();
    const m = c.getTransform();
    leanOn();
    c.beginPath(); c.rect(-500, -500, 1000, 1000); skirtCmds();
    c.clip('evenodd');
    c.setTransform(m);
  }
  hipOn();
  drawLeg(c, L, hipY, hipW * 0.62, P.legF, 1, H);
  hipOff();
  if (skirtCmds) { c.restore(); c.restore(); }

  /* ================= HEAD ================= */
  leanOn();
  c.save();
  c.translate(P.headX, 0);
  c.rotate(P.headTilt);

  drawNeck(c, L, headBot, headCY, headRy);
  drawSkull(c, L, headCY, headRx, headRy);

  drawFace(c, L, headCY, headRx, headRy, st, t);

  /* ---------- HAIR + HAT (st.hideHair strips them for design work) ---------- */
  if (!st.hideHair) {
    drawHair(c, L, headCY, headRx, headRy, t, P);
    if (who === 'arshia') drawStetson(c, L, headCY, headRx, headRy, P);
    else drawBonnet(c, L, headCY, headRx, headRy, P, t);
  }

  /* ---------- GLASSES (last, so the frames stay readable) ---------- */
  if (L.glasses) drawGlasses(c, L, headCY, headRx, headRy);

  c.restore();  /* head transform */

  /* bandana over the neck, drawn after head so it reads on top */
  if (who === 'arshia') {
    const w = Math.sin(t * 4) * 0.6 + P.wind * 2;
    poly(c, [[-3.6, headBot + 0.4], [3.6, headBot + 0.4],
             [2.4 + w, headBot + 5.4], [-2.6 + w, headBot + 5.0]]);
    ink(c, L.bandana, 1.6);
    c.save(); c.globalAlpha *= 0.35;
    poly(c, [[0.6, headBot + 0.8], [3.4, headBot + 0.8], [2.3 + w, headBot + 5.2], [0.4 + w, headBot + 5.2]]);
    c.fillStyle = PAL.ink; c.fill(); c.restore();
  }

  /* front arm last (in front of torso) */
  drawArm(c, L, shY, shW * 0.78, P.armF, 1, st, who, propSide);
  leanOff();   /* head + front arm group ends */

  c.restore();
}

/* ---------------- pose solver ----------------
   Beyond the raw limb angles this produces:
     lean    - the whole upper body rotates about the hips
     squash  - squash-and-stretch about the feet
     headTilt- deliberately lags the lean so the head trails the body
   Those three are what stop the poses reading as a mannequin.        */
/* =====================================================================
   THE DANCES

   Ten of them, on the number keys, and each one is a different pose
   solver for each of the two of them -- so pressing 4 puts him in a
   stiff line-dance kick and her in a can-can, not the same animation
   twice. What makes one dance read as a different dance from across a
   room is the SILHOUETTE, so each one moves a different part of the
   body: the hips, the whole torso turning, an arm over the head, a leg
   in the air, the shoulders alone, the feet sliding, everything at right
   angles, one arm up, both arms across, or the whole body folded over.

   `turn` is how a two-dimensional body spins: scaling it horizontally
   through zero and out the other side mirrors everything it is wearing,
   which is exactly what happens when somebody turns their back on you.
   ===================================================================== */
function dancePose(n, who, t, P) {
  const her = who === 'rojina';
  const TAU = Math.PI * 2;

  switch (n) {
    /* ---- 1. TWO-STEP : the hips. Weight thrown side to side. ------- */
    case 1: {
      const w = t * (her ? 5.4 : 4.4);
      const sway = Math.sin(w), step = Math.abs(Math.sin(w));
      P.hipShift = sway * (her ? 3.8 : 3.0);
      P.hipTilt = sway * (her ? 0.22 : 0.17);
      P.shTilt = -sway * 0.17;
      P.lean = sway * 0.09;
      P.bob = -step * (her ? 2.6 : 2.0);
      P.squash = -0.05 * step;
      P.headTilt = -sway * 0.12;
      P.headX = sway * 1.1;
      if (her) {
        /* hands on her hips, heels tapping */
        P.armF = { a: 0.95, b: 1.55 }; P.armB = { a: 0.80, b: 1.58 };
        P.legF = { k: sway * 0.42, lift: Math.max(0, sway) * 3.8 };
        P.legB = { k: -sway * 0.42, lift: Math.max(0, -sway) * 3.8 };
        P.wind = 1.5;
      } else {
        /* arms folded, boots stamping */
        P.armF = { a: -0.90, b: 1.30 }; P.armB = { a: -0.80, b: 1.34 };
        P.legF = { k: sway * 0.32, lift: Math.max(0, sway) * 4.4 };
        P.legB = { k: -sway * 0.32, lift: Math.max(0, -sway) * 4.4 };
        P.wind = 0.8;
      }
      break;
    }

    /* ---- 2. SPIN : the whole body turns right round. --------------- */
    case 2: {
      const w = t * (her ? 4.2 : 3.2);
      const c = Math.cos(w);
      /* Never anywhere near edge-on. At a tenth of a width he was a
         three pixel sliver, which reads as the game breaking rather than
         as somebody turning their back on you. A third of a width still
         flips everything he wears at the crossing, which is the part
         that sells it. */
      P.turn = Math.sign(c || 1) * (0.34 + 0.66 * Math.abs(c));
      P.bob = -Math.abs(Math.sin(w * 2)) * 1.2;
      P.lean = Math.sin(w) * 0.07;
      P.headTilt = Math.sin(w + 0.6) * 0.16;
      P.wind = 2.2;
      if (her) {
        /* arms out, skirt flying */
        P.armF = { a: -1.62, b: 0.10 }; P.armB = { a: -1.55, b: 0.12 };
        P.legF = { k: 0.42, lift: 0.8 }; P.legB = { k: -0.30, lift: 0 };
        P.squash = 0.05;
        P.hipTilt = Math.sin(w) * 0.10;
      } else {
        /* one hand holding the hat on */
        P.armF = { a: -2.50, b: 0.55 }; P.armB = { a: 0.55, b: 0.90 };
        P.legF = { k: 0.30, lift: 0 }; P.legB = { k: -0.22, lift: 0.6 };
        P.hipShift = Math.sin(w) * 1.0;
      }
      break;
    }

    /* ---- 3. TWIRL : an arm working over the head. ------------------ */
    case 3: {
      const w = t * (her ? 3.4 : 4.0);
      P.bob = Math.sin(w * 2) * 0.8 - 0.4;
      P.lean = Math.sin(w) * 0.10;
      P.hipShift = -Math.sin(w) * 1.3;
      P.headTilt = Math.sin(w) * 0.10 - 0.06;
      P.wind = 1.4;
      if (her) {
        /* the lantern swung low through a figure of eight */
        P.armF = { a: -0.55 + Math.sin(w) * 1.15, b: 0.22 };
        P.armB = { a: 0.70, b: 1.30 };
        P.shTilt = Math.sin(w) * 0.16;
        P.hipTilt = -Math.sin(w) * 0.10;
        P.legF = { k: 0.26, lift: 0 }; P.legB = { k: -0.20, lift: 0 };
      } else {
        /* the rope going round and round above his hat */
        P.armF = { a: -2.62 + Math.sin(w) * 0.30, b: -0.34 + Math.cos(w) * 0.30 };
        P.armB = { a: 0.60, b: 1.20 };
        P.shTilt = -Math.sin(w) * 0.13;
        P.legF = { k: 0.20 + Math.sin(w) * 0.12, lift: 0 };
        P.legB = { k: -0.18, lift: 0 };
      }
      break;
    }

    /* ---- 4. KICK LINE : a leg in the air. -------------------------- */
    case 4: {
      const w = t * (her ? 4.6 : 3.8);
      const s = Math.sin(w);
      const kick = Math.max(0, s), kick2 = Math.max(0, -s);
      P.lean = -0.10 - Math.abs(s) * (her ? 0.16 : 0.09);
      P.bob = -Math.abs(s) * 0.8;
      P.hipTilt = s * 0.13;
      P.shTilt = -s * 0.08;
      P.headTilt = -Math.abs(s) * 0.08;
      if (her) {
        /* a can-can: much higher, one hand holding her hem out */
        P.legF = { k: kick * 2.15, lift: kick * 5.6 };
        P.legB = { k: kick2 * 1.05, lift: kick2 * 3.0 };
        /* straight up rather than across - at -2.30 it came down over
           her hat and covered her face on every second beat */
        P.armF = { a: -2.80, b: -0.16 };
        P.armB = { a: 0.95, b: 0.35 };
        P.wind = 2.4;
        P.squash = 0.05;
      } else {
        /* stiff and square, arms straight out fore and aft for balance -
           both pointing backwards read as him pointing at something */
        P.legF = { k: kick * 1.30, lift: kick * 3.6 };
        P.legB = { k: kick2 * 0.75, lift: kick2 * 2.0 };
        P.armF = { a: 1.40, b: 0 };
        P.armB = { a: -1.45, b: 0 };
        P.wind = 1.0;
      }
      break;
    }

    /* ---- 5. SHIMMY : the shoulders, and nothing else. -------------- */
    case 5: {
      const w = t * (her ? 17 : 13);
      const q = Math.sin(w);
      P.shTilt = q * (her ? 0.24 : 0.17);
      P.hipTilt = -q * 0.05;
      P.hipShift = q * 0.5;
      P.bob = Math.abs(Math.sin(w * 0.5)) * -0.7;
      P.lean = 0.03;
      if (her) {
        /* the whole torso in it, and her hair goes everywhere */
        P.headTilt = -q * 0.16;
        P.headX = q * 1.4;
        P.armF = { a: -1.15, b: 0.95 }; P.armB = { a: -1.05, b: 1.00 };
        P.wind = 2.6;
        P.squash = q * 0.02;
      } else {
        /* shoulders only, arms hanging loose, feet planted */
        P.headTilt = -q * 0.06;
        P.armF = { a: 0.10 + q * 0.22, b: 0.18 };
        P.armB = { a: -0.05 - q * 0.22, b: 0.16 };
        P.wind = 1.2;
      }
      P.legF = { k: 0.06, lift: 0 }; P.legB = { k: -0.06, lift: 0 };
      break;
    }

    /* ---- 6. SLIDE : the feet, going nowhere. ----------------------- */
    case 6: {
      const w = t * (her ? 2.6 : 2.2);
      const g = Math.sin(w);
      P.hipShift = g * 3.0;
      P.lean = -0.14 - g * 0.06;
      P.bob = -0.4 + Math.abs(g) * 0.5;
      P.headTilt = g * 0.10 - 0.06;
      P.headX = g * 1.6;
      P.squash = -0.03;
      if (her) {
        /* up on her toes, one arm drawn along the line of the glide */
        P.legF = { k: g * 1.35, lift: Math.max(0, g) * 1.2 };
        P.legB = { k: -g * 0.55, lift: 0 };
        P.armF = { a: -1.95 - g * 0.30, b: 0.16 };
        P.armB = { a: 0.55, b: 0.55 };
        P.shTilt = -g * 0.12;
        P.wind = 1.8;
      } else {
        /* leaning back off the heel, arms trailing behind the slide */
        P.legF = { k: g * 1.65, lift: 0 };
        P.legB = { k: -g * 0.85, lift: Math.max(0, -g) * 1.4 };
        P.armF = { a: -0.75 - g * 0.55, b: 0.30 };
        P.armB = { a: -0.30 - g * 0.40, b: 0.36 };
        P.shTilt = g * 0.10;
        P.wind = 1.5;
      }
      break;
    }

    /* ---- 7. ROBOT : time itself goes in steps. --------------------- */
    case 7: {
      const rate = her ? 8 : 6;
      const q = Math.floor(t * rate);            /* stepped, not smooth */
      const a = (q % 4) / 4 * TAU;
      const s = Math.sin(a), c2 = Math.cos(a);
      P.bob = (q % 2 ? -1.1 : 0);
      P.squash = (q % 2 ? 0.03 : -0.03);
      P.headTilt = s * 0.20;
      P.headX = c2 * 1.2;
      P.shTilt = s * 0.10;
      P.hipShift = c2 * 1.0;
      P.lean = 0;
      if (her) {
        /* compact, quick, elbows tight in */
        P.armF = { a: -1.57 * (q % 2), b: 1.57 };
        P.armB = { a: -1.57 * ((q + 1) % 2), b: 1.57 };
        P.wind = 0.2;
      } else {
        /* wide and square: everything at a right angle */
        P.armF = { a: q % 2 ? -1.57 : 0, b: 1.57 };
        P.armB = { a: q % 2 ? 0 : -1.57, b: 1.57 };
        P.wind = 0.1;
      }
      P.legF = { k: (q % 2 ? 0.30 : 0), lift: 0 };
      P.legB = { k: (q % 2 ? 0 : 0.30), lift: 0 };
      break;
    }

    /* ---- 8. STAR POINT : one arm up, hip out the other way. -------- */
    case 8: {
      const w = t * (her ? 3.8 : 3.0);
      const s = Math.sign(Math.sin(w)) || 1;
      const punch = Math.abs(Math.sin(w * 2));
      P.hipShift = -s * 2.2;
      P.hipTilt = -s * 0.14;
      P.shTilt = s * 0.12;
      P.lean = s * 0.06;
      P.bob = -punch * 1.0;
      P.headTilt = s * 0.16;
      if (her) {
        /* one arm straight up, one thrown out to the side. Framing her
           face put her own forearm across it on every other beat. */
        P.armF = { a: -2.74 - punch * 0.16, b: -0.10 };
        P.armB = { a: -1.30 + punch * 0.55, b: 0.30 };
        P.wind = 1.6;
      } else {
        /* the full arm, up the diagonal, other hand on the belt */
        P.armF = { a: -2.55 - punch * 0.30, b: -0.22 };
        P.armB = { a: 0.85, b: 1.15 };
        P.wind = 1.1;
      }
      P.legF = { k: 0.34, lift: 0 }; P.legB = { k: -0.26, lift: punch * 0.8 };
      break;
    }

    /* ---- 9. SWING ARMS : both arms across, hips the other way. ----- */
    case 9: {
      const w = t * (her ? 7.0 : 5.2);
      const s = Math.sin(w);
      const amp = her ? 1.15 : 1.45;
      P.armF = { a: -0.55 + s * amp, b: 0.55 };
      P.armB = { a: -0.45 + s * amp, b: 0.60 };
      /* the hips deliberately fight the arms, which is the whole joke */
      P.hipShift = -s * (her ? 2.0 : 2.6);
      P.hipTilt = -s * 0.15;
      P.shTilt = s * 0.13;
      P.lean = s * 0.05;
      P.bob = -Math.abs(s) * 0.9;
      P.headTilt = -s * 0.10;
      P.headX = -s * 0.8;
      P.legF = { k: -s * 0.22, lift: 0 };
      P.legB = { k: s * 0.22, lift: 0 };
      P.wind = her ? 1.9 : 1.2;
      break;
    }

    /* ---- 10. TAKE A BOW : the whole body folded over. -------------- */
    default: {
      const w = t * 1.5;
      const dip = (Math.sin(w) + 1) / 2;          /* 0 up, 1 all the way down */
      if (her) {
        /* a curtsy: one leg tucked behind, knees out, hem held wide */
        P.bob = dip * 5.0;
        P.squash = -dip * 0.14;
        P.lean = dip * 0.10;
        P.headTilt = dip * 0.30;
        P.hipTilt = dip * 0.10;
        P.legF = { k: dip * 0.75, lift: 0 };
        P.legB = { k: -dip * 1.15, lift: dip * 1.2 };
        P.armF = { a: 0.55 + dip * 0.65, b: 0.30 };
        P.armB = { a: 0.45 + dip * 0.60, b: 0.28 };
        P.wind = 0.6 + dip * 1.2;
      } else {
        /* the hat comes off and sweeps across him */
        P.bob = dip * 2.0;
        P.lean = dip * 0.95;                      /* folded at the waist */
        P.headTilt = dip * 0.30;                  /* and the head goes with it */
        P.squash = -dip * 0.05;
        P.armF = { a: -0.30 - dip * 1.15, b: 0.20 + dip * 0.30 };
        P.armB = { a: 0.35 + dip * 0.75, b: 0.95 };
        P.legF = { k: dip * 0.30, lift: 0 };
        P.legB = { k: -dip * 0.45, lift: 0 };
        P.wind = 0.5 + dip * 1.6;
      }
      break;
    }
  }
  return P;
}

function pose(anim, t, st, who) {
  const P = { bob: 0, headTilt: 0, headX: 0, wind: 0, lean: 0, squash: 0,
              /* contrapposto: the pelvis tips one way and the shoulder
                 girdle answers the other. Without this every pose reads
                 as a mannequin standing to attention.                  */
              hipTilt: 0, shTilt: 0, hipShift: 0,
              armF: { a: 0.15, b: 0.1 }, armB: { a: -0.15, b: 0.1 },
              legF: { k: 0, lift: 0 }, legB: { k: 0, lift: 0 } };
  const spd = st.speed === undefined ? 1 : st.speed;

  /* the number keys: dance1 .. dance10, a different solver each, and a
     different one again for each of the two of them */
  if (anim.length > 5 && anim.slice(0, 5) === 'dance')
    return dancePose(parseInt(anim.slice(5), 10) || 1, who, t, P);

  switch (anim) {
    case 'run': {
      const w = t * (9.5 + spd * 4);
      /* two footfalls per cycle, so the bounce runs at double rate */
      const bounce = Math.abs(Math.sin(w));
      const plant = Math.pow(bounce, 3);              /* sharp at the plant */
      P.bob = -bounce * 2.3;
      P.squash = -0.07 * plant + 0.05 * (1 - bounce); /* compress on contact */
      P.lean = 0.17 + spd * 0.05 + Math.sin(w * 2) * 0.02;
      /* the stride twists the pelvis; the shoulders swing the other way
         to cancel it, which is what makes a run read as a run          */
      P.hipTilt = Math.sin(w) * 0.10;
      P.shTilt = -Math.sin(w) * 0.13;
      P.hipShift = Math.sin(w) * 0.7;
      P.headTilt = 0.06 - Math.sin(w * 2 - 0.9) * 0.045;   /* trails the body */
      P.headX = 0.9 + Math.sin(w * 2 - 1.2) * 0.35;
      /* legs : long reach forward, tucked heel behind */
      const sw = Math.sin(w), sb = Math.sin(w + Math.PI);
      P.legF = { k: sw * 1.05, lift: Math.max(0, sb) * 3.4 };
      P.legB = { k: sb * 1.05, lift: Math.max(0, sw) * 3.4 };
      /* arms swing opposite the legs, elbow bends hardest at the front */
      P.armF = { a: -sw * 1.00 - 0.12, b: 0.42 + Math.max(0, -sw) * 0.55 };
      P.armB = { a: -sb * 1.00 - 0.12, b: 0.42 + Math.max(0, -sb) * 0.55 };
      P.wind = 1.0 + spd * 0.3;
      break;
    }
    case 'swing': {
      /* Hanging off the lasso. Both arms go up to the rope, the body
         trails the sweep, and the legs kick out the way they would on a
         real rope. `st.swing` is how hard he is travelling, so the pose
         leans further out the faster the arc.                          */
      const sw = clamp(st.swing || 0, 0, 1.6);
      const dir = Math.sign(st.swing || 0) || 1;
      const kick = Math.sin(t * 5.5) * 0.16;
      P.armF = { a: -2.85 + kick * 0.25, b: -0.10 };
      P.armB = { a: -2.98 - kick * 0.25, b: -0.06 };
      P.legF = { k: 0.55 + sw * 0.55 + kick, lift: 1.4 };
      P.legB = { k: 0.20 + sw * 0.35 - kick, lift: 0.6 };
      P.lean = -0.10 - sw * 0.14;
      P.headTilt = 0.14 + sw * 0.10 + kick * 0.3;
      P.bob = -1.6;
      P.squash = 0.06;
      P.wind = 1.5 + sw * 1.3;                /* cape and hair stream out */
      break;
    }
    case 'jump':
      P.squash = 0.10;                       /* stretched on the way up */
      P.lean = -0.06; P.bob = -1.2;
      P.legF = { k: -0.62, lift: 3.6 }; P.legB = { k: 0.42, lift: 1.6 };
      P.armF = { a: -2.15, b: 0.30 }; P.armB = { a: -1.70, b: 0.48 };
      P.headTilt = -0.10; P.wind = 1.4;
      break;
    case 'fall':
      P.squash = 0.04;
      P.lean = 0.10;
      P.legF = { k: 0.50, lift: 1.4 }; P.legB = { k: -0.30, lift: 2.2 };
      P.armF = { a: -2.55, b: 0.18 }; P.armB = { a: -2.35, b: 0.24 };
      P.headTilt = 0.12; P.wind = 1.6;
      break;
    case 'crouch':
      P.bob = 5.5; P.squash = -0.16; P.lean = 0.24;
      P.legF = { k: 0.95, lift: 0 }; P.legB = { k: -0.95, lift: 0 };
      P.armF = { a: 0.62, b: 0.95 }; P.armB = { a: 0.52, b: 0.92 };
      P.headTilt = 0.10;
      break;
    case 'push': {
      const w = t * 7;
      P.hipTilt = -0.06; P.shTilt = 0.10;
      P.armF = { a: -1.42, b: 0.06 }; P.armB = { a: -1.28, b: 0.16 };
      P.lean = 0.30; P.headTilt = -0.10; P.headX = 1.2;
      P.legF = { k: -0.65, lift: 0 }; P.legB = { k: 0.55, lift: 0 };
      P.bob = Math.sin(w) * 0.6; P.squash = Math.sin(w) * 0.03;
      break;
    }
    case 'aim':
      /* squared up to the target: hips open, shoulders turn into it */
      P.hipTilt = 0.05; P.shTilt = -0.09; P.hipShift = 0.8;
      P.armF = { a: 1.50, b: 0.06 }; P.armB = { a: -0.34, b: 0.72 };
      P.lean = -0.05; P.headTilt = 0.04;
      P.legF = { k: -0.38, lift: 0 }; P.legB = { k: 0.34, lift: 0 };
      break;
    case 'cheer': {
      const w = t * 6;
      const hop = Math.abs(Math.sin(w));
      P.armF = { a: -2.65, b: -0.32 }; P.armB = { a: -2.52, b: -0.26 };
      P.bob = -hop * 2.6;
      P.squash = 0.08 * hop - 0.05 * (1 - hop);
      P.headTilt = Math.sin(w * 0.5) * 0.10;
      P.lean = Math.sin(w * 0.5) * 0.05;
      P.legF = { k: 0.20, lift: hop * 1.4 }; P.legB = { k: -0.20, lift: hop * 1.4 };
      P.wind = 1.1;
      break;
    }
    case 'kiss':
      P.hipTilt = 0.04; P.shTilt = -0.10; P.hipShift = 0.9;
      P.armF = { a: -1.05, b: 0.72 }; P.armB = { a: -0.58, b: 0.62 };
      P.lean = 0.16; P.headTilt = 0.20; P.headX = 1.8; P.bob = -0.5;
      P.legF = { k: 0.18, lift: 0 }; P.legB = { k: -0.14, lift: 0 };
      break;
    case 'hurt':
      P.armF = { a: -2.25, b: 0.42 }; P.armB = { a: -2.05, b: 0.50 };
      P.lean = -0.24; P.headTilt = -0.26; P.bob = -1.3; P.squash = 0.06;
      break;
    case 'ride': {
      const w = t * 9;
      P.bob = Math.sin(w) * 1.3; P.squash = Math.sin(w) * 0.04;
      P.lean = 0.22 + Math.sin(w) * 0.04;
      P.headTilt = -0.10 - Math.sin(w - 0.7) * 0.05;
      P.armF = { a: -1.18, b: 0.52 }; P.armB = { a: -1.10, b: 0.50 };
      P.legF = { k: 1.20, lift: 0 }; P.legB = { k: 1.05, lift: 0 };
      P.wind = 1.6;
      break;
    }
    default: {
      /* idle : breathing, a slow weight shift, and a head that drifts
         a beat behind the shoulders                                   */
      const w = t * 1.9;
      const shift = Math.sin(w * 0.42);
      P.bob = Math.sin(w) * 0.55 - 0.25;
      P.squash = Math.sin(w) * 0.012;
      P.lean = shift * 0.030;
      /* weight settles onto one leg: that hip rides up, the shoulder on
         the same side drops, and the head rights itself against both */
      P.hipShift = shift * 1.1;
      P.hipTilt = shift * 0.055;
      P.shTilt = -shift * 0.075;
      P.headTilt = Math.sin(w * 0.42 - 0.75) * 0.055 + shift * 0.030;
      P.headX = shift * 0.45;
      P.armF = { a: 0.15 + Math.sin(w - 0.5) * 0.075 + shift * 0.05,
                 b: 0.26 + Math.sin(w - 0.9) * 0.055 };
      P.armB = { a: -0.05 + Math.sin(w - 0.3) * 0.065 - shift * 0.05,
                 b: 0.22 + Math.sin(w - 0.7) * 0.045 };
      P.legF = { k: 0.05 + shift * 0.05, lift: 0 };
      P.legB = { k: -0.07 - shift * 0.05, lift: 0 };
      P.wind = 0.35 + Math.sin(w * 0.5) * 0.2;
    }
  }
  return P;
}

/* ---------------- torso ----------------
   One silhouette both of them share: the shoulder line dips at the neck,
   the ribcage carries the widest point just under the arm, the waist
   pinches, and the hips flare back out. A single trapezoid read as a
   cardboard box; this reads as a body.                                */
function torsoPath(c, shY, hipY, shW, hipW, waistK) {
  const h = hipY - shY;
  const ww = hipW * (waistK === undefined ? 0.80 : waistK);
  c.beginPath();
  c.moveTo(-shW, shY + 1.4);
  c.quadraticCurveTo(-shW * 0.36, shY - 2.6, 0, shY - 2.1);
  c.quadraticCurveTo(shW * 0.36, shY - 2.6, shW, shY + 1.4);
  c.bezierCurveTo(shW * 1.08, shY + h * 0.24, ww * 0.98, shY + h * 0.64, hipW, hipY);
  c.lineTo(-hipW, hipY);
  c.bezierCurveTo(-ww * 0.98, shY + h * 0.64, -shW * 1.08, shY + h * 0.24, -shW, shY + 1.4);
  c.closePath();
}

/* form shading laid inside whatever garment covers the torso */
function torsoShade(c, shY, hipY, shW, hipW, dark) {
  const h = hipY - shY;
  c.save();
  torsoPath(c, shY, hipY, shW, hipW);
  c.clip();
  /* the back half turns away from the light */
  c.globalAlpha *= 0.26;
  c.beginPath();
  c.moveTo(-shW * 1.4, shY - 4);
  c.quadraticCurveTo(-shW * 0.16, shY + h * 0.4, -shW * 0.34, hipY + 4);
  c.lineTo(-shW * 1.4, hipY + 4);
  c.closePath();
  c.fillStyle = dark; c.fill();
  /* a soft hollow under the ribs */
  c.globalAlpha = 0.16;
  ell(c, shW * 0.10, shY + h * 0.60, shW * 0.62, h * 0.22);
  c.fillStyle = dark; c.fill();
  c.restore();
  /* collarbone */
  c.save();
  c.globalAlpha *= 0.30;
  c.beginPath();
  c.moveTo(-shW * 0.52, shY + 2.2);
  c.quadraticCurveTo(0, shY + 3.6, shW * 0.52, shY + 2.2);
  c.lineWidth = 1; c.strokeStyle = PAL.ink; c.stroke();
  c.restore();
}

/* ---------------- limbs ----------------
   Two-segment limbs with a real joint. Angles are measured from
   straight-down, positive swinging forward (toward the facing side).  */

function shade(col, amt) { return mixHex(col, '#160d1c', amt); }

function drawLeg(c, L, hipY, ox, leg, side, H) {
  const thigh = -hipY * 0.50, shin = -hipY * 0.46;
  const splay = side * 0.13;                       /* natural A-stance   */
  const hipA = leg.k * 0.62 + splay;
  const kneeA = hipA - leg.k * 0.30 - Math.max(0, leg.lift) * 0.06;
  const kx = ox + Math.sin(hipA) * thigh;
  const ky = hipY + Math.cos(hipA) * thigh - leg.lift * 0.45;
  const fx = kx + Math.sin(kneeA) * shin;
  const fy = ky + Math.cos(kneeA) * shin - leg.lift * 0.55;
  const back = side < 0;

  c.save();
  c.lineCap = 'round'; c.lineJoin = 'round';
  const cloth = back ? shade(L.pants || L.skin, 0.30) : (L.pants || L.skin);
  const leather = back ? shade(L.boots, 0.30) : L.boots;

  /* thigh into a narrower shin, as one tapered shape */
  const k = L.build / 0.9;
  limb(c, [ox, hipY], [kx, ky], [fx, fy - 2.6], 2.6 * k, 2.05 * k, 1.55 * k, cloth, cloth, !back);

  /* boot : shaft, heel and a toe that points where the leg is going */
  c.save();
  c.translate(fx, fy);
  c.rotate(kneeA * 0.30);
  poly(c, [
    [-2.5, -6.4], [2.3, -6.4], [2.5, -1.5],
    [4.5, -1.2], [4.6, -0.1], [-2.9, -0.1],
    [-2.9, -2.0], [-2.5, -2.2]
  ]);
  ink(c, leather, 1.7);
  /* boot cuff */
  c.fillStyle = shade(leather, 0.25);
  c.fillRect(-2.5, -6.6, 4.8, 1.5);
  c.strokeStyle = PAL.ink; c.lineWidth = 0.9;
  c.strokeRect(-2.5, -6.6, 4.8, 1.5);
  /* heel block */
  poly(c, [[-2.9, -2.0], [-1.6, -2.0], [-1.6, -0.1], [-2.9, -0.1]]);
  ink(c, shade(leather, 0.35), 0.9);
  /* spur rowel */
  if (!back) { ell(c, -3.5, -2.4, 1.2, 1.2); ink(c, PAL.gold, 0.8); }
  c.restore();
  c.restore();
}

function drawArm(c, L, shY, ox, arm, side, st, who, propSide) {
  const upper = 7.2, fore = 6.6;
  const a = arm.a, b = arm.b;
  const ex = ox + Math.sin(a) * upper;
  const ey = shY + Math.cos(a) * upper;
  const hx = ex + Math.sin(a + b) * fore;
  const hy = ey + Math.cos(a + b) * fore;
  const back = side < 0;
  const sleeveCol = who === 'rojina' ? L.dress : L.vest;
  const sleeve = back ? shade(sleeveCol, 0.32) : sleeveCol;
  const skin = back ? shade(L.skin, 0.28) : L.skin;

  const her = who === 'rojina';
  c.save(); c.lineCap = 'round'; c.lineJoin = 'round';

  /* sleeved upper arm into a bare forearm - his are rolled up, hers end
     at a cuff just past the elbow */
  limb(c, [ox, shY + 0.4], [ex, ey], [hx, hy], 2.15, 1.75, 1.25, sleeve, skin, !back);
  /* the cuff where the sleeve stops */
  const fa = Math.atan2(hy - ey, hx - ex);
  capsule(c, ex, ey, ex + Math.cos(fa) * 1.3, ey + Math.sin(fa) * 1.3, 1.95, 1.8);
  ink(c, her ? L.collar : shade(sleeveCol, 0.22), 0.9);

  /* shoulder: a gathered puff sleeve on her, a seam on him */
  if (her) {
    ell(c, ox, shY + 1.0, 3.3, 3.0); ink(c, sleeve, 1.6);
    c.save(); c.globalAlpha *= 0.35;
    c.beginPath(); c.moveTo(ox - 2.2, shY + 2.4); c.quadraticCurveTo(ox, shY + 3.4, ox + 2.2, shY + 2.4);
    c.lineWidth = 0.6; c.strokeStyle = L.dressDark; c.stroke();
    c.restore();
  } else {
    ell(c, ox, shY + 0.8, 2.5, 2.7); ink(c, sleeve, 1.6);
  }

  /* a hand with a thumb, turned along the forearm */
  c.save();
  c.translate(hx, hy); c.rotate(fa);
  ell(c, 0.9, 0, 2.25, 1.85); ink(c, skin, 1.2);
  ell(c, 0.4, -1.45, 1.0, 0.75, -0.5); ink(c, skin, 0.9);
  c.restore();
  c.restore();

  /* held props go in the forward hand, unless that one is busy */
  if (side === (propSide || 1) && st && st.prop) drawProp(c, st.prop, hx, hy, a + b, L, st);
}

const smooth01 = v => { v = clamp(v, 0, 1); return v * v * (3 - 2 * v); };

/* Two-bone reach: bend the arm so the hand lands on (tx, ty), or as near
   as the arm allows. Of the two elbows that do it, 'low' keeps the one
   hanging lower (a held hand) and 'front' the one out in front (a hand
   raised to the face). k blends from the pose's own arm to the reach. */
function reachArm(arm, ox, shY, tx, ty, k, pick) {
  const u = 7.2, f = 6.6;
  const dx = tx - ox, dy = ty - shY;
  const D = clamp(Math.hypot(dx, dy), Math.abs(u - f) + 0.5, u + f - 0.25);
  const phi = Math.atan2(dx, dy);
  const al = Math.acos(clamp((u * u + D * D - f * f) / (2 * u * D), -1, 1));
  const hx = ox + Math.sin(phi) * D, hy = shY + Math.cos(phi) * D;
  let best = null;
  for (const sg of [1, -1]) {
    const a = phi + sg * al;
    const ex = ox + Math.sin(a) * u, ey = shY + Math.cos(a) * u;
    let b = Math.atan2(hx - ex, hy - ey) - a;
    while (b > Math.PI) b -= Math.PI * 2;
    while (b < -Math.PI) b += Math.PI * 2;
    const score = pick === 'front' ? ex : ey;
    if (!best || score > best.score) best = { a, b, score };
  }
  let a0 = arm.a;
  while (best.a - a0 > Math.PI) a0 += Math.PI * 2;
  while (best.a - a0 < -Math.PI) a0 -= Math.PI * 2;
  arm.a = lerp(a0, best.a, k);
  arm.b = lerp(arm.b, best.b, k);
}

function drawProp(c, prop, x, y, ang, L, st) {
  c.save(); c.translate(x, y); c.rotate(Math.PI / 2 - ang);
  if (prop === 'revolver') {
    c.fillStyle = PAL.metalDk; c.fillRect(0, -1.4, 8, 2.4);
    c.fillStyle = PAL.metal; c.fillRect(0, -1.0, 7.2, 1.2);
    poly(c, [[0.4, 0.8], [3.0, 0.8], [2.2, 4.4], [0.2, 4.0]]); ink(c, L.boots || '#5a3a1e', 1);
    ell(c, 2.6, -0.2, 1.7, 1.7); ink(c, PAL.metalDk, 1);
  } else if (prop === 'lantern') {
    c.rotate(ang - Math.PI / 2);
    const sw = Math.sin((st.t || 0) * 3) * 0.25; c.rotate(sw);
    c.strokeStyle = PAL.metalDk; c.lineWidth = 1; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, 3); c.stroke();
    rr(c, -2.6, 3, 5.2, 6.4, 1); ink(c, PAL.metalDk, 1.2);
    rr(c, -1.8, 4, 3.6, 4.4, 0.6); ink(c, L.lantern || PAL.sun, 0.8);
    c.save(); c.globalAlpha *= 0.5;
    ell(c, 0, 6.2, 6, 6); c.fillStyle = PAL.sun; c.fill(); c.restore();
  }
  c.restore();
}

/* ---------------- head ----------------
   A three-quarter anime skull rather than an oval: round cranium, a brow
   ridge, a small nose bump on the facing edge, a cheekbone, and a jaw
   that tapers to a chin set slightly toward the way they are looking.
   The silhouette is what sells a face at this size, so it is built as
   one continuous path and inked in a single pass.                     */
function drawSkull(c, L, cy, rx, ry) {
  /* the symmetric head: rounded cranium, cheeks, chin tapering to a soft
     point on the centre line - no jaw pushed to one side */
  const face = () => {
    c.beginPath();
    c.moveTo(-rx, cy - ry * 0.25);
    c.quadraticCurveTo(-rx, cy - ry * 1.05, 0, cy - ry);
    c.quadraticCurveTo(rx, cy - ry * 1.05, rx, cy - ry * 0.25);
    c.quadraticCurveTo(rx * 0.98, cy + ry * 0.45, rx * 0.42, cy + ry * 0.86);
    c.quadraticCurveTo(0, cy + ry * 1.12, -rx * 0.42, cy + ry * 0.86);
    c.quadraticCurveTo(-rx * 0.98, cy + ry * 0.45, -rx, cy - ry * 0.25);
    c.closePath();
  };

  face();
  ink(c, L.skin, ry * 0.23);

  c.save();
  const a0 = c.globalAlpha;
  face();
  c.clip();

  /* the side away from the sun falls off */
  c.globalAlpha *= 0.17;
  c.beginPath();
  c.moveTo(-rx * 1.20, cy - ry * 1.30);
  c.quadraticCurveTo(-rx * 0.34, cy - ry * 0.20, -rx * 0.50, cy + ry * 1.30);
  c.lineTo(-rx * 1.30, cy + ry * 1.30);
  c.closePath();
  c.fillStyle = L.skinShade; c.fill();

  /* a little weight under the jaw and beneath the cheekbone */
  c.globalAlpha = a0 * 0.13;
  c.beginPath();
  c.moveTo(rx * 0.42, cy + ry * 0.86);
  c.quadraticCurveTo(0, cy + ry * 1.12, -rx * 0.42, cy + ry * 0.86);
  c.lineTo(-rx * 0.50, cy + ry * 1.40);
  c.lineTo(rx * 0.50, cy + ry * 1.40);
  c.closePath();
  c.fillStyle = L.skinShade; c.fill();

  c.globalAlpha = a0 * 0.10;
  ell(c, rx * 0.30, cy + ry * 0.48, rx * 0.34, ry * 0.18, -0.24);
  c.fillStyle = L.skinShade; c.fill();

  /* and a warm rim where the low sun catches the forehead */
  c.globalAlpha = a0 * 0.24;
  c.beginPath();
  c.moveTo(rx * 0.46, cy - ry * 1.10);
  c.quadraticCurveTo(rx * 1.02, cy - ry * 0.50, rx * 0.94, cy + ry * 0.30);
  c.lineTo(rx * 1.40, cy + ry * 0.40);
  c.lineTo(rx * 1.40, cy - ry * 1.30);
  c.closePath();
  c.fillStyle = '#fff3dc'; c.fill();
  c.restore();
}

/* The neck is a short column that widens into the trapezius, with the
   jaw's shadow thrown across it. Drawn before the skull so the chin
   overlaps it.                                                        */
function drawNeck(c, L, headBot, cy, ry) {
  const top = headBot - 3.0, bot = headBot + 4.2;
  c.beginPath();
  c.moveTo(-2.1, top);
  c.quadraticCurveTo(-2.5, bot - 1.6, -3.9, bot);
  c.lineTo(3.7, bot);
  c.quadraticCurveTo(2.4, bot - 1.6, 2.1, top);
  c.closePath();
  ink(c, L.skin, 1.6);
  c.save();
  c.globalAlpha *= 0.42;
  c.beginPath();
  c.moveTo(-2.2, top);
  c.quadraticCurveTo(0, top + 2.4, 2.2, top);
  c.lineTo(2.2, top + 3.0);
  c.quadraticCurveTo(0, top + 4.1, -2.2, top + 2.8);
  c.closePath();
  c.fillStyle = L.skinShade; c.fill();
  c.restore();
}

/* ---------------- face ---------------- */
function drawFace(c, L, cy, rx, ry, st, t) {
  const expr = st.expr || 'normal';
  /* one unit of line weight, scaled to the head so the face reads the
     same whether it is 20px tall in play or 300px on the title card */
  const LW = ry / 8.8;
  const eyeY = cy + ry * 0.16;
  const ex = rx * 0.40;
  const blinkPhase = ((t * 0.55 + (st.blinkSeed || 0)) % 1);
  let open = 1;
  if (blinkPhase > 0.965) open = 0.08;
  if (expr === 'ko') open = 0;
  if (expr === 'love') open = 0.22;
  if (expr === 'wink') open = 1;

  /* anime eyes are large, but two of these were spanning three quarters
     of the face and leaving no room for a nose or a chin */
  const eyeW = rx * 0.225, eyeH = ry * (L.eyeShape === 'round' ? 0.34 : 0.29) * open;

  const drawEye = (x, isFront, closedOverride) => {
    const o = closedOverride !== undefined ? closedOverride : open;
    if (o < 0.14) {
      /* closed / happy arc */
      c.beginPath();
      c.moveTo(x - eyeW, eyeY + 0.4);
      c.quadraticCurveTo(x, eyeY - (expr === 'love' || expr === 'happy' ? 2.6 : -1.4), x + eyeW, eyeY + 0.4);
      c.lineWidth = 1.25 * LW; c.strokeStyle = L.lash; c.lineCap = 'round'; c.stroke();
      return;
    }
    /* sclera */
    ell(c, x, eyeY, eyeW, ry * (L.eyeShape === 'round' ? 0.34 : 0.29) * o);
    c.fillStyle = PAL.white; c.fill();
    /* iris, turned toward whatever they are looking at */
    const lx = x + 0.15 + (st.look || 0) * eyeW * 0.28;
    c.save(); c.clip();
    ell(c, lx, eyeY + 0.24, eyeW * 0.70, eyeW * 0.86);
    c.fillStyle = L.eyeIris; c.fill();
    ell(c, lx, eyeY + 0.9, eyeW * 0.64, eyeW * 0.54);
    c.fillStyle = L.eyeIrisHi; c.fill();
    ell(c, lx, eyeY + 0.34, eyeW * 0.30, eyeW * 0.36);
    c.fillStyle = PAL.ink; c.fill();
    c.save(); c.globalAlpha *= 0.38;
    ell(c, x, eyeY - eyeW * 0.78, eyeW * 1.1, eyeW * 0.62);
    c.fillStyle = L.lash; c.fill();
    c.restore();
    /* anime highlights */
    ell(c, x + eyeW * 0.42, eyeY - eyeW * 0.42, eyeW * 0.30, eyeW * 0.34);
    c.fillStyle = PAL.white; c.fill();
    ell(c, x - eyeW * 0.35, eyeY + eyeW * 0.5, eyeW * 0.16, eyeW * 0.18);
    c.fillStyle = 'rgba(255,255,255,0.8)'; c.fill();
    c.restore();
    /* upper lash line - thick, anime */
    c.beginPath();
    c.moveTo(x - eyeW - 0.5, eyeY - eyeH * 0.55);
    c.quadraticCurveTo(x, eyeY - eyeH * 1.5, x + eyeW + 0.6, eyeY - eyeH * 0.75);
    c.lineWidth = 1.35 * LW; c.strokeStyle = L.lash; c.lineCap = 'round'; c.stroke();
    /* outer lash flick - a long wing when the look sheet asks for liner */
    const wing = L.wingedLiner ? 1.9 : 1.0;
    c.beginPath();
    c.moveTo(x + eyeW + 0.3, eyeY - eyeH * 0.8);
    c.quadraticCurveTo(x + eyeW + 1.0 * wing, eyeY - eyeH * 1.1,
                       x + eyeW + 1.9 * wing, eyeY - eyeH * (1.5 + 0.35 * wing));
    c.lineWidth = (L.wingedLiner ? 1.25 : 1.0) * LW; c.stroke();
    /* lower lid */
    c.beginPath();
    c.moveTo(x - eyeW * 0.7, eyeY + eyeH * 0.85);
    c.quadraticCurveTo(x, eyeY + eyeH * 1.1, x + eyeW * 0.8, eyeY + eyeH * 0.8);
    c.lineWidth = 0.75 * LW; c.strokeStyle = 'rgba(26,16,20,0.55)'; c.stroke();
  };

  drawEye(-ex, false, expr === 'wink' ? 0 : undefined);
  drawEye(ex * 1.02, true);

  /* brows */
  const browY = eyeY - ry * 0.46;
  let bTilt = 0, bLift = 0;
  if (expr === 'determined') { bTilt = 0.30; bLift = 1.0; }
  if (expr === 'scared') { bTilt = -0.34; bLift = -1.2; }
  if (expr === 'hurt') { bTilt = -0.4; bLift = -1.4; }
  if (expr === 'happy' || expr === 'love') { bTilt = -0.10; bLift = -0.6; }
  c.strokeStyle = L.brow; c.lineWidth = (L.browThick || 1.7) * 0.62 * LW; c.lineCap = 'round';
  [[-ex, -1], [ex * 1.02, 1]].forEach(([x, sgn]) => {
    c.beginPath();
    c.moveTo(x - eyeW * 0.95, browY + bLift + sgn * bTilt * 2.2);
    c.quadraticCurveTo(x, browY + bLift - 1.0 + sgn * bTilt, x + eyeW * 0.95, browY + bLift - sgn * bTilt * 0.6);
    c.stroke();
  });

  /* nose: the silhouette already carries the bump, so all this needs
     to do is drop a small shadow under it and catch a highlight */
  c.save();
  c.globalAlpha *= 0.55;
  c.beginPath();
  c.moveTo(rx * 0.14, cy + ry * 0.34);
  c.quadraticCurveTo(rx * 0.32, cy + ry * 0.46, rx * 0.14, cy + ry * 0.50);
  c.closePath();
  c.fillStyle = L.skinShade; c.fill();
  c.globalAlpha *= 0.7;
  c.beginPath();
  c.moveTo(rx * 0.24, cy + ry * 0.30);
  c.lineTo(rx * 0.30, cy + ry * 0.44);
  c.lineWidth = 0.7 * LW; c.strokeStyle = 'rgba(26,16,20,0.5)'; c.lineCap = 'round'; c.stroke();
  c.restore();

  /* mouth */
  /* the head is symmetric again, so the mouth belongs on the centre
     line, carried only a little toward the way they are facing */
  const my = cy + ry * 0.70, mx = rx * 0.06;
  c.strokeStyle = L.lips || L.lash; c.lineWidth = (L.lips ? 0.85 : 0.72) * LW; c.lineCap = 'round';
  c.beginPath();
  if (expr === 'happy' || expr === 'cheer') {
    c.moveTo(mx - rx * 0.22, my - 0.4);
    c.quadraticCurveTo(mx, my + 1.5, mx + rx * 0.22, my - 0.5);
    c.quadraticCurveTo(mx, my + 0.5, mx - rx * 0.22, my - 0.4);
    c.closePath();
    c.fillStyle = L.lips || '#8e2338'; c.fill();
    c.lineWidth = 0.6 * LW; c.stroke();
  } else if (expr === 'love') {
    c.moveTo(mx - rx * 0.19, my - 0.1); c.quadraticCurveTo(mx, my + 1.1, mx + rx * 0.19, my - 0.3); c.stroke();
  } else if (expr === 'scared' || expr === 'hurt') {
    ell(c, mx, my + 0.2, ry * 0.13, ry * 0.18); ink(c, '#7a2438', 0.8 * LW);
  } else if (expr === 'determined') {
    c.moveTo(mx - rx * 0.20, my + 0.2); c.lineTo(mx + rx * 0.20, my - 0.2); c.stroke();
  } else if (expr === 'ko') {
    c.moveTo(mx - rx * 0.20, my); c.quadraticCurveTo(mx, my - 1.3, mx + rx * 0.20, my); c.stroke();
  } else {
    c.moveTo(mx - rx * 0.17, my); c.quadraticCurveTo(mx, my + 0.8, mx + rx * 0.17, my - 0.1); c.stroke();
  }

  /* blush */
  if (expr === 'love' || expr === 'happy' || st.blush) {
    /* Out on the cheekbones and soft-edged. Sitting straight under the
       eyes it read, at any size, as rings of tiredness. */
    const by = eyeY + ry * 0.50;
    c.save();
    [[-ex - 1.0, -1], [ex * 1.02 + 1.4, 1]].forEach(([x]) => {
      c.globalAlpha = 0.5;
      ell(c, x, by, rx * 0.22, ry * 0.11); c.fillStyle = L.blush; c.fill();
      c.globalAlpha = 0.35;
      ell(c, x, by, rx * 0.15, ry * 0.07); c.fillStyle = L.blush; c.fill();
      if (expr === 'love') {
        c.globalAlpha = 0.55;
        c.strokeStyle = '#d4566f'; c.lineWidth = 0.45 * LW; c.lineCap = 'round';
        for (let i = -1; i <= 1; i++) {
          c.beginPath();
          c.moveTo(x + i * rx * 0.08 + 0.5, by - ry * 0.05);
          c.lineTo(x + i * rx * 0.08 - 0.3, by + ry * 0.05);
          c.stroke();
        }
      }
    });
    c.restore();
  }
}

/* ---------------- hair ----------------
   Curly hair is built as a union of overlapping lobes: stroke the whole
   set once in ink, fill it, then re-fill each lobe slightly smaller so
   the individual ringlets read as clumps. Lobes carry a 0..1 "depth"
   used to blend the root colour into the ombre tip colour.            */
function mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = Math.round(lerp((pa >> 16) & 255, (pb >> 16) & 255, t));
  const g = Math.round(lerp((pa >> 8) & 255, (pb >> 8) & 255, t));
  const bl = Math.round(lerp(pa & 255, pb & 255, t));
  return 'rgb(' + r + ',' + g + ',' + bl + ')';
}
function curlMass(c, lobes, L, tipStrength, shadowAmt) {
  if (!lobes.length) return;
  tipStrength = tipStrength === undefined ? 1 : tipStrength;
  c.save();
  /* silhouette : stroke then fill hides the interior seams */
  c.beginPath();
  for (const [x, y, r] of lobes) { c.moveTo(x + r, y); c.arc(x, y, r, 0, Math.PI * 2); }
  c.lineWidth = 3.4; c.strokeStyle = PAL.ink; c.lineJoin = 'round'; c.stroke();
  c.fillStyle = L.hair; c.fill();
  /* individual ringlets, tinted toward the ombre tip */
  for (const [x, y, r, d] of lobes) {
    let col = L.hair;
    if (L.hairTip && d > 0.30) {
      const f = clamp((d - 0.30) / 0.70, 0, 1) * tipStrength;
      col = mixHex(L.hair, f > 0.62 ? L.hairTip2 || L.hairTip : L.hairTip, f);
    }
    ell(c, x, y, r * 0.86, r * 0.86);
    c.fillStyle = col; c.fill();
    /* spiral highlight, lit from the same side as the face */
    c.beginPath();
    c.arc(x + r * 0.18, y - r * 0.20, r * 0.40, -Math.PI * 0.95, Math.PI * 0.15);
    c.lineWidth = Math.max(0.4, r * 0.15);
    c.strokeStyle = L.hairTip && d > 0.55
      ? 'rgba(255,228,238,0.34)' : 'rgba(255,238,220,0.22)';
    c.lineCap = 'round'; c.stroke();
    /* the curls on the lit side catch the low sun along their edge */
    if (x > 0) {
      c.beginPath();
      c.arc(x, y, r * 0.84, -Math.PI * 0.5, Math.PI * 0.2);
      c.lineWidth = Math.max(0.45, r * 0.24);
      c.strokeStyle = 'rgba(255,214,160,0.40)'; c.stroke();
    }
  }
  /* a curl mass that sits behind something is in its shadow */
  if (shadowAmt) {
    c.globalAlpha *= shadowAmt;
    c.beginPath();
    for (const [x, y, r] of lobes) { c.moveTo(x + r, y); c.arc(x, y, r, 0, Math.PI * 2); }
    c.fillStyle = '#160d1c'; c.fill();
  }
  c.restore();
}

function drawHair(c, L, cy, rx, ry, t, P) {
  const w = Math.sin(t * 3.4) * (0.6 + P.wind * 1.2);
  const cs = L.curlSize || 3;

  /* ---------- ARSHIA : short curls, cropped close to the skull ---------- */
  if (L.hairStyle === 'curlyShort') {
    const lobes = [];
    /* crown row - follows the skull instead of ballooning off it */
    for (let i = 0; i <= 13; i++) {
      const a = Math.PI * (1.06 - i / 13 * 1.12);
      lobes.push([Math.cos(a) * rx * 0.86,
                  cy - Math.sin(a) * ry * 0.86 - ry * 0.20,
                  cs * (0.80 + 0.12 * Math.sin(i * 1.9)), 0]);
    }
    /* a shallow inner row for depth */
    for (let i = 0; i <= 8; i++) {
      const a = Math.PI * (0.94 - i / 8 * 0.88);
      lobes.push([Math.cos(a) * rx * 0.62 + w * 0.2,
                  cy - Math.sin(a) * ry * 0.54 - ry * 0.38,
                  cs * 0.70, 0]);
    }
    /* bangs breaking over the forehead, above the brows */
    lobes.push([-rx * 0.62, cy - ry * 0.56, cs * 0.60, 0]);
    lobes.push([-rx * 0.22, cy - ry * 0.66, cs * 0.62, 0]);
    lobes.push([rx * 0.18, cy - ry * 0.66, cs * 0.60, 0]);
    lobes.push([rx * 0.58, cy - ry * 0.56, cs * 0.58, 0]);
    /* sideburn + nape curls down to the collar */
    lobes.push([-rx * 0.90, cy + ry * 0.06, cs * 0.58, 0]);
    lobes.push([-rx * 0.92 + w * 0.2, cy + ry * 0.42, cs * 0.50, 0]);
    lobes.push([-rx * 0.84 + w * 0.3, cy + ry * 0.70, cs * 0.42, 0]);
    lobes.push([rx * 0.92, cy + ry * 0.08, cs * 0.56, 0]);
    lobes.push([rx * 0.94 + w * 0.2, cy + ry * 0.44, cs * 0.46, 0]);
    curlMass(c, lobes, L);
    return;
  }

  /* ---------- ROJINA : long ringlets, dark roots into rose tips ---------- */
  if (L.hairStyle === 'curlyLong') {
    const lobes = [];
    for (let i = 0; i <= 13; i++) {
      const a = Math.PI * (1.08 - i / 13 * 1.16);
      lobes.push([Math.cos(a) * rx * 0.96,
                  cy - Math.sin(a) * ry * 1.00 - ry * 0.14,
                  cs * (0.94 + 0.14 * Math.sin(i * 2.3)), 0]);
    }
    for (let i = 0; i <= 7; i++) {
      const a = Math.PI * (0.94 - i / 7 * 0.88);
      lobes.push([Math.cos(a) * rx * 0.62, cy - Math.sin(a) * ry * 0.64 - ry * 0.32, cs * 0.80, 0]);
    }
    /* centre-parted ringlet bangs */
    lobes.push([-rx * 0.70, cy - ry * 0.48, cs * 0.72, 0.04]);
    lobes.push([-rx * 0.28, cy - ry * 0.64, cs * 0.70, 0]);
    lobes.push([rx * 0.26, cy - ry * 0.64, cs * 0.70, 0]);
    lobes.push([rx * 0.68, cy - ry * 0.48, cs * 0.72, 0.04]);
    /* two ringlet columns framing the face - densely overlapped so they
       read as continuous spirals rather than a string of beads */
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i <= 24; i++) {
        const f = i / 24;
        /* f is 0 at the scalp, so the sway grows out of the root */
        const wob = Math.sin(f * 6.4 + side * 1.3 + t * 1.5) * (0.9 + P.wind * 1.1) * f;
        const twist = Math.sin(i * 1.9 + side) * cs * 0.30;
        lobes.push([side * rx * (1.00 + Math.sin(f * 5.0) * 0.13) + wob + twist,
                    cy + ry * (0.22 + f * 2.10),
                    cs * (0.92 - f * 0.20),
                    0.10 + f * 0.90]);
      }
    }
    curlMass(c, lobes, L);
  }
}

/* ---------------- round wire glasses ---------------- */
function drawGlasses(c, L, cy, rx, ry) {
  const eyeY = cy + ry * 0.16;
  const ex = rx * 0.44;
  const R = rx * 0.345;
  c.save();
  c.lineCap = 'round';
  /* frames */
  [-ex, ex * 1.02].forEach(x => {
    ell(c, x, eyeY, R, R);
    c.lineWidth = 0.85; c.strokeStyle = 'rgba(22,13,28,0.75)'; c.stroke();
    c.lineWidth = 0.5; c.strokeStyle = L.glassFrame || PAL.metal; c.stroke();
  });
  /* bridge */
  c.beginPath();
  c.moveTo(-ex + R * 0.92, eyeY - R * 0.22);
  c.quadraticCurveTo(ex * 0.5, eyeY - R * 0.72, ex * 1.02 - R * 0.92, eyeY - R * 0.22);
  c.lineWidth = 0.8; c.strokeStyle = 'rgba(22,13,28,0.7)'; c.stroke();
  c.lineWidth = 0.45; c.strokeStyle = L.glassFrame || PAL.metal; c.stroke();
  /* temple arm toward the ear */
  c.beginPath();
  c.moveTo(ex * 1.02 + R * 0.94, eyeY - R * 0.12);
  c.lineTo(rx * 1.02, eyeY - R * 0.34);
  c.lineWidth = 0.8; c.strokeStyle = 'rgba(22,13,28,0.65)'; c.stroke();
  c.lineWidth = 0.45; c.strokeStyle = L.glassFrame || PAL.metal; c.stroke();
  /* specular streak across the far lens */
  c.save(); c.globalAlpha *= 0.30;
  c.beginPath();
  c.moveTo(ex * 1.02 - R * 0.55, eyeY + R * 0.42);
  c.lineTo(ex * 1.02 + R * 0.28, eyeY - R * 0.55);
  c.lineWidth = 0.9; c.strokeStyle = PAL.white; c.stroke();
  c.restore();
  c.restore();
}

/* ---------------- her heart pendant ---------------- */
function drawPendant(c, L, neckY, t, glow) {
  c.save();
  const sway = Math.sin(t * 2.4) * 0.5;
  /* cord */
  c.beginPath();
  c.moveTo(-3.2, neckY + 0.4);
  c.quadraticCurveTo(sway * 0.4, neckY + 3.0, 3.2, neckY + 0.4);
  c.lineWidth = 1.1; c.strokeStyle = L.pendantCord || '#241d22'; c.stroke();
  /* the heart itself - it warms up when the two are close */
  if (glow > 0.02) {
    c.save(); c.globalAlpha *= glow * 0.8;
    ell(c, sway * 0.4, neckY + 3.6, 4.6, 4.6);
    c.fillStyle = 'rgba(224,122,154,0.55)'; c.fill();
    c.restore();
  }
  drawHeart(c, sway * 0.4, neckY + 3.4, 2.0,
            glow > 0.5 ? mixHex('#1b1519', '#e0455e', (glow - 0.5) * 2) : (L.pendant || '#1b1519'));
  c.restore();
}

/* ---------------- hats ---------------- */
function drawStetson(c, L, cy, rx, ry, P) {
  /* pushed back on the crown when hatTiltBack is set, so the curls show */
  const brimY = cy - ry * (L.hatTiltBack ? 0.80 : 0.62);
  c.save();
  c.rotate(-0.05);
  /* brim - curled cowboy shape */
  c.beginPath();
  c.moveTo(-rx * 1.48, brimY);
  c.quadraticCurveTo(-rx * 1.20, brimY + 3.2, 0, brimY + 3.0);
  c.quadraticCurveTo(rx * 1.20, brimY + 3.2, rx * 1.55, brimY - 0.4);
  c.quadraticCurveTo(rx * 1.14, brimY - 2.4, 0, brimY - 2.2);
  c.quadraticCurveTo(-rx * 1.14, brimY - 2.4, -rx * 1.48, brimY);
  c.closePath();
  ink(c, L.hatBrim, 2);
  /* crown with a pinched centre crease */
  const crown = () => {
    c.beginPath();
    c.moveTo(-rx * 0.95, brimY - 0.6);
    c.quadraticCurveTo(-rx * 1.0, cy - ry * 1.62, -rx * 0.42, cy - ry * 1.72);
    c.quadraticCurveTo(-rx * 0.16, cy - ry * 1.38, 0, cy - ry * 1.70);
    c.quadraticCurveTo(rx * 0.18, cy - ry * 1.40, rx * 0.44, cy - ry * 1.70);
    c.quadraticCurveTo(rx * 1.0, cy - ry * 1.60, rx * 0.95, brimY - 0.6);
    c.closePath();
  };
  crown(); ink(c, L.hat, 2);
  rimLight(c, crown, L.hat);
  /* hat band */
  c.save();
  c.beginPath();
  c.moveTo(-rx * 0.97, brimY - 0.8);
  c.lineTo(rx * 0.97, brimY - 0.8);
  c.lineTo(rx * 0.99, brimY - 3.4);
  c.lineTo(-rx * 0.99, brimY - 3.4);
  c.closePath();
  ink(c, L.hatBand, 1.2);
  c.restore();
  /* band buckle */
  c.fillStyle = PAL.gold; c.fillRect(rx * 0.45, brimY - 3.0, 1.6, 1.9);
  /* shade */
  c.save(); c.globalAlpha *= 0.25;
  poly(c, [[rx * 0.35, brimY - 0.8], [rx * 0.95, brimY - 0.8], [rx * 0.9, cy - ry * 1.6], [rx * 0.4, cy - ry * 1.66]]);
  c.fillStyle = PAL.ink; c.fill(); c.restore();
  c.restore();
}

function drawBonnet(c, L, cy, rx, ry, P, t) {
  const brimY = cy - ry * (L.hatTiltBack ? 0.86 : 0.70);
  c.save();
  c.rotate(0.04);
  /* wide woven sun-bonnet brim */
  c.beginPath();
  c.moveTo(-rx * 1.55, brimY + 0.6);
  c.quadraticCurveTo(-rx * 1.20, brimY + 3.6, 0, brimY + 3.4);
  c.quadraticCurveTo(rx * 1.20, brimY + 3.6, rx * 1.55, brimY + 0.4);
  c.quadraticCurveTo(rx * 1.10, brimY - 2.0, 0, brimY - 1.9);
  c.quadraticCurveTo(-rx * 1.10, brimY - 2.0, -rx * 1.55, brimY + 0.6);
  c.closePath();
  ink(c, L.hat, 2);
  /* weave lines across the brim */
  c.save(); c.clip(); c.globalAlpha *= 0.6;
  c.strokeStyle = L.hatWeave; c.lineWidth = 0.7;
  for (let i = -4; i <= 4; i++) {
    c.beginPath();
    c.moveTo(i * rx * 0.48, brimY - 3);
    c.quadraticCurveTo(i * rx * 0.42, brimY + 1, i * rx * 0.5, brimY + 4);
    c.stroke();
  }
  for (let j = 0; j < 3; j++) {
    c.beginPath();
    c.moveTo(-rx * 1.6, brimY - 1.4 + j * 1.7);
    c.quadraticCurveTo(0, brimY + 1.6 + j * 1.6, rx * 1.6, brimY - 1.4 + j * 1.7);
    c.stroke();
  }
  c.restore();
  /* rounded woven crown */
  const crown = () => {
    c.beginPath();
    c.moveTo(-rx * 0.98, brimY - 0.2);
    c.quadraticCurveTo(-rx * 1.02, cy - ry * 1.66, 0, cy - ry * 1.70);
    c.quadraticCurveTo(rx * 1.02, cy - ry * 1.66, rx * 0.98, brimY - 0.2);
    c.closePath();
  };
  crown(); ink(c, L.hat, 2);
  rimLight(c, crown, L.hat);
  crown();
  c.save(); c.clip(); c.globalAlpha *= 0.55;
  c.strokeStyle = L.hatWeave; c.lineWidth = 0.7;
  for (let j = 0; j < 4; j++) {
    c.beginPath();
    c.moveTo(-rx, brimY - 1.2 - j * 2.0);
    c.quadraticCurveTo(0, brimY - 3.0 - j * 2.0, rx, brimY - 1.2 - j * 2.0);
    c.stroke();
  }
  c.restore();
  /* ribbon + trailing tails in the wind */
  c.fillStyle = L.hatBand;
  c.beginPath();
  c.moveTo(-rx * 1.0, brimY - 0.4);
  c.lineTo(rx * 1.0, brimY - 0.4);
  c.lineTo(rx * 1.02, brimY - 2.9);
  c.lineTo(-rx * 1.02, brimY - 2.9);
  c.closePath(); ink(c, L.hatBand, 1.1);
  const w = Math.sin(t * 3.2) * 2.2 + P.wind * 3;
  c.beginPath();
  c.moveTo(-rx * 0.95, brimY - 2.4);
  c.quadraticCurveTo(-rx * 1.8 - w, brimY + 2, -rx * 2.1 - w * 1.4, brimY + 7);
  c.quadraticCurveTo(-rx * 1.5 - w, brimY + 3, -rx * 0.9, brimY - 0.6);
  c.closePath(); ink(c, L.hatBand, 1.1);
  /* little prairie flower */
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2;
    ell(c, rx * 0.72 + Math.cos(a) * 1.5, brimY - 2.0 + Math.sin(a) * 1.5, 1.1, 1.1);
    ink(c, '#f0e0b0', 0.6);
  }
  ell(c, rx * 0.72, brimY - 2.0, 1.0, 1.0); ink(c, PAL.gold, 0.6);
  c.restore();
}

/* ---------------- downed (waiting for a kiss) ---------------- */
function drawDowned(c, who, L, t, st) {
  const H = L.height;
  c.save();
  c.translate(0, -3);
  c.rotate(-Math.PI / 2 * 0.92);
  const sub = { x: 0, y: 0, face: 1, t, anim: 'idle', expr: 'ko', scale: 1, shadow: false, speed: 0 };
  /* reuse the standing renderer, laid on its side */
  c.save();
  drawCharInner(c, who, L, sub, t);
  c.restore();
  c.restore();
  /* floating fading heart */
  const p = (t * 0.6) % 1;
  c.save();
  c.globalAlpha *= (1 - p) * 0.9;
  drawHeart(c, 4 + Math.sin(t * 2) * 2, -H * 0.55 - p * 16, 3 + p * 2, LOOK[who].accent);
  c.restore();
}
function drawCharInner(c, who, L, st, t) {
  /* minimal lying-down body: head + torso + limbs, enough to read clearly */
  const H = L.height;
  const headCY = -H * 0.83, headRy = H * 0.167, headRx = headRy * 0.9;
  const shY = -H * 0.635, hipY = -H * 0.375;
  const shW = 7.6 * L.build, hipW = 5.6 * L.build;
  /* legs */
  c.lineCap = 'round';
  [[-hipW * 0.5, 0.5], [hipW * 0.5, -0.4]].forEach(([ox, k]) => {
    c.beginPath(); c.moveTo(ox, hipY); c.lineTo(ox + k * 4, hipY * 0.45); c.lineTo(ox + k * 7, -1);
    c.lineWidth = 4.4; c.strokeStyle = PAL.ink; c.stroke();
    c.lineWidth = 3.0; c.strokeStyle = L.pants || L.dress; c.stroke();
  });
  /* torso */
  poly(c, [[-shW, shY], [shW, shY], [hipW, hipY], [-hipW, hipY]]);
  ink(c, who === 'rojina' ? L.dress : L.shirt, 2);
  /* arms flung out */
  [[-shW * 0.55, -1], [shW * 0.5, 1]].forEach(([ox, sgn]) => {
    c.beginPath(); c.moveTo(ox, shY); c.lineTo(ox + sgn * 5, shY + 5); c.lineTo(ox + sgn * 9, shY + 8);
    c.lineWidth = 4.0; c.strokeStyle = PAL.ink; c.stroke();
    c.lineWidth = 2.6; c.strokeStyle = L.skin; c.stroke();
  });
  /* head */
  ell(c, 0, headCY, headRx, headRy); ink(c, L.skin, 2);
  drawFace(c, L, headCY, headRx, headRy, { expr: 'ko', blush: true, t }, t);
  drawHair(c, L, headCY, headRx, headRy, t, { wind: 0.2 });
  if (who === 'arshia') drawStetson(c, L, headCY, headRx, headRy, { wind: 0 });
  else drawBonnet(c, L, headCY, headRx, headRy, { wind: 0 }, t);
}

/* ---------------- shared shapes ---------------- */
function star(c, x, y, r, n) {
  c.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    const rr2 = i % 2 ? r * 0.44 : r;
    const px = x + Math.cos(a) * rr2, py = y + Math.sin(a) * rr2;
    i ? c.lineTo(px, py) : c.moveTo(px, py);
  }
  c.closePath();
}
function drawHeart(c, x, y, r, col) {
  c.save(); c.translate(x, y); c.scale(r / 10, r / 10);
  c.beginPath();
  c.moveTo(0, 8);
  c.bezierCurveTo(-12, -1, -7, -11, 0, -5);
  c.bezierCurveTo(7, -11, 12, -1, 0, 8);
  c.closePath();
  c.fillStyle = col || PAL.red; c.fill();
  c.lineWidth = 2; c.strokeStyle = PAL.ink; c.stroke();
  c.restore();
}

/* ---------------- bust portrait (menus / dialogue) ---------------- */
function drawPortrait(c, who, x, y, size, expr, t) {
  const L = LOOK[who];
  c.save();
  c.translate(x, y);
  const k = size / (L.height * 0.42);
  c.scale(k, k);
  const headCY = 0, headRy = L.height * 0.167, headRx = headRy * 0.9;
  /* shoulders */
  c.beginPath();
  c.moveTo(-13, headRy * 2.6);
  c.quadraticCurveTo(-9, headRy * 1.35, 0, headRy * 1.25);
  c.quadraticCurveTo(9, headRy * 1.35, 13, headRy * 2.6);
  c.closePath();
  ink(c, who === 'rojina' ? L.dress : L.vest, 2);

  /* Something inside the coat. Her ringlets fall over her shoulders and
     fill them; his were a plain tan dome with nothing in it at all,
     which is what the results poster and the records page were showing
     at 60px across. */
  const sy = headRy * 1.30, hem = headRy * 2.6;
  c.beginPath();
  c.moveTo(-6, sy);
  c.lineTo(0, headRy * 2.05);
  c.lineTo(6, sy);
  c.closePath();
  ink(c, who === 'rojina' ? L.collar : L.shirt, 1.4);
  if (who === 'arshia') {
    /* the red cape, thrown back over one shoulder */
    c.beginPath();
    c.moveTo(-8.5, sy + 1);
    c.quadraticCurveTo(-14.5, headRy * 1.9, -13, hem);
    c.lineTo(-5.5, hem);
    c.quadraticCurveTo(-7.5, headRy * 1.8, -6, sy + 1);
    c.closePath();
    ink(c, L.cape, 1.5, L.capeDark);
    /* and the bandana at his throat */
    c.beginPath();
    c.moveTo(-5.5, sy - 0.5); c.lineTo(0, headRy * 1.62); c.lineTo(5.5, sy - 0.5);
    c.lineWidth = 1.3; c.strokeStyle = L.bandana; c.stroke();
  } else {
    /* the black heart on its cord */
    c.beginPath();
    c.moveTo(-3.4, sy + 0.4);
    c.quadraticCurveTo(0, headRy * 1.55, 3.4, sy + 0.4);
    c.lineWidth = 0.9; c.strokeStyle = L.pendantCord; c.stroke();
    drawHeart(c, 0, headRy * 1.68, 1.5, L.pendant);
  }

  ell(c, 0, headCY, headRx, headRy); ink(c, L.skin, 2);
  drawFace(c, L, headCY, headRx, headRy, { expr: expr || 'normal', t: t || 0, blinkSeed: who === 'rojina' ? 0.4 : 0 }, t || 0);
  drawHair(c, L, headCY, headRx, headRy, t || 0, { wind: 0.3 });
  if (who === 'arshia') drawStetson(c, L, headCY, headRx, headRy, { wind: 0 });
  else drawBonnet(c, L, headCY, headRx, headRy, { wind: 0 }, t || 0);
  c.restore();
}
