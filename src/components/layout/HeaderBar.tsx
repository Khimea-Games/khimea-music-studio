import React, { useState } from 'react';
import {
  Play,
  Pause,
  Square,
  Repeat,
  Volume2,
  Download,
  RotateCcw,
  RotateCw,
  Sparkles,
  Sliders,
  Music,
  BookOpen,
  Gamepad2,
  Compass,
  Layers,
  ChevronDown,
  Keyboard,
  Package,
} from 'lucide-react';
import { Composition, PlaybackPosition } from '../../types/music';

export type DemoId = 'dark_forest' | 'orc_boss' | 'romantic';
import { MidiExporter } from '../../core/export/midiExport';
import { GamePackageExporter } from '../../core/export/gamePackageExport';
import { AutoSaveIndicator } from './AutoSaveIndicator';

export type ActiveView =
  | 'arrangement'
  | 'pianoroll'
  | 'mixer'
  | 'adaptive'
  | 'motifs'
  | 'ai'
  | 'knowledge'
  | 'library';

interface HeaderBarProps {
  composition: Composition;
  isPlaying: boolean;
  isPaused: boolean;
  position: PlaybackPosition;
  activeView: ActiveView;
  canUndo: boolean;
  canRedo: boolean;
  onViewChange: (view: ActiveView) => void;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onToggleLoop: () => void;
  onTempoChange: (newBpm: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onLoadDemo: (demoId: DemoId) => void;
  onExportWav: () => void;
  isExportingWav: boolean;
  onOpenShortcuts: () => void;
  onRestoreComposition: (comp: Composition, description: string) => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  composition,
  isPlaying,
  isPaused,
  position,
  activeView,
  canUndo,
  canRedo,
  onViewChange,
  onPlay,
  onPause,
  onStop,
  onToggleLoop,
  onTempoChange,
  onUndo,
  onRedo,
  onLoadDemo,
  onExportWav,
  isExportingWav,
  onOpenShortcuts,
  onRestoreComposition,
}) => {
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showDemoMenu, setShowDemoMenu] = useState(false);

  const handleExportMidi = () => {
    const blob = MidiExporter.exportToMidi(composition);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${composition.title.toLowerCase().replace(/[^a-z0-9]/g, '_')}.mid`;
    a.click();
    setShowExportMenu(false);
  };

  const handleExportGamePackage = () => {
    const blob = GamePackageExporter.exportManifestJsonBlob(composition);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${composition.title.toLowerCase().replace(/[^a-z0-9]/g, '_')}_game_manifest.json`;
    a.click();
    setShowExportMenu(false);
  };

  return (
    <header className="h-14 bg-neutral-950 border-b border-neutral-800 px-4 flex items-center justify-between text-neutral-200 select-none z-30 shrink-0">
      {/* Zone 1: Brand & Project Info */}
      <div className="flex items-center gap-4 shrink-0">
        <div className="flex items-center gap-2 shrink-0">
          <img
            src="/brand/isotipo-128.png"
            alt="Khimea Games"
            width={28}
            height={28}
            className="w-7 h-7 rounded-md object-cover"
          />
          <div>
            <span className="font-semibold text-sm tracking-tight text-white block leading-tight whitespace-nowrap">
              Khimea Music Studio
            </span>
            <span className="text-[10px] text-neutral-400 font-mono block leading-tight truncate max-w-[140px]">
              {composition.title}
            </span>
          </div>
        </div>

        {/* Demo Selector Button */}
        <div className="relative">
          <button
            onClick={() => setShowDemoMenu(!showDemoMenu)}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-neutral-300 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700/80 rounded transition-colors whitespace-nowrap"
          >
            <span>Demos</span>
            <ChevronDown className="w-3 h-3 text-neutral-400" />
          </button>

          {showDemoMenu && (
            <div className="absolute left-0 mt-1 w-56 max-h-[75vh] overflow-y-auto bg-neutral-900 border border-neutral-800 rounded-md shadow-xl py-1 z-50">
              <button
                onClick={() => {
                  onLoadDemo('dark_forest');
                  setShowDemoMenu(false);
                }}
                className="w-full text-left px-3 py-2 text-xs hover:bg-neutral-800 flex flex-col transition-colors"
              >
                <span className="font-medium text-sky-400">Dark Forest (Exploration)</span>
                <span className="text-[10px] text-neutral-400">72 BPM · D Minor · Ambient fantasy</span>
              </button>
              <button
                onClick={() => {
                  onLoadDemo('orc_boss');
                  setShowDemoMenu(false);
                }}
                className="w-full text-left px-3 py-2 text-xs hover:bg-neutral-800 flex flex-col transition-colors border-t border-neutral-800/60"
              >
                <span className="font-medium text-rose-400">Orc Boss (Combat)</span>
                <span className="text-[10px] text-neutral-400">132 BPM · D Phrygian · Heavy tribal brass</span>
              </button>
              <button
                onClick={() => {
                  onLoadDemo('romantic');
                  setShowDemoMenu(false);
                }}
                className="w-full text-left px-3 py-2 text-xs hover:bg-neutral-800 flex flex-col transition-colors border-t border-neutral-800/60"
              >
                <span className="font-medium text-pink-400">Eternity's Promise (Romantic Love Theme)</span>
                <span className="text-[10px] text-neutral-400">68 BPM · G Major · Piano, Cello, Harp & Lush Strings</span>
              </button>
            </div>
          )}
        </div>

        {/* Autosave Status Pill & Dropdown */}
        <AutoSaveIndicator
          currentComposition={composition}
          onRestoreComposition={onRestoreComposition}
        />
      </div>

      {/* Zone 2: Navigation Views */}
      <nav className="flex items-center gap-1 bg-neutral-900/90 p-1 rounded-lg border border-neutral-800/80">
        <button
          onClick={() => onViewChange('arrangement')}
          className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
            activeView === 'arrangement'
              ? 'bg-neutral-800 text-white shadow-sm font-semibold'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Arrangement</span>
        </button>

        <button
          onClick={() => onViewChange('pianoroll')}
          className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
            activeView === 'pianoroll'
              ? 'bg-neutral-800 text-white shadow-sm font-semibold'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <Music className="w-3.5 h-3.5" />
          <span>Piano Roll</span>
        </button>

        <button
          onClick={() => onViewChange('mixer')}
          className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
            activeView === 'mixer'
              ? 'bg-neutral-800 text-white shadow-sm font-semibold'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Mixer</span>
        </button>

        <button
          onClick={() => onViewChange('adaptive')}
          className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
            activeView === 'adaptive'
              ? 'bg-neutral-800 text-white shadow-sm font-semibold'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <Gamepad2 className="w-3.5 h-3.5 text-amber-400" />
          <span>Adaptive Simulator</span>
        </button>

        <button
          onClick={() => onViewChange('motifs')}
          className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
            activeView === 'motifs'
              ? 'bg-neutral-800 text-white shadow-sm font-semibold'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <Compass className="w-3.5 h-3.5 text-purple-400" />
          <span>Motifs</span>
        </button>

        <button
          onClick={() => onViewChange('ai')}
          className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
            activeView === 'ai'
              ? 'bg-indigo-600/80 text-white shadow-sm font-semibold'
              : 'text-indigo-400 hover:text-indigo-200'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>AI Composer</span>
        </button>

        <button
          onClick={() => onViewChange('knowledge')}
          className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
            activeView === 'knowledge'
              ? 'bg-neutral-800 text-white shadow-sm font-semibold'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>Knowledge & MCP</span>
        </button>

        <button
          onClick={() => onViewChange('library')}
          className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
            activeView === 'library'
              ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/50 shadow-sm font-semibold'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <Package className="w-3.5 h-3.5 text-indigo-400" />
          <span>Sound Library</span>
        </button>
      </nav>

      {/* Zone 3: Transport & Primary Actions */}
      <div className="flex items-center gap-3">
        {/* Undo / Redo */}
        <div className="flex items-center gap-1 border-r border-neutral-800 pr-2">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo"
            className="p-1 rounded text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900 disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo"
            className="p-1 rounded text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900 disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Transport Display Counter */}
        <div className="flex items-center gap-2 bg-neutral-900/80 px-2.5 py-1 rounded border border-neutral-800 text-xs font-mono tabular-nums">
          <span className="text-neutral-400 text-[10px]">BAR</span>
          <span className="text-white font-semibold">{String(position.bar).padStart(2, '0')}</span>
          <span className="text-neutral-600">:</span>
          <span className="text-neutral-300">{String(Math.floor(position.beat % 4) + 1).padStart(2, '0')}</span>
          <span className="text-neutral-600">:</span>
          <span className="text-neutral-400">{String(position.tick).padStart(2, '0')}</span>
        </div>

        {/* Playback Controls */}
        <div className="flex items-center gap-1">
          {isPlaying ? (
            <button
              onClick={onPause}
              title="Pause (Space)"
              className="p-1.5 rounded bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold shadow transition-colors"
            >
              <Pause className="w-4 h-4 fill-current" />
            </button>
          ) : (
            <button
              onClick={onPlay}
              title="Play (Space)"
              className="p-1.5 rounded bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold shadow transition-colors"
            >
              <Play className="w-4 h-4 fill-current ml-0.5" />
            </button>
          )}

          <button
            onClick={onStop}
            title="Stop"
            className="p-1.5 rounded bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-800 transition-colors"
          >
            <Square className="w-4 h-4 fill-current" />
          </button>

          <button
            onClick={onToggleLoop}
            title="Toggle Loop"
            className={`p-1.5 rounded border transition-colors ${
              composition.mode === 'loop'
                ? 'bg-sky-500/20 text-sky-400 border-sky-500/40'
                : 'bg-neutral-900 text-neutral-500 border-neutral-800 hover:text-neutral-300'
            }`}
          >
            <Repeat className="w-4 h-4" />
          </button>
        </div>

        {/* BPM & Key Badges */}
        <div className="flex items-center gap-2 text-xs font-mono border-l border-neutral-800 pl-3">
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-neutral-500">BPM</span>
            <input
              type="number"
              min={40}
              max={260}
              value={composition.tempo}
              onChange={(e) => onTempoChange(Number(e.target.value))}
              className="w-12 bg-neutral-900 text-neutral-200 border border-neutral-800 rounded px-1.5 py-0.5 text-center font-mono tabular-nums focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="text-[11px] text-neutral-300 bg-neutral-900 px-2 py-0.5 rounded border border-neutral-800">
            {composition.key} {composition.scale.replace('_', ' ')}
          </div>
        </div>

        {/* Export Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowExportMenu(!showExportMenu)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded transition-colors whitespace-nowrap shadow"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export</span>
            <ChevronDown className="w-3 h-3 ml-0.5 opacity-80" />
          </button>

          {showExportMenu && (
            <div className="absolute right-0 mt-1 w-56 bg-neutral-900 border border-neutral-800 rounded-md shadow-xl py-1 z-50">
              <button
                onClick={() => {
                  onExportWav();
                  setShowExportMenu(false);
                }}
                disabled={isExportingWav}
                className="w-full text-left px-3 py-2 text-xs hover:bg-neutral-800 flex items-center justify-between transition-colors disabled:opacity-50"
              >
                <div>
                  <span className="font-medium text-white block">Render Audio (.WAV)</span>
                  <span className="text-[10px] text-neutral-400">Pristine 44.1kHz 16-bit Master</span>
                </div>
                {isExportingWav && <span className="text-[10px] text-indigo-400 animate-pulse">Rendering...</span>}
              </button>

              <button
                onClick={handleExportMidi}
                className="w-full text-left px-3 py-2 text-xs hover:bg-neutral-800 flex flex-col transition-colors border-t border-neutral-800/80"
              >
                <span className="font-medium text-white">Standard MIDI (.MID)</span>
                <span className="text-[10px] text-neutral-400">Multi-track MIDI 1.0 sequence</span>
              </button>

              <button
                onClick={handleExportGamePackage}
                className="w-full text-left px-3 py-2 text-xs hover:bg-neutral-800 flex flex-col transition-colors border-t border-neutral-800/80"
              >
                <span className="font-medium text-amber-400">Game Engine Package (.JSON)</span>
                <span className="text-[10px] text-neutral-400">Unity, Unreal, Godot loop metadata</span>
              </button>
            </div>
          )}
        </div>

        {/* Keyboard Shortcuts Helper Button */}
        <button
          onClick={onOpenShortcuts}
          title="Keyboard Shortcuts (?)"
          className="p-1.5 rounded bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 border border-neutral-800 transition-colors"
        >
          <Keyboard className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
