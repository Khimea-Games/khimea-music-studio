import { NoteArticulation, SampleZone } from '../../types/music';
import { midiToFrequency } from '../theory/scales';

export interface SamplerInstrument {
  id: string;
  name: string;
  family: string;
  rootPitches: number[];
  articulations: NoteArticulation[];
  zones: Map<string, AudioBuffer>; // key: `${pitch}_${articulation}_${velocityLayer}`
}

/**
 * High-Performance Cinematic Sampler Engine.
 * Manages multisampled acoustic instruments with velocity layers,
 * articulations, and nearest-root-zone pitch transposition.
 */
export class SamplerEngine {
  private static instance: SamplerEngine;
  private audioCtx: BaseAudioContext | null = null;
  private instruments = new Map<string, SamplerInstrument>();
  private isPreloaded = false;

  public static getInstance(): SamplerEngine {
    if (!SamplerEngine.instance) {
      SamplerEngine.instance = new SamplerEngine();
    }
    return SamplerEngine.instance;
  }

  public setAudioContext(ctx: BaseAudioContext): void {
    this.audioCtx = ctx;
  }

  /**
   * Bake and preload multisampled acoustic PCM buffers for all 10 core instruments.
   */
  public async preloadInstruments(ctx: BaseAudioContext): Promise<void> {
    if (this.isPreloaded && this.instruments.size > 0) return;
    this.audioCtx = ctx;

    const sampleRate = ctx.sampleRate || 44100;

    // 1. Felt Piano (C2, G2, C3, E3, G3, C4, E4, G4, C5, C6)
    await this.registerInstrument(ctx, {
      id: 'felt_piano',
      name: 'Cinematic Felt Piano',
      family: 'piano',
      rootPitches: [36, 43, 48, 52, 55, 60, 64, 67, 72, 84],
      articulations: ['sustain', 'staccato'],
      renderSample: (pitch, art, velLayer) =>
        this.renderFeltPianoSample(sampleRate, pitch, art, velLayer),
    });

    // 2. Violin Ensemble (G3, D4, A4, E5, A5, E6)
    await this.registerInstrument(ctx, {
      id: 'violin_ensemble',
      name: 'Violin Ensemble',
      family: 'strings',
      rootPitches: [55, 62, 69, 76, 81, 88],
      articulations: ['sustain', 'staccato', 'tremolo'],
      renderSample: (pitch, art, velLayer) =>
        this.renderStringsSample(sampleRate, pitch, art, velLayer, 'violin'),
    });

    // 3. Viola Ensemble (C3, G3, D4, A4, D5)
    await this.registerInstrument(ctx, {
      id: 'viola_ensemble',
      name: 'Viola Ensemble',
      family: 'strings',
      rootPitches: [48, 55, 62, 69, 74],
      articulations: ['sustain', 'staccato'],
      renderSample: (pitch, art, velLayer) =>
        this.renderStringsSample(sampleRate, pitch, art, velLayer, 'viola'),
    });

    // 4. Cello Section (C2, G2, D3, A3, E4, A4)
    await this.registerInstrument(ctx, {
      id: 'cello_section',
      name: 'Cello Section',
      family: 'strings',
      rootPitches: [36, 43, 50, 57, 64, 69],
      articulations: ['sustain', 'staccato', 'pizzicato'],
      renderSample: (pitch, art, velLayer) =>
        this.renderCelloSample(sampleRate, pitch, art, velLayer),
    });

    // 5. Orchestral Contrabass (C1, G1, C2, E2, G2, C3)
    await this.registerInstrument(ctx, {
      id: 'contrabass_section',
      name: 'Orchestral Contrabass',
      family: 'bass',
      rootPitches: [24, 31, 36, 40, 43, 48],
      articulations: ['sustain', 'staccato', 'marcato'],
      renderSample: (pitch, art, velLayer) =>
        this.renderContrabassSample(sampleRate, pitch, art, velLayer),
    });

    // 6. French Horn Section (F2, C3, F3, A3, C4, F4)
    await this.registerInstrument(ctx, {
      id: 'french_horn',
      name: 'French Horn Section',
      family: 'brass',
      rootPitches: [41, 48, 53, 57, 60, 65],
      articulations: ['sustain', 'staccato', 'marcato'],
      renderSample: (pitch, art, velLayer) =>
        this.renderBrassSample(sampleRate, pitch, art, velLayer, 'horn'),
    });

    // 7. Trombone & Tuba Section (C2, F2, C3, F3, Bb3)
    await this.registerInstrument(ctx, {
      id: 'trombones_tuba',
      name: 'Trombone & Tuba Section',
      family: 'brass',
      rootPitches: [36, 41, 48, 53, 58],
      articulations: ['sustain', 'staccato', 'marcato'],
      renderSample: (pitch, art, velLayer) =>
        this.renderBrassSample(sampleRate, pitch, art, velLayer, 'trombone'),
    });

    // 8. Low Male Choir (C2, F2, A2, C3, E3, G3, C4)
    await this.registerInstrument(ctx, {
      id: 'low_male_choir',
      name: 'Low Male Choir',
      family: 'choir',
      rootPitches: [36, 41, 45, 48, 52, 55, 60],
      articulations: ['sustain'],
      renderSample: (pitch, art, velLayer) =>
        this.renderChoirSample(sampleRate, pitch, art, velLayer),
    });

    // 9. Orchestral Timpani (D2, F2, A2, C3, D3)
    await this.registerInstrument(ctx, {
      id: 'timpani',
      name: 'Orchestral Timpani',
      family: 'percussion',
      rootPitches: [38, 41, 45, 48, 50],
      articulations: ['normal', 'staccato'],
      renderSample: (pitch, art, velLayer) =>
        this.renderTimpaniSample(sampleRate, pitch, art, velLayer),
    });

    // 10. Taiko War Drums (36, 38, 40, 43)
    await this.registerInstrument(ctx, {
      id: 'taiko_war_drums',
      name: 'Cinematic Taiko War Drums',
      family: 'percussion',
      rootPitches: [36, 38, 40, 43],
      articulations: ['normal', 'accent'],
      renderSample: (pitch, art, velLayer) =>
        this.renderTaikoSample(sampleRate, pitch, art, velLayer),
    });

    // 11. Dark Atmospheric Drone (C2, D2, G2, C3)
    await this.registerInstrument(ctx, {
      id: 'dark_atmospheric_drone',
      name: 'Dark Atmospheric Drone',
      family: 'ambient',
      rootPitches: [36, 38, 43, 48],
      articulations: ['sustain'],
      renderSample: (pitch, art, velLayer) =>
        this.renderDroneSample(sampleRate, pitch, art, velLayer),
    });

    // 12. Concert Grand Piano (C2, G2, C3, E3, G3, C4, E4, G4, C5, C6)
    await this.registerInstrument(ctx, {
      id: 'grand_piano',
      name: 'Concert Grand Piano',
      family: 'piano',
      rootPitches: [36, 43, 48, 52, 55, 60, 64, 67, 72, 84],
      articulations: ['sustain', 'staccato'],
      renderSample: (pitch, art, velLayer) =>
        this.renderGrandPianoSample(sampleRate, pitch, art, velLayer),
    });

    // 13. Concert Wooden Flute (C4, E4, G4, C5, E5, G5, C6)
    await this.registerInstrument(ctx, {
      id: 'woodwinds_flute',
      name: 'Concert Wooden Flute',
      family: 'woodwinds',
      rootPitches: [60, 64, 67, 72, 76, 79, 84],
      articulations: ['sustain', 'staccato'],
      renderSample: (pitch, art, velLayer) =>
        this.renderFluteSample(sampleRate, pitch, art, velLayer),
    });

    // 14. Concert Celtic Harp (C2, G2, C3, G3, C4, G4, C5, C6)
    await this.registerInstrument(ctx, {
      id: 'plucked_harp',
      name: 'Concert Celtic Harp',
      family: 'medieval',
      rootPitches: [36, 43, 48, 55, 60, 67, 72, 84],
      articulations: ['sustain', 'staccato'],
      renderSample: (pitch, art, velLayer) =>
        this.renderHarpSample(sampleRate, pitch, art, velLayer),
    });

    // 15. Cinematic Bass Drum & Hits (C1, D1, E1)
    await this.registerInstrument(ctx, {
      id: 'bass_drum_impacts',
      name: 'Cinematic Bass Drum & Hits',
      family: 'percussion',
      rootPitches: [24, 26, 28],
      articulations: ['normal', 'accent'],
      renderSample: (pitch, art, velLayer) =>
        this.renderBassDrumSample(sampleRate, pitch, art, velLayer),
    });

    this.isPreloaded = true;
  }

