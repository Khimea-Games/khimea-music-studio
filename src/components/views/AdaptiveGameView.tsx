import React, { useState, useEffect } from 'react';
import { Gamepad2, Zap, Shield, Heart, Radio, Flame, Sparkles } from 'lucide-react';
import { Composition, Track } from '../../types/music';

interface AdaptiveGameViewProps {
  composition: Composition;
  onUpdateTrack: (trackId: string, updates: Partial<Track>) => void;
}

export const AdaptiveGameView: React.FC<AdaptiveGameViewProps> = ({
  composition,
  onUpdateTrack,
}) => {
  const [combatIntensity, setCombatIntensity] = useState<number>(30);
  const [playerHealth, setPlayerHealth] = useState<number>(100);
  const [stealthLevel, setStealthLevel] = useState<number>(50);

  // Apply adaptive parameters to track volumes and mutes live
  useEffect(() => {
    composition.tracks.forEach((track) => {
      const isPerc = track.role === 'percussion' || track.instrumentId.includes('taiko');
      const isBrass = track.instrumentId.includes('french_horn') || track.instrumentId.includes('trombone');
      const isChoir = track.instrumentId.includes('choir');
      const isAmbient = track.instrumentId.includes('pad') || track.role === 'texture';

      if (isPerc) {
        // Percussion unmutes at intensity > 25
        const active = combatIntensity > 25;
        const targetVol = active ? Math.min(1.0, 0.4 + (combatIntensity / 100) * 0.6) : 0;
        onUpdateTrack(track.id, { volume: targetVol, mute: !active });
      } else if (isBrass) {
        // Brass kicks in at intensity > 55
        const active = combatIntensity > 55;
        const targetVol = active ? Math.min(1.0, 0.5 + ((combatIntensity - 55) / 45) * 0.5) : 0;
        onUpdateTrack(track.id, { volume: targetVol, mute: !active });
      } else if (isChoir) {
        // Choir joins at intense climax > 75
        const active = combatIntensity > 75;
        const targetVol = active ? 0.85 : 0;
        onUpdateTrack(track.id, { volume: targetVol, mute: !active });
      } else if (isAmbient) {
        // Ambient pad softens during high combat, dominant during stealth
        const targetVol = stealthLevel > 40 ? 0.75 : 0.3;
        onUpdateTrack(track.id, { volume: targetVol, mute: false });
      }
    });
  }, [combatIntensity, stealthLevel]);

  // Presets
  const applyPreset = (preset: 'stealth' | 'patrol' | 'combat' | 'boss_climax') => {
    switch (preset) {
      case 'stealth':
        setCombatIntensity(10);
        setStealthLevel(90);
        setPlayerHealth(100);
        break;
      case 'patrol':
        setCombatIntensity(40);
        setStealthLevel(40);
        setPlayerHealth(90);
        break;
      case 'combat':
        setCombatIntensity(75);
        setStealthLevel(10);
        setPlayerHealth(65);
        break;
      case 'boss_climax':
        setCombatIntensity(100);
        setStealthLevel(0);
        setPlayerHealth(30);
        break;
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-neutral-950 text-neutral-200 p-8 overflow-y-auto select-none">
      <div className="max-w-4xl mx-auto w-full flex flex-col gap-6">
        {/* Header */}
        <div className="border-b border-neutral-800 pb-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Gamepad2 className="w-5 h-5 text-amber-400" />
              <h2 className="text-lg font-bold text-white tracking-tight">Adaptive Audio Simulator</h2>
            </div>
            <p className="text-xs text-neutral-400 mt-1">
              Simulate in-game parameter changes. Layers fade and trigger live while playback is running.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-neutral-400 uppercase">Gameplay Presets:</span>
            <button
              onClick={() => applyPreset('stealth')}
              className="px-2.5 py-1 text-xs rounded bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-300"
            >
              Shadow Stealth
            </button>
            <button
              onClick={() => applyPreset('patrol')}
              className="px-2.5 py-1 text-xs rounded bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-300"
            >
              Alert Patrol
            </button>
            <button
              onClick={() => applyPreset('combat')}
              className="px-2.5 py-1 text-xs rounded bg-amber-600/30 text-amber-300 border border-amber-500/50"
            >
              Full Combat
            </button>
            <button
              onClick={() => applyPreset('boss_climax')}
              className="px-2.5 py-1 text-xs rounded bg-rose-600/30 text-rose-300 border border-rose-500/50"
            >
              Boss Climax
            </button>
          </div>
        </div>

        {/* Sliders Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Combat Intensity */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-rose-400" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">Combat Intensity</span>
              </div>
              <span className="text-xs font-mono font-bold text-rose-400 tabular-nums">{combatIntensity}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={combatIntensity}
              onChange={(e) => setCombatIntensity(parseInt(e.target.value, 10))}
              className="w-full accent-rose-500 h-2 bg-neutral-800 rounded cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-neutral-500 mt-2 font-mono">
              <span>0 (Peaceful)</span>
              <span>50 (Skirmish)</span>
              <span>100 (Epic Boss)</span>
            </div>
          </div>

          {/* Player Stealth vs Alert */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-sky-400" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">Stealth State</span>
              </div>
              <span className="text-xs font-mono font-bold text-sky-400 tabular-nums">{stealthLevel}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={stealthLevel}
              onChange={(e) => setStealthLevel(parseInt(e.target.value, 10))}
              className="w-full accent-sky-500 h-2 bg-neutral-800 rounded cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-neutral-500 mt-2 font-mono">
              <span>Discovered</span>
              <span>Covered</span>
              <span>Hidden</span>
            </div>
          </div>

          {/* Player Health */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Heart className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">Player Health</span>
              </div>
              <span className="text-xs font-mono font-bold text-emerald-400 tabular-nums">{playerHealth}%</span>
            </div>
            <input
              type="range"
              min={5}
              max={100}
              value={playerHealth}
              onChange={(e) => setPlayerHealth(parseInt(e.target.value, 10))}
              className="w-full accent-emerald-500 h-2 bg-neutral-800 rounded cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-neutral-500 mt-2 font-mono">
              <span>Critical</span>
              <span>Wounded</span>
              <span>Full Health</span>
            </div>
          </div>
        </div>

        {/* Real-Time Layer State Monitor */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5">
          <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-4">
            Live Stem Layer Activation Matrix
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {composition.tracks.map((track) => {
              const isActive = !track.mute && track.volume > 0.05;

              return (
                <div
                  key={track.id}
                  className={`p-3 rounded border flex items-center justify-between transition-all ${
                    isActive
                      ? 'bg-neutral-850 border-neutral-700 shadow-sm'
                      : 'bg-neutral-950/60 border-neutral-900 opacity-40'
                  }`}
                >
                  <div className="truncate">
                    <span className="font-semibold text-xs text-white block truncate">{track.name}</span>
                    <span className="text-[10px] text-neutral-400 font-mono block">{track.role}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                        isActive ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/80' : 'bg-neutral-800 text-neutral-500'
                      }`}
                    >
                      {isActive ? 'ACTIVE' : 'MUTED'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
