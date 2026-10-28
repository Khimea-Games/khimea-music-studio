import {
  Composition,
  MusicIntent,
  NoteEvent,
  Section,
  Track,
} from '../../types/music';
import { getChordPitches, solveVoiceLeading } from '../theory/chords';
import { GAME_PROGRESSIONS, resolveProgression } from '../theory/progressions';
import { getScaleMidiPitches, snapToScale } from '../theory/scales';
import { HumanizationEngine } from '../humanization/humanizer';
import { CompositionValidator } from '../validation/validator';

export class CompositionEngine {
  /** Generate a complete composition from a MusicIntent */
  public static generateFromIntent(intent: MusicIntent, seed = Math.floor(Math.random() * 1000000)): Composition {
    const key = intent.targetKey || (intent.purpose === 'combat' || intent.purpose === 'boss' ? 'D' : 'D');
    const scale = intent.targetScale || (intent.purpose === 'boss' ? 'phrygian' : intent.purpose === 'combat' ? 'harmonic_minor' : 'natural_minor');

    // Tempo selection within range
    const [minBpm, maxBpm] = intent.tempoRange || (intent.purpose === 'boss' ? [128, 140] : intent.purpose === 'combat' ? [120, 136] : [68, 78]);
    const tempo = Math.round(minBpm + (maxBpm - minBpm) * 0.4);

    const beatsPerBar = 4;
    const durationBars = intent.durationBars || (intent.purpose === 'boss' ? 32 : 32);

    // Structure sections
    const sections: Section[] = this.buildSections(intent, durationBars);

    // Pick chord progression
    const progressionPattern = this.selectProgressionPattern(intent);
    const resolvedChords = resolveProgression(key, progressionPattern);

    // Generate tracks
    const tracks: Track[] = [];

    // 1. Melody Track
    const melodyInstrument = intent.purpose === 'boss' ? 'brass_french_horn' : 'piano_grand';
    const melodyNotes = this.generateMelody(key, scale, resolvedChords, durationBars, beatsPerBar, intent.intensity);
    tracks.push({
      id: 'track_melody',
      name: intent.purpose === 'boss' ? 'French Horns (Theme)' : 'Grand Piano (Melody)',
      instrumentId: melodyInstrument,
      role: 'melody',
      notes: melodyNotes,
      automation: [],
      volume: 0.85,
      pan: 0,
      mute: false,
      solo: false,
      color: '#38bdf8',
      icon: intent.purpose === 'boss' ? 'brass' : 'piano',
      reverbSend: 0.3,
    });

    // 2. Harmony / Strings Track
    const harmonyNotes = this.generateHarmony(resolvedChords, durationBars, beatsPerBar, intent.purpose);
    tracks.push({
      id: 'track_harmony',
      name: 'Violins Ensemble (Harmony)',
      instrumentId: 'strings_violins',
      role: 'harmony',
      notes: harmonyNotes,
      automation: [],
      volume: 0.75,
      pan: -0.2,
      mute: false,
      solo: false,
      color: '#818cf8',
      icon: 'strings',
      reverbSend: 0.4,
    });

    // 3. Bass / Cello Track
    const bassInstrument = intent.purpose === 'boss' ? 'strings_contrabass' : 'strings_cellos';
    const bassNotes = this.generateBass(resolvedChords, durationBars, beatsPerBar, intent.purpose);
    tracks.push({
      id: 'track_bass',
      name: intent.purpose === 'boss' ? 'Contrabass (Heavy Bass)' : 'Cello Section (Low)',
      instrumentId: bassInstrument,
      role: 'bass',
      notes: bassNotes,
      automation: [],
      volume: 0.8,
      pan: 0.1,
      mute: false,
      solo: false,
      color: '#a78bfa',
      icon: intent.purpose === 'boss' ? 'bass' : 'cello',
      reverbSend: 0.25,
    });

    // 4. Ambient Pad or Choir Track
    if (intent.intensity > 60 || intent.purpose === 'boss') {
      const choirNotes = this.generateChoirPads(resolvedChords, durationBars, beatsPerBar);
      tracks.push({
        id: 'track_choir',
        name: 'Dark Low Choir',
        instrumentId: 'choir_low',
        role: 'texture',
        notes: choirNotes,
        automation: [],
        volume: 0.7,
        pan: 0.25,
        mute: false,
        solo: false,
        color: '#ec4899',
        icon: 'choir',
        reverbSend: 0.5,
      });
    } else {
      const padNotes = this.generateAmbientPad(resolvedChords, durationBars, beatsPerBar);
      tracks.push({
        id: 'track_pad',
        name: 'Dark Mystery Drone Pad',
        instrumentId: 'ambient_pad',
        role: 'texture',
        notes: padNotes,
        automation: [],
        volume: 0.65,
        pan: -0.15,
        mute: false,
        solo: false,
        color: '#06b6d4',
        icon: 'pad',
        reverbSend: 0.6,
      });
    }

    // 5. Percussion Track
    if (intent.intensity > 30 || intent.purpose === 'combat' || intent.purpose === 'boss') {
      const percNotes = this.generatePercussion(durationBars, beatsPerBar, intent.purpose);
      tracks.push({
        id: 'track_percussion',
        name: 'Taiko War Drums',
        instrumentId: 'percussion_taiko',
        role: 'percussion',
        notes: percNotes,
        automation: [],
        volume: 0.85,
        pan: 0,
        mute: false,
        solo: false,
        color: '#ef4444',
        icon: 'drum',
        reverbSend: 0.2,
      });
    }

    // Humanize all tracks slightly for natural performance
    const humanizedTracks = tracks.map((t) => HumanizationEngine.humanizeTrack(t, { timingAmount: 0.25, velocityAmount: 0.35 }));

    const comp: Composition = {
      id: `comp_${Date.now()}`,
      projectId: 'proj_khimea_default',
      title: this.generateTitle(intent),
      tempo,
      timeSignature: { numerator: beatsPerBar, denominator: 4 },
      key,
      scale,
      durationBars,
      mode: intent.loop ? 'loop' : 'linear',
      sections,
      tracks: humanizedTracks,
      metadata: {
        author: 'Khimea AI Composer Engine',
        genre: intent.genre,
        mood: intent.mood,
        purpose: intent.purpose,
        seed,
        created: new Date().toISOString(),
        modified: new Date().toISOString(),
        loopStartBar: 1,
        loopEndBar: durationBars,
      },
    };

    // Validate
    CompositionValidator.validate(comp);

    return comp;
  }

