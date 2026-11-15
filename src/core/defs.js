// KÄSEKRIEG canonical data — names, legend characters, stats, and the art checklist.
// FROZEN: owned by the orchestrator. Every module reads this; nobody else edits it.

export const TILE = 64;                       // texels per cell edge / per sprite frame
export const LIMITS = { MAP: 64, SPRITES: 96, LIGHTS: 24, BEAMS: 4, MOVERS: 4 };
export const VIEW = { W: 480, H: 270, EYE: 0.46, FOV: 1.5 };   // HUD virtual resolution, eye height, horizontal fov (rad)
export const SKY = 0xFFFF;                    // ceilTex value for open sky ('flat.sky')
export const CELL = { OPEN: 0, WALL: 1, DOOR: 2, PUSH: 3, EXIT: 4 };

export const ART_MODULES = [
  'walls_cheese', 'walls_fort', 'flats', 'enemies_infantry', 'enemies_beasts', 'boss',
  'items', 'decor', 'fx', 'weapons', 'hud',
];

// ───────────────────────────── walls ─────────────────────────────
// [legend char, name, frames, module, description]. Lowercase legend char = secret pushwall with this texture.
export const WALLS = [
  ['A', 'wall.cheddar_brick', 1, 'walls_cheese', 'orange cheddar bricks, darker rind mortar, faint gloss'],
  ['B', 'wall.swiss_block', 1, 'walls_cheese', 'pale yellow swiss cheese slab riddled with round holes that read as deep'],
  ['C', 'wall.blue_stone', 1, 'walls_cheese', 'cream masonry shot through with blue-green mould veins; veins sparkle faintly'],
  ['D', 'wall.parmesan_block', 1, 'walls_cheese', 'pale crumbly crystalline parmesan blocks, strong sparkle on crystals'],
  ['E', 'wall.wax_rind', 1, 'walls_cheese', 'glossy red wax panels (edam/gouda rind) with an embossed round seal, high gloss'],
  ['N', 'wall.gold_foil', 1, 'walls_cheese', 'crinkled gold foil wrap, very glossy and sparkly — the treasure-vault wall'],
  ['S', 'wall.fondue_fall', 4, 'walls_cheese', 'animated molten cheese waterfall between stone lips, strongly emissive'],
  ['Q', 'wall.cheese_glass', 1, 'walls_cheese', 'stone wall with a backlit stained-glass window of a cheese wedge, glass emissive'],
  ['Y', 'wall.moldy_brick', 1, 'walls_cheese', 'cheddar brick variant: cracks, green mould patches, a bite taken out'],
  ['W', 'wall.crate_stack', 1, 'walls_cheese', 'stacked wooden crates stencilled with the cheese-wedge emblem'],
  ['F', 'wall.fort_stone', 1, 'walls_fort', 'grey castle stone blocks, the fortress default'],
  ['G', 'wall.fort_banner', 1, 'walls_fort', 'fort stone with a long hanging red banner: white disc, black cheese wedge'],
  ['H', 'wall.wood_panel', 1, 'walls_fort', 'dark polished wood wainscot panelling with brass trim (slight gloss)'],
  ['I', 'wall.wood_portrait', 1, 'walls_fort', 'wood panel with a gilt-framed portrait of a fat rat general (Der Große Käse)'],
  ['J', 'wall.steel_plate', 1, 'walls_fort', 'riveted steel plates, glossy, hazard stripe along the bottom'],
  ['K', 'wall.pipes', 1, 'walls_fort', 'pipes, valves and a gauge on a steel wall; tiny emissive indicator lamps'],
  ['L', 'wall.bookshelf', 1, 'walls_fort', 'bookshelf crammed with ledgers and a cheese wheel bookend'],
  ['M', 'wall.mouse_hole', 1, 'walls_fort', 'fort stone with a classic arched mouse hole at floor level, black inside, two tiny emissive eyes'],
  ['R', 'wall.poster', 1, 'walls_fort', 'fort stone with a propaganda poster: stern rat pointing, cheese emblem, bold stripes'],
  ['O', 'wall.mirror', 1, 'walls_fort', 'ornate gold-framed mirror filling most of the tile; mirror area gloss 1.0 and dark albedo'],
  ['U', 'wall.cell_bars', 1, 'walls_fort', 'prison cell: iron bars over darkness, a pair of sad kitten eyes inside'],
  ['V', 'wall.war_map', 1, 'walls_fort', 'war-room wall map with coloured pins, strings and cheese-shaped territories'],
  ['T', 'wall.trophy', 1, 'walls_fort', 'glass trophy case: medals, a mounted fish skeleton, glossy glass'],
  ['X', 'wall.exit_switch', 2, 'walls_fort', 'steel panel with a big fish-shaped lever and lamp: frame 0 lever up + red lamp, frame 1 lever down + green lamp (lamps emissive)'],
];

