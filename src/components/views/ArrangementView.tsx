import React, { useState } from 'react';
import { Volume2, VolumeX, Eye, Plus, Trash2, Music2, Disc, ChevronDown } from 'lucide-react';
import { Composition, PlaybackPosition, Track } from '../../types/music';
import { getInstrumentById } from '../../core/instruments/library';
import { TrackIcon, TRACK_ICON_OPTIONS, getDefaultIconForInstrument } from '../common/TrackIcon';

interface ArrangementViewProps {
  composition: Composition;
  position: PlaybackPosition;
  selectedTrackId: string;
  onSelectTrack: (trackId: string) => void;
  onOpenPianoRoll: (trackId: string) => void;
  onUpdateTrack: (trackId: string, updates: Partial<Track>) => void;
  onDeleteTrack: (trackId: string) => void;
  onAddTrackModal: () => void;
  onSeek: (beat: number) => void;
}

export const ArrangementView: React.FC<ArrangementViewProps> = ({
  composition,
  position,
  selectedTrackId,
  onSelectTrack,
  onOpenPianoRoll,
  onUpdateTrack,
  onDeleteTrack,
  onAddTrackModal,
  onSeek,
}) => {
  const [iconPickerTrackId, setIconPickerTrackId] = useState<string | null>(null);
  const totalBars = composition.durationBars || 32;
  const beatsPerBar = composition.timeSignature.numerator || 4;
  const totalBeats = totalBars * beatsPerBar;

  // Pixels per bar
  const barWidthPx = 48;
  const timelineWidth = totalBars * barWidthPx;

  const currentBeat = position.beat;
  const playheadLeftPx = (currentBeat / beatsPerBar) * barWidthPx;

  const handleRulerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickedBar = Math.floor(clickX / barWidthPx);
    onSeek(clickedBar * beatsPerBar);
  };

  return (
    <div className="flex-1 flex flex-col bg-neutral-950 text-neutral-200 overflow-hidden select-none">
      {/* Top Section Markers Lane */}
      <div className="h-7 bg-neutral-900 border-b border-neutral-800 flex items-center shrink-0 pl-64 overflow-x-hidden">
        <div className="flex relative" style={{ width: `${timelineWidth}px` }}>
          {composition.sections.map((sec) => {
            const startPx = (sec.startBar - 1) * barWidthPx;
            const widthPx = sec.barCount * barWidthPx;
            return (
              <div
                key={sec.id}
                style={{ left: `${startPx}px`, width: `${widthPx}px` }}
                className="absolute top-0 bottom-0 border-l border-neutral-700/60 bg-neutral-800/40 px-2 flex items-center text-[10px] font-mono tracking-wider text-neutral-300 font-semibold truncate hover:bg-neutral-800 transition-colors"
                title={`${sec.name} (Bars ${sec.startBar} - ${sec.startBar + sec.barCount - 1})`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 mr-1.5 shrink-0" />
                <span className="truncate">{sec.name}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Timeline Ruler Lane */}
      <div
        onClick={handleRulerClick}
        className="h-6 bg-neutral-900/90 border-b border-neutral-800 flex items-center shrink-0 pl-64 cursor-pointer relative"
      >
        <div className="flex relative" style={{ width: `${timelineWidth}px` }}>
          {Array.from({ length: totalBars }).map((_, barIdx) => (
            <div
              key={barIdx}
              style={{ width: `${barWidthPx}px` }}
              className="h-6 border-l border-neutral-800 flex items-center px-1 text-[10px] font-mono text-neutral-500 shrink-0"
            >
              {barIdx + 1}
            </div>
          ))}

          {/* Playhead marker in ruler */}
          <div
            style={{ left: `${playheadLeftPx}px` }}
            className="absolute top-0 bottom-0 w-0.5 bg-emerald-400 z-20 pointer-events-none"
          >
            <div className="w-2 h-2 -ml-[3px] bg-emerald-400 rotate-45" />
          </div>
        </div>
      </div>

      {/* Multi-Track Grid View */}
      <div className="flex-1 flex overflow-auto relative">
        {/* Left Track Headers Panel */}
        <div className="w-64 bg-neutral-900 border-r border-neutral-800 shrink-0 sticky left-0 z-10 flex flex-col">
          {composition.tracks.map((track) => {
            const inst = getInstrumentById(track.instrumentId);
            const isSelected = track.id === selectedTrackId;

            const effectiveIcon = track.icon || getDefaultIconForInstrument(track.instrumentId);

            return (
              <div
                key={track.id}
                onClick={() => onSelectTrack(track.id)}
                className={`h-20 border-b border-neutral-800 p-2 flex flex-col justify-between transition-colors cursor-pointer relative ${
                  isSelected ? 'bg-neutral-800/80 border-l-4 border-l-indigo-500' : 'hover:bg-neutral-850'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 truncate">
                    {/* Clickable Icon that opens icon picker */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIconPickerTrackId(iconPickerTrackId === track.id ? null : track.id);
                      }}
                      title="Change track icon"
                      className="w-5 h-5 rounded flex items-center justify-center text-white shrink-0 hover:brightness-125 transition-transform hover:scale-110 shadow-xs"
                      style={{ backgroundColor: track.color || inst.color }}
                    >
                      <TrackIcon iconId={effectiveIcon} className="w-3 h-3" />
                    </button>
                    <span className="font-semibold text-xs text-white truncate max-w-[125px]">
                      {track.name}
                    </span>
                  </div>

                  {/* Icon Selector Popover */}
                  {iconPickerTrackId === track.id && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="absolute left-8 top-8 z-50 bg-neutral-900 border border-neutral-700 rounded-lg p-2 shadow-2xl w-48 grid grid-cols-5 gap-1 animate-in fade-in zoom-in-95 duration-100"
                    >
                      {TRACK_ICON_OPTIONS.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            onUpdateTrack(track.id, { icon: opt.id });
                            setIconPickerTrackId(null);
                          }}
                          title={opt.name}
                          className={`p-1.5 rounded flex items-center justify-center transition-colors ${
                            effectiveIcon === opt.id
                              ? 'bg-indigo-600 text-white'
                              : 'bg-neutral-950 text-neutral-400 hover:text-white hover:bg-neutral-800'
                          }`}
                        >
                          <opt.icon className="w-3.5 h-3.5" />
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onUpdateTrack(track.id, { mute: !track.mute });
                      }}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold transition-colors ${
                        track.mute ? 'bg-amber-600 text-white' : 'bg-neutral-800 text-neutral-400 hover:text-white'
                      }`}
                      title="Mute"
                    >
                      M
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onUpdateTrack(track.id, { solo: !track.solo });
                      }}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold transition-colors ${
                        track.solo ? 'bg-emerald-600 text-white' : 'bg-neutral-800 text-neutral-400 hover:text-white'
                      }`}
                      title="Solo"
                    >
                      S
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteTrack(track.id);
                      }}
                      className="p-1 text-neutral-500 hover:text-rose-400 transition-colors"
                      title="Delete Track"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[10px] text-neutral-400 font-mono">
                  <span className="truncate max-w-[120px]">{inst.name}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenPianoRoll(track.id);
                    }}
                    className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 transition-colors"
                  >
                    <Music2 className="w-3 h-3" />
                    <span>Edit</span>
                  </button>
                </div>

                {/* Volume & Pan Mini Controls */}
                <div className="flex items-center gap-2 text-[10px] font-mono">
                  <div className="flex items-center gap-1 flex-1">
                    <span className="text-neutral-500 text-[9px]">VOL</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={track.volume}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => onUpdateTrack(track.id, { volume: parseFloat(e.target.value) })}
                      className="w-full accent-indigo-500 h-1 bg-neutral-700 rounded cursor-pointer"
                    />
                  </div>
                  <div className="flex items-center gap-1 w-16">
                    <span className="text-neutral-500 text-[9px]">PAN</span>
                    <input
                      type="range"
                      min={-1}
                      max={1}
                      step={0.1}
                      value={track.pan}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => onUpdateTrack(track.id, { pan: parseFloat(e.target.value) })}
                      className="w-full accent-neutral-400 h-1 bg-neutral-700 rounded cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            );
          })}

          {/* Add Track Button */}
          <div className="p-3 border-b border-neutral-800">
            <button
              onClick={onAddTrackModal}
              className="w-full py-1.5 px-3 rounded border border-dashed border-neutral-700 hover:border-neutral-500 text-neutral-400 hover:text-white flex items-center justify-center gap-1.5 text-xs transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add New Track</span>
            </button>
          </div>
        </div>

        {/* Right Timeline Grid Canvas */}
        <div className="relative" style={{ width: `${timelineWidth}px` }}>
          {/* Vertical Bar Grid lines */}
          <div className="absolute inset-0 flex pointer-events-none">
            {Array.from({ length: totalBars }).map((_, barIdx) => (
              <div
                key={barIdx}
                style={{ width: `${barWidthPx}px` }}
                className="h-full border-r border-neutral-900/60 shrink-0"
              />
            ))}
          </div>

          {/* Tracks Clips */}
          {composition.tracks.map((track) => {
            const isSelected = track.id === selectedTrackId;
            const inst = getInstrumentById(track.instrumentId);

            return (
              <div
                key={track.id}
                onClick={() => onSelectTrack(track.id)}
                onDoubleClick={() => onOpenPianoRoll(track.id)}
                className={`h-20 border-b border-neutral-800/80 relative flex items-center px-1 cursor-pointer transition-colors ${
                  isSelected ? 'bg-neutral-900/40' : 'hover:bg-neutral-900/20'
                }`}
              >
                {/* Notes rendered as mini bars in the clip block */}
                {track.notes.map((note) => {
                  const leftPx = (note.start / beatsPerBar) * barWidthPx;
                  const widthPx = Math.max(3, (note.duration / beatsPerBar) * barWidthPx - 1);
                  // Normalize pitch 24-96 to vertical percentage
                  const normPitch = Math.max(0, Math.min(1, (note.pitch - 30) / 60));
                  const topPercent = 85 - normPitch * 70;

                  return (
                    <div
                      key={note.id}
                      style={{
                        left: `${leftPx}px`,
                        width: `${widthPx}px`,
                        top: `${topPercent}%`,
                        backgroundColor: track.color || inst.color,
                      }}
                      className="absolute h-1.5 rounded-xs opacity-85 shadow-sm pointer-events-none"
                    />
                  );
                })}
              </div>
            );
          })}

          {/* Playhead vertical line spanning all tracks */}
          <div
            style={{ left: `${playheadLeftPx}px` }}
            className="absolute top-0 bottom-0 w-0.5 bg-emerald-400 z-20 pointer-events-none shadow-[0_0_8px_rgba(52,211,153,0.8)]"
          />
        </div>
      </div>
    </div>
  );
};
