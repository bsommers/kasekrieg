// "Tally Polka" — jaunty oom-pah in C major, 126 bpm, 24 bars (~46 s). Form A B A'. Original.
import { R, rep, cat, join, bass, stab, e8s } from './_util.js';
const BR = { C: 'c3', F: 'f2', G: 'g2', Am: 'a2', Dm: 'd3' };
const ST = { C: ['e4', 'g4'], F: ['f4', 'a4'], G: ['d4', 'g4'], Am: ['e4', 'a4'], Dm: ['f4', 'a4'] };
const pA = ['C', 'C', 'F', 'G', 'C', 'Am', 'G', 'C'];
const pB = ['F', 'F', 'C', 'C', 'Dm', 'G', 'C', 'G'];
const prog = [...pA, ...pB, ...pA];
const bassBars = prog.map(c => bass(BR[c], 'r...f...r...f...'));
const stabs = prog.map(c => stab(ST[c][0], 4));
const stabs2 = prog.map(c => stab(ST[c][1], 4));
const A = e8s(
  'e5 g5 c6 g5 e5 g5 c6 .', 'a5 f5 a5 c6 f6:2 c6:2', 'd6 b5 g5 b5 d6 g6 f6 d6', 'g5:2 b5:2 d6:4',
  'e5 g5 c6 g5 e6 c6 g5 e5', 'c6 a5 e5 a5 c6 e6 a6 .', 'g6 f6 e6 d6 b5 d6 g5 b5', 'c6:6 .:2');
const B = e8s(
  'f5 a5 c6 a5 f6 c6 a5 f5', 'a5 c6 f6 c6 a5:4', 'g5 e5 g5 c6 e6 c6 g5 e5', 'c6 g5 e5 g5 c6:4',
  'd6 f6 a6 f6 d6:4', 'g5 b5 d6 g6 b6 g6 d6 b5', 'e6 c6 g5 c6 e6 g6 e6 c6', 'd6:2 b5:2 g5:4');
const A2 = A.slice(0, 7).concat(e8s('c6 e6 g6 e6 c7:4'));
const lead = cat(A, B, A2);
const d1 = 'k...s...k...s...', d2 = 'k.h.s.h.k.h.s.h.', fill = 'k.h.s.h.k.s.ssss';
const drums = cat(rep(7, [d1]), [fill], rep(7, [d2]), [fill], rep(7, [d2]), [fill]);
export default {
  bpm: 126,
  tracks: [
    { id: 'lead', inst: 'pulse', duty: 0.25, vol: 0.18, gate: 0.8, d: 0.07, s: 0.65, vib: { rate: 5, depth: 6, delay: 0.25 }, bars: lead },
    { id: 'stabA', inst: 'pulse', duty: 0.5, vol: 0.07, gate: 0.6, d: 0.04, s: 0.5, pan: -0.3, bars: stabs },
    { id: 'stabB', inst: 'pulse', duty: 0.5, vol: 0.07, gate: 0.6, d: 0.04, s: 0.5, pan: 0.3, bars: stabs2 },
    { id: 'bass', inst: 'tri', vol: 0.34, gate: 0.6, bars: bassBars },
    { id: 'drums', inst: 'drums', vol: 0.24, bars: drums },
  ],
};
