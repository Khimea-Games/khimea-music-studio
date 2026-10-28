import { NOTE_NAMES, NoteName } from './scales';

export interface ProgressionPattern {
  name: string;
  category: 'exploration' | 'combat' | 'boss' | 'town' | 'dark_fantasy' | 'cyberpunk' | 'jrpg' | 'ambient';
  mood: string;
  degrees: string[]; // Roman numerals, e.g. ["i", "VI", "III", "VII"]
  rootsOffset: number[]; // Semitone offset from key root
  chordTypes: string[]; // Corresponding CHORD_TYPES keys
  tensionCurve: number[]; // 0 to 100 tension index per chord
}

export const GAME_PROGRESSIONS: ProgressionPattern[] = [
  {
    name: 'Dark Fantasy Exploration (Melancholy Ruin)',
    category: 'dark_fantasy',
    mood: 'Melancholic, ancient, lost, haunting',
    degrees: ['i', 'iv', 'VI', 'V'],
    rootsOffset: [0, 5, 8, 7],
    chordTypes: ['min', 'min', 'maj', 'min'],
    tensionCurve: [25, 40, 60, 50],
  },
  {
    name: 'Ancient Forest Mystery (Dorian Modal)',
    category: 'exploration',
    mood: 'Mysterious, folkloric, organic wonder',
    degrees: ['i', 'IV', 'VII', 'i'],
    rootsOffset: [0, 5, 10, 0],
    chordTypes: ['min', 'maj', 'maj', 'min'],
    tensionCurve: [20, 35, 45, 20],
  },
  {
    name: 'Orc Boss Assault (Phrygian Tribal Aggression)',
    category: 'boss',
    mood: 'Brutal, war drums, relentless, dark power',
    degrees: ['i', 'bII', 'i', 'vii'],
    rootsOffset: [0, 1, 0, 10],
    chordTypes: ['min', 'maj', 'min', 'dim'],
    tensionCurve: [70, 95, 80, 85],
  },
  {
    name: 'Epic Cinematic Combat (Heroic Struggle)',
    category: 'combat',
    mood: 'Dynamic, intense, driving urgency',
    degrees: ['i', 'VI', 'III', 'VII'],
    rootsOffset: [0, 8, 3, 10],
    chordTypes: ['min', 'maj', 'maj', 'maj'],
    tensionCurve: [50, 70, 60, 75],
  },
  {
    name: 'Medieval Tavern (Cozy Hearth)',
    category: 'town',
    mood: 'Warm, rustic, rhythmic, jovial',
    degrees: ['i', 'VII', 'VI', 'VII'],
    rootsOffset: [0, 10, 8, 10],
    chordTypes: ['min', 'maj', 'maj', 'maj'],
    tensionCurve: [30, 40, 35, 45],
  },
  {
    name: 'JRPG Emotional Memory (Nostalgia)',
    category: 'jrpg',
    mood: 'Heartbreaking, bittersweet, anime cinematic',
    degrees: ['IV', 'V', 'iii', 'vi'],
    rootsOffset: [5, 7, 4, 9],
    chordTypes: ['maj7', 'dom7', 'min7', 'min7'],
    tensionCurve: [35, 65, 55, 40],
  },
  {
    name: 'Cyberpunk Rain (Synthetic Neon Noir)',
    category: 'cyberpunk',
    mood: 'Cold, futuristic, dystopian, hypnotic',
    degrees: ['i', 'bVI', 'iv', 'v'],
    rootsOffset: [0, 8, 5, 7],
    chordTypes: ['min7', 'maj7', 'min', 'min7'],
    tensionCurve: [40, 55, 60, 45],
  },
  {
    name: 'Ethereal Cosmic Ambient (Suspended Space)',
    category: 'ambient',
    mood: 'Vast, timeless, weightless serenity',
    degrees: ['I(sus2)', 'vi(sus2)', 'IV(add9)', 'V(sus4)'],
    rootsOffset: [0, 9, 5, 7],
    chordTypes: ['sus2', 'sus2', 'add9', 'sus4'],
    tensionCurve: [15, 20, 25, 20],
  },
];

/** Resolve progression for a specific key (e.g. key="D", returns roots and chord types) */
export function resolveProgression(
  key: string,
  progression: ProgressionPattern
): Array<{ root: NoteName; typeKey: string; degree: string; tension: number }> {
  const rootIndex = NOTE_NAMES.indexOf(key.trim().toUpperCase() as NoteName);
  const baseIndex = rootIndex !== -1 ? rootIndex : 2; // Default D

  return progression.degrees.map((degree, i) => {
    const semitone = progression.rootsOffset[i];
    const chordRootIndex = (baseIndex + semitone) % 12;
    return {
      root: NOTE_NAMES[chordRootIndex],
      typeKey: progression.chordTypes[i],
      degree,
      tension: progression.tensionCurve[i] ?? 50,
    };
  });
}