  private static buildSections(intent: MusicIntent, totalBars: number): Section[] {
    const barsPerSec = Math.floor(totalBars / 4);
    if (intent.purpose === 'boss' || intent.purpose === 'combat') {
      return [
        { id: 'sec_1', name: 'INTRO', startBar: 1, barCount: barsPerSec, intensity: 50 },
        { id: 'sec_2', name: 'BUILDUP', startBar: barsPerSec + 1, barCount: barsPerSec, intensity: 75 },
        { id: 'sec_3', name: 'COMBAT', startBar: barsPerSec * 2 + 1, barCount: barsPerSec, intensity: 95 },
        { id: 'sec_4', name: 'CLIMAX', startBar: barsPerSec * 3 + 1, barCount: totalBars - barsPerSec * 3, intensity: 100 },
      ];
    } else {
      return [
        { id: 'sec_1', name: 'INTRO', startBar: 1, barCount: barsPerSec, intensity: 20 },
        { id: 'sec_2', name: 'EXPLORATION_A', startBar: barsPerSec + 1, barCount: barsPerSec, intensity: 35 },
        { id: 'sec_3', name: 'EXPLORATION_B', startBar: barsPerSec * 2 + 1, barCount: barsPerSec, intensity: 50 },
        { id: 'sec_4', name: 'RESOLUTION', startBar: barsPerSec * 3 + 1, barCount: totalBars - barsPerSec * 3, intensity: 30 },
      ];
    }
  }