  private async registerInstrument(
    ctx: BaseAudioContext,
    spec: {
      id: string;
      name: string;
      family: string;
      rootPitches: number[];
      articulations: NoteArticulation[];
      renderSample: (
        pitch: number,
        art: NoteArticulation,
        velLayer: 'soft' | 'medium' | 'hard'
      ) => AudioBuffer;
    }
  ): Promise<void> {
    const zones = new Map<string, AudioBuffer>();
    const velLayers: Array<'soft' | 'medium' | 'hard'> = ['soft', 'medium', 'hard'];

    for (const pitch of spec.rootPitches) {
      for (const art of spec.articulations) {
        for (const vel of velLayers) {
          const buffer = spec.renderSample(pitch, art, vel);
          zones.set(`${pitch}_${art}_${vel}`, buffer);
        }
      }
    }

    this.instruments.set(spec.id, {
      id: spec.id,
      name: spec.name,
      family: spec.family,
      rootPitches: spec.rootPitches,
      articulations: spec.articulations,
      zones,
    });
  }

  /**
   * Find closest root pitch, velocity layer, and articulation sample.
   */
  public getSample(
    instrumentId: string,
    targetPitch: number,
    velocity: number,
    articulation?: NoteArticulation
  ): { buffer: AudioBuffer; rootPitch: number; playbackRate: number } | null {
    // Standardize instrument ID aliases
    const resolvedId = this.resolveInstrumentId(instrumentId);
    const inst = this.instruments.get(resolvedId);
    if (!inst) return null;

    // Pick closest root pitch
    let closestRoot = inst.rootPitches[0];
    let minDiff = Math.abs(targetPitch - closestRoot);
    for (const root of inst.rootPitches) {
      const diff = Math.abs(targetPitch - root);
      if (diff < minDiff) {
        minDiff = diff;
        closestRoot = root;
      }
    }

    // Velocity layer
    const velLayer: 'soft' | 'medium' | 'hard' =
      velocity < 50 ? 'soft' : velocity < 95 ? 'medium' : 'hard';

    // Articulation
    const art = articulation && inst.articulations.includes(articulation)
      ? articulation
      : inst.articulations[0] || 'sustain';

    const key = `${closestRoot}_${art}_${velLayer}`;
    let buffer = inst.zones.get(key);

    if (!buffer) {
      // Fallback to medium velocity
      buffer = inst.zones.get(`${closestRoot}_${art}_medium`) ||
        inst.zones.get(`${closestRoot}_${inst.articulations[0]}_medium`);
    }

    if (!buffer) return null;

    const playbackRate = Math.pow(2, (targetPitch - closestRoot) / 12);
    return { buffer, rootPitch: closestRoot, playbackRate };
  }

