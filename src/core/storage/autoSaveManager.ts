import { Composition } from '../../types/music';

export interface AutoSavePayload {
  version: number;
  savedAt: number; // Date.now()
  timestamp: string; // ISO string
  composition: Composition;
  changeDescription?: string;
}

export interface AutoSaveCheckpoint {
  id: string;
  savedAt: number;
  timestamp: string;
  title: string;
  tempo: number;
  key: string;
  scale: string;
  tracksCount: number;
  notesCount: number;
  composition: Composition;
}

export type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface AutoSaveListenerState {
  status: AutoSaveStatus;
  lastSavedAt: number | null;
  error?: string;
}

type AutoSaveListener = (state: AutoSaveListenerState) => void;

const CURRENT_DRAFT_KEY = 'khimea_studio_autosave_draft_v1';
const CHECKPOINTS_KEY = 'khimea_studio_autosave_checkpoints_v1';
const MAX_CHECKPOINTS = 6;

export class AutoSaveManager {
  private static instance: AutoSaveManager;
  private status: AutoSaveStatus = 'idle';
  private lastSavedAt: number | null = null;
  private lastSavedCompositionJson: string = '';
  private listeners: Set<AutoSaveListener> = new Set();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private periodicTimer: ReturnType<typeof setInterval> | null = null;
  private currentCompositionRef: Composition | null = null;

  public static getInstance(): AutoSaveManager {
    if (!AutoSaveManager.instance) {
      AutoSaveManager.instance = new AutoSaveManager();
    }
    return AutoSaveManager.instance;
  }

  constructor() {
    // Attempt to read previous save timestamp if available
    try {
      const existing = localStorage.getItem(CURRENT_DRAFT_KEY);
      if (existing) {
        const parsed: AutoSavePayload = JSON.parse(existing);
        if (parsed.savedAt) {
          this.lastSavedAt = parsed.savedAt;
        }
      }
    } catch {
      // Ignore initial parse errors
    }
  }

  public subscribe(listener: AutoSaveListener): () => void {
    this.listeners.add(listener);
    // Initial emit
    listener({
      status: this.status,
      lastSavedAt: this.lastSavedAt,
    });
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(error?: string) {
    const state: AutoSaveListenerState = {
      status: this.status,
      lastSavedAt: this.lastSavedAt,
      error,
    };
    this.listeners.forEach((fn) => {
      try {
        fn(state);
      } catch (err) {
        console.error('AutoSave listener error:', err);
      }
    });
  }

  /**
   * Starts automatic periodic autosave background interval.
   */
  public startPeriodicAutoSave(intervalMs: number = 15000): void {
    if (this.periodicTimer) {
      clearInterval(this.periodicTimer);
    }
    this.periodicTimer = setInterval(() => {
      if (this.currentCompositionRef) {
        this.saveNow(this.currentCompositionRef, 'Periodic interval backup');
      }
    }, intervalMs);
  }

  public stopPeriodicAutoSave(): void {
    if (this.periodicTimer) {
      clearInterval(this.periodicTimer);
      this.periodicTimer = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  /**
   * Call whenever composition changes. Debounces saving to avoid performance hits during rapid note dragging.
   */
  public queueAutoSave(comp: Composition, changeDesc?: string, debounceDelayMs: number = 1200): void {
    this.currentCompositionRef = comp;

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.saveNow(comp, changeDesc);
    }, debounceDelayMs);
  }

  /**
   * Saves composition immediately to localStorage and fires asynchronous server backup.
   */
  public saveNow(comp: Composition, changeDesc?: string): boolean {
    if (!comp || !comp.tracks) return false;

    const serialized = JSON.stringify(comp);
    // Avoid re-saving identical state if nothing changed
    if (serialized === this.lastSavedCompositionJson && this.status === 'saved') {
      return true;
    }

    this.status = 'saving';
    this.notify();

    try {
      const now = Date.now();
      const payload: AutoSavePayload = {
        version: 1,
        savedAt: now,
        timestamp: new Date(now).toISOString(),
        composition: comp,
        changeDescription: changeDesc,
      };

      // 1. Primary persistence: localStorage
      localStorage.setItem(CURRENT_DRAFT_KEY, JSON.stringify(payload));
      this.lastSavedAt = now;
      this.lastSavedCompositionJson = serialized;

      // 2. Add checkpoint to rolling history
      this.addCheckpoint(comp, now);

      // 3. Secondary tier: non-blocking server backup
      this.backupToServer(comp, changeDesc);

      this.status = 'saved';
      this.notify();
      return true;
    } catch (err: any) {
      console.warn('AutoSave storage error:', err);
      this.status = 'error';
      this.notify(err.message || 'Failed to save to localStorage');
      return false;
    }
  }

  private addCheckpoint(comp: Composition, now: number): void {
    try {
      const existingStr = localStorage.getItem(CHECKPOINTS_KEY);
      let list: AutoSaveCheckpoint[] = existingStr ? JSON.parse(existingStr) : [];

      const totalNotes = comp.tracks.reduce((acc, t) => acc + (t.notes?.length || 0), 0);

      const checkpoint: AutoSaveCheckpoint = {
        id: `cp_${now}`,
        savedAt: now,
        timestamp: new Date(now).toISOString(),
        title: comp.title || 'Untitled Composition',
        tempo: comp.tempo,
        key: comp.key,
        scale: comp.scale,
        tracksCount: comp.tracks.length,
        notesCount: totalNotes,
        composition: comp,
      };

      // Prepend and limit size
      list = [checkpoint, ...list.slice(0, MAX_CHECKPOINTS - 1)];
      localStorage.setItem(CHECKPOINTS_KEY, JSON.stringify(list));
    } catch {
      // Non-critical, ignore quota or parsing error
    }
  }

  public getCheckpoints(): AutoSaveCheckpoint[] {
    try {
      const existingStr = localStorage.getItem(CHECKPOINTS_KEY);
      if (!existingStr) return [];
      return JSON.parse(existingStr);
    } catch {
      return [];
    }
  }

  /**
   * Load the active autosaved draft if present and structurally valid.
   */
  public loadDraft(): AutoSavePayload | null {
    try {
      const str = localStorage.getItem(CURRENT_DRAFT_KEY);
      if (!str) return null;
      const parsed: AutoSavePayload = JSON.parse(str);
      if (
        parsed &&
        parsed.composition &&
        parsed.composition.id &&
        Array.isArray(parsed.composition.tracks) &&
        typeof parsed.composition.tempo === 'number'
      ) {
        return parsed;
      }
      return null;
    } catch (err) {
      console.error('Failed to load autosaved draft:', err);
      return null;
    }
  }

  /**
   * Clear autosave data.
   */
  public clearDraft(): void {
    try {
      localStorage.removeItem(CURRENT_DRAFT_KEY);
      localStorage.removeItem(CHECKPOINTS_KEY);
      this.lastSavedAt = null;
      this.lastSavedCompositionJson = '';
      this.status = 'idle';
      this.notify();
    } catch (err) {
      console.error('Error clearing draft:', err);
    }
  }

  /**
   * Non-blocking server backup
   */
  private async backupToServer(comp: Composition, changeDesc?: string): Promise<void> {
    try {
      await fetch('/api/drafts/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          composition: comp,
          source: changeDesc || 'autosave',
        }),
      });
    } catch {
      // Server sync is best-effort fallback; localStorage is primary for crash recovery
    }
  }
}

export const globalAutoSaveManager = AutoSaveManager.getInstance();
