import { Composition, MusicIntent, Track } from '../../types/music';
import { CompositionEngine } from '../composition/CompositionEngine';
import { VariationEngine, VariationType } from '../composition/VariationEngine';
import { CompositionValidator } from '../validation/validator';
import { INSTRUMENT_LIBRARY } from '../instruments/library';
import { KNOWLEDGE_ARTICLES } from '../knowledge/knowledgeBase';
import { CLAUDE_SKILLS } from '../skills/skillsRegistry';
import { SCALES } from '../theory/scales';
import { applyEdits } from '../composition/compositionEditor';
import { CHORDS } from '../theory/chordVoicings';

/** Tabla de acordes con nombre: los nombres valen en add_chord_pattern. */
export const CHORD_TABLE = {
  chords: CHORDS,
  notes: 'Each chord is {bass, voicing} in MIDI pitches. Use the names in add_chord_pattern, or pass your own {bass, voicing}.',
};

/** Herramientas que sólo existen en el servidor (archivos, procesos). */
export const SERVER_ONLY_TOOLS = [
  'export_audio',
  'measure_mix',
  'search_sfx',
  'export_sfx',
  'save_composition',
  'load_composition',
  'list_compositions',
  'delete_composition',
  'compare_compositions',
];

/** Composiciones de demostración que se pueden pedir por API. */
export const DEMO_REGISTRY: Record<string, () => Composition> = {
  dark_forest: () => CompositionEngine.getDemoDarkForest(),
  orc_boss: () => CompositionEngine.getDemoOrcBoss(),
  romantic: () => CompositionEngine.getDemoRomanticTheme(),
};

const COMPOSITION_ID_HINT =
  'Any tool that needs a composition accepts compositionId (a composition saved on the server) instead of currentComposition.';

export interface McpToolDeclaration {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required?: string[];
  };
}

