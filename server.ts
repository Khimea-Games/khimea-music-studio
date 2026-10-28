import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { INSTRUMENT_LIBRARY } from './src/core/instruments/library.js';
import { KNOWLEDGE_ARTICLES } from './src/core/knowledge/knowledgeBase.js';
import { CLAUDE_SKILLS } from './src/core/skills/skillsRegistry.js';
import { DEMO_REGISTRY, MCP_RESOURCES, MCP_TOOLS, McpDispatcher, SERVER_ONLY_TOOLS } from './src/core/mcp/mcpProtocol.js';
import { CompositionEngine } from './src/core/composition/CompositionEngine.js';
import { VariationEngine } from './src/core/composition/VariationEngine.js';
import { MidiExporter } from './src/core/export/midiExport.js';
import { compareCompositions } from './src/core/composition/compositionDiff.js';
import { Composition, MusicIntent } from './src/types/music.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
// Sólo esta máquina por defecto: la API no tiene autenticación. HOST=0.0.0.0 la expone en la red.
const HOST = process.env.HOST || '127.0.0.1';

app.use(express.json({ limit: '10mb' }));

// --- Rutas de la API ---

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'Khimea Music Studio',
    version: '1.0.0',
  });
});

// Último borrador en memoria, para recuperarlo si el navegador se cierra.
let latestServerDraft: {
  composition: any;
  timestamp: string;
  source: string;
} | null = null;

app.get('/api/drafts/latest', (req, res) => {
  if (!latestServerDraft) {
    return res.json({ hasDraft: false, draft: null });
  }
  res.json({ hasDraft: true, draft: latestServerDraft });
});

app.post('/api/drafts/save', (req, res) => {
  try {
    const { composition, source } = req.body;
    if (!composition) {
      return res.status(400).json({ success: false, error: 'Composition data is required' });
    }
    latestServerDraft = {
      composition,
      timestamp: new Date().toISOString(),
      source: source || 'autosave',
    };
    res.json({ success: true, timestamp: latestServerDraft.timestamp });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/instruments', (req, res) => {
  res.json(INSTRUMENT_LIBRARY);
});

app.get('/api/knowledge', (req, res) => {
  res.json(KNOWLEDGE_ARTICLES);
});

app.get('/api/knowledge/:id', (req, res) => {
  const article = KNOWLEDGE_ARTICLES.find((a) => a.id === req.params.id);
  if (!article) return res.status(404).json({ error: 'Article not found' });
  res.json(article);
});

app.get('/api/skills', (req, res) => {
  res.json(CLAUDE_SKILLS);
});

app.get('/api/mcp/tools', (req, res) => {
  res.json(MCP_TOOLS);
});

app.get('/api/mcp/resources', (req, res) => {
  res.json(MCP_RESOURCES);
});

const EXPORTS_DIR = path.join(__dirname, 'exports');
const RENDER_SCRIPT = path.join(__dirname, 'scripts', 'render_audio.py');
const SFX_SCRIPT = path.join(__dirname, 'scripts', 'sfx_tool.py');
const PYTHON_BIN = process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3');

const isLoopback = (address = '') => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address);

// --- Almacén de composiciones en el servidor (para no reenviar el JSON completo en cada llamada) ---
const STORE_DIR = path.join(__dirname, 'data', 'compositions');
const STORE_ID = /^[A-Za-z0-9_-]{1,80}$/;

function storePath(id: string) {
  if (!STORE_ID.test(String(id))) throw new Error('compositionId must be 1-80 letters, numbers, "_" or "-"');
  return path.join(STORE_DIR, `${id}.json`);
}

function saveStored(id: string, composition: Composition) {
  if (!composition?.tracks) throw new Error('Nothing to save: a composition is required');
  fs.mkdirSync(STORE_DIR, { recursive: true });
  fs.writeFileSync(storePath(id), JSON.stringify(composition, null, 2));
  return id;
}

