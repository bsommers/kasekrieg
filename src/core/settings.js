// KÄSEKRIEG settings & progress persistence (ARCHITECTURE §11).
// Never throws: missing, blocked, full or corrupt localStorage all degrade to defaults.
// Every function takes an optional `storage` (getItem/setItem) so tests can inject fakes.

export const SETTINGS_KEY = 'kasekrieg.settings.v1';
export const PROGRESS_KEY = 'kasekrieg.progress.v1';
export const QUALITIES = ['auto', 'low', 'medium', 'high', 'ultra'];

export function defaultSettings() {
  return {
    quality: 'auto', sensitivity: 1,
    volume: { master: 0.8, sfx: 0.9, music: 0.6 },
    fov: 1.5, crt: false, showFps: false, skill: 1,
  };
}

export function defaultProgress() {
  // unlocked: number of levels available (1..6); skill: last skill played; best: per-level-id best stats.
  return { unlocked: 1, skill: 1, best: {} };
}

function getStorage(storage) {
  if (storage !== undefined) return storage;
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

function num(v, lo, hi, dflt) {
  if (typeof v === 'string' && v.trim() !== '') v = Number(v);
  if (typeof v !== 'number' || !Number.isFinite(v)) return dflt;
  return Math.min(hi, Math.max(lo, v));
}
const bool = (v, dflt) => (typeof v === 'boolean' ? v : dflt);

/** Merge arbitrary (possibly hostile) data onto defaults, clamping every field. */
export function sanitizeSettings(raw) {
  const d = defaultSettings();
  if (!raw || typeof raw !== 'object') return d;
  const vol = raw.volume && typeof raw.volume === 'object' ? raw.volume : {};
  return {
    quality: QUALITIES.includes(raw.quality) ? raw.quality : d.quality,
    sensitivity: num(raw.sensitivity, 0.1, 5, d.sensitivity),
    volume: {
      master: num(vol.master, 0, 1, d.volume.master),
      sfx: num(vol.sfx, 0, 1, d.volume.sfx),
      music: num(vol.music, 0, 1, d.volume.music),
    },
    fov: num(raw.fov, 0.8, 2.4, d.fov),
    crt: bool(raw.crt, d.crt),
    showFps: bool(raw.showFps, d.showFps),
    skill: Math.round(num(raw.skill, 0, 3, d.skill)),
  };
}

export function sanitizeProgress(raw) {
  const d = defaultProgress();
  if (!raw || typeof raw !== 'object') return d;
  const best = {};
  if (raw.best && typeof raw.best === 'object') {
    for (const [id, v] of Object.entries(raw.best)) {
      if (!/^[\w.-]{1,32}$/.test(id) || !v || typeof v !== 'object') continue;
      const e = {};
      for (const k of ['score', 'kills', 'treasure', 'secrets', 'time'])
        if (typeof v[k] === 'number' && Number.isFinite(v[k])) e[k] = v[k];
      best[id] = e;
    }
  }
  return {
    unlocked: Math.round(num(raw.unlocked, 1, 99, d.unlocked)),
    skill: Math.round(num(raw.skill, 0, 3, d.skill)),
    best,
  };
}

function readJson(key, storage) {
  try {
    const s = getStorage(storage);
    if (!s) return null;
    const txt = s.getItem(key);
    return txt == null ? null : JSON.parse(txt);
  } catch { return null; }
}

function writeJson(key, value, storage) {
  try {
    const s = getStorage(storage);
    if (!s) return false;
    s.setItem(key, JSON.stringify(value));
    return true;
  } catch { return false; }
}

export function loadSettings(storage) { return sanitizeSettings(readJson(SETTINGS_KEY, storage)); }
/** @returns {boolean} whether the write succeeded (callers may ignore it) */
export function saveSettings(s, storage) { return writeJson(SETTINGS_KEY, sanitizeSettings(s), storage); }
export function loadProgress(storage) { return sanitizeProgress(readJson(PROGRESS_KEY, storage)); }
export function saveProgress(p, storage) { return writeJson(PROGRESS_KEY, sanitizeProgress(p), storage); }
