import React, { useState, useEffect, useRef } from 'react';
import {
  Cloud,
  CloudCheck,
  Loader2,
  AlertCircle,
  Clock,
  RotateCcw,
  Trash2,
  Save,
  ChevronDown,
  ShieldCheck,
} from 'lucide-react';
import {
  AutoSaveStatus,
  AutoSaveCheckpoint,
  globalAutoSaveManager,
} from '../../core/storage/autoSaveManager';
import { Composition } from '../../types/music';

interface AutoSaveIndicatorProps {
  currentComposition: Composition;
  onRestoreComposition: (comp: Composition, description: string) => void;
}

export const AutoSaveIndicator: React.FC<AutoSaveIndicatorProps> = ({
  currentComposition,
  onRestoreComposition,
}) => {
  const [status, setStatus] = useState<AutoSaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [checkpoints, setCheckpoints] = useState<AutoSaveCheckpoint[]>([]);
  const [justSavedMessage, setJustSavedMessage] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = globalAutoSaveManager.subscribe((state) => {
      setStatus(state.status);
      setLastSavedAt(state.lastSavedAt);
      if (state.status === 'saved') {
        setJustSavedMessage(true);
        const timer = setTimeout(() => setJustSavedMessage(false), 2500);
        return () => clearTimeout(timer);
      }
    });

    return unsub;
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      setCheckpoints(globalAutoSaveManager.getCheckpoints());
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleManualSave = () => {
    globalAutoSaveManager.saveNow(currentComposition, 'Manual user snapshot');
    setCheckpoints(globalAutoSaveManager.getCheckpoints());
  };

  const handleRestoreCheckpoint = (cp: AutoSaveCheckpoint) => {
    onRestoreComposition(cp.composition, `Restored autosave snapshot from ${new Date(cp.savedAt).toLocaleTimeString()}`);
    setIsOpen(false);
  };

  const handleClearDraft = () => {
    if (window.confirm('Clear all autosaved recovery drafts and checkpoints?')) {
      globalAutoSaveManager.clearDraft();
      setCheckpoints([]);
      setIsOpen(false);
    }
  };

  const formatRelativeTime = (timestamp: number | null): string => {
    if (!timestamp) return 'Never';
    const diffSec = Math.floor((Date.now() - timestamp) / 1000);
    if (diffSec < 5) return 'Just now';
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="relative" ref={containerRef}>
      {/* Pill Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        title="Autosave status and crash recovery options"
        className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-mono whitespace-nowrap transition-all border ${
          status === 'saving'
            ? 'bg-amber-950/40 text-amber-300 border-amber-800/60'
            : status === 'error'
            ? 'bg-rose-950/40 text-rose-300 border-rose-800/60'
            : justSavedMessage
            ? 'bg-emerald-950/40 text-emerald-300 border-emerald-700/60'
            : 'bg-neutral-900/90 hover:bg-neutral-850 text-neutral-300 border-neutral-800'
        }`}
      >
        {status === 'saving' ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
        ) : status === 'error' ? (
          <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
        ) : (
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        )}

        <span className="text-[11px] font-medium hidden sm:inline">
          {status === 'saving'
            ? 'Saving...'
            : justSavedMessage
            ? 'Autosaved'
            : `Saved ${formatRelativeTime(lastSavedAt)}`}
        </span>

        <ChevronDown className="w-3 h-3 text-neutral-500 opacity-80" />
      </button>

      {/* Popover Menu */}
      {isOpen && (
        <div className="absolute left-0 mt-1.5 w-80 bg-neutral-900 border border-neutral-800 rounded-lg shadow-2xl py-2 z-50 text-neutral-200 text-xs">
          {/* Header */}
          <div className="px-3 pb-2 border-b border-neutral-800 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-neutral-200 font-semibold text-xs">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Crash Protection & Autosave</span>
            </div>
            <span className="text-[10px] text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800/60">
              Active
            </span>
          </div>

          {/* Details */}
          <div className="px-3 py-2 space-y-1 text-[11px] text-neutral-400">
            <div className="flex justify-between">
              <span>Primary storage:</span>
              <span className="text-neutral-300 font-mono">Browser localStorage</span>
            </div>
            <div className="flex justify-between">
              <span>Secondary sync:</span>
              <span className="text-neutral-300 font-mono">Server Draft API</span>
            </div>
            <div className="flex justify-between">
              <span>Last saved:</span>
              <span className="text-neutral-200 font-medium font-mono">
                {lastSavedAt ? new Date(lastSavedAt).toLocaleTimeString() : 'Not yet saved'}
              </span>
            </div>
          </div>

          {/* Quick Action Button */}
          <div className="px-3 py-1.5 border-t border-b border-neutral-800/80 bg-neutral-950/40">
            <button
              type="button"
              onClick={handleManualSave}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs shadow-sm transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Snapshot Now</span>
            </button>
          </div>

          {/* Checkpoints Section */}
          <div className="px-3 pt-2">
            <div className="flex items-center justify-between text-[11px] font-semibold text-neutral-300 mb-1.5">
              <span>Recovery Checkpoints ({checkpoints.length})</span>
              <span className="text-[10px] text-neutral-500">Last 6 states</span>
            </div>

            {checkpoints.length === 0 ? (
              <p className="text-[11px] text-neutral-500 italic py-2">
                No checkpoints stored yet. Edits are recorded automatically.
              </p>
            ) : (
              <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                {checkpoints.map((cp) => (
                  <div
                    key={cp.id}
                    className="p-1.5 rounded bg-neutral-850 hover:bg-neutral-800 border border-neutral-750 flex items-center justify-between group transition-colors"
                  >
                    <div className="overflow-hidden pr-2">
                      <div className="font-medium text-neutral-200 truncate text-[11px]">
                        {cp.title}
                      </div>
                      <div className="text-[10px] text-neutral-400 flex items-center gap-2">
                        <span>{new Date(cp.savedAt).toLocaleTimeString()}</span>
                        <span>·</span>
                        <span>{cp.tracksCount} tracks</span>
                        <span>·</span>
                        <span>{cp.notesCount} notes</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRestoreCheckpoint(cp)}
                      title="Restore this checkpoint state"
                      className="px-2 py-1 rounded bg-neutral-700 hover:bg-indigo-600 text-neutral-200 hover:text-white text-[10px] font-medium shrink-0 transition-colors flex items-center gap-1"
                    >
                      <RotateCcw className="w-2.5 h-2.5" />
                      <span>Restore</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer actions */}
          {checkpoints.length > 0 && (
            <div className="px-3 pt-2 mt-2 border-t border-neutral-800 flex justify-end">
              <button
                type="button"
                onClick={handleClearDraft}
                className="text-[10px] text-neutral-500 hover:text-rose-400 flex items-center gap-1 transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                <span>Clear recovery storage</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
