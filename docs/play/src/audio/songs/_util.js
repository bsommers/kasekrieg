// Composition helpers shared by the song modules. Not a song itself (the engine never loads this).
// Notation recap (see ../music.js): a melodic bar is 16 steps (sixteenth notes) of tokens
//   `c4` 1 step, `c4*4` a quarter note, `.*2` an eighth rest, `-` extend previous note one step.
// A drum bar is 16 chars: k kick, s snare, x rim, h hat, o open hat, c crash, t/u hi/lo tom (UPPERCASE = accent).

const SEMI = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const NAMES = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'];

export const R = '.*16';                                    // a bar of silence
export const RD = '................';                        // a bar of drum silence

const toMidi = nm => {
  const m = /^([a-g])([#b]?)(-?\d)$/.exec(nm);
  return SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (Number(m[3]) + 1) * 12;
};
const toName = n => NAMES[((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1);

/** Transpose every note token in a bar string by `semis`. */
export function tr(bar, semis) {
  return bar.split(/\s+/).map(tok => {
    if (!tok || tok === '-' || tok.startsWith('.')) return tok;
    const [nm, len] = tok.split('*');
    return toName(toMidi(nm) + semis) + (len ? '*' + len : '');
  }).join(' ');
}
export const trAll = (bars, semis) => bars.map(b => tr(b, semis));

/** Repeat an array `n` times (flat). */
export const rep = (n, arr) => Array.from({ length: n }, () => arr).flat();
/** Concatenate arrays of bars (or single bars). */
export const cat = (...parts) => parts.flat();
/** Join pieces of a bar (e.g. two 8-step halves) into one bar string. */
export const join = (...p) => p.join(' ');

const BASS_OFFS = { r: 0, '2': 2, m: 3, M: 4, '4': 5, f: 7, '6': 9, '7': 10, T: 11, o: 12, l: -5, n: -1, d: -2, e: -7, b: -12 };

/**
 * Bass line from a root note name and a pattern, one char per step: r root, f fifth, o octave, m minor third,
 * M major third, 4 fourth, 7 minor seventh, l fifth below, n semitone below, '.' rest, '-' hold.
 * Returns tokens for pat.length steps.
 */
export function bass(root, pat) {
  const base = toMidi(root);
  const out = [];
  for (const ch of pat) {
    if (ch === '.' || ch === '-') out.push(ch);
    else if (ch in BASS_OFFS) out.push(toName(base + BASS_OFFS[ch]));
    else throw new Error(`bass: bad char ${ch}`);
  }
  return out.join(' ');
}

/**
 * Arpeggio: `notes` is an array of note names; pat is one char per step, a digit = index into notes,
 * '.' rest, '-' hold. Octave shifts: 'a'..'f' are indices 10..15 (use for extended arps). Returns pat.length steps.
 */
export function arp(notes, pat) {
  const out = [];
  for (const ch of pat) {
    if (ch === '.' || ch === '-') out.push(ch);
    else {
      const i = parseInt(ch, 16);
      if (!(i >= 0 && i < notes.length)) throw new Error(`arp: index ${ch} out of range for ${notes}`);
      out.push(notes[i]);
    }
  }
  return out.join(' ');
}

/** Offbeat "pah": the note on the second half of every beat, 1 eighth long (8 steps → pass 1 for a half bar, 2 for a bar). */
export const stab = (note, beats = 4) => Array.from({ length: beats }, () => `.*2 ${note}*2`).join(' ');

/** Sustained note filling a whole bar (or n steps). */
export const hold = (note, steps = 16) => `${note}*${steps}`;

/** Build an array of N bar strings by calling f(i). */
export const bars = (n, f) => Array.from({ length: n }, (_, i) => f(i));

/** Eighth-note bar from space-separated tokens: `c5` an eighth, `c5:3` three eighths, `.` or `.:2` rest. Must total 8 eighths. */
export const e8 = (s) => s.trim().split(/\s+/).map(t => {
  const [n, k] = t.split(':'); return `${n}*${2 * (k ? Number(k) : 1)}`;
}).join(' ');
/** Map e8 over many bar strings. */
export const e8s = (...a) => a.flat().map(e8);
/** A one-bar chord stab/pad: the same note held across a whole bar for each of several notes is not possible in one track; use arp(). */
