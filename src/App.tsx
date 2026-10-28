import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Composition, CompositionVersion, NoteEvent, PlaybackPosition, Track } from './types/music';
import { CompositionEngine } from './core/composition/CompositionEngine';
import { CommandManager } from './core/commands/CommandManager';
import { globalAudioEngine } from './core/audio/WebAudioEngine';
import { HeaderBar, ActiveView, DemoId } from './components/layout/HeaderBar';
import { ArrangementView } from './components/views/ArrangementView';
import { PianoRollView } from './components/views/PianoRollView';
import { MixerView } from './components/views/MixerView';
import { AdaptiveGameView } from './components/views/AdaptiveGameView';
import { MotifsAndPalettesView } from './components/views/MotifsAndPalettesView';
import { AiComposerView } from './components/views/AiComposerView';
import { KnowledgeAndMcpView } from './components/views/KnowledgeAndMcpView';
import { SoundLibraryView } from './components/views/SoundLibraryView';
import { AddTrackModal } from './components/modals/AddTrackModal';
import { ShortcutsModal } from './components/modals/ShortcutsModal';
import { CrashRecoveryBanner } from './components/layout/CrashRecoveryBanner';
import { HumanizationEngine } from './core/humanization/humanizer';
import { globalAutoSaveManager } from './core/storage/autoSaveManager';
import { ReverbPreset } from './types/music';

