import React, { useState, useRef, useEffect } from 'react';
import {
  Wand2,
  Trash2,
  Volume2,
  Plus,
  ZoomIn,
  ZoomOut,
  Sparkles,
  ArrowUp,
  ArrowDown,
  Layers,
  Activity,
} from 'lucide-react';
import { Composition, NoteArticulation, NoteEvent, PlaybackPosition, Track } from '../../types/music';
import { isNoteInScale, midiToNoteName } from '../../core/theory/scales';
import { globalAudioEngine } from '../../core/audio/WebAudioEngine';
import { getInstrumentById } from '../../core/instruments/library';
import { TrackIcon, getDefaultIconForInstrument } from '../common/TrackIcon';

interface PianoRollViewProps {
  composition: Composition;
  selectedTrackId: string;
  position: PlaybackPosition;
  onSelectTrack: (trackId: string) => void;
  onAddNote: (trackId: string, note: NoteEvent) => void;
  onUpdateNote: (trackId: string, noteId: string, updates: Partial<NoteEvent>) => void;
  onDeleteNote: (trackId: string, noteId: string) => void;
  onHumanizeTrack: (trackId: string) => void;
  onTransposeTrack: (trackId: string, semitones: number) => void;
}

const ARTICULATION_OPTIONS: Array<{ id: NoteArticulation; label: string; badge: string }> = [
  { id: 'sustain', label: 'Sustain', badge: 'SUS' },
  { id: 'legato', label: 'Legato', badge: 'LEG' },
  { id: 'staccato', label: 'Staccato', badge: 'STAC' },
  { id: 'spiccato', label: 'Spiccato', badge: 'SPIC' },
  { id: 'pizzicato', label: 'Pizzicato', badge: 'PIZZ' },
  { id: 'tremolo', label: 'Tremolo', badge: 'TREM' },
  { id: 'marcato', label: 'Marcato', badge: 'MARC' },
  { id: 'accent', label: 'Accent', badge: 'ACC' },
];

