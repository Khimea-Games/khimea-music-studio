import { getScaleMidiPitches, isNoteInScale, midiToFrequency, midiToNoteName, snapToScale } from '../src/core/theory/scales.js';
import { getChordPitches, solveVoiceLeading } from '../src/core/theory/chords.js';
import { GAME_PROGRESSIONS, resolveProgression } from '../src/core/theory/progressions.js';
import { CompositionEngine } from '../src/core/composition/CompositionEngine.js';
import { VariationEngine } from '../src/core/composition/VariationEngine.js';
import { CommandManager } from '../src/core/commands/CommandManager.js';
import { CompositionValidator } from '../src/core/validation/validator.js';
import { HumanizationEngine } from '../src/core/humanization/humanizer.js';
import { MidiExporter } from '../src/core/export/midiExport.js';
import { GamePackageExporter } from '../src/core/export/gamePackageExport.js';
import { MusicIntent } from '../src/types/music.js';
import { getInstrumentById } from '../src/core/instruments/library.js';
import { applyEdits } from '../src/core/composition/compositionEditor.js';
import { compareCompositions } from '../src/core/composition/compositionDiff.js';
import { DEMO_REGISTRY, McpDispatcher } from '../src/core/mcp/mcpProtocol.js';

let passedAssertions = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`FAIL: ${message}`);
  }
  passedAssertions++;
  console.log(`✓ PASS: ${message}`);
}

console.log('\n--- Running Khimea Music Engine Test Suite ---\n');

// 1. Music Theory & Scales Tests
const d4Name = midiToNoteName(62);
assert(d4Name === 'D4', `midiToNoteName(62) should be D4 (got ${d4Name})`);

const d4Freq = Math.round(midiToFrequency(62) * 10) / 10;
assert(d4Freq === 293.7, `midiToFrequency(62) should be 293.7 Hz (got ${d4Freq})`);

const dMinorPitches = getScaleMidiPitches('D', 'natural_minor', 60, 72);
assert(dMinorPitches.includes(62), 'D minor should contain D4 (62)');
assert(dMinorPitches.includes(65), 'D minor should contain F4 (65)');
assert(dMinorPitches.includes(69), 'D minor should contain A4 (69)');
assert(!dMinorPitches.includes(66), 'D minor should NOT contain F#4 (66)');

assert(isNoteInScale(62, 'D', 'natural_minor'), 'D4 should be in D natural minor');
assert(!isNoteInScale(64, 'D', 'phrygian'), 'E4 should not be in D Phrygian (Eb is in Phrygian)');

const snapped = snapToScale(66, 'D', 'natural_minor');
assert(snapped === 65 || snapped === 67, 'F#4 (66) snapped to D minor should be F4 (65) or G4 (67)');

// 2. Chords & Voice Leading Tests
const dMinChord = getChordPitches('D', 'min', 4, 0);
assert(dMinChord.length === 3, 'D min triad should have 3 notes');
assert(dMinChord[0] === 62 && dMinChord[1] === 65 && dMinChord[2] === 69, 'D min notes should be 62, 65, 69');

const gMinChordSmooth = solveVoiceLeading(dMinChord, 'G', 'min', 4);
assert(gMinChordSmooth.length === 3, 'Voice leading should return 3 voices');

// 3. Progressions
const resolved = resolveProgression('D', GAME_PROGRESSIONS[0]);
assert(resolved.length === 4, 'Dark Fantasy progression should resolve 4 chords');
assert(resolved[0].root === 'D', 'First chord root should be D');

// 4. Composition Engine & MusicIntent
const testIntent: MusicIntent = {
  purpose: 'exploration',
  mood: ['melancholic', 'ancient'],
  genre: ['dark fantasy'],
  tempoRange: [72, 72],
  intensity: 30,
  durationBars: 32,
  loop: true,
  adaptive: true,
  instrumentation: [],
  targetKey: 'D',
  targetScale: 'natural_minor',
};

const comp = CompositionEngine.generateFromIntent(testIntent, 12345);
assert(comp.tempo === 72, 'Composition tempo should be 72 BPM');
assert(comp.tracks.length >= 4, `Composition should have at least 4 tracks (got ${comp.tracks.length})`);
assert(comp.tracks.some((t) => t.role === 'melody'), 'Composition should have a melody track');
assert(comp.tracks.some((t) => t.role === 'bass'), 'Composition should have a bass track');