export function App() {
  // Check for auto-saved draft from a prior session/crash
  const savedDraft = useMemo(() => globalAutoSaveManager.loadDraft(), []);

  // Initial composition: load saved draft if present, otherwise default Dark Forest demo
  const initialComposition = useMemo(() => {
    if (savedDraft?.composition) {
      return savedDraft.composition;
    }
    return CompositionEngine.getDemoDarkForest();
  }, [savedDraft]);

  const [composition, setComposition] = useState<Composition>(initialComposition);
  const commandManagerRef = useRef<CommandManager>(new CommandManager(initialComposition));

  // Show recovery banner if we restored an autosaved draft
  const [recoveredDraft, setRecoveredDraft] = useState<{
    savedAt: number;
    composition: Composition;
  } | null>(() => {
    if (savedDraft?.composition && savedDraft.savedAt) {
      return {
        savedAt: savedDraft.savedAt,
        composition: savedDraft.composition,
      };
    }
    return null;
  });

  // Playback state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [position, setPosition] = useState<PlaybackPosition>({
    beat: 0,
    bar: 1,
    tick: 0,
    seconds: 0,
  });

  const [masterVolume, setMasterVolume] = useState<number>(0.85);
  const [activeView, setActiveView] = useState<ActiveView>('arrangement');
  const [selectedTrackId, setSelectedTrackId] = useState<string>(initialComposition.tracks[0]?.id || '');
  const [isAddTrackOpen, setIsAddTrackOpen] = useState<boolean>(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState<boolean>(false);
  const [isExportingWav, setIsExportingWav] = useState<boolean>(false);

  // Version history
  const [versions, setVersions] = useState<CompositionVersion[]>([
    {
      id: 'v1_initial',
      compositionId: initialComposition.id,
      versionNumber: 1,
      title: 'Dark Forest (Initial Composition)',
      description: 'Exploration in D minor, 72 BPM, ambient dark fantasy.',
      timestamp: new Date().toISOString(),
      snapshot: initialComposition,
    },
  ]);

  // Load composition into audio engine on start or change
  useEffect(() => {
    globalAudioEngine.loadComposition(composition);
  }, [composition]);

  // Subscribe to audio engine callbacks
  useEffect(() => {
    const unsubPos = globalAudioEngine.onPlayheadUpdate((pos) => {
      setPosition(pos);
    });

    const unsubState = globalAudioEngine.onStateChange((playing, paused) => {
      setIsPlaying(playing);
      setIsPaused(paused);
    });

    return () => {
      unsubPos();
      unsubState();
    };
  }, []);

  // Periodic autosave to prevent data loss on browser crashes
  useEffect(() => {
    globalAutoSaveManager.startPeriodicAutoSave(12000);
    return () => {
      globalAutoSaveManager.stopPeriodicAutoSave();
    };
  }, []);

  // Global DAW Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is currently typing in an input, textarea or contenteditable element
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement)?.isContentEditable
      ) {
        return;
      }

      // Help Modal (?)
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        setIsShortcutsOpen((prev) => !prev);
        return;
      }

      // Play / Pause (Space)
      if (e.code === 'Space') {
        e.preventDefault();
        if (isPlaying) {
          globalAudioEngine.pause();
        } else {
          globalAudioEngine.play();
        }
        return;
      }

      // Undo / Redo
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
        return;
      }

      // Escape: close modal or stop
      if (e.key === 'Escape') {
        if (isShortcutsOpen) {
          setIsShortcutsOpen(false);
          return;
        }
        if (isAddTrackOpen) {
          setIsAddTrackOpen(false);
          return;
        }
        globalAudioEngine.stop();
        return;
      }

      // Toggle Loop (L)
      if (e.key.toLowerCase() === 'l' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        handleToggleLoop();
        return;
      }

      // Mute (M) / Solo (S) selected track
      if (selectedTrackId) {
        const currentTrack = composition.tracks.find((t) => t.id === selectedTrackId);
        if (currentTrack) {
          if (e.key.toLowerCase() === 'm' && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            handleUpdateTrack(selectedTrackId, { mute: !currentTrack.mute });
            return;
          }
          if (e.key.toLowerCase() === 's' && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            handleUpdateTrack(selectedTrackId, { solo: !currentTrack.solo });
            return;
          }
        }
      }

      // Views Navigation (1-7)
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        switch (e.key) {
          case '1':
            setActiveView('arrangement');
            break;
          case '2':
            setActiveView('pianoroll');
            break;
          case '3':
            setActiveView('mixer');
            break;
          case '4':
            setActiveView('adaptive');
            break;
          case '5':
            setActiveView('motifs');
            break;
          case '6':
            setActiveView('ai');
            break;
          case '7':
            setActiveView('knowledge');
            break;
          case '8':
            setActiveView('library');
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, composition, selectedTrackId, isShortcutsOpen, isAddTrackOpen]);

  // --- Transport Handlers ---

  const handlePlay = () => {
    globalAudioEngine.play();
  };

  const handlePause = () => {
    globalAudioEngine.pause();
  };

  const handleStop = () => {
    globalAudioEngine.stop();
  };

  const handleSeek = (beat: number) => {
    globalAudioEngine.seek(beat);
  };

  const handleToggleLoop = () => {
    const newLoop = composition.mode !== 'loop';
    const updated = {
      ...composition,
      mode: (newLoop ? 'loop' : 'linear') as any,
    };
    applyCompositionChange(updated, 'Toggle Loop');
    globalAudioEngine.setLoop(newLoop);
  };

  const handleTempoChange = (newBpm: number) => {
    const updated = { ...composition, tempo: newBpm };
    applyCompositionChange(updated, `Tempo changed to ${newBpm} BPM`);
    globalAudioEngine.setBpm(newBpm);
  };

  const handleMasterVolumeChange = (vol: number) => {
    setMasterVolume(vol);
    globalAudioEngine.setMasterVolume(vol);
  };

  const handleSelectReverbPreset = (preset: ReverbPreset) => {
    const updated = { ...composition, reverbPreset: preset };
    applyCompositionChange(updated, `Reverb preset: ${preset}`);
    globalAudioEngine.setReverbPreset(preset);
  };

  // --- Composition Mutations through CommandManager ---

  const applyCompositionChange = (newComp: Composition, desc: string) => {
    commandManagerRef.current.setComposition(newComp);
    setComposition(newComp);
    globalAutoSaveManager.queueAutoSave(newComp, desc);
  };

  const handleUndo = () => {
    const undone = commandManagerRef.current.undo();
    if (undone) {
      setComposition(undone);
      globalAutoSaveManager.queueAutoSave(undone, 'Undo action');
    }
  };

  const handleRedo = () => {
    const redone = commandManagerRef.current.redo();
    if (redone) {
      setComposition(redone);
      globalAutoSaveManager.queueAutoSave(redone, 'Redo action');
    }
  };

  // Track edits
  const handleUpdateTrack = (trackId: string, updates: Partial<Track>) => {
    const updatedTracks = composition.tracks.map((t) => (t.id === trackId ? { ...t, ...updates } : t));
    const newComp = { ...composition, tracks: updatedTracks };
    applyCompositionChange(newComp, `Update track ${trackId}`);

    if (updates.volume !== undefined) globalAudioEngine.setTrackVolume(trackId, updates.volume);
    if (updates.pan !== undefined) globalAudioEngine.setTrackPan(trackId, updates.pan);
    if (updates.mute !== undefined) globalAudioEngine.setTrackMute(trackId, updates.mute);
    if (updates.solo !== undefined) globalAudioEngine.setTrackSolo(trackId, updates.solo);
    if (updates.reverbSend !== undefined) globalAudioEngine.setTrackReverbSend(trackId, updates.reverbSend);
    if (updates.filterCutoff !== undefined) globalAudioEngine.setTrackFilterCutoff(trackId, updates.filterCutoff);
  };

  const handleDeleteTrack = (trackId: string) => {
    const updatedTracks = composition.tracks.filter((t) => t.id !== trackId);
    const newComp = { ...composition, tracks: updatedTracks };
    applyCompositionChange(newComp, `Delete track ${trackId}`);
    if (selectedTrackId === trackId && updatedTracks.length > 0) {
      setSelectedTrackId(updatedTracks[0].id);
    }
  };

  const handleAddTrack = (newTrack: Track) => {
    const newComp = { ...composition, tracks: [...composition.tracks, newTrack] };
    applyCompositionChange(newComp, `Add track ${newTrack.name}`);
    setSelectedTrackId(newTrack.id);
  };

  // Note edits in Piano Roll
  const handleAddNote = (trackId: string, note: NoteEvent) => {
    const updatedTracks = composition.tracks.map((t) => {
      if (t.id === trackId) {
        return { ...t, notes: [...t.notes, note].sort((a, b) => a.start - b.start) };
      }
      return t;
    });
    applyCompositionChange({ ...composition, tracks: updatedTracks }, 'Add Note');
  };

  const handleUpdateNote = (trackId: string, noteId: string, updates: Partial<NoteEvent>) => {
    const updatedTracks = composition.tracks.map((t) => {
      if (t.id === trackId) {
        const newNotes = t.notes.map((n) => (n.id === noteId ? { ...n, ...updates } : n));
        return { ...t, notes: newNotes.sort((a, b) => a.start - b.start) };
      }
      return t;
    });
    applyCompositionChange({ ...composition, tracks: updatedTracks }, 'Update Note');
  };

  const handleDeleteNote = (trackId: string, noteId: string) => {
    const updatedTracks = composition.tracks.map((t) => {
      if (t.id === trackId) {
        return { ...t, notes: t.notes.filter((n) => n.id !== noteId) };
      }
      return t;
    });
    applyCompositionChange({ ...composition, tracks: updatedTracks }, 'Delete Note');
  };

  const handleHumanizeTrack = (trackId: string) => {
    const track = composition.tracks.find((t) => t.id === trackId);
    if (!track) return;
    const humanized = HumanizationEngine.humanizeTrack(track, { timingAmount: 0.35, velocityAmount: 0.45 });
    handleUpdateTrack(trackId, { notes: humanized.notes });
  };

  const handleTransposeTrack = (trackId: string, semitones: number) => {
    const track = composition.tracks.find((t) => t.id === trackId);
    if (!track || track.role === 'percussion') return;
    const transposedNotes = track.notes.map((n) => ({
      ...n,
      pitch: Math.max(0, Math.min(127, n.pitch + semitones)),
    }));
    handleUpdateTrack(trackId, { notes: transposedNotes });
  };

  // Switch demo compositions
  const handleLoadDemo = (demoId: DemoId) => {
    globalAudioEngine.stop();
    const demo =
      demoId === 'romantic'
        ? CompositionEngine.getDemoRomanticTheme()
        : demoId === 'orc_boss'
        ? CompositionEngine.getDemoOrcBoss()
        : CompositionEngine.getDemoDarkForest();
    commandManagerRef.current = new CommandManager(demo);
    setComposition(demo);
    setSelectedTrackId(demo.tracks[0]?.id || '');

    // Record in version history
    const nextVer: CompositionVersion = {
      id: `v_${Date.now()}`,
      compositionId: demo.id,
      versionNumber: versions.length + 1,
      title: demo.title,
      description: `Loaded demo: ${demoId}`,
      timestamp: new Date().toISOString(),
      snapshot: demo,
    };
    setVersions((prev) => [nextVer, ...prev]);
    globalAutoSaveManager.saveNow(demo, `Loaded demo: ${demoId}`);
  };

  // AI & Versioning updates
  const handleApplyNewComposition = (newComp: Composition, versionTitle: string) => {
    globalAudioEngine.stop();
    commandManagerRef.current = new CommandManager(newComp);
    setComposition(newComp);
    setSelectedTrackId(newComp.tracks[0]?.id || '');

    const newVer: CompositionVersion = {
      id: `v_${Date.now()}`,
      compositionId: newComp.id,
      versionNumber: versions.length + 1,
      title: versionTitle,
      description: `BPM: ${newComp.tempo} · ${newComp.key} ${newComp.scale}`,
      timestamp: new Date().toISOString(),
      snapshot: newComp,
    };
    setVersions((prev) => [newVer, ...prev]);
    globalAutoSaveManager.saveNow(newComp, versionTitle);
  };

  const handleRestoreVersion = (ver: CompositionVersion) => {
    globalAudioEngine.stop();
    commandManagerRef.current = new CommandManager(ver.snapshot);
    setComposition(ver.snapshot);
    setSelectedTrackId(ver.snapshot.tracks[0]?.id || '');
    globalAutoSaveManager.saveNow(ver.snapshot, `Restored version: ${ver.title}`);
  };

  // Restore an auto-saved checkpoint or previous draft
  const handleRestoreCheckpointComposition = (restoredComp: Composition, desc: string) => {
    globalAudioEngine.stop();
    commandManagerRef.current = new CommandManager(restoredComp);
    setComposition(restoredComp);
    setSelectedTrackId(restoredComp.tracks[0]?.id || '');
    globalAutoSaveManager.saveNow(restoredComp, desc);
  };

  // WAV Audio Render Export
  const handleExportWav = async () => {
    if (isExportingWav) return;
    setIsExportingWav(true);
    try {
      const blob = await globalAudioEngine.renderToWavBlob(composition);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${composition.title.toLowerCase().replace(/[^a-z0-9]/g, '_')}_master.wav`;
      a.click();
    } catch (err) {
      console.error('Error rendering WAV:', err);
    } finally {
      setIsExportingWav(false);
    }
  };

  const handleOpenPianoRoll = (trackId: string) => {
    setSelectedTrackId(trackId);
    setActiveView('pianoroll');
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-neutral-950 font-sans text-neutral-200">
      {/* Crash Recovery Notification Banner if draft restored */}
      {recoveredDraft && (
        <CrashRecoveryBanner
          recoveredSavedAt={recoveredDraft.savedAt}
          compositionTitle={recoveredDraft.composition.title}
          tracksCount={recoveredDraft.composition.tracks.length}
          notesCount={recoveredDraft.composition.tracks.reduce(
            (acc, t) => acc + (t.notes?.length || 0),
            0
          )}
          onKeepDraft={() => setRecoveredDraft(null)}
          onDiscardDraft={() => {
            handleLoadDemo('dark_forest');
            globalAutoSaveManager.clearDraft();
            setRecoveredDraft(null);
          }}
        />
      )}

      {/* Top DAW Bar */}
      <HeaderBar
        composition={composition}
        isPlaying={isPlaying}
        isPaused={isPaused}
        position={position}
        activeView={activeView}
        canUndo={commandManagerRef.current.canUndo()}
        canRedo={commandManagerRef.current.canRedo()}
        onViewChange={setActiveView}
        onPlay={handlePlay}
        onPause={handlePause}
        onStop={handleStop}
        onToggleLoop={handleToggleLoop}
        onTempoChange={handleTempoChange}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onLoadDemo={handleLoadDemo}
        onExportWav={handleExportWav}
        isExportingWav={isExportingWav}
        onOpenShortcuts={() => setIsShortcutsOpen(true)}
        onRestoreComposition={handleRestoreCheckpointComposition}
      />

      {/* Main Viewport Container */}
      <main className="flex-1 flex overflow-hidden relative">
        {activeView === 'arrangement' && (
          <ArrangementView
            composition={composition}
            position={position}
            selectedTrackId={selectedTrackId}
            onSelectTrack={setSelectedTrackId}
            onOpenPianoRoll={handleOpenPianoRoll}
            onUpdateTrack={handleUpdateTrack}
            onDeleteTrack={handleDeleteTrack}
            onAddTrackModal={() => setIsAddTrackOpen(true)}
            onSeek={handleSeek}
          />
        )}

        {activeView === 'pianoroll' && (
          <PianoRollView
            composition={composition}
            selectedTrackId={selectedTrackId}
            position={position}
            onSelectTrack={setSelectedTrackId}
            onAddNote={handleAddNote}
            onUpdateNote={handleUpdateNote}
            onDeleteNote={handleDeleteNote}
            onHumanizeTrack={handleHumanizeTrack}
            onTransposeTrack={handleTransposeTrack}
          />
        )}

        {activeView === 'mixer' && (
          <MixerView
            composition={composition}
            masterVolume={masterVolume}
            onUpdateTrack={handleUpdateTrack}
            onUpdateMasterVolume={handleMasterVolumeChange}
            onSelectReverbPreset={handleSelectReverbPreset}
          />
        )}

        {activeView === 'adaptive' && (
          <AdaptiveGameView composition={composition} onUpdateTrack={handleUpdateTrack} />
        )}

        {activeView === 'motifs' && <MotifsAndPalettesView />}

        {activeView === 'ai' && (
          <AiComposerView
            composition={composition}
            versions={versions}
            onApplyNewComposition={handleApplyNewComposition}
            onRestoreVersion={handleRestoreVersion}
          />
        )}

        {activeView === 'knowledge' && (
          <KnowledgeAndMcpView
            composition={composition}
            onApplyNewComposition={handleApplyNewComposition}
          />
        )}

        {activeView === 'library' && <SoundLibraryView />}
      </main>

      {/* Add Track Modal */}
      <AddTrackModal
        isOpen={isAddTrackOpen}
        onClose={() => setIsAddTrackOpen(false)}
        onAddTrack={handleAddTrack}
      />

      {/* Global Keyboard Shortcuts Modal */}
      <ShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />
    </div>
  );
}

export default App;
