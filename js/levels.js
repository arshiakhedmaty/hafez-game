/* =====================================================================
   levels.js : hand-authored stage data.

   EVERY distance in this file is laid out against the movement budget
   the engine actually produces (see the header of platformer.js):

       ARSHIA   rise  95px    flat gap 122px   -> authored to  70 / 95
       ROJINA   rise 159px    flat gap 184px   -> authored to 125 / 145

   So: anything that rises 100-150px above its footing is HERS ALONE,
   and any gap wider than 95px needs either her double jump, his lasso,
   or a platform. tools/validate.js walks these tables and fails loudly
   if a surface is not reachable by whoever has to stand on it.

   Doors are archways that stand ON the ground: a lintel block high
   overhead plus a gate filling the opening. The floor runs straight
   through underneath, so an open door is a door and not a hole.
   ===================================================================== */

const G  = (x, y, w, h) => ({ x, y, w, h, type: 'ground' });
const PK = (x, y, w, h) => ({ x, y, w, h, type: 'plank' });
const TB = (x, y, w, h) => ({ x, y, w, h, type: 'timber' });
/* moving platform: travels a -> b and back, `period` seconds round trip */
const MV = (x, y, w, h, bx, by, period, type) =>
  ({ x, y, w, h, ax: x, ay: y, bx, by, period, type: type || 'plank', ph: 0 });

/* an archway standing on the ground: lintel overhead, gate in the gap.
   `top` is the floor level it stands on; the opening is 90px tall.     */
function ARCH(id, x, top, openBy, mode, kind, latch) {
  const mk = kind === 'timber' ? TB : G;
  return {
    lintel: Object.assign(mk(x, top - 250, 44, 160), { role: 'lintel' }),
    /* latch: once opened it stays open, so nobody is ever trapped on
       the wrong side of a door they already solved. Crate doors pass
       latch=false, because the crate itself is what holds them and
       latching one would make the whole puzzle pointless.            */
    gate: { id, x, y: top - 90, w: 44, h: 90, openBy, mode: mode || 'all',
            latch: latch !== false }
  };
}
/* a pressure plate resting on a surface whose top edge is `top` */
const PLATE = (id, x, top, who, w) =>
  ({ id, x, y: top - 11, w: w || 70, who: who || 'any' });

/* ------------------------------------------------------------------ */
/* CHAPTER 1 : DUSTY GULCH                                             */
/* Street level runs at y = 470 the whole way, so the shape of the      */
/* level is readable at a glance. Teaches, in order:                    */
/*   1. Arshia is the only one who can shift a crate  -> door one       */
/*   2. Rojina is the only one who can reach a high ledge               */
/*   3. the two-plate handshake that gets BOTH of them through a door   */
/*   4. the split route: her double jump vs his lasso                   */
/* ------------------------------------------------------------------ */
const arch1a = ARCH('g1', 560, 470, ['p1'], 'all', null, false);
const arch1b = ARCH('g2', 2760, 470, ['p2a', 'p2b'], 'any');

/* a straight run of ledges: n of them, `w` wide, `gap` apart, every other
   one raised by `dy`. Keeps long stretches honest by construction.      */
function RUN(x, y, n, w, gap, dy, mk) {
  const out = [];
  mk = mk || PK;
  for (let i = 0; i < n; i++)
    out.push(mk(x + i * (w + gap), y - (i % 2 ? dy : 0), w, 16));
  return out;
}
const RUN_END = (x, n, w, gap) => x + n * (w + gap) - gap;

/* CHAPTER 3 : THE DEEP MINE  -- floor at y = 510 */
const arch3a = ARCH('gm1', 1120, 510, ['m1'], 'all', 'timber', false);
const arch3b = ARCH('gm2', 3100, 510, ['m2', 'm3'], 'any', 'timber');

/* CHAPTER 7 : THE LAST SUNSET -- floor at y = 490 */
const arch7a = ARCH('sg1', 560, 490, ['s1'], 'all', null, false);
const arch7b = ARCH('sg2', 1500, 490, ['s2a', 's2b'], 'any');