  private resolveInstrumentId(id: string): string {
    if (id.includes('grand_piano')) return 'grand_piano';
    if (id.includes('felt_piano') || id.includes('piano')) return 'felt_piano';
    if (id.includes('violins') || id.includes('violin') || id.includes('bowed_psaltery')) return 'violin_ensemble';
    if (id.includes('viola')) return 'viola_ensemble';
    if (id.includes('cello')) return 'cello_section';
    if (id.includes('contrabass') || id.includes('double_bass') || id.includes('bass_section') || id.includes('electric_bass') || id.includes('retro_bass')) return 'contrabass_section';
    if (id.includes('french_horn') || id.includes('horn')) return 'french_horn';
    if (id.includes('trombone') || id.includes('tuba') || id.includes('brass')) return 'trombones_tuba';
    if (id.includes('choir')) return 'low_male_choir';
    if (id.includes('timpani')) return 'timpani';
    if (id.includes('taiko') || /frame_drum|darbuka|tabor|tambourine|shaker|brush|drum_kit|metal_drums|wood_perc|bells_kit|retrowave_drums|synthwave_drums|darkwave_drums/.test(id)) return 'taiko_war_drums';
    if (id.includes('bass_drum') || id.includes('cassa') || id.includes('impact')) return 'bass_drum_impacts';
    if (/harp|music_box|celesta|guitar|psaltery|dulcimer|lute|finger_cymbals|vibraphone|glockenspiel|tubular_bells|church_bell|funeral_bell|hand_chimes|bell_tree|kalimba|mbira|retro_lead|retro_synth/.test(id)) return 'plucked_harp';
    if (id.includes('flute') || id.includes('woodwind') || id.includes('recorder') || id.includes('bagpipe') || id.includes('accordion') || /zurna|mizmar/.test(id)) return 'woodwinds_flute';
    if (id.includes('pad') || id.includes('drone') || id.includes('ambient') || id.includes('organ')) return 'dark_atmospheric_drone';
    return 'felt_piano';
  }

  // ==========================================
  // PCM ACOUSTIC MULTISAMPLE SYNTHESIS ENGINES
  // ==========================================

