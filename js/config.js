/* =====================================================================
   HAFEZ GAME  --  ARSHIA & ROJINA
   config.js : global tuning, palette, and the CHARACTER LOOK sheet.
   Everything about how the two of them look lives in LOOK below, so it
   can be retuned from a photo description without touching art code.
   ===================================================================== */

const CFG = {
  W: 960, H: 540,            // logical resolution (scaled to fit window)
  GRAV: 2300,                // px / s^2
  TERMINAL: 900,
  COYOTE: 0.10,              // forgiving jump window
  JUMP_BUFFER: 0.12,
  TITLE: 'HAFEZ GAME',
  SUBTITLE: 'ARSHIA  &  ROJINA',
  SAVE_KEY: 'hafezgame.save.v1'
};

/* ---------- DESERT SUNSET PALETTE ---------- */
const PAL = {
  skyTop:   '#241543',
  skyHigh:  '#4a1f52',
  skyMid:   '#8d2f56',
  skyLow:   '#d9542b',
  skyHaze:  '#f3a45c',
  sun:      '#ffd66b',
  sunCore:  '#fff3c4',
  mesaFar:  '#6b3358',
  mesaMid:  '#48254a',
  mesaNear: '#2e1836',
  ground:   '#241329',
  groundTop:'#5c3350',
  sand:     '#e0a969',
  sandDark: '#a9713f',
  wood:     '#7a4a2b',
  woodDark: '#4a2a17',
  ink:      '#160d1c',
  metal:    '#9aa2b1',
  metalDk:  '#5a6070',
  parch:    '#efdcb0',
  parchDk:  '#c9ae79',
  gold:     '#e2b043',
  red:      '#e0455e',
  redDk:    '#8e2338',
  teal:     '#3fb6a8',
  white:    '#fff6e6',
  shadow:   'rgba(22,13,28,0.35)'
};

/* =====================================================================
   THE LOOK SHEET
   ---------------------------------------------------------------------
   Stylised from the reference photos the players supplied.
   Every value below is consumed by art.js, so the whole game re-skins
   from this one block.
   hairStyle : 'curlyShort' | 'curlyLong' | 'swept' | 'long'
   eyeShape  : 'sharp' | 'round' | 'soft'
   ===================================================================== */
const LOOK = {
  /* ---------------- ARSHIA -------------------------------------------
     Reference: thick dark-brown curls with real volume, falling to the
     nape; strong straight brows; warm-light skin; deep brown eyes;
     long face; tan canvas jacket over a black tee.  Translated west as
     a canvas trail-coat, black shirt and a stetson pushed back so the
     curls stay visible.                                                */
  arshia: {
    name: 'ARSHIA',
    nameFa: 'عرشیا',
    height: 53,               // px, feet to crown (3-head anime build)
    build: 0.92,              // slim frame
    skin: '#f3cba6',
    skinShade: '#d5a179',
    blush: 'rgba(224,69,94,0.26)',
    hair: '#241a19',
    hairHi: '#4e3730',
    hairTip: null,            // no ombre
    hairStyle: 'curlyShort',
    curlSize: 2.35,            // radius of each curl lobe
    curlCount: 18,
    brow: '#1c1210',
    browThick: 2.4,           // thick, straight brows
    eyeShape: 'sharp',
    eyeIris: '#4a2f21',
    eyeIrisHi: '#8a5a34',
    lash: '#160f0d',
    glasses: false,
    // wardrobe
    hat: '#c39355',           // stetson felt
    hatBand: '#3d2318',
    hatBrim: '#a9793f',
    hatTiltBack: true,        // worn back so the curls show
    bandana: '#c9354b',
    cape: '#b02c3e',          // the red cape
    capeDark: '#6d1626',
    shirt: '#25222a',         // black tee
    vest: '#cdae7c',          // tan canvas trail coat (from the photo)
    vestDark: '#a48a5f',
    belt: '#3a2114',
    buckle: '#e2b043',
    pants: '#3b4257',
    boots: '#5b3a1e',
    accent: '#e2b043'         // his UI colour
  },

  /* ---------------- ROJINA -------------------------------------------
     Reference: long tight ringlets, dark roots melting into a rose /
     pink ombre; round wire-frame glasses; strong brows and winged
     liner; warm skin; rose lips; a small black heart pendant on a cord.
     Translated west as a prairie blouse and skirt, a woven sun-bonnet
     worn back off the curls, and the same heart at her throat.         */
  rojina: {
    name: 'ROJINA',
    nameFa: 'روژینا',
    height: 50,
    build: 0.86,
    skin: '#f6cda4',
    skinShade: '#d9a276',
    blush: 'rgba(224,69,94,0.36)',
    hair: '#2b1c1a',
    hairHi: '#523430',
    hairTip: '#c9718c',       // the pink ombre on the ends
    hairTip2: '#e9a0b4',
    hairStyle: 'curlyLong',
    curlSize: 1.95,
    curlCount: 14,
    brow: '#1d1210',
    browThick: 2.5,
    eyeShape: 'round',
    eyeIris: '#4b3123',
    eyeIrisHi: '#8f6238',
    lash: '#140e0d',
    wingedLiner: true,
    glasses: true,            // round wire frames
    glassFrame: '#b9b3ad',
    lips: '#d4576b',
    // wardrobe
    hat: '#e2c68c',           // woven straw bonnet
    hatBand: '#e2618f',      // ribbon to match
    hatWeave: '#bda069',
    hatTiltBack: true,
    dress: '#ef8ab5',        // pink, the way she wanted it
    dressDark: '#c25c8c',
    apron: '#f7efdd',         // white prairie blouse tone
    collar: '#fff9ec',
    boots: '#6b4326',
    lantern: '#ffd66b',
    pendant: '#1b1519',       // the black heart pendant
    pendantCord: '#241d22',
    accent: '#f294bd'         // her UI colour
  }
};

/* ---------- DIFFICULTY ---------- */
const DIFF = {
  greenhorn:  { name: 'GREENHORN',  tScale: 1.30, hearts: 4, hint: 'Forgiving timers, four hearts.' },
  gunslinger: { name: 'GUNSLINGER', tScale: 1.00, hearts: 3, hint: 'The way it was meant to be played.' },
  legend:     { name: 'LEGEND',     tScale: 0.78, hearts: 2, hint: 'Tight timers. Two hearts. No mercy.' }
};