// 5. Validation
const valMessages = CompositionValidator.validate(comp);
const errors = valMessages.filter((m) => m.type === 'error');
assert(errors.length === 0, 'Generated composition should have 0 validation errors');

// 6. Humanization
const melodyTrack = comp.tracks.find((t) => t.role === 'melody')!;
const humanizedNotes = HumanizationEngine.humanizeNotes(melodyTrack.notes, { timingAmount: 0.5 });
assert(humanizedNotes.length === melodyTrack.notes.length, 'Humanization should preserve note count');

// 7. Variations Engine
const combatVariation = VariationEngine.createVariation(comp, 'combat');
assert(combatVariation.tempo > comp.tempo, 'Combat variation tempo should be faster than exploration');
assert(combatVariation.tracks.some((t) => t.role === 'percussion'), 'Combat variation should include percussion');

// 8. Command System & Undo/Redo
const cmdMgr = new CommandManager(comp);
const originalTempo = comp.tempo;
cmdMgr.execute({
  id: 'cmd_1',
  type: 'CHANGE_TEMPO',
  payload: { tempo: 90 },
  timestamp: Date.now(),
  description: 'Change tempo to 90',
});
assert(cmdMgr.getComposition().tempo === 90, 'Tempo should be 90 after command');
cmdMgr.undo();
assert(cmdMgr.getComposition().tempo === originalTempo, `Tempo should restore to ${originalTempo} after undo`);

// 9. Exports
const midiBlob = MidiExporter.exportToMidi(comp);
assert(midiBlob.size > 100, `MIDI blob should have valid binary data (size: ${midiBlob.size} bytes)`);

const restoredComp = cmdMgr.getComposition();
const gameManifest = GamePackageExporter.generateManifest(restoredComp);
assert(gameManifest.bpm === 72, `Game package manifest should have matching BPM (got ${gameManifest.bpm})`);
assert(gameManifest.stems.length === comp.tracks.length, 'Game package should list all track stems');

// 10. Autosave & Crash Recovery System
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (key: string) => store.get(key) || null,
    setItem: (key: string, val: string) => store.set(key, val),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
  };
}

const { AutoSaveManager } = await import('../src/core/storage/autoSaveManager.js');
const autoSaveMgr = new AutoSaveManager();

const savedSuccess = autoSaveMgr.saveNow(comp, 'Test Autosave');
assert(savedSuccess === true, 'Autosave saveNow should return true');

const loadedDraft = autoSaveMgr.loadDraft();
assert(loadedDraft !== null, 'Loaded draft should not be null');
assert(loadedDraft?.composition.id === comp.id, 'Loaded draft composition ID should match');
assert(loadedDraft?.composition.tracks.length === comp.tracks.length, 'Loaded draft track count should match');

const checkpoints = autoSaveMgr.getCheckpoints();
assert(checkpoints.length >= 1, 'Checkpoints list should have at least 1 entry');
assert(checkpoints[0].title === comp.title, 'Checkpoint title should match composition');

autoSaveMgr.clearDraft();
const emptyDraft = autoSaveMgr.loadDraft();
assert(emptyDraft === null, 'After clearDraft, loadDraft should return null');

// 11. Romantic Love Theme Demo
const romanticTheme = CompositionEngine.getDemoRomanticTheme();
assert(romanticTheme.tempo === 68, 'Romantic theme tempo should be 68 BPM');
assert(romanticTheme.key === 'G', 'Romantic theme key should be G');
assert(romanticTheme.scale === 'major', 'Romantic theme scale should be major');
assert(romanticTheme.tracks.length === 6, 'Romantic theme should have 6 orchestrated tracks');
assert(romanticTheme.tracks.some((t) => t.instrumentId === 'plucked_harp'), 'Romantic theme should feature Celtic Harp');
assert(romanticTheme.tracks.some((t) => t.instrumentId === 'cello_section'), 'Romantic theme should feature Cello solo');