// [legend char, name, lock, module, description] — door slabs (64×64, drawn as the full door face)
export const DOORS = [
  ['+', 'door.wood', null, 'walls_fort', 'heavy planked wooden door with iron bands and a ring handle'],
  ['=', 'door.steel', null, 'walls_fort', 'sliding steel bulkhead door with a porthole and warning chevrons, glossy'],
  ['1', 'door.gold', 'gold', 'walls_fort', 'ornate door with gold trim and a big gold cat-bell lock plate (sparkle)'],
  ['2', 'door.silver', 'silver', 'walls_fort', 'ornate door with silver trim and a silver fish-shaped lock plate (sparkle)'],
];
export const DOOR_JAMB = ['door.jamb', 'walls_fort', 'door track/jamb: dark steel channel with grooves, shown on the wall faces beside a door'];

// [name, frames, hazard dps, module, description] — floors and ceilings, tile both ways
export const FLATS = [
  ['flat.floor_dirt', 1, 0, 'flats', 'packed cellar earth with crumbs and pebbles'],
  ['flat.floor_stone', 1, 0, 'flats', 'worn grey flagstones'],
  ['flat.floor_checker', 1, 0, 'flats', 'polished black/cream marble checker (2×2 squares per tile), gloss 0.6'],
  ['flat.floor_cheese_tile', 1, 0, 'flats', 'yellow cheese-slab tiles with hole motifs, mild gloss'],
  ['flat.floor_wood', 1, 0, 'flats', 'varnished wooden planks, mild gloss'],
  ['flat.floor_carpet', 1, 0, 'flats', 'deep red carpet with a gold border pattern, no gloss'],
  ['flat.floor_grate', 1, 0, 'flats', 'steel walkway grating over darkness, glossy bars'],
  ['flat.floor_gold', 1, 0, 'flats', 'vault floor of gold coins and foil, gloss 0.5, high sparkle'],
  ['flat.floor_blue', 1, 0, 'flats', 'blue-veined cheese cobbles, cool tones, faint sparkle'],
  ['flat.floor_fondue', 4, 22, 'flats', 'animated bubbling molten cheese, strongly emissive (hurts to stand in)'],
  ['flat.ceil_stone', 1, 0, 'flats', 'dark vaulted stone'],
  ['flat.ceil_wood', 1, 0, 'flats', 'dark timber beams over planks'],
  ['flat.ceil_cheese', 1, 0, 'flats', 'swiss cheese ceiling with holes'],
  ['flat.ceil_panel', 1, 0, 'flats', 'bolted steel ceiling panels'],
  ['flat.ceil_lamp_panel', 1, 0, 'flats', 'steel panel with a square emissive lamp in the middle'],
];
export const SKY_FLAT = 'flat.sky';           // pseudo-flat: open night sky (renderer draws stars/moon procedurally)

