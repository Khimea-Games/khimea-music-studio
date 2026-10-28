export type NoteArticulation =
  | 'normal'
  | 'sustain'
  | 'legato'
  | 'staccato'
  | 'spiccato'
  | 'pizzicato'
  | 'tremolo'
  | 'marcato'
  | 'accent';

export type ReverbPreset =
  | 'concert_hall'
  | 'cathedral'
  | 'dark_hall'
  | 'cinematic_hall'
  | 'chamber'
  | 'studio';

export interface SampleZone {
  id: string;
  rootPitch: number; // Root MIDI note number
  minPitch: number;
  maxPitch: number;
  minVelocity: number; // 0 to 127
  maxVelocity: number;
  articulation: NoteArticulation;
  sourceUrl?: string;
  sampleBuffer?: AudioBuffer;
}

export interface SoundLibraryPackage {
  id: string;
  name: string;
  category:
    | 'orchestral'
    | 'dark_fantasy'
    | 'medieval'
    | 'horror'
    | 'cinematic_percussion'
    | 'choir'
    | 'ambient'
    | 'electronic';
  version: string;
  instrumentsCount: number;
  totalSamples: number;
  license: string;
  commercialUse: boolean;
  attributionRequired: boolean;
  author: string;
  provenance: string;
  instruments: string[];
  articulations: NoteArticulation[];
  description: string;
  installed: boolean;
}

export interface NoteEvent {
  id: string;
  pitch: number; // MIDI note number 0-127 (e.g. 60 = Middle C, C4)
  start: number; // Start time in beats (0 = bar 1 beat 1)
  duration: number; // Duration in beats (1 = quarter note, 0.5 = eighth note, 4 = whole note)
  velocity: number; // 0-127
  articulation?: NoteArticulation;
}

export type TrackRole =
  | 'melody'
  | 'harmony'
  | 'bass'
  | 'rhythm'
  | 'percussion'
  | 'texture'
  | 'fx';

export interface AutomationPoint {
  time: number; // In beats
  value: number; // Normalized 0-1 or parameter specific
}

export interface AutomationLane {
  id: string;
  parameter: 'volume' | 'pan' | 'filterCutoff' | 'reverbSend';
  points: AutomationPoint[];
}

export interface Track {
  id: string;
  name: string;
  instrumentId: string;
  role: TrackRole;
  notes: NoteEvent[];
  automation: AutomationLane[];
  volume: number; // 0.0 to 1.0 (default ~0.8)
  pan: number; // -1.0 (left) to +1.0 (right)
  mute: boolean;
  solo: boolean;
  color?: string;
  icon?: string;
  reverbSend?: number; // 0.0 to 1.0
  filterCutoff?: number; // 200Hz to 18000Hz
}

export type SectionType =
  | 'INTRO'
  | 'EXPLORATION_A'
  | 'EXPLORATION_B'
  | 'BUILDUP'
  | 'COMBAT'
  | 'CLIMAX'
  | 'RESOLUTION'
  | 'OUTRO'
  | 'CUSTOM';

export interface Section {
  id: string;
  name: SectionType | string;
  startBar: number; // 1-indexed bar number
  barCount: number; // Number of bars in section
  intensity: number; // 0 to 100
  tempoMultiplier?: number; // Default 1.0
  activeLayers?: string[]; // Track IDs active in this section
}

export interface TimeSignature {
  numerator: number;
  denominator: number;
}

export interface CompositionMetadata {
  author?: string;
  gameTitle?: string;
  genre?: string[];
  mood?: string[];
  purpose?: string;
  seed?: number;
  created: string;
  modified: string;
  loopStartBar?: number;
  loopEndBar?: number;
  adaptiveParameters?: AdaptiveRule[];
  tags?: string[];
}

export type GameAudioMode = 'linear' | 'loop' | 'layered' | 'adaptive';

export interface AdaptiveRule {
  id: string;
  parameter: 'combatIntensity' | 'playerHealth' | 'alertLevel' | string;
  threshold: number;
  operator: '>' | '<' | '>=' | '<=';
  action: 'enable_track' | 'mute_track' | 'set_volume';
  targetTrackId: string;
  value?: number;
}

export interface Composition {
  id: string;
  projectId: string;
  title: string;
  tempo: number; // BPM (30 to 280)
  timeSignature: TimeSignature;
  key: string; // e.g. "D", "C#", "F"
  scale: string; // e.g. "minor", "dorian", "major", "phrygian", "harmonic_minor"
  durationBars: number; // e.g. 16, 32, 64 bars
  mode: GameAudioMode;
  reverbPreset?: ReverbPreset;
  sections: Section[];
  tracks: Track[];
  metadata: CompositionMetadata;
}