const STAGES = [

  /* ================================================================= 1 */
  {
    id: 'gulch', kind: 'platform', name: 'DUSTY GULCH',
    sub: 'Chapter One', theme: 'gulch', music: 'gulch',
    story: 'They rode out of Redwater at first light. The posse was an hour behind.',
    hint: 'ARSHIA shoves crates and throws the lasso. ROJINA jumps twice as high.',
    /* Roughly three times the original run. Laid out in ten beats so the
       difficulty climbs instead of repeating:
         A 0-1000     the street, the crate and the first door
         B 1080-1500  first real gap, first spikes
         C 1580-2260  a run of stepping planks
         D 2340-2900  her high ledge and the second door
         E 2980-3400  a vertical lift
         F 3400-3600  the split: her planks vs his lasso
         G 4120-4770  crumbling shelves
         H 4850-6040  spike gauntlet, then a shuttle over the chasm
         I 6120-7260  a staircase up and back down
         J 7260-8260  two lasso chasms, then the climb to the border      */
    w: 9800, h: 660, deathY: 760, parTime: 210,
    spawn: { a: [90, 428], r: [140, 428] },

    solids: [
      /* --- A : the street. One slab, so the archway stands on it --- */
      G(0, 470, 1000, 170),
      arch1a.lintel,

      /* --- B : 80px gap, then a shelf with the first spikes --- */
      G(1080, 470, 420, 170),                    /* 1080 .. 1500 */

      /* --- C : four stepping planks, 80 apart, 45 of rise each --- */
      ...RUN(1580, 450, 4, 110, 80, 45),         /* 1580 .. 2260 */

      /* --- D : her ledge and the second door --- */
      G(2340, 470, 560, 170),                    /* 2340 .. 2900 */
      PK(2440, 362, 110, 18),                    /* +108 : hers alone */
      arch1b.lintel,

      /* --- E : a shelf with a lift on it --- */
      G(2980, 470, 420, 170),                    /* 2980 .. 3400 */

      /* --- F : the split. 200px of nothing --- */
      PK(3440, 362, 90, 16),                     /* +108 : hers alone */
      PK(3540, 330, 90, 16),
      G(3600, 470, 440, 170),                    /* 3600 .. 4040 */

      /* --- G : crumbling shelves live in `crumbles` --- */
      G(4850, 470, 420, 170),                    /* 4850 .. 5270 */

      /* --- H : the shuttle crosses 5270 .. 5600 --- */
      G(5600, 470, 440, 170),                    /* 5600 .. 6040 */

      /* --- I : up the staircase and back down --- */
      G(6120, 420, 200, 240),
      G(6400, 370, 200, 290),
      G(6680, 420, 200, 240),
      G(6960, 470, 300, 190),                    /* 6960 .. 7260 */

      /* --- J : two lasso chasms with a landing between --- */
      PK(7300, 362, 90, 16),                     /* +108 : hers alone */
      G(7460, 470, 180, 190),                    /* 7460 .. 7640 */
      PK(7680, 362, 90, 16),                     /* +108 : hers alone */
      G(7840, 470, 420, 190),                    /* 7840 .. 8260 */

      /* --- the climb to the border road : 80 across, 50 up.
         60 of rise at an 80 gap sits 2px outside his budget, so the
         staircase is cut to 50 and gains a step instead. --- */
      G(8340, 420, 200, 240),
      G(8620, 370, 200, 290),
      G(8900, 320, 200, 340),
      G(9180, 270, 200, 390),
      G(9460, 220, 340, 440)                     /* 9460 .. 9800 */
    ],

    gates: [arch1a.gate, arch1b.gate],
    plates: [
      PLATE('p1', 400, 470, 'crate'),            /* only the crate holds it */
      PLATE('p2a', 2440, 362, 'rojina'),         /* her high ledge       */
      PLATE('p2b', 2830, 470)                    /* his side of door two */
    ],
    crates: [{ x: 230, y: 424, w: 46, h: 46 }],

    crumbles: [
      { x: 4120, y: 440, w: 110, h: 16 },
      { x: 4300, y: 400, w: 110, h: 16 },
      { x: 4480, y: 440, w: 110, h: 16 },
      { x: 4660, y: 400, w: 110, h: 16 }
    ],

    movers: [
      MV(3040, 410, 96, 16, 3040, 300, 4.0),     /* lift, for the coins  */
      MV(5310, 450, 110, 18, 5450, 450, 3.4)     /* shuttle over H       */
    ],

    rings: [
      { x: 1340, y: 300 },
      { x: 3480, y: 300 }, { x: 3580, y: 290 },  /* the split            */
      { x: 6560, y: 250 },
      { x: 7360, y: 300 },                       /* chasm one            */
      { x: 7740, y: 300 }                        /* chasm two            */
    ],

    hazards: [
      { x: 1230, y: 452, w: 70, h: 18, type: 'spikes' },
      { x: 4950, y: 452, w: 60, h: 18, type: 'spikes' },
      { x: 5110, y: 452, w: 60, h: 18, type: 'spikes' },
      { x: 5700, y: 452, w: 60, h: 18, type: 'spikes' },
      { x: 7040, y: 452, w: 60, h: 18, type: 'spikes' },
      { x: 7920, y: 452, w: 60, h: 18, type: 'spikes' }
    ],

    coins: [
      { x: 300, y: 420 }, { x: 700, y: 420 }, { x: 1040, y: 400 },
      { x: 1400, y: 420 }, { x: 1635, y: 400 }, { x: 1825, y: 355 },
      { x: 2015, y: 400 }, { x: 2205, y: 355 }, { x: 2400, y: 420 },
      { x: 2495, y: 312 }, { x: 2700, y: 420 }, { x: 3088, y: 268 },
      { x: 3200, y: 420 }, { x: 3485, y: 317 }, { x: 3585, y: 285 },
      { x: 3800, y: 420 }, { x: 4175, y: 390 }, { x: 4355, y: 350 },
      { x: 4535, y: 390 }, { x: 4715, y: 350 }, { x: 5030, y: 420 },
      { x: 5380, y: 400 }, { x: 5900, y: 420 }, { x: 6220, y: 370 },
      { x: 6500, y: 320 }, { x: 6780, y: 370 }, { x: 7100, y: 420 },
      { x: 7345, y: 312 }, { x: 7550, y: 420 }, { x: 7725, y: 312 },
      { x: 8050, y: 420 }, { x: 8440, y: 370 }, { x: 8720, y: 320 },
      { x: 9000, y: 270 }, { x: 9280, y: 220 }, { x: 9600, y: 170 }
    ],

    checkpoints: [
      { x: 1120, y: 470 }, { x: 2380, y: 470 }, { x: 3640, y: 470 },
      { x: 4890, y: 470 }, { x: 5640, y: 470 }, { x: 7000, y: 470 },
      { x: 7880, y: 470 }, { x: 8660, y: 370 }
    ],
    exit: { x: 9560, y: 120, w: 60, h: 100 }
  },

  /* ================================================================= 2 */
  {
    id: 'duel', kind: 'duel', name: 'HIGH NOON',
    sub: 'Interlude', theme: 'duel', music: 'duel',
    story: 'Marshal Kade caught them on the main street. Only one way through.',
    hint: 'Wait for DRAW. Then fire together - within a third of a second of each other.',
    rounds: 3, maxFails: 4, parTime: 0
  },

  /* ================================================================= 3 */
  {
    id: 'mine', kind: 'platform', name: 'THE DEEP MINE',
    sub: 'Chapter Two', theme: 'mine', music: 'mine',
    story: 'Down where the silver ran out, the dark had teeth.',
    hint: 'Ghost timbers only hold weight inside her lantern. Do not leave him.',
    w: 3500, h: 700, deathY: 800, parTime: 100, dark: true,
    spawn: { a: [80, 468], r: [130, 468] },

    solids: [
      TB(0, 510, 420, 190),                      /* 0 .. 420            */
      TB(560, 390, 80, 16),                      /* a perch over the bridge */
      TB(800, 510, 320, 190),                    /* 800 .. 1120         */
      arch3a.lintel,
      TB(1120, 510, 44, 190),                    /* floor under door 1  */
      TB(1164, 510, 340, 190),                   /* 1164 .. 1504        */
      TB(1660, 350, 90, 16),                     /* +160 over the timbers : hers */
      TB(1900, 510, 400, 190),                   /* 1900 .. 2300        */
      TB(2560, 510, 540, 190),                   /* 2560 .. 3100        */
      TB(2700, 402, 110, 18),                    /* +108 : her plate ledge  */
      arch3b.lintel,
      TB(3100, 510, 44, 190),                    /* floor under door 2  */
      TB(3144, 510, 356, 190)                    /* 3144 .. 3500        */
    ],
    /* only solid while she is standing within 200px of them */
    phantoms: [
      { x: 440, y: 470, w: 100, h: 18 },
      { x: 560, y: 440, w: 100, h: 18 },
      { x: 680, y: 470, w: 100, h: 18 },
      { x: 1520, y: 470, w: 100, h: 18 },
      { x: 1650, y: 440, w: 100, h: 18 },
      { x: 1780, y: 470, w: 100, h: 18 }
    ],
    /* the shuttle that carries them both over the last chasm */
    movers: [MV(2330, 470, 110, 18, 2450, 470, 4.0, 'timber')],
    gates: [arch3a.gate, arch3b.gate],
    plates: [
      PLATE('m1', 960, 510, 'crate'),            /* only the crate holds it */
      PLATE('m2', 2720, 402, 'rojina'),
      PLATE('m3', 3180, 510)
    ],
    crates: [{ x: 860, y: 464, w: 46, h: 46 }],
    rings: [{ x: 620, y: 300 }, { x: 1700, y: 260 }, { x: 2400, y: 340 }],
    hazards: [{ x: 2000, y: 492, w: 70, h: 18, type: 'spikes' }],
    coins: [
      { x: 300, y: 460 }, { x: 490, y: 420 }, { x: 610, y: 390 },
      { x: 730, y: 420 }, { x: 900, y: 460 }, { x: 1300, y: 460 },
      { x: 1570, y: 420 }, { x: 1705, y: 300 }, { x: 1830, y: 420 },
      { x: 2100, y: 460 }, { x: 2385, y: 420 }, { x: 2755, y: 337 },
      { x: 2900, y: 460 }, { x: 3260, y: 460 }, { x: 3420, y: 460 }
    ],
    checkpoints: [{ x: 900, y: 510 }, { x: 1960, y: 510 }, { x: 2620, y: 510 }],
    exit: { x: 3380, y: 410, w: 60, h: 100 }
  },

  /* ================================================================= 4 */
  {
    id: 'vault', kind: 'vault', name: 'CRACK THE SAFE',
    sub: 'Interlude', theme: 'vault', music: 'vault',
    story: 'The Redwater bank held their fare out of the territory. So they took it.',
    hint: 'She reads the tumbler. He turns the dial. Neither can do both.',
    dials: 4, parTime: 0
  },

  /* ================================================================= 5 */
  {
    id: 'canyon', kind: 'platform', name: 'CANYON RUN',
    sub: 'Chapter Three', theme: 'canyon', music: 'chase',
    story: 'The canyon wall came down behind them, one shelf at a time.',
    hint: 'Every ledge falls the moment you land on it. They come back. You might not.',
    w: 3700, h: 660, deathY: 760, parTime: 75,
    spawn: { a: [70, 428], r: [120, 428] },

    solids: [
      G(0, 470, 300, 170),
      G(1080, 450, 150, 190),                    /* solid rest one      */
      G(2180, 450, 150, 190),                    /* solid rest two      */
      G(3280, 470, 420, 170)                     /* the far rim         */
    ],
    /* 65-70px gaps and 45px steps : safely inside HIS budget, so the
       challenge is the timer under their feet, never the reach         */
    crumbles: [
      { x: 380, y: 430, w: 110, h: 16 },
      { x: 555, y: 385, w: 110, h: 16 },
      { x: 730, y: 430, w: 110, h: 16 },
      { x: 905, y: 385, w: 110, h: 16 },
      { x: 1300, y: 430, w: 110, h: 16 },
      { x: 1475, y: 385, w: 110, h: 16 },
      { x: 1650, y: 430, w: 110, h: 16 },
      { x: 1825, y: 385, w: 110, h: 16 },
      { x: 2000, y: 430, w: 110, h: 16 },
      { x: 2400, y: 430, w: 110, h: 16 },
      { x: 2575, y: 385, w: 110, h: 16 },
      { x: 2750, y: 430, w: 110, h: 16 },
      { x: 2925, y: 385, w: 110, h: 16 },
      { x: 3100, y: 430, w: 110, h: 16 }
    ],
    movers: [],
    rings: [{ x: 700, y: 300 }, { x: 1400, y: 290 },
            { x: 2100, y: 300 }, { x: 2800, y: 290 }],
    hazards: [],
    coins: [
      { x: 435, y: 380 }, { x: 610, y: 335 }, { x: 785, y: 380 },
      { x: 960, y: 335 }, { x: 1155, y: 400 }, { x: 1355, y: 380 },
      { x: 1530, y: 335 }, { x: 1705, y: 380 }, { x: 1880, y: 335 },
      { x: 2055, y: 380 }, { x: 2255, y: 400 }, { x: 2455, y: 380 },
      { x: 2630, y: 335 }, { x: 2805, y: 380 }, { x: 2980, y: 335 },
      { x: 3155, y: 380 }, { x: 3400, y: 420 }
    ],
    checkpoints: [{ x: 1120, y: 450 }, { x: 2220, y: 450 }],
    exit: { x: 3420, y: 370, w: 60, h: 100 }
  },

  /* ================================================================= 6 */
  {
    id: 'ride', kind: 'ride', name: 'RIDE OR DIE',
    sub: 'Interlude', theme: 'canyon', music: 'chase',
    story: 'One horse. Two of them. A whole territory that wanted them back.',
    hint: 'He steers and jumps. She aims and fires. Say what you see.',
    distance: 2600, parTime: 0
  },

  /* ================================================================= 7 */
  {
    id: 'sunset', kind: 'platform', name: 'THE LAST SUNSET',
    sub: 'Finale', theme: 'finale', music: 'finale',
    story: 'One ridge left, and the border on the other side of it.',
    hint: 'Crate, ledge, lasso, lantern, falling rock. All of it, one after another.',
    w: 4300, h: 680, deathY: 780, parTime: 130,
    spawn: { a: [80, 448], r: [130, 448] },

    solids: [
      G(0, 490, 1000, 190),                      /* 0 .. 1000           */
      arch7a.lintel,
      /* 80px gap */
      G(1080, 490, 464, 190),                    /* 1080 .. 1544, runs under door 2 */
      PK(1200, 382, 120, 18),                    /* +108 : hers alone   */
      arch7b.lintel,
      G(1544, 490, 456, 190),                    /* 1544 .. 2000        */
      /* --- the lasso split : 190px --- */
      PK(2040, 382, 90, 16),                     /* +108 : hers alone   */
      PK(2140, 344, 90, 16),
      G(2190, 490, 410, 190),                    /* 2190 .. 2600        */
      /* --- the ghost bridge, with a perch only she can take --- */
      PK(2740, 310, 90, 16),                     /* +110 over the timbers */
      G(2980, 490, 420, 190),                    /* 2980 .. 3400        */
      G(3830, 490, 470, 190)                     /* 3830 .. 4300        */
    ],
    phantoms: [
      { x: 2620, y: 450, w: 100, h: 18 },
      { x: 2740, y: 420, w: 100, h: 18 },
      { x: 2860, y: 450, w: 100, h: 18 }
    ],
    crumbles: [
      { x: 3420, y: 450, w: 110, h: 16 },
      { x: 3560, y: 430, w: 110, h: 16 },
      { x: 3700, y: 450, w: 110, h: 16 }
    ],
    movers: [
      MV(1720, 450, 100, 16, 1720, 330, 4.2),
      MV(3140, 440, 100, 16, 3300, 440, 3.6)
    ],
    gates: [arch7a.gate, arch7b.gate],
    plates: [
      PLATE('s1', 380, 490, 'crate'),
      PLATE('s2a', 1220, 382, 'rojina'),
      PLATE('s2b', 1580, 490)
    ],
    crates: [{ x: 200, y: 444, w: 46, h: 46 }],
    rings: [{ x: 760, y: 320 }, { x: 1400, y: 300 },
            { x: 2080, y: 330 }, { x: 2170, y: 318 },
            { x: 2900, y: 300 }, { x: 3600, y: 300 }],
    hazards: [
      { x: 1330, y: 472, w: 60, h: 18, type: 'spikes' },
      { x: 2400, y: 472, w: 60, h: 18, type: 'spikes' },
      { x: 3220, y: 472, w: 60, h: 18, type: 'spikes' }
    ],
    coins: [
      { x: 300, y: 440 }, { x: 700, y: 440 }, { x: 940, y: 420 },
      { x: 1260, y: 331 }, { x: 1440, y: 440 }, { x: 1770, y: 300 },
      { x: 1950, y: 440 }, { x: 2085, y: 320 }, { x: 2185, y: 296 },
      { x: 2350, y: 440 }, { x: 2670, y: 402 }, { x: 2790, y: 262 },
      { x: 2910, y: 402 }, { x: 3080, y: 440 }, { x: 3350, y: 440 },
      { x: 3475, y: 400 }, { x: 3615, y: 380 }, { x: 3755, y: 400 },
      { x: 3950, y: 440 }, { x: 4150, y: 440 }
    ],
    checkpoints: [{ x: 1100, y: 490 }, { x: 2220, y: 490 },
                  { x: 3020, y: 490 }, { x: 3860, y: 490 }],
    exit: { x: 4150, y: 390, w: 60, h: 100 }
  }
];

const stageIndex = id => STAGES.findIndex(s => s.id === id);
