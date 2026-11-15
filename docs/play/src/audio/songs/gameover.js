// "Last Crumb" — short lament in E minor, 62 bpm, 6 bars (~23 s, plays once). Original.
import { R, hold } from './_util.js';
export default {
  bpm: 62, loop: false,
  tracks: [
    { id: 'lead', inst: 'pulse', duty: 0.25, vol: 0.17, gate: 0.95, a: 0.02, d: 0.2, s: 0.6, r: 0.4, vib: { rate: 4.5, depth: 14, delay: 0.3 }, bars: [
      'b4*6 a4*2 g4*4 f#4*4', 'e4*4 g4*4 b4*8', 'c5*6 b4*2 a4*4 g4*4', 'f#4*8 e4*8', 'g4*4 f#4*4 e4*4 d#4*4', 'e4*16'] },
    { id: 'pad', inst: 'tri', vol: 0.2, gate: 1, bars: ['e3*16', 'e3*16', 'a2*16', 'b2*16', 'c3*8 b2*8', 'e2*16'] },
    { id: 'bell', inst: 'fm', ratio: 3.5, index: 1.6, decay: 1.4, vol: 0.1, gate: 1, pan: 0.25, bars: [R, 'b5*2 .*14', R, 'a5*2 .*14', '.*8 g5*2 .*6', 'e5*2 .*14'] },
    { id: 'drums', inst: 'drums', vol: 0.18, bars: ['................', '................', 'k...............', 'k...............', 'k.......k.......', 'k...............'] },
  ],
};