export interface MusicIntent {
  purpose:
    | 'exploration'
    | 'combat'
    | 'boss'
    | 'menu'
    | 'town'
    | 'dialogue'
    | 'cinematic'
    | 'victory'
    | 'defeat'
    | 'ambient';
  mood: string[];
  genre: string[];
  tempoRange: [number, number];
  intensity: number; // 0 to 100
  durationBars: number;
  loop: boolean;
  adaptive: boolean;
  instrumentation: string[];
  references?: string[];
  customPrompt?: string;
  targetKey?: string;
  targetScale?: string;
}

export interface InstrumentLicense {
  license: string;
  commercialUse: boolean;
  attributionRequired: boolean;
  source: string;
}

export type InstrumentFamily =
  | 'strings'
  | 'brass'
  | 'woodwinds'
  | 'percussion'
  | 'piano'
  | 'choir'
  | 'synth'
  | 'bass'
  | 'guitar'
  | 'ethnic'
  | 'medieval'
  | 'tribal'
  | 'ambient'
  | 'electronic'
  | 'horror'
  | 'sound_design';

export interface InstrumentDefinition {
  id: string;
  name: string;
  family: InstrumentFamily;
  type: 'synth' | 'soundfont' | 'sample' | 'hybrid';
  source?: string;
  preset?: number | string;
  tags: string[];
  license: InstrumentLicense;
  polyphony: number;
  recommendedRange: [number, number]; // [minPitch, maxPitch] in MIDI note numbers
  description: string;
  color: string;
}

export interface Motif {
  id: string;
  projectId: string;
  name: string;
  notes: number[]; // Relative scale degree or MIDI note offsets
  rhythm: number[]; // Duration of each note in beats
  entityTag: string; // Character, City, Faction, Event
  description?: string;
}

export interface SoundPalette {
  id: string;
  name: string;
  primary: string[]; // Instrument IDs
  secondary: string[];
  percussion: string[];
  textures: string[];
}

export interface GameSoundtrackProject {
  id: string;
  name: string;
  description: string;
  genre: string;
  mood: string;
  mainMotifNotes?: number[];
  mainInstruments?: string[];
  soundPalettes: SoundPalette[];
  motifs: Motif[];
  compositionIds: string[];
  created: string;
  modified: string;
}

export type CommandType =
  | 'CHANGE_TEMPO'
  | 'CHANGE_KEY'
  | 'CHANGE_SCALE'
  | 'CHANGE_DURATION'
  | 'ADD_TRACK'
  | 'REMOVE_TRACK'
  | 'UPDATE_TRACK'
  | 'SET_TRACK_VOLUME'
  | 'SET_TRACK_PAN'
  | 'SET_TRACK_MUTE'
  | 'SET_TRACK_SOLO'
  | 'SET_INSTRUMENT'
  | 'ADD_NOTE'
  | 'UPDATE_NOTE'
  | 'DELETE_NOTE'
  | 'BATCH_ADD_NOTES'
  | 'TRANSPOSE_TRACK'
  | 'TRANSPOSE_ALL'
  | 'HUMANIZE_TRACK'
  | 'QUANTIZE_TRACK'
  | 'SET_SECTIONS'
  | 'UPDATE_SECTION'
  | 'APPLY_COMPOSITION_DIFF';

export interface CompositionCommand {
  id: string;
  type: CommandType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any;
  timestamp: number;
  description: string;
}

export interface CompositionVersion {
  id: string;
  compositionId: string;
  versionNumber: number;
  title: string;
  description: string;
  timestamp: string;
  snapshot: Composition;
}

export interface ValidationMessage {
  id: string;
  type: 'warning' | 'error' | 'info';
  category: 'harmony' | 'rhythm' | 'range' | 'loop' | 'sustain';
  message: string;
  trackId?: string;
  noteId?: string;
  bar?: number;
}

export interface PlaybackPosition {
  beat: number;
  bar: number;
  tick: number; // 0-15 (16th notes)
  seconds: number;
}

export interface AudioEngineState {
  isPlaying: boolean;
  isPaused: boolean;
  currentBeat: number;
  currentBar: number;
  currentTick: number; // 0 to 15 within a bar
  tempo: number;
  loopEnabled: boolean;
  loopStartBar: number;
  loopEndBar: number;
  metronomeEnabled: boolean;
  masterVolume: number;
}
