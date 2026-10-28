import React from 'react';
import { Volume2, VolumeX, ShieldAlert, Sparkles, Sliders, Waves, Radio } from 'lucide-react';
import { Composition, ReverbPreset, Track } from '../../types/music';
import { getInstrumentById } from '../../core/instruments/library';
import { TrackIcon, getDefaultIconForInstrument } from '../common/TrackIcon';
import { globalAudioEngine } from '../../core/audio/WebAudioEngine';

interface MixerViewProps {
  composition: Composition;
  masterVolume: number;
  onUpdateTrack: (trackId: string, updates: Partial<Track>) => void;
  onUpdateMasterVolume: (volume: number) => void;
  onSelectReverbPreset?: (preset: ReverbPreset) => void;
}

const REVERB_PRESETS: Array<{
  id: ReverbPreset;
  name: string;
  decay: string;
  description: string;
}> = [
  { id: 'studio', name: 'Studio', decay: '0.8s', description: 'Tight, controlled acoustic space' },
  { id: 'chamber', name: 'Chamber', decay: '1.5s', description: 'Intimate warm room resonance' },
  { id: 'concert_hall', name: 'Concert Hall', decay: '2.8s', description: 'Expansive symphonic hall' },
  { id: 'cathedral', name: 'Cathedral', decay: '4.8s', description: 'Majestic long acoustic tail' },
  { id: 'dark_hall', name: 'Dark Hall', decay: '3.4s', description: 'Gloomy gothic atmosphere' },
  { id: 'cinematic_hall', name: 'Large Cinematic Hall', decay: '3.6s', description: 'Hollywood blockbuster soundstage' },
];

