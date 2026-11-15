// "Chase the Cheddar" — driving E-minor run, 140 bpm, 32 bars (~55 s). Form A B A' B'. Original.
import { R, rep, cat, bass, arp, e8s, tr } from './_util.js';
const BR = { Em: 'e2', C: 'c3', D: 'd3', B: 'b2', G: 'g2' };
const ARP = { Em: ['e4', 'g4', 'b4', 'e5'], C: ['c4', 'e4', 'g4', 'c5'], D: ['d4', 'f#4', 'a4', 'd5'], B: ['b3', 'd#4', 'f#4', 'b4'], G: ['g3', 'b3', 'd4', 'g4'] };
const pA = ['Em', 'Em', 'C', 'D', 'Em', 'Em', 'C', 'B'];
const pB = ['C', 'D', 'Em', 'Em', 'C', 'D', 'G', 'B'];
const prog = [...pA, ...pB, ...pA, ...pB];
const bassBars = prog.map(c => bass(BR[c], 'rrorrorrrrorrorr'));
const arpBars = prog.map(c => arp(ARP[c], '0123210301232103'));
const A = e8s(
  'e5 e5 g5 e5 b4 e5 g5 b5', 'a5:2 g5 e5 g5:2 e5:2', 'c5 c5 e5 c5 g4 c5 e5 g5', 'f#5:2 e5 d5 f#5:2 a5:2',
  'e5 e5 g5 e5 b5 g5 e5 g5', 'b5:2 a5 g5 e5:4', 'c6 b5 g5 e5 c5 e5 g5 e5', 'd#5 f#5 b5 f#5 d#5:2 b4:2');
const B = e8s(
  'g5:2 e5 g5 c6:2 g5:2', 'a5:2 f#5 a5 d6:2 a5:2', 'b5 b5 g5 b5 e6:2 b5:2', 'e6:3 d6 b5:2 g5:2',
  'c6 b5 c6 e6 g6:2 e6:2', 'f#6 e6 d6 a5 f#5 a5 d6:2', 'd6 b5 g5 b5 d6 g6 f#6 d6', 'd#6:2 f#6:2 b6:4');
const lead = cat(A, B, A, B);
const d1 = 'k.hhs.hhk.hhs.hh', d2 = 'k.hkshhhk.hks.hh', fill = 'k.hhs.hhksksksss', cr = 'C.hhs.hhk.hhs.hh';
const drums = cat([cr], rep(6, [d1]), [fill], [cr], rep(6, [d2]), [fill], [cr], rep(6, [d1]), [fill], [cr], rep(6, [d2]), [fill]);
export default {
  bpm: 140,
  tracks: [
    { id: 'lead', inst: 'pulse', duty: 0.5, vol: 0.17, gate: 0.85, d: 0.06, s: 0.7, vib: { rate: 5.5, depth: 7, delay: 0.2 }, bars: lead },
    { id: 'double', inst: 'pulse', duty: 0.125, vol: 0.07, gate: 0.8, pan: 0.3, bars: cat(rep(16, [R]), lead.slice(16).map(b => tr(b, -12))) },
    { id: 'arp', inst: 'pulse', duty: 0.25, vol: 0.05, gate: 0.5, pan: -0.3, bars: cat(rep(8, [R]), arpBars.slice(8, 16), arpBars.slice(16, 24), arpBars.slice(24)) },
    { id: 'bass', inst: 'tri', vol: 0.36, gate: 0.55, bars: bassBars },
    { id: 'drums', inst: 'drums', vol: 0.28, bars: drums },
  ],
};
