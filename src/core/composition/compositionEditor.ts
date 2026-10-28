import { Composition, NoteArticulation, NoteEvent, Track, TrackRole } from '../../types/music';
import { CHORDS as NAMED_CHORDS, Chord } from '../theory/chordVoicings';
import { restrikeNote } from './sustain';

/**
 * Edición precisa de composiciones vía API (herramienta MCP `edit_composition`).
 * Cada operación es JSON plano; se aplican en orden sobre una copia y la original no se toca.
 */

/** Nota como objeto o como tupla compacta [altura, inicio, duración, velocidad?, articulación?]. */
export type NoteInput =
  | { pitch: number; start: number; duration: number; velocity?: number; articulation?: NoteArticulation }
  | [number, number, number, number?, NoteArticulation?];

interface BeatRange {
  trackId?: string;
  fromBeat?: number;
  toBeat?: number;
}

export type EditOperation =
  | {
      op: 'set';
      title?: string;
      tempo?: number;
      key?: string;
      scale?: string;
      durationBars?: number;
      mode?: Composition['mode'];
      reverbPreset?: Composition['reverbPreset'];
    }
  | {
      op: 'add_track';
      track: Partial<Omit<Track, 'notes'>> & { id: string; name: string; instrumentId: string; role: TrackRole; notes?: NoteInput[] };
    }
  | { op: 'remove_track'; trackId: string }
  | { op: 'update_track'; trackId: string; props: Partial<Omit<Track, 'id' | 'notes' | 'automation'>> }
  | { op: 'copy_track'; fromTrackId: string; newId: string; name?: string; instrumentId?: string; role?: TrackRole; transpose?: number }
  | { op: 'set_notes'; trackId: string; notes: NoteInput[] }
  | { op: 'add_notes'; trackId: string; notes: NoteInput[] }
  | ({ op: 'remove_notes'; pitches?: number[] } & BeatRange)
  | ({ op: 'transpose'; semitones: number } & BeatRange)
  | ({ op: 'scale_velocity'; factor: number } & BeatRange)
  | { op: 'crop'; startBar: number; barCount: number }
  | {
      op: 'add_chord_pattern';
      trackId: string;
      /** Compases 1-indexados, inclusivos. */
      bars: [number, number];
      /**
       * Un compás por entrada (se repiten en ciclo): un acorde (nombre de la tabla de get_chords, p. ej. "D/F#", u objeto
       * {bass, voicing}) o segmentos [[acorde, tiempo, duración], ...] [[acorde, tiempo, duración], ...].
       * Con segmentos, cada nota usa el acorde vigente en su tiempo y se corta al terminar ese segmento.
       */
      chords: (string | Chord | ChordSegment[])[];
      /** [tiempo en el compás, voz (-1 = bajo; el índice da la vuelta sobre el voicing), duración, velocidad, articulación?] */
      pattern: [number, number, number, number, NoteArticulation?][];
      skipBars?: number[];
    }
  | {
      op: 'place_phrase';
      trackId: string;
      /** Compás 1-indexado donde arranca la frase; los tiempos de la frase pueden pasar de un compás. */
      bar: number;
      phrase: [number, number, number, number?][];
      transpose?: number;
      velocity?: number;
      articulation?: NoteArticulation;
    }
  | ({ op: 'humanize'; velJitter?: number; timeJitterBeats?: number; seed?: number } & BeatRange)
  | ({
      op: 'restrike';
      maxBeats: number;
      /** Cada cuántos tiempos entra un nuevo ataque (<= maxBeats, para que no queden huecos). */
      every: number;
      /** Cuánto más suave entra cada reataque respecto de la nota original (constante, no acumulado). */
      velDrop?: number;
    } & BeatRange)
  | ({
      op: 'limit_duration';
      maxBeats: number;
      /** Atrasa N tiempos las notas largas que caen en el tiempo 1 del compás (una respiración del arco). */
      shiftLongFromDownbeat?: number;
    } & BeatRange)
  | {
      op: 'fade';
      trackId?: string;
      bars: [number, number];
      fromVel?: number;
      toVel?: number;
      fromFactor?: number;
      toFactor?: number;
    };

