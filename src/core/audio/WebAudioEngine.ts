import { Composition, NoteEvent, ReverbPreset, Track } from '../../types/music';
import { midiToFrequency } from '../theory/scales';
import {
  AudioEngineInterface,
  PlaybackPosition,
  PlayheadCallback,
  StateChangeCallback,
} from './AudioEngineInterface';
import { globalSamplerEngine } from './SamplerEngine';

export class WebAudioEngine implements AudioEngineInterface {
  private ctx: AudioContext | null = null;
  private isInitialized = false;

  private composition: Composition | null = null;
  private isPlaying = false;
  private isPaused = false;

  private currentBeat = 0;
  private bpm = 120;
  private masterVolume = 0.85;

  private loopEnabled = true;
  private loopStartBar = 1;
  private loopEndBar = 32;
  private currentReverbPreset: ReverbPreset = 'dark_hall';

  // Master bus nodes
  private masterGain: GainNode | null = null;
  private masterCompressor: DynamicsCompressorNode | null = null;
  private reverbNode: ConvolverNode | null = null;
  private reverbGain: GainNode | null = null;

  // Track channels: trackId -> ChannelNodes
  private trackChannels = new Map<
    string,
    {
      gainNode: GainNode;
      pannerNode: StereoPannerNode;
      filterNode: BiquadFilterNode;
      reverbSendNode: GainNode;
      volume: number;
      pan: number;
      mute: boolean;
      solo: boolean;
    }
  >();

  // Scheduler state
  private schedulerTimerId: number | null = null;
  private lastScheduledBeat = 0;
  private playStartTime = 0;
  private startBeatOffset = 0;

  // Listeners
  private playheadCallbacks = new Set<PlayheadCallback>();
  private stateChangeCallbacks = new Set<StateChangeCallback>();

  public async init(): Promise<void> {
    if (this.isInitialized && this.ctx) {
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }
      return;
    }

    const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AudioCtxClass();

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    // Build Master Bus
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(this.masterVolume, this.ctx.currentTime);

    this.masterCompressor = this.ctx.createDynamicsCompressor();
    this.masterCompressor.threshold.setValueAtTime(-18, this.ctx.currentTime);
    this.masterCompressor.knee.setValueAtTime(12, this.ctx.currentTime);
    this.masterCompressor.ratio.setValueAtTime(4, this.ctx.currentTime);
    this.masterCompressor.attack.setValueAtTime(0.005, this.ctx.currentTime);
    this.masterCompressor.release.setValueAtTime(0.15, this.ctx.currentTime);

    // Create algorithmic concert hall reverb
    this.setupReverb(this.currentReverbPreset);

    // Wiring: Track -> masterGain -> masterCompressor -> destination
    this.masterGain.connect(this.masterCompressor);
    this.masterCompressor.connect(this.ctx.destination);

    // Preload multisample library
    await globalSamplerEngine.preloadInstruments(this.ctx);