// ───────────────────────────── enemies ─────────────────────────────
// Sprite names: `${type}.${anim}`; attack frames = [aim, FIRE (emissive muzzle flash), recover]; sewer attack = [lunge, bite].
const ANIMS = { idle: 1, walk: 4, attack: 3, pain: 1, die: 4, dead: 1 };
export const ENEMIES = {
  mouse: {
    title: 'Maus Schütze', module: 'enemies_infantry', anims: ANIMS,
    look: 'small grey mouse private: oversized stahlhelm, field-grey tunic, red armband, tiny pistol, big round ears poking out',
    hp: 25, speed: 1.5, radius: 0.28, size: 0.9, score: 100, painChance: 0.85, reaction: [0.5, 1.0],
    attack: { kind: 'hitscan', dmg: [3, 9], shots: 1, gap: 0, windup: 0.4, cooldown: [1.2, 2.0], range: 14 },
    drop: 'ammo_clip', sfx: { alert: 'mouse_alert', pain: 'mouse_pain', die: 'mouse_die', fire: 'enemy_pistol' },
  },
  trooper: {
    title: 'Sturmratte', module: 'enemies_infantry', anims: ANIMS,
    look: 'brown rat stormtrooper: stahlhelm, field-grey greatcoat, ammo belts, submachine gun held at the hip, long snout',
    hp: 50, speed: 1.9, radius: 0.3, size: 1.0, score: 300, painChance: 0.6, reaction: [0.4, 0.8],
    attack: { kind: 'hitscan', dmg: [3, 8], shots: 3, gap: 0.11, windup: 0.35, cooldown: [1.4, 2.2], range: 16 },
    drop: 'gatling|ammo_clip', sfx: { alert: 'trooper_alert', pain: 'rat_pain', die: 'trooper_die', fire: 'enemy_smg' },
  },
  officer: {
    title: 'Ratten-Offizier', module: 'enemies_infantry', anims: ANIMS,
    look: 'lean white rat officer: peaked cap with cheese badge, black leather coat, monocle, luger, sneer',
    hp: 40, speed: 3.0, radius: 0.28, size: 1.0, score: 400, painChance: 0.5, reaction: [0.2, 0.5],
    attack: { kind: 'hitscan', dmg: [4, 11], shots: 1, gap: 0, windup: 0.28, cooldown: [0.7, 1.3], range: 16 },
    drop: 'ammo_clip', sfx: { alert: 'officer_alert', pain: 'rat_pain', die: 'officer_die', fire: 'enemy_pistol' },
  },
  sewer: {
    title: 'Kanalratte', module: 'enemies_beasts', anims: { idle: 1, walk: 4, attack: 2, pain: 1, die: 3, dead: 1 },
    look: 'feral sewer rat on all fours: mangy dark fur, spiked collar with a cheese tag, red eyes, big yellow teeth',
    hp: 14, speed: 3.6, radius: 0.26, size: 0.7, score: 150, painChance: 0.9, reaction: [0.1, 0.3],
    attack: { kind: 'melee', dmg: [3, 8], shots: 1, gap: 0, windup: 0.18, cooldown: [0.5, 0.8], range: 0.95 },
    drop: null, sfx: { alert: 'sewer_alert', pain: 'rat_pain', die: 'sewer_die', fire: 'sewer_bite' },
  },
  panzer: {
    title: 'Panzerratte', module: 'enemies_beasts', anims: ANIMS,
    look: 'huge armoured rat: riveted steel breastplate, welding goggles, shoulder-mounted cheese cannon (bazooka dripping molten cheese)',
    hp: 120, speed: 1.2, radius: 0.34, size: 1.0, score: 700, painChance: 0.3, reaction: [0.6, 1.0],
    attack: { kind: 'projectile', projectile: 'cheeseball', shots: 1, gap: 0, windup: 0.6, cooldown: [2.0, 3.0], range: 18 },
    drop: 'yarn_ammo', sfx: { alert: 'panzer_alert', pain: 'rat_pain', die: 'panzer_die', fire: 'panzer_fire' },
  },
  boss: {
    title: 'Der Große Käse', module: 'boss', anims: { idle: 2, walk: 4, attack: 3, pain: 1, die: 5, dead: 1 },
    look: 'enormous fat rat generalissimo: gold-braided white uniform, cape, cheese-wheel crown, twin gatling guns, medals, cigar',
    hp: 1100, speed: 1.7, radius: 0.5, size: 1.6, score: 10000, painChance: 0.08, reaction: [0.3, 0.5],
    attack: { kind: 'hitscan', dmg: [3, 7], shots: 8, gap: 0.08, windup: 0.5, cooldown: [1.4, 2.2], range: 20 },
    phase2: { below: 0.5, projectile: 'cheeseball', volley: 3, spreadDeg: 14, speedMul: 1.3, summon: 'sewer' },
    drop: 'cheese_crown', sfx: { alert: 'boss_alert', pain: 'boss_pain', die: 'boss_die', fire: 'boss_fire' },
  },
};

