/* =====================================================================
   art.js : anime-styled character renderer + western scenery.
   Everything is drawn with vector paths so it stays crisp at any scale
   and can be re-skinned instantly from the LOOK sheet in config.js.
   ===================================================================== */

/* ---------------------------------------------------------------------
   CHARACTER
   st = { x, y(feet), face:+1/-1, anim, t, expr, scale, alpha }
   anim : idle | run | jump | fall | push | pull | down | kiss | cheer |
          aim | hurt | ride | crouch
   expr : normal | happy | love | scared | determined | hurt | ko | wink
   ------------------------------------------------------------------ */

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
  const P = pose(anim, t, st);

  /* body landmarks */
  const headTop = -H + P.bob,
        headBot = -H * 0.665 + P.bob,
        headCY = (headTop + headBot) / 2,
        headRy = (headBot - headTop) / 2,
        headRx = headRy * 0.90;
  const shY = -H * 0.635 + P.bob;
  const hipY = -H * 0.375 + P.bob * 0.6;
  const shW = 7.6 * L.build, hipW = 5.6 * L.build;

  /* squash-and-stretch about the feet */
  if (P.squash) c.scale(1 / (1 + P.squash), 1 + P.squash);

  /* the upper body rotates about the hips; legs stay planted */
  const leanOn = () => { c.save(); c.translate(0, hipY); c.rotate(P.lean); c.translate(0, -hipY); };
  const leanOff = () => c.restore();

  /* ================= BACK LAYER ================= */

  /* ---- red cape, streaming behind him ---- */
  if (L.cape) {
    leanOn();
    const gust = Math.sin(t * 2.6) * 2.0 + P.wind * 7;
    const tail = hipY + 12 + P.wind * 2;
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

  /* the big curly mass that sits behind the shoulders */
  if (L.hairStyle === 'curlyLong' || L.hairStyle === 'long') {
    const sway = Math.sin(t * 3 + 1) * (1.2 + P.wind * 2);
    const cs = L.curlSize || 2.8;
    const back = [];
    for (let i = 0; i <= 9; i++) {
      const f = i / 9;                                  /* 0 = crown, 1 = tips */
      const yy = headCY + headRy * (0.1 + f * 2.35);
      const spread = headRx * (0.98 + Math.sin(f * 3.1) * 0.20);
      back.push([-spread + sway * f * 1.2, yy, cs * (0.95 - f * 0.22), f]);
      back.push([spread * 0.92 + sway * f * 1.1, yy + headRy * 0.18, cs * (0.92 - f * 0.22), f]);
      if (i % 2 === 0) back.push([sway * f - headRx * 0.15, yy + headRy * 0.3, cs * (0.85 - f * 0.18), f]);
    }
    curlMass(c, back, L, 0.9);
  }

  /* back arm */
  leanOn();
  drawArm(c, L, shY, -shW * 0.78, P.armB, -1, st, who);
  leanOff();

  /* back leg */
  drawLeg(c, L, hipY, -hipW * 0.62, P.legB, -1, H);

  /* ================= TORSO ================= */
  leanOn();
  if (who === 'rojina') {
    /* prairie dress : fitted bodice + flared skirt */
    const skirtY = hipY + 1, skirtBot = -H * 0.16;
    const flare = 9.5 + Math.abs(P.legF.k) * 1.2 + P.wind * 2;
    /* bodice : sloped shoulders nipping in to a narrow waist */
    c.beginPath();
    c.moveTo(-shW, shY + 1.4);
    c.quadraticCurveTo(0, shY - 1.8, shW, shY + 1.4);
    c.quadraticCurveTo(hipW * 1.18, (shY + hipY) / 2, hipW * 0.95, hipY - 1);
    c.lineTo(-hipW * 0.95, hipY - 1);
    c.quadraticCurveTo(-hipW * 1.18, (shY + hipY) / 2, -shW, shY + 1.4);
    c.closePath();
    ink(c, L.dress, 2);
    /* skirt */
    c.beginPath();
    c.moveTo(-hipW, skirtY - 2);
    c.lineTo(hipW, skirtY - 2);
    c.quadraticCurveTo(flare * 0.9, (skirtY + skirtBot) / 2, flare, skirtBot);
    for (let i = 3; i >= -3; i--) {
      const fx = flare * (i / 3);
      c.lineTo(fx, skirtBot + (i % 2 ? 1.6 : 0));
    }
    c.quadraticCurveTo(-flare * 0.9, (skirtY + skirtBot) / 2, -hipW, skirtY - 2);
    c.closePath();
    ink(c, L.dress, 2);
    /* apron */
    c.beginPath();
    c.moveTo(-hipW * 0.62, hipY);
    c.lineTo(hipW * 0.62, hipY);
    c.quadraticCurveTo(flare * 0.55, skirtBot - 1, flare * 0.42, skirtBot + 0.5);
    c.lineTo(-flare * 0.42, skirtBot + 0.5);
    c.quadraticCurveTo(-flare * 0.55, skirtBot - 1, -hipW * 0.62, hipY);
    c.closePath();
    ink(c, L.apron, 1.6);
    /* skirt shade */
    c.save(); c.globalAlpha *= 0.22;
    poly(c, [[hipW * 0.2, skirtY], [hipW, skirtY], [flare, skirtBot], [flare * 0.35, skirtBot]]);
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
    /* black shirt : sloped shoulders, tapered waist */
    c.beginPath();
    c.moveTo(-shW, shY + 1.2);
    c.quadraticCurveTo(0, shY - 2.0, shW, shY + 1.2);
    c.quadraticCurveTo(hipW * 1.20, (shY + hipY) / 2, hipW, hipY);
    c.lineTo(-hipW, hipY);
    c.quadraticCurveTo(-hipW * 1.20, (shY + hipY) / 2, -shW, shY + 1.2);
    c.closePath();
    ink(c, L.shirt, 2);
    /* open canvas trail-coat, hanging past the belt */
    const coatBot = hipY + 5.5;
    [-1, 1].forEach(sgn => {
      c.beginPath();
      c.moveTo(sgn * shW, shY + 1.2);
      c.quadraticCurveTo(sgn * shW * 0.55, shY - 1.2, sgn * shW * 0.18, shY + 0.6);
      c.lineTo(sgn * hipW * 0.42, coatBot);
      c.lineTo(sgn * (hipW + 1.6), coatBot);
      c.quadraticCurveTo(sgn * (hipW + 2.0), (shY + hipY) / 2, sgn * shW, shY + 1.2);
      c.closePath();
      ink(c, L.vest, 1.8);
    });
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

  /* ================= FRONT LEG ================= */
  drawLeg(c, L, hipY, hipW * 0.62, P.legF, 1, H);

  /* ================= HEAD ================= */
  leanOn();
  c.save();
  c.translate(P.headX, 0);
  c.rotate(P.headTilt);

  /* neck */
  c.fillStyle = L.skinShade;
  c.fillRect(-2.1, headBot - 1.5, 4.2, 3.6);

  /* face */
  c.beginPath();
  c.moveTo(-headRx, headCY - headRy * 0.25);
  c.quadraticCurveTo(-headRx, headCY - headRy * 1.05, 0, headCY - headRy);
  c.quadraticCurveTo(headRx, headCY - headRy * 1.05, headRx, headCY - headRy * 0.25);
  c.quadraticCurveTo(headRx * 0.98, headCY + headRy * 0.45, headRx * 0.42, headCY + headRy * 0.86);
  c.quadraticCurveTo(0, headCY + headRy * 1.12, -headRx * 0.42, headCY + headRy * 0.86);
  c.quadraticCurveTo(-headRx * 0.98, headCY + headRy * 0.45, -headRx, headCY - headRy * 0.25);
  c.closePath();
  ink(c, L.skin, 2);

  /* cheek shade */
  c.save(); c.globalAlpha *= 0.35;
  ell(c, -headRx * 0.55, headCY + headRy * 0.15, headRx * 0.4, headRy * 0.45);
  c.fillStyle = L.skinShade; c.fill(); c.restore();

  drawFace(c, L, headCY, headRx, headRy, st, t);

  /* ---------- HAIR (front) ---------- */
  drawHair(c, L, headCY, headRx, headRy, t, P);

  /* ---------- HAT ---------- */
  if (who === 'arshia') drawStetson(c, L, headCY, headRx, headRy, P);
  else drawBonnet(c, L, headCY, headRx, headRy, P, t);

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
  drawArm(c, L, shY, shW * 0.78, P.armF, 1, st, who);
  leanOff();   /* head + front arm group ends */

  c.restore();
}

/* ---------------- pose solver ----------------
   Beyond the raw limb angles this produces:
     lean    - the whole upper body rotates about the hips
     squash  - squash-and-stretch about the feet
     headTilt- deliberately lags the lean so the head trails the body
   Those three are what stop the poses reading as a mannequin.        */
function pose(anim, t, st) {
  const P = { bob: 0, headTilt: 0, headX: 0, wind: 0, lean: 0, squash: 0,
              armF: { a: 0.15, b: 0.1 }, armB: { a: -0.15, b: 0.1 },
              legF: { k: 0, lift: 0 }, legB: { k: 0, lift: 0 } };
  const spd = st.speed === undefined ? 1 : st.speed;

  switch (anim) {
    case 'run': {
      const w = t * (9.5 + spd * 4);
      /* two footfalls per cycle, so the bounce runs at double rate */
      const bounce = Math.abs(Math.sin(w));
      const plant = Math.pow(bounce, 3);              /* sharp at the plant */
      P.bob = -bounce * 2.3;
      P.squash = -0.07 * plant + 0.05 * (1 - bounce); /* compress on contact */
      P.lean = 0.17 + spd * 0.05 + Math.sin(w * 2) * 0.02;
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
      P.armF = { a: -1.42, b: 0.06 }; P.armB = { a: -1.28, b: 0.16 };
      P.lean = 0.30; P.headTilt = -0.10; P.headX = 1.2;
      P.legF = { k: -0.65, lift: 0 }; P.legB = { k: 0.55, lift: 0 };
      P.bob = Math.sin(w) * 0.6; P.squash = Math.sin(w) * 0.03;
      break;
    }
    case 'aim':
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
      P.headTilt = Math.sin(w * 0.42 - 0.75) * 0.055;
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

  /* thigh, thicker than the shin so the leg tapers */
  c.beginPath(); c.moveTo(ox, hipY); c.lineTo(kx, ky);
  c.lineWidth = 6.0; c.strokeStyle = PAL.ink; c.stroke();
  c.lineWidth = 4.4; c.strokeStyle = cloth; c.stroke();
  /* shin */
  c.beginPath(); c.moveTo(kx, ky); c.lineTo(fx, fy - 2.6);
  c.lineWidth = 5.0; c.strokeStyle = PAL.ink; c.stroke();
  c.lineWidth = 3.4; c.strokeStyle = cloth; c.stroke();

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

function drawArm(c, L, shY, ox, arm, side, st, who) {
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

  c.save(); c.lineCap = 'round'; c.lineJoin = 'round';

  /* shoulder cap so the arm visibly starts outside the torso */
  ell(c, ox, shY + 0.8, 2.5, 2.7);
  ink(c, sleeve, 1.8);

  /* upper arm, sleeved */
  c.beginPath(); c.moveTo(ox, shY + 0.4); c.lineTo(ex, ey);
  c.lineWidth = 5.4; c.strokeStyle = PAL.ink; c.stroke();
  c.lineWidth = 3.8; c.strokeStyle = sleeve; c.stroke();

  /* forearm, bare - sleeves are rolled up out here */
  c.beginPath(); c.moveTo(ex, ey); c.lineTo(hx, hy);
  c.lineWidth = 4.4; c.strokeStyle = PAL.ink; c.stroke();
  c.lineWidth = 2.9; c.strokeStyle = skin; c.stroke();

  /* hand */
  ell(c, hx, hy, 2.0, 2.1);
  ink(c, skin, 1.4);
  c.restore();

  /* held props go in the forward hand */
  if (side === 1 && st && st.prop) drawProp(c, st.prop, hx, hy, a + b, L, st);
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
  } else if (prop === 'lasso') {
    c.strokeStyle = '#d8bb84'; c.lineWidth = 1.4;
    ell(c, 2.5, 1.5, 3.4, 2.2, 0.4); c.stroke();
  }
  c.restore();
}

/* ---------------- face ---------------- */
function drawFace(c, L, cy, rx, ry, st, t) {
  const expr = st.expr || 'normal';
  const eyeY = cy + ry * 0.16;
  const ex = rx * 0.44;
  const blinkPhase = ((t * 0.55 + (st.blinkSeed || 0)) % 1);
  let open = 1;
  if (blinkPhase > 0.965) open = 0.08;
  if (expr === 'ko') open = 0;
  if (expr === 'love') open = 0.22;
  if (expr === 'wink') open = 1;

  const eyeW = rx * 0.30, eyeH = ry * (L.eyeShape === 'round' ? 0.40 : 0.34) * open;

  const drawEye = (x, isFront, closedOverride) => {
    const o = closedOverride !== undefined ? closedOverride : open;
    if (o < 0.14) {
      /* closed / happy arc */
      c.beginPath();
      c.moveTo(x - eyeW, eyeY + 0.4);
      c.quadraticCurveTo(x, eyeY - (expr === 'love' || expr === 'happy' ? 2.6 : -1.4), x + eyeW, eyeY + 0.4);
      c.lineWidth = 1.5; c.strokeStyle = L.lash; c.lineCap = 'round'; c.stroke();
      return;
    }
    /* sclera */
    ell(c, x, eyeY, eyeW, ry * (L.eyeShape === 'round' ? 0.40 : 0.34) * o);
    c.fillStyle = PAL.white; c.fill();
    /* iris */
    c.save(); c.clip();
    ell(c, x + 0.2, eyeY + 0.3, eyeW * 0.78, eyeW * 0.95);
    c.fillStyle = L.eyeIris; c.fill();
    ell(c, x + 0.2, eyeY + 1.1, eyeW * 0.72, eyeW * 0.6);
    c.fillStyle = L.eyeIrisHi; c.fill();
    ell(c, x + 0.2, eyeY + 0.4, eyeW * 0.34, eyeW * 0.4);
    c.fillStyle = PAL.ink; c.fill();
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
    c.lineWidth = 2.0; c.strokeStyle = L.lash; c.lineCap = 'round'; c.stroke();
    /* outer lash flick - a long wing when the look sheet asks for liner */
    const wing = L.wingedLiner ? 1.9 : 1.0;
    c.beginPath();
    c.moveTo(x + eyeW + 0.3, eyeY - eyeH * 0.8);
    c.quadraticCurveTo(x + eyeW + 1.0 * wing, eyeY - eyeH * 1.1,
                       x + eyeW + 1.9 * wing, eyeY - eyeH * (1.5 + 0.35 * wing));
    c.lineWidth = L.wingedLiner ? 1.6 : 1.3; c.stroke();
    /* lower lid */
    c.beginPath();
    c.moveTo(x - eyeW * 0.7, eyeY + eyeH * 0.85);
    c.quadraticCurveTo(x, eyeY + eyeH * 1.1, x + eyeW * 0.8, eyeY + eyeH * 0.8);
    c.lineWidth = 0.9; c.strokeStyle = 'rgba(26,16,20,0.55)'; c.stroke();
  };

  drawEye(-ex, false, expr === 'wink' ? 0 : undefined);
  drawEye(ex * 1.02, true);

  /* brows */
  const browY = eyeY - ry * 0.42;
  let bTilt = 0, bLift = 0;
  if (expr === 'determined') { bTilt = 0.30; bLift = 1.0; }
  if (expr === 'scared') { bTilt = -0.34; bLift = -1.2; }
  if (expr === 'hurt') { bTilt = -0.4; bLift = -1.4; }
  if (expr === 'happy' || expr === 'love') { bTilt = -0.10; bLift = -0.6; }
  c.strokeStyle = L.brow; c.lineWidth = L.browThick || 1.7; c.lineCap = 'round';
  [[-ex, -1], [ex * 1.02, 1]].forEach(([x, sgn]) => {
    c.beginPath();
    c.moveTo(x - eyeW * 0.95, browY + bLift + sgn * bTilt * 2.2);
    c.quadraticCurveTo(x, browY + bLift - 1.0 + sgn * bTilt, x + eyeW * 0.95, browY + bLift - sgn * bTilt * 0.6);
    c.stroke();
  });

  /* nose */
  c.beginPath();
  c.moveTo(rx * 0.10, cy + ry * 0.42);
  c.lineTo(rx * 0.26, cy + ry * 0.52);
  c.lineWidth = 1.1; c.strokeStyle = 'rgba(26,16,20,0.45)'; c.stroke();

  /* mouth */
  const my = cy + ry * 0.70;
  c.strokeStyle = L.lips || L.lash; c.lineWidth = L.lips ? 1.6 : 1.3; c.lineCap = 'round';
  c.beginPath();
  if (expr === 'happy' || expr === 'cheer') {
    c.moveTo(-1.9, my - 0.6); c.quadraticCurveTo(0.2, my + 2.2, 2.2, my - 0.7);
    c.stroke();
    c.fillStyle = L.lips || '#8e2338'; c.fill();
  } else if (expr === 'love') {
    c.moveTo(-1.4, my); c.quadraticCurveTo(0.3, my + 1.6, 1.9, my - 0.2); c.stroke();
  } else if (expr === 'scared' || expr === 'hurt') {
    ell(c, 0.3, my + 0.3, 1.5, 1.9); ink(c, '#7a2438', 1.1);
  } else if (expr === 'determined') {
    c.moveTo(-1.6, my + 0.3); c.lineTo(2.0, my - 0.2); c.stroke();
  } else if (expr === 'ko') {
    c.moveTo(-1.6, my); c.quadraticCurveTo(0.2, my - 1.6, 2.0, my); c.stroke();
  } else {
    c.moveTo(-1.2, my); c.quadraticCurveTo(0.4, my + 0.9, 1.8, my - 0.1); c.stroke();
  }

  /* blush */
  if (expr === 'love' || expr === 'happy' || st.blush) {
    c.save(); c.globalAlpha *= 0.9;
    ell(c, -ex - 1.4, eyeY + ry * 0.42, rx * 0.26, ry * 0.16);
    c.fillStyle = L.blush; c.fill();
    ell(c, ex + 2.0, eyeY + ry * 0.42, rx * 0.26, ry * 0.16);
    c.fillStyle = L.blush; c.fill();
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
function curlMass(c, lobes, L, tipStrength) {
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
    /* tiny spiral highlight so each curl reads as a ringlet */
    c.beginPath();
    c.arc(x - r * 0.18, y - r * 0.20, r * 0.40, Math.PI * 0.85, Math.PI * 1.95);
    c.lineWidth = Math.max(0.4, r * 0.15);
    c.strokeStyle = L.hairTip && d > 0.55
      ? 'rgba(255,228,238,0.30)' : 'rgba(255,238,220,0.18)';
    c.lineCap = 'round'; c.stroke();
  }
  c.restore();
}

function drawHair(c, L, cy, rx, ry, t, P) {
  const w = Math.sin(t * 3.4) * (0.6 + P.wind * 1.2);
  const cs = L.curlSize || 3;

  /* ---------- ARSHIA : thick short curls, hugging the skull ---------- */
  if (L.hairStyle === 'curlyShort') {
    const lobes = [];
    /* crown row - follows the skull instead of ballooning off it */
    for (let i = 0; i <= 13; i++) {
      const a = Math.PI * (1.06 - i / 13 * 1.12);
      lobes.push([Math.cos(a) * rx * 0.94,
                  cy - Math.sin(a) * ry * 0.98 - ry * 0.16,
                  cs * (0.92 + 0.16 * Math.sin(i * 1.9)), 0]);
    }
    /* a shallow inner row for depth */
    for (let i = 0; i <= 8; i++) {
      const a = Math.PI * (0.94 - i / 8 * 0.88);
      lobes.push([Math.cos(a) * rx * 0.62 + w * 0.2,
                  cy - Math.sin(a) * ry * 0.62 - ry * 0.34,
                  cs * 0.80, 0]);
    }
    /* bangs breaking over the forehead, above the brows */
    lobes.push([-rx * 0.66, cy - ry * 0.50, cs * 0.72, 0]);
    lobes.push([-rx * 0.24, cy - ry * 0.62, cs * 0.74, 0]);
    lobes.push([rx * 0.20, cy - ry * 0.62, cs * 0.72, 0]);
    lobes.push([rx * 0.62, cy - ry * 0.50, cs * 0.70, 0]);
    /* sideburn + nape curls down to the collar */
    lobes.push([-rx * 0.98, cy + ry * 0.10, cs * 0.72, 0]);
    lobes.push([-rx * 1.02 + w * 0.3, cy + ry * 0.52, cs * 0.66, 0]);
    lobes.push([-rx * 0.92 + w * 0.5, cy + ry * 0.90, cs * 0.58, 0]);
    lobes.push([rx * 1.00, cy + ry * 0.12, cs * 0.70, 0]);
    lobes.push([rx * 1.04 + w * 0.3, cy + ry * 0.54, cs * 0.62, 0]);
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
        const wob = Math.sin(f * 6.4 + side * 1.3 + t * 1.5) * (0.9 + P.wind * 1.1);
        lobes.push([side * rx * (1.00 + Math.sin(f * 5.0) * 0.13) + wob,
                    cy + ry * (0.22 + f * 2.10),
                    cs * (0.92 - f * 0.20),
                    0.10 + f * 0.90]);
      }
    }
    curlMass(c, lobes, L);
    return;
  }

  c.save();
  if (L.hairStyle === 'swept') {
    /* short swept anime bangs, spiky tips */
    c.beginPath();
    c.moveTo(-rx * 1.04, cy - ry * 0.14);
    c.quadraticCurveTo(-rx * 1.08, cy - ry * 1.06, 0, cy - ry * 1.10);
    c.quadraticCurveTo(rx * 1.06, cy - ry * 1.04, rx * 1.04, cy - ry * 0.10);
    c.lineTo(rx * 0.86, cy - ry * 0.36);
    c.lineTo(rx * 0.62 + w * 0.5, cy + ry * 0.06);
    c.lineTo(rx * 0.48, cy - ry * 0.44);
    c.lineTo(rx * 0.10 + w * 0.6, cy - ry * 0.02);
    c.lineTo(-rx * 0.06, cy - ry * 0.52);
    c.lineTo(-rx * 0.46 + w * 0.4, cy - ry * 0.10);
    c.lineTo(-rx * 0.62, cy - ry * 0.56);
    c.lineTo(-rx * 0.94, cy - ry * 0.20);
    c.closePath();
    ink(c, L.hair, 2);
    /* sideburn tufts */
    poly(c, [[-rx * 1.02, cy - ry * 0.3], [-rx * 0.78, cy - ry * 0.2], [-rx * 0.88, cy + ry * 0.5]]);
    ink(c, L.hair, 1.4);
    poly(c, [[rx * 1.0, cy - ry * 0.3], [rx * 0.78, cy - ry * 0.2], [rx * 0.9, cy + ry * 0.55]]);
    ink(c, L.hair, 1.4);
    /* sheen */
    c.save(); c.globalAlpha *= 0.55;
    c.beginPath();
    c.moveTo(-rx * 0.5, cy - ry * 0.86);
    c.quadraticCurveTo(0, cy - ry * 1.0, rx * 0.55, cy - ry * 0.8);
    c.quadraticCurveTo(0, cy - ry * 0.72, -rx * 0.5, cy - ry * 0.72);
    c.closePath(); c.fillStyle = L.hairHi; c.fill(); c.restore();
  } else {
    /* long : centre-parted bangs with side clumps */
    c.beginPath();
    c.moveTo(-rx * 1.06, cy - ry * 0.10);
    c.quadraticCurveTo(-rx * 1.10, cy - ry * 1.10, 0, cy - ry * 1.12);
    c.quadraticCurveTo(rx * 1.10, cy - ry * 1.08, rx * 1.06, cy - ry * 0.08);
    c.lineTo(rx * 0.92, cy - ry * 0.30);
    c.lineTo(rx * 0.66 + w * 0.5, cy + ry * 0.16);
    c.lineTo(rx * 0.50, cy - ry * 0.40);
    c.lineTo(rx * 0.22 + w * 0.4, cy - ry * 0.10);
    c.lineTo(rx * 0.06, cy - ry * 0.62);
    c.lineTo(-rx * 0.22 + w * 0.4, cy - ry * 0.06);
    c.lineTo(-rx * 0.48, cy - ry * 0.44);
    c.lineTo(-rx * 0.72 + w * 0.3, cy + ry * 0.14);
    c.lineTo(-rx * 0.94, cy - ry * 0.28);
    c.closePath();
    ink(c, L.hair, 2);
    /* side locks framing the face */
    poly(c, [[-rx * 1.04, cy - ry * 0.3], [-rx * 0.80, cy - ry * 0.15],
             [-rx * 0.94 + w, cy + ry * 1.5], [-rx * 1.18 + w * 0.6, cy + ry * 1.2]]);
    ink(c, L.hair, 1.6);
    poly(c, [[rx * 1.02, cy - ry * 0.3], [rx * 0.80, cy - ry * 0.15],
             [rx * 0.96 + w, cy + ry * 1.5], [rx * 1.20 + w * 0.6, cy + ry * 1.2]]);
    ink(c, L.hair, 1.6);
    c.save(); c.globalAlpha *= 0.5;
    c.beginPath();
    c.moveTo(-rx * 0.55, cy - ry * 0.92);
    c.quadraticCurveTo(0, cy - ry * 1.06, rx * 0.6, cy - ry * 0.86);
    c.quadraticCurveTo(0, cy - ry * 0.76, -rx * 0.55, cy - ry * 0.78);
    c.closePath(); c.fillStyle = L.hairHi; c.fill(); c.restore();
  }
  c.restore();
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
  c.beginPath();
  c.moveTo(-rx * 0.95, brimY - 0.6);
  c.quadraticCurveTo(-rx * 1.0, cy - ry * 1.62, -rx * 0.42, cy - ry * 1.72);
  c.quadraticCurveTo(-rx * 0.16, cy - ry * 1.38, 0, cy - ry * 1.70);
  c.quadraticCurveTo(rx * 0.18, cy - ry * 1.40, rx * 0.44, cy - ry * 1.70);
  c.quadraticCurveTo(rx * 1.0, cy - ry * 1.60, rx * 0.95, brimY - 0.6);
  c.closePath();
  ink(c, L.hat, 2);
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
  c.beginPath();
  c.moveTo(-rx * 0.98, brimY - 0.2);
  c.quadraticCurveTo(-rx * 1.02, cy - ry * 1.66, 0, cy - ry * 1.70);
  c.quadraticCurveTo(rx * 1.02, cy - ry * 1.66, rx * 0.98, brimY - 0.2);
  c.closePath();
  ink(c, L.hat, 2);
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
  c.translate(0, 0);
  drawCharBody(c, who, L, sub, t);
  c.restore();
  c.restore();
  /* floating fading heart */
  const p = (t * 0.6) % 1;
  c.save();
  c.globalAlpha *= (1 - p) * 0.9;
  drawHeart(c, 4 + Math.sin(t * 2) * 2, -H * 0.55 - p * 16, 3 + p * 2, LOOK[who].accent);
  c.restore();
}
/* helper so drawDowned can render a body without recursion problems */
function drawCharBody(c, who, L, st, t) {
  const saveH = st.scale;
  c.save();
  drawCharInner(c, who, L, st, t);
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
  if (L.hairStyle === 'long') {
    poly(c, [[-headRx, -headRy * 0.3], [-headRx * 1.7, headRy * 1.4], [-headRx * 1.3, headRy * 2.6],
             [headRx * 1.3, headRy * 2.6], [headRx * 1.7, headRy * 1.4], [headRx, -headRy * 0.3]]);
    ink(c, L.hair, 2);
  }
  ell(c, 0, headCY, headRx, headRy); ink(c, L.skin, 2);
  drawFace(c, L, headCY, headRx, headRy, { expr: expr || 'normal', t: t || 0, blinkSeed: who === 'rojina' ? 0.4 : 0 }, t || 0);
  drawHair(c, L, headCY, headRx, headRy, t || 0, { wind: 0.3 });
  if (who === 'arshia') drawStetson(c, L, headCY, headRx, headRy, { wind: 0 });
  else drawBonnet(c, L, headCY, headRx, headRy, { wind: 0 }, t || 0);
  c.restore();
}