  private static selectProgressionPattern(intent: MusicIntent) {
    if (intent.purpose === 'boss') {
      return GAME_PROGRESSIONS.find((p) => p.category === 'boss') || GAME_PROGRESSIONS[2];
    }
    if (intent.purpose === 'combat') {
      return GAME_PROGRESSIONS.find((p) => p.category === 'combat') || GAME_PROGRESSIONS[3];
    }
    if (intent.purpose === 'town') {
      return GAME_PROGRESSIONS.find((p) => p.category === 'town') || GAME_PROGRESSIONS[4];
    }
    return GAME_PROGRESSIONS.find((p) => p.category === 'dark_fantasy') || GAME_PROGRESSIONS[0];
  }

  private static generateMelody(
    key: string,
    scale: string,
    chords: Array<{ root: string; typeKey: string; degree: string }>,
    durationBars: number,
    beatsPerBar: number,
    intensity: number
  ): NoteEvent[] {
    const notes: NoteEvent[] = [];
    const scalePitches = getScaleMidiPitches(key, scale, 60, 84); // C4 to C6

    // Motif contour: e.g. root -> 3rd -> 5th -> 4th -> 2nd
    let idCounter = 1;
    for (let bar = 0; bar < durationBars; bar++) {
      const chord = chords[bar % chords.length];
      const rootMidi = snapToScale(62, key, scale); // D4 default
      const chordPitches = getChordPitches(chord.root as any, chord.typeKey, 5, 0);

      // Create musical phrase
      const barStartBeat = bar * beatsPerBar;

      if (bar % 4 === 3) {
        // Cadence note: long sustained emotional resolution
        const targetPitch = chordPitches[0];
        notes.push({
          id: `mel_${idCounter++}`,
          pitch: targetPitch,
          start: barStartBeat,
          duration: 3.5,
          velocity: Math.min(110, 75 + intensity * 0.3),
        });
      } else {
        // Melodic arc: 2-3 notes per bar
        const p1 = chordPitches[0];
        const p2 = chordPitches[1] || p1 + 3;
        const p3 = scalePitches[(scalePitches.indexOf(p2) + 1) % scalePitches.length] || p2;

        notes.push({
          id: `mel_${idCounter++}`,
          pitch: p1,
          start: barStartBeat,
          duration: 1.5,
          velocity: 80,
        });

        notes.push({
          id: `mel_${idCounter++}`,
          pitch: p2,
          start: barStartBeat + 1.5,
          duration: 1.0,
          velocity: 85,
        });

        notes.push({
          id: `mel_${idCounter++}`,
          pitch: p3,
          start: barStartBeat + 2.5,
          duration: 1.5,
          velocity: 78,
        });
      }
    }

    return notes;
  }

  private static generateHarmony(
    chords: Array<{ root: string; typeKey: string; degree: string }>,
    durationBars: number,
    beatsPerBar: number,
    purpose: string
  ): NoteEvent[] {
    const notes: NoteEvent[] = [];
    let idCounter = 1;
    let prevPitches: number[] = [];

    for (let bar = 0; bar < durationBars; bar++) {
      const chord = chords[bar % chords.length];
      const chordPitches = solveVoiceLeading(prevPitches, chord.root as any, chord.typeKey, 4);
      prevPitches = chordPitches;

      const barStartBeat = bar * beatsPerBar;

      if (purpose === 'combat' || purpose === 'boss') {
        // Rhythmic pulsing staccatos on beats 1, 2, 3, 4
        for (let b = 0; b < beatsPerBar; b++) {
          for (const pitch of chordPitches) {
            notes.push({
              id: `harm_${idCounter++}`,
              pitch,
              start: barStartBeat + b,
              duration: 0.6,
              velocity: b === 0 ? 88 : 72,
              articulation: 'staccato',
            });
          }
        }
      } else {
        // Sustained lush pad chords (whole notes)
        for (const pitch of chordPitches) {
          notes.push({
            id: `harm_${idCounter++}`,
            pitch,
            start: barStartBeat,
            duration: 3.8,
            velocity: 68,
            articulation: 'legato',
          });
        }
      }
    }

    return notes;
  }