/** [acorde, tiempo de inicio en el compás, duración en tiempos] */
export type ChordSegment = [string | Chord, number, number];

export interface EditResult {
  composition: Composition;
  applied: string[];
}

const clampPitch = (p: number) => Math.max(0, Math.min(127, Math.round(p)));
const clampVelocity = (v: number) => Math.max(1, Math.min(127, Math.round(v)));

function toNote(input: NoteInput, id: string): NoteEvent {
  const [pitch, start, duration, velocity = 80, articulation = 'sustain'] = Array.isArray(input)
    ? input
    : [input.pitch, input.start, input.duration, input.velocity, input.articulation];
  if (![pitch, start, duration].every(Number.isFinite) || duration <= 0 || start < 0) {
    throw new Error(`Invalid note ${JSON.stringify(input)}: pitch/start/duration must be numbers, start >= 0, duration > 0`);
  }
  return { id, pitch: clampPitch(pitch), start, duration, velocity: clampVelocity(velocity), articulation };
}

function findTrack(comp: Composition, trackId: string): Track {
  const track = comp.tracks.find((t) => t.id === trackId);
  if (!track) {
    throw new Error(`Track "${trackId}" not found. Tracks: ${comp.tracks.map((t) => t.id).join(', ')}`);
  }
  return track;
}

const tracksFor = (comp: Composition, trackId?: string) => (trackId ? [findTrack(comp, trackId)] : comp.tracks);

