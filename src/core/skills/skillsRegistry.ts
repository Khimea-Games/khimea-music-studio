export interface ClaudeSkillDefinition {
  id: string;
  name: string;
  summary: string;
  steps: string[];
  mcpTools: string[];
  markdownDoc: string;
}

export const CLAUDE_SKILLS: ClaudeSkillDefinition[] = [
  {
    id: 'compose-theme',
    name: 'compose-theme',
    summary: 'Direct an end-to-end game theme composition based on emotional purpose.',
    steps: [
      '1. Analyze the gameplay context and emotional purpose (e.g. exploration, boss, tavern).',
      '2. Select root key and appropriate musical mode (e.g. Dorian for medieval, Phrygian for combat).',
      '3. Determine BPM and time signature.',
      '4. Plan harmonic progression (e.g. i - VI - III - VII).',
      '5. Formulate a 3-5 note thematic Leitmotif.',
      '6. Generate expressive melody over 32 bars with call-and-response contour.',
      '7. Generate supporting harmony, counter-melody, and bass foundations.',
      '8. Orchestrate across instrument families respecting acoustic ranges.',
      '9. Humanize velocities and micro-timings to avoid mechanical playback.',
      '10. Validate loop boundary and harmonic continuity.',
    ],
    mcpTools: ['create_composition', 'create_chord_progression', 'generate_melody', 'orchestrate', 'humanize'],
    markdownDoc: `# Skill: compose-theme
Use this skill when asked to create a complete game music theme from scratch. Always inspect the project's sound palette and existing motifs first.`,
  },
  {
    id: 'create-combat-variation',
    name: 'create-combat-variation',
    summary: 'Transform an existing exploration piece into high-stakes combat while preserving melody.',
    steps: [
      '1. Retrieve current composition via get_composition.',
      '2. Increase tempo by 25-40% (e.g. 72 BPM -> 130 BPM).',
      '3. Shift harmony or scale to Harmonic Minor or Phrygian for heightened tension.',
      '4. Convert sustained string pads into staccato rhythmic ostinatos.',
      '5. Add heavy percussion (Taiko war drums, timpanis, snare drives).',
      '6. Add heroic brass calls (French Horns / Trombones) reinforcing main motif.',
      '7. Execute via create_variation tool and return updated JSON.',
    ],
    mcpTools: ['get_composition', 'create_variation', 'add_track', 'humanize'],
    markdownDoc: `# Skill: create-combat-variation
Adapts existing musical themes into intense battle variations without discarding the player's recognizable melody.`,
  },
  {
    id: 'create-game-loop',
    name: 'create-game-loop',
    summary: 'Ensure a composition loops seamlessly without audible seams or jarring resets.',
    steps: [
      '1. Check final bar harmonic resolution towards bar 1.',
      '2. Ensure sustained reverb tails do not end abruptly on bar boundary.',
      '3. Calculate exact startSample and endSample for game engine loop points.',
      '4. Verify with validate_loop tool.',
    ],
    mcpTools: ['validate_loop', 'update_composition'],
    markdownDoc: `# Skill: create-game-loop
Produces game-ready audio loops with exact sample markers for Unity, Unreal, and Godot.`,
  },
];
