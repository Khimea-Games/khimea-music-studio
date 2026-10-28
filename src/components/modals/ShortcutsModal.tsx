import React from 'react';
import { X, Keyboard, Command } from 'lucide-react';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutItem {
  keys: string[];
  description: string;
}

interface ShortcutCategory {
  category: string;
  items: ShortcutItem[];
}

const SHORTCUT_GROUPS: ShortcutCategory[] = [
  {
    category: 'Transport & Playback',
    items: [
      { keys: ['Space'], description: 'Play / Pause playback' },
      { keys: ['Esc'], description: 'Stop playback / Close dialog' },
      { keys: ['L'], description: 'Toggle continuous loop playback' },
    ],
  },
  {
    category: 'DAW Navigation',
    items: [
      { keys: ['1'], description: 'Arrangement multi-track view' },
      { keys: ['2'], description: 'Piano Roll MIDI editor' },
      { keys: ['3'], description: 'Mixer console & channel strips' },
      { keys: ['4'], description: 'Adaptive game audio simulator' },
      { keys: ['5'], description: 'Leitmotifs & Sound Palettes' },
      { keys: ['6'], description: 'AI Composer & chat' },
      { keys: ['7'], description: 'Knowledge Base & Claude MCP' },
      { keys: ['8'], description: 'Sound Library & CC0 Licenses' },
    ],
  },
  {
    category: 'Editing & Mixing',
    items: [
      { keys: ['Ctrl', 'Z'], description: 'Undo last composition action' },
      { keys: ['Ctrl', 'Y'], description: 'Redo last undone action' },
      { keys: ['M'], description: 'Toggle Mute on selected track' },
      { keys: ['S'], description: 'Toggle Solo on selected track' },
    ],
  },
  {
    category: 'Piano Roll & Notes',
    items: [
      { keys: ['Click Grid'], description: 'Add new note event' },
      { keys: ['Click Note'], description: 'Delete existing note' },
      { keys: ['Shift', 'Click'], description: 'Audition piano key preview' },
      { keys: ['?'], description: 'Toggle this keyboard shortcuts dialog' },
    ],
  },
];

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center z-50 p-4 select-none animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-neutral-900 border border-neutral-800 rounded-xl max-w-2xl w-full p-6 text-neutral-200 shadow-2xl flex flex-col gap-6"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Keyboard className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">DAW Keyboard Shortcuts</h3>
              <p className="text-[11px] text-neutral-400">Accelerate composition, navigation, and playback workflow</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white p-1 rounded hover:bg-neutral-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Shortcuts Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.category} className="space-y-2">
              <h4 className="text-[11px] font-mono font-bold text-indigo-400 uppercase tracking-wider">
                {group.category}
              </h4>
              <div className="space-y-1.5">
                {group.items.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between bg-neutral-950 p-2 rounded border border-neutral-850 text-xs"
                  >
                    <span className="text-neutral-300 text-[11px]">{item.description}</span>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      {item.keys.map((k, kIdx) => (
                        <kbd
                          key={kIdx}
                          className="px-1.5 py-0.5 text-[10px] font-mono font-semibold bg-neutral-800 border border-neutral-700 rounded text-neutral-200 shadow-xs"
                        >
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer tip */}
        <div className="pt-3 border-t border-neutral-800 flex items-center justify-between text-[11px] text-neutral-400">
          <span>
            Press <kbd className="px-1.5 py-0.5 bg-neutral-800 border border-neutral-700 rounded font-mono text-white text-[10px]">?</kbd> anywhere to open or close this helper.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded text-xs font-medium transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};