  /**
   * Felt Grand Piano:
   * Muffled felt hammer impact transient, inharmonic string resonance,
   * natural wooden soundboard decay, dual-channel stereo width.
   */
  private renderFeltPianoSample(
    sampleRate: number,
    pitch: number,
    art: NoteArticulation,
    velLayer: 'soft' | 'medium' | 'hard'
  ): AudioBuffer {
    const isStaccato = art === 'staccato';
    const duration = isStaccato ? 0.7 : 3.6;
    const length = Math.floor(sampleRate * duration);
    const buffer = this.createStereoBuffer(length, sampleRate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    const freq = midiToFrequency(pitch);
    const velGain = velLayer === 'soft' ? 0.45 : velLayer === 'medium' ? 0.75 : 1.0;
    const brightness = velLayer === 'soft' ? 0.5 : velLayer === 'medium' ? 1.0 : 1.5;

    // Harmonic partial overtone ratios for acoustic felt grand piano
    const partials = [
      { ratio: 1.0, amp: 1.0, decay: 1.0 },
      { ratio: 2.002, amp: 0.5 * brightness, decay: 0.8 },
      { ratio: 3.006, amp: 0.25 * brightness, decay: 0.65 },
      { ratio: 4.012, amp: 0.12 * brightness, decay: 0.5 },
      { ratio: 5.02, amp: 0.06 * brightness, decay: 0.4 },
      { ratio: 6.03, amp: 0.03 * brightness, decay: 0.3 },
    ];

    // Felt hammer thump (soft transient band-limited noise)
    const hammerLen = Math.floor(sampleRate * 0.025);
    for (let i = 0; i < hammerLen; i++) {
      const t = i / hammerLen;
      const noise = (Math.random() * 2 - 1) * Math.exp(-t * 6);
      left[i] += noise * 0.15 * velGain;
      right[i] += noise * 0.15 * velGain;
    }

    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      let sampleL = 0;
      let sampleR = 0;

      for (const p of partials) {
        const pFreq = freq * p.ratio;
        const decayTime = isStaccato ? 0.35 : Math.max(0.8, 4.0 / Math.sqrt(p.ratio));
        const amp = p.amp * Math.exp(-t / (decayTime * p.decay));

        // Subtle unison detune for 3 piano strings
        sampleL += Math.sin(2 * Math.PI * pFreq * t) * amp;
        sampleR += Math.sin(2 * Math.PI * (pFreq * 1.0006) * t) * amp;
      }

      left[i] += sampleL * 0.4 * velGain;
      right[i] += sampleR * 0.4 * velGain;
    }

    return buffer;
  }

  /**
   * Violin / Viola Ensemble:
   * Multi-instrument section unison, natural bow friction noise onset,
   * gentle acoustic swelling legato and lush stereo chorus.
   */
  private renderStringsSample(
    sampleRate: number,
    pitch: number,
    art: NoteArticulation,
    velLayer: 'soft' | 'medium' | 'hard',
    type: 'violin' | 'viola'
  ): AudioBuffer {
    const isStaccato = art === 'staccato';
    const isTremolo = art === 'tremolo';
    const duration = isStaccato ? 0.65 : 3.8;
    const length = Math.floor(sampleRate * duration);
    const buffer = this.createStereoBuffer(length, sampleRate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    const freq = midiToFrequency(pitch);
    const velGain = velLayer === 'soft' ? 0.5 : velLayer === 'medium' ? 0.78 : 1.0;
    const attackTime = isStaccato ? 0.03 : type === 'viola' ? 0.28 : 0.22;

    // 8 detuned players in section
    const detuneOffsets = [-0.007, -0.004, -0.002, 0, 0.002, 0.004, 0.007, 0.01];

    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;

      // Amplitude envelope
      let env = 0;
      if (t < attackTime) {
        env = t / attackTime;
      } else if (isStaccato) {
        env = Math.exp(-(t - attackTime) * 6);
      } else if (t > duration - 0.4) {
        env = (duration - t) / 0.4;
      } else {
        env = 1.0;
      }

      // Tremolo rapid bow modulation
      if (isTremolo) {
        env *= 0.7 + 0.3 * Math.sin(2 * Math.PI * 9.5 * t);
      }

      // Natural vibrato LFO (5.2 Hz)
      const vibrato = Math.sin(2 * Math.PI * 5.2 * t) * (t > 0.3 ? 0.004 : 0.001);

      let sumL = 0;
      let sumR = 0;

      for (let pIdx = 0; pIdx < detuneOffsets.length; pIdx++) {
        const detune = detuneOffsets[pIdx] + vibrato;
        const pFreq = freq * (1 + detune);

        // Sawtooth wave through lowpass formant
        const phase = (pFreq * t) % 1;
        const saw = 2 * phase - 1;

        if (pIdx % 2 === 0) {
          sumL += saw;
        } else {
          sumR += saw;
        }
      }

      left[i] = (sumL / 4) * env * 0.32 * velGain;
      right[i] = (sumR / 4) * env * 0.32 * velGain;
    }

    return buffer;
  }

  /**
   * Cello Section:
   * Rich, dark, sorrowful, singing cello acoustic body with wooden low-mid resonance.
   */
  private renderCelloSample(
    sampleRate: number,
    pitch: number,
    art: NoteArticulation,
    velLayer: 'soft' | 'medium' | 'hard'
  ): AudioBuffer {
    const isStaccato = art === 'staccato';
    const isPizz = art === 'pizzicato';
    const duration = isStaccato ? 0.7 : isPizz ? 1.2 : 4.0;
    const length = Math.floor(sampleRate * duration);
    const buffer = this.createStereoBuffer(length, sampleRate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    const freq = midiToFrequency(pitch);
    const velGain = velLayer === 'soft' ? 0.45 : velLayer === 'medium' ? 0.75 : 1.0;

    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;

      let env = 1.0;
      if (isPizz) {
        env = Math.exp(-t * 3.5);
      } else if (isStaccato) {
        env = t < 0.05 ? t / 0.05 : Math.exp(-(t - 0.05) * 5);
      } else {
        env = t < 0.25 ? t / 0.25 : t > duration - 0.5 ? (duration - t) / 0.5 : 1.0;
      }

      const vibrato = isPizz ? 0 : Math.sin(2 * Math.PI * 4.8 * t) * (t > 0.4 ? 0.0035 : 0.001);

      // Cello warm harmonic profile
      const h1 = Math.sin(2 * Math.PI * freq * (1 + vibrato) * t);
      const h2 = Math.sin(2 * Math.PI * freq * 2 * (1 + vibrato) * t) * 0.65;
      const h3 = Math.sin(2 * Math.PI * freq * 3 * (1 + vibrato) * t) * 0.35;
      const h4 = Math.sin(2 * Math.PI * freq * 4 * (1 + vibrato) * t) * 0.15;

      const tone = (h1 + h2 + h3 + h4) * env * 0.36 * velGain;
      left[i] = tone;
      right[i] = tone * 0.95;
    }

    return buffer;
  }

