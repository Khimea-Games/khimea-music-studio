import { NoteEvent } from '../../types/music';

/**
 * Reataque de notas largas: una nota más larga que `maxBeats` se divide en ataques cada `every` tiempos, cada uno de
 * a lo sumo `maxBeats`, y el último termina donde terminaba la original. Los reataques entran `velDrop` más suaves
 * que la original (constante, no acumulado). Mantiene continuo un colchón sin estirar samples de ~3,1 s ("órgano").
 * Lo usan la operación `restrike` de la API y las demos que se portan desde composiciones hechas con ella.
 */
export function restrikeNote(
  note: NoteEvent,
  maxBeats: number,
  every: number,
  velDrop: number,
  makeId: () => string
): NoteEvent[] {
  if (note.duration <= maxBeats) return [note];
  const end = note.start + note.duration;
  const parts: NoteEvent[] = [];
  for (let k = 0, start = note.start; start < end - 1e-9; k++, start = note.start + k * every) {
    // Redondeo a millonésimas de tiempo: evita residuos como 0.6000000000000014.
    const duration = Math.round(Math.min(maxBeats, end - start) * 1e6) / 1e6;
    const velocity = k === 0 ? note.velocity : Math.max(1, Math.min(127, Math.round(note.velocity - velDrop)));
    parts.push(k === 0 ? { ...note, duration } : { ...note, id: makeId(), start, duration, velocity });
    if (start + duration >= end - 1e-9) break; // este segmento ya llega al final original
  }
  return parts;
}
