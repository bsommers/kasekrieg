// "Rind Rage" — frantic boss battle in D minor, 172 bpm, 32 bars (~45 s). Form A B A' B'. Original.
import { R, rep, cat, bass, arp, e8s, tr } from './_util.js';
const BR = { Dm: 'd2', Bb: 'bb1', A: 'a1', Gm: 'g2', C: 'c2' };
const ARP = { Dm: ['d4', 'f4', 'a4', 'd5'], Bb: ['bb3', 'd4', 'f4', 'bb4'], A: ['a3', 'c#4', 'e4', 'a4'], Gm: ['g3', 'bb3', 'd4', 'g4'], C: ['c4', 'e4', 'g4', 'c5'] };
const pA = ['Dm', 'Dm', 'Bb', 'A', 'Dm', 'Dm', 'Gm', 'A'];
const pB = ['Bb', 'C', 'Dm', 'Dm', 'Bb', 'C', 'A', 'A'];
const prog = [...pA, ...pB, ...pA, ...pB];
const bassBars = prog.map(c => bass(BR[c], 'rrorrorrrrorrorr'));
const arpBars = prog.map(c => arp(ARP[c], '0123321001233210'));
const A = [
  'd5 f5 a5 f5 d5 f5 a5 f5 d5 f5 a5 d6 c6 a5 f5 a5',
  'd6*2 a5*2 f5*2 a5*2 d6 c6 a5 f5 d5*4',
  'bb5 d6 f6 d6 bb5 d6 f6 d6 bb5 a5 g5 f5 d5*4',
  'c#6 e6 a6 e6 c#6 e6 a6 e6 g6*2 e6*2 c#6*4',
  'd5 f5 a5 f5 d5 f5 a5 f5 e5 g5 bb5 g5 a5*4',
  'd6 d6 .*2 d6 d6 .*2 f6*2 e6*2 d6*4',
  'g5 bb5 d6 bb5 g5 bb5 d6 g6 f6*2 d6*2 bb5*4',
  'e6 e6 e6 e6 a6*4 g6*2 e6*2 c#6*4',
];
const B = [
  'bb5*2 d6*2 f6*4 d6*2 bb5*2 d6*2 .*2',
  'c6*2 e6*2 g6*4 e6*2 c6*2 e6*2 .*2',
  'a5*2 d6*2 f6*4 a6*4 f6*2 d6*2',
  'a6*3 g6 f6*2 e6*2 d6*8 .*0'.replace(' .*0', ''),
  'bb5*2 d6*2 f6*4 d6*2 f6*2 bb6*4',
  'c6*2 e6*2 g6*4 c7*4 g6*2 e6*2',
  'a6 g6 f6 e6 d6 c#6 d6 e6 f6*2 e6*2 a5*4',
  'a5 c#6 e6 a6 e6 c#6 a5 e5 a5*8',
];
const A2 = A.slice(0, 7).concat(['e6 a6 e6 a6 e6 a6 e6 a6 d7*8']);
const lead = cat(A, B, A2, B);
const dg = 'k.hkshhkk.hksh.k', dfill = 'ksksksksksksssss', cr = 'C.hkshhkk.hksh.k';
const drums = cat(rep(4, [dg]), [cr], rep(2, [dg]), [dfill], rep(7, [dg]), [dfill], rep(7, [dg]), [dfill], rep(7, [dg]), [dfill]).slice(0, 32);
export default {
  bpm: 172,
  tracks: [
    { id: 'lead', inst: 'pulse', duty: 0.25, vol: 0.17, gate: 0.9, d: 0.05, s: 0.7, vib: { rate: 6.5, depth: 10, delay: 0.1 }, bars: lead },
    { id: 'double', inst: 'tri', vol: 0.12, gate: 0.9, bars: cat(rep(8, [R]), B.map(b => tr(b, -12)), A2.map(b => tr(b, -12)), B.map(b => tr(b, -12))) },
    { id: 'arp', inst: 'pulse', duty: 0.125, vol: 0.05, gate: 0.5, pan: -0.3, bars: cat(arpBars.slice(0, 8), rep(8, [R]), arpBars.slice(16, 24), rep(8, [R])) },
    { id: 'bass', inst: 'tri', vol: 0.36, gate: 0.5, bars: bassBars },
    { id: 'drums', inst: 'drums', vol: 0.3, bars: drums },
  ],
};
