// "The Cellar Below" — eerie slow tritone dread in C# minor, 78 bpm, 20 bars (~61 s). Original.
import { R, rep, cat, hold, bass } from './_util.js';
const droneA = hold('c#2', 16), droneB = hold('g2', 16), droneC = hold('a1', 16), droneD = hold('f#1', 16);
const drone = cat(rep(2, [droneA]), [droneB], [droneA], [droneC], [droneA], [droneB], [droneD],
                  rep(2, [droneA]), [droneB], [droneA], [droneC], [droneA], [droneB], [droneD], [droneA], [droneA]);
const bell = [
  'c#5*4 .*4 g5*2 .*6', '.*16', 'g5*4 .*4 c#5*2 .*6', '.*16',
  'a5*3 .*5 e5*3 .*5', 'g#5*6 .*10', 'd#5*2 .*2 g5*2 .*2 c#6*8', '.*16',
  'c#5*4 .*4 g5*2 .*6', 'b4*4 .*12', 'g5*4 .*4 f5*4 .*4', 'e5*8 .*8',
  'a5*3 .*5 e6*3 .*5', 'g#5*2 f#5*2 e5*2 d#5*2 c#5*8', 'c#6*2 .*2 g5*2 .*2 c#5*8', '.*16',
  'c#5*2 g5*2 c#6*12', '.*16', 'g#4*16', '.*16',
];
const pad = [
  '.*16', '.*16', 'c#4*16', 'c#4*16', 'a3*16', 'g#3*16', 'c#4*16', 'g3*16',
  'c#4*16', 'c#4*16', 'e4*16', 'e4*16', 'a3*16', 'g#3*16', 'c#4*16', 'g3*16', 'c#4*16', 'c#4*16', 'c#4*16', '.*16',
];
const drums = cat(['................'], rep(3, ['k.......h.......']), rep(4, ['k...x...k..h....']), ['k...x...k..h..tu'],
                  rep(3, ['k.......h.......']), rep(4, ['k...x...k..h....']), ['k...x...k..h..tu'], ['k...............'], ['................'],);
export default {
  bpm: 78, gain: 0.8,
  tracks: [
    { id: 'bell', inst: 'fm', ratio: 3.5, index: 2.4, decay: 1.2, vol: 0.16, gate: 1, pan: 0.2, bars: bell },
    { id: 'drone', inst: 'tri', vol: 0.34, gate: 1, bars: drone },
    { id: 'pad', inst: 'pulse', duty: 0.5, vol: 0.05, gate: 1, a: 0.6, s: 0.8, r: 0.8, vib: { rate: 4, depth: 14, delay: 0.5 }, pan: -0.3, bars: pad },
    { id: 'drums', inst: 'drums', vol: 0.2, bars: drums },
  ],
};