  private static generateBass(
    chords: Array<{ root: string; typeKey: string; degree: string }>,
    durationBars: number,
    beatsPerBar: number,
    purpose: string
  ): NoteEvent[] {
    const notes: NoteEvent[] = [];
    let idCounter = 1;

    for (let bar = 0; bar < durationBars; bar++) {
      const chord = chords[bar % chords.length];
      const rootPitches = getChordPitches(chord.root as any, chord.typeKey, 2, 0);
      const rootPitch = rootPitches[0]; // Bass fundamental (octave 2, e.g. D2 = 38)
      const fifthPitch = rootPitches[2] || rootPitch + 7;

      const barStartBeat = bar * beatsPerBar;

      if (purpose === 'boss' || purpose === 'combat') {
        // Heavy 8th note ostinato: root, root, 5th, root...
        for (let eighth = 0; eighth < beatsPerBar * 2; eighth++) {
          const pitch = eighth % 4 === 2 ? fifthPitch : rootPitch;
          notes.push({
            id: `bass_${idCounter++}`,
            pitch,
            start: barStartBeat + eighth * 0.5,
            duration: 0.4,
            velocity: eighth % 2 === 0 ? 98 : 82,
            articulation: 'staccato',
          });
        }
      } else {
        // Slow deep acoustic cello anchor
        notes.push({
          id: `bass_${idCounter++}`,
          pitch: rootPitch,
          start: barStartBeat,
          duration: 2.8,
          velocity: 84,
        });

        notes.push({
          id: `bass_${idCounter++}`,
          pitch: fifthPitch,
          start: barStartBeat + 3.0,
          duration: 0.9,
          velocity: 74,
        });
      }
    }

    return notes;
  }

  private static generateAmbientPad(
    chords: Array<{ root: string; typeKey: string; degree: string }>,
    durationBars: number,
    beatsPerBar: number
  ): NoteEvent[] {
    const notes: NoteEvent[] = [];
    let idCounter = 1;

    for (let bar = 0; bar < durationBars; bar += 2) {
      const chord = chords[bar % chords.length];
      const pitches = getChordPitches(chord.root as any, chord.typeKey, 3, 0);

      // 2-bar sustained drone
      for (const pitch of [pitches[0], pitches[2] || pitches[0] + 7]) {
        notes.push({
          id: `pad_${idCounter++}`,
          pitch,
          start: bar * beatsPerBar,
          duration: beatsPerBar * 2 - 0.2,
          velocity: 60,
        });
      }
    }

    return notes;
  }

  private static generateChoirPads(
    chords: Array<{ root: string; typeKey: string; degree: string }>,
    durationBars: number,
    beatsPerBar: number
  ): NoteEvent[] {
    const notes: NoteEvent[] = [];
    let idCounter = 1;

    for (let bar = 0; bar < durationBars; bar++) {
      const chord = chords[bar % chords.length];
      const pitches = getChordPitches(chord.root as any, chord.typeKey, 3, 0);

      // Deep choral chord
      for (const pitch of pitches.slice(0, 3)) {
        notes.push({
          id: `choir_${idCounter++}`,
          pitch,
          start: bar * beatsPerBar,
          duration: beatsPerBar - 0.2,
          velocity: 82,
        });
      }
    }

    return notes;
  }

  private static generatePercussion(durationBars: number, beatsPerBar: number, purpose: string): NoteEvent[] {
    const notes: NoteEvent[] = [];
    let idCounter = 1;

    for (let bar = 0; bar < durationBars; bar++) {
      const barStart = bar * beatsPerBar;

      if (purpose === 'boss' || purpose === 'combat') {
        // Tribal Taiko war pattern: heavy hit on 1, rapid punch on 2&, 3, 4&
        notes.push({ id: `perc_${idCounter++}`, pitch: 36, start: barStart, duration: 0.5, velocity: 115 });
        notes.push({ id: `perc_${idCounter++}`, pitch: 38, start: barStart + 1.5, duration: 0.5, velocity: 95 });
        notes.push({ id: `perc_${idCounter++}`, pitch: 36, start: barStart + 2.0, duration: 0.5, velocity: 105 });
        notes.push({ id: `perc_${idCounter++}`, pitch: 38, start: barStart + 3.0, duration: 0.5, velocity: 90 });
        notes.push({ id: `perc_${idCounter++}`, pitch: 40, start: barStart + 3.5, duration: 0.5, velocity: 100 });
      } else {
        // Subtle ambient low pulse (heartbeat pulse every 2 bars)
        if (bar % 2 === 0) {
          notes.push({ id: `perc_${idCounter++}`, pitch: 36, start: barStart, duration: 0.8, velocity: 75 });
          notes.push({ id: `perc_${idCounter++}`, pitch: 36, start: barStart + 0.75, duration: 0.8, velocity: 65 });
        }
      }
    }

    return notes;
  }