// ───────────────────────────── items (pickups) ─────────────────────────────
// Sprite `item.<id>` (1 frame). light = [r,g,b,radius] glow for the ray tracer.
export const ITEMS = {
  fish_treat: { look: 'small fish-shaped biscuit on a saucer', heal: 10, max: 100, msg: 'Fish treat', sfx: 'pickup_health' },
  tuna: { look: 'open tuna can, fish peeking out, glossy tin', heal: 25, max: 100, msg: 'Tuna!', sfx: 'pickup_health' },
  catnip: { look: 'glowing green catnip pouch with leaf, emissive sparkle', heal: 60, max: 150, msg: 'CATNIP!!', sfx: 'pickup_catnip', light: [0.4, 1.6, 0.4, 2.5] },
  extra_life: { look: 'golden maneki-neko (waving lucky cat) statue, gold sparkle', life: 1, msg: 'Extra life!', sfx: 'extra_life', light: [1.6, 1.3, 0.4, 2.5] },
  ammo_clip: { look: 'small tin of hairballs (round fuzzy pellets)', ammo: ['hair', 8], msg: 'Hairballs', sfx: 'pickup_ammo' },
  ammo_box: { look: 'ammo crate stencilled with a paw, hairballs heaped inside', ammo: ['hair', 25], msg: 'Box of hairballs', sfx: 'pickup_ammo' },
  yarn_ammo: { look: 'three yarn balls (pink, teal, yellow) in a basket', ammo: ['yarn', 3], msg: 'Yarn balls', sfx: 'pickup_ammo' },
  battery: { look: 'chunky red battery cell with emissive charge stripe', ammo: ['cell', 40], msg: 'Laser battery', sfx: 'pickup_ammo' },
  gatling: { look: 'the Purr-forator: stubby multi-barrel gatling with a fish-bone crank', weapon: 2, ammo: ['hair', 12], msg: 'The PURR-FORATOR!', sfx: 'pickup_weapon' },
  yarn_launcher: { look: 'the Yarn Bomber: fat-barrelled launcher loaded with a pink yarn ball', weapon: 3, ammo: ['yarn', 4], msg: 'The YARN BOMBER!', sfx: 'pickup_weapon' },
  laser: { look: 'Der Rote Punkt: sleek chrome laser pointer with a glowing red lens', weapon: 4, ammo: ['cell', 60], msg: 'DER ROTE PUNKT!', sfx: 'pickup_weapon', light: [1.4, 0.2, 0.2, 2] },
  key_gold: { look: 'gold key whose bow is a cat bell, sparkle', key: 'gold', msg: 'Gold key', sfx: 'pickup_key', light: [1.2, 1.0, 0.3, 2] },
  key_silver: { look: 'silver key whose bow is a fish, sparkle', key: 'silver', msg: 'Silver key', sfx: 'pickup_key', light: [0.8, 0.9, 1.2, 2] },
  cheddar_wedge: { look: 'bright cheddar wedge on a doily', score: 100, treasure: true, msg: 'Cheddar', sfx: 'pickup_treasure' },
  brie_wheel: { look: 'white brie wheel with a slice cut out, on a silver plate (gloss)', score: 500, treasure: true, msg: 'Brie wheel', sfx: 'pickup_treasure' },
  cheese_crown: { look: 'jewelled golden crown shaped like a cheese wheel, dazzling sparkle', score: 1000, treasure: true, msg: 'The Cheese Crown!', sfx: 'pickup_treasure', light: [1.6, 1.3, 0.4, 2.5] },
};
export const AMMO_MAX = { hair: 99, yarn: 20, cell: 200 };
export const START = { health: 100, lives: 9, ammo: { hair: 16, yarn: 0, cell: 0 }, owned: [true, true, false, false, false], weapon: 1 };