function loadStored(id: string): Composition {
  const file = storePath(id);
  if (!fs.existsSync(file)) throw new Error(`No stored composition "${id}". Use list_compositions.`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function listStored() {
  if (!fs.existsSync(STORE_DIR)) return [];
  return fs
    .readdirSync(STORE_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const comp: Composition = JSON.parse(fs.readFileSync(path.join(STORE_DIR, f), 'utf8'));
      return {
        compositionId: f.slice(0, -5),
        title: comp.title,
        tempo: comp.tempo,
        durationBars: comp.durationBars,
        tracks: comp.tracks.map((t) => ({ id: t.id, instrumentId: t.instrumentId, notes: t.notes.length })),
        modified: comp.metadata?.modified,
      };
    });
}

/** Una composición a partir de un id guardado, un demoId o el objeto mismo (compare_compositions). */
function resolveComposition(ref: unknown, label: string): Composition {
  if (ref && typeof ref === 'object') {
    if (!Array.isArray((ref as Composition).tracks)) throw new Error(`${label} is not a composition object`);
    return ref as Composition;
  }
  const id = String(ref ?? '');
  if (STORE_ID.test(id) && fs.existsSync(storePath(id))) return loadStored(id);
  if (DEMO_REGISTRY[id]) return DEMO_REGISTRY[id]();
  throw new Error(`${label}: "${id}" is neither a stored compositionId nor a demoId`);
}

/** Resumen liviano para respuestas de edición sobre composiciones guardadas. */
const summarize = (comp: Composition) => ({
  title: comp.title,
  tempo: comp.tempo,
  durationBars: comp.durationBars,
  tracks: comp.tracks.map((t) => ({ id: t.id, instrumentId: t.instrumentId, notes: t.notes.length, volume: t.volume })),
});

/** Biblioteca de samples: 'real' (sound-libraries/) o 'fluidr3'. Sin valor, el renderer elige (real si está). */
function libraryArg(args: Record<string, any>): string | undefined {
  if (args.library === undefined) return undefined;
  if (args.library !== 'real' && args.library !== 'fluidr3') throw new Error('library must be "real" or "fluidr3"');
  return args.library;
}

function runRenderer(cli: string[], script = RENDER_SCRIPT): Promise<any> {
  return new Promise((resolve, reject) => {
    execFile(PYTHON_BIN, [script, ...cli], { timeout: 15 * 60 * 1000, maxBuffer: 20 * 1024 * 1024 }, (err, out, errOut) => {
      if (err) return reject(new Error(`${path.basename(script)} failed: ${errOut || err.message}`));
      try {
        resolve(JSON.parse(out.trim().split(/\r?\n/).pop() || '{}'));
      } catch {
        reject(new Error(`${path.basename(script)} returned no JSON: ${out.slice(-500)}`));
      }
    });
  });
}

/** Herramienta MCP search_sfx: busca en el catálogo de la biblioteca de efectos comprada (Function Loops). */
function searchSfx(args: Record<string, any>) {
  const cli = ['search', '--query', String(args.query || ''), '--limit', String(Math.max(1, Math.min(200, Number(args.limit) || 25)))];
  if (args.category) cli.push('--category', String(args.category));
  if (Number.isFinite(args.maxSec)) cli.push('--max-sec', String(args.maxSec));
  return runRenderer(cli, SFX_SCRIPT);
}

/** Herramienta MCP export_sfx: recorta, nivela y exporta un efecto (WAV + OGG + _CREDITS.txt) dentro de exports/. */
function exportSfx(args: Record<string, any>) {
  const source = String(args.source || '');
  if (!source || source.includes('..') || path.isAbsolute(source)) throw new Error('source must be a relative path returned by search_sfx');
  const name = String(args.name || '');
  if (!/^[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)*$/.test(name)) {
    throw new Error('name must be a relative path of letters, numbers, "_" or "-" (e.g. my-game/sfx/door_lock)');
  }
  const outBase = path.resolve(EXPORTS_DIR, name);
  if (!outBase.startsWith(EXPORTS_DIR + path.sep)) throw new Error('name must stay inside exports/');
  if (Number(args.variations) > 20) throw new Error('variations must be 20 or less');
  const cli = ['export', '--source', source, '--out', outBase];
  const numeric: Record<string, string> = {
    clipFrom: '--clip-from', clipTo: '--clip-to', fadeIn: '--fade-in', fadeOut: '--fade-out', lufs: '--lufs', peakDb: '--peak-db',
    truePeakDb: '--true-peak-db', pitch: '--pitch', variations: '--variations', variationPitch: '--variation-pitch',
    variationGain: '--variation-gain', seed: '--seed',
  };
  for (const [key, flag] of Object.entries(numeric)) {
    if (args[key] === undefined) continue;
    if (!Number.isFinite(args[key])) throw new Error(`${key} must be a number`);
    cli.push(flag, String(args[key]));
  }
  if (args.trim === false) cli.push('--no-trim');
  if (args.mono) cli.push('--mono');
  return runRenderer(cli, SFX_SCRIPT);
}

/** Herramienta MCP measure_mix: LUFS por pista, grupo y rango de compases, todo a 0 dB. */
async function measureMix(args: Record<string, any>, composition: Composition) {
  if (!composition?.tracks) throw new Error('measure_mix needs currentComposition or compositionId');
  if (args.ranges !== undefined && !(Array.isArray(args.ranges) && args.ranges.every((r: unknown) => Array.isArray(r) && r.length === 2))) {
    throw new Error('ranges must be [[fromBar, toBar], ...]');
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'khimea-measure-'));
  try {
    const compPath = path.join(tmp, 'composition.json');
    const specPath = path.join(tmp, 'spec.json');
    fs.writeFileSync(compPath, JSON.stringify(composition));
    fs.writeFileSync(specPath, JSON.stringify({ ranges: args.ranges, groups: args.groups, loop: Boolean(args.loop), library: libraryArg(args) }));
    return await runRenderer([compPath, '--measure', specPath]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** Herramienta MCP export_audio: JSON + MIDI + render de audio (WAV/OGG/MP3) dentro de exports/. */
async function exportAudio(args: Record<string, any>, composition: Composition) {
  if (!composition?.tracks) throw new Error('export_audio needs currentComposition');
  const library = libraryArg(args); // validar antes de escribir nada en exports/
  const name = String(args.name || '');
  if (!/^[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)*$/.test(name)) {
    throw new Error('name must be a relative path of letters, numbers, "_" or "-" (e.g. as-you-left-it/ch1/04_remembered)');
  }
  const outBase = path.resolve(EXPORTS_DIR, name);
  if (!outBase.startsWith(EXPORTS_DIR + path.sep)) throw new Error('name must stay inside exports/');

  const trackIds: string[] | undefined = Array.isArray(args.trackIds)
    ? args.trackIds
    : typeof args.trackIds === 'string' && args.trackIds
    ? args.trackIds.split(',')
    : undefined;
  const unknown = trackIds?.filter((id) => !composition.tracks.some((t) => t.id === id)) ?? [];
  if (unknown.length) throw new Error(`Unknown trackIds: ${unknown.join(', ')}`);

  // Mezcla + stems por grupo en una sola llamada: los stems llevan la ganancia y la curva del limitador de la mezcla.
  const stemGroups: Record<string, string[]> | undefined = args.stemGroups ?? undefined;
  if (stemGroups !== undefined) {
    if (trackIds) throw new Error('stemGroups exports the full mix plus its stems: do not combine it with trackIds');
    if (typeof stemGroups !== 'object' || Array.isArray(stemGroups) || !Object.keys(stemGroups).length) {
      throw new Error('stemGroups must be an object like {"harmony": ["pno", "bass"], "texture": ["room"]}');
    }
    const seen = new Set<string>();
    for (const [group, ids] of Object.entries(stemGroups)) {
      if (!/^[A-Za-z0-9_-]+$/.test(group) || group === 'other') {
        throw new Error(`Invalid stem group name "${group}" (letters, numbers, "_" or "-"; "other" is reserved)`);
      }
      if (!Array.isArray(ids) || !ids.length) throw new Error(`Stem group "${group}" needs a non-empty array of track ids`);
      for (const id of ids) {
        if (!composition.tracks.some((t) => t.id === id)) throw new Error(`Unknown track id "${id}" in stem group "${group}"`);
        if (seen.has(id)) throw new Error(`Track "${id}" is in more than one stem group`);
        seen.add(id);
      }
    }
    if (args.truePeakDb === null) throw new Error('stemGroups needs the true-peak limiter (truePeakDb cannot be null)');
  }

  fs.mkdirSync(path.dirname(outBase), { recursive: true });
  const jsonPath = `${outBase}.json`;
  fs.writeFileSync(jsonPath, JSON.stringify(composition, null, 2));
  let midiPath: string | null = null;
  if (!trackIds) {
    midiPath = `${outBase}.mid`;
    fs.writeFileSync(midiPath, Buffer.from(await MidiExporter.exportToMidi(composition).arrayBuffer()));
  }

  const cli = [jsonPath, '--out', outBase, '--json'];
  if (args.loop) cli.push('--loop');
  else cli.push('--ritardando', String(Number.isFinite(args.ritardando) ? args.ritardando : 2));
  if (Number.isFinite(args.gainDb)) cli.push('--gain-db', String(args.gainDb));
  else cli.push('--lufs', String(Number.isFinite(args.lufs) ? args.lufs : -18));
  if (trackIds) cli.push('--tracks', trackIds.join(','));
  if (library) cli.push('--library', library);
  // Techo de pico real (default -1 dBTP). Las capas (trackIds) no se limitan por defecto: un limitador por capa haría
  // que dejen de sumar exacto la mezcla. null lo desactiva.
  const truePeak = args.truePeakDb === undefined ? (trackIds ? null : -1.0) : args.truePeakDb;
  if (truePeak !== null) {
    if (!Number.isFinite(truePeak) || truePeak > 0 || truePeak < -12) throw new Error('truePeakDb must be between -12 and 0, or null');
    cli.push('--true-peak-db', String(truePeak));
  }
  if (stemGroups) cli.push('--stem-groups', JSON.stringify(stemGroups));
  if (args.fadeOutSec !== undefined && args.fadeOutSec !== null) {
    if (!Number.isFinite(args.fadeOutSec) || args.fadeOutSec <= 0 || args.fadeOutSec > 30) {
      throw new Error('fadeOutSec must be a number of seconds between 0 and 30');
    }
    if (!args.loop) cli.push('--fade-out', String(args.fadeOutSec));
  }
  if (args.busCompression !== undefined) {
    const mode = args.busCompression === true ? 'on' : args.busCompression === false ? 'off' : String(args.busCompression);
    if (!['auto', 'on', 'off'].includes(mode)) throw new Error('busCompression must be true, false or "auto"');
    cli.push('--bus-comp', mode);
  }
  if (args.maxTailSilenceSec !== undefined && args.maxTailSilenceSec !== null) {
    if (!Number.isFinite(args.maxTailSilenceSec) || args.maxTailSilenceSec < 0.2 || args.maxTailSilenceSec > 10) {
      throw new Error('maxTailSilenceSec must be a number of seconds between 0.2 and 10');
    }
    if (!args.loop) cli.push('--max-tail-silence', String(args.maxTailSilenceSec));
  }
  if (Number.isFinite(args.clipFrom)) cli.push('--clip-from', String(args.clipFrom));
  if (Number.isFinite(args.clipTo)) cli.push('--clip-to', String(args.clipTo));

  const summary = await runRenderer(cli);
  const rel = (p: string) => path.relative(__dirname, p).split(path.sep).join('/');
  return {
    ...summary,
    files: [...summary.files.map(rel), rel(jsonPath), ...(midiPath ? [rel(midiPath)] : [])],
    ...(summary.stems ? { stems: summary.stems.map((s: any) => ({ ...s, files: s.files.map(rel) })) } : {}),
  };
}

app.post('/api/mcp/call', async (req, res) => {
  try {
    const { toolName, arguments: toolArgs, currentComposition } = req.body;
    const args: Record<string, any> = toolArgs || {};

    if (SERVER_ONLY_TOOLS.includes(toolName)) {
      // Lanzan procesos o escriben archivos: sólo desde esta máquina.
      if (!isLoopback(req.socket.remoteAddress)) {
        return res.status(403).json({ success: false, result: `${toolName} is only available from localhost` });
      }
    }
    const composition: Composition =
      currentComposition ?? (args.compositionId && toolName !== 'load_composition' ? loadStored(args.compositionId) : undefined);

    switch (toolName) {
      case 'save_composition': {
        if (!currentComposition) throw new Error('save_composition needs currentComposition');
        const id = saveStored(args.compositionId || currentComposition.id, currentComposition);
        return res.json({ success: true, result: { compositionId: id, ...summarize(currentComposition) } });
      }
      case 'load_composition':
        return res.json({ success: true, result: loadStored(args.compositionId) });
      case 'list_compositions':
        return res.json({ success: true, result: listStored() });
      case 'delete_composition': {
        const file = storePath(args.compositionId);
        if (!fs.existsSync(file)) throw new Error(`No stored composition "${args.compositionId}"`);
        fs.unlinkSync(file);
        return res.json({ success: true, result: { deleted: args.compositionId } });
      }
      case 'compare_compositions': {
        const a = resolveComposition(args.a, 'a');
        const b = resolveComposition(args.b, 'b');
        const examples = Number.isFinite(args.examples) ? Math.max(0, Math.min(100, args.examples)) : 10;
        return res.json({ success: true, result: compareCompositions(a, b, examples) });
      }
      case 'export_audio': {
        const result = await exportAudio(args, composition);
        // El aviso de créditos va también arriba de todo: un agente que llame a la API tiene que verlo y transmitirlo.
        return res.json({ success: true, ...(result.credits?.notice ? { notice: result.credits.notice } : {}), result });
      }
      case 'measure_mix':
        return res.json({ success: true, result: await measureMix(args, composition) });
      case 'search_sfx':
        return res.json({ success: true, result: await searchSfx(args) });
      case 'export_sfx':
        return res.json({ success: true, result: await exportSfx(args) });
    }

    const response: { success: boolean; result: any; storedAs?: string } = await McpDispatcher.executeTool(toolName, args, composition);
    if (response.success && toolName === 'edit_composition' && (args.compositionId || args.saveAs)) {
      const id = saveStored(args.saveAs || args.compositionId, response.result.composition);
      response.storedAs = id;
      if (!args.returnComposition) response.result = { ...response.result, composition: summarize(response.result.composition) };
    } else if (response.success && args.saveAs && response.result?.tracks) {
      response.storedAs = saveStored(args.saveAs, response.result);
    }
    res.json(response);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/ai/compose', async (req, res) => {
  try {
    const { prompt } = req.body;
    const userPrompt = String(prompt || 'Música melancólica de fantasía oscura para explorar ruinas abandonadas');
    const lower = userPrompt.toLowerCase();

    if (lower.includes('romant') || lower.includes('amor') || lower.includes('love') || lower.includes('pasión') || lower.includes('emotiv')) {
      const romanticComp = CompositionEngine.getDemoRomanticTheme();
      return res.json({
        success: true,
        intent: {
          purpose: 'ambient',
          mood: ['romantic', 'heartfelt', 'tender', 'emotional'],
          genre: ['cinematic', 'orchestral love theme'],
          tempoRange: [68, 68],
          intensity: 45,
          durationBars: 32,
          loop: true,
          adaptive: false,
          instrumentation: ['felt_piano', 'cello_section', 'violin_ensemble', 'plucked_harp', 'french_horn', 'contrabass_section'],
          targetKey: 'G',
          targetScale: 'major',
          customPrompt: userPrompt,
        },
        composition: romanticComp,
      });
    }

    // Intención musical a partir de palabras clave del brief.
    const isBoss = lower.includes('boss') || lower.includes('jefe') || lower.includes('orco') || lower.includes('brutal');
    const isCombat = !isBoss && (lower.includes('combate') || lower.includes('batalla') || lower.includes('fight'));
    const isTown = lower.includes('taberna') || lower.includes('pueblo') || lower.includes('tavern');

    const parsedIntent: MusicIntent = {
      purpose: isBoss ? 'boss' : isCombat ? 'combat' : isTown ? 'town' : 'exploration',
      mood: isBoss
        ? ['aggressive', 'tribal', 'dark']
        : isCombat
        ? ['intense', 'driving', 'urgent']
        : ['melancholic', 'ancient', 'mysterious'],
      genre: ['dark fantasy', 'orchestral'],
      tempoRange: isBoss ? [132, 132] : isCombat ? [126, 126] : [72, 72],
      intensity: isBoss ? 95 : isCombat ? 80 : 35,
      durationBars: 32,
      loop: true,
      adaptive: true,
      instrumentation: [],
      targetKey: 'D',
      targetScale: isBoss ? 'phrygian' : isCombat ? 'harmonic_minor' : 'natural_minor',
      customPrompt: userPrompt,
    };

    const composition = CompositionEngine.generateFromIntent(parsedIntent);
    res.json({ success: true, intent: parsedIntent, composition });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/ai/modify', async (req, res) => {
  try {
    const { composition, instruction } = req.body;
    const lower = String(instruction || '').toLowerCase();

    let variationType: 'melancholic' | 'combat' | 'calm' | 'boss' | 'nostalgic' = 'melancholic';

    if (lower.includes('combate') || lower.includes('guerra') || lower.includes('rápido') || lower.includes('tensión')) {
      variationType = 'combat';
    } else if (lower.includes('boss') || lower.includes('jefe') || lower.includes('épico')) {
      variationType = 'boss';
    } else if (lower.includes('calm') || lower.includes('tranquilo') || lower.includes('paz')) {
      variationType = 'calm';
    } else if (lower.includes('triste') || lower.includes('melancol') || lower.includes('sad')) {
      variationType = 'melancholic';
    } else {
      variationType = 'nostalgic';
    }

    const modified = VariationEngine.createVariation(composition, variationType, instruction);
    res.json({ success: true, variationType, composition: modified });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/ai/explain', async (req, res) => {
  try {
    const { composition } = req.body;
    const comp = composition || {};

    const explanation = `### Musical Analysis: ${comp.title}

- **Tonal Center (${comp.key} ${comp.scale})**: Selected because the ${comp.scale} mode provides the ideal balance of emotional gravity and ancient mystery without abrasive dissonance.
- **Tempo (${comp.tempo} BPM)**: Gives the player space to absorb ambient environmental audio while maintaining steady thematic pacing.
- **Orchestration**: The Grand Piano delivers the fragile, human narrative voice, while the Cellos and Contrabass anchor the piece with warm, resonant emotional weight.
- **Atmospheric Bed**: The Ambient Pad fills the harmonic spectrum, ensuring the piece never sounds sparse or empty during loop transitions.`;

    res.json({ success: true, explanation });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Vite en desarrollo; archivos estáticos de dist/ en producción.
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`Khimea Music Studio running at http://${HOST}:${PORT}`);
  });
}

startServer();
