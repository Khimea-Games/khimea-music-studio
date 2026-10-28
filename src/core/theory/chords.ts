import { NOTE_NAMES, NoteName } from './scales';

export interface ChordType {
  name: string;
  symbol: string;
  intervals: number[]; // From chord root
  quality: 'major' | 'minor' | 'diminished' | 'augmented' | 'suspended';
}

export const CHORD_TYPES: Record<string, ChordType> = {
  maj: { name: 'Major Triad', symbol: '', intervals: [0, 4, 7], quality: 'major' },
  min: { name: 'Minor Triad', symbol: 'm', intervals: [0, 3, 7], quality: 'minor' },
  dim: { name: 'Diminished', symbol: 'dim', intervals: [0, 3, 6], quality: 'diminished' },
  aug: { name: 'Augmented', symbol: 'aug', intervals: [0, 4, 8], quality: 'augmented' },
  sus2: { name: 'Suspended 2nd', symbol: 'sus2', intervals: [0, 2, 7], quality: 'suspended' },
  sus4: { name: 'Suspended 4th', symbol: 'sus4', intervals: [0, 5, 7], quality: 'suspended' },
  maj7: { name: 'Major 7th', symbol: 'maj7', intervals: [0, 4, 7, 11], quality: 'major' },
  min7: { name: 'Minor 7th', symbol: 'm7', intervals: [0, 3, 7, 10], quality: 'minor' },
  dom7: { name: 'Dominant 7th', symbol: '7', intervals: [0, 4, 7, 10], quality: 'major' },
  m7b5: { name: 'Half-Diminished 7th', symbol: 'm7b5', intervals: [0, 3, 6, 10], quality: 'diminished' },
  dim7: { name: 'Diminished 7th', symbol: 'dim7', intervals: [0, 3, 6, 9], quality: 'diminished' },
  add9: { name: 'Added 9th', symbol: 'add9', intervals: [0, 4, 7, 14], quality: 'major' },
  madd9: { name: 'Minor Added 9th', symbol: 'm(add9)', intervals: [0, 3, 7, 14], quality: 'minor' },
};

export interface ChordInfo {
  root: NoteName;
  type: string;
  inversion: number; // 0 = root, 1 = 1st, 2 = 2nd, 3 = 3rd
  baseOctave: number; // e.g. 4
  romanNumeral?: string;
  name: string;
}

/** Generate MIDI pitches for a chord with inversion and octave */
export function getChordPitches(
  root: NoteName,
  typeKey: string,
  octave = 4,
  inversion = 0
): number[] {
  const rootIndex = NOTE_NAMES.indexOf(root);
  const rootMidi = (octave + 1) * 12 + rootIndex;
  const chordType = CHORD_TYPES[typeKey] || CHORD_TYPES.min;

  const notes = chordType.intervals.map((semitones) => rootMidi + semitones);

  // Apply inversion: shift bottom notes up an octave
  for (let i = 0; i < inversion % notes.length; i++) {
    notes[i] += 12;
  }

  // Sort notes ascending
  notes.sort((a, b) => a - b);
  return notes;
}

/** Smooth Voice Leading: Adjust octave of target chord notes to minimize total pitch distance from previous chord */
export function solveVoiceLeading(
  previousPitches: number[],
  targetRoot: NoteName,
  targetTypeKey: string,
  preferredOctave = 4
): number[] {
  if (!previousPitches || previousPitches.length === 0) {
    return getChordPitches(targetRoot, targetTypeKey, preferredOctave, 0);
  }

  // Try root position, 1st inversion, 2nd inversion at octaves (preferredOctave - 1, preferredOctave, preferredOctave + 1)
  const candidateInversions: number[][] = [];
  for (const oct of [preferredOctave - 1, preferredOctave, preferredOctave + 1]) {
    for (let inv = 0; inv < 3; inv++) {
      candidateInversions.push(getChordPitches(targetRoot, targetTypeKey, oct, inv));
    }
  }

  // Find candidate with smallest total distance to previous voices
  let bestCandidate = candidateInversions[0];
  let minCost = Infinity;

  const prevMean = previousPitches.reduce((a, b) => a + b, 0) / previousPitches.length;

  for (const candidate of candidateInversions) {
    const candMean = candidate.reduce((a, b) => a + b, 0) / candidate.length;
    // Mean jump cost + individual voice movement cost
    let voiceDist = 0;
    const len = Math.min(previousPitches.length, candidate.length);
    for (let i = 0; i < len; i++) {
      voiceDist += Math.abs(candidate[i] - previousPitches[i]);
    }
    const cost = voiceDist + Math.abs(candMean - prevMean) * 2;

    if (cost < minCost) {
      minCost = cost;
      bestCandidate = candidate;
    }
  }

  return bestCandidate;
}
