// E1M3 — The Fondue Works
//
// WALKTHROUGH. Start in the Loading Dock (SW, '>' at 2,34): steel walls, lamps, a trooper and a mouse.
//  Door (5,26) north -> River Hall: two banks split by a fondue river (hazard) with two grate walkways
//    (x3-4 and x9-10). North bank holds troopers and a cauldron; cross to reach it.
//  North bank doors: (5,12) -> Cauldron Room (NW, dirt, 4 cauldrons, troopers + a sewer rat; exits east by
//    door (11,5) to the Pump Station = loop), (12,12) -> Pump Station vestibule.
//  Pump Station (N centre, grating, fondue channel x18-19 with a walkway): YARN LAUNCHER at (13,9), one panzer.
//    Walk round the channel via row 10 or cross it. East door (26,5) -> Foundry.
//  Foundry (E strip, fondue river x31-32, walkways y8-10 and y17-19): 2 troopers west bank, 2 panzers east
//    bank; GOLD KEY at (35,12). South door (28,26) -> Sewer Cellar (dirt, 4 sewer rats) -> west door (11,32)
//    -> Dock: the big loop Dock/River/Pump/Foundry/Sewer.
//  Control Room (centre, checker floor): entered ONLY through the gold door (19,12) from the Pump Station
//    corridor (19,11). A panzer guards it; the exit switch X is on its south wall at (19,25).
//  Critical path: Dock -> River -> Pump -> Foundry (key) -> back to Pump -> gold door -> Control -> X.
//  Loops: Dock/River/Cauldron/Pump/River; Pump/Foundry/Sewer/Dock/River/Pump.
//  SECRET 1: River Hall east wall steel pushwall (13,15) (push east from (12,15)) -> gold niche with GATLING.
//  SECRET 2: River Hall east wall steel pushwall (13,22) (push east from (12,22)) -> niche with CATNIP and
//    an EXTRA LIFE.
//  SECRET 3: Pump Station south wall steel pushwall (22,11) (push south from (22,10)) -> niche with brie
//    wheel and cheese crown.
//  Difficulty ramps: Dock (1 trooper, 1 mouse) -> River (3 troopers) -> Cauldron / Pump (troopers, 1 panzer)
//  Polish: Dock now grate floor + lamp-panel ceiling with fill light and candelabra; fondue river carries three low
//    '!' glow lights that light River Hall from below; one fill light added in the Pump Station.
//    -> Foundry (2 troopers, 2 panzers) -> Control (1 panzer). Sewer rats lurk in the optional cellar.