    this.isInitialized = true;
  }

  public async preloadSampler(): Promise<void> {
    if (this.ctx) {
      await globalSamplerEngine.preloadInstruments(this.ctx);
    }
  }

  public setReverbPreset(preset: ReverbPreset): void {
    this.currentReverbPreset = preset;
    if (this.ctx) {
      this.setupReverb(preset);
    }
  }

  private setupReverb(preset: ReverbPreset = 'dark_hall'): void {
    if (!this.ctx || !this.masterGain) return;

    let decaySeconds = 2.8;
    let decayFactor = 0.7;
    let reverbMix = 0.4;

    switch (preset) {
      case 'cathedral':
        decaySeconds = 4.8;
        decayFactor = 0.5;
        reverbMix = 0.55;
        break;
      case 'dark_hall':
        decaySeconds = 3.4;
        decayFactor = 0.65;
        reverbMix = 0.45;
        break;
      case 'cinematic_hall':
        decaySeconds = 3.6;
        decayFactor = 0.75;
        reverbMix = 0.42;
        break;
      case 'chamber':
        decaySeconds = 1.5;
        decayFactor = 0.9;
        reverbMix = 0.3;
        break;
      case 'studio':
        decaySeconds = 0.8;
        decayFactor = 1.3;
        reverbMix = 0.2;
        break;
      case 'concert_hall':
      default:
        decaySeconds = 2.8;
        decayFactor = 0.7;
        reverbMix = 0.4;
        break;
    }

    const sampleRate = this.ctx.sampleRate;
    const length = Math.floor(sampleRate * decaySeconds);
    const impulse = this.ctx.createBuffer(2, length, sampleRate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const decay = Math.exp(-i / (sampleRate * decayFactor));
      left[i] = (Math.random() * 2 - 1) * decay;
      right[i] = (Math.random() * 2 - 1) * decay;
    }

    const convolver = this.ctx.createConvolver();
    convolver.buffer = impulse;

    if (!this.reverbGain) {
      this.reverbGain = this.ctx.createGain();
      this.reverbGain.connect(this.masterGain);
    }

    this.reverbGain.gain.setValueAtTime(reverbMix, this.ctx.currentTime);
    convolver.connect(this.reverbGain);

    this.reverbNode = convolver;
  }

  public loadComposition(comp: Composition): void {
    this.composition = comp;
    this.bpm = comp.tempo || 120;
    this.loopEnabled = comp.mode === 'loop' || (comp.metadata?.loopStartBar !== undefined);
    this.loopStartBar = comp.metadata?.loopStartBar ?? 1;
    this.loopEndBar = comp.metadata?.loopEndBar ?? comp.durationBars;

    if (this.ctx) {
      this.rebuildTrackChannels();
    }
  }

  private rebuildTrackChannels(): void {
    if (!this.ctx || !this.masterGain || !this.composition) return;

    // Disconnect old channels
    this.trackChannels.forEach((ch) => {
      ch.gainNode.disconnect();
      ch.pannerNode.disconnect();
      ch.filterNode.disconnect();
      ch.reverbSendNode.disconnect();
    });
    this.trackChannels.clear();

    for (const track of this.composition.tracks) {
      const gainNode = this.ctx.createGain();
      gainNode.gain.setValueAtTime(track.volume ?? 0.8, this.ctx.currentTime);

      const pannerNode = this.ctx.createStereoPanner();
      pannerNode.pan.setValueAtTime(track.pan ?? 0, this.ctx.currentTime);

      const filterNode = this.ctx.createBiquadFilter();
      filterNode.type = 'lowpass';
      filterNode.frequency.setValueAtTime(track.filterCutoff ?? 18000, this.ctx.currentTime);

      const reverbSendNode = this.ctx.createGain();
      reverbSendNode.gain.setValueAtTime(track.reverbSend ?? 0.25, this.ctx.currentTime);

      // Chain: Track Filter -> Gain -> Panner -> Master Gain
      filterNode.connect(gainNode);
      gainNode.connect(pannerNode);
      pannerNode.connect(this.masterGain);

      // Send to Reverb
      if (this.reverbNode) {
        gainNode.connect(reverbSendNode);
        reverbSendNode.connect(this.reverbNode);
      }

      this.trackChannels.set(track.id, {
        gainNode,
        pannerNode,
        filterNode,
        reverbSendNode,
        volume: track.volume ?? 0.8,
        pan: track.pan ?? 0,
        mute: track.mute ?? false,
        solo: track.solo ?? false,
      });
    }

    this.updateMuteSoloGains();
  }

  private updateMuteSoloGains(): void {
    if (!this.ctx) return;
    const hasSolo = Array.from(this.trackChannels.values()).some((ch) => ch.solo);

    this.trackChannels.forEach((ch) => {
      let effectiveVol = ch.volume;
      if (hasSolo) {
        effectiveVol = ch.solo ? ch.volume : 0;
      } else if (ch.mute) {
        effectiveVol = 0;
      }
      ch.gainNode.gain.setTargetAtTime(effectiveVol, this.ctx!.currentTime, 0.02);
    });
  }

  public async play(): Promise<void> {
    await this.init();
    if (!this.ctx || !this.composition) return;

    if (this.isPlaying) return;

    this.isPlaying = true;
    this.isPaused = false;
    this.notifyStateChange();

    this.rebuildTrackChannels();

    this.playStartTime = this.ctx.currentTime;
    this.startBeatOffset = this.currentBeat;
    this.lastScheduledBeat = this.currentBeat;

    this.startScheduler();
  }

  public pause(): void {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    this.isPaused = true;
    this.stopScheduler();
    this.notifyStateChange();
  }

  public stop(): void {
    this.isPlaying = false;
    this.isPaused = false;
    this.stopScheduler();
    this.currentBeat = 0;
    this.lastScheduledBeat = 0;
    this.notifyPositionUpdate();
    this.notifyStateChange();
  }

  public seek(beat: number): void {
    this.currentBeat = Math.max(0, beat);
    this.lastScheduledBeat = this.currentBeat;
    this.startBeatOffset = this.currentBeat;
    if (this.ctx) {
      this.playStartTime = this.ctx.currentTime;
    }
    this.notifyPositionUpdate();
  }

  public setBpm(newBpm: number): void {
    this.bpm = Math.max(30, Math.min(300, newBpm));
  }

  public setLoop(enabled: boolean, startBar?: number, endBar?: number): void {
    this.loopEnabled = enabled;
    if (startBar !== undefined) this.loopStartBar = startBar;
    if (endBar !== undefined) this.loopEndBar = endBar;
  }

  public setMasterVolume(vol: number): void {
    this.masterVolume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.masterVolume, this.ctx.currentTime, 0.02);
    }
  }

  public setTrackVolume(trackId: string, volume: number): void {
    const ch = this.trackChannels.get(trackId);
    if (ch) {
      ch.volume = volume;
      this.updateMuteSoloGains();
    }
  }

  public setTrackPan(trackId: string, pan: number): void {
    const ch = this.trackChannels.get(trackId);
    if (ch && this.ctx) {
      ch.pan = pan;
      ch.pannerNode.pan.setTargetAtTime(pan, this.ctx.currentTime, 0.02);
    }
  }

  public setTrackMute(trackId: string, mute: boolean): void {
    const ch = this.trackChannels.get(trackId);
    if (ch) {
      ch.mute = mute;
      this.updateMuteSoloGains();
    }
  }

  public setTrackSolo(trackId: string, solo: boolean): void {
    const ch = this.trackChannels.get(trackId);
    if (ch) {
      ch.solo = solo;
      this.updateMuteSoloGains();
    }
  }

  public setTrackReverbSend(trackId: string, send: number): void {
    const ch = this.trackChannels.get(trackId);
    if (ch && this.ctx) {
      const clamped = Math.max(0, Math.min(1, send));
      ch.reverbSendNode.gain.setTargetAtTime(clamped, this.ctx.currentTime, 0.02);
    }
  }

  public setTrackFilterCutoff(trackId: string, cutoff: number): void {
    const ch = this.trackChannels.get(trackId);
    if (ch && this.ctx) {
      const clamped = Math.max(200, Math.min(20000, cutoff));
      ch.filterNode.frequency.setTargetAtTime(clamped, this.ctx.currentTime, 0.02);
    }
  }

  private startScheduler(): void {
    this.stopScheduler();
    this.schedulerTimerId = window.setInterval(() => {
      this.scheduleLoop();
    }, 25);
  }

  private stopScheduler(): void {
    if (this.schedulerTimerId !== null) {
      clearInterval(this.schedulerTimerId);
      this.schedulerTimerId = null;
    }
  }

  private scheduleLoop(): void {
    if (!this.ctx || !this.composition || !this.isPlaying) return;

    const secondsPerBeat = 60 / this.bpm;
    const beatsPerBar = this.composition.timeSignature.numerator;
    const maxDurationBeats = this.composition.durationBars * beatsPerBar;

    const elapsed = this.ctx.currentTime - this.playStartTime;
    const nowBeat = this.startBeatOffset + elapsed / secondsPerBeat;
    this.currentBeat = nowBeat;

    // Loop bounds in beats
    const loopStartBeat = (this.loopStartBar - 1) * beatsPerBar;
    const loopEndBeat = this.loopEndBar * beatsPerBar;

    // Check if loop wrap or end of track
    if (this.loopEnabled && nowBeat >= loopEndBeat) {
      this.seek(loopStartBeat);
      return;
    } else if (!this.loopEnabled && nowBeat >= maxDurationBeats) {
      this.stop();
      return;
    }

    // Lookahead: schedule events for the next 120ms
    const lookaheadBeats = 0.12 / secondsPerBeat;
    const scheduleUntilBeat = nowBeat + lookaheadBeats;

    for (const track of this.composition.tracks) {
      const ch = this.trackChannels.get(track.id);
      if (!ch) continue;

      for (const note of track.notes) {
        if (note.start >= this.lastScheduledBeat && note.start < scheduleUntilBeat) {
          const noteTimeOffset = (note.start - nowBeat) * secondsPerBeat;
          const noteStartTime = Math.max(this.ctx.currentTime, this.ctx.currentTime + noteTimeOffset);
          const noteDurationSeconds = Math.max(0.05, note.duration * secondsPerBeat);

          this.renderNoteVoice(this.ctx, ch.filterNode, track.instrumentId, note, noteStartTime, noteDurationSeconds);
        }
      }
    }

    this.lastScheduledBeat = scheduleUntilBeat;
    this.notifyPositionUpdate();
  }

  /** Synthesize or play sampled realistic instrument voice for note */
  private renderNoteVoice(
    audioCtx: BaseAudioContext,
    destinationNode: AudioNode,
    instrumentId: string,
    note: NoteEvent,
    startTime: number,
    durationSeconds: number
  ): void {
    // Texturas de ruido (cinta, sala, vinilo): sin altura, ruido durante toda la nota.
    if (/tape_hiss|cassette_hiss|room_tone|vinyl_crackle|wind_texture|cave_drips/.test(instrumentId)) {
      this.synthTexture(audioCtx, destinationNode, instrumentId, (note.velocity ?? 64) / 127, startTime, durationSeconds);
      return;
    }
    // Platillos y gong: ruido metálico que resuena (vista previa; el render offline usa los samples de VCSL).
    if (/suspended_cymbal|crash_cymbal|tam_tam|gong/.test(instrumentId)) {
      this.synthCymbal(audioCtx, destinationNode, instrumentId, (note.velocity ?? 90) / 127, startTime);
      return;
    }
    if (/snare|military_drum/.test(instrumentId)) {
      this.synthSnare(audioCtx, destinationNode, (note.velocity ?? 90) / 127, startTime);
      return;
    }

    // 1. Query true acoustic multisample zone (velocity layer + articulation + closest root pitch)
    const sample = globalSamplerEngine.getSample(
      instrumentId,
      note.pitch,
      note.velocity,
      note.articulation
    );

    if (sample) {
      this.playSampleVoice(audioCtx, destinationNode, sample, note, startTime, durationSeconds);
      return;
    }

    // Secondary fallback
    const freq = midiToFrequency(note.pitch);
    const velNorm = (note.velocity ?? 90) / 127;

    switch (instrumentId) {
      case 'piano_grand':
      case 'felt_piano':
        this.synthPiano(audioCtx, destinationNode, freq, velNorm, startTime, durationSeconds);
        break;
      case 'strings_violins':
      case 'violin_ensemble':
      case 'bowed_psaltery':
      case 'viola_ensemble':
      case 'strings_cellos':
      case 'cello_section':
      case 'strings_contrabass':
      case 'contrabass_section':
        this.synthStrings(audioCtx, destinationNode, freq, velNorm, startTime, durationSeconds, instrumentId);
        break;
      case 'brass_french_horn':
      case 'french_horn':
      case 'brass_trombones':
      case 'trombones_tuba':
        this.synthBrass(audioCtx, destinationNode, freq, velNorm, startTime, durationSeconds, instrumentId);
        break;
      case 'choir_low':
      case 'low_male_choir':
        this.synthChoir(audioCtx, destinationNode, freq, velNorm, startTime, durationSeconds);
        break;
      case 'woodwinds_flute':
      case 'recorder':
      case 'bagpipe':
      case 'accordion':
        this.synthFlute(audioCtx, destinationNode, freq, velNorm, startTime, durationSeconds);
        break;
      case 'plucked_harp':
      case 'music_box':
      case 'celesta':
      case 'nylon_guitar':
      case 'harpsichord':
      case 'folk_harp':
      case 'psaltery':
      case 'dulcimer':
      case 'acoustic_lute':
      case 'finger_cymbals':
      case 'vibraphone':
      case 'glockenspiel':
        this.synthHarp(audioCtx, destinationNode, freq, velNorm, startTime, durationSeconds);
        break;
      case 'percussion_taiko':
      case 'frame_drum':
      case 'darbuka':
      case 'tabor':
      case 'tambourine':
      case 'shaker':
      case 'brush_kit':
      case 'taiko_war_drums':
        this.synthTaiko(audioCtx, destinationNode, velNorm, startTime);
        break;
      case 'percussion_timpani':
      case 'timpani':
        this.synthTimpani(audioCtx, destinationNode, freq, velNorm, startTime, durationSeconds);
        break;
      case 'percussion_war_snare':
        this.synthSnare(audioCtx, destinationNode, velNorm, startTime);
        break;
      case 'ambient_pad':
      case 'renaissance_organ':
      case 'dark_atmospheric_drone':
        this.synthPad(audioCtx, destinationNode, freq, velNorm, startTime, durationSeconds);
        break;
      case 'synth_lead':
        this.synthLead(audioCtx, destinationNode, freq, velNorm, startTime, durationSeconds);
        break;
      case 'bass_sub':
      default:
        this.synthSubBass(audioCtx, destinationNode, freq, velNorm, startTime, durationSeconds);
        break;
    }
  }

  private playSampleVoice(
    audioCtx: BaseAudioContext,
    destinationNode: AudioNode,
    sample: { buffer: AudioBuffer; rootPitch: number; playbackRate: number },
    note: NoteEvent,
    startTime: number,
    durationSeconds: number
  ): void {
    const source = audioCtx.createBufferSource();
    source.buffer = sample.buffer;
    source.playbackRate.setValueAtTime(sample.playbackRate, startTime);

    const gain = audioCtx.createGain();
    const velNorm = (note.velocity ?? 90) / 127;
    const isStaccato =
      note.articulation === 'staccato' ||
      note.articulation === 'pizzicato' ||
      note.articulation === 'spiccato';
    const effectiveDuration = isStaccato ? Math.min(0.65, durationSeconds) : durationSeconds;

    gain.gain.setValueAtTime(0.001, startTime);
    const attackTime = isStaccato ? 0.015 : 0.06;
    gain.gain.linearRampToValueAtTime(velNorm * 0.9, startTime + attackTime);
    gain.gain.setValueAtTime(velNorm * 0.9, startTime + Math.max(attackTime, effectiveDuration - 0.1));
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + effectiveDuration + 0.25);

    source.connect(gain);
    gain.connect(destinationNode);

    source.start(startTime);
    source.stop(startTime + effectiveDuration + 0.3);
  }

  // --- Voice Synthesizers ---

  private synthPiano(
    ctx: BaseAudioContext,
    dest: AudioNode,
    freq: number,
    vel: number,
    time: number,
    dur: number
  ): void {
    // 3 harmonic oscillators with acoustic piano hammer decay
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const osc3 = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc1.type = 'triangle';
    osc2.type = 'sine';
    osc3.type = 'sawtooth';

    osc1.frequency.setValueAtTime(freq, time);
    osc2.frequency.setValueAtTime(freq * 2, time);
    osc3.frequency.setValueAtTime(freq * 3, time);

    filter.type = 'lowpass';
    const cutoff = Math.min(12000, Math.max(1200, freq * (2 + vel * 4)));
    filter.frequency.setValueAtTime(cutoff, time);
    filter.frequency.exponentialRampToValueAtTime(Math.max(400, cutoff * 0.3), time + dur);

    // Velocity-sensitive envelope: sharp attack, natural acoustic decay
    const maxGain = 0.5 * vel;
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.exponentialRampToValueAtTime(maxGain, time + 0.005);
    gain.gain.exponentialRampToValueAtTime(maxGain * 0.5, time + Math.min(0.3, dur * 0.4));
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur + 0.15);

    osc1.connect(filter);
    osc2.connect(filter);
    osc3.connect(filter);
    filter.connect(gain);
    gain.connect(dest);

    osc1.start(time);
    osc2.start(time);
    osc3.start(time);
    osc1.stop(time + dur + 0.2);
    osc2.stop(time + dur + 0.2);
    osc3.stop(time + dur + 0.2);
  }

  private synthStrings(
    ctx: BaseAudioContext,
    dest: AudioNode,
    freq: number,
    vel: number,
    time: number,
    dur: number,
    type: string
  ): void {
    // Detuned sawtooth ensemble + warm lowpass filter + slow attack
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const subOsc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc1.type = 'sawtooth';
    osc2.type = 'sawtooth';
    subOsc.type = 'triangle';

    const detuneCents = type === 'strings_contrabass' ? 4 : 8;
    osc1.frequency.setValueAtTime(freq, time);
    osc1.detune.setValueAtTime(-detuneCents, time);

    osc2.frequency.setValueAtTime(freq, time);
    osc2.detune.setValueAtTime(detuneCents, time);

    subOsc.frequency.setValueAtTime(freq * 0.5, time);

    filter.type = 'lowpass';
    const filterCutoff = type === 'strings_contrabass' ? 800 : type === 'strings_cellos' ? 1800 : 3500;
    filter.frequency.setValueAtTime(filterCutoff, time);

    // Attack envelope: expressive swelling strings
    const attackTime = type === 'strings_contrabass' ? 0.08 : 0.18;
    const releaseTime = 0.25;
    const maxGain = 0.35 * vel;

    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(maxGain, time + attackTime);
    gain.gain.setValueAtTime(maxGain, time + Math.max(attackTime, dur - 0.05));
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur + releaseTime);

    osc1.connect(filter);
    osc2.connect(filter);
    subOsc.connect(filter);
    filter.connect(gain);
    gain.connect(dest);

    osc1.start(time);
    osc2.start(time);
    subOsc.start(time);
    osc1.stop(time + dur + releaseTime + 0.05);
    osc2.stop(time + dur + releaseTime + 0.05);
    subOsc.stop(time + dur + releaseTime + 0.05);
  }

  private synthBrass(
    ctx: BaseAudioContext,
    dest: AudioNode,
    freq: number,
    vel: number,
    time: number,
    dur: number,
    type: string
  ): void {
    // Sawtooth + resonant lowpass brass formant sweep
    const osc = ctx.createOscillator();
    const oscDetuned = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    oscDetuned.type = 'sawtooth';

    osc.frequency.setValueAtTime(freq, time);
    oscDetuned.frequency.setValueAtTime(freq, time);
    oscDetuned.detune.setValueAtTime(5, time);

    filter.type = 'lowpass';
    filter.Q.setValueAtTime(3.5, time); // Resonant horn bite

    const startFilter = type === 'brass_trombones' ? 400 : 700;
    const peakFilter = (type === 'brass_trombones' ? 3800 : 2800) * (0.5 + vel * 0.6);
    filter.frequency.setValueAtTime(startFilter, time);
    filter.frequency.exponentialRampToValueAtTime(peakFilter, time + 0.08); // Brass "blat" attack
    filter.frequency.exponentialRampToValueAtTime(peakFilter * 0.6, time + dur);

    const maxGain = 0.32 * vel;
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(maxGain, time + 0.05);
    gain.gain.setValueAtTime(maxGain * 0.85, time + dur * 0.8);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur + 0.2);

    osc.connect(filter);
    oscDetuned.connect(filter);
    filter.connect(gain);
    gain.connect(dest);

    osc.start(time);
    oscDetuned.start(time);
    osc.stop(time + dur + 0.25);
    oscDetuned.stop(time + dur + 0.25);
  }

  private synthChoir(
    ctx: BaseAudioContext,
    dest: AudioNode,
    freq: number,
    vel: number,
    time: number,
    dur: number
  ): void {
    // Male low choir: vocal formant bandpass filters (Ooh / Aah)
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const formantFilter1 = ctx.createBiquadFilter();
    const formantFilter2 = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc1.type = 'sawtooth';
    osc2.type = 'triangle';
    osc1.frequency.setValueAtTime(freq, time);
    osc2.frequency.setValueAtTime(freq, time);
    osc2.detune.setValueAtTime(6, time);

    // Formants for deep "Ooh/Aah"
    formantFilter1.type = 'bandpass';
    formantFilter1.frequency.setValueAtTime(450, time);
    formantFilter1.Q.setValueAtTime(4.0, time);

    formantFilter2.type = 'bandpass';
    formantFilter2.frequency.setValueAtTime(800, time);
    formantFilter2.Q.setValueAtTime(4.0, time);

    const maxGain = 0.38 * vel;
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(maxGain, time + 0.22); // Majestic choral swell
    gain.gain.setValueAtTime(maxGain, time + Math.max(0.22, dur - 0.1));
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur + 0.4);

    osc1.connect(formantFilter1);
    osc2.connect(formantFilter1);
    osc1.connect(formantFilter2);
    osc2.connect(formantFilter2);

    formantFilter1.connect(gain);
    formantFilter2.connect(gain);
    gain.connect(dest);

    osc1.start(time);
    osc2.start(time);
    osc1.stop(time + dur + 0.45);
    osc2.stop(time + dur + 0.45);
  }

  private synthFlute(
    ctx: BaseAudioContext,
    dest: AudioNode,
    freq: number,
    vel: number,
    time: number,
    dur: number
  ): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, time);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq * 3, time);

    const maxGain = 0.35 * vel;
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(maxGain, time + 0.08); // Breathy flute attack
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur + 0.15);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(dest);

    osc.start(time);
    osc.stop(time + dur + 0.2);
  }

  private synthHarp(
    ctx: BaseAudioContext,
    dest: AudioNode,
    freq: number,
    vel: number,
    time: number,
    dur: number
  ): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, time);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(10000, freq * 5), time);
    filter.frequency.exponentialRampToValueAtTime(freq * 1.5, time + dur);

    const maxGain = 0.4 * vel;
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.exponentialRampToValueAtTime(maxGain, time + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur + 0.25);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(dest);

    osc.start(time);
    osc.stop(time + dur + 0.3);
  }

  private synthTaiko(ctx: BaseAudioContext, dest: AudioNode, vel: number, time: number): void {
    // Pitch-drop sub impact + resonant drum body
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, time);
    osc.frequency.exponentialRampToValueAtTime(45, time + 0.18); // Heavy booming thud

    const maxGain = 0.7 * vel;
    gain.gain.setValueAtTime(maxGain, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.6);

    osc.connect(gain);
    gain.connect(dest);

    osc.start(time);
    osc.stop(time + 0.65);
  }

  private synthTimpani(
    ctx: BaseAudioContext,
    dest: AudioNode,
    freq: number,
    vel: number,
    time: number,
    dur: number
  ): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq * 1.4, time);
    osc.frequency.exponentialRampToValueAtTime(freq, time + 0.06);

    const maxGain = 0.6 * vel;
    gain.gain.setValueAtTime(maxGain, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + Math.min(1.2, dur + 0.4));

    osc.connect(gain);
    gain.connect(dest);

    osc.start(time);
    osc.stop(time + Math.min(1.3, dur + 0.45));
  }

  /** Vista previa de las texturas: ruido filtrado muy bajo con fundidos de 0,4 s (el render offline es el definitivo). */
  private synthTexture(ctx: BaseAudioContext, dest: AudioNode, id: string, vel: number, time: number, dur: number): void {
    const fade = 0.4;
    const length = Math.max(1, Math.ceil((dur + fade) * ctx.sampleRate));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    const crackle = id.includes('vinyl_crackle');
    let brown = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      if (id.includes('room_tone')) {
        brown = (brown + 0.02 * white) / 1.02;
        data[i] = brown * 3.5;
      } else {
        data[i] = white * (crackle ? 0.35 : 1);
        if (crackle && Math.random() < 7 / ctx.sampleRate) data[i] += (Math.random() * 2 - 1) * 2.5;
      }
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    if (id.includes('room_tone')) {
      filter.type = 'lowpass';
      filter.frequency.value = 700;
    } else {
      filter.type = 'bandpass';
      filter.frequency.value = id.includes('cassette') ? 3000 : crackle ? 2500 : 5000;
      filter.Q.value = 0.5;
    }
    const gain = ctx.createGain();
    const level = 0.03 * vel;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(level, time + fade);
    gain.gain.setValueAtTime(level, time + Math.max(fade, dur));
    gain.gain.linearRampToValueAtTime(0, time + Math.max(fade, dur) + fade);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    source.start(time);
    source.stop(time + dur + fade + 0.05);
  }

  private synthCymbal(ctx: BaseAudioContext, dest: AudioNode, id: string, vel: number, time: number): void {
    const gong = /tam_tam|gong/.test(id);
    const decay = gong ? 6 : 3;
    const length = Math.ceil(decay * ctx.sampleRate);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = gong ? 'bandpass' : 'highpass';
    filter.frequency.value = gong ? 400 : 5000;
    filter.Q.value = gong ? 2 : 0.7;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.25 * vel, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + decay);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    source.start(time);
    source.stop(time + decay);
  }

  private synthSnare(ctx: BaseAudioContext, dest: AudioNode, vel: number, time: number): void {
    // Filtered noise transient + 180Hz membrane hit
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180, time);
    osc.frequency.exponentialRampToValueAtTime(70, time + 0.06);

    oscGain.gain.setValueAtTime(0.4 * vel, time);
    oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);

    osc.connect(oscGain);
    oscGain.connect(dest);

    osc.start(time);
    osc.stop(time + 0.15);
  }

  private synthPad(
    ctx: BaseAudioContext,
    dest: AudioNode,
    freq: number,
    vel: number,
    time: number,
    dur: number
  ): void {
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc1.type = 'sawtooth';
    osc2.type = 'triangle';

    osc1.frequency.setValueAtTime(freq, time);
    osc1.detune.setValueAtTime(-7, time);
    osc2.frequency.setValueAtTime(freq, time);
    osc2.detune.setValueAtTime(7, time);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, time);
    filter.frequency.linearRampToValueAtTime(1800, time + dur * 0.5);

    const maxGain = 0.3 * vel;
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(maxGain, time + 0.35); // Slow atmospheric bloom
    gain.gain.setValueAtTime(maxGain, time + Math.max(0.35, dur - 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur + 0.6);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(dest);

    osc1.start(time);
    osc2.start(time);
    osc1.stop(time + dur + 0.65);
    osc2.stop(time + dur + 0.65);
  }

  private synthLead(
    ctx: BaseAudioContext,
    dest: AudioNode,
    freq: number,
    vel: number,
    time: number,
    dur: number
  ): void {
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, time);

    filter.type = 'lowpass';
    filter.Q.setValueAtTime(6.0, time);
    filter.frequency.setValueAtTime(freq * 2, time);
    filter.frequency.exponentialRampToValueAtTime(freq * 8, time + 0.04);
    filter.frequency.exponentialRampToValueAtTime(freq * 2, time + dur);

    const maxGain = 0.35 * vel;
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.exponentialRampToValueAtTime(maxGain, time + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur + 0.1);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(dest);

    osc.start(time);
    osc.stop(time + dur + 0.15);
  }

  private synthSubBass(
    ctx: BaseAudioContext,
    dest: AudioNode,
    freq: number,
    vel: number,
    time: number,
    dur: number
  ): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, time);

    const maxGain = 0.5 * vel;
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(maxGain, time + 0.03);
    gain.gain.setValueAtTime(maxGain, time + Math.max(0.03, dur - 0.05));
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur + 0.15);

    osc.connect(gain);
    gain.connect(dest);

    osc.start(time);
    osc.stop(time + dur + 0.2);
  }

  /** Trigger interactive note preview (e.g. from clicking Piano Roll keyboard) */
  public triggerNotePreview(
    instrumentId: string,
    pitch: number,
    velocity = 95,
    duration = 0.6
  ): void {
    if (!this.ctx || !this.masterGain) {
      this.init().then(() => this.triggerNotePreview(instrumentId, pitch, velocity, duration));
      return;
    }

    const note: NoteEvent = {
      id: 'preview',
      pitch,
      start: 0,
      duration: 1,
      velocity,
    };

    this.renderNoteVoice(this.ctx, this.masterGain, instrumentId, note, this.ctx.currentTime, duration);
  }

  // --- Render Offline WAV ---

  public async renderToWavBlob(
    comp: Composition,
    stemsOnlyTrackId?: string
  ): Promise<Blob> {
    const sampleRate = 44100;
    const bpm = comp.tempo || 120;
    const secondsPerBeat = 60 / bpm;
    const beatsPerBar = comp.timeSignature.numerator;
    const totalDurationSeconds = comp.durationBars * beatsPerBar * secondsPerBeat + 2.0; // +2s tail for reverb

    const OfflineCtxClass =
      window.OfflineAudioContext ||
      (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;

    const offlineCtx = new OfflineCtxClass(
      2,
      Math.ceil(sampleRate * totalDurationSeconds),
      sampleRate
    );

    // Preload multisample instruments for offline render context
    await globalSamplerEngine.preloadInstruments(offlineCtx);

    // Build Master Compressor in offline context
    const masterGain = offlineCtx.createGain();
    masterGain.gain.setValueAtTime(0.85, 0);

    const compressor = offlineCtx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-14, 0);
    compressor.ratio.setValueAtTime(4, 0);

    masterGain.connect(compressor);
    compressor.connect(offlineCtx.destination);

    // Filter tracks
    const tracksToRender = stemsOnlyTrackId
      ? comp.tracks.filter((t) => t.id === stemsOnlyTrackId)
      : comp.tracks.filter((t) => !t.mute);

    for (const track of tracksToRender) {
      const trackGain = offlineCtx.createGain();
      trackGain.gain.setValueAtTime(track.volume ?? 0.8, 0);

      const panner = offlineCtx.createStereoPanner();
      panner.pan.setValueAtTime(track.pan ?? 0, 0);

      trackGain.connect(panner);
      panner.connect(masterGain);

      for (const note of track.notes) {
        const noteStartTime = note.start * secondsPerBeat;
        const noteDurationSeconds = Math.max(0.05, note.duration * secondsPerBeat);

        this.renderNoteVoice(
          offlineCtx,
          trackGain,
          track.instrumentId,
          note,
          noteStartTime,
          noteDurationSeconds
        );
      }
    }

    const renderedBuffer = await offlineCtx.startRendering();
    return this.audioBufferToWavBlob(renderedBuffer);
  }

  /** Convert Web Audio AudioBuffer to standard PCM 16-bit stereo WAV Blob */
  private audioBufferToWavBlob(buffer: AudioBuffer): Blob {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;

    const length = buffer.length * blockAlign;
    const arrayBuffer = new ArrayBuffer(44 + length);
    const view = new DataView(arrayBuffer);

    // RIFF chunk descriptor
    this.writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + length, true);
    this.writeString(view, 8, 'WAVE');

    // fmt sub-chunk
    this.writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // Subchunk1Size
    view.setUint16(20, format, true); // AudioFormat
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true); // ByteRate
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);

    // data sub-chunk
    this.writeString(view, 36, 'data');
    view.setUint32(40, length, true);

    // Interleave left and right channel PCM samples
    const channels: Float32Array[] = [];
    for (let i = 0; i < numChannels; i++) {
      channels.push(buffer.getChannelData(i));
    }

    let offset = 44;
    for (let i = 0; i < buffer.length; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        // Clamp and convert float [-1.0, 1.0] to 16-bit integer [-32768, 32767]
        const sample = Math.max(-1, Math.min(1, channels[ch][i]));
        const intSample = sample < 0 ? sample * 32768 : sample * 32767;
        view.setInt16(offset, intSample, true);
        offset += 2;
      }
    }

    return new Blob([arrayBuffer], { type: 'audio/wav' });
  }

  private writeString(view: DataView, offset: number, string: string): void {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  // --- Listeners & Helpers ---

  public onPlayheadUpdate(callback: PlayheadCallback): () => void {
    this.playheadCallbacks.add(callback);
    return () => this.playheadCallbacks.delete(callback);
  }

  public onStateChange(callback: StateChangeCallback): () => void {
    this.stateChangeCallbacks.add(callback);
    return () => this.stateChangeCallbacks.delete(callback);
  }

  private notifyPositionUpdate(): void {
    if (!this.composition) return;
    const beatsPerBar = this.composition.timeSignature.numerator;
    const bar = Math.floor(this.currentBeat / beatsPerBar) + 1;
    const tick = Math.floor((this.currentBeat % 1) * 16);
    const seconds = this.currentBeat * (60 / this.bpm);

    const pos: PlaybackPosition = {
      beat: Number(this.currentBeat.toFixed(2)),
      bar,
      tick,
      seconds: Number(seconds.toFixed(2)),
    };

    this.playheadCallbacks.forEach((cb) => cb(pos));
  }

  private notifyStateChange(): void {
    this.stateChangeCallbacks.forEach((cb) => cb(this.isPlaying, this.isPaused));
  }

  public dispose(): void {
    this.stop();
    if (this.ctx && this.ctx.state !== 'closed') {
      this.ctx.close();
    }
    this.trackChannels.clear();
    this.playheadCallbacks.clear();
    this.stateChangeCallbacks.clear();
  }
}

// Global audio engine singleton
export const globalAudioEngine = new WebAudioEngine();