  /**
   * Orchestral Contrabass:
   * Heavy fundamental sub-body resonance, majestic bowing weight.
   */
  private renderContrabassSample(
    sampleRate: number,
    pitch: number,
    art: NoteArticulation,
    velLayer: 'soft' | 'medium' | 'hard'
  ): AudioBuffer {
    const isStaccato = art === 'staccato' || art === 'marcato';
    const duration = isStaccato ? 0.8 : 3.8;
    const length = Math.floor(sampleRate * duration);
    const buffer = this.createStereoBuffer(length, sampleRate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    const freq = midiToFrequency(pitch);
    const velGain = velLayer === 'soft' ? 0.5 : velLayer === 'medium' ? 0.8 : 1.1;

    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;

      let env = 1.0;
      if (isStaccato) {
        env = t < 0.08 ? t / 0.08 : Math.exp(-(t - 0.08) * 4.5);
      } else {
        env = t < 0.2 ? t / 0.2 : t > duration - 0.4 ? (duration - t) / 0.4 : 1.0;
      }

      // Strong 1st and 2nd harmonic for deep contrabass body
      const tone = (
        Math.sin(2 * Math.PI * freq * t) * 1.0 +
        Math.sin(2 * Math.PI * freq * 2 * t) * 0.7 +
        Math.sin(2 * Math.PI * freq * 3 * t) * 0.35 +
        Math.sin(2 * Math.PI * freq * 4 * t) * 0.15
      ) * env * 0.42 * velGain;

      left[i] = tone;
      right[i] = tone;
    }

    return buffer;
  }

  /**
   * French Horn & Trombones:
   * Brass acoustic flare, warm noble horn body, resonant lip buzz and bell projection.
   */
  private renderBrassSample(
    sampleRate: number,
    pitch: number,
    art: NoteArticulation,
    velLayer: 'soft' | 'medium' | 'hard',
    type: 'horn' | 'trombone'
  ): AudioBuffer {
    const isStaccato = art === 'staccato';
    const duration = isStaccato ? 0.7 : 3.8;
    const length = Math.floor(sampleRate * duration);
    const buffer = this.createStereoBuffer(length, sampleRate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    const freq = midiToFrequency(pitch);
    const velGain = velLayer === 'soft' ? 0.45 : velLayer === 'medium' ? 0.8 : 1.15;
    const attack = isStaccato ? 0.04 : type === 'horn' ? 0.14 : 0.08;

    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;

      let env = 1.0;
      if (t < attack) {
        env = t / attack;
      } else if (isStaccato) {
        env = Math.exp(-(t - attack) * 5.0);
      } else if (t > duration - 0.4) {
        env = (duration - t) / 0.4;
      }

      // French Horn warm brass formants
      const b1 = Math.sin(2 * Math.PI * freq * t);
      const b2 = Math.sin(2 * Math.PI * freq * 2 * t) * (type === 'horn' ? 0.6 : 0.85);
      const b3 = Math.sin(2 * Math.PI * freq * 3 * t) * (type === 'horn' ? 0.4 : 0.7);
      const b4 = Math.sin(2 * Math.PI * freq * 4 * t) * (type === 'horn' ? 0.2 : 0.55);

      const tone = (b1 + b2 + b3 + b4) * env * 0.35 * velGain;
      left[i] = tone;
      right[i] = tone * 0.98;
    }

    return buffer;
  }

