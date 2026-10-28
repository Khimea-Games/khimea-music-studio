export const NOTE_NAMES = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
] as const;

export type NoteName = (typeof NOTE_NAMES)[number];

export interface ScaleDefinition {
  name: string;
  label: string;
  intervals: number[]; // Semitone intervals from root, e.g. [0, 2, 4, 5, 7, 9, 11]
  mood: string;
  gameUsage: string;
}

export const SCALES: Record<string, ScaleDefinition> = {
  natural_minor: {
    name: 'natural_minor',
    label: 'Natural Minor (Aeolian)',
    intervals: [0, 2, 3, 5, 7, 8, 10],
    mood: 'Melancholic, serious, dramatic, introspective',
    gameUsage: 'Exploration, sorrowful moments, main themes, ambient ruins',
  },
  minor: {
    name: 'minor',
    label: 'Natural Minor',
    intervals: [0, 2, 3, 5, 7, 8, 10],
    mood: 'Melancholic, atmospheric',
    gameUsage: 'Exploration, storytelling',
  },
  harmonic_minor: {
    name: 'harmonic_minor',
    label: 'Harmonic Minor',
    intervals: [0, 2, 3, 5, 7, 8, 11],
    mood: 'Dark, exotic, menacing, classical neo-baroque',
    gameUsage: 'Boss fights, gothic castles, occult shrines, dramatic reveals',
  },
  dorian: {
    name: 'dorian',
    label: 'Dorian Mode',
    intervals: [0, 2, 3, 5, 7, 9, 10],
    mood: 'Medieval, adventurous, noble melancholy, folkloric',
    gameUsage: 'Taverns, ancient forests, heroic quests, dungeon exploration',
  },
  phrygian: {
    name: 'phrygian',
    label: 'Phrygian Mode',
    intervals: [0, 1, 3, 5, 7, 8, 10],
    mood: 'Ominous, aggressive, tribal, middle-eastern, impending doom',
    gameUsage: 'Orc battle, subterranean caves, boss intro, intense combat',
  },
  major: {
    name: 'major',
    label: 'Major (Ionian)',
    intervals: [0, 2, 4, 5, 7, 9, 11],
    mood: 'Heroic, bright, triumphant, hopeful',
    gameUsage: 'Victory themes, peaceful villages, titles, uplifting cinematics',
  },
  lydian: {
    name: 'lydian',
    label: 'Lydian Mode',
    intervals: [0, 2, 4, 6, 7, 9, 11],
    mood: 'Mystical, celestial, wonder, flying, dream-like',
    gameUsage: 'Sky temples, floating islands, sci-fi stargates, magical discoveries',
  },
  mixolydian: {
    name: 'mixolydian',
    label: 'Mixolydian Mode',
    intervals: [0, 2, 4, 5, 7, 9, 10],
    mood: 'Folky, adventurous, energetic, swaggering',
    gameUsage: 'Sailing, pirate hubs, tavern brawls, open world riding',
  },
  pentatonic_minor: {
    name: 'pentatonic_minor',
    label: 'Pentatonic Minor',
    intervals: [0, 3, 5, 7, 10],
    mood: 'Direct, primal, bluesy, memorable',
    gameUsage: 'Lead riffs, combat motifs, stealth sections, ethnic folk themes',
  },
  pentatonic_major: {
    name: 'pentatonic_major',
    label: 'Pentatonic Major',
    intervals: [0, 2, 4, 7, 9],
    mood: 'Peaceful, pastoral, gentle, ancient',
    gameUsage: 'Countryside towns, cozy save points, crafting menus',
  },
  japanese_insen: {
    name: 'japanese_insen',
    label: 'Japanese Insen (Miyako-bushi)',
    intervals: [0, 1, 5, 7, 10],
    mood: 'Feudal, contemplative, samurai, tragic beauty',
    gameUsage: 'East Asian settings, ninja stealth, cherry blossom shrines',
  },
  hungarian_minor: {
    name: 'hungarian_minor',
    label: 'Hungarian Gypsy Minor',
    intervals: [0, 2, 3, 6, 7, 8, 11],
    mood: 'Haunting, dark sorcery, intense tension',
    gameUsage: 'Warlock battles, vampire lairs, twisted dimension rifts',
  },
};

/** Convert MIDI pitch (0-127) to note name with octave (e.g. 60 -> "C4") */
export function midiToNoteName(midi: number): string {
  const noteIndex = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[noteIndex]}${octave}`;
}

/** Convert note name with octave (e.g. "C4", "D#3") to MIDI pitch */
export function noteNameToMidi(noteName: string): number {
  const match = noteName.match(/^([A-G]#?)(-?\d+)$/i);
  if (!match) return 60;
  const letter = match[1].toUpperCase();
  const octave = parseInt(match[2], 10);
  const noteIndex = NOTE_NAMES.indexOf(letter as NoteName);
  if (noteIndex === -1) return 60;
  return (octave + 1) * 12 + noteIndex;
}

/** Convert MIDI pitch to frequency in Hertz */
export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Get root note index (0-11) from key string like "D", "C#", "F" */
export function getRootIndex(key: string): number {
  const clean = key.trim().toUpperCase();
  const idx = NOTE_NAMES.indexOf(clean as NoteName);
  return idx !== -1 ? idx : 0;
}

/** Get all MIDI pitches in a given scale across an octave range */
export function getScaleMidiPitches(
  key: string,
  scaleName: string,
  minMidi = 24,
  maxMidi = 108
): number[] {
  const rootIndex = getRootIndex(key);
  const scale = SCALES[scaleName] || SCALES.minor;
  const pitches: number[] = [];

  for (let midi = minMidi; midi <= maxMidi; midi++) {
    const pitchClass = ((midi - rootIndex) % 12 + 12) % 12;
    if (scale.intervals.includes(pitchClass)) {
      pitches.push(midi);
    }
  }

  return pitches;
}

/** Snap a given MIDI note to the nearest note in the scale */
export function snapToScale(pitch: number, key: string, scaleName: string): number {
  const scalePitches = getScaleMidiPitches(key, scaleName, Math.max(0, pitch - 12), Math.min(127, pitch + 12));
  if (scalePitches.length === 0) return pitch;

  let closest = scalePitches[0];
  let minDiff = Math.abs(pitch - closest);

  for (const p of scalePitches) {
    const diff = Math.abs(pitch - p);
    if (diff < minDiff) {
      minDiff = diff;
      closest = p;
    }
  }

  return closest;
}

/** Check if a MIDI note is in the specified scale */
export function isNoteInScale(pitch: number, key: string, scaleName: string): boolean {
  const rootIndex = getRootIndex(key);
  const scale = SCALES[scaleName] || SCALES.minor;
  const pitchClass = ((pitch - rootIndex) % 12 + 12) % 12;
  return scale.intervals.includes(pitchClass);
}
