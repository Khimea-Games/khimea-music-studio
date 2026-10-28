import React from 'react';
import { ShieldAlert, Check, X, RotateCcw } from 'lucide-react';
import { Composition } from '../../types/music';

interface CrashRecoveryBannerProps {
  recoveredSavedAt: number;
  compositionTitle: string;
  tracksCount: number;
  notesCount: number;
  onKeepDraft: () => void;
  onDiscardDraft: () => void;
}

export const CrashRecoveryBanner: React.FC<CrashRecoveryBannerProps> = ({
  recoveredSavedAt,
  compositionTitle,
  tracksCount,
  notesCount,
  onKeepDraft,
  onDiscardDraft,
}) => {
  const formattedTime = new Date(recoveredSavedAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <div className="bg-indigo-950/90 border-b border-indigo-700/60 px-4 py-2 flex items-center justify-between text-xs text-neutral-200 z-40 shrink-0 shadow-lg">
      <div className="flex items-center gap-2.5">
        <div className="p-1 rounded bg-indigo-600/30 text-indigo-300">
          <ShieldAlert className="w-4 h-4 text-indigo-300" />
        </div>
        <div>
          <span className="font-semibold text-white">Auto-Recovery Active:</span>{' '}
          <span className="text-neutral-300">
            Restored draft of <strong className="text-white font-medium">"{compositionTitle}"</strong> from{' '}
            <span className="font-mono text-indigo-200">{formattedTime}</span> ({tracksCount} tracks,{' '}
            {notesCount} notes).
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onKeepDraft}
          className="flex items-center gap-1.5 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-medium transition-colors shadow-sm"
        >
          <Check className="w-3.5 h-3.5" />
          <span>Keep Draft</span>
        </button>

        <button
          type="button"
          onClick={onDiscardDraft}
          className="flex items-center gap-1.5 px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white rounded transition-colors"
        >
          <X className="w-3.5 h-3.5" />
          <span>Discard & Reset</span>
        </button>
      </div>
    </div>
  );
};