  /**
   * Low Male Choir:
   * Dual formant vocal tract resonators (Ooh/Aah acoustic formant filters).
   */
  private renderChoirSample(
    sampleRate: number,
    pitch: number,
    art: NoteArticulation,
    velLayer: 'soft' | 'medium' | 'hard'
  ): AudioBuffer {
    const duration = 4.0;
    const length = Math.floor(sampleRate * duration);
    const buffer = this.createStereoBuffer(length, sampleRate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    const freq = midiToFrequency(pitch);
    const velGain = velLayer === 'soft' ? 0.5 : velLayer === 'medium' ? 0.8 : 1.0;

    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;

      // Swelling choral attack
      let env = 1.0;
      if (t < 0.35) {
        env = t / 0.35;
      } else if (t > duration - 0.6) {
        env = (duration - t) / 0.6;
      }

      const vibrato = Math.sin(2 * Math.PI * 5.0 * t) * 0.003;

      // Choral formants around 450Hz and 850Hz
      const v1 = Math.sin(2 * Math.PI * freq * (1 + vibrato) * t);
      const v2 = Math.sin(2 * Math.PI * freq * 2 * (1 + vibrato) * t) * 0.7;
      const v3 = Math.sin(2 * Math.PI * freq * 3 * (1 + vibrato) * t) * 0.4;
      const v4 = Math.sin(2 * Math.PI * freq * 4 * (1 + vibrato) * t) * 0.2;

      const tone = (v1 + v2 + v3 + v4) * env * 0.38 * velGain;
      left[i] = tone;
      right[i] = tone * 0.92;
    }

    return buffer;
  }

  /**
   * Orchestral Timpani:
   * Kettle membrane modal Bessel resonance, sharp wooden mallet strike,
   * tuned pitch drop and thunderous acoustic decay.
   */
  private renderTimpaniSample(
    sampleRate: number,
    pitch: number,
    art: NoteArticulation,
    velLayer: 'soft' | 'medium' | 'hard'
  ): AudioBuffer {
    const duration = 2.4;
    const length = Math.floor(sampleRate * duration);
    const buffer = this.createStereoBuffer(length, sampleRate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    const freq = midiToFrequency(pitch);
    const velGain = velLayer === 'soft' ? 0.5 : velLayer === 'medium' ? 0.85 : 1.2;

    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      // Slight pitch envelope drop upon initial strike
      const pitchEnv = freq * (1 + 0.35 * Math.exp(-t * 22));

      // Timpani membrane inharmonic modes (approximate circular membrane Bessel ratios: 1.0, 1.59, 2.14)
      const m1 = Math.sin(2 * Math.PI * pitchEnv * t) * Math.exp(-t * 1.5);
      const m2 = Math.sin(2 * Math.PI * pitchEnv * 1.59 * t) * Math.exp(-t * 2.8) * 0.45;
      const m3 = Math.sin(2 * Math.PI * pitchEnv * 2.14 * t) * Math.exp(-t * 4.2) * 0.25;

      const mallet = (Math.random() * 2 - 1) * Math.exp(-t * 80) * 0.4;
      const tone = (m1 + m2 + m3 + mallet) * 0.6 * velGain;

      left[i] = tone;
      right[i] = tone;
    }

    return buffer;
  }

  /**
   * Cinematic Taiko War Drums:
   * Heavy subterranean impact, massive drumhead strike and resonant wood barrel rumble.
   */
  private renderTaikoSample(
    sampleRate: number,
    pitch: number,
    art: NoteArticulation,
    velLayer: 'soft' | 'medium' | 'hard'
  ): AudioBuffer {
    const duration = 1.6;
    const length = Math.floor(sampleRate * duration);
    const buffer = this.createStereoBuffer(length, sampleRate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    const velGain = velLayer === 'soft' ? 0.55 : velLayer === 'medium' ? 0.9 : 1.3;

    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      // Seismic sub-pitch drop from 140Hz down to 42Hz
      const pitchDrop = 42 + 98 * Math.exp(-t * 18);

      const sub = Math.sin(2 * Math.PI * pitchDrop * t) * Math.exp(-t * 2.5);
      const punch = Math.sin(2 * Math.PI * pitchDrop * 2.5 * t) * Math.exp(-t * 12) * 0.5;
      const strikeNoise = (Math.random() * 2 - 1) * Math.exp(-t * 50) * 0.6;

      const tone = (sub + punch + strikeNoise) * 0.65 * velGain;
      left[i] = tone;
      right[i] = tone;
    }

    return buffer;
  }

  /**
   * Dark Atmospheric Drone:
   * Hypnotic evolving sub-drone texture with gentle lowpass modulation and stereo space.
   */
  private renderDroneSample(
    sampleRate: number,
    pitch: number,
    art: NoteArticulation,
    velLayer: 'soft' | 'medium' | 'hard'
  ): AudioBuffer {
    const duration = 5.0;
    const length = Math.floor(sampleRate * duration);
    const buffer = this.createStereoBuffer(length, sampleRate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    const freq = midiToFrequency(pitch);
    const velGain = velLayer === 'soft' ? 0.6 : velLayer === 'medium' ? 0.85 : 1.0;

    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      const env = t < 0.5 ? t / 0.5 : t > duration - 0.8 ? (duration - t) / 0.8 : 1.0;

      const sweepL = Math.sin(2 * Math.PI * 0.15 * t);
      const sweepR = Math.cos(2 * Math.PI * 0.15 * t);

      const d1L = Math.sin(2 * Math.PI * freq * (1 + 0.003 * sweepL) * t);
      const d1R = Math.sin(2 * Math.PI * freq * (1 - 0.003 * sweepR) * t);
      const d2 = Math.sin(2 * Math.PI * freq * 2 * t) * 0.4;
      const d3 = Math.sin(2 * Math.PI * freq * 0.5 * t) * 0.7; // Sub octave

      left[i] = (d1L + d2 + d3) * env * 0.3 * velGain;
      right[i] = (d1R + d2 + d3) * env * 0.3 * velGain;
    }

    return buffer;
  }

