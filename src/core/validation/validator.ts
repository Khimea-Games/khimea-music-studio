import { Composition, ValidationMessage } from '../../types/music';
import { isNoteInScale, midiToNoteName } from '../theory/scales';
import { getInstrumentById } from '../instruments/library';

export class CompositionValidator {
  /** Run all validation checks on a composition */
  public static validate(composition: Composition): ValidationMessage[] {
    const messages: ValidationMessage[] = [];

    // 1. Range Validation
    this.validateRanges(composition, messages);

    // 2. Harmony Validation
    this.validateHarmony(composition, messages);

    // 3. Rhythm Validation
    this.validateRhythm(composition, messages);

    // 4. Sustain vs. sample length (offline renderer)
    this.validateSustain(composition, messages);

    // 5. Loop Validation
    if (composition.metadata?.loopStartBar !== undefined && composition.metadata?.loopEndBar !== undefined) {
      this.validateLoop(composition, messages);
    }

    return messages;
  }

  private static validateRanges(comp: Composition, msgs: ValidationMessage[]): void {
    for (const track of comp.tracks) {
      const inst = getInstrumentById(track.instrumentId);
      const [minRange, maxRange] = inst.recommendedRange;

      for (const note of track.notes) {
        if (note.pitch < minRange || note.pitch > maxRange) {
          msgs.push({
            id: `range-${track.id}-${note.id}`,
            type: 'warning',
            category: 'range',
            message: `Note ${midiToNoteName(note.pitch)} in track "${track.name}" is outside the recommended natural acoustic range (${midiToNoteName(minRange)} - ${midiToNoteName(maxRange)}) for ${inst.name}.`,
            trackId: track.id,
            noteId: note.id,
            bar: Math.floor(note.start / comp.timeSignature.numerator) + 1,
          });
        }
      }
    }
  }

  private static validateHarmony(comp: Composition, msgs: ValidationMessage[]): void {
    const scale = comp.scale || 'minor';
    const key = comp.key || 'D';

    for (const track of comp.tracks) {
      // Percussion doesn't need scale check
      if (track.role === 'percussion' || track.role === 'rhythm') continue;

      let outOfScaleCount = 0;
      for (const note of track.notes) {
        if (!isNoteInScale(note.pitch, key, scale)) {
          outOfScaleCount++;
          if (outOfScaleCount <= 2) {
            msgs.push({
              id: `harmony-${track.id}-${note.id}`,
              type: 'info',
              category: 'harmony',
              message: `Note ${midiToNoteName(note.pitch)} in track "${track.name}" is accidental / outside ${key} ${scale}. If intentional, this creates modal tension.`,
              trackId: track.id,
              noteId: note.id,
              bar: Math.floor(note.start / comp.timeSignature.numerator) + 1,
            });
          }
        }
      }
    }
  }

  private static validateRhythm(comp: Composition, msgs: ValidationMessage[]): void {
    const beatsPerBar = comp.timeSignature.numerator;
    const maxBeats = comp.durationBars * beatsPerBar;

    for (const track of comp.tracks) {
      for (const note of track.notes) {
        if (note.start + note.duration > maxBeats + 0.01) {
          msgs.push({
            id: `rhythm-exceed-${track.id}-${note.id}`,
            type: 'warning',
            category: 'rhythm',
            message: `Note ${midiToNoteName(note.pitch)} in "${track.name}" extends past the total composition duration (${comp.durationBars} bars).`,
            trackId: track.id,
            noteId: note.id,
            bar: Math.floor(note.start / beatsPerBar) + 1,
          });
        }
        if (note.duration <= 0.05) {
          msgs.push({
            id: `rhythm-short-${track.id}-${note.id}`,
            type: 'warning',
            category: 'rhythm',
            message: `Note ${midiToNoteName(note.pitch)} in "${track.name}" has an extremely short duration (< 1/32 beat).`,
            trackId: track.id,
            noteId: note.id,
          });
        }
      }
    }
  }

  /**
   * Si una nota sostenida dura más que su sample, el renderer repite el sustain en loop y suena "a órgano".
   * Los samples reales (VSCO 2 CE) de cuerdas y vientos duran 6,5-24 s: límite 6 s. El coro sigue con FluidR3,
   * cuyos samples duran ~3,1 s (con release ~0,7 s): límite 2,4 s.
   */
  public static readonly MAX_SUSTAIN_SECONDS = 6.0;
  public static readonly MAX_SUSTAIN_SECONDS_FLUIDR3 = 2.4;
  private static readonly SUSTAINED_INSTRUMENTS = /violin|viola|cello|contrabass|double_bass|flute|woodwind|oboe|clarinet|horn|trombone|tuba|choir/;
  private static readonly FLUIDR3_SUSTAINED = /choir/;

  private static validateSustain(comp: Composition, msgs: ValidationMessage[]): void {
    const secondsPerBeat = 60 / comp.tempo;
    for (const track of comp.tracks) {
      if (!this.SUSTAINED_INSTRUMENTS.test(track.instrumentId)) continue;
      const limit = this.FLUIDR3_SUSTAINED.test(track.instrumentId) ? this.MAX_SUSTAIN_SECONDS_FLUIDR3 : this.MAX_SUSTAIN_SECONDS;
      const long = track.notes.filter(
        (n) => n.articulation !== 'pizzicato' && n.articulation !== 'staccato' && n.duration * secondsPerBeat > limit
      );
      if (!long.length) continue;
      const maxBeats = Math.floor((limit / secondsPerBeat) * 4) / 4;
      const first = long[0];
      msgs.push({
        id: `sustain-${track.id}`,
        type: 'warning',
        category: 'sustain',
        message:
          `${long.length} note(s) in "${track.name}" last longer than ${limit} s ` +
          `(max ${maxBeats} beats at ${comp.tempo} BPM); the renderer loops the sample and it sounds like an organ. ` +
          `First: ${midiToNoteName(first.pitch)} at bar ${Math.floor(first.start / comp.timeSignature.numerator) + 1}, ` +
          `${first.duration} beats. Split or re-articulate them.`,
        trackId: track.id,
        noteId: first.id,
        bar: Math.floor(first.start / comp.timeSignature.numerator) + 1,
      });
    }
  }

  private static validateLoop(comp: Composition, msgs: ValidationMessage[]): void {
    const loopStart = comp.metadata.loopStartBar ?? 1;
    const loopEnd = comp.metadata.loopEndBar ?? comp.durationBars;
    const beatsPerBar = comp.timeSignature.numerator;
    const loopStartBeat = (loopStart - 1) * beatsPerBar;
    const loopEndBeat = loopEnd * beatsPerBar;

    let hasEndNotes = false;
    let hasStartNotes = false;

    for (const track of comp.tracks) {
      for (const note of track.notes) {
        if (Math.abs(note.start - loopStartBeat) < 1.0) {
          hasStartNotes = true;
        }
        if (note.start + note.duration >= loopEndBeat - 1.0 && note.start < loopEndBeat) {
          hasEndNotes = true;
        }
      }
    }

    if (!hasStartNotes) {
      msgs.push({
        id: 'loop-empty-start',
        type: 'warning',
        category: 'loop',
        message: `Loop start (Bar ${loopStart}) has no initial note attacks; loop transition might feel empty.`,
      });
    }

    if (!hasEndNotes) {
      msgs.push({
        id: 'loop-empty-end',
        type: 'info',
        category: 'loop',
        message: `Loop end (Bar ${loopEnd}) has dead space before wrapping to Bar ${loopStart}.`,
      });
    }
  }
}