// ───────────────────────────── decor ─────────────────────────────
// Sprite `decor.<id>`. block: fills its cell for movement. hang: art touches the top of the frame (hangs from the ceiling).
// light: [r,g,b,radius,height,flicker 0..1]. trap: one-shot damage when stepped on (then shows frame 1).
export const DECOR = {
  barrel: { frames: 1, block: true, look: 'oak barrel banded with iron, cheese emblem branded on it' },
  cheese_stack: { frames: 1, block: true, look: 'stack of three cheese wheels, top one sliced' },
  table_cheese: { frames: 1, block: true, look: 'round wooden table with a cheese platter and a candle' },
  chandelier: { frames: 1, hang: true, light: [2.2, 1.8, 1.2, 5.5, 0.8, 0.06], look: 'iron ring chandelier with emissive candles, hanging from the top of the frame' },
  floor_lamp: { frames: 1, block: true, light: [2.0, 1.7, 1.0, 5.0, 0.75, 0.03], look: 'tall brass floor lamp with an emissive cheese-wedge shade' },
  candelabra: { frames: 2, block: true, light: [2.2, 1.3, 0.5, 4.5, 0.7, 0.3], look: 'standing iron candelabra, three emissive flames (2 flicker frames)' },
  rat_armor: { frames: 1, block: true, look: 'empty suit of rat-sized plate armour on a stand, glossy steel, halberd' },
  plant: { frames: 1, block: true, look: 'potted catnip plant in a terracotta pot' },
  pillar: { frames: 1, block: true, look: 'floor-to-ceiling stone pillar (fills the full frame height), carved cheese capital' },
  flag_stand: { frames: 1, block: true, look: 'red Rat Reich flag (white disc, black cheese wedge) on a brass pole stand' },
  fish_bones: { frames: 1, look: 'picked-clean fish skeleton and crumbs on the floor (low, bottom of frame)' },
  mousetrap: { frames: 2, trap: 8, look: 'classic wooden snap-trap with cheese bait, low on the floor: frame 0 armed, frame 1 sprung' },
  cheese_cart: { frames: 1, block: true, look: 'mine cart on wheels heaped with cheese chunks' },
  cage_kitten: { frames: 2, hang: true, look: 'iron cage hanging from a chain with a captured kitten inside (2 frames: blink/paw)' },
  puddle_milk: { frames: 1, look: 'spilled milk puddle with a tipped bottle, glossy white (low on the floor)' },
  crate: { frames: 1, block: true, look: 'wooden supply crate with rope handle, stencilled paw print crossed out' },
  cauldron: { frames: 2, block: true, light: [2.6, 1.5, 0.3, 5.0, 0.5, 0.15], look: 'black iron fondue cauldron bubbling with emissive molten cheese (2 frames)' },
  scratch_post: { frames: 1, block: true, look: 'well-shredded sisal scratching post — a trophy the rats captured' },
  bunk: { frames: 1, block: true, look: 'military double bunk bed with grey blankets and a tiny helmet on the post' },
  radio_desk: { frames: 2, block: true, look: 'field radio set on a desk, dials and a blinking emissive lamp (2 frames), headphones' },
  hanging_cheese: { frames: 1, hang: true, look: 'cheeses and sausages hanging from hooks on a rail at the top of the frame' },
  glow_cheese: { frames: 2, light: [0.5, 2.2, 0.4, 3.5, 0.2, 0.2], look: 'small chunk of radioactive green glowing cheese on the floor, emissive (2 pulse frames)' },
  alarm_light: { frames: 2, hang: true, light: [2.8, 0.25, 0.2, 5.0, 0.85, 1.0], look: 'red rotating alarm beacon on a ceiling bracket, emissive (2 frames)' },
};

// ───────────────────────────── fx sprites ─────────────────────────────
// Sprite `fx.<id>`; art centred in the 64×64 frame (not on the floor).
export const FX = {
  yarnball: { frames: 4, look: 'rolling pink yarn ball with trailing thread, faint emissive' },
  cheeseball: { frames: 2, look: 'flaming molten cheese glob, strongly emissive orange/yellow' },
  explosion: { frames: 6, look: 'cheesy explosion: white-yellow flash → orange fireball → smoke ring with crumbs, emissive' },
  puff: { frames: 4, look: 'small grey smoke/dust puff dissipating' },
  spark: { frames: 3, look: 'bright bullet-impact spark burst, emissive' },
  crumbs: { frames: 3, look: 'burst of yellow cheese crumbs flying apart' },
  fur: { frames: 3, look: 'tufts of grey fur flying (claw hit)' },
  sparkle: { frames: 4, look: 'four-point twinkle star growing and fading, emissive white-gold' },
  laser_dot: { frames: 2, look: 'intense red laser dot with halo, emissive' },
  stun: { frames: 2, look: 'ring of three little yellow stars/spirals (orbits a mesmerised rat\'s head)' },
  splash: { frames: 3, look: 'molten cheese splash droplets, emissive' },
  muzzle: { frames: 2, look: 'star-shaped muzzle flash, emissive' },
};

