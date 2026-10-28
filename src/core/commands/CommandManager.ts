import {
  Composition,
  CompositionCommand,
  NoteEvent,
  Track,
} from '../../types/music';

export class CommandManager {
  private undoStack: Composition[] = [];
  private redoStack: Composition[] = [];
  private commandLog: CompositionCommand[] = [];

  constructor(private currentComposition: Composition) {}

  public getComposition(): Composition {
    return this.currentComposition;
  }

  public setComposition(newComp: Composition): void {
    this.currentComposition = JSON.parse(JSON.stringify(newComp));
  }

  public getCommandLog(): CompositionCommand[] {
    return [...this.commandLog];
  }

  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  public undo(): Composition | null {
    if (this.undoStack.length === 0) return null;

    const previousState = this.undoStack.pop()!;
    this.redoStack.push(JSON.parse(JSON.stringify(this.currentComposition)));
    this.currentComposition = previousState;
    return this.currentComposition;
  }

  public redo(): Composition | null {
    if (this.redoStack.length === 0) return null;

    const nextState = this.redoStack.pop()!;
    this.undoStack.push(JSON.parse(JSON.stringify(this.currentComposition)));
    this.currentComposition = nextState;
    return this.currentComposition;
  }

  /** Execute a command and record for undo */
  public execute(command: CompositionCommand): Composition {
    // Save snapshot for undo
    this.undoStack.push(JSON.parse(JSON.stringify(this.currentComposition)));
    this.redoStack = []; // Clear redo stack on new action
    this.commandLog.push(command);

    const comp = this.currentComposition;

    switch (command.type) {
      case 'CHANGE_TEMPO':
        comp.tempo = Math.max(30, Math.min(300, Number(command.payload.tempo)));
        break;

      case 'CHANGE_KEY':
        comp.key = String(command.payload.key);
        break;

      case 'CHANGE_SCALE':
        comp.scale = String(command.payload.scale);
        break;

      case 'ADD_TRACK': {
        const newTrack: Track = command.payload.track;
        comp.tracks.push(newTrack);
        break;
      }

      case 'REMOVE_TRACK': {
        const trackId = command.payload.trackId;
        comp.tracks = comp.tracks.filter((t) => t.id !== trackId);
        break;
      }

      case 'SET_TRACK_VOLUME': {
        const { trackId, volume } = command.payload;
        const track = comp.tracks.find((t) => t.id === trackId);
        if (track) track.volume = Math.max(0, Math.min(1, volume));
        break;
      }

      case 'SET_TRACK_PAN': {
        const { trackId, pan } = command.payload;
        const track = comp.tracks.find((t) => t.id === trackId);
        if (track) track.pan = Math.max(-1, Math.min(1, pan));
        break;
      }

      case 'SET_TRACK_MUTE': {
        const { trackId, mute } = command.payload;
        const track = comp.tracks.find((t) => t.id === trackId);
        if (track) track.mute = Boolean(mute);
        break;
      }

      case 'SET_TRACK_SOLO': {
        const { trackId, solo } = command.payload;
        const track = comp.tracks.find((t) => t.id === trackId);
        if (track) track.solo = Boolean(solo);
        break;
      }

      case 'SET_INSTRUMENT': {
        const { trackId, instrumentId } = command.payload;
        const track = comp.tracks.find((t) => t.id === trackId);
        if (track) track.instrumentId = instrumentId;
        break;
      }

      case 'ADD_NOTE': {
        const { trackId, note } = command.payload;
        const track = comp.tracks.find((t) => t.id === trackId);
        if (track) {
          track.notes.push(note);
          track.notes.sort((a, b) => a.start - b.start);
        }
        break;
      }

      case 'UPDATE_NOTE': {
        const { trackId, noteId, updates } = command.payload;
        const track = comp.tracks.find((t) => t.id === trackId);
        if (track) {
          const noteIndex = track.notes.findIndex((n) => n.id === noteId);
          if (noteIndex !== -1) {
            track.notes[noteIndex] = { ...track.notes[noteIndex], ...updates };
            track.notes.sort((a, b) => a.start - b.start);
          }
        }
        break;
      }

      case 'DELETE_NOTE': {
        const { trackId, noteId } = command.payload;
        const track = comp.tracks.find((t) => t.id === trackId);
        if (track) {
          track.notes = track.notes.filter((n) => n.id !== noteId);
        }
        break;
      }

      case 'TRANSPOSE_TRACK': {
        const { trackId, semitones } = command.payload;
        const track = comp.tracks.find((t) => t.id === trackId);
        if (track && track.role !== 'percussion') {
          track.notes = track.notes.map((n) => ({
            ...n,
            pitch: Math.max(0, Math.min(127, n.pitch + semitones)),
          }));
        }
        break;
      }

      case 'APPLY_COMPOSITION_DIFF': {
        this.currentComposition = JSON.parse(JSON.stringify(command.payload.composition));
        return this.currentComposition;
      }
    }

    comp.metadata.modified = new Date().toISOString();
    return this.currentComposition;
  }
}
