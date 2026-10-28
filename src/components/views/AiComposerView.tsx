import React, { useState } from 'react';
import { Sparkles, MessageSquare, HelpCircle, History, Send, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Composition, CompositionVersion, MusicIntent } from '../../types/music';

interface AiComposerViewProps {
  composition: Composition;
  versions: CompositionVersion[];
  onApplyNewComposition: (newComp: Composition, versionTitle: string) => void;
  onRestoreVersion: (version: CompositionVersion) => void;
}

export const AiComposerView: React.FC<AiComposerViewProps> = ({
  composition,
  versions,
  onApplyNewComposition,
  onRestoreVersion,
}) => {
  const [prompt, setPrompt] = useState(
    'Música melancólica de fantasía oscura para explorar ruinas abandonadas de noche en un bosque maldito.'
  );
  const [modifyInstruction, setModifyInstruction] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExplaining, setIsExplaining] = useState(false);
  const [explanationText, setExplanationText] = useState<string | null>(null);

  const [lastIntent, setLastIntent] = useState<MusicIntent | null>(null);

  const samplePrompts = [
    'Tema romántico y emotivo con piano de fieltro, solo de violonchelo y arpa celta para una escena de amor en un RPG.',
    'Música melancólica de fantasía oscura para explorar ruinas abandonadas.',
    'Tema de combate contra un jefe orco, agresivo, tribal y oscuro.',
    'Música tranquila de taberna medieval que pueda reproducirse en loop.',
    'Misterio cyberpunk con sintetizadores analógicos en un callejón lluvioso.',
    'Tema orquestal JRPG con piano emotivo y violines para una despedida.',
  ];

  const handleGenerate = async () => {
    if (!prompt.trim() || isGenerating) return;
    setIsGenerating(true);
    setExplanationText(null);

    try {
      const res = await fetch('/api/ai/compose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (data.success && data.composition) {
        setLastIntent(data.intent);
        onApplyNewComposition(data.composition, `Generated: "${prompt.slice(0, 30)}..."`);
      }
    } catch (err) {
      console.error('Error generating composition:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleModify = async () => {
    if (!modifyInstruction.trim() || isGenerating) return;
    setIsGenerating(true);

    try {
      const res = await fetch('/api/ai/modify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ composition, instruction: modifyInstruction }),
      });
      const data = await res.json();
      if (data.success && data.composition) {
        onApplyNewComposition(data.composition, `Mod: ${modifyInstruction}`);
        setModifyInstruction('');
      }
    } catch (err) {
      console.error('Error modifying composition:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExplain = async () => {
    if (isExplaining) return;
    setIsExplaining(true);

    try {
      const res = await fetch('/api/ai/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ composition }),
      });
      const data = await res.json();
      if (data.success && data.explanation) {
        setExplanationText(data.explanation);
      }
    } catch (err) {
      console.error('Error explaining composition:', err);
    } finally {
      setIsExplaining(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-neutral-950 text-neutral-200 p-8 overflow-y-auto select-none">
      <div className="max-w-4xl mx-auto w-full flex flex-col gap-8">
        {/* Top Header */}
        <div className="border-b border-neutral-800 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-bold text-white tracking-tight">AI Game Music Composer</h2>
          </div>
          <button
            onClick={handleExplain}
            disabled={isExplaining}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-neutral-900 hover:bg-neutral-800 text-neutral-200 border border-neutral-700 text-xs transition-colors"
          >
            <HelpCircle className="w-4 h-4 text-sky-400" />
            <span>{isExplaining ? 'Analyzing...' : 'Explain Music Theory'}</span>
          </button>
        </div>

        {/* Explain Mode Box (if visible) */}
        {explanationText && (
          <div className="p-5 rounded-lg bg-indigo-950/30 border border-indigo-500/30 text-xs leading-relaxed text-neutral-200 space-y-2 whitespace-pre-line font-sans">
            <h3 className="font-bold text-indigo-300 text-sm mb-2 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <span>Musicological Analysis & Pedagogical Breakdown</span>
            </h3>
            {explanationText}
          </div>
        )}

        {/* Section 1: Natural Language Prompt Generator */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 flex flex-col gap-4">
          <label className="text-xs font-bold text-neutral-300 uppercase tracking-wider block">
            Natural Language Composition Brief
          </label>

          <textarea
            rows={3}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the gaming scene, atmosphere, instrumentation, and emotion..."
            className="w-full bg-neutral-950 border border-neutral-800 rounded-md p-3 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500"
          />

          {/* Quick Suggestions */}
          <div className="flex flex-wrap gap-1.5">
            <span className="text-[10px] text-neutral-500 font-mono self-center mr-1">Presets:</span>
            {samplePrompts.map((p, idx) => (
              <button
                key={idx}
                onClick={() => setPrompt(p)}
                className="text-[11px] px-2.5 py-1 rounded bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 text-neutral-400 hover:text-white transition-colors truncate max-w-xs"
              >
                {p}
              </button>
            ))}
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="flex items-center gap-2 px-5 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs shadow-md transition-colors disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              <span>{isGenerating ? 'Composing...' : 'Generate Full Composition'}</span>
            </button>
          </div>
        </div>

        {/* Section 2: Iterative Modification Assistant */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-bold text-neutral-300 uppercase tracking-wider">
              Iterate & Modify Current Theme
            </h3>
          </div>

          <p className="text-xs text-neutral-400">
            Tell the composer what to tweak without losing the melody or destroying the composition.
          </p>

          <div className="flex gap-2">
            <input
              type="text"
              value={modifyInstruction}
              onChange={(e) => setModifyInstruction(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleModify()}
              placeholder="e.g. 'Hacela más triste manteniendo la melodía' or 'Transformá a combate rápido'..."
              className="flex-1 bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500"
            />
            <button
              onClick={handleModify}
              disabled={isGenerating || !modifyInstruction.trim()}
              className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Apply Modification</span>
            </button>
          </div>

          <div className="flex gap-2 text-xs">
            <button
              onClick={() => {
                setModifyInstruction('Hacela más triste y melancólica');
              }}
              className="text-[11px] text-neutral-400 hover:text-white bg-neutral-950 px-2 py-1 rounded border border-neutral-800"
            >
              "Más triste y lenta"
            </button>
            <button
              onClick={() => {
                setModifyInstruction('Transformá el tema a combate intenso');
              }}
              className="text-[11px] text-neutral-400 hover:text-white bg-neutral-950 px-2 py-1 rounded border border-neutral-800"
            >
              "Transformá a combate"
            </button>
            <button
              onClick={() => {
                setModifyInstruction('Versión tranquila y calmada para campamento');
              }}
              className="text-[11px] text-neutral-400 hover:text-white bg-neutral-950 px-2 py-1 rounded border border-neutral-800"
            >
              "Versión calmada"
            </button>
          </div>
        </div>

        {/* Section 3: Version History Stack */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5">
          <div className="flex items-center gap-2 mb-3">
            <History className="w-4 h-4 text-amber-400" />
            <h3 className="text-xs font-bold text-neutral-300 uppercase tracking-wider">
              Composition Version History ({versions.length})
            </h3>
          </div>

          <div className="space-y-2">
            {versions.map((ver) => (
              <div
                key={ver.id}
                className="bg-neutral-950 border border-neutral-800 p-3 rounded flex items-center justify-between hover:bg-neutral-900 transition-colors"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-indigo-400 font-mono">v{ver.versionNumber}</span>
                    <span className="text-xs font-semibold text-white">{ver.title}</span>
                  </div>
                  <span className="text-[10px] text-neutral-500 font-mono block mt-0.5">
                    {new Date(ver.timestamp).toLocaleTimeString()} · {ver.snapshot.tempo} BPM · {ver.snapshot.key}{' '}
                    {ver.snapshot.scale}
                  </span>
                </div>

                <button
                  onClick={() => onRestoreVersion(ver)}
                  className="px-3 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-xs font-medium text-neutral-200 transition-colors"
                >
                  Restore Version
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