// ───────────────────────────── weapons ─────────────────────────────
// View-model images (128×128, kind 'image', module 'weapons'): `wpn.<id>.idle` (1 frame) and `wpn.<id>.fire` (N frames).
// Orange tabby paws holding the weapon, seen first-person, drawn against the bottom edge of the frame.
export const WEAPONS = [
  { id: 'claws', name: 'Claws', kind: 'melee', dmg: [10, 26], range: 1.15, period: 0.34, ammo: null, use: 0, auto: true, loud: 0, fireFrames: 3,
    look: 'two orange tabby paws raised, claws out; fire = right paw slashes diagonally across with white claw-trail arcs' },
  { id: 'pistol', name: 'Hairball Pistol', kind: 'hitscan', dmg: [9, 24], spread: 0.012, range: 24, period: 0.36, ammo: 'hair', use: 1, auto: false, loud: 12, fireFrames: 3,
    look: 'paw gripping a chunky toy-like pistol with a fuzzy hairball loaded in an open breech; fire = muzzle flash + recoil' },
  { id: 'gatling', name: 'Purr-forator', kind: 'hitscan', dmg: [8, 19], spread: 0.045, range: 24, period: 0.095, ammo: 'hair', use: 1, auto: true, loud: 14, fireFrames: 2,
    look: 'both paws on a six-barrel gatling with fish-bone crank; fire = alternate barrel positions with muzzle flash' },
  { id: 'yarn', name: 'Yarn Bomber', kind: 'projectile', projectile: 'yarnball', period: 0.9, ammo: 'yarn', use: 1, auto: false, loud: 10, fireFrames: 3,
    look: 'fat-barrelled launcher with a pink yarn ball visible in the muzzle; fire = recoil, puff, empty barrel' },
  { id: 'laser', name: 'Der Rote Punkt', kind: 'beam', dps: 55, range: 16, period: 0, ammo: 'cell', usePerSec: 14, auto: true, loud: 3, stun: 0.6, fireFrames: 2,
    look: 'one paw holding a chrome laser pointer, thumb on the button; fire = lens glowing red with flare (emissive)' },
];

// light = [r,g,b,radius]
export const PROJECTILES = {
  yarnball: { sprite: 'yarnball', speed: 9, radius: 0.15, size: 0.3, bounces: 2, fuse: 2.2, dmg: [55, 95], splash: 1.7, light: [1.6, 0.4, 1.4, 3.5], boom: 'explosion', sfx: 'explosion' },
  cheeseball: { sprite: 'cheeseball', speed: 5.5, radius: 0.18, size: 0.4, bounces: 0, fuse: 6, dmg: [14, 28], splash: 1.1, light: [2.2, 1.3, 0.3, 3.5], boom: 'splash', sfx: 'cheese_splat' },
};