  /**
   * Concert Grand Piano:
   * Bright, crystal-clear hammer impact, long singing acoustic sustain,
   * wide soundboard stereo distribution and rich inharmonic partials.
   */
  private renderGrandPianoSample(
    sampleRate: number,
    pitch: number,
    art: NoteArticulation,
    velLayer: 'soft' | 'medium' | 'hard'
  ): AudioBuffer {
    const isStaccato = art === 'staccato';
    const duration = isStaccato ? 0.8 : 4.5;
    const length = Math.floor(sampleRate * duration);
    const buffer = this.createStereoBuffer(length, sampleRate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    const freq = midiToFrequency(pitch);
    const velGain = velLayer === 'soft' ? 0.4 : velLayer === 'medium' ? 0.75 : 1.1;
    const brightness = velLayer === 'soft' ? 0.6 : velLayer === 'medium' ? 1.0 : 1.6;

    // Harmonic partial overtone ratios for open concert grand piano
    const partials = [
      { ratio: 1.0, amp: 1.0, decay: 1.0 },
      { ratio: 2.001, amp: 0.65 * brightness, decay: 0.85 },
      { ratio: 3.003, amp: 0.4 * brightness, decay: 0.7 },
      { ratio: 4.007, amp: 0.22 * brightness, decay: 0.55 },
      { ratio: 5.012, amp: 0.12 * brightness, decay: 0.45 },
      { ratio: 6.018, amp: 0.08 * brightness, decay: 0.35 },
      { ratio: 7.025, amp: 0.05 * brightness, decay: 0.28 },
      { ratio: 8.035, amp: 0.03 * brightness, decay: 0.22 },
    ];

    // Crisp wooden hammer attack transient
    const hammerLen = Math.floor(sampleRate * 0.015);
    for (let i = 0; i < hammerLen; i++) {
      const t = i / hammerLen;
      const noise = (Math.random() * 2 - 1) * Math.exp(-t * 8);
      left[i] += noise * 0.2 * velGain;
      right[i] += noise * 0.2 * velGain;
    }

    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      let sampleL = 0;
      let sampleR = 0;

      for (const p of partials) {
        const pFreq = freq * p.ratio;
        const decayTime = isStaccato ? 0.4 : Math.max(1.0, 5.0 / Math.sqrt(p.ratio));
        const amp = p.amp * Math.exp(-t / (decayTime * p.decay));

        // Spatial soundboard panning based on pitch register
        const panLeftFactor = Math.max(0.2, 1.0 - (pitch - 21) / 100);
        const panRightFactor = Math.max(0.2, (pitch - 21) / 100);

        sampleL += Math.sin(2 * Math.PI * pFreq * t) * amp * panLeftFactor;
        sampleR += Math.sin(2 * Math.PI * (pFreq * 1.0004) * t) * amp * panRightFactor;
      }

      left[i] += sampleL * 0.42 * velGain;
      right[i] += sampleR * 0.42 * velGain;
    }

    return buffer;
  }

  /**
   * Concert Wooden Flute:
   * Breathy acoustic turbulence chiff transient, organic air stream,
   * delicate vibrato and round, woody harmonic body.
   */
  private renderFluteSample(
    sampleRate: number,
    pitch: number,
    art: NoteArticulation,
    velLayer: 'soft' | 'medium' | 'hard'
  ): AudioBuffer {
    const isStaccato = art === 'staccato';
    const duration = isStaccato ? 0.6 : 3.5;
    const length = Math.floor(sampleRate * duration);
    const buffer = this.createStereoBuffer(length, sampleRate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    const freq = midiToFrequency(pitch);
    const velGain = velLayer === 'soft' ? 0.5 : velLayer === 'medium' ? 0.8 : 1.0;
    const breathiness = velLayer === 'soft' ? 0.15 : 0.08;

    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;

      // Gentle acoustic attack swell
      const attack = Math.min(1.0, t / 0.08);
      const release = isStaccato ? Math.exp(-t * 4) : t > duration - 0.3 ? (duration - t) / 0.3 : 1.0;
      const env = attack * release;

      // Natural acoustic vibrato beginning after 0.25s
      const vibOnset = Math.min(1.0, Math.max(0, (t - 0.25) / 0.4));
      const vibrato = Math.sin(2 * Math.PI * 5.4 * t) * 0.006 * vibOnset;
      const currentFreq = freq * (1 + vibrato);

      // Acoustic wood flute predominantly pure fundamental with subtle odd and even overtones
      const f1 = Math.sin(2 * Math.PI * currentFreq * t);
      const f2 = Math.sin(2 * Math.PI * currentFreq * 2 * t) * 0.25;
      const f3 = Math.sin(2 * Math.PI * currentFreq * 3 * t) * 0.12;
      const f4 = Math.sin(2 * Math.PI * currentFreq * 4 * t) * 0.04;

      // Breath noise turbulence
      const breathNoise = (Math.random() * 2 - 1) * breathiness * Math.exp(-t * 2);

      const tone = (f1 + f2 + f3 + f4 + breathNoise) * env * 0.45 * velGain;
      left[i] = tone;
      right[i] = tone * 0.98;
    }

    return buffer;
  }

