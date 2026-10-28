import { NoteEvent, Track } from '../../types/music';

export interface HumanizeOptions {
  timingAmount?: number; // 0.0 to 1.0 (0 = exact grid, 1 = loose human feel)
  velocityAmount?: number; // 0.0 to 1.0
  durationAmount?: number; // 0.0 to 1.0
  accentDownbeats?: boolean;
  beatsPerBar?: number;
}

export class HumanizationEngine {
  /** Humanize an array of notes */
  public static humanizeNotes(notes: NoteEvent[], options: HumanizeOptions = {}): NoteEvent[] {
    const timingAmt = options.timingAmount ?? 0.3; // subtle by default
    const velAmt = options.velocityAmount ?? 0.4;
    const durAmt = options.durationAmount ?? 0.2;
    const beatsPerBar = options.beatsPerBar ?? 4;
    const accentDownbeats = options.accentDownbeats ?? true;

    return notes.map((note) => {
      // Gaussian-ish random using sum of uniforms
      const rand1 = (Math.random() + Math.random() - 1);
      const rand2 = (Math.random() + Math.random() - 1);
      const rand3 = (Math.random() + Math.random() - 1);

      // Max timing shift ~ 0.04 beats (about 25ms at 120bpm)
      const maxTimingShift = 0.04 * timingAmt;
      const newStart = Math.max(0, note.start + rand1 * maxTimingShift);

      // Downbeat accent calculation
      const beatInBar = note.start % beatsPerBar;
      const isDownbeat = Math.abs(beatInBar) < 0.1 || Math.abs(beatInBar - (beatsPerBar / 2)) < 0.1;
      const downbeatBonus = (accentDownbeats && isDownbeat) ? 8 * velAmt : 0;

      // Max velocity shift ~ +/- 18
      const maxVelShift = 18 * velAmt;
      const newVel = Math.min(127, Math.max(20, Math.round(note.velocity + rand2 * maxVelShift + downbeatBonus)));

      // Duration variation: +/- 8% of original duration
      const durShift = note.duration * 0.08 * durAmt * rand3;
      const newDuration = Math.max(0.1, note.duration + durShift);

      return {
        ...note,
        start: Number(newStart.toFixed(4)),
        velocity: newVel,
        duration: Number(newDuration.toFixed(4)),
      };
    });
  }

  /** Humanize an entire track */
  public static humanizeTrack(track: Track, options: HumanizeOptions = {}): Track {
    return {
      ...track,
      notes: this.humanizeNotes(track.notes, options),
    };
  }
}
