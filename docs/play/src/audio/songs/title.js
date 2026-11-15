// "Marmalade March" — heroic-comic march in Bb major, 132 bpm, 32 bars (~58 s loop).
// Form: A (8) · B (8) · A' with tri-doubling + arps (8) · B' (8). Original theme.
import { R, rep, cat, join, bass, arp, stab, tr } from './_util.js';

const BASSR = { Bb: 'bb2', Eb: 'eb2', F: 'f2', Gm: 'g2', Cm: 'c3' };
const STAB = { Bb: ['d4', 'f4'], Eb: ['eb4', 'g4'], F: ['c4', 'f4'], Gm: ['d4', 'g4'], Cm: ['eb4', 'g4'] };
const ARP = { Bb: ['bb3', 'd4', 'f4', 'bb4'], Eb: ['eb4', 'g4', 'bb4', 'eb5'], F: ['f4', 'a4', 'c5', 'f5'], Gm: ['g4', 'bb4', 'd5', 'g5'], Cm: ['c4', 'eb4', 'g4', 'c5'] };

const progA = ['Bb', 'Bb', 'Eb', 'F', 'Bb', 'Gm', ['Eb', 'F'], 'Bb'];
const progB = ['Gm', 'Cm', 'Eb', 'F', 'Gm', 'Cm', 'F', 'F'];
const prog = [...progA, ...progB, ...progA, ...progB];

const each = (fn) => prog.map(c => Array.isArray(c) ? join(fn(c[0], 8), fn(c[1], 8)) : fn(c, 16));
const bassBars = each((c, n) => bass(BASSR[c], n === 16 ? 'r-..f-..r-..f-..' : 'r-..f-..'));
const stabHi = each((c, n) => stab(STAB[c][1], n / 4));
const stabLo = each((c, n) => stab(STAB[c][0], n / 4));
const arpBars = each((c, n) => arp(ARP[c], n === 16 ? '0121012301210123' : '01210123'));

const leadA = [
  'bb4*3 bb4 d5*4 f5*3 f5 d5*2 bb4*2',
  'd5*3 d5 f5*4 bb5*6 f5*2',
  'g5*3 g5 f5*3 eb5 d5*3 eb5 f5*4',
  'd5*6 c5*2 a4*4 c5*4',
  'bb4*3 bb4 d5*4 f5*3 f5 g5*2 f5*2',
  'g5*3 g5 d5*4 bb4*3 d5 g5*4',
  'eb5*3 f5 g5*2 eb5*2 f5*3 a5 c6*4',
  'bb5*10 .*6',
];
const leadA2 = [...leadA.slice(0, 7), 'bb5*3 bb5 d6*4 bb5*4 f5*4'];
const leadB = [
  'g4*2 bb4*2 d5*4 g5*4 f5*2 d5*2',
  'eb5*2 g5*2 c6*4 g5*4 eb5*4',
  'g5*2 bb5*2 g5*4 eb5*4 bb4*4',
  'a5*2 c6*2 a5*4 f5*4 c5*4',
  'bb5*2 g5*2 d5*2 g5*2 bb5*4 a5*2 g5*2',
  'g5*2 eb5*2 c5*2 eb5*2 g5*4 f5*2 eb5*2',
  'f5*2 g5*2 a5*2 bb5*2 c6*2 a5*2 f5*2 c5*2',
  'c6*3 .*1 c6*2 c6*2 c6*8',
];

const lead = cat(leadA, leadB, leadA2, leadB);
const dn = 'k.h.s.h.k.h.s.h.', dfill = 'k.h.s.h.ksksksss';
const dl = 'k...s...k...s...', dlfill = 'k...s...k.s.ssss';
const drumBars = cat(
  ['c...s...k...s...', ...rep(6, [dl]), dlfill],
  ['c.h.s.h.k.h.s.h.', ...rep(6, [dn]), dfill],
  ['c.h.s.h.k.h.s.h.', ...rep(6, [dn]), dfill],
  ['c.h.s.h.k.h.s.h.', ...rep(6, [dn]), dfill],
);

export default {
  bpm: 132,
  tracks: [
    { id: 'lead', inst: 'pulse', duty: 0.25, vol: 0.2, gate: 0.92, d: 0.08, s: 0.75, vib: { rate: 5.5, depth: 9, delay: 0.15 }, bars: lead },
    { id: 'double', inst: 'tri', vol: 0.14, gate: 0.92, bars: cat(rep(16, [R]), lead.slice(16).map(b => tr(b, -12))) },
    { id: 'stabHi', inst: 'pulse', duty: 0.5, vol: 0.07, gate: 0.6, d: 0.04, s: 0.5, pan: -0.25, bars: stabHi },
    { id: 'stabLo', inst: 'pulse', duty: 0.5, vol: 0.07, gate: 0.6, d: 0.04, s: 0.5, pan: 0.25, bars: stabLo },
    { id: 'arp', inst: 'pulse', duty: 0.125, vol: 0.055, gate: 0.55, d: 0.05, s: 0.4, pan: 0.2, bars: cat(rep(16, [R]), arpBars.slice(16)) },
    { id: 'bass', inst: 'tri', vol: 0.34, gate: 0.55, bars: bassBars },
    { id: 'drums', inst: 'drums', vol: 0.3, bars: drumBars },
  ],
};
