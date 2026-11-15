// "Whiskers in the Walls" — sneaky stalking theme in A minor, 100 bpm, 24 bars (~58 s). Original.
import { R, rep, cat, join, bass, arp, stab, e8s } from './_util.js';
const BR = { Am: 'a2', Dm: 'd3', F: 'f2', E: 'e2', G: 'g2' };
const ARP = { Am: ['a3', 'c4', 'e4', 'a4'], Dm: ['d4', 'f4', 'a4', 'd5'], F: ['f3', 'a3', 'c4', 'f4'], E: ['e3', 'g#3', 'b3', 'e4'], G: ['g3', 'b3', 'd4', 'g4'] };
const pA = ['Am', 'Am', 'Dm', 'Am', 'F', 'E', 'Am', 'Am'];
const pB = ['Dm', 'Dm', 'Am', 'Am', 'F', 'G', 'Am', 'E'];
const prog = [...pA, ...pB, ...pA];
const bassBars = prog.map(c => bass(BR[c], 'r...r.f.r...o.f.'));
const arpBars = prog.map(c => arp(ARP[c], '0.1.2.1.0.1.2.3.'));
const melA = e8s(
  'a4 . c5 . e5 . c5 .', 'b4 . a4 . g#4:2 .:2', 'd5 . f5 . a5 . f5 .', 'e5 . c5 . a4:2 .:2',
  'f4 a4 c5 a4 f5 . c5 .', 'e5 . g#4 . b4 . e5 .', 'a4 c5 e5 c5 a5:2 e5:2', 'a4:4 .:4');
const melB = e8s(
  'd5:2 f5 . d5 a4 . .', 'd5 . f5 . a5:2 f5:2', 'e5:2 c5 . e5 a4 . .', 'c5 e5 a5 e5 c5:2 .:2',
  'f5 . a5 . c6:2 a5:2', 'g5 . b5 . d6:2 b5:2', 'a5 e5 c5 e5 a4:2 c5:2', 'g#4 b4 e5 b4 g#5:2 .:2');
const melA2 = [...melA.slice(0, 7), e8s('a4:2 c5:2 e5:2 a5:2')[0]];
const lead = cat(melA, melB, melA2);
const dA = 'k.......k.x.....', dB = 'k...x...k.x.x...', dfill = 'k...x...k.x.xxxx';
const drums = cat(rep(7, [dA]), [dfill], rep(7, [dB]), [dfill], rep(7, [dA]), [dfill]);
export default {
  bpm: 100,
  tracks: [
    { id: 'lead', inst: 'pulse', duty: 0.125, vol: 0.18, gate: 0.5, d: 0.06, s: 0.5, bars: lead },
    { id: 'echo', inst: 'pulse', duty: 0.25, vol: 0.06, gate: 0.4, d: 0.05, s: 0.4, pan: 0.35, bars: cat(rep(8, [R]), melB, rep(8, [R])) },
    { id: 'arp', inst: 'tri', vol: 0.12, gate: 0.6, pan: -0.3, bars: arpBars },
    { id: 'bass', inst: 'tri', vol: 0.34, gate: 0.6, bars: bassBars },
    { id: 'drums', inst: 'drums', vol: 0.22, bars: drums },
  ],
};
