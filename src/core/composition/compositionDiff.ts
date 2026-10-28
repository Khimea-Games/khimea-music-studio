import { Composition, NoteEvent, Track } from '../../types/music';

/**
 * Diferencias entre dos composiciones (herramienta MCP `compare_compositions`).
 * Las notas se emparejan por (altura, inicio): si cambia el inicio, cuenta como quitada + agregada.
 */

const META_FIELDS = ['title', 'tempo', 'key', 'scale', 'durationBars', 'mode', 'reverbPreset'] as const;
const TRACK_PROPS = ['name', 'instrumentId', 'role', 'volume', 'pan', 'reverbSend', 'mute', 'solo'] as const;
const NOTE_FIELDS = ['duration', 'velocity', 'articulation'] as const;

type NoteTuple = [number, number, number, number, string | undefined];
const tuple = (n: NoteEvent): NoteTuple => [n.pitch, n.start, n.duration, n.velocity, n.articulation];
const noteKey = (n: NoteEvent) => `${n.pitch}@${n.start}`;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export interface PropChange {
  field: string;
  from: unknown;
  to: unknown;
}

export interface TrackDiff {
  trackId: string;
  props: PropChange[];
  notes: {
    added: number;
    removed: number;
    changed: number;
    unchanged: number;
    /** Hasta `examples` casos de cada tipo: [altura, inicio, duración, velocidad, articulación]. */
    examples: {
      added: NoteTuple[];
      removed: NoteTuple[];
      changed: { from: NoteTuple; to: NoteTuple; fields: string[] }[];
    };
  };
}

export interface CompositionDiff {
  identical: boolean;
  meta: PropChange[];
  tracksAdded: string[];
  tracksRemoved: string[];
  tracks: TrackDiff[];
}

function diffProps(a: Record<string, any>, b: Record<string, any>, fields: readonly string[]): PropChange[] {
  return fields.filter((f) => !same(a[f], b[f])).map((field) => ({ field, from: a[field], to: b[field] }));
}

function diffTrack(a: Track, b: Track, examples: number): TrackDiff {
  // Varias notas pueden compartir altura e inicio: se emparejan en orden.
  const pool = new Map<string, NoteEvent[]>();
  for (const n of a.notes) pool.set(noteKey(n), [...(pool.get(noteKey(n)) ?? []), n]);

  const added: NoteTuple[] = [];
  const changed: TrackDiff['notes']['examples']['changed'] = [];
  let addedCount = 0;
  let changedCount = 0;
  let unchanged = 0;
  for (const n of b.notes) {
    const match = pool.get(noteKey(n))?.shift();
    if (!match) {
      addedCount++;
      if (added.length < examples) added.push(tuple(n));
      continue;
    }
    const fields = NOTE_FIELDS.filter((f) => !same(match[f], n[f]));
    if (!fields.length) {
      unchanged++;
      continue;
    }
    changedCount++;
    if (changed.length < examples) changed.push({ from: tuple(match), to: tuple(n), fields: [...fields] });
  }
  const leftovers = [...pool.values()].flat();

  return {
    trackId: b.id,
    props: diffProps(a, b, TRACK_PROPS),
    notes: {
      added: addedCount,
      removed: leftovers.length,
      changed: changedCount,
      unchanged,
      examples: { added, removed: leftovers.slice(0, examples).map(tuple), changed },
    },
  };
}

export function compareCompositions(a: Composition, b: Composition, examples = 10): CompositionDiff {
  const aTracks = new Map(a.tracks.map((t) => [t.id, t]));
  const bIds = new Set(b.tracks.map((t) => t.id));
  const tracks = b.tracks
    .filter((t) => aTracks.has(t.id))
    .map((t) => diffTrack(aTracks.get(t.id)!, t, examples))
    .filter((d) => d.props.length || d.notes.added || d.notes.removed || d.notes.changed);
  const meta = diffProps(a, b, META_FIELDS);
  const tracksAdded = b.tracks.filter((t) => !aTracks.has(t.id)).map((t) => t.id);
  const tracksRemoved = a.tracks.filter((t) => !bIds.has(t.id)).map((t) => t.id);
  return {
    identical: !meta.length && !tracksAdded.length && !tracksRemoved.length && !tracks.length,
    meta,
    tracksAdded,
    tracksRemoved,
    tracks,
  };
}
