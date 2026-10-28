import React, { useState } from 'react';
import { Compass, Play, Sparkles, Plus, Palette, Shield } from 'lucide-react';
import { Motif, SoundPalette } from '../../types/music';
import { midiToNoteName } from '../../core/theory/scales';
import { globalAudioEngine } from '../../core/audio/WebAudioEngine';
import { VariationEngine } from '../../core/composition/VariationEngine';

export const MotifsAndPalettesView: React.FC = () => {
  const [motifs, setMotifs] = useState<Motif[]>([
    {
      id: 'motif_hero',
      projectId: 'proj_khimea_default',
      name: 'Hero’s Oath (Main Theme)',
      notes: [62, 65, 69, 67, 65], // D4, F4, A4, G4, F4
      rhythm: [1.0, 1.0, 1.5, 0.5, 2.0],
      entityTag: 'Protagonist (Elena)',
      description: 'Bittersweet thematic motif representing sacrifice and courage.',
    },
    {
      id: 'motif_curse',
      projectId: 'proj_khimea_default',
      name: 'Ancient Corruption',
      notes: [62, 63, 62, 58, 61], // D4, Eb4, D4, Bb3, C#4
      rhythm: [1.5, 0.5, 1.0, 1.0, 2.0],
      entityTag: 'The Ashen Woods',
      description: 'Menacing half-step chromatic descent symbolizing the blighted curse.',
    },
  ]);

  const [soundPalette, setSoundPalette] = useState<SoundPalette>({
    id: 'pal_dark_fantasy',
    name: 'Dark Fantasy Orchestral Core',
    primary: ['Concert Grand Piano', 'Violins Ensemble', 'Cello Section'],
    secondary: ['Wooden Flute', 'French Horn Section'],
    percussion: ['Taiko War Drums', 'Orchestral Timpani'],
    textures: ['Dark Mystery Drone Pad', 'Dark Low Choir'],
  });

  const [generatedVariations, setGeneratedVariations] = useState<
    Array<{ name: string; notes: number[]; rhythm: number[] }> | null
  >(null);

  const handlePlayMotif = (notes: number[], rhythm: number[]) => {
    let delay = 0;
    notes.forEach((pitch, i) => {
      const dur = rhythm[i] || 1;
      setTimeout(() => {
        globalAudioEngine.triggerNotePreview('piano_grand', pitch, 95, dur * 0.4);
      }, delay * 400);
      delay += dur;
    });
  };

  const handleGenerateVariations = (motif: Motif) => {
    const variations = VariationEngine.createMotifVariations(motif);
    setGeneratedVariations(variations);
  };

  return (
    <div className="flex-1 flex flex-col bg-neutral-950 text-neutral-200 p-8 overflow-y-auto select-none">
      <div className="max-w-4xl mx-auto w-full flex flex-col gap-8">
        {/* Section 1: Leitmotifs */}
        <div>
          <div className="border-b border-neutral-800 pb-3 flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Compass className="w-5 h-5 text-purple-400" />
              <h2 className="text-lg font-bold text-white tracking-tight">Leitmotif Thematic Registry</h2>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {motifs.map((motif) => (
              <div key={motif.id} className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-sm text-white">{motif.name}</h3>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-800/60">
                      {motif.entityTag}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-400 mt-1 mb-3">{motif.description}</p>

                  <div className="bg-neutral-950 p-2 rounded border border-neutral-850 font-mono text-xs flex gap-2 flex-wrap items-center">
                    <span className="text-[10px] text-neutral-500">PITCHES:</span>
                    {motif.notes.map((p, i) => (
                      <span key={i} className="text-purple-300 font-semibold bg-neutral-900 px-1.5 py-0.5 rounded">
                        {midiToNoteName(p)}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-4 pt-3 border-t border-neutral-800/80">
                  <button
                    onClick={() => handlePlayMotif(motif.notes, motif.rhythm)}
                    className="flex-1 py-1.5 px-3 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Audition Motif</span>
                  </button>
                  <button
                    onClick={() => handleGenerateVariations(motif)}
                    className="py-1.5 px-3 rounded bg-purple-600 hover:bg-purple-500 text-white text-xs flex items-center gap-1.5 transition-colors font-medium"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>3 Variations</span>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Generated Variations Display */}
          {generatedVariations && (
            <div className="mt-4 p-4 rounded-lg bg-neutral-900/90 border border-purple-500/30">
              <h4 className="text-xs font-bold text-purple-300 uppercase tracking-wider mb-3">
                Generated Thematic Variations (Ready for In-Game Dynamic Switching)
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {generatedVariations.map((v, idx) => (
                  <div key={idx} className="bg-neutral-950 p-3 rounded border border-neutral-800 flex flex-col justify-between">
                    <div>
                      <span className="font-semibold text-xs text-white block">{v.name}</span>
                      <div className="mt-2 flex gap-1 flex-wrap">
                        {v.notes.map((p, i) => (
                          <span key={i} className="text-[10px] font-mono text-neutral-300 bg-neutral-900 px-1 rounded">
                            {midiToNoteName(p)}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={() => handlePlayMotif(v.notes, v.rhythm)}
                      className="mt-3 py-1 px-2 rounded bg-neutral-900 hover:bg-neutral-800 text-neutral-300 text-xs flex items-center justify-center gap-1 transition-colors"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      <span>Play Variation</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Section 2: Sound Palette */}
        <div>
          <div className="border-b border-neutral-800 pb-3 flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Palette className="w-5 h-5 text-indigo-400" />
              <h2 className="text-lg font-bold text-white tracking-tight">Project Sound Palette</h2>
            </div>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5">
            <h3 className="font-bold text-sm text-white mb-4">{soundPalette.name}</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div>
                <span className="text-[10px] font-mono text-neutral-400 uppercase font-bold block mb-2">Primary Voice</span>
                <ul className="space-y-1 text-neutral-300">
                  {soundPalette.primary.map((item, i) => (
                    <li key={i} className="bg-neutral-950 p-1.5 rounded border border-neutral-850">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <span className="text-[10px] font-mono text-neutral-400 uppercase font-bold block mb-2">Secondary Voice</span>
                <ul className="space-y-1 text-neutral-300">
                  {soundPalette.secondary.map((item, i) => (
                    <li key={i} className="bg-neutral-950 p-1.5 rounded border border-neutral-850">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <span className="text-[10px] font-mono text-neutral-400 uppercase font-bold block mb-2">Percussion Core</span>
                <ul className="space-y-1 text-neutral-300">
                  {soundPalette.percussion.map((item, i) => (
                    <li key={i} className="bg-neutral-950 p-1.5 rounded border border-neutral-850">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <span className="text-[10px] font-mono text-neutral-400 uppercase font-bold block mb-2">Atmospheric Textures</span>
                <ul className="space-y-1 text-neutral-300">
                  {soundPalette.textures.map((item, i) => (
                    <li key={i} className="bg-neutral-950 p-1.5 rounded border border-neutral-850">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