export const MCP_TOOLS: McpToolDeclaration[] = [
  {
    name: 'get_demo',
    description: 'Returns a demo composition by id. Without demoId, lists the available ids.',
    parameters: {
      type: 'object',
      properties: {
        demoId: { type: 'string', description: 'e.g. dark_forest, orc_boss, romantic' },
      },
    },
  },
  {
    name: 'get_chords',
    description: 'Returns the named chord table ({bass, voicing} per chord name) usable in add_chord_pattern.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'new_composition',
    description: 'Creates an empty composition skeleton. Add notes afterwards with edit_composition. saveAs stores it on the server.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Title' },
        tempo: { type: 'number', description: 'BPM (30-280), default 66' },
        key: { type: 'string', description: 'Key root, default D' },
        scale: { type: 'string', description: 'Scale, default major' },
        bars: { type: 'number', description: 'Length in bars, default 16' },
        loop: { type: 'boolean', description: 'Loop mode (sets loop points to the whole piece)' },
        reverbPreset: { type: 'string', description: 'concert_hall | chamber | studio | cathedral | dark_hall | cinematic_hall' },
        tracks: { type: 'array', description: '[{id, name?, instrumentId, role, volume?, pan?, reverbSend?}]' },
        saveAs: { type: 'string', description: 'Store the result on the server under this id' },
      },
    },
  },
  {
    name: 'save_composition',
    description: 'Server only. Stores currentComposition under compositionId (default: its own id). ' + COMPOSITION_ID_HINT,
    parameters: { type: 'object', properties: { compositionId: { type: 'string', description: 'Id: letters, numbers, _ or -' } } },
  },
  {
    name: 'load_composition',
    description: 'Server only. Returns a stored composition.',
    parameters: { type: 'object', properties: { compositionId: { type: 'string', description: 'Stored id' } }, required: ['compositionId'] },
  },
  {
    name: 'list_compositions',
    description: 'Server only. Lists stored compositions (id, title, bars, tempo, tracks, modified).',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'delete_composition',
    description: 'Server only. Deletes a stored composition (e.g. the _orig/_fix copies after an approved change).',
    parameters: { type: 'object', properties: { compositionId: { type: 'string', description: 'Stored id' } }, required: ['compositionId'] },
  },
  {
    name: 'compare_compositions',
    description:
      'Server only. Diffs two compositions: meta changes, tracks added/removed, and per track the prop changes ' +
      '(volume, pan, reverbSend, instrumentId, role...) and notes added/removed/changed (matched by pitch+start), with examples. ' +
      'a and b are each a stored compositionId, a demoId, or an inline composition object.',
    parameters: {
      type: 'object',
      properties: {
        a: { type: 'string', description: 'Stored id, demoId, or composition object (the "before")' },
        b: { type: 'string', description: 'Stored id, demoId, or composition object (the "after")' },
        examples: { type: 'number', description: 'Max examples per category (default 10)' },
      },
      required: ['a', 'b'],
    },
  },
  {
    name: 'measure_mix',
    description:
      'Server only. Renders each track once (0 dB, linear) and returns integrated LUFS per track and per group for each bar range, ' +
      'plus the full mix. Numbers share one gain, so they are directly comparable. Values under the BS.1770 -70 LUFS gate ' +
      'are reported ungated and flagged in belowGate; null means true silence. ' + COMPOSITION_ID_HINT,
    parameters: {
      type: 'object',
      properties: {
        ranges: { type: 'array', description: 'Bar ranges, 1-indexed inclusive: [[1,8],[9,16]]. Default: each section' },
        groups: { type: 'object', description: 'Optional {groupName: [trackIds]}; tracks are always reported too' },
        loop: { type: 'boolean', description: 'Measure the seamless-loop render (tail folded to the start)' },
        library: { type: 'string', description: 'real (VSCO 2 CE, Salamander piano, FreePats guitar; default) or fluidr3 (old General MIDI sounds)', enum: ['real', 'fluidr3'] },
      },
    },
  },
  {
    name: 'search_sfx',
    description:
      'Server only. Searches the purchased sound-effects library (Function Loops "Ultimate SFX for Games", ~3400 sounds: ' +
      'ambiences, UI, foley, creatures, combat, magic, sci-fi...). Every word of query must appear in the path (AND). ' +
      'Returns source paths to pass to export_sfx, with category and duration.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Words to match, e.g. "door lock", "sword", "magic spell"' },
        category: { type: 'string', description: 'Category folder prefix, e.g. 01_Ambientes, 03_Foley, 06_Combate' },
        maxSec: { type: 'number', description: 'Max duration in seconds' },
        limit: { type: 'number', description: 'Max results (default 25, max 200)' },
      },
    },
  },
  {
    name: 'export_sfx',
    description:
      'Server only. Exports one sound from the SFX library, ready for a game: trims head/tail silence, optional clip, fades, ' +
      'level (integrated LUFS for sounds >= 0.4 s, otherwise peak), true-peak limit, optional mono/pitch and random variations ' +
      '(name, name_v2, name_v3...). Writes WAV + OGG + _CREDITS.txt under exports/<name>. License: purchased, royalty-free, ' +
      'no attribution required; use the sounds inside the game, never ship or share the library or the raw files.',
    parameters: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'Source path exactly as returned by search_sfx' },
        name: { type: 'string', description: 'Output path inside exports/, without extension (e.g. my-game/sfx/door_lock)' },
        clipFrom: { type: 'number', description: 'Seconds' },
        clipTo: { type: 'number', description: 'Seconds' },
        trim: { type: 'boolean', description: 'Trim silence at head and tail (default true)' },
        fadeIn: { type: 'number', description: 'Seconds (default 0)' },
        fadeOut: { type: 'number', description: 'Seconds (default 0.02)' },
        lufs: { type: 'number', description: 'Integrated loudness target (default -18)' },
        peakDb: { type: 'number', description: 'Normalize by sample peak instead of LUFS (short sounds use -3 by default)' },
        truePeakDb: { type: 'number', description: 'True-peak ceiling (default -1)' },
        pitch: { type: 'number', description: 'Semitones (resampling: also changes length)' },
        variations: { type: 'number', description: 'Number of files, the first is the base one (default 1, max 20)' },
        variationPitch: { type: 'number', description: 'Random +/- semitones per variation (default 1)' },
        variationGain: { type: 'number', description: 'Random +/- dB per variation (default 1.5)' },
        seed: { type: 'number', description: 'Random seed for variations (default 1)' },
        mono: { type: 'boolean', description: 'Write mono files (positional 3D sounds)' },
      },
      required: ['source', 'name'],
    },
  },
  {
    name: 'edit_composition',
    description:
      'Applies precise edits to currentComposition and returns the result plus validation. Ops (in order): ' +
      'set {title,tempo,key,scale,durationBars,mode,reverbPreset}; add_track {track:{id,name,instrumentId,role,volume?,pan?,reverbSend?,notes?}}; ' +
      'remove_track {trackId}; update_track {trackId,props}; copy_track {fromTrackId,newId,name?,instrumentId?,role?,transpose?}; ' +
      'set_notes|add_notes {trackId,notes:[[pitch,startBeat,durationBeats,velocity?,articulation?]|{pitch,start,duration,...}]}; ' +
      'remove_notes {trackId?,fromBeat?,toBeat?,pitches?}; transpose {semitones,trackId?,fromBeat?,toBeat?}; ' +
      'scale_velocity {factor,trackId?,fromBeat?,toBeat?}; crop {startBar,barCount}; ' +
      'add_chord_pattern {trackId,bars:[from,to],chords:[name|{bass,voicing}|[[name,beat,dur],...]] one entry per bar (cycled; segments [[name,beat,dur],...], notes cut at segment end),pattern:[[beat,voice(-1=bass),dur,vel,art?]],skipBars?}; ' +
      'limit_duration {maxBeats,trackId?,fromBeat?,toBeat?,shiftLongFromDownbeat?}; ' +
      'restrike {maxBeats,every(<=maxBeats),velDrop?,trackId?,fromBeat?,toBeat?} splits long notes into overlapping re-attacks keeping the original end; ' +
      'place_phrase {trackId,bar,phrase:[[pitch,beat,dur,vel?]],transpose?,velocity?,articulation?}; ' +
      'humanize {trackId?,velJitter?,timeJitterBeats?,seed?,fromBeat?,toBeat?}; ' +
      'fade {trackId?,bars:[from,to],fromVel+toVel | fromFactor+toFactor}. Bars are 1-indexed; beats are 0-indexed from the start. ' +
      'With compositionId the result is saved back (or to saveAs) and only a summary is returned unless returnComposition=true.',
    parameters: {
      type: 'object',
      properties: {
        operations: { type: 'array', description: 'List of edit operations, applied in order' },
      },
      required: ['operations'],
    },
  },
  {
    name: 'export_audio',
    description:
      'Server only. Renders currentComposition to exports/<name>.wav/.ogg/.mp3 plus .mid and .json. ' +
      'loop=true writes a seamless loop (WAV with smpl loop chunk). lufs sets linear loudness; gainDb forces a fixed gain (stems); ' +
      'trackIds renders only those tracks; clipFrom/clipTo (seconds) export an excerpt for A/B at matched loudness. ' +
      'Returns file paths, duration, loudness, applied gain, peak, per-section LUFS and (loops) the seam jump. ' +
      'It also returns credits {attributionRequired, libraries[{name, license, credit, instruments}], text, notice} and writes ' +
      '<name>_CREDITS.txt next to the audio. IMPORTANT FOR AI AGENTS: if credits.attributionRequired is true (CC BY 3.0 samples: ' +
      'Salamander piano, FluidR3 celesta/choir/taiko), you MUST tell the user that the game has to display credits.text ' +
      '(end credits or About screen); the response also repeats this in a top-level notice. ' + COMPOSITION_ID_HINT,
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Output path inside exports/, e.g. as-you-left-it/ch1/04_remembered' },
        loop: { type: 'boolean', description: 'Seamless loop for game engines' },
        lufs: { type: 'number', description: 'Target integrated loudness (linear gain), e.g. -18' },
        gainDb: { type: 'number', description: 'Fixed gain in dB (overrides lufs); reuse a mix gain for its stems' },
        trackIds: { type: 'array', description: 'Render only these track ids (stems)' },
        ritardando: { type: 'number', description: 'Bars of final ritardando for non-loop renders (default 2)' },
        fadeOutSec: { type: 'number', description: 'Non-loop only: cosine² fade-out over the last N seconds, applied after the limiter (and after maxTailSilenceSec). Combine with clipTo for stingers/A-B clips (e.g. clipFrom 0, clipTo 5, fadeOutSec 1.5). Stems get the same curve' },
        busCompression: { type: 'string', description: 'Bus compressor ("glue" of a recorded band): RMS stereo-linked, -20 dBFS threshold, 2.5:1, 15/250 ms, seam-safe for loops, applied identically to stems. "auto" (default): on only when the mix has metal_guitar, electric_guitar, electric_bass or metal_drums (orchestral renders unchanged). true/false (or "on"/"off") forces it' },
        maxTailSilenceSec: { type: 'number', description: 'Non-loop only: after LUFS gain and limiter, trim the end so trailing silence (< -60 dBFS) is about this many seconds minus 0.1, with a short cosine fade inside that silence. Stems are trimmed to the same sample. Ignored for loops' },
        stemGroups: { type: 'object', description: 'Every export also returns silence {headSec, tailSec, thresholdDb: -60} for the mix and each stem, fileInfo {path: {sha256, bytes}} for every written file, and writes <name>_waveform.png. Exports the full mix AND one stem per group in one call, e.g. {"harmony":["pno","bass"],"texture":["room"]}. Every stem gets the mix LUFS gain and the mix limiter gain curve sample by sample, so stems sum to the mix even when the limiter acts. Tracks not listed go to an automatic "other" stem. Files: <name>_<group>.wav/.ogg/... Result adds stems[] and sumCheck {maxDiffLsb, maxDiffDbfs, bits, stems, exact}. Not with trackIds; needs truePeakDb (default -1)' },
        truePeakDb: { type: 'number', description: 'True-peak ceiling in dBTP (default -1.0; null disables). Lookahead 4x-oversampled limiter after the LUFS gain, seam-safe for loops. Stems (trackIds) are not limited unless set explicitly' },
        clipFrom: { type: 'number', description: 'Excerpt start in seconds (disables loop points)' },
        clipTo: { type: 'number', description: 'Excerpt end in seconds' },
        library: { type: 'string', description: 'real (VSCO 2 CE, Salamander piano, FreePats guitar; default) or fluidr3 (old General MIDI sounds)', enum: ['real', 'fluidr3'] },
      },
      required: ['name'],
    },
  },
  {
    name: 'create_composition',
    description: 'Generates a structured video game soundtrack composition from musical intent.',
    parameters: {
      type: 'object',
      properties: {
        purpose: {
          type: 'string',
          description: 'Gameplay context',
          enum: ['exploration', 'combat', 'boss', 'town', 'ambient'],
        },
        mood: { type: 'string', description: 'Comma-separated emotional tags' },
        tempo: { type: 'number', description: 'BPM tempo' },
        key: { type: 'string', description: 'Root key, e.g. D, C, F#' },
        scale: { type: 'string', description: 'Scale/mode: natural_minor, dorian, phrygian, etc.' },
        durationBars: { type: 'number', description: 'Total length in bars (default 32)' },
        loop: { type: 'boolean', description: 'Whether the track should loop seamlessly' },
      },
      required: ['purpose'],
    },
  },
  {
    name: 'create_variation',
    description: 'Generates a musical variation (e.g. combat, melancholic, calm) of an existing composition.',
    parameters: {
      type: 'object',
      properties: {
        variationType: {
          type: 'string',
          enum: ['melancholic', 'combat', 'calm', 'boss', 'nostalgic'],
          description: 'Target variation style',
        },
        instruction: { type: 'string', description: 'Optional specific modification instructions' },
      },
      required: ['variationType'],
    },
  },
  {
    name: 'validate_composition',
    description: 'Validates harmony, ranges, rhythm, and loop continuity of a composition.',
    parameters: {
      type: 'object',
      properties: {
        compositionId: { type: 'string', description: 'ID of the composition to validate' },
      },
    },
  },
  {
    name: 'list_instruments',
    description: 'Returns the catalog of registered virtual instruments and acoustic specifications.',
    parameters: {
      type: 'object',
      properties: {
        family: { type: 'string', description: 'Optional instrument family filter' },
      },
    },
  },
  {
    name: 'get_music_knowledge',
    description: 'Consults the game music composition and music theory knowledge base.',
    parameters: {
      type: 'object',
      properties: {
        topicId: { type: 'string', description: 'Topic ID (e.g. scales, harmony, looping, adaptive, leitmotif)' },
      },
      required: ['topicId'],
    },
  },
];