  private static generateTitle(intent: MusicIntent): string {
    const p = intent.purpose;
    if (p === 'boss') return 'Wrath of the Orc Chieftain';
    if (p === 'combat') return 'Clash of Iron and Blood';
    if (p === 'town') return 'Warm Hearth of the Crossroads';
    if (p === 'ambient') return 'Whispers of Forgotten Stone';
    return 'Echoes in the Ashen Woods';
  }

  // --- PREDEFINED DEMOS ---

  /** Demo 1: "Dark Forest" */
  public static getDemoDarkForest(): Composition {
    return this.generateFromIntent({
      purpose: 'exploration',
      mood: ['melancholic', 'mysterious', 'ancient', 'dark fantasy'],
      genre: ['dark fantasy', 'ambient orchestral'],
      tempoRange: [72, 72],
      intensity: 30,
      durationBars: 32,
      loop: true,
      adaptive: false,
      instrumentation: ['piano_grand', 'strings_violins', 'strings_cellos', 'ambient_pad', 'percussion_taiko'],
      targetKey: 'D',
      targetScale: 'natural_minor',
      customPrompt: 'Música melancólica de fantasía oscura para explorar ruinas abandonadas en un bosque maldito.',
    }, 42891);
  }

  /** Demo 2: "Orc Boss" */
  public static getDemoOrcBoss(): Composition {
    const comp = this.generateFromIntent({
      purpose: 'boss',
      mood: ['aggressive', 'tribal', 'dark', 'relentless'],
      genre: ['dark fantasy', 'tribal orchestral'],
      tempoRange: [132, 132],
      intensity: 95,
      durationBars: 32,
      loop: true,
      adaptive: true,
      instrumentation: ['strings_contrabass', 'brass_french_horn', 'brass_trombones', 'percussion_taiko', 'percussion_timpani', 'choir_low'],
      targetKey: 'D',
      targetScale: 'phrygian',
      customPrompt: 'Tema de combate contra un jefe orco, agresivo, tribal y oscuro.',
    }, 81923);

    comp.title = 'Orc Chieftain: Blood & Ash';
    return comp;
  }

