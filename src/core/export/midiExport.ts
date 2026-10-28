import { Composition, NoteEvent, Track } from '../../types/music';

export class MidiExporter {
  public static exportToMidi(comp: Composition): Blob {
    const ticksPerQuarter = 480;
    const tracksBuffers: Uint8Array[] = [];

    // Track 0: Tempo and Time Signature
    tracksBuffers.push(this.buildConductorTrack(comp, ticksPerQuarter));

    // Instrument Tracks
    comp.tracks.forEach((track, index) => {
      tracksBuffers.push(this.buildInstrumentTrack(track, index, ticksPerQuarter));
    });

    // Build Header
    const numTracks = tracksBuffers.length;
    const header = new Uint8Array([
      0x4d, 0x54, 0x68, 0x64, // "MThd"
      0x00, 0x00, 0x00, 0x06, // Length 6
      0x00, 0x01,             // Format 1 (multi-track synchronous)
      (numTracks >> 8) & 0xff, numTracks & 0xff,
      (ticksPerQuarter >> 8) & 0xff, ticksPerQuarter & 0xff,
    ]);

    // Concatenate all chunks
    const totalLength = header.length + tracksBuffers.reduce((acc, t) => acc + t.length, 0);
    const result = new Uint8Array(totalLength);
    result.set(header, 0);

    let offset = header.length;
    for (const t of tracksBuffers) {
      result.set(t, offset);
      offset += t.length;
    }

    return new Blob([result], { type: 'audio/midi' });
  }

  private static buildConductorTrack(comp: Composition, ppq: number): Uint8Array {
    const events: number[] = [];

    // Time signature: delta 0, FF 58 04 nn dd cc bb
    const num = comp.timeSignature.numerator || 4;
    const den = Math.round(Math.log2(comp.timeSignature.denominator || 4));
    events.push(0x00, 0xff, 0x58, 0x04, num, den, 24, 8);

    // Tempo: delta 0, FF 51 03 tttttt (microseconds per quarter note)
    const bpm = comp.tempo || 120;
    const mpqn = Math.round(60000000 / bpm);
    events.push(0x00, 0xff, 0x51, 0x03, (mpqn >> 16) & 0xff, (mpqn >> 8) & 0xff, mpqn & 0xff);

    // End of Track
    events.push(0x00, 0xff, 0x2f, 0x00);

    return this.wrapTrackChunk(events);
  }

  private static buildInstrumentTrack(track: Track, channelIndex: number, ppq: number): Uint8Array {
    const events: number[] = [];
    const channel = (track.role === 'percussion' ? 9 : channelIndex % 16); // Channel 10 (0-indexed 9) for drums

    // Track Name meta event
    const nameBytes = new TextEncoder().encode(track.name);
    events.push(0x00, 0xff, 0x03);
    this.writeVarInt(events, nameBytes.length);
    nameBytes.forEach((b) => events.push(b));

    // Flatten notes into On and Off events with absolute tick times
    interface MidiEvent {
      tick: number;
      type: 'on' | 'off';
      pitch: number;
      velocity: number;
    }

    const midiEvents: MidiEvent[] = [];
    for (const note of track.notes) {
      const onTick = Math.round(note.start * ppq);
      const offTick = Math.round((note.start + note.duration) * ppq);
      midiEvents.push({
        tick: onTick,
        type: 'on',
        pitch: Math.max(0, Math.min(127, note.pitch)),
        velocity: Math.max(1, Math.min(127, note.velocity || 90)),
      });
      midiEvents.push({
        tick: offTick,
        type: 'off',
        pitch: Math.max(0, Math.min(127, note.pitch)),
        velocity: 0,
      });
    }

    // Sort by absolute tick
    midiEvents.sort((a, b) => a.tick - b.tick);

    let lastTick = 0;
    for (const ev of midiEvents) {
      const delta = Math.max(0, ev.tick - lastTick);
      lastTick = ev.tick;

      this.writeVarInt(events, delta);
      if (ev.type === 'on') {
        events.push(0x90 | (channel & 0x0f), ev.pitch, ev.velocity);
      } else {
        events.push(0x80 | (channel & 0x0f), ev.pitch, 0);
      }
    }

    // End of Track
    events.push(0x00, 0xff, 0x2f, 0x00);

    return this.wrapTrackChunk(events);
  }

  private static wrapTrackChunk(data: number[]): Uint8Array {
    const length = data.length;
    const chunk = new Uint8Array(8 + length);
    chunk[0] = 0x4d; // "MTrk"
    chunk[1] = 0x54;
    chunk[2] = 0x72;
    chunk[3] = 0x6b;
    chunk[4] = (length >> 24) & 0xff;
    chunk[5] = (length >> 16) & 0xff;
    chunk[6] = (length >> 8) & 0xff;
    chunk[7] = length & 0xff;
    chunk.set(new Uint8Array(data), 8);
    return chunk;
  }

  private static writeVarInt(arr: number[], value: number): void {
    let buffer = value & 0x7f;
    while ((value >>= 7)) {
      buffer <<= 8;
      buffer |= (value & 0x7f) | 0x80;
    }
    while (true) {
      arr.push(buffer & 0xff);
      if (buffer & 0x80) {
        buffer >>= 8;
      } else {
        break;
      }
    }
  }
}