// ───────────────────────────── level `things` legend ─────────────────────────────
export const THINGS = {
  '^': { kind: 'start', angle: -Math.PI / 2 }, '>': { kind: 'start', angle: 0 }, 'v': { kind: 'start', angle: Math.PI / 2 }, '<': { kind: 'start', angle: Math.PI },
  // enemies: lowercase stands guard, uppercase patrols
  m: { kind: 'enemy', type: 'mouse' }, M: { kind: 'enemy', type: 'mouse', patrol: true },
  r: { kind: 'enemy', type: 'trooper' }, R: { kind: 'enemy', type: 'trooper', patrol: true },
  o: { kind: 'enemy', type: 'officer' }, O: { kind: 'enemy', type: 'officer', patrol: true },
  s: { kind: 'enemy', type: 'sewer' }, S: { kind: 'enemy', type: 'sewer', patrol: true },
  p: { kind: 'enemy', type: 'panzer' }, P: { kind: 'enemy', type: 'panzer', patrol: true },
  Z: { kind: 'enemy', type: 'boss' },
  // pickups
  f: { kind: 'item', id: 'fish_treat' }, u: { kind: 'item', id: 'tuna' }, n: { kind: 'item', id: 'catnip' }, 9: { kind: 'item', id: 'extra_life' },
  a: { kind: 'item', id: 'ammo_clip' }, b: { kind: 'item', id: 'ammo_box' }, y: { kind: 'item', id: 'yarn_ammo' }, e: { kind: 'item', id: 'battery' },
  3: { kind: 'item', id: 'gatling' }, 4: { kind: 'item', id: 'yarn_launcher' }, 5: { kind: 'item', id: 'laser' },
  G: { kind: 'item', id: 'key_gold' }, K: { kind: 'item', id: 'key_silver' },
  $: { kind: 'item', id: 'cheddar_wedge' }, '&': { kind: 'item', id: 'brie_wheel' }, '*': { kind: 'item', id: 'cheese_crown' },
  // decor
  B: { kind: 'decor', id: 'barrel' }, C: { kind: 'decor', id: 'cheese_stack' }, T: { kind: 'decor', id: 'table_cheese' },
  H: { kind: 'decor', id: 'chandelier' }, L: { kind: 'decor', id: 'floor_lamp' }, c: { kind: 'decor', id: 'candelabra' },
  A: { kind: 'decor', id: 'rat_armor' }, t: { kind: 'decor', id: 'plant' }, I: { kind: 'decor', id: 'pillar' }, F: { kind: 'decor', id: 'flag_stand' },
  x: { kind: 'decor', id: 'fish_bones' }, w: { kind: 'decor', id: 'mousetrap' }, k: { kind: 'decor', id: 'cheese_cart' }, j: { kind: 'decor', id: 'cage_kitten' },
  d: { kind: 'decor', id: 'puddle_milk' }, W: { kind: 'decor', id: 'crate' }, Q: { kind: 'decor', id: 'cauldron' }, i: { kind: 'decor', id: 'scratch_post' },
  l: { kind: 'decor', id: 'bunk' }, D: { kind: 'decor', id: 'radio_desk' }, h: { kind: 'decor', id: 'hanging_cheese' }, g: { kind: 'decor', id: 'glow_cheese' },
  q: { kind: 'decor', id: 'alarm_light' },
  // invisible fill light: [r,g,b,radius,height,flicker]
  '!': { kind: 'light', light: [1.8, 1.5, 1.1, 5.0, 0.8, 0] },
};

// ───────────────────────────── audio ─────────────────────────────
export const SFX = [
  'claw_swipe', 'claw_hit', 'pistol', 'gatling', 'yarn_launch', 'yarn_bounce', 'laser', 'no_ammo', 'weapon_switch',
  'explosion', 'cheese_splat', 'ricochet', 'hit_wall',
  'door_open', 'door_close', 'door_locked', 'pushwall', 'switch',
  'pickup_health', 'pickup_catnip', 'pickup_ammo', 'pickup_weapon', 'pickup_treasure', 'pickup_key', 'extra_life', 'secret_found',
  'player_hurt', 'player_die', 'meow', 'purr', 'fondue_sizzle', 'trap_snap',
  'mouse_alert', 'mouse_pain', 'mouse_die', 'trooper_alert', 'trooper_die', 'officer_alert', 'officer_die',
  'sewer_alert', 'sewer_bite', 'sewer_die', 'panzer_alert', 'panzer_fire', 'panzer_die', 'rat_pain',
  'boss_alert', 'boss_fire', 'boss_pain', 'boss_die', 'enemy_pistol', 'enemy_smg',
  'menu_move', 'menu_select', 'menu_back', 'level_complete', 'tally_tick', 'game_over',
];
export const MUSIC = ['title', 'level_a', 'level_b', 'level_c', 'boss', 'intermission', 'victory', 'gameover'];

