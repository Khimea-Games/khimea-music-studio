import { Composition, NoteEvent, ReverbPreset } from '../../types/music';

export interface PlaybackPosition {
  beat: number;
  bar: number;
  tick: number; // 0-15 (16th notes)
  seconds: number;
}

export type PlayheadCallback = (position: PlaybackPosition) => void;
export type StateChangeCallback = (isPlaying: boolean, isPaused: boolean) => void;

export interface AudioEngineInterface {
  init(): Promise<void>;
  preloadSampler(): Promise<void>;
  loadComposition(composition: Composition): void;
  play(): Promise<void>;
  pause(): void;
  stop(): void;
  seek(beat: number): void;
  setBpm(bpm: number): void;
  setLoop(enabled: boolean, startBar?: number, endBar?: number): void;
  setReverbPreset(preset: ReverbPreset): void;
  setMasterVolume(volume: number): void;
  setTrackVolume(trackId: string, volume: number): void;
  setTrackPan(trackId: string, pan: number): void;
  setTrackMute(trackId: string, mute: boolean): void;
  setTrackSolo(trackId: string, solo: boolean): void;
  setTrackReverbSend(trackId: string, send: number): void;
  setTrackFilterCutoff(trackId: string, cutoff: number): void;
  triggerNotePreview(instrumentId: string, pitch: number, velocity?: number, duration?: number): void;
  onPlayheadUpdate(callback: PlayheadCallback): () => void;
  onStateChange(callback: StateChangeCallback): () => void;
  renderToWavBlob(composition: Composition, stemsOnlyTrackId?: string): Promise<Blob>;
  dispose(): void;
}