  /**
   * Concert Celtic Harp:
   * Crisp fingertip pluck, immediate bright string release,
   * shimmering crystalline overtones and rich singing ring out.
   */
  private renderHarpSample(
    sampleRate: number,
    pitch: number,
    art: NoteArticulation,
    velLayer: 'soft' | 'medium' | 'hard'
  ): AudioBuffer {
    const isStaccato = art === 'staccato';
    const duration = isStaccato ? 0.7 : 4.2;
    const length = Math.floor(sampleRate * duration);
    const buffer = this.createStereoBuffer(length, sampleRate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    const freq = midiToFrequency(pitch);
    const velGain = velLayer === 'soft' ? 0.45 : velLayer === 'medium' ? 0.8 : 1.15;

    // Pluck snap transient
    const pluckLen = Math.floor(sampleRate * 0.01);
    for (let i = 0; i < pluckLen; i++) {
      const t = i / pluckLen;
      const snap = (Math.random() * 2 - 1) * (1 - t);
      left[i] += snap * 0.25 * velGain;
      right[i] += snap * 0.25 * velGain;
    }

    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      const decayTime = isStaccato ? 0.35 : 2.5;

      const p1 = Math.sin(2 * Math.PI * freq * t) * Math.exp(-t / decayTime);
      const p2 = Math.sin(2 * Math.PI * freq * 2.001 * t) * Math.exp(-t / (decayTime * 0.7)) * 0.5;
      const p3 = Math.sin(2 * Math.PI * freq * 3.004 * t) * Math.exp(-t / (decayTime * 0.5)) * 0.25;
      const p4 = Math.sin(2 * Math.PI * freq * 4.008 * t) * Math.exp(-t / (decayTime * 0.35)) * 0.12;

      const toneL = (p1 + p2 + p3 + p4) * 0.42 * velGain;
      const toneR = (p1 + p2 * 1.05 + p3 * 0.95 + p4) * 0.42 * velGain;

      left[i] += toneL;
      right[i] += toneR;
    }

    return buffer;
  }

  /**
   * Cinematic Bass Drum & Gran Cassa:
   * Earth-shaking subsonic impact, massive room compression bloom,
   * natural acoustic shell decay for climactic battle hits.
   */
  private renderBassDrumSample(
    sampleRate: number,
    pitch: number,
    art: NoteArticulation,
    velLayer: 'soft' | 'medium' | 'hard'
  ): AudioBuffer {
    const duration = 2.8;
    const length = Math.floor(sampleRate * duration);
    const buffer = this.createStereoBuffer(length, sampleRate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    const velGain = velLayer === 'soft' ? 0.6 : velLayer === 'medium' ? 0.95 : 1.35;

    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;

      // Subterranean pitch drop from 85Hz down to 26Hz
      const pitchDrop = 26 + 59 * Math.exp(-t * 14);

      // Deep visceral boom
      const sub = Math.sin(2 * Math.PI * pitchDrop * t) * Math.exp(-t * 2.2);
      // Skin slap attack
      const skinSlap = Math.sin(2 * Math.PI * pitchDrop * 2.8 * t) * Math.exp(-t * 28) * 0.6;
      // Mallet impact transient
      const malletThump = (Math.random() * 2 - 1) * Math.exp(-t * 60) * 0.5;

      const monoSignal = (sub + skinSlap + malletThump) * 0.7 * velGain;

      // Natural hall stereo bloom
      const roomSpread = Math.sin(2 * Math.PI * 0.8 * t) * 0.05 * Math.exp(-t * 1.5);
      left[i] = monoSignal * (1 + roomSpread);
      right[i] = monoSignal * (1 - roomSpread);
    }

    return buffer;
  }

  private createStereoBuffer(length: number, sampleRate: number): AudioBuffer {
    if (this.audioCtx) {
      return this.audioCtx.createBuffer(2, length, sampleRate);
    }
    // Fallback if audioCtx not yet bound
    const offlineCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    return offlineCtx.createBuffer(2, length, sampleRate);
  }
}

export const globalSamplerEngine = SamplerEngine.getInstance();