export const PianoRollView: React.FC<PianoRollViewProps> = ({
  composition,
  selectedTrackId,
  position,
  onSelectTrack,
  onAddNote,
  onUpdateNote,
  onDeleteNote,
  onHumanizeTrack,
  onTransposeTrack,
}) => {
  const activeTrack = composition.tracks.find((t) => t.id === selectedTrackId) || composition.tracks[0];
  const activeInstrument = getInstrumentById(activeTrack?.instrumentId || 'felt_piano');

  // Pitch range: C2 (36) to C7 (96)
  const minPitch = 36;
  const maxPitch = 96;
  const numPitches = maxPitch - minPitch + 1;

  // Grid sizing
  const [beatWidthPx, setBeatWidthPx] = useState(48); // px per quarter note
  const rowHeightPx = 18; // px per semitone
  const [snapValue, setSnapValue] = useState<number>(0.25); // 16th note default (0.25 beats)
  const [highlightScale, setHighlightScale] = useState(true);

  // Active articulation and drawing velocity
  const [activeArticulation, setActiveArticulation] = useState<NoteArticulation>('sustain');
  const [activeVelocity, setActiveVelocity] = useState<number>(90);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);

  const totalBars = composition.durationBars || 32;
  const beatsPerBar = composition.timeSignature.numerator || 4;
  const totalBeats = totalBars * beatsPerBar;
  const gridWidthPx = totalBeats * beatWidthPx;

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll vertically to average note pitch on initial open
  useEffect(() => {
    if (activeTrack && activeTrack.notes.length > 0 && scrollContainerRef.current) {
      const avgPitch =
        activeTrack.notes.reduce((acc, n) => acc + n.pitch, 0) / activeTrack.notes.length;
      const pitchIndexFromTop = maxPitch - Math.round(avgPitch);
      const targetScrollTop = Math.max(0, pitchIndexFromTop * rowHeightPx - 200);
      scrollContainerRef.current.scrollTop = targetScrollTop;
    }
  }, [selectedTrackId]);

  const selectedNote = activeTrack?.notes.find((n) => n.id === selectedNoteId);

  const handleKeyClick = (pitch: number) => {
    if (activeTrack) {
      globalAudioEngine.triggerNotePreview(activeTrack.instrumentId, pitch, activeVelocity, 0.8);
    }
  };

  const handleGridClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!activeTrack) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const clickedBeatRaw = clickX / beatWidthPx;
    const snappedBeat = Math.floor(clickedBeatRaw / snapValue) * snapValue;

    const clickedPitchIdx = Math.floor(clickY / rowHeightPx);
    const clickedPitch = maxPitch - clickedPitchIdx;

    // Check if clicked an existing note
    const existing = activeTrack.notes.find(
      (n) => n.pitch === clickedPitch && clickedBeatRaw >= n.start && clickedBeatRaw <= n.start + n.duration
    );

    if (existing) {
      setSelectedNoteId(existing.id);
    } else {
      // Create new note with selected articulation & velocity
      const newNote: NoteEvent = {
        id: `note_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        pitch: clickedPitch,
        start: snappedBeat,
        duration: snapValue * 2, // default 2 snap units
        velocity: activeVelocity,
        articulation: activeArticulation,
      };
      onAddNote(activeTrack.id, newNote);
      setSelectedNoteId(newNote.id);
      globalAudioEngine.triggerNotePreview(activeTrack.instrumentId, clickedPitch, activeVelocity, 0.4);
    }
  };

  const playheadLeftPx = position.beat * beatWidthPx;

  return (
    <div className="flex-1 flex flex-col bg-neutral-950 text-neutral-200 overflow-hidden select-none">
      {/* Top Toolbar */}
      <div className="h-10 bg-neutral-900 border-b border-neutral-800 px-4 flex items-center justify-between shrink-0">
        {/* Track Selector Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto max-w-lg">
          {composition.tracks.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                onSelectTrack(t.id);
                setSelectedNoteId(null);
              }}
              className={`px-2.5 py-1 text-xs rounded transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                t.id === selectedTrackId
                  ? 'bg-neutral-800 text-white font-semibold border border-neutral-700 shadow-xs'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <TrackIcon iconId={t.icon || getDefaultIconForInstrument(t.instrumentId)} className="w-3 h-3 text-neutral-300" />
              <span>{t.name}</span>
            </button>
          ))}
        </div>

        {/* Editing Tools */}
        <div className="flex items-center gap-3 text-xs font-mono">
          {/* Snap Selector */}
          <div className="flex items-center gap-1 bg-neutral-800 px-2 py-0.5 rounded border border-neutral-700">
            <span className="text-[10px] text-neutral-400">SNAP</span>
            <select
              value={snapValue}
              onChange={(e) => setSnapValue(parseFloat(e.target.value))}
              className="bg-transparent text-white focus:outline-none cursor-pointer"
            >
              <option value={1} className="bg-neutral-900">1/4 (Beat)</option>
              <option value={0.5} className="bg-neutral-900">1/8 Note</option>
              <option value={0.25} className="bg-neutral-900">1/16 Note</option>
              <option value={0.125} className="bg-neutral-900">1/32 Note</option>
            </select>
          </div>

          {/* Scale Highlight Toggle */}
          <button
            onClick={() => setHighlightScale(!highlightScale)}
            className={`px-2 py-1 rounded border transition-colors ${
              highlightScale
                ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500/50'
                : 'bg-neutral-800 text-neutral-400 border-neutral-700'
            }`}
          >
            Scale Guide ({composition.key} {composition.scale})
          </button>

          {/* Transpose Octave */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => onTransposeTrack(activeTrack.id, 12)}
              title="Transpose +1 Octave"
              className="p-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border border-neutral-700 transition-colors"
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onTransposeTrack(activeTrack.id, -12)}
              title="Transpose -1 Octave"
              className="p-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border border-neutral-700 transition-colors"
            >
              <ArrowDown className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Humanize button */}
          <button
            onClick={() => onHumanizeTrack(activeTrack.id)}
            title="Add subtle human timing & velocity expression"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-indigo-300 border border-neutral-700 transition-colors"
          >
            <Wand2 className="w-3.5 h-3.5 text-indigo-400" />
            <span>Humanize</span>
          </button>

          {/* Zoom */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setBeatWidthPx((w) => Math.max(24, w - 8))}
              className="p-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border border-neutral-700"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setBeatWidthPx((w) => Math.min(96, w + 8))}
              className="p-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border border-neutral-700"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Articulation & Expression Sub-toolbar */}
      <div className="h-9 bg-neutral-900/90 border-b border-neutral-800 px-4 flex items-center justify-between shrink-0 text-xs">
        {/* Articulation Selector Pills */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono text-neutral-400 font-bold uppercase tracking-wider mr-1">
            Articulation:
          </span>
          <div className="flex items-center gap-1">
            {ARTICULATION_OPTIONS.map((art) => {
              const isSelected = activeArticulation === art.id;
              return (
                <button
                  key={art.id}
                  onClick={() => {
                    setActiveArticulation(art.id);
                    if (selectedNote && activeTrack) {
                      onUpdateNote(activeTrack.id, selectedNote.id, { articulation: art.id });
                    }
                  }}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                    isSelected
                      ? 'bg-indigo-600 text-white font-bold shadow-xs'
                      : 'bg-neutral-800/80 text-neutral-400 hover:text-white hover:bg-neutral-800'
                  }`}
                >
                  {art.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Velocity Slider & Selected Note Inspector */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-neutral-400">VELOCITY</span>
            <input
              type="range"
              min={1}
              max={127}
              value={selectedNote ? selectedNote.velocity : activeVelocity}
              onChange={(e) => {
                const vel = parseInt(e.target.value, 10);
                setActiveVelocity(vel);
                if (selectedNote && activeTrack) {
                  onUpdateNote(activeTrack.id, selectedNote.id, { velocity: vel });
                }
              }}
              className="w-20 accent-indigo-500 h-1 bg-neutral-800 rounded cursor-pointer"
            />
            <span className="font-mono text-xs text-indigo-400 w-8">
              {selectedNote ? selectedNote.velocity : activeVelocity}
            </span>
          </div>

          {selectedNote && (
            <div className="flex items-center gap-2 pl-2 border-l border-neutral-800">
              <span className="text-[11px] font-mono text-neutral-300">
                Selected: <strong className="text-white">{midiToNoteName(selectedNote.pitch)}</strong> (
                {selectedNote.articulation || 'sustain'})
              </span>
              <button
                onClick={() => {
                  if (activeTrack && selectedNoteId) {
                    onDeleteNote(activeTrack.id, selectedNoteId);
                    setSelectedNoteId(null);
                  }
                }}
                className="text-rose-400 hover:text-rose-300 p-1 hover:bg-neutral-800 rounded"
                title="Delete note"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Piano Roll Scroll View */}
      <div ref={scrollContainerRef} className="flex-1 flex overflow-auto relative">
        {/* Left Vertical Keyboard */}
        <div className="w-20 bg-neutral-900 border-r border-neutral-800 shrink-0 sticky left-0 z-20 shadow-md">
          {Array.from({ length: numPitches }).map((_, idx) => {
            const pitch = maxPitch - idx;
            const noteName = midiToNoteName(pitch);
            const isBlackKey = noteName.includes('#');
            const isInScale = isNoteInScale(pitch, composition.key, composition.scale);

            return (
              <div
                key={pitch}
                onClick={() => handleKeyClick(pitch)}
                style={{ height: `${rowHeightPx}px` }}
                className={`w-full border-b border-neutral-800/80 px-2 flex items-center justify-between text-[10px] font-mono cursor-pointer transition-colors ${
                  isBlackKey
                    ? 'bg-neutral-950 text-neutral-400 hover:bg-neutral-800'
                    : 'bg-neutral-850 text-neutral-200 hover:bg-neutral-750'
                } ${highlightScale && isInScale ? 'border-l-2 border-l-indigo-400' : ''}`}
              >
                <span>{noteName}</span>
                {isInScale && <span className="w-1 h-1 rounded-full bg-indigo-500/80" />}
              </div>
            );
          })}
        </div>

        {/* Note Grid Canvas */}
        <div
          onClick={handleGridClick}
          className="relative bg-neutral-950 cursor-crosshair"
          style={{ width: `${gridWidthPx}px`, height: `${numPitches * rowHeightPx}px` }}
        >
          {/* Horizontal Pitch Rows */}
          {Array.from({ length: numPitches }).map((_, idx) => {
            const pitch = maxPitch - idx;
            const isBlackKey = midiToNoteName(pitch).includes('#');
            const isInScale = isNoteInScale(pitch, composition.key, composition.scale);

            return (
              <div
                key={pitch}
                style={{
                  top: `${idx * rowHeightPx}px`,
                  height: `${rowHeightPx}px`,
                }}
                className={`absolute left-0 right-0 border-b border-neutral-900 pointer-events-none ${
                  highlightScale && isInScale
                    ? 'bg-indigo-950/15'
                    : isBlackKey
                    ? 'bg-neutral-950'
                    : 'bg-neutral-900/30'
                }`}
              />
            );
          })}

          {/* Vertical Grid Columns (Beats & Bars) */}
          {Array.from({ length: totalBeats }).map((_, beatIdx) => {
            const isBarStart = beatIdx % beatsPerBar === 0;
            return (
              <div
                key={beatIdx}
                style={{ left: `${beatIdx * beatWidthPx}px` }}
                className={`absolute top-0 bottom-0 pointer-events-none ${
                  isBarStart ? 'border-l-2 border-neutral-800' : 'border-l border-neutral-900/70'
                }`}
              />
            );
          })}

          {/* Render Notes */}
          {activeTrack?.notes.map((note) => {
            if (note.pitch < minPitch || note.pitch > maxPitch) return null;
            const pitchIdx = maxPitch - note.pitch;
            const topPx = pitchIdx * rowHeightPx;
            const leftPx = note.start * beatWidthPx;
            const widthPx = Math.max(6, note.duration * beatWidthPx - 2);

            const isSelected = selectedNoteId === note.id;
            const artBadge =
              ARTICULATION_OPTIONS.find((a) => a.id === note.articulation)?.badge || 'SUS';

            const velOpacity = 0.5 + (note.velocity / 127) * 0.5;

            return (
              <div
                key={note.id}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedNoteId(note.id);
                  if (note.articulation) {
                    setActiveArticulation(note.articulation);
                  }
                  globalAudioEngine.triggerNotePreview(
                    activeTrack.instrumentId,
                    note.pitch,
                    note.velocity,
                    0.4
                  );
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDeleteNote(activeTrack.id, note.id);
                }}
                style={{
                  top: `${topPx + 1}px`,
                  left: `${leftPx}px`,
                  width: `${widthPx}px`,
                  height: `${rowHeightPx - 2}px`,
                  backgroundColor: activeTrack.color || activeInstrument.color,
                  opacity: velOpacity,
                }}
                className={`absolute rounded-xs text-[9px] font-mono text-white flex items-center justify-between px-1 font-bold shadow-md cursor-pointer hover:brightness-125 transition-transform truncate ${
                  isSelected ? 'ring-2 ring-white ring-offset-1 ring-offset-neutral-950 z-10' : ''
                }`}
                title={`${midiToNoteName(note.pitch)} | Start: Beat ${note.start.toFixed(2)} | Dur: ${note.duration} | Vel: ${note.velocity} | Art: ${note.articulation || 'sustain'} (Right-click to delete)`}
              >
                <span className="truncate">{midiToNoteName(note.pitch)}</span>
                {widthPx > 36 && (
                  <span className="text-[8px] opacity-75 font-normal ml-1">{artBadge}</span>
                )}
              </div>
            );
          })}

          {/* Playhead Vertical Line */}
          <div
            style={{ left: `${playheadLeftPx}px` }}
            className="absolute top-0 bottom-0 w-0.5 bg-emerald-400 z-30 pointer-events-none shadow-[0_0_8px_rgba(52,211,153,0.8)]"
          />
        </div>
      </div>
    </div>
  );
};