// 14. Composition editor + API tools (get_demo / edit_composition)
// Composición sintética de 32 compases: una nota de melodía por compás en los primeros 16 (altura 61 + i), arpa, cuerdas y flauta.
const makeFixture = (): any => {
  const base = CompositionEngine.getDemoDarkForest();
  const track = (id: string, instrumentId: string, notes: any[]) => ({ ...base.tracks[0], id, name: id, instrumentId, notes });
  const nt = (pitch: number, start: number, duration: number, velocity = 80) => ({ id: `n_${pitch}_${start}`, pitch, start, duration, velocity });
  return {
    ...base, id: 'fixture', title: 'Fixture', tempo: 72, durationBars: 32,
    tracks: [
      track('track_melody', 'felt_piano', Array.from({ length: 16 }, (_, i) => nt(61 + i, i * 4, 1))),
      track('track_harp', 'plucked_harp', [nt(50, 0, 2), nt(57, 4, 2)]),
      track('track_violin', 'violin_ensemble', Array.from({ length: 22 }, (_, i) => nt(64 + (i % 5), i * 4 + 2, 1, 80))),
      track('track_flute', 'woodwinds_flute', [nt(72, 81, 1), nt(74, 90, 1)]),
    ],
  };
};
const editBase = makeFixture();
const cropped = applyEdits(editBase, [{ op: 'crop', startBar: 5, barCount: 4 }]).composition;
assert(cropped.durationBars === 4 && cropped.tracks.every((t) => t.notes.every((n) => n.start >= 0 && n.start + n.duration <= 16)), 'crop should keep bars 5-8 shifted to the start and clip durations');
assert(cropped.tracks[0].notes[0].pitch === 65 && cropped.tracks[0].notes[0].start === 0, 'crop should keep bar 5 as the new first melody note');
const boxed = applyEdits(editBase, [{ op: 'copy_track', fromTrackId: 'track_melody', newId: 'box', instrumentId: 'music_box', transpose: 12 }]).composition;
const boxTrack = boxed.tracks.find((t) => t.id === 'box')!;
assert(boxTrack.instrumentId === 'music_box' && boxTrack.notes[0].pitch === editBase.tracks[0].notes[0].pitch + 12, 'copy_track should duplicate a track with new instrument and transposition');
const thinned = applyEdits(editBase, [{ op: 'remove_notes', trackId: 'track_melody', pitches: [66] }]).composition;
assert(thinned.tracks[0].notes.every((n: any) => n.pitch !== 66) && editBase.tracks[0].notes.some((n: any) => n.pitch === 66), 'remove_notes should drop matching notes without touching the source');
let editError = '';
try { applyEdits(editBase, [{ op: 'set_notes', trackId: 'nope', notes: [] }]); } catch (e) { editError = (e as Error).message; }
assert(editError.includes('operation #0') && editError.includes('not found'), 'edit errors should name the failing operation');
const listed = await McpDispatcher.executeTool('get_demo', {}, editBase);
assert(listed.success && listed.result.demoIds.includes('dark_forest') && Object.keys(DEMO_REGISTRY).length >= 3, 'get_demo should list the demo compositions');
const viaApi = await McpDispatcher.executeTool('edit_composition', { operations: [{ op: 'set', tempo: 60 }] }, editBase);
assert(viaApi.success && viaApi.result.composition.tempo === 60 && viaApi.result.validation.errors === 0, 'edit_composition should return the edited composition with validation');