  /** Demo 3: "Eternity's Promise" - Cinematic Romantic Love Theme */
  public static getDemoRomanticTheme(): Composition {
    const beatsPerBar = 4;
    const durationBars = 32;

    const sections: Section[] = [
      { id: 'sec_1', name: 'Prelude (Intimate Whispers)', startBar: 1, barCount: 8, intensity: 25 },
      { id: 'sec_2', name: 'Theme (Heartfelt Embrace)', startBar: 9, barCount: 8, intensity: 55 },
      { id: 'sec_3', name: 'Climax (Soaring Devotion)', startBar: 17, barCount: 8, intensity: 80 },
      { id: 'sec_4', name: 'Resolution (Eternal Promise)', startBar: 25, barCount: 8, intensity: 30 },
    ];

    // Chords across the 8-bar loop cycle (G - D/F# - Em7 - Cadd9 - G/B - C - Am7 - Dsus4/D)
    // Pitches for G Major: G=55/67, D=62/74, Em=64/76, C=60/72, Am=57/69

    // Track 1: Felt Piano (Tender melody & romantic broken chords)
    const pianoNotes: NoteEvent[] = [];
    let noteId = 1;

    // Harmonic progression:
    // Bar 1 & 2: G major (G3, B3, D4, G4)
    // Bar 3 & 4: D/F# (F#3, A3, D4, F#4)
    // Bar 5 & 6: Em7 (E3, G3, B3, D4, G4)
    // Bar 7 & 8: Cadd9 (C3, G3, D4, E4)

    for (let cycle = 0; cycle < 4; cycle++) {
      const bOffset = cycle * 8;
      const isClimax = cycle === 2;
      const isOutro = cycle === 3;
      const velBase = isClimax ? 88 : isOutro ? 60 : 72;

      // Tender broken chord arpeggiation for each bar
      const chordRoots = [
        { root: 43, third: 47, fifth: 50, octave: 55, melodic: [67, 71, 74, 71] }, // G
        { root: 42, third: 45, fifth: 50, octave: 54, melodic: [66, 69, 74, 69] }, // D/F#
        { root: 40, third: 47, fifth: 52, octave: 55, melodic: [64, 67, 71, 76] }, // Em
        { root: 36, third: 43, fifth: 48, octave: 52, melodic: [64, 67, 72, 74] }, // Cadd9
        { root: 43, third: 47, fifth: 50, octave: 55, melodic: [71, 74, 79, 74] }, // G
        { root: 36, third: 43, fifth: 48, octave: 52, melodic: [72, 76, 79, 76] }, // C
        { root: 45, third: 48, fifth: 52, octave: 57, melodic: [69, 72, 76, 74] }, // Am7
        { root: 38, third: 45, fifth: 50, octave: 53, melodic: [74, 72, 71, 69] }, // Dsus4 -> D
      ];

      chordRoots.forEach((ch, barInCycle) => {
        const bar = bOffset + barInCycle;
        const bStart = bar * beatsPerBar;

        // Bass root on beat 1
        pianoNotes.push({
          id: `p_b_${noteId++}`,
          pitch: ch.root + 12,
          start: bStart,
          duration: 3.5,
          velocity: velBase - 8,
          articulation: 'sustain',
        });

        // Arpeggiated inner accompaniment
        pianoNotes.push({
          id: `p_h1_${noteId++}`,
          pitch: ch.third + 12,
          start: bStart + 1.0,
          duration: 1.8,
          velocity: velBase - 15,
          articulation: 'legato',
        });
        pianoNotes.push({
          id: `p_h2_${noteId++}`,
          pitch: ch.fifth + 12,
          start: bStart + 2.0,
          duration: 1.8,
          velocity: velBase - 14,
          articulation: 'legato',
        });
        pianoNotes.push({
          id: `p_h3_${noteId++}`,
          pitch: ch.octave + 12,
          start: bStart + 3.0,
          duration: 1.0,
          velocity: velBase - 16,
          articulation: 'legato',
        });

        // Lyrical melody line on top (Prelude, Climax & Outro)
        if (cycle === 0 || isClimax || isOutro) {
          ch.melodic.forEach((mPitch, mIdx) => {
            pianoNotes.push({
              id: `p_m_${noteId++}`,
              pitch: isClimax ? mPitch + 12 : mPitch,
              start: bStart + mIdx * 1.0,
              duration: 0.9,
              velocity: isClimax ? 92 : velBase + 4,
              articulation: 'sustain',
            });
          });
        }
      });
    }

    // Track 2: Cello Section (Expressive Singing Counter-Melody in Section 2 & 3)
    const celloNotes: NoteEvent[] = [];
    const celloLines = [
      // Section 2: Heartfelt Embrace (Bars 9-16)
      { bar: 8, pitch: 55, dur: 3.8, vel: 78, art: 'sustain' }, // G3
      { bar: 9, pitch: 54, dur: 3.8, vel: 76, art: 'legato' },  // F#3
      { bar: 10, pitch: 52, dur: 2.0, vel: 80, art: 'legato' }, // E3
      { bar: 10.5, pitch: 55, dur: 1.8, vel: 82, art: 'legato' }, // G3
      { bar: 11, pitch: 57, dur: 2.0, vel: 85, art: 'legato' }, // A3
      { bar: 11.5, pitch: 59, dur: 1.8, vel: 88, art: 'sustain' }, // B3
      { bar: 12, pitch: 60, dur: 3.8, vel: 84, art: 'legato' }, // C4
      { bar: 13, pitch: 62, dur: 3.8, vel: 86, art: 'legato' }, // D4
      { bar: 14, pitch: 64, dur: 2.0, vel: 88, art: 'legato' }, // E4
      { bar: 14.5, pitch: 62, dur: 1.8, vel: 85, art: 'legato' }, // D4
      { bar: 15, pitch: 59, dur: 3.8, vel: 82, art: 'sustain' }, // B3

      // Section 3: Climax (Bars 17-24)
      { bar: 16, pitch: 60, dur: 3.8, vel: 92, art: 'marcato' }, // C4
      { bar: 17, pitch: 62, dur: 3.8, vel: 94, art: 'legato' },  // D4
      { bar: 18, pitch: 64, dur: 2.0, vel: 96, art: 'legato' },  // E4
      { bar: 18.5, pitch: 67, dur: 1.8, vel: 98, art: 'sustain' }, // G4 (soaring high cello)
      { bar: 19, pitch: 66, dur: 3.8, vel: 92, art: 'legato' },  // F#4
      { bar: 20, pitch: 64, dur: 3.8, vel: 90, art: 'legato' },  // E4
      { bar: 21, pitch: 62, dur: 3.8, vel: 92, art: 'legato' },  // D4
      { bar: 22, pitch: 60, dur: 2.0, vel: 88, art: 'legato' },  // C4
      { bar: 22.5, pitch: 59, dur: 1.8, vel: 85, art: 'legato' }, // B3
      { bar: 23, pitch: 55, dur: 3.8, vel: 80, art: 'sustain' }, // G3
    ];

    celloLines.forEach((l) => {
      celloNotes.push({
        id: `cel_${noteId++}`,
        pitch: l.pitch,
        start: l.bar * beatsPerBar,
        duration: l.dur * beatsPerBar * 0.25,
        velocity: l.vel,
        articulation: l.art as any,
      });
    });

    // Track 3: Violin Ensemble (Lush High Legato String Pads & Emotional Swells)
    const violinNotes: NoteEvent[] = [];
    for (let bar = 8; bar < 24; bar++) {
      const bStart = bar * beatsPerBar;
      const isClimaxBar = bar >= 16 && bar < 24;
      const vel = isClimaxBar ? 88 : 72;

      // Warm orchestral string chords
      const chordsG = [
        [71, 74, 79], // G, B, D
        [69, 74, 78], // F#, A, D
        [67, 71, 76], // E, G, B
        [67, 72, 76], // C, E, G
        [71, 74, 79], // G, B, D
        [72, 76, 79], // C, E, G
        [69, 72, 76], // A, C, E
        [69, 74, 78], // A, D, F#
      ];

      const triad = chordsG[bar % 8];
      triad.forEach((p) => {
        violinNotes.push({
          id: `vln_${noteId++}`,
          pitch: p,
          start: bStart,
          duration: 3.8,
          velocity: vel,
          articulation: 'legato',
        });
      });
    }

    // Track 4: Concert Celtic Harp (Cascading Romantic Arpeggios)
    const harpNotes: NoteEvent[] = [];
    // Celtic Harp plays in bars 4-28
    for (let bar = 4; bar < 28; bar++) {
      const bStart = bar * beatsPerBar;
      const harpPatterns = [
        [55, 59, 62, 67, 71, 74, 71, 67], // G
        [54, 57, 62, 66, 69, 74, 69, 66], // D/F#
        [52, 55, 59, 64, 67, 71, 67, 64], // Em
        [48, 52, 55, 60, 64, 67, 64, 60], // C
      ];

      const pat = harpPatterns[bar % 4];
      pat.forEach((p, idx) => {
        harpNotes.push({
          id: `hrp_${noteId++}`,
          pitch: p + 12,
          start: bStart + idx * 0.5,
          duration: 1.4,
          velocity: 70 + (idx % 2 === 0 ? 8 : 0),
          articulation: 'sustain',
        });
      });
    }

    // Track 5: French Horn Section (Cinematic Golden Swells during Climax)
    const hornNotes: NoteEvent[] = [];
    for (let bar = 16; bar < 24; bar++) {
      const bStart = bar * beatsPerBar;
      const hornChords = [
        [50, 55], // D3, G3
        [50, 54], // D3, F#3
        [47, 52], // B2, E3
        [48, 55], // C3, G3
        [50, 55], // D3, G3
        [48, 52], // C3, E3
        [45, 52], // A2, E3
        [45, 50], // A2, D3
      ];
      const hornDuo = hornChords[bar % 8];
      hornDuo.forEach((p) => {
        hornNotes.push({
          id: `hrn_${noteId++}`,
          pitch: p,
          start: bStart,
          duration: 3.8,
          velocity: 82,
          articulation: 'sustain',
        });
      });
    }

    // Track 6: Orchestral Contrabass (Acoustic low end grounding)
    const bassNotes: NoteEvent[] = [];
    for (let bar = 8; bar < 25; bar++) {
      const bStart = bar * beatsPerBar;
      const roots = [31, 30, 28, 24, 31, 24, 21, 26]; // G1, F#1, E1, C1, G1, C1, A0, D1
      bassNotes.push({
        id: `bas_${noteId++}`,
        pitch: roots[bar % 8],
        start: bStart,
        duration: 3.8,
        velocity: 78,
        articulation: 'sustain',
      });
    }

    return {
      id: 'comp_romantic_eternity',
      projectId: 'proj_khimea_romantic',
      title: "Eternity's Promise (Love Theme)",
      tempo: 68,
      timeSignature: { numerator: 4, denominator: 4 },
      key: 'G',
      scale: 'major',
      durationBars,
      mode: 'loop',
      reverbPreset: 'cinematic_hall',
      sections,
      tracks: [
        {
          id: 'track_romantic_piano',
          name: 'Cinematic Felt Piano',
          instrumentId: 'felt_piano',
          role: 'melody',
          notes: pianoNotes,
          automation: [],
          volume: 0.88,
          pan: 0,
          mute: false,
          solo: false,
          color: '#38bdf8',
          icon: 'piano',
          reverbSend: 0.35,
        },
        {
          id: 'track_romantic_cello',
          name: 'Cello Section (Solo Melody)',
          instrumentId: 'cello_section',
          role: 'melody',
          notes: celloNotes,
          automation: [],
          volume: 0.86,
          pan: 0.15,
          mute: false,
          solo: false,
          color: '#a78bfa',
          icon: 'cello',
          reverbSend: 0.4,
        },
        {
          id: 'track_romantic_violins',
          name: 'Violin Ensemble (Lush Strings)',
          instrumentId: 'violin_ensemble',
          role: 'harmony',
          notes: violinNotes,
          automation: [],
          volume: 0.76,
          pan: -0.2,
          mute: false,
          solo: false,
          color: '#818cf8',
          icon: 'strings',
          reverbSend: 0.45,
        },
        {
          id: 'track_romantic_harp',
          name: 'Concert Celtic Harp',
          instrumentId: 'plucked_harp',
          role: 'harmony',
          notes: harpNotes,
          automation: [],
          volume: 0.74,
          pan: 0.25,
          mute: false,
          solo: false,
          color: '#34d399',
          icon: 'harp',
          reverbSend: 0.4,
        },
        {
          id: 'track_romantic_horns',
          name: 'French Horns (Golden Swell)',
          instrumentId: 'french_horn',
          role: 'texture',
          notes: hornNotes,
          automation: [],
          volume: 0.72,
          pan: -0.15,
          mute: false,
          solo: false,
          color: '#f59e0b',
          icon: 'brass',
          reverbSend: 0.5,
        },
        {
          id: 'track_romantic_contrabass',
          name: 'Orchestral Contrabass',
          instrumentId: 'contrabass_section',
          role: 'bass',
          notes: bassNotes,
          automation: [],
          volume: 0.78,
          pan: 0,
          mute: false,
          solo: false,
          color: '#6366f1',
          icon: 'bass',
          reverbSend: 0.25,
        },
      ],
      metadata: {
        gameTitle: 'Chronicles of Destiny',
        purpose: 'ambient',
        tags: ['romantic', 'emotional', 'love_theme', 'felt_piano', 'cello', 'harp', 'cinematic'],
        loopStartBar: 1,
        loopEndBar: 32,
        created: new Date().toISOString(),
        modified: new Date().toISOString(),
      },
    };
  }
}

