import { Composition } from '../../types/music';

export interface GameEnginePackageMetadata {
  gameTitle: string;
  compositionTitle: string;
  bpm: number;
  key: string;
  scale: string;
  timeSignature: string;
  bars: number;
  loop: {
    enabled: boolean;
    startBar: number;
    endBar: number;
    startSample: number;
    endSample: number;
    crossfadeSeconds: number;
  };
  sections: Array<{
    name: string;
    startBar: number;
    barCount: number;
    intensity: number;
  }>;
  stems: Array<{
    trackId: string;
    name: string;
    role: string;
    instrument: string;
    fileName: string;
    defaultVolume: number;
    defaultPan: number;
  }>;
  adaptiveParameters: Array<{
    parameter: string;
    range: [number, number];
    description: string;
  }>;
  engineGuides: {
    unity: string;
    unreal: string;
    godot: string;
  };
}

export class GamePackageExporter {
  public static generateManifest(comp: Composition, sampleRate = 44100): GameEnginePackageMetadata {
    const beatsPerBar = comp.timeSignature.numerator || 4;
    const secondsPerBeat = 60 / (comp.tempo || 120);
    const loopStartBar = comp.metadata?.loopStartBar ?? 1;
    const loopEndBar = comp.metadata?.loopEndBar ?? comp.durationBars;

    const startBeat = (loopStartBar - 1) * beatsPerBar;
    const endBeat = loopEndBar * beatsPerBar;

    const startSample = Math.round(startBeat * secondsPerBeat * sampleRate);
    const endSample = Math.round(endBeat * secondsPerBeat * sampleRate);

    return {
      gameTitle: comp.metadata?.gameTitle || 'Khimea Game Project',
      compositionTitle: comp.title,
      bpm: comp.tempo,
      key: `${comp.key} ${comp.scale}`,
      scale: comp.scale,
      timeSignature: `${comp.timeSignature.numerator}/${comp.timeSignature.denominator}`,
      bars: comp.durationBars,
      loop: {
        enabled: comp.mode === 'loop' || comp.metadata?.loopStartBar !== undefined,
        startBar: loopStartBar,
        endBar: loopEndBar,
        startSample,
        endSample,
        crossfadeSeconds: 0.15,
      },
      sections: comp.sections.map((s) => ({
        name: s.name,
        startBar: s.startBar,
        barCount: s.barCount,
        intensity: s.intensity,
      })),
      stems: comp.tracks.map((t) => ({
        trackId: t.id,
        name: t.name,
        role: t.role,
        instrument: t.instrumentId,
        fileName: `stems/${t.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}.wav`,
        defaultVolume: t.volume,
        defaultPan: t.pan,
      })),
      adaptiveParameters: [
        {
          parameter: 'combatIntensity',
          range: [0, 100],
          description: 'Controls activation of heavy percussion and brass fanfares.',
        },
        {
          parameter: 'playerHealth',
          range: [0, 100],
          description: 'Low health (< 30) triggers muted lowpass filter and prominent heartbeat.',
        },
      ],
      engineGuides: {
        unity: 'Attach AudioSource component. Enable "Loop" and set AudioSource.timeSamples between startSample and endSample in script.',
        unreal: 'Import WAV stems into MetaSounds. Use "Wave Player (Interactive)" with loop cue points or crossfade nodes.',
        godot: 'In Godot 4, add AudioStreamPlayer, assign AudioStreamWAV with loop_mode=1, loop_begin=startSample, loop_end=endSample.',
      },
    };
  }

  public static exportManifestJsonBlob(comp: Composition): Blob {
    const manifest = this.generateManifest(comp);
    return new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
  }
}