// 15. Pattern ops, chord table, skeleton and sustain warning
const skeleton = await McpDispatcher.executeTool('new_composition', { title: 'T', bars: 4, tempo: 66, loop: true, tracks: [{ id: 'p', instrumentId: 'felt_piano', role: 'harmony' }, { id: 'v', instrumentId: 'viola_ensemble', role: 'texture' }] }, editBase);
assert(skeleton.success && skeleton.result.durationBars === 4 && skeleton.result.tracks.length === 2 && skeleton.result.metadata.loopEndBar === 4, 'new_composition should build an empty loop skeleton');
const chordsRes = await McpDispatcher.executeTool('get_chords', {}, editBase);
assert(chordsRes.success && chordsRes.result.chords.D.bass === 50 && chordsRes.result.chords['A/C#'].voicing.length === 3, 'get_chords should expose the named chord table');
const phrase: [number, number, number][] = [[69, 0, 1], [74, 1, 1], [78, 2, 2]];
const patterned = applyEdits(skeleton.result, [
  { op: 'add_chord_pattern', trackId: 'p', bars: [1, 4], chords: ['D', 'A/C#', { bass: 47, voicing: [59, 62, 66] }], pattern: [[0, -1, 4, 50], [0.5, 0, 0.5, 40], [1, 5, 0.5, 40]], skipBars: [2] },
  { op: 'place_phrase', trackId: 'p', bar: 2, phrase, transpose: 12, velocity: 60 },
  { op: 'humanize', trackId: 'p', velJitter: 5, timeJitterBeats: 0.02, seed: 7 },
  { op: 'fade', trackId: 'p', bars: [3, 4], fromFactor: 1, toFactor: 0.5 },
]).composition;
const pNotes = patterned.tracks[0].notes;
assert(pNotes.filter((n) => n.velocity >= 1).length === 3 * 3 + 3, 'add_chord_pattern should write 3 notes per non-skipped bar, plus the placed phrase');
assert(pNotes.some((n) => n.pitch === 47) && pNotes.some((n) => n.pitch === 81) && !pNotes.some((n) => n.start >= 4 && n.start < 8 && n.pitch === 49), 'chord names, object chords, skipBars and transposed phrases should resolve correctly');
const again = applyEdits(skeleton.result, [
  { op: 'add_chord_pattern', trackId: 'p', bars: [1, 4], chords: ['D', 'A/C#', { bass: 47, voicing: [59, 62, 66] }], pattern: [[0, -1, 4, 50], [0.5, 0, 0.5, 40], [1, 5, 0.5, 40]], skipBars: [2] },
  { op: 'place_phrase', trackId: 'p', bar: 2, phrase, transpose: 12, velocity: 60 },
  { op: 'humanize', trackId: 'p', velJitter: 5, timeJitterBeats: 0.02, seed: 7 },
  { op: 'fade', trackId: 'p', bars: [3, 4], fromFactor: 1, toFactor: 0.5 },
]).composition;
assert(JSON.stringify(again.tracks[0].notes.map((n) => [n.pitch, n.start, n.velocity])) === JSON.stringify(pNotes.map((n) => [n.pitch, n.start, n.velocity])), 'humanize with the same seed should be deterministic');
const longViola = applyEdits(skeleton.result, [{ op: 'set_notes', trackId: 'v', notes: [[62, 0, 8, 50], [66, 8, 4, 50]] }]).composition;
const sustainMsgs = CompositionValidator.validate(longViola).filter((m) => m.category === 'sustain');
assert(sustainMsgs.length === 1 && sustainMsgs[0].message.startsWith('1 note(s)'), 'validator should warn only about string notes longer than the real sample (8 beats = 7.3 s yes, 4 beats = 3.6 s no)');

// 16. limit_duration + chord segments
const segBase = skeleton.result;
const segs = applyEdits(segBase, [
  { op: 'add_chord_pattern', trackId: 'v', bars: [1, 2], chords: [[['Asus4', 0, 2], ['A', 2, 2]], 'D'], pattern: [[0, 1, 4, 40], [2, 1, 2, 40]] },
]).composition.tracks[1].notes;
assert(segs[0].pitch === 62 && segs[0].duration === 2 && segs[1].pitch === 61 && segs[2].pitch === 62 && segs[2].duration === 4, 'add_chord_pattern should pick the active segment chord and cut notes at the segment end');
const limited = applyEdits(longViola, [{ op: 'limit_duration', trackId: 'v', maxBeats: 2.5, shiftLongFromDownbeat: 0.5 }]).composition.tracks[1].notes;
assert(limited[0].start === 0.5 && limited[0].duration === 2.5 && limited[1].start === 8.5 && limited[1].duration === 2.5, 'limit_duration should cap long notes and breathe downbeats');
const untouched = applyEdits(skeleton.result, [{ op: 'set_notes', trackId: 'v', notes: [[62, 0, 2, 50]] }, { op: 'limit_duration', trackId: 'v', maxBeats: 2.5, shiftLongFromDownbeat: 0.5 }]).composition.tracks[1].notes;
assert(untouched[0].start === 0 && untouched[0].duration === 2, 'limit_duration should leave short notes alone');
assert(CompositionValidator.validate({ ...longViola, tracks: [longViola.tracks[0], { ...longViola.tracks[1], notes: limited }] }).every((m) => m.category !== 'sustain'), 'limited notes should clear the sustain warning');

