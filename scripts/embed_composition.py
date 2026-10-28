"""Convierte composiciones guardadas en el servidor (data/compositions/<id>.json) en demos de la app con las notas
incrustadas. Es la forma segura de portar lo que la sesión de tracks compuso por API: humanizaciones con semilla y notas
generadas del lado del cliente quedan exactamente iguales.

Uso:
    python scripts/embed_composition.py mi_tema:mi_demo [otra:otra_demo ...]

Escribe src/core/composition/demos/generated/<demoId>.ts (no editar a mano: se regenera). Cada módulo exporta
`build()` y se registra a mano en el archivo de cues correspondiente.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STORE = ROOT / "data" / "compositions"
OUT = ROOT / "src" / "core" / "composition" / "demos" / "generated"
META = ("title", "tempo", "timeSignature", "key", "scale", "durationBars", "mode", "reverbPreset", "sections")
TRACK_SKIP = {"notes", "automation", "mute", "solo"}


def num(x: float) -> str:
    r = repr(float(x))
    return r[:-2] if r.endswith(".0") else r


def note_rows(notes: list[dict], default_art: str) -> str:
    tuples = []
    for n in notes:
        t = [str(n["pitch"]), num(n["start"]), num(n["duration"]), str(n["velocity"])]
        art = n.get("articulation") or default_art
        if art != default_art:
            t.append(json.dumps(art))
        tuples.append("[" + ", ".join(t) + "]")
    lines, line = [], ""
    for t in tuples:
        if len(line) + len(t) > 110:
            lines.append(line.rstrip())
            line = ""
        line += t + ", "
    if line:
        lines.append(line.rstrip())
    return "\n".join("      " + l for l in lines)


def embed(store_id: str, demo_id: str) -> Path:
    comp = json.loads((STORE / f"{store_id}.json").read_text(encoding="utf-8"))
    meta = {k: comp[k] for k in META if k in comp}
    metadata = {k: v for k, v in comp.get("metadata", {}).items() if k not in ("created", "modified")}
    tracks_src = []
    for track in comp["tracks"]:
        arts = [n.get("articulation") or "sustain" for n in track["notes"]]
        default_art = max(set(arts), key=arts.count) if arts else "sustain"
        props = {k: v for k, v in track.items() if k not in TRACK_SKIP and v is not None}
        tracks_src.append(
            "    {\n"
            f"      props: {json.dumps(props, ensure_ascii=False)},\n"
            f"      articulation: {json.dumps(default_art)},\n"
            "      notes: [\n"
            f"{note_rows(track['notes'], default_art)}\n"
            "      ],\n"
            "    },"
        )
    source = (
        f"// Generado por scripts/embed_composition.py desde data/compositions/{store_id}.json. No editar a mano.\n"
        "import { Composition } from '../../../../types/music';\n"
        "import { buildEmbedded, EmbeddedComposition } from '../embedded';\n\n"
        "const DATA: EmbeddedComposition = {\n"
        f"  id: {json.dumps('comp_' + demo_id)},\n"
        f"  meta: {json.dumps(meta, ensure_ascii=False)},\n"
        f"  metadata: {json.dumps(metadata, ensure_ascii=False)},\n"
        "  tracks: [\n" + "\n".join(tracks_src) + "\n  ],\n"
        "};\n\n"
        "export const build = (): Composition => buildEmbedded(DATA);\n"
    )
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"{demo_id}.ts"
    path.write_text(source, encoding="utf-8", newline="\n")
    return path


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    for pair in sys.argv[1:]:
        store_id, demo_id = pair.split(":")
        path = embed(store_id, demo_id)
        print(f"{store_id} -> {path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