export const MixerView: React.FC<MixerViewProps> = ({
  composition,
  masterVolume,
  onUpdateTrack,
  onUpdateMasterVolume,
  onSelectReverbPreset,
}) => {
  const currentReverb = composition.reverbPreset || 'dark_hall';

  const handleReverbChange = (preset: ReverbPreset) => {
    globalAudioEngine.setReverbPreset(preset);
    if (onSelectReverbPreset) {
      onSelectReverbPreset(preset);
    }
  };

  return (
    <div className="flex-1 flex bg-neutral-950 text-neutral-200 overflow-x-auto p-6 select-none gap-5 items-stretch">
      {/* Individual Track Channel Strips */}
      <div className="flex gap-3 items-stretch">
        {composition.tracks.map((track) => {
          const inst = getInstrumentById(track.instrumentId);
          const sendAmount = track.reverbSend ?? 0.3;
          const dryAmount = Math.max(0, 1 - sendAmount);
          const sendPct = Math.round(sendAmount * 100);
          const dryPct = Math.round(dryAmount * 100);

          const cutoffHz = track.filterCutoff ?? 18000;
          const cutoffText = cutoffHz >= 1000 ? `${(cutoffHz / 1000).toFixed(1)}k` : `${cutoffHz}`;

          const panVal = track.pan ?? 0;
          const panText =
            panVal === 0 ? 'C' : panVal < 0 ? `L${Math.round(Math.abs(panVal) * 100)}` : `R${Math.round(panVal * 100)}`;

          return (
            <div
              key={track.id}
              className="w-32 bg-neutral-900 border border-neutral-800 rounded-xl p-3 flex flex-col justify-between shrink-0 shadow-xl hover:border-neutral-700 transition-colors"
            >
              {/* Header Info */}
              <div className="text-center border-b border-neutral-800 pb-2.5">
                <div
                  className="w-7 h-7 rounded mx-auto mb-1.5 flex items-center justify-center text-white shadow-xs"
                  style={{ backgroundColor: track.color || inst.color }}
                >
                  <TrackIcon
                    iconId={track.icon || getDefaultIconForInstrument(track.instrumentId)}
                    className="w-4 h-4"
                  />
                </div>
                <h4 className="text-xs font-bold text-white truncate" title={track.name}>
                  {track.name}
                </h4>
                <span className="text-[10px] text-neutral-400 font-mono block truncate">
                  {inst.family}
                </span>
              </div>

              {/* Acoustic Sends & Filters Section */}
              <div className="flex flex-col gap-2.5 py-3 border-b border-neutral-800/80 text-[10px] font-mono">
                {/* Reverb Send with Dry / Send % Readout */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-neutral-400">
                    <span className="text-indigo-400 font-bold">REV SEND</span>
                    <span className="text-indigo-300 font-bold">{sendPct}%</span>
                  </div>
                  <div className="flex items-center justify-between text-[9px] text-neutral-500">
                    <span>Dry {dryPct}%</span>
                    <span>Wet {sendPct}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={sendAmount}
                    onChange={(e) => onUpdateTrack(track.id, { reverbSend: parseFloat(e.target.value) })}
                    className="w-full accent-indigo-500 h-1.5 bg-neutral-950 rounded cursor-pointer"
                  />
                </div>

                {/* Filter Cutoff */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-neutral-400">
                    <span>LOWPASS</span>
                    <span className="text-neutral-300">{cutoffText}Hz</span>
                  </div>
                  <input
                    type="range"
                    min={400}
                    max={18000}
                    step={200}
                    value={cutoffHz}
                    onChange={(e) => onUpdateTrack(track.id, { filterCutoff: parseFloat(e.target.value) })}
                    className="w-full accent-cyan-500 h-1.5 bg-neutral-950 rounded cursor-pointer"
                  />
                </div>

                {/* Pan */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-neutral-400">
                    <span>PAN</span>
                    <span className="text-neutral-300">{panText}</span>
                  </div>
                  <input
                    type="range"
                    min={-1}
                    max={1}
                    step={0.1}
                    value={panVal}
                    onChange={(e) => onUpdateTrack(track.id, { pan: parseFloat(e.target.value) })}
                    className="w-full accent-neutral-300 h-1.5 bg-neutral-950 rounded cursor-pointer"
                  />
                </div>
              </div>

              {/* Mute & Solo Buttons */}
              <div className="flex items-center gap-1.5 justify-center py-2">
                <button
                  onClick={() => onUpdateTrack(track.id, { mute: !track.mute })}
                  className={`flex-1 py-1 rounded text-[11px] font-mono font-bold transition-colors ${
                    track.mute
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'bg-neutral-800 text-neutral-400 hover:text-white'
                  }`}
                >
                  M
                </button>
                <button
                  onClick={() => onUpdateTrack(track.id, { solo: !track.solo })}
                  className={`flex-1 py-1 rounded text-[11px] font-mono font-bold transition-colors ${
                    track.solo
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-neutral-800 text-neutral-400 hover:text-white'
                  }`}
                >
                  S
                </button>
              </div>

              {/* Vertical Fader */}
              <div className="flex-1 flex flex-col items-center justify-center py-3 min-h-[150px]">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={track.volume}
                  onChange={(e) => onUpdateTrack(track.id, { volume: parseFloat(e.target.value) })}
                  className="h-36 -rotate-90 accent-indigo-500 bg-neutral-800 rounded cursor-pointer w-32"
                />
              </div>

              {/* dB Readout */}
              <div className="text-center font-mono text-[11px] text-neutral-300 bg-neutral-950 py-1 rounded border border-neutral-800/80">
                {track.volume === 0 ? '-inf dB' : `${Math.round(20 * Math.log10(track.volume))} dB`}
              </div>
            </div>
          );
        })}
      </div>

      {/* Cinematic Reverb Bus & Master Strip Container */}
      <div className="flex gap-3 shrink-0 ml-2">
        {/* Cinematic Reverb Rack */}
        <div className="w-56 bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex flex-col justify-between shadow-xl">
          <div>
            <div className="flex items-center gap-2 border-b border-neutral-800 pb-2.5 mb-3">
              <div className="w-6 h-6 rounded bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
                <Waves className="w-3.5 h-3.5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">Cinematic Reverb</h4>
                <span className="text-[10px] text-indigo-400 font-mono block">Convolution Space</span>
              </div>
            </div>

            <p className="text-[11px] text-neutral-400 mb-3 leading-relaxed">
              Select orchestral acoustic space for track SEND channels:
            </p>

            {/* Presets List */}
            <div className="space-y-1.5">
              {REVERB_PRESETS.map((p) => {
                const isSelected = currentReverb === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => handleReverbChange(p.id)}
                    className={`w-full text-left p-2 rounded-lg border text-xs transition-colors flex items-center justify-between ${
                      isSelected
                        ? 'bg-indigo-600/20 border-indigo-500/60 text-white shadow-xs'
                        : 'bg-neutral-950/60 border-neutral-800/80 text-neutral-300 hover:bg-neutral-800'
                    }`}
                  >
                    <div>
                      <div className="font-semibold">{p.name}</div>
                      <div className="text-[10px] text-neutral-400 truncate max-w-[130px]">{p.description}</div>
                    </div>
                    <span className="text-[10px] font-mono text-indigo-400 bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-800 shrink-0">
                      {p.decay}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-neutral-800/80 text-[10px] font-mono text-neutral-400 flex items-center justify-between">
            <span>IMPULSE</span>
            <span className="text-emerald-400 font-bold">STEREO 44.1kHz</span>
          </div>
        </div>

        {/* Master Bus Channel Strip */}
        <div className="w-40 bg-neutral-900 border-2 border-indigo-500/40 rounded-xl p-3.5 flex flex-col justify-between shadow-2xl">
          <div className="text-center border-b border-neutral-800 pb-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 inline-block mb-1 shadow-sm" />
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">Master Bus</h4>
            <span className="text-[10px] text-emerald-400 font-mono block">Limiter Protected</span>
          </div>

          <div className="py-3 border-b border-neutral-800/80 text-[10px] font-mono flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-neutral-500">COMP</span>
              <span className="text-emerald-400 font-bold">4:1 RATIO</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-neutral-500">CEILING</span>
              <span className="text-neutral-300">-0.5 dB</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-neutral-500">HEADROOM</span>
              <span className="text-indigo-400">+3.0 dB</span>
            </div>
          </div>

          {/* Master Fader */}
          <div className="flex-1 flex flex-col items-center justify-center py-4 min-h-[160px]">
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={masterVolume}
              onChange={(e) => onUpdateMasterVolume(parseFloat(e.target.value))}
              className="h-36 -rotate-90 accent-emerald-500 bg-neutral-800 rounded cursor-pointer w-32"
            />
          </div>

          {/* Master dB Readout */}
          <div className="text-center font-mono text-xs font-bold text-white bg-neutral-950 py-1.5 rounded border border-neutral-800">
            {masterVolume === 0 ? '-inf dB' : `${Math.round(20 * Math.log10(masterVolume))} dB`}
          </div>
        </div>
      </div>
    </div>
  );
};