// 17. compare_compositions
const cmpBase = makeFixture();
assert(compareCompositions(cmpBase, makeFixture()).identical, 'compare should report two builds of the same composition as identical');
const cmpEdited = applyEdits(cmpBase, [
  { op: 'update_track', trackId: 'track_harp', props: { volume: 0.2 } },
  { op: 'scale_velocity', trackId: 'track_violin', factor: 0.5 },
  { op: 'remove_notes', trackId: 'track_flute', fromBeat: 80, toBeat: 84 },
  { op: 'set', tempo: 60 },
]).composition;
const cmp = compareCompositions(cmpBase, cmpEdited, 2);
const harpDiff = cmp.tracks.find((t) => t.trackId === 'track_harp')!;
const violinDiff = cmp.tracks.find((t) => t.trackId === 'track_violin')!;
const fluteDiff = cmp.tracks.find((t) => t.trackId === 'track_flute')!;
assert(!cmp.identical && cmp.meta.length === 1 && cmp.meta[0].field === 'tempo', 'compare should report meta changes');
assert(harpDiff.props[0].field === 'volume' && harpDiff.props[0].to === 0.2 && harpDiff.notes.changed === 0, 'compare should report prop changes without note noise');
assert(violinDiff.notes.changed === 22 && violinDiff.notes.examples.changed.length === 2 && violinDiff.notes.examples.changed[0].fields[0] === 'velocity', 'compare should count changed notes and cap examples');
assert(fluteDiff.notes.removed === 1 && fluteDiff.notes.added === 0 && cmp.tracks.length === 3, 'compare should report removed notes and skip unchanged tracks');

// 18. restrike
const struck = applyEdits(skeleton.result, [{ op: 'set_notes', trackId: 'v', notes: [[62, 0, 4, 50], [66, 4, 8, 50], [69, 12, 2, 50], [71, 14, 2.6, 50]] }, { op: 'restrike', trackId: 'v', maxBeats: 2.5, every: 2, velDrop: 4 }]).composition.tracks[1].notes;
const strikeSig = struck.map((n) => [n.pitch, n.start, n.duration, n.velocity]);
assert(JSON.stringify(strikeSig) === JSON.stringify([[62, 0, 2.5, 50], [62, 2, 2, 46], [66, 4, 2.5, 50], [66, 6, 2.5, 46], [66, 8, 2.5, 46], [66, 10, 2, 46], [69, 12, 2, 50], [71, 14, 2.5, 50], [71, 16, 0.6, 46]]), 'restrike should split long notes into overlapping re-attacks that keep the original end');
let strikeErr = '';
try { applyEdits(skeleton.result, [{ op: 'restrike', maxBeats: 2, every: 3 }]); } catch (e) { strikeErr = (e as Error).message; }
assert(strikeErr.includes('gaps'), 'restrike should reject every > maxBeats');

// 20. Medieval instruments registered in the app library
const medievalIds = ['vibraphone', 'glockenspiel', 'accordion', 'shaker', 'brush_kit', 'recorder', 'renaissance_organ', 'folk_harp', 'psaltery', 'bowed_psaltery', 'harpsichord', 'dulcimer', 'bagpipe', 'frame_drum', 'darbuka', 'tabor', 'tambourine', 'finger_cymbals', 'acoustic_lute'];
assert(medievalIds.every((id) => getInstrumentById(id).id === id && getInstrumentById(id).license.commercialUse), 'every medieval instrument should exist in the library with a commercial-use license');
const medievalComp = applyEdits(skeleton.result, [{ op: 'add_track', track: { id: 'rec', name: 'Recorder', instrumentId: 'recorder', role: 'melody', notes: [[67, 0, 2, 60], [72, 2, 2, 60]] } }, { op: 'add_track', track: { id: 'fd', name: 'Frame drum', instrumentId: 'frame_drum', role: 'percussion', notes: [[36, 0, 0.5, 80], [42, 1, 0.5, 60]] } }]).composition;
assert(CompositionValidator.validate(medievalComp).filter((m) => m.category === 'range').length === 0, 'medieval notes inside their ranges should not raise range warnings');

console.log(`\nAll ${passedAssertions} Unit and Integration Tests Passed Successfully! 🎉\n`);