// ───────────────────────────── HUD images ─────────────────────────────
// [name, w, h, frames, description] — kind 'image', module 'hud'
export const HUD_IMAGES = [
  ['hud.face', 32, 32, 23, 'Major Marmalade portrait, big orange tabby. frames = tier*4 + variant for tier 0..4 (0 healthy → 4 battered: scratches, bandage, black eye, missing whisker) and variant 0 look-centre, 1 look-left, 2 look-right, 3 ouch (eyes shut, mouth open); 20 = toothy grin (pickup), 21 = dead (X eyes, tongue out), 22 = catnip (huge dilated pupils, manic smile)'],
  ['hud.logo', 240, 80, 1, 'title logo: "KÄSEKRIEG" in chunky cheese-textured block capitals with holes, dripping, dark outline, a claw-slash through it; subtitle "CLAWS OF MARMALADE" smaller below'],
  ['hud.icon.key_gold', 12, 12, 1, 'tiny gold key icon'], ['hud.icon.key_silver', 12, 12, 1, 'tiny silver key icon'],
  ['hud.icon.life', 9, 9, 2, 'tiny orange cat head: frame 0 alive, frame 1 lost (grey ghost outline)'],
  ['hud.icon.ammo', 12, 12, 3, 'ammo icons: 0 hairball, 1 yarn ball, 2 battery'],
  ['hud.icon.weapon', 28, 14, 5, 'weapon silhouettes in slot order: claws, pistol, gatling, yarn launcher, laser pointer'],
  ['hud.cursor', 12, 12, 2, 'menu cursor: orange paw print (2 frames: normal, pressed)'],
  ['hud.emblem', 32, 32, 1, 'Rat Reich emblem: red square, white disc, black cheese wedge with holes'],
];

export const SKILLS = [
  { id: 0, name: 'Kitten', blurb: 'Can I play, Daddy-cat?', dmgTaken: 0.45, enemyHp: 0.8, reaction: 1.4 },
  { id: 1, name: 'House Cat', blurb: 'Don\'t hurt my whiskers.', dmgTaken: 0.75, enemyHp: 1.0, reaction: 1.15 },
  { id: 2, name: 'Alley Cat', blurb: 'Bring on the rats!', dmgTaken: 1.0, enemyHp: 1.0, reaction: 1.0 },
  { id: 3, name: 'Nine Lives Nightmare', blurb: 'I am fur incarnate.', dmgTaken: 1.5, enemyHp: 1.25, reaction: 0.65 },
];

export const LEVELS = [
  ['e1m1', 'The Cheese Cellar'], ['e1m2', 'Rat Barracks'], ['e1m3', 'The Fondue Works'],
  ['e1m4', 'Moonlit Hall of Mirrors'], ['e1m5', 'The Blue Vault'], ['e1m6', 'Throne of the Big Cheese'],
];

// ───────────────────────────── art checklist ─────────────────────────────
/** Every piece of art the game needs: [{ name, kind:'tile'|'sprite'|'image', w, h, frames, module, desc }] in atlas order. */
export function artManifest() {
  const out = [];
  const add = (name, kind, w, h, frames, module, desc) => out.push({ name, kind, w, h, frames, module, desc });
  for (const [, name, frames, mod, desc] of WALLS) add(name, 'tile', TILE, TILE, frames, mod, desc);
  for (const [, name, , mod, desc] of DOORS) add(name, 'tile', TILE, TILE, 1, mod, desc);
  add(DOOR_JAMB[0], 'tile', TILE, TILE, 1, DOOR_JAMB[1], DOOR_JAMB[2]);
  for (const [name, frames, , mod, desc] of FLATS) add(name, 'tile', TILE, TILE, frames, mod, desc);
  for (const [type, d] of Object.entries(ENEMIES))
    for (const [anim, n] of Object.entries(d.anims)) add(`${type}.${anim}`, 'sprite', TILE, TILE, n, d.module, `${d.title}: ${d.look}`);
  for (const [id, d] of Object.entries(ITEMS)) add(`item.${id}`, 'sprite', TILE, TILE, 1, 'items', d.look);
  for (const [id, d] of Object.entries(DECOR)) add(`decor.${id}`, 'sprite', TILE, TILE, d.frames, 'decor', d.look);
  for (const [id, d] of Object.entries(FX)) add(`fx.${id}`, 'sprite', TILE, TILE, d.frames, 'fx', d.look);
  for (const w of WEAPONS) {
    add(`wpn.${w.id}.idle`, 'image', 128, 128, 1, 'weapons', w.look);
    add(`wpn.${w.id}.fire`, 'image', 128, 128, w.fireFrames, 'weapons', w.look);
  }
  for (const [name, w, h, frames, desc] of HUD_IMAGES) add(name, 'image', w, h, frames, 'hud', desc);
  return out;
}

export const wallByChar = Object.fromEntries(WALLS.map(([ch, name]) => [ch, name]));
export const doorByChar = Object.fromEntries(DOORS.map(([ch, name, lock]) => [ch, { tex: name, lock }]));
export const flatHazard = Object.fromEntries(FLATS.map(([name, , hz]) => [name, hz]));