export const MCP_RESOURCES = [
  { uri: 'music://theory/scales', name: 'Musical Scales and Modes Guide', mimeType: 'text/markdown' },
  { uri: 'music://theory/harmony', name: 'Game Harmonic Progressions', mimeType: 'text/markdown' },
  { uri: 'music://game-music/looping', name: 'Seamless Looping Guide', mimeType: 'text/markdown' },
  { uri: 'music://game-music/adaptive', name: 'Adaptive Music Rules', mimeType: 'text/markdown' },
  { uri: 'music://instruments', name: 'Virtual Instruments Manifest', mimeType: 'application/json' },
  { uri: 'music://skills', name: 'Available Claude Composer Skills', mimeType: 'application/json' },
];

export class McpDispatcher {
  public static async executeTool(
    toolName: string,
    args: Record<string, any>,
    currentComposition: Composition
  ): Promise<{ success: boolean; result: any }> {
    switch (toolName) {
      case 'create_composition': {
        const intent: MusicIntent = {
          purpose: args.purpose || 'exploration',
          mood: args.mood ? args.mood.split(',').map((s: string) => s.trim()) : ['melancholic'],
          genre: ['game soundtrack'],
          tempoRange: args.tempo ? [args.tempo, args.tempo] : [72, 72],
          intensity: args.purpose === 'boss' ? 95 : args.purpose === 'combat' ? 80 : 35,
          durationBars: args.durationBars || 32,
          loop: args.loop ?? true,
          adaptive: true,
          instrumentation: [],
          targetKey: args.key || 'D',
          targetScale: args.scale || 'natural_minor',
        };
        const comp = CompositionEngine.generateFromIntent(intent);
        return { success: true, result: comp };
      }

      case 'create_variation': {
        const variationType = (args.variationType as VariationType) || 'combat';
        const modified = VariationEngine.createVariation(currentComposition, variationType, args.instruction);
        return { success: true, result: modified };
      }

      case 'validate_composition': {
        const messages = CompositionValidator.validate(currentComposition);
        return {
          success: true,
          result: {
            isValid: messages.filter((m) => m.type === 'error').length === 0,
            messages,
          },
        };
      }

      case 'list_instruments': {
        const list = args.family
          ? INSTRUMENT_LIBRARY.filter((i) => i.family === args.family)
          : INSTRUMENT_LIBRARY;
        return { success: true, result: list };
      }

      case 'get_demo': {
        const ids = Object.keys(DEMO_REGISTRY);
        if (!args.demoId) return { success: true, result: { demoIds: ids } };
        const build = DEMO_REGISTRY[args.demoId];
        if (!build) return { success: false, result: `Unknown demoId "${args.demoId}". Available: ${ids.join(', ')}` };
        return { success: true, result: build() };
      }

      case 'edit_composition': {
        if (!currentComposition) return { success: false, result: 'edit_composition needs currentComposition' };
        try {
          const { composition, applied } = applyEdits(currentComposition, args.operations);
          const messages = CompositionValidator.validate(composition);
          const count = (type: string) => messages.filter((m) => m.type === type).length;
          return {
            success: true,
            result: {
              composition,
              applied,
              validation: {
                errors: count('error'),
                warnings: count('warning'),
                info: count('info'),
                messages: messages.filter((m) => m.type !== 'info').slice(0, 20),
              },
            },
          };
        } catch (err) {
          return { success: false, result: (err as Error).message };
        }
      }

      case 'get_chords':
        return { success: true, result: CHORD_TABLE };

      case 'new_composition': {
        const bars = Number(args.bars ?? 16);
        const tempo = Number(args.tempo ?? 66);
        if (!(bars >= 1 && tempo >= 30 && tempo <= 280)) {
          return { success: false, result: 'bars must be >= 1 and tempo 30-280' };
        }
        const now = new Date().toISOString();
        const tracks = Array.isArray(args.tracks) ? args.tracks : [];
        const badTrack = tracks.find((t: Record<string, any>) => !t?.id || !t?.instrumentId || !t?.role);
        if (badTrack) return { success: false, result: `Each track needs id, instrumentId and role: ${JSON.stringify(badTrack)}` };
        const comp: Composition = {
          id: `comp_${Date.now().toString(36)}`,
          projectId: 'proj_api',
          title: String(args.title ?? 'Untitled'),
          tempo,
          timeSignature: { numerator: 4, denominator: 4 },
          key: String(args.key ?? 'D'),
          scale: String(args.scale ?? 'major'),
          durationBars: bars,
          mode: args.loop ? 'loop' : 'linear',
          reverbPreset: args.reverbPreset ?? 'concert_hall',
          sections: [{ id: 'sec_1', name: 'A', startBar: 1, barCount: bars, intensity: 40 }],
          tracks: tracks.map(
            (t: Record<string, any>): Track => ({
              name: t.id,
              volume: 0.7,
              pan: 0,
              reverbSend: 0.35,
              ...t,
              id: t.id,
              instrumentId: t.instrumentId,
              role: t.role,
              notes: [],
              automation: [],
              mute: false,
              solo: false,
            })
          ),
          metadata: { created: now, modified: now, ...(args.loop ? { loopStartBar: 1, loopEndBar: bars } : {}) },
        };
        return { success: true, result: comp };
      }

      case 'export_audio':
      case 'measure_mix':
      case 'search_sfx':
      case 'export_sfx':
      case 'save_composition':
      case 'load_composition':
      case 'list_compositions':
      case 'delete_composition':
      case 'compare_compositions':
        return { success: false, result: `${toolName} runs only on the server (POST /api/mcp/call)` };

      case 'get_music_knowledge': {
        const article = KNOWLEDGE_ARTICLES.find((a) => a.id === args.topicId) || KNOWLEDGE_ARTICLES[0];
        return { success: true, result: article };
      }

      default:
        return { success: false, result: `Unknown MCP tool: ${toolName}` };
    }
  }

