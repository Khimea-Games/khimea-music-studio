import { Composition, Motif, NoteEvent, Track } from '../../types/music';
import { snapToScale } from '../theory/scales';

export type VariationType =
  | 'melancholic'
  | 'combat'
  | 'calm'
  | 'boss'
  | 'nostalgic'
  | 'modal_minor'
  | 'modal_major';

export class VariationEngine {
  /** Create a modified version of a composition preserving core identity */
  public static createVariation(
    comp: Composition,
    type: VariationType,
    customInstruction?: string
  ): Composition {
    const cloned: Composition = JSON.parse(JSON.stringify(comp));
    cloned.id = `comp_${Date.now()}`;
    cloned.metadata.created = new Date().toISOString();
    cloned.metadata.modified = new Date().toISOString();

    switch (type) {
      case 'melancholic':
        return this.makeMelancholic(cloned);
      case 'combat':
        return this.makeCombat(cloned);
      case 'calm':
        return this.makeCalm(cloned);
      case 'boss':
        return this.makeBoss(cloned);
      case 'nostalgic':
      default:
        return this.makeNostalgic(cloned);
    }
  }

  private static makeMelancholic(comp: Composition): Composition {
    comp.title = `${comp.title} (Melancholic Reflection)`;
    comp.tempo = Math.max(56, Math.round(comp.tempo * 0.82)); // Slow down 18%
    comp.scale = 'natural_minor';

    comp.tracks = comp.tracks.map((track) => {
      // Soften dynamics and lengthen notes for sadness
      const newNotes = track.notes.map((n) => ({
        ...n,
        velocity: Math.max(30, Math.round(n.velocity * 0.78)),
        duration: n.duration * 1.15,
      }));

      // If heavy percussion, reduce volume or mute
      if (track.role === 'percussion') {
        return { ...track, volume: track.volume * 0.4, notes: newNotes };
      }

      // If melody or cello, give more prominent warm presence
      if (track.role === 'melody' || track.instrumentId.includes('cello')) {
        return { ...track, volume: Math.min(1.0, track.volume * 1.15), notes: newNotes };
      }

      return { ...track, notes: newNotes };
    });

    return comp;
  }

  private static makeCombat(comp: Composition): Composition {
    comp.title = `${comp.title} (Combat Variation)`;
    comp.tempo = Math.min(160, Math.round(comp.tempo * 1.35)); // Speed up 35%
    comp.scale = 'harmonic_minor';

    // Check if we need to add Taiko if not present
    const hasPercussion = comp.tracks.some((t) => t.role === 'percussion');

    comp.tracks = comp.tracks.map((track) => {
      // Shorten notes and increase velocity for aggressive attack
      const newNotes = track.notes.map((n) => ({
        ...n,
        velocity: Math.min(127, Math.round(n.velocity * 1.25)),
        duration: Math.max(0.2, n.duration * 0.65), // Staccato bite
        articulation: 'accent' as const,
      }));

      if (track.role === 'percussion') {
        return { ...track, volume: 1.0, notes: newNotes, mute: false };
      }

      return { ...track, notes: newNotes };
    });

    if (!hasPercussion) {
      // Add war drum track
      const percNotes: NoteEvent[] = [];
      const beatsPerBar = comp.timeSignature.numerator;
      let idCounter = 1;

      for (let bar = 0; bar < comp.durationBars; bar++) {
        const start = bar * beatsPerBar;
        percNotes.push({ id: `c_perc_${idCounter++}`, pitch: 36, start, duration: 0.5, velocity: 120 });
        percNotes.push({ id: `c_perc_${idCounter++}`, pitch: 38, start: start + 1.5, duration: 0.5, velocity: 100 });
        percNotes.push({ id: `c_perc_${idCounter++}`, pitch: 36, start: start + 2.0, duration: 0.5, velocity: 110 });
        percNotes.push({ id: `c_perc_${idCounter++}`, pitch: 38, start: start + 3.0, duration: 0.5, velocity: 105 });
      }

      comp.tracks.push({
        id: 'track_combat_war_drums',
        name: 'Taiko War Drums (Combat Addition)',
        instrumentId: 'percussion_taiko',
        role: 'percussion',
        notes: percNotes,
        automation: [],
        volume: 0.9,
        pan: 0,
        mute: false,
        solo: false,
        color: '#ef4444',
      });
    }

    return comp;
  }

  private static makeCalm(comp: Composition): Composition {
    comp.title = `${comp.title} (Peaceful Hearth)`;
    comp.tempo = Math.max(60, Math.round(comp.tempo * 0.85));

    comp.tracks = comp.tracks.map((track) => {
      if (track.role === 'percussion') {
        return { ...track, mute: true }; // Mute heavy percussion
      }
      return {
        ...track,
        volume: Math.min(0.8, track.volume * 0.85),
        notes: track.notes.map((n) => ({
          ...n,
          velocity: Math.max(35, Math.round(n.velocity * 0.75)),
          duration: n.duration * 1.1,
        })),
      };
    });

    return comp;
  }

  private static makeBoss(comp: Composition): Composition {
    comp.title = `${comp.title} (Climactic Boss Encounter)`;
    comp.tempo = Math.max(130, Math.round(comp.tempo * 1.4));
    comp.scale = 'phrygian';

    comp.tracks = comp.tracks.map((track) => ({
      ...track,
      volume: Math.min(1.0, track.volume * 1.2),
      notes: track.notes.map((n) => ({
        ...n,
        velocity: Math.min(127, Math.round(n.velocity * 1.3)),
      })),
    }));

    return comp;
  }

  private static makeNostalgic(comp: Composition): Composition {
    comp.title = `${comp.title} (Nostalgic Recollection)`;
    comp.tempo = Math.max(68, Math.round(comp.tempo * 0.9));
    comp.scale = 'dorian';

    return comp;
  }

  /** Create 3 distinct motif variations (Calm, Combat, Sad) from a Leitmotif */
  public static createMotifVariations(motif: Motif): Array<{ name: string; notes: number[]; rhythm: number[] }> {
    return [
      {
        name: `${motif.name} (Calm / Exploration)`,
        notes: [...motif.notes], // Pure original pitches
        rhythm: motif.rhythm.map((r) => r * 1.5), // Slower, relaxed
      },
      {
        name: `${motif.name} (Combat Fanfare)`,
        notes: motif.notes.map((p, i) => (i % 2 === 0 ? p + 12 : p)), // Octave leaps
        rhythm: motif.rhythm.map((r) => Math.max(0.25, r * 0.5)), // Driving fast
      },
      {
        name: `${motif.name} (Dark / Sorrowful)`,
        notes: motif.notes.map((p) => p - 1), // Lowered degrees (flat minor)
        rhythm: motif.rhythm.map((r) => r * 1.2),
      },
    ];
  }
}
