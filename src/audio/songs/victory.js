// "Cheese Triumphant" — short brass-ish fanfare in G major, 144 bpm, 12 bars (~20 s, plays once). Original.
import { R, rep, cat, bass, e8s, tr } from './_util.js';
const prog = ['G', 'G', 'C', 'D', 'G', 'Em', 'C', 'D', 'G', 'C', 'D', 'G'];
const BR = { G: 'g2', C: 'c3', D: 'd3', Em: 'e2' };
const bassBars = prog.map(c => bass(BR[c], 'r.rrf.rrr.rrf.rr'));
const lead = e8s(
  'd5:2 g5:2 b5:4', 'd6:3 b5 g5:4', 'e5 g5 c6:2 e6:2 c6:2', 'f#5 a5 d6:2 f#6:4',
  'g6:2 d6 b5 g5 b5 d6 g6', 'e6:2 b5 e6 g6:2 e6:2', 'c6 e6 g6 c7:3 g6:2', 'a5 d6 f#6 a6:3 f#6:2',
  'b5 d6 g6 b6:3 g6:2', 'c6 e6 g6 c7:5', 'd6 f#6 a6 d7:3 a6:2', 'g6:2 b5 d6 g6:4');
const harm = lead.map(b => tr(b, -4));
const drums = ['c...s...k...s...', 'k...s...k...s...', 'k.h.s.h.k.h.s.h.', 'k.h.s.h.k.s.s.s.', 'k.h.s.h.k.h.s.h.', 'k.h.s.h.k.h.s.h.',
               'k.h.s.h.k.h.s.h.', 'k.s.s.s.k.ksksks', 'C.h.s.h.k.h.s.h.', 'k.h.s.h.k.h.s.h.', 'ksksksksksksssss', 'C...............'];
export default {
  bpm: 144, loop: false,
  tracks: [
    { id: 'lead', inst: 'pulse', duty: 0.25, vol: 0.19, gate: 0.92, d: 0.06, s: 0.8, vib: { rate: 5.5, depth: 9, delay: 0.15 }, bars: lead },
    { id: 'harm', inst: 'pulse', duty: 0.5, vol: 0.09, gate: 0.92, pan: 0.3, bars: harm },
    { id: 'bass', inst: 'tri', vol: 0.34, gate: 0.55, bars: bassBars },
    { id: 'drums', inst: 'drums', vol: 0.28, bars: drums },
  ],
};
