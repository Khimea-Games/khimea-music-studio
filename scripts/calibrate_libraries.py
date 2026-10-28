"""Mide el ajuste de nivel de cada instrumento real contra su equivalente FluidR3, por altura, y escribe
scripts/calibration.json (lo lee sample_libraries.calibration_db).

Uso: python scripts/calibrate_libraries.py
Para cada instrumento y cada 3 semitonos de su rango renderiza la misma nota (velocidades 40/64/90, sin reverb) con
las dos bibliotecas y guarda la diferencia en LUFS, suavizada con una mediana de 3 puntos (el round-robin mete ruido)
y limitada a ±6 dB de la mediana del instrumento: se conserva el balance por registro sin copiar los desparejos de
FluidR3 en los extremos.
"""

from __future__ import annotations

import json
import sys

import numpy as np

import render_audio as ra
import sample_libraries as sl

# needle de MAPPING -> (instrumentId de la app, instrumentId de referencia en FluidR3, articulación)
CASES = {
    "violin_solo": ("violin_solo", "violin_solo", None),
    "violin_solo:pizz": ("violin_solo", "violin_solo", "pizzicato"),
    "violin": ("violin_ensemble", "violin_ensemble", None),
    "violin:pizz": ("violin_ensemble", "violin_ensemble", "pizzicato"),
    "viola": ("viola_ensemble", "viola_ensemble", None),
    "viola:pizz": ("viola_ensemble", "viola_ensemble", "pizzicato"),
    "cello": ("cello_section", "cello_section", None),
    "cello:pizz": ("cello_section", "cello_section", "pizzicato"),
    "contrabass": ("contrabass_section", "contrabass_section", None),
    "contrabass:pizz": ("contrabass_section", "contrabass_section", "pizzicato"),
    "harp": ("plucked_harp", "plucked_harp", None),
    "flute": ("woodwinds_flute", "woodwinds_flute", None),
    "woodwind": ("woodwinds_ensemble", "woodwinds_flute", None),
    # FluidR3 no tiene oboe ni clarinete en esta app: se igualan a la flauta.
    "oboe": ("oboe_clarinet", "woodwinds_flute", None),
    "clarinet": ("clarinet", "woodwinds_flute", None),
    "horn": ("french_horn", "french_horn", None),
    "trombone": ("trombones_tuba", "trombones_tuba", None),
    "timpani": ("timpani", "timpani", None),
    "guitar": ("nylon_guitar", "nylon_guitar", None),
    "felt_piano": ("felt_piano", "felt_piano", None),
    # Contra la misma referencia que el felt: cambiar felt_piano por upright_piano conserva el balance de la mezcla.
    "upright_piano": ("upright_piano", "felt_piano", None),
    "piano": ("cinematic_grand_piano", "cinematic_grand_piano", None),
    # Medievales / de época: contra su equivalente más cercano en FluidR3, para que a igual volumen y velocidad
    # suenen parejos con el resto.
    "recorder": ("recorder", "woodwinds_flute", None),
    "organ": ("renaissance_organ", "woodwinds_flute", None),
    "bagpipe": ("bagpipe", "woodwinds_flute", None),
    "folk_harp": ("folk_harp", "plucked_harp", None),
    "psaltery": ("psaltery", "plucked_harp", None),
    "harpsichord": ("harpsichord", "plucked_harp", None),
    "bowed_psaltery": ("bowed_psaltery", "violin_ensemble", None),
    "dulcimer": ("dulcimer", "nylon_guitar", None),
    "strumstick": ("strumstick", "nylon_guitar", None),
    "frame_drum": ("frame_drum", "taiko_war_drums", None),
    "darbuka": ("darbuka", "taiko_war_drums", None),
    "tabor": ("tabor", "taiko_war_drums", None),
    "tambourine": ("tambourine", "taiko_war_drums", None),
    "finger_cymbals": ("finger_cymbals", "celesta", None),
    "vibraphone": ("vibraphone", "celesta", None),
    "glockenspiel": ("glockenspiel", "celesta", None),
    "accordion": ("accordion", "woodwinds_flute", None),
    "shaker": ("shaker", "taiko_war_drums", None),
    "brush": ("brush_kit", "taiko_war_drums", None),
    "drum_kit": ("drum_kit", "taiko_war_drums", None),
    # Orquestales: la percusión contra los taikos, como el resto de los kits; la trompeta contra el corno.
    "snare": ("snare_drum", "taiko_war_drums", None),
    "military_drum": ("military_drum", "taiko_war_drums", None),
    "suspended_cymbal": ("suspended_cymbals", "taiko_war_drums", None),
    "crash_cymbal": ("crash_cymbals", "taiko_war_drums", None),
    "bass_drum": ("bass_drum_impacts", "taiko_war_drums", None),
    "tam_tam": ("tam_tam", "taiko_war_drums", None),
    "gong": ("gong", "taiko_war_drums", None),
    "trumpet": ("brass_trumpet", "french_horn", None),
    "metal_drums": ("metal_drums", "taiko_war_drums", None),
    "choir_pad": ("choir_pad", "low_male_choir", None),
    "zurna": ("zurna", "woodwinds_flute", None),
    "retrowave_drums": ("retrowave_drums", "taiko_war_drums", None),
    "synthwave_drums": ("synthwave_drums", "taiko_war_drums", None),
    "darkwave_drums": ("darkwave_drums", "taiko_war_drums", None),
    "tubular_bells": ("tubular_bells", "celesta", None),
    "funeral_bell": ("funeral_bell", "celesta", None),
    "church_bell": ("church_bell", "celesta", None),
    "hand_chimes": ("hand_chimes", "celesta", None),
    "bell_tree": ("bell_tree", "celesta", None),
    "kalimba": ("kalimba", "plucked_harp", None),
    "mbira": ("mbira", "plucked_harp", None),
    "bowed_vibraphone": ("bowed_vibraphone", "celesta", None),
    "pipe_organ": ("pipe_organ", "woodwinds_flute", None),
    "pipe_organ_soft": ("pipe_organ_soft", "woodwinds_flute", None),
    "wood_perc": ("wood_perc", "taiko_war_drums", None),
    "bells_kit": ("bells_kit", "taiko_war_drums", None),
    "mizmar": ("mizmar", "woodwinds_flute", None),
    # Sólo se mide si el laúd está en sound-libraries/lute/ (si no, usa la calibración de la guitarra).
    "lute": ("acoustic_lute", "nylon_guitar", None),
}


