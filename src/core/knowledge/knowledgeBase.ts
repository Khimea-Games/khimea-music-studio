export interface KnowledgeArticle {
  id: string;
  category: 'theory' | 'composition' | 'orchestration' | 'game-music';
  title: string;
  summary: string;
  content: string;
}

export const KNOWLEDGE_ARTICLES: KnowledgeArticle[] = [
  {
    id: 'scales',
    category: 'theory',
    title: 'Scales and Modes in Video Game Music',
    summary: 'How to choose musical modes to evoke specific emotional atmospheres in games.',
    content: `# Scales and Modes in Video Game Music

Modes are variations of the diatonic scale that fundamentally color emotional perception:

- **Aeolian (Natural Minor)**: The cornerstone of dark fantasy and emotional storytelling. Conveys sadness, gravity, and deep mystery without harsh dissonance.
- **Dorian Mode**: Natural minor with a raised 6th degree (e.g. B in D minor). Creates a classic folkloric, medieval, or noble melancholy. Perfect for taverns, wandering bards, and ancient forests.
- **Phrygian Mode**: Minor scale with a flattened 2nd degree (e.g. Eb in D minor). Conveys immediate menace, tribal aggression, impending danger, and exotic darkness. Standard for orc bosses and subterranean dungeons.
- **Lydian Mode**: Major scale with a raised 4th (e.g. G# in D major). Generates a sense of celestial wonder, weightlessness, flying, and sci-fi discovery.
- **Harmonic Minor**: Minor scale with a raised 7th (leading tone). Adds neoclassical drama, baroque gothic castles, and dramatic confrontation.
- **Pentatonic Minor**: Simple 5-note scale without half-step clashes. Ideal for punchy battle motifs and primal ethnic themes.`,
  },
  {
    id: 'harmony',
    category: 'theory',
    title: 'Harmonic Progressions for Game Soundtracks',
    summary: 'Voice leading, cadence resolutions, and emotional chord loops.',
    content: `# Harmonic Progressions for Game Soundtracks

In linear film music, music often moves from beginning to end with traditional cadences. In video games, harmonic progressions must often **loop indefinitely** without listener fatigue:

## Archetypal Video Game Progressions

1. **The Heroic Struggle (Epic Combat)**:
   \`i - VI - III - VII\` (e.g. Dm - Bb - F - C)
   Provides relentless forward momentum while avoiding a conclusive full-stop cadence.

2. **Melancholy Ruin (Dark Fantasy Exploration)**:
   \`i - iv - VI - V\` (e.g. Dm - Gm - Bb - Am)
   Emphasizes the mournful minor iv chord and descends gracefully.

3. **Medieval Tavern / Hearth**:
   \`i - VII - VI - VII\` (e.g. Dm - C - Bb - C)
   Stepwise bass motion typical of European folk and renaissance dance.

4. **Tribal Boss Clash (Phrygian)**:
   \`i - bII - i - vii\` (e.g. Dm - Eb - Dm - C#dim)
   The half-step clash between root and bII provides visceral terror.`,
  },
  {
    id: 'leitmotif',
    category: 'composition',
    title: 'The Leitmotif Technique in Games',
    summary: 'Creating melodic identities for characters, factions, and emotional states.',
    content: `# Leitmotif Technique in Video Games

A **Leitmotif** is a short, recurring musical phrase associated with a specific person, place, or idea:

## Composition Rules for Motifs
- **Keep it short**: 3 to 7 notes are far more adaptable than long melodies.
- **Rhythmic distinctiveness**: An identifiable rhythm (e.g. dotted eighth + sixteenth + quarter) ensures players recognize the theme even if pitches change.
- **Transformability**: The motif must be easily adapted across gameplay states:
  - **Calm / Campfire**: Played softly on acoustic piano or flute in major or Dorian.
  - **Suspense / Alert**: Played low on cello or bassoon in diminished or augmented intervals.
  - **Climax / Boss Battle**: Blared by brass fanfare with double-time percussion.`,
  },
  {
    id: 'looping',
    category: 'game-music',
    title: 'Flawless Looping & Crossfades',
    summary: 'Technical and musical requirements for seamless in-game music loops.',
    content: `# Flawless Looping for Video Games

Unlike standard songs that fade out, video game music must loop seamlessly without noticeable seams or audio pops:

## Golden Rules of Looping
1. **Harmonic Continuity**: The final chord of the loop must naturally resolve or flow into the opening chord. Avoid resolving to a complete tonic resting point right before the loop boundary.
2. **Reverb Tail Preservation**: When a loop wraps from bar 32 back to bar 1, natural instrument decay (tails) must either be crossfaded or baked into pre-roll loops.
3. **No Dead Silence**: Ensure pickup notes or ambient drone beds sustain through the transition bar.
4. **Sample Accuracy**: Provide game engines with exact sample counts (\`startSample\` and \`endSample\`) rather than rounded milliseconds to prevent click artifacts.`,
  },
  {
    id: 'adaptive',
    category: 'game-music',
    title: 'Adaptive & Dynamic Game Audio Systems',
    summary: 'Vertical layering, horizontal re-sequencing, and parameter-based music reactions.',
    content: `# Adaptive Music Systems in Modern Video Games

Game soundtracks must react dynamically to player actions. Two core architectures are used:

## 1. Vertical Layering (Stem Blending)
All stems (ambient drone, bass, percussion, lead melody, combat brass) run in synchronized lockstep at the same tempo and bar count.
As combat intensity increases:
- \`intensity > 30\`: Taiko drums and war snares unmute.
- \`intensity > 60\`: French horn fanfares fade in.
- \`intensity > 85\`: Low choir and timpani climax.

## 2. Horizontal Re-Sequencing
Music switches sections (Exploration -> Buildup -> Boss Battle) at musical quantization points (e.g. next bar downbeat or beat 1 of the next 4-bar phrase) with transitional stingers.`,
  },
  {
    id: 'strings',
    category: 'orchestration',
    title: 'Orchestrating Strings for Emotional Depth',
    summary: 'Registers, doubling, and dynamic expression in string sections.',
    content: `# Orchestrating Strings for Emotional Depth

The string section is the backbone of cinematic and game scoring:

- **Violins (G3 - E7)**: Soaring emotional melodies, delicate high-register shimmering pads, or aggressive staccato runs.
- **Violas (C3 - A5)**: Rich, throaty inner harmonies that bridge violins and cellos.
- **Cellos (C2 - E5)**: The most expressive voice in the orchestra for sorrowful themes, counterpoint, and warm sustained warmth.
- **Contrabass (C1 - G3)**: Massive low-end anchor, often doubled with cellos an octave lower for cinematic weight.`,
  },
];