  public static readResource(uri: string): { content: string; mimeType: string } {
    if (uri === 'music://instruments') {
      return { content: JSON.stringify(INSTRUMENT_LIBRARY, null, 2), mimeType: 'application/json' };
    }
    if (uri === 'music://skills') {
      return { content: JSON.stringify(CLAUDE_SKILLS, null, 2), mimeType: 'application/json' };
    }
    if (uri.startsWith('music://theory/scales')) {
      const art = KNOWLEDGE_ARTICLES.find((a) => a.id === 'scales');
      return { content: art?.content || '', mimeType: 'text/markdown' };
    }
    if (uri.startsWith('music://theory/harmony')) {
      const art = KNOWLEDGE_ARTICLES.find((a) => a.id === 'harmony');
      return { content: art?.content || '', mimeType: 'text/markdown' };
    }
    if (uri.startsWith('music://game-music/looping')) {
      const art = KNOWLEDGE_ARTICLES.find((a) => a.id === 'looping');
      return { content: art?.content || '', mimeType: 'text/markdown' };
    }
    if (uri.startsWith('music://game-music/adaptive')) {
      const art = KNOWLEDGE_ARTICLES.find((a) => a.id === 'adaptive');
      return { content: art?.content || '', mimeType: 'text/markdown' };
    }
    return { content: '# Resource not found', mimeType: 'text/markdown' };
  }
}