# Cada patch de sinte de Function Loops (retro_bass_*, retro_lead_*, retro_synth_*) contra el arpa.
CASES.update({needle: (needle, "plucked_harp", None) for needle, (lib, *_rest) in sl.MAPPING if lib == "fl_synth"})

MAX_DEVIATION_DB = 6.0


def note_comp(instrument_id: str, pitch: int, articulation: str | None) -> dict:
    notes = [{"pitch": pitch, "start": 2.0 * i, "duration": 1.5, "velocity": v, "articulation": articulation or "sustain"}
             for i, v in enumerate((40, 64, 90))]
    return {"tempo": 66, "timeSignature": {"numerator": 4}, "durationBars": 2, "reverbPreset": "studio",
            "tracks": [{"id": "t", "instrumentId": instrument_id, "volume": 0.8, "pan": 0, "reverbSend": 0.0, "notes": notes}]}


def main() -> None:
    sl.calibration_db = lambda *args, **kwargs: 0.0  # medir sin la calibración vigente
    # Con claves como argumentos (p. ej. `upright_piano felt_piano`) mide sólo esas y conserva el resto de la tabla.
    only = set(sys.argv[1:])
    unknown = only - set(CASES)
    if unknown:
        raise SystemExit(f"claves desconocidas: {sorted(unknown)}")
    table: dict[str, list[list[float]]] = (
        json.loads(sl.CALIBRATION_FILE.read_text(encoding="utf-8")) if only and sl.CALIBRATION_FILE.exists() else {}
    )
    for key, (app_id, reference_id, articulation) in CASES.items():
        if only and key not in only:
            continue
        inst = sl.instrument_for(app_id, articulation)
        if key == "lute" and inst.library != "lute":
            print("lute               skipped (sound-libraries/lute/Laud_Espanol.sf2 no está)")
            continue
        lo, hi = min(r.lokey for r in inst.regions), max(r.hikey for r in inst.regions)
        pitches = list(range(max(lo, 21), min(hi, 108) + 1, 3))
        if inst.layered:  # batería en capas: sólo las teclas que tienen golpe (las demás no suenan)
            pitches = sorted({r.lokey for r in inst.regions if r.lokey == r.hikey and 21 <= r.lokey <= 108})
        diffs = []
        for pitch in pitches:
            real = ra.measure_lufs(ra.render(note_comp(app_id, pitch, articulation), 0, normalize=False, library="real"))
            fluid = ra.measure_lufs(ra.render(note_comp(reference_id, pitch, articulation), 0, normalize=False, library="fluidr3"))
            diffs.append(fluid - real)
        smooth = [float(np.median(diffs[max(0, i - 1): i + 2])) for i in range(len(diffs))]
        center = float(np.median(smooth))
        smooth = [min(max(d, center - MAX_DEVIATION_DB), center + MAX_DEVIATION_DB) for d in smooth]
        table[key] = [[p, round(d, 1)] for p, d in zip(pitches, smooth)]
        print(f"{key:18} {len(pitches):2} points  {min(smooth):+6.1f} .. {max(smooth):+6.1f} dB", flush=True)
    sl.CALIBRATION_FILE.write_text(json.dumps(table, indent=1), encoding="utf-8")
    print(f"written {sl.CALIBRATION_FILE}")


if __name__ == "__main__":
    main()
