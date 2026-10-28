import { Composition, NoteArticulation, Track } from '../../../types/music';

/**
 * Composiciones portadas desde el servidor con las notas incrustadas (ver scripts/embed_composition.py).
 * Se guardan tal cual las aprobó el usuario: humanizaciones con semilla y notas generadas por la sesión de tracks
 * quedan idénticas. Formato de nota: [altura, inicio, duración, velocidad, articulación?].
 */
export type EmbeddedNote = [number, number, number, number] | [number, number, number, number, NoteArticulation];

export interface EmbeddedComposition {
  id: string;
  meta: Pick<Composition, 'title' | 'tempo' | 'timeSignature' | 'key' | 'scale' | 'durationBars' | 'mode' | 'reverbPreset' | 'sections'>;
  metadata: Omit<Composition['metadata'], 'created' | 'modified'>;
  tracks: {
    props: Omit<Track, 'notes' | 'automation' | 'mute' | 'solo'>;
    /** Articulación de las notas que no traen una propia. */
    articulation: NoteArticulation;
    notes: EmbeddedNote[];
  }[];
}

export function buildEmbedded(data: EmbeddedComposition): Composition {
  const now = new Date().toISOString();
  return {
    id: data.id,
    projectId: 'proj_as_you_left_it',
    ...data.meta,
    tracks: data.tracks.map(({ props, articulation, notes }) => ({
      ...props,
      notes: notes.map(([pitch, start, duration, velocity, art], i) => ({
        id: `${props.id}_${i + 1}`,
        pitch,
        start,
        duration,
        velocity,
        articulation: art ?? articulation,
      })),
      automation: [],
      mute: false,
      solo: false,
    })),
    metadata: { ...data.metadata, created: now, modified: now },
  };
}