/** PRNG determinístico (mulberry32): la misma semilla da la misma humanización. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function resolveChord(chord: string | Chord): Chord {
  if (typeof chord !== 'string') {
    if (!Number.isFinite(chord?.bass) || !Array.isArray(chord?.voicing) || !chord.voicing.length) {
      throw new Error(`Invalid chord ${JSON.stringify(chord)}: expected {bass, voicing[]}`);
    }
    return chord;
  }
  const named = (NAMED_CHORDS as Record<string, Chord>)[chord];
  if (!named) throw new Error(`Unknown chord "${chord}". Named chords: ${Object.keys(NAMED_CHORDS).join(', ')}`);
  return named;
}

function checkBars(comp: Composition, [from, to]: [number, number]) {
  if (!(Number.isInteger(from) && Number.isInteger(to) && from >= 1 && to >= from && to <= comp.durationBars)) {
    throw new Error(`bars must be [from, to] with 1 <= from <= to <= durationBars (${comp.durationBars})`);
  }
}

const inRange = (n: NoteEvent, r: BeatRange) =>
  (r.fromBeat === undefined || n.start >= r.fromBeat) && (r.toBeat === undefined || n.start < r.toBeat);

export function applyEdits(source: Composition, operations: EditOperation[]): EditResult {
  if (!Array.isArray(operations)) throw new Error('`operations` must be an array');
  const comp: Composition = JSON.parse(JSON.stringify(source));
  const applied: string[] = [];
  let nextId = 1;
  const newId = (trackId: string) => `${trackId}_e${Date.now().toString(36)}_${nextId++}`;

  operations.forEach((operation, index) => {
    const where = `operation #${index} (${operation?.op})`;
    try {
      switch (operation.op) {
        case 'set': {
          const { op: _op, ...fields } = operation;
          if (fields.tempo !== undefined && !(fields.tempo >= 30 && fields.tempo <= 280)) throw new Error('tempo must be 30-280');
          if (fields.durationBars !== undefined && !(fields.durationBars >= 1)) throw new Error('durationBars must be >= 1');
          Object.assign(comp, Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)));
          applied.push(`set ${Object.keys(fields).join(', ')}`);
          break;
        }
        case 'add_track': {
          const { notes = [], ...props } = operation.track;
          if (comp.tracks.some((t) => t.id === props.id)) throw new Error(`Track "${props.id}" already exists`);
          comp.tracks.push({
            volume: 0.7,
            pan: 0,
            mute: false,
            solo: false,
            automation: [],
            ...props,
            notes: notes.map((n) => toNote(n, newId(props.id))),
          });
          applied.push(`add_track ${props.id} (${notes.length} notes)`);
          break;
        }
        case 'remove_track': {
          findTrack(comp, operation.trackId);
          comp.tracks = comp.tracks.filter((t) => t.id !== operation.trackId);
          applied.push(`remove_track ${operation.trackId}`);
          break;
        }
        case 'update_track': {
          Object.assign(findTrack(comp, operation.trackId), operation.props);
          applied.push(`update_track ${operation.trackId}`);
          break;
        }
        case 'copy_track': {
          const from = findTrack(comp, operation.fromTrackId);
          if (comp.tracks.some((t) => t.id === operation.newId)) throw new Error(`Track "${operation.newId}" already exists`);
          const shift = operation.transpose ?? 0;
          comp.tracks.push({
            ...JSON.parse(JSON.stringify(from)),
            id: operation.newId,
            name: operation.name ?? `${from.name} (copy)`,
            instrumentId: operation.instrumentId ?? from.instrumentId,
            role: operation.role ?? from.role,
            notes: from.notes.map((n) => ({ ...n, id: newId(operation.newId), pitch: clampPitch(n.pitch + shift) })),
          });
          applied.push(`copy_track ${operation.fromTrackId} -> ${operation.newId}`);
          break;
        }
        case 'set_notes':
        case 'add_notes': {
          const track = findTrack(comp, operation.trackId);
          const notes = operation.notes.map((n) => toNote(n, newId(track.id)));
          track.notes = operation.op === 'set_notes' ? notes : [...track.notes, ...notes];
          track.notes.sort((a, b) => a.start - b.start || a.pitch - b.pitch);
          applied.push(`${operation.op} ${track.id} (${notes.length} notes)`);
          break;
        }
        case 'remove_notes': {
          let removed = 0;
          for (const track of tracksFor(comp, operation.trackId)) {
            const before = track.notes.length;
            track.notes = track.notes.filter(
              (n) => !(inRange(n, operation) && (!operation.pitches || operation.pitches.includes(n.pitch)))
            );
            removed += before - track.notes.length;
          }
          applied.push(`remove_notes (${removed} removed)`);
          break;
        }
        case 'transpose': {
          for (const track of tracksFor(comp, operation.trackId)) {
            track.notes.forEach((n) => {
              if (inRange(n, operation)) n.pitch = clampPitch(n.pitch + operation.semitones);
            });
          }
          applied.push(`transpose ${operation.semitones}`);
          break;
        }
        case 'scale_velocity': {
          for (const track of tracksFor(comp, operation.trackId)) {
            track.notes.forEach((n) => {
              if (inRange(n, operation)) n.velocity = clampVelocity(n.velocity * operation.factor);
            });
          }
          applied.push(`scale_velocity x${operation.factor}`);
          break;
        }
        case 'crop': {
          const beatsPerBar = comp.timeSignature.numerator;
          const { startBar, barCount } = operation;
          if (!(startBar >= 1 && barCount >= 1)) throw new Error('startBar and barCount must be >= 1');
          const from = (startBar - 1) * beatsPerBar;
          const to = from + barCount * beatsPerBar;
          for (const track of comp.tracks) {
            track.notes = track.notes
              .filter((n) => n.start >= from && n.start < to)
              .map((n) => ({ ...n, start: n.start - from, duration: Math.min(n.duration, to - n.start) }));
          }
          comp.sections = comp.sections
            .filter((s) => s.startBar < startBar + barCount && s.startBar + s.barCount > startBar)
            .map((s) => {
              const first = Math.max(s.startBar, startBar);
              const last = Math.min(s.startBar + s.barCount, startBar + barCount);
              return { ...s, startBar: first - startBar + 1, barCount: last - first };
            });
          comp.durationBars = barCount;
          if (comp.metadata.loopStartBar !== undefined) {
            comp.metadata = { ...comp.metadata, loopStartBar: 1, loopEndBar: barCount };
          }
          applied.push(`crop bars ${startBar}-${startBar + barCount - 1}`);
          break;
        }
        case 'add_chord_pattern': {
          const track = findTrack(comp, operation.trackId);
          checkBars(comp, operation.bars);
          if (!operation.chords?.length || !operation.pattern?.length) throw new Error('chords and pattern must not be empty');
          const bars: { chord: Chord; from: number; to: number }[][] = operation.chords.map((entry) =>
            Array.isArray(entry)
              ? entry.map(([chord, beat, beats]) => {
                  if (!(Number.isFinite(beat) && beats > 0)) throw new Error(`Invalid chord segment ${JSON.stringify([chord, beat, beats])}`);
                  return { chord: resolveChord(chord), from: beat, to: beat + beats };
                })
              : [{ chord: resolveChord(entry), from: 0, to: Infinity }]
          );
          const beatsPerBar = comp.timeSignature.numerator;
          const endBeat = comp.durationBars * beatsPerBar;
          const [from, to] = operation.bars;
          let added = 0;
          for (let bar = from; bar <= to; bar++) {
            if (operation.skipBars?.includes(bar)) continue;
            const segments = bars[(bar - from) % bars.length];
            const barStart = (bar - 1) * beatsPerBar;
            for (const [beat, voice, dur, vel, art] of operation.pattern) {
              const segment = segments.find((seg) => beat >= seg.from && beat < seg.to);
              if (!segment) continue; // tiempo sin acorde en este compás
              const { chord } = segment;
              const pitch = voice < 0 ? chord.bass : chord.voicing[voice % chord.voicing.length];
              const start = barStart + beat;
              if (start >= endBeat) continue;
              const length = Math.min(dur, endBeat - start, barStart + segment.to - start);
              track.notes.push(toNote([pitch, start, length, vel, art ?? 'sustain'], newId(track.id)));
              added++;
            }
          }
          track.notes.sort((a, b) => a.start - b.start || a.pitch - b.pitch);
          applied.push(`add_chord_pattern ${track.id} bars ${from}-${to} (${added} notes)`);
          break;
        }
        case 'place_phrase': {
          const track = findTrack(comp, operation.trackId);
          if (!(Number.isInteger(operation.bar) && operation.bar >= 1)) throw new Error('bar must be an integer >= 1');
          const barStart = (operation.bar - 1) * comp.timeSignature.numerator;
          const shift = operation.transpose ?? 0;
          const notes = operation.phrase.map(([pitch, beat, dur, vel]) =>
            toNote([pitch + shift, barStart + beat, dur, vel ?? operation.velocity ?? 70, operation.articulation ?? 'legato'], newId(track.id))
          );
          track.notes.push(...notes);
          track.notes.sort((a, b) => a.start - b.start || a.pitch - b.pitch);
          applied.push(`place_phrase ${track.id} at bar ${operation.bar} (${notes.length} notes)`);
          break;
        }
        case 'humanize': {
          const rand = mulberry32(operation.seed ?? 1);
          const velJitter = operation.velJitter ?? 0;
          const timeJitter = operation.timeJitterBeats ?? 0;
          const endBeat = comp.durationBars * comp.timeSignature.numerator;
          let touched = 0;
          for (const track of tracksFor(comp, operation.trackId)) {
            track.notes.forEach((n) => {
              if (!inRange(n, operation)) return;
              n.velocity = clampVelocity(n.velocity + (rand() * 2 - 1) * velJitter);
              n.start = Math.min(Math.max(0, n.start + (rand() * 2 - 1) * timeJitter), endBeat - 0.01);
              // Si el corrimiento la empuja más allá del final, se acorta para que termine a tiempo.
              n.duration = Math.min(n.duration, endBeat - n.start);
              touched++;
            });
            track.notes.sort((a, b) => a.start - b.start || a.pitch - b.pitch);
          }
          applied.push(`humanize (${touched} notes, seed ${operation.seed ?? 1})`);
          break;
        }
        case 'restrike': {
          const { maxBeats, every } = operation;
          if (!(maxBeats > 0 && every > 0)) throw new Error('maxBeats and every must be > 0');
          if (every > maxBeats) throw new Error('every must be <= maxBeats, or the re-attacks leave gaps');
          const velDrop = operation.velDrop ?? 0;
          let split = 0;
          let created = 0;
          for (const track of tracksFor(comp, operation.trackId)) {
            track.notes = track.notes.flatMap((n) => {
              if (!inRange(n, operation) || n.duration <= maxBeats) return [n];
              split++;
              const parts = restrikeNote(n, maxBeats, every, velDrop, () => newId(track.id));
              created += parts.length - 1;
              return parts;
            });
            track.notes.sort((a, b) => a.start - b.start || a.pitch - b.pitch);
          }
          applied.push(`restrike ${split} notes (+${created} re-attacks, max ${maxBeats} every ${every})`);
          break;
        }
        case 'limit_duration': {
          if (!(operation.maxBeats > 0)) throw new Error('maxBeats must be > 0');
          const shift = operation.shiftLongFromDownbeat ?? 0;
          if (shift < 0) throw new Error('shiftLongFromDownbeat must be >= 0');
          const beatsPerBar = comp.timeSignature.numerator;
          let limited = 0;
          for (const track of tracksFor(comp, operation.trackId)) {
            track.notes.forEach((n) => {
              if (!inRange(n, operation) || n.duration <= operation.maxBeats) return;
              const onDownbeat = Math.abs(n.start / beatsPerBar - Math.round(n.start / beatsPerBar)) < 1e-6;
              if (shift > 0 && onDownbeat && n.duration - shift > 0) {
                n.start += shift;
                n.duration -= shift;
              }
              n.duration = Math.min(n.duration, operation.maxBeats);
              limited++;
            });
            track.notes.sort((a, b) => a.start - b.start || a.pitch - b.pitch);
          }
          applied.push(`limit_duration <= ${operation.maxBeats} beats (${limited} notes)`);
          break;
        }
        case 'fade': {
          checkBars(comp, operation.bars);
          const beatsPerBar = comp.timeSignature.numerator;
          const fromBeat = (operation.bars[0] - 1) * beatsPerBar;
          const toBeat = operation.bars[1] * beatsPerBar;
          const absolute = operation.fromVel !== undefined && operation.toVel !== undefined;
          if (!absolute && (operation.fromFactor === undefined || operation.toFactor === undefined)) {
            throw new Error('fade needs fromVel+toVel (absolute) or fromFactor+toFactor (scale)');
          }
          let touched = 0;
          for (const track of tracksFor(comp, operation.trackId)) {
            track.notes.forEach((n) => {
              if (n.start < fromBeat || n.start >= toBeat) return;
              const t = (n.start - fromBeat) / (toBeat - fromBeat);
              n.velocity = absolute
                ? clampVelocity(operation.fromVel! + (operation.toVel! - operation.fromVel!) * t)
                : clampVelocity(n.velocity * (operation.fromFactor! + (operation.toFactor! - operation.fromFactor!) * t));
              touched++;
            });
          }
          applied.push(`fade bars ${operation.bars[0]}-${operation.bars[1]} (${touched} notes)`);
          break;
        }
        default:
          throw new Error(`Unknown op "${(operation as { op?: string })?.op}"`);
      }
    } catch (err) {
      throw new Error(`${where}: ${(err as Error).message}`);
    }
  });

  comp.metadata = { ...comp.metadata, modified: new Date().toISOString() };
  return { composition: comp, applied };
}
