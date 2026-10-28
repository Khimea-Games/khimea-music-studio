import { NoteEvent } from '../../types/music';

/** Acordes con nombre y su voicing (bajo + voces) para add_chord_pattern, más utilidades de armonía y sostenido. */

export type ChordName = 'D' | 'A/C#' | 'Bm' | 'G' | 'D/F#' | 'Em7' | 'Asus4' | 'A' | 'Gm' | 'Dsus2';
export interface Chord {
  bass: number;
  voicing: number[];
}
/** Un compás de armonía: [acorde, tiempo de inicio, duración en tiempos]. */
export type HarmonyBar = [ChordName, number, number][];
/** Un compás de melodía: [altura MIDI, tiempo de inicio, duración]. */
export type MelodyBar = [number, number, number][];

export const BEATS_PER_BAR = 4;

/**
 * Los samples de cuerdas y flauta duran ~3,1 s: más de 2,5 tiempos a 66 BPM y el render repite el sustain
 * ("suena a órgano"). Se acortan sin cambiar altura ni inicio; con `downbeatBreath`, las notas largas del
 * tiempo 1 entran ese tanto después, como una respiración del arco. Igual que `limit_duration` de la API.
 */
export const MAX_SUSTAIN_BEATS = 2.5;
export const capSustain = (notes: NoteEvent[], downbeatBreath = 0): NoteEvent[] =>
  notes.map((n) => {
    if (n.duration <= MAX_SUSTAIN_BEATS) return n;
    const onDownbeat = n.start % BEATS_PER_BAR === 0;
    const shift = downbeatBreath > 0 && onDownbeat && n.duration - downbeatBreath > 0 ? downbeatBreath : 0;
    return { ...n, start: n.start + shift, duration: Math.min(n.duration - shift, MAX_SUSTAIN_BEATS) };
  });

export const CHORDS: Record<ChordName, Chord> = {
  D: { bass: 50, voicing: [57, 62, 66] },
  'A/C#': { bass: 49, voicing: [57, 61, 64] },
  Bm: { bass: 47, voicing: [59, 62, 66] },
  G: { bass: 43, voicing: [59, 62, 67] },
  'D/F#': { bass: 42, voicing: [57, 62, 66] },
  Em7: { bass: 40, voicing: [55, 59, 62, 64] },
  Asus4: { bass: 45, voicing: [57, 62, 64] },
  A: { bass: 45, voicing: [57, 61, 64] },
  Gm: { bass: 43, voicing: [58, 62, 67] },
  Dsus2: { bass: 50, voicing: [57, 62, 64] },
};

export const whole = (c: ChordName): HarmonyBar => [[c, 0, 4]];
