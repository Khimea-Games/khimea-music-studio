"""Efectos de sonido para juegos, desde una biblioteca de SFX propia.

    python scripts/sfx_tool.py search --query "door lock" [--category 03_Foley] [--max-sec 5] [--limit 20]
    python scripts/sfx_tool.py export --source "<categoria>/<carpeta>/<archivo>.wav" --out exports/sfx/door_lock [opciones]

La biblioteca no se copia: se lee desde la carpeta de la variable KHIMEA_SFX_LIBRARY, que tiene que tener un
CATALOGO.tsv (columnas categoria, carpeta, archivo, extension, kb, segundos). Si además tiene un LICENSE.json
({"name", "license", "licenseUrl", "attributionRequired", "proof"}), sus datos van al _CREDITS.txt de cada export.
Cada export recorta, nivela y escribe WAV/OGG listos para el juego. El script imprime el resultado en una línea JSON,
que lee el servidor.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

import numpy as np
from scipy.io import wavfile

sys.path.insert(0, str(Path(__file__).resolve().parent))
import render_audio as ra  # noqa: E402  (del renderizador: medición de loudness y pico real, limitador, escritura de WAV)

SR = ra.SR
LIBRARY = Path(os.environ.get("KHIMEA_SFX_LIBRARY", "sfx-library"))
AUDIO_EXT = {"wav", "mp3", "ogg", "flac", "aif", "aiff"}
GENERIC_LICENSE = {
    "name": "Biblioteca de SFX propia",
    "license": "Revisá la licencia de tu biblioteca antes de publicar: el sonido tiene que poder usarse en tu juego.",
    "licenseUrl": "",
    "attributionRequired": False,
}


def library_license() -> dict:
    """Licencia declarada por la biblioteca (LICENSE.json en su raíz); si no hay, un aviso genérico."""
    path = LIBRARY / "LICENSE.json"
    if path.exists():
        return {**GENERIC_LICENSE, **json.loads(path.read_text(encoding="utf-8"))}
    return GENERIC_LICENSE


def catalog() -> list[dict]:
    path = LIBRARY / "CATALOGO.tsv"
    if not path.exists():
        raise SystemExit(f"No encuentro el catálogo de la biblioteca de SFX en {path} (configurá KHIMEA_SFX_LIBRARY)")
    with open(path, encoding="utf-8") as f:
        return list(csv.DictReader(f, delimiter="\t"))


def search(args) -> dict:
    words = [w.lower() for w in (args.query or "").split()]
    hits = []
    for row in catalog():
        if row["extension"].lower() not in AUDIO_EXT:
            continue
        rel = f"{row['categoria']}/{row['carpeta']}/{row['archivo']}"
        text = rel.lower().replace("_", " ")
        if words and not all(w in text for w in words):
            continue
        if args.category and not row["categoria"].lower().startswith(args.category.lower()):
            continue
        sec = float(row.get("segundos") or 0)
        if args.max_sec is not None and sec > args.max_sec:
            continue
        hits.append({"source": rel, "category": row["categoria"], "seconds": sec, "kb": int(float(row.get("kb") or 0))})
    return {"library": str(LIBRARY), "total": len(hits), "results": hits[: args.limit]}


def load(path: Path) -> np.ndarray:
    pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-f", "f32le", "-ac", "2", "-ar", str(SR), "pipe:1"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(pcm, dtype=np.float32).reshape(-1, 2).astype(np.float64)


def trim_silence(x: np.ndarray, threshold_db: float = -60.0, keep_tail: float = 0.15) -> np.ndarray:
    loud = np.where(np.max(np.abs(x), axis=1) > 10 ** (threshold_db / 20))[0]
    if not len(loud):
        return x
    return x[max(0, loud[0] - int(0.002 * SR)): min(len(x), loud[-1] + 1 + int(keep_tail * SR))]


def pitch_shift(x: np.ndarray, semitones: float) -> np.ndarray:
    """Cambio de tono por remuestreo. Como en un sampler, también cambia la duración; es lo habitual para variaciones de SFX."""
    if abs(semitones) < 1e-6:
        return x
    pos = np.arange(0, len(x) - 1, 2 ** (semitones / 12))
    idx = np.arange(len(x))
    return np.stack([np.interp(pos, idx, x[:, c]) for c in range(2)], axis=1)


def level(x: np.ndarray, lufs: float | None, peak_db: float | None) -> tuple[np.ndarray, str]:
    """Nivela por LUFS integrado si el sonido dura al menos 0,4 s (el mínimo que mide BS.1770); si dura menos, por pico."""
    if lufs is not None and peak_db is None and len(x) >= int(0.4 * SR):
        return x * 10 ** ((lufs - ra.measure_lufs(x)) / 20), f"{lufs} LUFS"
    target = peak_db if peak_db is not None else -3.0
    peak = float(np.max(np.abs(x))) or 1.0
    return x * 10 ** (target / 20) / peak, f"pico {target} dBFS"


def fades(x: np.ndarray, fade_in: float, fade_out: float) -> np.ndarray:
    x = x.copy()
    n_in, n_out = min(len(x), int(fade_in * SR)), min(len(x), int(fade_out * SR))
    if n_in:
        x[:n_in] *= (np.sin(np.linspace(0, np.pi / 2, n_in)) ** 2)[:, None]
    if n_out:
        x[len(x) - n_out:] *= (np.cos(np.linspace(0, np.pi / 2, n_out)) ** 2)[:, None]
    return x


def export(args) -> dict:
    src = (LIBRARY / args.source).resolve()
    if LIBRARY.resolve() not in src.parents or not src.is_file():
        raise SystemExit(f"Fuente inválida o inexistente dentro de la biblioteca: {args.source}")
    base = load(src)
    if args.clip_from is not None or args.clip_to is not None:
        base = base[int((args.clip_from or 0) * SR): int(args.clip_to * SR) if args.clip_to is not None else len(base)]
    if args.trim:
        base = trim_silence(base)
    if not len(base):
        raise SystemExit("El recorte dejó el sonido vacío")
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(args.seed)
    src_sha = hashlib.sha256(src.read_bytes()).hexdigest()
    lic = library_license()
    files = []
    for v in range(max(1, args.variations)):
        semis, gain_db = args.pitch, 0.0
        if v > 0:  # cada variación cambia un poco el tono y el nivel; con la misma semilla, el resultado se repite
            semis += float(rng.uniform(-args.variation_pitch, args.variation_pitch))
            gain_db = float(rng.uniform(-args.variation_gain, args.variation_gain))
        x = pitch_shift(base, semis)
        if args.mono:
            x = np.repeat(x.mean(axis=1, keepdims=True), 2, axis=1)
        x = fades(x, args.fade_in, args.fade_out)
        x, how = level(x, args.lufs, args.peak_db)
        x = x * 10 ** (gain_db / 20)
        x, reduction, _ = ra.true_peak_limit(x, args.true_peak_db - 0.1, False)
        name = out if v == 0 else out.parent / f"{out.name}_v{v + 1}"
        wav, ogg = name.parent / f"{name.name}.wav", name.parent / f"{name.name}.ogg"
        if args.mono:
            wavfile.write(wav, SR, np.round(np.clip(x[:, 0], -1, 1) * 32767).astype("<i2"))
        else:
            ra.write_wav(wav, x)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(wav), "-c:a", "libvorbis", "-q:a", "6", str(ogg)], check=True)
        credits = name.parent / f"{name.name}_CREDITS.txt"
        credits.write_text("\n".join([
            f"Créditos de sonido: {name.name}", "",
            ("Requiere crédito en el juego." if lic["attributionRequired"] else "No requiere crédito obligatorio."), "",
            f"Fuente: {lic['name']}",
            f"  archivo original: {args.source}",
            f"  sha256 del original: {src_sha}",
            f"  licencia: {lic['license']}",
            f"  {lic['licenseUrl']}", "",
            f"Procesado en Khimea Music Studio: recorte de silencio {'sí' if args.trim else 'no'}, tono {semis:+.2f} st, "
            f"nivel {how}{f', ganancia {gain_db:+.1f} dB (variación)' if gain_db else ''}, "
            f"fundidos {args.fade_in}/{args.fade_out} s, pico real <= {args.true_peak_db} dBTP{', mono' if args.mono else ''}.",
            *([f"Prueba de licencia: {lic['proof']}"] if lic.get("proof") else []),
            "No incluir la biblioteca original en el juego.",
        ]) + "\n", encoding="utf-8")
        sil = ra.edge_silence(x)
        files.append({
            "wav": str(wav), "ogg": str(ogg), "credits": str(credits), "seconds": round(len(x) / SR, 3),
            "lufs": round(ra.measure_lufs(x), 1) if len(x) >= int(0.4 * SR) else None,
            "truePeakDb": ra.true_peak_db(x), "limiterReductionDb": round(float(reduction), 2),
            "headSec": sil["headSec"], "tailSec": sil["tailSec"], "pitchSemitones": round(semis, 2),
            "sha256Ogg": hashlib.sha256(ogg.read_bytes()).hexdigest(),
        })
    return {"source": args.source, "license": lic, "files": files}


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("search")
    s.add_argument("--query", default="")
    s.add_argument("--category")
    s.add_argument("--max-sec", type=float)
    s.add_argument("--limit", type=int, default=25)
    e = sub.add_parser("export")
    e.add_argument("--source", required=True, help="Ruta relativa dentro de la biblioteca (como la devuelve search)")
    e.add_argument("--out", required=True, help="Ruta de salida sin extensión")
    e.add_argument("--clip-from", type=float)
    e.add_argument("--clip-to", type=float)
    e.add_argument("--no-trim", dest="trim", action="store_false", help="No recortar el silencio de cabeza y cola")
    e.add_argument("--fade-in", type=float, default=0.0)
    e.add_argument("--fade-out", type=float, default=0.02)
    e.add_argument("--lufs", type=float, default=-18.0, help="Loudness integrado (sonidos de 0,4 s o más)")
    e.add_argument("--peak-db", type=float, help="Nivelar por pico en vez de LUFS (default para sonidos cortos: -3 dBFS)")
    e.add_argument("--true-peak-db", type=float, default=-1.0)
    e.add_argument("--pitch", type=float, default=0.0, help="Semitonos")
    e.add_argument("--variations", type=int, default=1, help="Cantidad de archivos (el primero es el base)")
    e.add_argument("--variation-pitch", type=float, default=1.0, help="Semitonos al azar (±) por variación")
    e.add_argument("--variation-gain", type=float, default=1.5, help="dB al azar (±) por variación")
    e.add_argument("--seed", type=int, default=1)
    e.add_argument("--mono", action="store_true")
    args = p.parse_args()
    print(json.dumps(search(args) if args.cmd == "search" else export(args), ensure_ascii=True))


if __name__ == "__main__":
    main()