export default {
  id: 'e1m3', name: 'The Fondue Works', intro: 'Pipes, pumps and molten cheese. Stay on the grating, kitty.', par: 420, music: 'level_c',
  wall: 'wall.steel_plate', floor: 'flat.floor_stone', ceil: 'flat.ceil_panel',
  zones: {
    d: { floor: 'flat.floor_grate', ceil: 'flat.ceil_lamp_panel' },
    b: { floor: 'flat.floor_stone', ceil: 'flat.ceil_panel' },
    v: { floor: 'flat.floor_fondue', ceil: 'flat.ceil_panel' },
    w: { floor: 'flat.floor_grate', ceil: 'flat.ceil_lamp_panel' },
    c: { floor: 'flat.floor_dirt', ceil: 'flat.ceil_stone' },
    p: { floor: 'flat.floor_grate', ceil: 'flat.ceil_lamp_panel' },
    f: { floor: 'flat.floor_stone', ceil: 'flat.ceil_panel' },
    o: { floor: 'flat.floor_checker', ceil: 'flat.ceil_lamp_panel' },
    s: { floor: 'flat.floor_dirt', ceil: 'flat.ceil_stone' },
    n: { floor: 'flat.floor_gold', ceil: 'flat.ceil_stone' },
  },
  ambient: [0.04, 0.035, 0.04],
  fog: { color: [0.03, 0.02, 0.01], density: 0.04 },
  map: [
    "KKKKKKKKKKKKJKKSKJJJSSKJKJJJKSSJJSKKJJ",
    "K..........K..............J..........J",
    "K..........K..............J..........J",
    "K..........K..........J...J..........J",
    "K..........K....J.........J..........K",
    "Q..........=..............=..........J",
    "K..........K..............J..........J",
    "Q..........K....J.....J...J..........J",
    "K..........K..............J..W.......S",
    "K..........K..............J..W.......J",
    "K..........K..............J.......WW.J",
    "KKKKK.KKKKKK.JJJJJJ.JNjNJJJ..........J",
    "JJKSK=KSSKSS=J####J1JN.N##J..........K",
    "J............J####J.JN.N##J..........J",
    "J............NNNNVV.VNVVVJJ..........J",
    "J............j..N........JJ..........J",
    "J............NNNN........JJ.W........S",
    "J............J##J........JJ..........J",
    "S............S##K........KJ.......WW.J",
    "S............S##J.J......JJ..........J",
    "S............S##K......J.KJ..W.......S",
    "J............NNNN........JJ..........J",
    "J............j..N........JJ..........K",
    "J............NNNN........JJ..........J",
    "J............J##J........JJ..........J",
    "J............J##JKJXJQJKJJJ..........J",
    "JJJJJ=JJJJJJJJYYYYYYYYYYYYJJ=JJJJJJJJJ",
    "J..........J.........................Y",
    "J..........J.....................W...Y",
    "S..........J..............Y..........Y",
    "J..........J..............Y..........Y",
    "KJ.........J....Y.............YY.....Y",
    "J..........=....Y....................Y",
    "K..........J.........................Y",
    "J..........J.........YY..............Y",
    "J..........J.........................Y",
    "J..........J.........................Y",
    "JJKJKQKJKJJJYYYYYYYYYYYYYYYYYYYYYYYYYY",
  ],
  zonesMap: [
    "......................................",
    ".cccccccccc.ppppppvvpppppp.ffffvvffff.",
    ".cccccccccc.ppppppvvpppppp.ffffvvffff.",
    ".cccccccccc.ppppppvvpppppp.ffffvvffff.",
    ".cccccccccc.ppppppwwpppppp.ffffvvffff.",
    ".cccccccccc.ppppppwwpppppp.ffffvvffff.",
    ".cccccccccc.ppppppwwpppppp.ffffvvffff.",
    ".cccccccccc.ppppppvvpppppp.ffffvvffff.",
    ".cccccccccc.ppppppvvpppppp.ffffwwffff.",
    ".cccccccccc.ppppppvvpppppp.ffffwwffff.",
    ".cccccccccc.pppppppppppppp.ffffwwffff.",
    ".....c......p......p.......ffffvvffff.",
    "......................n....ffffvvffff.",
    ".bbbbbbbbbbbb......o..n....ffffvvffff.",
    ".bbbbbbbbbbbb......o.......ffffvvffff.",
    ".bbbbbbbbbbbb.nn.oooooooo..ffffvvffff.",
    ".bbbbbbbbbbbb....oooooooo..ffffvvffff.",
    ".bbbbbbbbbbbb....oooooooo..ffffwwffff.",
    ".vvwwvvvvwwvv....oooooooo..ffffwwffff.",
    ".vvwwvvvvwwvv....oooooooo..ffffwwffff.",
    ".vvwwvvvvwwvv....oooooooo..ffffvvffff.",
    ".bbbbbbbbbbbb....oooooooo..ffffvvffff.",
    ".bbbbbbbbbbbb.nn.oooooooo..ffffvvffff.",
    ".bbbbbbbbbbbb....oooooooo..ffffvvffff.",
    ".bbbbbbbbbbbb....oooooooo..ffffvvffff.",
    ".bbbbbbbbbbbb..............ffffvvffff.",
    "......................................",
    ".dddddddddd.sssssssssssssssssssssssss.",
    ".dddddddddd.sssssssssssssssssssssssss.",
    ".dddddddddd.sssssssssssssssssssssssss.",
    ".dddddddddd.sssssssssssssssssssssssss.",
    ".dddddddddd.sssssssssssssssssssssssss.",
    ".dddddddddd.sssssssssssssssssssssssss.",
    ".dddddddddd.sssssssssssssssssssssssss.",
    ".dddddddddd.sssssssssssssssssssssssss.",
    ".dddddddddd.sssssssssssssssssssssssss.",
    ".dddddddddd.sssssssssssssssssssssssss.",
    "......................................",
  ],
  things: [
    "......................................",
    "......................................",
    ".e....r..$......g....b........g..$....",
    "...Q....Q...................r.........",
    "...................................p..",
    ".....!.........r.......p$.............",
    "..r...$...a......!...........c........",
    ".............y........................",
    "...Q.c..Q........g....r.............g.",
    "..u......s...4...........L............",
    "..............a....!..u.a.............",
    "......................................",
    "......................&......R.....G..",
    "......................*.....b.....c.&.",
    ".$..........u.................a.......",
    "......Q...r...3g.c......c.............",
    "..c..r.....c.......a.$..............g.",
    "..................H....H..............",
    "....................p.................",
    "..!...!....g..........c..........e....",
    "...................................p..",
    "....................H.................",
    ".L.R...g....L.n9..$u...$....r.....u...",
    "...........$..........................",
    "..f....a.........L......L.....g.....a.",
    "......................................",
    "......................................",
    "......................................",
    "..L......L...g........B........g......",
    "...a.m........s...............$...S...",
    ".........W..............S.............",
    "......!.r...........a.................",
    ".....c..............................u.",
    "....x..B......................s.......",
    "..>...............s......B.......b....",
    "......f..u......f......g...........g..",
    "..g.......$..$........................",
    "......................................",
  ],
};
