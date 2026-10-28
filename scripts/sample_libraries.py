"""Bibliotecas de samples reales para render_audio.py (todas aptas para uso comercial en juegos).

- VSCO 2 Community Edition (CC0): cuerdas solo y en sección, arpa, flauta, oboe, clarinete, corno, trombón, timbales.
- Salamander Grand Piano V3 (CC-BY 3.0, Alexander Holm; mapeo SFZ de kinwie): piano de cola, 16 capas de intensidad.
- FreePats Spanish Classical Guitar (CC0, roberto@zenvoid.org): guitarra de nylon. FreePats Bagpipe (CC0): gaita.
- Versilian Community Sample Library, VCSL (CC0): instrumentos medievales y de época (flautas dulces, órgano
  renacentista, arpa folk, salterio, clave, strumstick) y percusión de mano (pandero, darbuka, tambor de cuerdas,
  pandereta, crótalos).
- Laúd español de Toni Bellinte (CC BY 3.0), si está en sound-libraries/lute/ (se baja a mano: ver README).

Viven en sound-libraries/ (ver sound-libraries/README.md). Si faltan, render_audio.py usa los soundfonts FluidR3.
"""

from __future__ import annotations

import hashlib
import re
import subprocess
from dataclasses import dataclass, replace
from functools import lru_cache
from pathlib import Path

import numpy as np
from scipy.signal import lfilter

SR = 44100
ROOT = Path(__file__).resolve().parent.parent
LIB_DIR = ROOT / "sound-libraries"
CACHE_DIR = LIB_DIR / ".cache"
NOTE_INDEX = {"c": 0, "d": 2, "e": 4, "f": 5, "g": 7, "a": 9, "b": 11}


def parse_key(value: str) -> int:
    """Número MIDI o nombre de nota SFZ (c4 = 60, admite # y b)."""
    value = value.strip().lower()
    if re.fullmatch(r"-?\d+", value):
        return int(value)
    m = re.fullmatch(r"([a-g])([#b]?)(-?\d+)", value)
    if not m:
        raise ValueError(f"Nota SFZ inválida: {value}")
    accidental = {"#": 1, "b": -1, "": 0}[m.group(2)]
    return (int(m.group(3)) + 1) * 12 + NOTE_INDEX[m.group(1)] + accidental


@dataclass
class Region:
    sample: Path
    lokey: int
    hikey: int
    keycenter: int
    lovel: int = 0
    hivel: int = 127
    volume: float = 0.0
    tune: float = 0.0
    transpose: int = 0
    seq_length: int = 1
    seq_position: int = 1
    lorand: float = 0.0
    hirand: float = 1.0
    attack: float = 0.001
    release: float = 0.5
    # False en percusión: cada nota MIDI es un golpe distinto y nunca se transpone.
    pitch_track: bool = True
    # Golpe que suena entero (platillo, gong, bombo): la duración escrita no lo corta.
    one_shot: bool = False
    # Flam: un golpe de gracia suave y el golpe principal 25 ms después, con el mismo sample.
    flam: bool = False
    # Sin loop: si la nota dura más que el sample, se apaga natural (one-shots de sinte pulsados).
    no_loop: bool = False


def load_audio(path: Path, stereo: bool = False) -> np.ndarray:
    """Mono float32 a 44,1 kHz (o estéreo (n, 2) con stereo=True), sin el silencio digital inicial. Se guarda en caché
    (.npy) junto a las bibliotecas; el estéreo usa otra clave, así la caché mono de los renders aprobados no cambia."""
    stat = path.stat()
    key = hashlib.sha1(f"{path}|{stat.st_size}|{stat.st_mtime_ns}{'|st' if stereo else ''}".encode()).hexdigest()
    cached = CACHE_DIR / f"{key}.npy"
    if cached.exists():
        return np.load(cached)
    pcm = subprocess.run(
        ["ffmpeg", "-v", "quiet", "-i", str(path), "-f", "f32le", "-ac", "2" if stereo else "1", "-ar", str(SR), "pipe:1"],
        capture_output=True,
        check=True,
    ).stdout
    audio = np.frombuffer(pcm, dtype=np.float32)
    if stereo:
        audio = audio.reshape(-1, 2)
    loud = np.nonzero((np.abs(audio).max(axis=1) if stereo else np.abs(audio)) > 1e-4)[0]
    audio = audio[loud[0]:] if len(loud) else audio
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    np.save(cached, audio)
    return audio


_audio_memo: dict[tuple[Path, bool], np.ndarray] = {}


def audio_for(path: Path, stereo: bool = False) -> np.ndarray:
    if (path, stereo) not in _audio_memo:
        _audio_memo[(path, stereo)] = load_audio(path, stereo)
    return _audio_memo[(path, stereo)]


def preprocess_sfz(path: Path, include_filter=None) -> str:
    """Expande #include y #define en orden, como ARIA: los #include se resuelven desde la carpeta del archivo
    principal y una variable puede redefinirse más abajo ($POS 1, $POS 2...). include_filter(ruta) -> bool permite
    saltear includes (p. ej. micrófonos que no se usan)."""
    root = path.parent
    defines: dict[str, str] = {}
    out: list[str] = []
    var = re.compile(r"\$[A-Za-z0-9_]+")

    def subst(line: str) -> str:
        def repl(m):
            token = m.group(0)
            for end in range(len(token), 1, -1):  # el nombre definido más largo que sea prefijo ($MIC_$ART -> $MIC)
                if token[:end] in defines:
                    return defines[token[:end]] + token[end:]
            return token
        prev = None
        while prev != line:  # las variables pueden expandirse a otras variables
            prev, line = line, var.sub(repl, line)
        return line

    def walk(p: Path):
        lines = []
        for raw in p.read_text(encoding="utf-8", errors="ignore").replace("\r", "").split("\n"):
            # Varias directivas en una línea ("#define $A 0   #define $B 43"): cada una por separado.
            lines += [part.strip() for part in re.split(r"(?=#define\b|#include\b)", raw.split("//", 1)[0])]
        for line in lines:
            if not line:
                continue
            m = re.match(r'#define\s+(\$[A-Za-z0-9_]+)\s+(.*)$', line)
            if m:
                defines[m.group(1)] = subst(m.group(2).strip())
                continue
            m = re.match(r'#include\s+"(.+?)"', line)
            if m:
                inc = (root / subst(m.group(1)).replace("\\", "/")).resolve()
                if include_filter is None or include_filter(inc):
                    walk(inc)
                continue
            out.append(subst(line))

    walk(path)
    return "\n".join(out)


def parse_sfz(path: Path, include_filter=None) -> list[Region]:
    """Lector SFZ: <control>/<global>/<master>/<group>/<region>, #define/#include (ARIA), zonas por nota y velocidad,
    volumen (region + group + master + global), afinación, envolvente, round-robin (seq_*), azar (lo/hirand),
    loop_mode=one_shot, y filtros de CC (locc/hicc contra los set_cc por defecto) y de keyswitch (sw_last contra
    sw_default)."""
    source = path.read_text(encoding="utf-8", errors="ignore")
    if "#include" in source or "#define" in source:
        text = preprocess_sfz(path, include_filter)
    else:
        text = re.sub(r"//[^\n]*", "", source.replace("\r", ""))
    token = re.compile(r"<(\w+)>|(\w+)=(.*?)(?=\s+\w+=|\s*<|\s*$)", re.M)
    control: dict[str, str] = {}
    scopes: dict[str, dict[str, str]] = {"global": {}, "master": {}, "group": {}}
    current: str | None = None
    region: dict[str, str] | None = None
    raw_regions: list[dict[str, str]] = []

    def close_region():
        if region is not None:
            raw_regions.append({**scopes["global"], **scopes["master"], **scopes["group"], **region})

    for m in token.finditer(text):
        header, opcode, value = m.group(1), m.group(2), m.group(3)
        if header:
            close_region()
            region = None
            current = header
            if header == "region":
                region = {}
            elif header in scopes:
                scopes[header] = {}
                if header == "global":
                    scopes["master"], scopes["group"] = {}, {}
                elif header == "master":
                    scopes["group"] = {}
            continue
        target = region if current == "region" else control if current == "control" else scopes.get(current or "global")
        if target is not None:
            target[opcode] = value.strip()
    close_region()

    base = path.parent / control.get("default_path", "").replace("\\", "/")
    cc_default = {int(k[6:]): float(v) for k, v in control.items() if re.fullmatch(r"set_cc\d+", k)}
    # set_hdccN va de 0 a 1 (ARIA): se lleva a la escala 0-127 de locc/hicc.
    cc_default.update({int(k[8:]): float(v) * 127 for k, v in control.items() if re.fullmatch(r"set_hdcc\d+", k)})
    regions: list[Region] = []
    for r in raw_regions:
        if "sample" not in r or r.get("trigger", "attack") != "attack" or r["sample"].startswith("*"):
            continue  # "*silence" y otros generadores internos de SFZ no son samples
        skip = False
        for k, v in r.items():
            m = re.fullmatch(r"(lo|hi)cc(\d+)", k)
            if m:
                val = cc_default.get(int(m.group(2)), 0.0)
                if (m.group(1) == "lo" and val < float(v)) or (m.group(1) == "hi" and val > float(v)):
                    skip = True
        sw_default = r.get("sw_default", control.get("sw_default"))
        if "sw_last" in r and sw_default is not None and parse_key(r["sw_last"]) != parse_key(sw_default):
            skip = True
        if skip:
            continue
        if "key" in r:
            lokey = hikey = center = parse_key(r["key"])
        else:
            lokey, hikey = parse_key(r.get("lokey", "0")), parse_key(r.get("hikey", "127"))
            center = parse_key(r.get("pitch_keycenter", str(lokey)))
        if "pitch_keycenter" in r:
            center = parse_key(r["pitch_keycenter"])
        regions.append(
            Region(
                sample=(base / r["sample"].replace("\\", "/")).resolve(),
                lokey=lokey,
                hikey=hikey,
                keycenter=center,
                lovel=int(r.get("lovel", 0)),
                hivel=int(r.get("hivel", 127)),
                volume=sum(float(r.get(k, 0)) for k in ("volume", "group_volume", "master_volume", "global_volume")),
                tune=float(r.get("tune", 0)),
                transpose=int(r.get("transpose", 0)),
                seq_length=int(r.get("seq_length", 1)),
                seq_position=int(r.get("seq_position", 1)),
                lorand=float(r.get("lorand", 0)),
                hirand=float(r.get("hirand", 1)),
                attack=float(r.get("ampeg_attack", 0.001)),
                release=float(r.get("ampeg_release", 0.5)),
                one_shot=r.get("loop_mode") == "one_shot",
            )
        )
    return regions


def salamander_regions() -> list[Region]:
    """Salamander V3: un sample cada tercera menor (A, C, D#, F#) × 16 capas. Se mapea por nombre de archivo con los
    rangos de velocidad de su SFZ (Data/notes.txt), sin las extensiones ARIA."""
    samples = LIB_DIR / "salamander" / "Samples"
    layers = [(1, 26), (27, 34), (35, 36), (37, 43), (44, 46), (47, 50), (51, 56), (57, 64),
              (65, 72), (73, 80), (81, 88), (89, 96), (97, 104), (105, 112), (113, 120), (121, 127)]
    regions: list[Region] = []
    for f in samples.glob("*.flac"):
        m = re.fullmatch(r"([A-G]#?)(\d)v(\d+)", f.stem)
        if not m:
            continue
        center = parse_key(f"{m.group(1)}{m.group(2)}")
        lovel, hivel = layers[int(m.group(3)) - 1]
        regions.append(Region(sample=f, lokey=center - 1, hikey=center + 1, keycenter=center,
                              lovel=lovel, hivel=hivel, release=0.9))
    return regions


NOTE_TOKEN = re.compile(r"^([A-G]#?)(-?\d)$")


def _parse_name(stem: str) -> tuple[int | None, int, int]:
    """(nota MIDI, capa de velocidad, round-robin) desde un nombre tipo VCSL: 'EWHarp_Normal_A#3_v2_RR1'."""
    tokens = re.split(r"[_ ]", stem)
    note = next((parse_key(t) for t in tokens if NOTE_TOKEN.match(t)), None)
    layer = next((int(m.group(1)) for t in tokens if (m := re.fullmatch(r"(?i)(?:vl?|dl)(\d+)", t))), 1)
    rr = next((int(m.group(1)) for t in tokens if (m := re.fullmatch(r"(?i)rr(\d+)", t))), 1)
    return note, layer, rr


DYNAMIC_MARKS = ("ppp", "pp", "p", "mp", "mf", "f", "ff", "fff")


def _parse_dynamic(stem: str) -> tuple[int, int]:
    """(capa, round-robin) desde una dinámica escrita en el nombre: 'susCymb1_hit_mf1' -> (mf, rr1). Sin dinámica,
    cae en el formato v1/rr1."""
    for token in re.split(r"[_ ]", stem):
        m = re.fullmatch(r"(ppp|pp|p|mp|mf|f|ff|fff)(\d*)", token)
        if m:
            return DYNAMIC_MARKS.index(m.group(1)) + 1, int(m.group(2) or 1)
    _, layer, rr = _parse_name(stem)
    return layer, rr


def _velocity_ranges(layers: list[int]) -> dict[int, tuple[int, int]]:
    """Reparte 1-127 en partes iguales entre las capas presentes (de la más suave a la más fuerte)."""
    layers = sorted(set(layers))
    edges = np.linspace(0, 127, len(layers) + 1).round().astype(int)
    return {layer: (int(edges[i]) + (1 if i else 0), int(edges[i + 1])) for i, layer in enumerate(layers)}


def _with_round_robin(entries: list[tuple[int, int, int, Path]], build) -> list[Region]:
    groups: dict[tuple[int, int], list[tuple[int, Path]]] = {}
    for key, layer, rr, path in entries:
        groups.setdefault((key, layer), []).append((rr, path))
    regions = []
    for (key, layer), items in groups.items():
        items.sort()
        for position, (_, path) in enumerate(items, start=1):
            region = build(key, layer, path)
            region.seq_length, region.seq_position = len(items), position
            regions.append(region)
    return regions


def filename_regions(folders: list[Path], include: str = "", exclude: str | None = None, release: float = 0.8,
                     two_dynamics: bool = False) -> list[Region]:
    """Instrumento afinado desde WAV sueltos nombrados por nota (VCSL). Cada sample cubre hasta la mitad del camino
    a sus vecinos. Si varias carpetas tienen la misma nota, gana la primera (orden = preferencia)."""
    entries: list[tuple[int, int, int, Path]] = []
    taken: set[int] = set()
    for folder in folders:
        found = []
        for f in sorted(folder.rglob("*.wav")):
            if include not in f.name or (exclude and exclude in f.name):
                continue
            note, layer, rr = _parse_name(f.stem)
            if two_dynamics:
                # Dinámica escrita en el nombre (pp...fff), distinta en cada nota: dos capas, suave (hasta mp) y fuerte.
                dyn, _ = _parse_dynamic(f.stem)
                layer = 1 if dyn <= DYNAMIC_MARKS.index("mp") + 1 else 2
            if note is not None and note not in taken:
                found.append((note, layer, rr, f))
        entries += found
        taken |= {e[0] for e in found}
    if not entries:
        return []
    keys = sorted({e[0] for e in entries})
    lo = {k: (keys[i - 1] + k) // 2 + 1 if i else 0 for i, k in enumerate(keys)}
    hi = {k: (k + keys[i + 1]) // 2 if i + 1 < len(keys) else 127 for i, k in enumerate(keys)}
    vel = _velocity_ranges([e[1] for e in entries])
    regions = _with_round_robin(entries, lambda key, layer, path: Region(
        sample=path, lokey=lo[key], hikey=hi[key], keycenter=key, lovel=vel[layer][0], hivel=vel[layer][1], release=release))
    _equalize_layers(regions)
    return regions


def _level_db(path: Path) -> float:
    """Nivel RMS (dB) del primer segundo del sample: lo que se oye del ataque y el cuerpo."""
    audio = audio_for(path)[:SR]
    return 20 * np.log10(max(1e-9, float(np.sqrt(np.mean(audio.astype(np.float64) ** 2)))))


def _equalize_layers(regions: list[Region]) -> None:
    """VCSL graba pocas capas muy separadas (pp / ff): una velocidad media cae en una capa mucho más baja. Se sube
    cada capa al nivel de la más fuerte de su nota; el timbre sigue cambiando por capa y el volumen lo da la curva de
    velocidad, sin saltos. Sólo para instrumentos afinados (la percusión conserva su dinámica natural)."""
    by_key: dict[int, list[Region]] = {}
    for r in regions:
        by_key.setdefault(r.keycenter, []).append(r)
    for group in by_key.values():
        if len({(r.lovel, r.hivel) for r in group}) < 2:
            continue
        levels = {id(r): _level_db(r.sample) for r in group}
        loudest = max(levels.values())
        for r in group:
            r.volume += loudest - levels[id(r)]


def _matches(name: str, pattern: str | tuple[str, ...]) -> bool:
    """Patrón de kit: texto que tiene que estar en el nombre, o tupla de textos; "!x" excluye (micrófonos, variantes)."""
    parts = (pattern,) if isinstance(pattern, str) else pattern
    return all((p[1:] not in name) if p.startswith("!") else (p in name) for p in parts)


def kit_regions(folder: Path, kit: dict[int, str | tuple[str, ...]], release: float = 1.5, dynamics: bool = False,
                one_shot: set[int] = frozenset(), flams: dict[int, int] | None = None) -> list[Region]:
    """Percusión: cada nota MIDI dispara los archivos que coinciden con su patrón (sin transponer). `dynamics` lee la
    capa de una dinámica en el nombre (pp...fff) en vez de v1/v2; `one_shot` son las teclas que suenan enteras;
    `flams` arma teclas de flam a partir de otra tecla del kit ({flam: golpe})."""
    entries: list[tuple[int, int, int, Path]] = []
    files = sorted(folder.rglob("*.wav"))
    for key, pattern in kit.items():
        for f in files:
            if _matches(f.name, pattern):
                layer, rr = _parse_dynamic(f.stem) if dynamics else _parse_name(f.stem)[1:]
                entries.append((key, layer, rr, f))
    regions = []
    for key in kit:
        mine = [e for e in entries if e[0] == key]
        vel = _velocity_ranges([e[1] for e in mine]) if mine else {}
        regions += _with_round_robin(mine, lambda k, layer, path, vel=vel: Region(
            sample=path, lokey=k, hikey=k, keycenter=k, lovel=vel[layer][0], hivel=vel[layer][1],
            release=release, pitch_track=False, one_shot=k in one_shot))
    for flam_key, source in (flams or {}).items():
        regions += [replace(r, lokey=flam_key, hikey=flam_key, keycenter=flam_key, flam=True)
                    for r in regions if r.lokey == source]
    return regions


def sf2_regions(path: Path) -> list[Region]:
    """Lector SF2 mínimo (un instrumento por archivo, como el laúd): extrae cada sample a WAV una sola vez y arma
    las zonas con su rango de notas, de velocidad y su nota raíz."""
    import struct
    import wave

    data = path.read_bytes()
    if data[:4] != b"RIFF" or data[8:12] != b"sfbk":
        raise FileNotFoundError(f"{path} no es un SoundFont (¿se descargó una página web?)")
    chunks: dict[str, bytes] = {}
    i = 12
    while i < len(data):
        cid, size = data[i:i + 4], struct.unpack("<I", data[i + 4:i + 8])[0]
        body = data[i + 8:i + 8 + size]
        if cid == b"LIST":
            j = 4
            while j < len(body):
                sid, ssize = body[j:j + 4].decode("latin1"), struct.unpack("<I", body[j + 4:j + 8])[0]
                chunks[sid] = body[j + 8:j + 8 + ssize]
                j += 8 + ssize + (ssize & 1)
        i += 8 + size + (size & 1)
    smpl = np.frombuffer(chunks["smpl"], dtype="<i2")
    headers = [struct.unpack("<20sIIIIIBbHH", chunks["shdr"][k:k + 46]) for k in range(0, len(chunks["shdr"]) - 46, 46)]
    bags = [struct.unpack("<HH", chunks["ibag"][k:k + 4]) for k in range(0, len(chunks["ibag"]), 4)]
    gens = [struct.unpack("<HH", chunks["igen"][k:k + 4]) for k in range(0, len(chunks["igen"]), 4)]
    out_dir = path.parent / "extracted"
    out_dir.mkdir(exist_ok=True)
    regions: list[Region] = []
    for z in range(len(bags) - 1):
        params = {op: amount for op, amount in gens[bags[z][0]:bags[z + 1][0]]}
        if 53 not in params:  # zona global
            continue
        name, start, end, _, _, rate, root, correction, _, kind = headers[params[53]]
        if kind & 2:  # canal derecho de un par estéreo: se usa el izquierdo
            continue
        wav = out_dir / f"{params[53]:03d}_{name.split(bytes([0]))[0].decode('latin1', 'ignore').strip() or 'sample'}.wav"
        if not wav.exists():
            with wave.open(str(wav), "wb") as w:
                w.setnchannels(1)
                w.setsampwidth(2)
                w.setframerate(rate)
                w.writeframes(smpl[start:end].tobytes())
        lokey, hikey = (params[43] & 0xFF, params[43] >> 8) if 43 in params else (0, 127)
        lovel, hivel = (params[44] & 0xFF, params[44] >> 8) if 44 in params else (0, 127)
        center = params.get(58, root)
        tune = correction + (params.get(52, 0) - 65536 if params.get(52, 0) > 32767 else params.get(52, 0))
        regions.append(Region(sample=wav.resolve(), lokey=lokey, hikey=hikey, keycenter=center, lovel=lovel, hivel=hivel,
                              tune=float(tune), release=1.2))
    return regions


VCSL = LIB_DIR / "vcsl"
AERO, CHORD, MEMBRANE, IDIO = (VCSL / "Aerophones" / "Edge-blown Aerophones", VCSL / "Chordophones",
                               VCSL / "Membranophones" / "Struck Membranophones", VCSL / "Idiophones" / "Struck Idiophones")
RECORDERS = [AERO / f"Baroque {size} Recorder" for size in ("Alto", "Soprano", "Tenor", "Bass")]

# Instrumentos VCSL: nombre -> función que arma sus zonas.
VCSL_BUILDERS = {
    "recorder": lambda: filename_regions(RECORDERS, include="_Sus_", release=0.4),
    "renaissance_organ": lambda: filename_regions([AERO / "Renaissance Organ" / "8'"], release=0.5),
    "folk_harp": lambda: filename_regions([CHORD / "Composite Chordophones" / "Folk Harp"], release=3.0),
    "psaltery": lambda: filename_regions([CHORD / "Zithers" / "Psaltery, Bowed and Plucked" / "Pluck"], release=2.5),
    "psaltery_bowed": lambda: filename_regions([CHORD / "Zithers" / "Psaltery, Bowed and Plucked" / "LongBow"], release=0.8),
    "harpsichord": lambda: filename_regions([CHORD / "Zithers" / "Harpsichord, Italian" / "Sustains"], release=0.6),
    "strumstick": lambda: filename_regions([CHORD / "Composite Chordophones" / "Strumstick"], release=1.5),
    # Percusión: una nota por golpe (ver docs/API.md).
    "frame_drum": lambda: kit_regions(MEMBRANE / "Frame Drum", {
        36: "HDrumL_Hit_", 37: "HDrumL_HitMuted", 38: "HDrumL_Hand", 40: "HDrumS_Hit_", 41: "HDrumS_HitMuted", 42: "HDrumS_Hand"}),
    "darbuka": lambda: kit_regions(MEMBRANE / "Darbuka", {36 + i: f"Darbuka_{i + 1}_" for i in range(5)}),
    "tabor": lambda: kit_regions(MEMBRANE / "Snare Drum, Rope Tension", {
        36: "_low_sn_", 37: "_low_ns_", 38: "_hi_sn_", 39: "_low_tsn_", 40: "_stick_", 41: "_sidestick_"}),
    "tambourine": lambda: kit_regions(IDIO / "Tambourine 1", {36: "Tamb1_Hit", 37: "Tamb1_Roll", 38: "Tamb1_Shake"}),
    "finger_cymbals": lambda: kit_regions(IDIO / "Finger Cymbals", {36: "Fing_Cymb"}, release=4.0),
    "vibraphone": lambda: filename_regions([IDIO / "Vibraphone"], include="_soft_", release=2.5),
    "shaker": lambda: kit_regions(IDIO, {
        36: "LShaker_Hit", 37: "LShaker_Shake1D", 38: "LShaker_Shake1U",
        40: "Mid_ShakerDouble_Down", 41: "Mid_ShakerDouble_Up", 42: "Mid_ShakerHighFaster_Down",
        43: "Mid_ShakerHighFaster_Up", 44: "Mid_ShakerLowFaster_Down", 45: "Mid_ShakerLowFaster_Up",
        46: "Mid_Shaker_Slap", 47: "Mid_Shaker_Roll_Fast"}, release=0.8),
    # Colores temáticos: campanas, maderas huecas, órgano de tubos.
    "tubular_bells": lambda: _one_shot(filename_regions([IDIO / "Tubular Bells 1"], release=4.0, two_dynamics=True)),
    "hand_chimes": lambda: _one_shot(filename_regions([IDIO / "Hand Chimes"], include="sus_", release=4.0)),
    "bell_tree": lambda: _one_shot(filename_regions([IDIO / "Bell Tree" / "Individual"], release=3.0)),
    "kalimba": lambda: _one_shot(filename_regions([VCSL / "Idiophones" / "Plucked Idiophones" / "Kalimba, Kenya"],
                                                  release=2.0)),
    "bowed_vibraphone": lambda: filename_regions([IDIO / "Vibraphone" / "Bowed"], release=2.0),
    "pipe_organ": lambda: filename_regions([AERO / "Pipe Organ" / "Loud"], release=1.2),
    "pipe_organ_soft": lambda: filename_regions([AERO / "Pipe Organ" / "Quiet"], release=1.2),
    "wood_perc": lambda: kit_regions(IDIO, {
        36: "LogDrumLo", 37: "LogDrumHi", 38: "wood_click"}, release=0.6, dynamics=True, one_shot={36, 37, 38}),
    "bells_kit": lambda: kit_regions(IDIO, {
        36: "Anvil_Hit1", 37: "Anvil_Hit2", 38: "Anvil_Hit3", 40: "Sleighbells_Hit", 41: ("sleighbell", "shake"),
        42: "sleighbell2_hit", 44: "HB_1", 45: "HB_2", 46: "HB_3", 48: "BellTree_Stroke"},
        release=2.0, one_shot={36, 37, 38, 40, 41, 42, 44, 45, 46, 48}),
    # Percusión orquestal. Los redobles duran lo que la nota (si es más larga que el sample, se hace loop); los
    # golpes marcados one_shot suenan enteros aunque la nota sea corta.
    "snare_drum": lambda: kit_regions(MEMBRANE / "Snare Drum, Modern 1", {
        37: "Snare2_HitNS_", 38: "Snare2_HitSN_", 39: "Snare2_rollSN_", 40: "Snare2_rollNS_",
        41: "Snare2_stick_", 42: "Snare2_taps_"}, release=0.6, one_shot={37, 38, 41, 42}, flams={43: 38}),
    "military_drum": lambda: kit_regions(MEMBRANE, {
        36: "RopeSnare_low_sn_", 37: "RopeSnare_low_ns_", 38: "RopeSnare_hi_sn_", 39: "Snare2_rollSN_",
        40: "RopeSnare_stick_", 41: "RopeSnare_sidestick_", 42: "RopeSnare_low_tsn_"},
        release=0.6, one_shot={36, 37, 38, 40, 41, 42}, flams={43: 38}),
    "orchestral_cymbals": lambda: kit_regions(IDIO, {
        48: "cymbal_crash1_short", 49: ("cymbal_crash1_", "!short"),
        51: ("susCymb1_hit_", "!bell", "!stick"), 52: "susCymb1_hit_stick", 53: "susCymb1_hit_bell",
        55: ("susCymb1_roll_", "_nloop"),
        56: "susCymb1_cresc_1.5s", 57: "susCymb1_cresc_2s", 58: "susCymb1_cresc_4s", 59: "susCymb1_cresc_7.5s",
        60: "susCymb1_bow_", 61: "susCymb1_scrape"},
        release=2.5, dynamics=True, one_shot={48, 49, 51, 52, 53, 56, 57, 58, 59, 60, 61}),
    "bass_drum": lambda: kit_regions(MEMBRANE / "Bass Drum 2", {
        36: "bassdrum_hit_", 37: ("bassdrum_roll_", "!fast", "!_rel"), 38: ("bassdrum_roll_fast_", "!_rel"),
        39: "bassdrum_cresc_short", 40: "bassdrum_cresc_med"},
        release=2.0, dynamics=True, one_shot={36, 39, 40}),
    "tam_tam": lambda: kit_regions(IDIO / "Gong 1", {
        36: ("gong_", "!_2_", "!scrape"), 37: "gong_2_", 38: "gong_scrape"},
        release=3.0, dynamics=True, one_shot={36, 37, 38}),
}

NOTE_LETTERS = {"c": 0, "db": 1, "d": 2, "eb": 3, "e": 4, "f": 5, "gb": 6, "g": 7, "ab": 8, "a": 9, "bb": 10, "b": 11}


def ebass_regions() -> list[Region]:
    """Karoryfer Black And Blue Basses, bajo azul con púa (babyblue_<nota><oct>_<f|ff>_rr<n>.wav). El nombre está una
    octava arriba de lo que suena (b1 = Si grave de 5 cuerdas = MIDI 23): se mapea a la altura real."""
    folder = LIB_DIR / "bass" / "Samples" / "babyblue" / "reg"
    entries = []
    for f in sorted(folder.glob("babyblue_*.wav")):
        m = re.fullmatch(r"babyblue_([a-g]b?)(\d)_(f|ff)_rr(\d+)", f.stem)
        if m:
            note = 12 * (int(m.group(2)) + 1) + NOTE_LETTERS[m.group(1)] - 12
            entries.append((note, 1 if m.group(3) == "f" else 2, int(m.group(4)), f))
    notes = sorted({e[0] for e in entries})
    vel = {1: (0, 79), 2: (80, 127)}
    return _with_round_robin(entries, lambda k, layer, path: Region(
        sample=path, lokey=k if k != notes[0] else 0, hikey=k if k != notes[-1] else 127, keycenter=k,
        lovel=vel[layer][0], hivel=vel[layer][1], release=0.12))


def squidpipes_regions() -> list[Region]:
    """Karoryfer Squidpipes (CC0): caña doble real (de oboe) grabada nota por nota, sin bordón. Los nombres de archivo
    están una octava arriba de lo que suena (medido: g4_long_clean = Sol3 = MIDI 55): se mapea a la altura real.
    Es lo más cercano a una zurna/mizmar con licencia libre."""
    folder = LIB_DIR / "squidpipes" / "karoryfer.squidpipes-master" / "Samples" / "long_clean"
    entries = []
    for f in sorted(folder.glob("*_long_clean.wav")):
        m = re.fullmatch(r"([a-g]b?)(\d)_long_clean", f.stem)
        if m:
            entries.append((12 * (int(m.group(2)) + 1) + NOTE_LETTERS[m.group(1)] - 12, 1, 1, f))
    notes = sorted(e[0] for e in entries)
    return _with_round_robin(entries, lambda k, layer, path: Region(
        sample=path, lokey=k if k != notes[0] else 0, hikey=k if k != notes[-1] else 127, keycenter=k, release=0.15))


NAKED = LIB_DIR / "nakeddrums" / "Wilkinson Audio" / "Naked Drums"


def naked_drums_regions() -> list[Region]:
    """Wilkinson Audio Naked Drums, programa General MIDI. Sólo micrófonos cercanos (DI) y aéreos (OH): las salas
    lejanas embarran el metal y duplican la caché. Mapa GM: 36 bombo, 37 aro, 38/40 caja, 41-48 toms, 42/44/46
    hi-hat cerrado/pedal/abierto, 49/57 crash, 51/53 ride, 52 china, 55 splash."""
    def keep(inc: Path) -> bool:
        return not (inc.parent.name == "stereo" and not (inc.name.startswith("DI_") or inc.name.startswith("OH_")))
    return parse_sfz(NAKED / "User" / "Naked Drums GM.sfz", include_filter=keep)


def _one_shot(regions: list[Region]) -> list[Region]:
    """Campanas y pulsados que tienen que sonar enteros aunque la nota escrita sea corta."""
    for r in regions:
        r.one_shot = True
    return regions


FL = LIB_DIR / "functionloops"
FL_SYNTH_PITCH = {
    "Bass/FL_SKY_Bass_Analog.wav": 24,
    "Bass/FL_SKY_Bass_Chrome.wav": 36,
    "Bass/FL_SKY_Bass_Cyber.wav": 24,
    "Bass/FL_SKY_Bass_Dark.wav": 24,
    "Bass/FL_SKY_Bass_Deep.wav": 36,
    "Bass/FL_SKY_Bass_Dirty.wav": 24,
    "Bass/FL_SKY_Bass_Drive.wav": 24,
    "Bass/FL_SKY_Bass_Electric.wav": 36,
    "Bass/FL_SKY_Bass_Heavy.wav": 36,
    "Bass/FL_SKY_Bass_Magnetic.wav": 24,
    "Bass/FL_SKY_Bass_Midnight.wav": 24,
    "Bass/FL_SKY_Bass_Neon.wav": 36,
    "Bass/FL_SKY_Bass_Noir.wav": 24,
    "Bass/FL_SKY_Bass_Obsidian.wav": 24,
    "Bass/FL_SKY_Bass_Pulse.wav": 24,
    "Bass/FL_SKY_Bass_Retro.wav": 24,
    "Bass/FL_SKY_Bass_Shadow.wav": 24,
    "Bass/FL_SKY_Bass_Static.wav": 24,
    "Bass/FL_SKY_Bass_Subzero.wav": 37,
    "Bass/FL_SKY_Bass_Thick.wav": 29,
    "Leads/FL_SKY_Lead_Bright.wav": 72,
    "Leads/FL_SKY_Lead_Chrome.wav": 60,
    "Leads/FL_SKY_Lead_Crystal.wav": 60,
    "Leads/FL_SKY_Lead_Digital.wav": 72,
    "Leads/FL_SKY_Lead_Electric.wav": 67,
    "Leads/FL_SKY_Lead_Flash.wav": 77,
    "Leads/FL_SKY_Lead_Glowing.wav": 60,
    "Leads/FL_SKY_Lead_Laser.wav": 48,
    "Leads/FL_SKY_Lead_Neon.wav": 60,
    "Leads/FL_SKY_Lead_Plasma.wav": 60,
    "Leads/FL_SKY_Lead_Radiant.wav": 60,
    "Leads/FL_SKY_Lead_Sharp.wav": 48,
    "Leads/FL_SKY_Lead_Sonic.wav": 67,
    "Leads/FL_SKY_Lead_Turbo.wav": 48,
    "Leads/FL_SKY_Lead_Vivid.wav": 72,
    "Synths/FL_SKY_Synth_Analog.wav": 84,
    "Synths/FL_SKY_Synth_Chrome.wav": 60,
    "Synths/FL_SKY_Synth_Crystal.wav": 72,
    "Synths/FL_SKY_Synth_Dark.wav": 72,
    "Synths/FL_SKY_Synth_Dreamy.wav": 56,
    "Synths/FL_SKY_Synth_Electric.wav": 71,
    "Synths/FL_SKY_Synth_Midnight.wav": 84,
    "Synths/FL_SKY_Synth_Neon.wav": 72,
    "Synths/FL_SKY_Synth_Retro.wav": 52,
    "Synths/FL_SKY_Synth_Soft.wav": 84,
}


def fl_synth_regions(rel: str) -> list[Region]:
    """One-shot afinado de Function Loops: un sample cubre todo el teclado desde su altura medida; sin loop."""
    return [Region(sample=FL / "sky_instruments" / rel, lokey=0, hikey=127, keycenter=FL_SYNTH_PITCH[rel],
                   release=0.25, no_loop=True)]


FL_KITS = {
    # Kit Retrowave (pack "SKY"): golpes elegidos por carácter; toms ordenados por altura medida; crash de Neon Highway.
    "retrowave_drums": {35: "Kick_Analog", 36: "Kick_Punchy", 37: "Snare_Arcade", 38: "Snare_Gated", 39: "Snare_Sharp",
                        40: "Snare_Retro", 41: "Tom_Electric", 43: "Tom_Chrome", 45: "Tom_Tribal", 47: "Tom_Arcade",
                        48: "Tom_Vintage", 50: "Tom_Midnight", 42: "Hat_Closed_Retro", 44: "Hat_Closed_Tight",
                        46: "Hat_Open_Retro", 49: "NHW_CRASH 01", 57: "NHW_CRASH 02"},
    # Kit Neon Highway (synthwave): sus hi-hats son todos cerrados, el abierto viene del pack Retrowave.
    "synthwave_drums": {35: "NHW_KICK 02", 36: "NHW_KICK 01", 38: "NHW_SNARE 01", 40: "NHW_SNARE 02", 39: "NHW_CLAP 01",
                        42: "NHW_HAT 01", 44: "NHW_HAT 02", 46: "Hat_Open_Bright", 41: "NHW_TOM 04", 43: "NHW_TOM 03",
                        45: "NHW_TOM 02", 47: "NHW_TOM 01", 49: "NHW_CRASH 01", 57: "NHW_CRASH 03", 54: "NHW_TAMBOURINE",
                        70: "NHW_SHAKER", 67: "NHW_AGOGO"},
    # Kit Darkwave / postpunk.
    "darkwave_drums": {35: "Kick_Deep", 36: "Kick_Full", 37: "Snare_Slapped", 38: "Snare_Dry", 40: "Snare_Reverb",
                       39: "Clap_Slappy", 42: "Hat_Classic", 44: "Hat_Tip", 46: "Hat_Long", 49: "NHW_CRASH 04",
                       51: "Hat_Cymbal"},
}


SWIRLY = LIB_DIR / "swirly" / "Samples"
# Karoryfer Swirly Drums (CC0), batería tocada con escobillas. Mapa tipo General MIDI + extras de escobilla.
BRUSH_KIT = {
    36: ("marching_kick_", "_reso"),   # bombo
    37: ("flutter", "!skin"),          # flutter de escobilla
    38: ("snare_hit_", "_top"),        # golpe de escobilla en el parche
    39: ("stir", "!skin"),             # barrido (sweep)
    40: ("snare_edge_", "_top"),       # toque en el borde
    42: "hh_closed",
    44: "hh_foot",
    46: "hh_open",
    51: "ride",
}


class Instrument:
    """Un instrumento muestreado: elige la zona por nota, velocidad, round-robin y azar, y la renderiza."""

    def __init__(self, name: str, regions: list[Region], velocity_curve: float, library: str,
                 layer_bias: int = 0, shelf_db: float = 0.0):
        if not regions:
            raise FileNotFoundError(f"{name}: sin zonas (¿faltan los samples en sound-libraries/?)")
        self.name = name
        self.library = library
        # Tono: layer_bias elige capas grabadas más fuertes (más brillo) sin cambiar el volumen, que sigue la
        # velocidad real; shelf_db realza o atenúa los agudos desde 2,5 kHz.
        self.layer_bias = layer_bias
        self.shelf = high_shelf(shelf_db) if shelf_db else None
        self.regions = regions
        self.velocity_curve = velocity_curve
        self.layered = False  # True: todas las zonas que coinciden suenan juntas (p. ej. varios micrófonos)
        self.stereo = False  # True: samples en estéreo (render devuelve (n, 2)); p. ej. los aéreos de una batería

    def pick_layers(self, pitch: int, velocity: int, rr: dict, rand: np.random.Generator) -> list[Region]:
        """Como pick, pero devuelve todas las zonas que coinciden (una por micrófono). Sin zona para esa nota: nada
        (en una batería, una tecla sin mapear no tiene que sonar como otro tambor)."""
        cand = [r for r in self.regions if r.lokey <= pitch <= r.hikey and r.lovel <= velocity <= r.hivel]
        if not cand:
            return []
        value = rand.random()
        cand = [r for r in cand if r.lorand <= value < r.hirand] or cand
        length = max(r.seq_length for r in cand)
        if length > 1:
            position = rr.get(pitch, 0) % length + 1
            rr[pitch] = rr.get(pitch, 0) + 1
            cand = [r for r in cand if r.seq_position == position] or cand
        return cand

    def pick(self, pitch: int, velocity: int, rr: dict, rand: np.random.Generator) -> Region:
        velocity = min(127, velocity + self.layer_bias)
        candidates = [r for r in self.regions if r.lokey <= pitch <= r.hikey and r.lovel <= velocity <= r.hivel]
        if not candidates:  # fuera del rango mapeado: la zona más cercana en altura (y en velocidad)
            candidates = sorted(self.regions, key=lambda r: (abs(r.keycenter - pitch), abs((r.lovel + r.hivel) / 2 - velocity)))[:1]
        value = rand.random()
        chance = [r for r in candidates if r.lorand <= value < r.hirand] or candidates
        length = max(r.seq_length for r in chance)
        if length > 1:
            position = rr.get(pitch, 0) % length + 1
            rr[pitch] = rr.get(pitch, 0) + 1
            chance = [r for r in chance if r.seq_position == position] or chance
        return chance[0]

    def render(self, region: Region, pitch: int, velocity: int, hold: float, min_attack: float = 0.0) -> np.ndarray:
        if region.flam:
            # Gracia suave (~-7 dB) y el golpe principal 25 ms después: el flam ocupa el pulso escrito.
            single = replace(region, flam=False)
            grace = self.render(single, pitch, max(1, int(velocity * 0.45)), hold, min_attack)
            main = self.render(single, pitch, velocity, hold, min_attack)
            offset = int(0.025 * SR)
            out = np.zeros(max(len(grace), offset + len(main)))
            out[:len(grace)] += grace
            out[offset:offset + len(main)] += main
            return out
        sample = audio_for(region.sample, self.stereo)
        if region.one_shot:
            hold = max(hold, len(sample) / SR)
        shift = pitch - region.keycenter if region.pitch_track else 0
        ratio = 2 ** ((shift + region.transpose + region.tune / 100) / 12)
        if abs(ratio - 1) > 1e-6:
            positions = np.arange(0, len(sample) - 1, ratio)
            idx = np.arange(len(sample))
            if sample.ndim == 2:
                sample = np.stack([np.interp(positions, idx, sample[:, c]) for c in range(2)], 1).astype(np.float32)
            else:
                sample = np.interp(positions, idx, sample).astype(np.float32)
        release = min(region.release, 4.0)
        needed = int((hold + release) * SR)
        if len(sample) < needed and not region.no_loop:
            sample = loop_sustain(sample, needed)
        n_hold = min(len(sample), int(hold * SR))
        n_total = min(len(sample), n_hold + int(release * SR))
        seg = sample[:n_total].astype(np.float64)
        env = np.ones(n_total)
        n_att = min(n_total, max(1, int(max(region.attack, min_attack) * SR)))
        env[:n_att] = np.linspace(0, 1, n_att) ** 1.5
        if n_total > n_hold:
            n_rel = n_total - n_hold
            env[n_hold:] *= np.exp(-5 * np.arange(n_rel) / n_rel)
        gain = 10 ** (region.volume / 20) * (velocity / 127) ** self.velocity_curve
        seg = seg * (env[:, None] if seg.ndim == 2 else env) * gain
        return lfilter(*self.shelf, seg, axis=0) if self.shelf else seg


def high_shelf(gain_db: float, freq: float = 2500.0, slope: float = 0.7) -> tuple[np.ndarray, np.ndarray]:
    """Estante de agudos RBJ (biquad): +dB da presencia, -dB suaviza como un fieltro."""
    a = 10 ** (gain_db / 40)
    w0 = 2 * np.pi * freq / SR
    cos, alpha = np.cos(w0), np.sin(w0) / 2 * np.sqrt((a + 1 / a) * (1 / slope - 1) + 2)
    root = 2 * np.sqrt(a) * alpha
    b = np.array([a * ((a + 1) + (a - 1) * cos + root), -2 * a * ((a - 1) + (a + 1) * cos), a * ((a + 1) + (a - 1) * cos - root)])
    den = np.array([(a + 1) - (a - 1) * cos + root, 2 * ((a - 1) - (a + 1) * cos), (a + 1) - (a - 1) * cos - root])
    return b / den[0], den / den[0]


def loop_sustain(sample: np.ndarray, needed: int) -> np.ndarray:
    """Sólo si una nota dura más que el sample real: repite su tramo estable (40-85 %) con fundidos lineales."""
    start, end = int(len(sample) * 0.4), int(len(sample) * 0.85)
    fade = min(int(0.3 * SR), (end - start) // 3)
    segment = sample[start:end]
    out = sample[:end].copy()
    ramp = np.linspace(0, 1, fade, dtype=np.float32)
    if sample.ndim == 2:
        ramp = ramp[:, None]
    while len(out) < needed:
        out = np.concatenate([out[:-fade], out[-fade:] * (1 - ramp) + segment[:fade] * ramp, segment[fade:]])
    return out


# instrumentId de la app -> (biblioteca, variante sostenida, variante pizzicato, curva de velocidad).
# El orden importa: se usa el primer "needle" contenido en el instrumentId (harpsichord antes que harp, etc.).
MAPPING = [
    ("harpsichord", ("vcsl", "harpsichord", None, 1.0)),
    ("folk_harp", ("vcsl", "folk_harp", None, 1.0)),
    ("bowed_psaltery", ("vcsl", "psaltery_bowed", None, 1.0)),
    ("psaltery", ("vcsl", "psaltery", None, 1.0)),
    ("recorder", ("vcsl", "recorder", None, 1.0)),
    ("pipe_organ_soft", ("vcsl", "pipe_organ_soft", None, 1.0)),
    ("pipe_organ", ("vcsl", "pipe_organ", None, 1.0)),
    ("organ", ("vcsl", "renaissance_organ", None, 1.0)),
    ("dulcimer", ("vcsl", "strumstick", None, 1.0)),
    ("strumstick", ("vcsl", "strumstick", None, 1.0)),
    ("frame_drum", ("vcsl", "frame_drum", None, 1.0)),
    ("darbuka", ("vcsl", "darbuka", None, 1.0)),
    ("tabor", ("vcsl", "tabor", None, 1.0)),
    ("tambourine", ("vcsl", "tambourine", None, 1.0)),
    ("finger_cymbals", ("vcsl", "finger_cymbals", None, 1.0)),
    ("bowed_vibraphone", ("vcsl", "bowed_vibraphone", None, 1.0)),
    ("vibraphone", ("vcsl", "vibraphone", None, 1.0)),
    ("tubular_bells", ("vcsl", "tubular_bells", None, 1.0)),
    ("funeral_bell", ("vcsl", "tubular_bells", None, 1.0)),
    ("church_bell", ("vcsl", "tubular_bells", None, 1.0)),
    ("hand_chimes", ("vcsl", "hand_chimes", None, 1.0)),
    ("bell_tree", ("vcsl", "bell_tree", None, 1.0)),
    ("kalimba", ("vcsl", "kalimba", None, 1.0)),
    ("mbira", ("vcsl", "kalimba", None, 1.0)),
    ("wood_perc", ("vcsl", "wood_perc", None, 1.0)),
    ("bells_kit", ("vcsl", "bells_kit", None, 1.0)),
    ("shaker", ("vcsl", "shaker", None, 1.0)),
    ("brush", ("swirly", None, None, 1.0)),
    ("drum_kit", ("swirly", None, None, 1.0)),
    ("glockenspiel", ("vsco", "Glockenspiel.sfz", None, 1.0)),
    ("retrowave_drums", ("fl_kit", "retrowave_drums", None, 1.0)),
    ("synthwave_drums", ("fl_kit", "synthwave_drums", None, 1.0)),
    ("darkwave_drums", ("fl_kit", "darkwave_drums", None, 1.0)),
    ("retro_bass_analog", ("fl_synth", "Bass/FL_SKY_Bass_Analog.wav", None, 1.0)),
    ("retro_bass_chrome", ("fl_synth", "Bass/FL_SKY_Bass_Chrome.wav", None, 1.0)),
    ("retro_bass_cyber", ("fl_synth", "Bass/FL_SKY_Bass_Cyber.wav", None, 1.0)),
    ("retro_bass_dark", ("fl_synth", "Bass/FL_SKY_Bass_Dark.wav", None, 1.0)),
    ("retro_bass_deep", ("fl_synth", "Bass/FL_SKY_Bass_Deep.wav", None, 1.0)),
    ("retro_bass_dirty", ("fl_synth", "Bass/FL_SKY_Bass_Dirty.wav", None, 1.0)),
    ("retro_bass_drive", ("fl_synth", "Bass/FL_SKY_Bass_Drive.wav", None, 1.0)),
    ("retro_bass_electric", ("fl_synth", "Bass/FL_SKY_Bass_Electric.wav", None, 1.0)),
    ("retro_bass_heavy", ("fl_synth", "Bass/FL_SKY_Bass_Heavy.wav", None, 1.0)),
    ("retro_bass_magnetic", ("fl_synth", "Bass/FL_SKY_Bass_Magnetic.wav", None, 1.0)),
    ("retro_bass_midnight", ("fl_synth", "Bass/FL_SKY_Bass_Midnight.wav", None, 1.0)),
    ("retro_bass_neon", ("fl_synth", "Bass/FL_SKY_Bass_Neon.wav", None, 1.0)),
    ("retro_bass_noir", ("fl_synth", "Bass/FL_SKY_Bass_Noir.wav", None, 1.0)),
    ("retro_bass_obsidian", ("fl_synth", "Bass/FL_SKY_Bass_Obsidian.wav", None, 1.0)),
    ("retro_bass_pulse", ("fl_synth", "Bass/FL_SKY_Bass_Pulse.wav", None, 1.0)),
    ("retro_bass_retro", ("fl_synth", "Bass/FL_SKY_Bass_Retro.wav", None, 1.0)),
    ("retro_bass_shadow", ("fl_synth", "Bass/FL_SKY_Bass_Shadow.wav", None, 1.0)),
    ("retro_bass_static", ("fl_synth", "Bass/FL_SKY_Bass_Static.wav", None, 1.0)),
    ("retro_bass_subzero", ("fl_synth", "Bass/FL_SKY_Bass_Subzero.wav", None, 1.0)),
    ("retro_bass_thick", ("fl_synth", "Bass/FL_SKY_Bass_Thick.wav", None, 1.0)),
    ("retro_bass", ("fl_synth", "Bass/FL_SKY_Bass_Analog.wav", None, 1.0)),
    ("retro_lead_bright", ("fl_synth", "Leads/FL_SKY_Lead_Bright.wav", None, 1.0)),
    ("retro_lead_chrome", ("fl_synth", "Leads/FL_SKY_Lead_Chrome.wav", None, 1.0)),
    ("retro_lead_crystal", ("fl_synth", "Leads/FL_SKY_Lead_Crystal.wav", None, 1.0)),
    ("retro_lead_digital", ("fl_synth", "Leads/FL_SKY_Lead_Digital.wav", None, 1.0)),
    ("retro_lead_electric", ("fl_synth", "Leads/FL_SKY_Lead_Electric.wav", None, 1.0)),
    ("retro_lead_flash", ("fl_synth", "Leads/FL_SKY_Lead_Flash.wav", None, 1.0)),
    ("retro_lead_glowing", ("fl_synth", "Leads/FL_SKY_Lead_Glowing.wav", None, 1.0)),
    ("retro_lead_laser", ("fl_synth", "Leads/FL_SKY_Lead_Laser.wav", None, 1.0)),
    ("retro_lead_neon", ("fl_synth", "Leads/FL_SKY_Lead_Neon.wav", None, 1.0)),
    ("retro_lead_plasma", ("fl_synth", "Leads/FL_SKY_Lead_Plasma.wav", None, 1.0)),
    ("retro_lead_radiant", ("fl_synth", "Leads/FL_SKY_Lead_Radiant.wav", None, 1.0)),
    ("retro_lead_sharp", ("fl_synth", "Leads/FL_SKY_Lead_Sharp.wav", None, 1.0)),
    ("retro_lead_sonic", ("fl_synth", "Leads/FL_SKY_Lead_Sonic.wav", None, 1.0)),
    ("retro_lead_turbo", ("fl_synth", "Leads/FL_SKY_Lead_Turbo.wav", None, 1.0)),
    ("retro_lead_vivid", ("fl_synth", "Leads/FL_SKY_Lead_Vivid.wav", None, 1.0)),
    ("retro_lead", ("fl_synth", "Leads/FL_SKY_Lead_Digital.wav", None, 1.0)),
    ("retro_synth_analog", ("fl_synth", "Synths/FL_SKY_Synth_Analog.wav", None, 1.0)),
    ("retro_synth_chrome", ("fl_synth", "Synths/FL_SKY_Synth_Chrome.wav", None, 1.0)),
    ("retro_synth_crystal", ("fl_synth", "Synths/FL_SKY_Synth_Crystal.wav", None, 1.0)),
    ("retro_synth_dark", ("fl_synth", "Synths/FL_SKY_Synth_Dark.wav", None, 1.0)),
    ("retro_synth_dreamy", ("fl_synth", "Synths/FL_SKY_Synth_Dreamy.wav", None, 1.0)),
    ("retro_synth_electric", ("fl_synth", "Synths/FL_SKY_Synth_Electric.wav", None, 1.0)),
    ("retro_synth_midnight", ("fl_synth", "Synths/FL_SKY_Synth_Midnight.wav", None, 1.0)),
    ("retro_synth_neon", ("fl_synth", "Synths/FL_SKY_Synth_Neon.wav", None, 1.0)),
    ("retro_synth_retro", ("fl_synth", "Synths/FL_SKY_Synth_Retro.wav", None, 1.0)),
    ("retro_synth_soft", ("fl_synth", "Synths/FL_SKY_Synth_Soft.wav", None, 1.0)),
    ("retro_synth", ("fl_synth", "Synths/FL_SKY_Synth_Neon.wav", None, 1.0)),
    ("zurna", ("squidpipes", None, None, 1.0)),
    ("mizmar", ("squidpipes", None, None, 1.0)),
    ("choir_pad", ("freepats", "choirpad/SynthPadChoir SFZ+FLAC-20200516/SynthPadChoir 20200516.sfz", None, 1.0)),
    ("metal_drums", ("nakeddrums", None, None, 1.0)),
    ("metal_guitar", ("freepats", "eguitar/EGuitarFSBS-direct SFZ+FLAC-20220911/EGuitarFSBS-direct bridge 20220911.sfz", None, 1.0)),
    ("electric_guitar", ("freepats", "eguitar/EGuitarFSBS-direct SFZ+FLAC-20220911/EGuitarFSBS-direct bridge 20220911.sfz", None, 1.0)),
    ("electric_bass", ("ebass", None, None, 1.0)),
    ("snare", ("vcsl", "snare_drum", None, 1.0)),
    ("military_drum", ("vcsl", "military_drum", None, 1.0)),
    ("suspended_cymbal", ("vcsl", "orchestral_cymbals", None, 1.0)),
    ("crash_cymbal", ("vcsl", "orchestral_cymbals", None, 1.0)),
    ("bass_drum", ("vcsl", "bass_drum", None, 1.0)),
    ("tam_tam", ("vcsl", "tam_tam", None, 1.0)),
    ("gong", ("vcsl", "tam_tam", None, 1.0)),
    ("trumpet", ("vsco", "TrumpetSus.sfz", None, 1.0)),
    ("accordion", ("freepats", "accordion/Button Accordion HN SFZ+WAV-20240329/PRESET Button Accordion HN tuned.sfz", None, 1.0)),
    ("bagpipe", ("freepats", "bagpipe/Bagpipe SFZ+WAV-20260806/Bagpipe 20260806.sfz", None, 1.0)),
    ("violin_solo", ("vsco", "SViolinVib.sfz", "SViolinPizz.sfz", 1.0)),
    ("violin", ("vsco", "ViolinEnsSusVib.sfz", "ViolinEnsPizz.sfz", 1.0)),
    ("viola", ("vsco", "ViolaEnsSusVib.sfz", "ViolaEnsPizz.sfz", 1.0)),
    ("cello", ("vsco", "CelloEnsSusVib.sfz", "CelloEnsPizz.sfz", 1.0)),
    ("contrabass", ("vsco", "ContrabassSusVB.sfz", "ContrabassPizz.sfz", 1.0)),
    ("harp", ("vsco", "Harp.sfz", None, 1.0)),
    ("flute", ("vsco", "FluteSusVib.sfz", None, 1.0)),
    ("woodwind", ("vsco", "FluteSusVib.sfz", None, 1.0)),
    ("oboe", ("vsco", "OboeSusVib.sfz", None, 1.0)),
    ("clarinet", ("vsco", "ClarinetSus.sfz", None, 1.0)),
    ("horn", ("vsco", "FHornSus.sfz", None, 1.0)),
    ("trombone", ("vsco", "TromboneSus.sfz", None, 1.0)),
    ("timpani", ("vsco", "Timpani.sfz", None, 1.0)),
    ("guitar", ("freepats", "guitar/SpanishClassicalGuitar-SFZ-20190618/SpanishClassicalGuitar-20190618.sfz", None, 1.4)),
    ("felt_piano", ("salamander", None, None, 0.5)),
    # Ivy Audio Upright (VSCO 2 CE): el SFZ iguala sus tres capas, así que la dinámica la da una curva más empinada.
    ("upright_piano", ("vsco", "UprightPiano.sfz", None, 1.6)),
    ("piano", ("salamander", None, None, 0.5)),
    # Al final: "lute" está contenido en "flute" (y en woodwinds_flute); si va antes, la flauta cae en el laúd.
    ("lute", ("lute", "lute/Laud_Espanol.sf2", None, 1.4)),
]

# Ajuste de volumen (dB) por capa de velocidad de un SFZ, clave: lovel de la capa. Corrige el escalón al cambiar de
# capa (medido con la curva de velocidad aplicada): así velocidad 60 y 61 suenan casi igual.
LAYER_TRIM_DB = {"UprightPiano.sfz": {61: 1.8, 111: 1.8}}

# Tono por instrumento: (layer_bias, shelf_db). Con las velocidades suaves de estas piezas (30-70), Salamander usa
# sus capas grabadas más suaves, más opacas que el único sample (brillante) de FluidR3: se compensa eligiendo capas
# algo más fuertes y con un poco de presencia. felt_piano queda más oscuro que el de cola a propósito.
TONE = {
    "piano": (35, 5.0),
    "felt_piano": (40, 3.5),
    "guitar": (0, 2.5),
}


@lru_cache(maxsize=None)
def _instrument(library: str, sfz: str | None, curve: float, needle: str) -> Instrument:
    bias, shelf = TONE.get(needle, (0, 0.0))
    if library == "salamander":
        return Instrument("Salamander Grand Piano", salamander_regions(), curve, library, bias, shelf)
    if library == "vcsl":
        return Instrument(f"VCSL {sfz}", VCSL_BUILDERS[sfz](), curve, library, bias, shelf)
    if library == "ebass":
        return Instrument("Karoryfer Black And Blue Basses (picked)", ebass_regions(), curve, "karoryfer", bias, shelf)
    if library == "fl_kit":
        return Instrument(f"Function Loops {sfz}", kit_regions(FL, FL_KITS[sfz], release=0.3, one_shot=set(FL_KITS[sfz])),
                          curve, "functionloops", bias, shelf)
    if library == "fl_synth":
        return Instrument(f"Function Loops {Path(sfz).stem}", fl_synth_regions(sfz), curve, "functionloops", bias, shelf)
    if library == "squidpipes":
        return Instrument("Karoryfer Squidpipes (double reed)", squidpipes_regions(), curve, library, bias, shelf)
    if library == "nakeddrums":
        inst = Instrument("Naked Drums (GM, DI + OH)", naked_drums_regions(), curve, library, bias, shelf)
        inst.layered = True
        inst.stereo = True  # aéreos en estéreo real: el kit deja de sonar plano en el centro
        return inst
    if library == "swirly":
        return Instrument("Swirly Drums (brushes)", kit_regions(SWIRLY, BRUSH_KIT, release=1.2), curve, library, bias, shelf)
    if library == "lute":
        path = LIB_DIR / sfz
        if not path.exists():
            raise FileNotFoundError(f"{path} (bajalo a mano: ver sound-libraries/README.md)")
        return Instrument("Laúd español", sf2_regions(path), curve, library, bias, shelf)
    path = LIB_DIR / ("vsco2/" + sfz if library == "vsco" else sfz)
    regions = parse_sfz(path)
    for region in regions:
        region.volume += LAYER_TRIM_DB.get(sfz, {}).get(region.lovel, 0.0)
    return Instrument(path.stem, regions, curve, library, bias, shelf)


def instrument_for(instrument_id: str, articulation: str | None = None) -> Instrument | None:
    """El instrumento real para un instrumentId, o None si no hay biblioteca (se usa FluidR3)."""
    for needle, (library, sustain, pizz, curve) in MAPPING:
        if needle not in instrument_id:
            continue
        sfz = pizz if articulation == "pizzicato" and pizz else sustain
        try:
            return _instrument(library, sfz, curve, needle)
        except (FileNotFoundError, OSError):
            # Sin el laúd (se baja a mano), el sample real más cercano es la guitarra de nylon.
            return instrument_for(FALLBACK[needle], articulation) if needle in FALLBACK else None
    return None


FALLBACK = {"lute": "nylon_guitar"}

# Dónde se descargó cada biblioteca (primera carpeta dentro de sound-libraries/), para citar la fuente de cada sample.
SOURCE_URLS = {
    "vsco2": "https://github.com/sgossner/VSCO-2-CE (rama SFZ)",
    "vcsl": "https://github.com/sgossner/VCSL",
    "salamander": "https://github.com/sfzinstruments/SalamanderGrandPiano",
    "guitar": "https://freepats.zenvoid.org/Guitar/acoustic-guitar.html",
    "bagpipe": "https://freepats.zenvoid.org/Ethnic/bagpipe.html",
    "accordion": "https://freepats.zenvoid.org/Organ/accordion.html",
    "swirly": "https://github.com/sfzinstruments/karoryfer.swirly-drums",
    "lute": "https://musical-artifacts.com/artifacts/8452",
    "eguitar": "https://freepats.zenvoid.org/ElectricGuitar/clean-electric-guitar.html",
    "choirpad": "https://github.com/freepats/synth-pad-choir",
    "squidpipes": "https://github.com/sfzinstruments/karoryfer.squidpipes",
    "functionloops": "https://www.functionloops.com (Ultimate SFX for Games, software bundle bt25, purchased)",
    "ir": "Jester's Brutal Pack (CC0): https://www.jester-dyne-productions.com/ and https://freesound.org/people/jesterdyne/packs/34071/",
    "bass": "https://github.com/sfzinstruments/karoryfer.black-and-blue-basses",
    "nakeddrums": "https://github.com/sfzinstruments/WilkinsonAudio.NakedDrums",
}
LICENSE_NAMES = ("license", "license.txt", "license.md", "cc0.txt", "copying")


@lru_cache(maxsize=None)
def sample_provenance(path: Path) -> dict:
    """Ruta relativa, SHA-256, fuente y archivo de licencia (el más cercano subiendo desde el sample) de un sample."""
    path = Path(path).resolve()
    root = LIB_DIR.resolve()
    rel = path.relative_to(root)
    license_file = None
    folder = path.parent
    while license_file is None and folder != root.parent:
        license_file = next((f for f in folder.iterdir() if f.is_file() and f.name.lower() in LICENSE_NAMES), None)
        folder = folder.parent
    return {
        "file": rel.as_posix(),
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "sourceUrl": SOURCE_URLS.get(rel.parts[0]),
        "licenseFile": license_file.relative_to(root).as_posix() if license_file else None,
    }


def rings_long(instrument_id: str) -> bool:
    """True si el instrumento tiene golpes que suenan enteros (necesitan más cola al final del render)."""
    inst = instrument_for(instrument_id)
    return inst is not None and any(r.one_shot for r in inst.regions)


# Ajuste de nivel (dB) por instrumento y altura para que, a igual velocidad, suene tan fuerte como su equivalente
# FluidR3: así las mezclas ya balanceadas conservan su balance al pasar a samples reales. La diferencia entre
# bibliotecas depende del registro, por eso se mide cada 3 semitonos y se interpola. Clave: needle o needle:pizz,
# valor: [[altura MIDI, dB], ...]. Se regenera con scripts/calibrate_libraries.py (escribe calibration.json).
CALIBRATION_FILE = Path(__file__).resolve().parent / "calibration.json"


@lru_cache(maxsize=1)
def _calibration() -> dict[str, list[list[float]]]:
    if not CALIBRATION_FILE.exists():
        return {}
    import json

    return json.loads(CALIBRATION_FILE.read_text(encoding="utf-8"))


def _needle(instrument_id: str) -> str | None:
    return next((needle for needle, _ in MAPPING if needle in instrument_id), None)


def _effective_needle(instrument_id: str, articulation: str | None) -> str | None:
    """El needle cuya calibración aplica: si el instrumento cayó en su respaldo (laúd -> guitarra), el del respaldo."""
    needle = _needle(instrument_id)
    if needle in FALLBACK:
        inst = instrument_for(instrument_id, articulation)
        if inst is not None and inst.library != dict(MAPPING)[needle][0]:
            return _needle(FALLBACK[needle])
    return needle


def calibration_db(instrument_id: str, articulation: str | None = None, pitch: int = 64) -> float:
    needle = _effective_needle(instrument_id, articulation)
    table = _calibration()
    if needle is None:
        return 0.0
    points = table.get(f"{needle}:pizz") if articulation == "pizzicato" else None
    points = points or table.get(needle)
    if not points:
        return 0.0
    return float(np.interp(pitch, [p for p, _ in points], [db for _, db in points]))


# Créditos por biblioteca. Las de CC BY exigen que el crédito aparezca en el juego (créditos finales o "Acerca de").
LIBRARY_CREDITS = {
    "salamander": {
        "name": "Salamander Grand Piano V3",
        "credit": "Salamander Grand Piano V3 by Alexander Holm, SFZ mapping by kinwie — CC BY 3.0",
        "license": "CC BY 3.0",
        "licenseUrl": "https://creativecommons.org/licenses/by/3.0/",
        "attributionRequired": True,
    },
    "fluidr3": {
        "name": "FluidR3_GM soundfont",
        "credit": "FluidR3_GM soundfont by Frank Wen — CC BY 3.0",
        "license": "CC BY 3.0",
        "licenseUrl": "https://creativecommons.org/licenses/by/3.0/",
        "attributionRequired": True,
    },
    "vsco": {
        "name": "VSCO 2 Community Edition",
        "credit": "Orchestral samples: Versilian Studios Chamber Orchestra 2 Community Edition (VSCO 2 CE) — CC0. Upright piano sampled by Simon Dalzell (Ivy Audio)",
        "license": "CC0 1.0",
        "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
        "attributionRequired": False,
    },
    "freepats": {
        "name": "FreePats (guitarra, gaita, acordeón)",
        "credit": "Guitar, electric guitar, bagpipe, accordion and synth choir pad samples: FreePats project (freepats.zenvoid.org) — CC0",
        "license": "CC0 1.0",
        "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
        "attributionRequired": False,
    },
}


LIBRARY_CREDITS["vcsl"] = {
    "name": "Versilian Community Sample Library (VCSL)",
    "credit": "Early, folk and orchestral percussion samples: Versilian Community Sample Library (VCSL) by Versilian Studios — CC0",
    "license": "CC0 1.0",
    "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
    "attributionRequired": False,
}
LIBRARY_CREDITS["swirly"] = {
    "name": "Karoryfer Swirly Drums",
    "credit": "Brush drum samples: Swirly Drums by Karoryfer Samples — CC0",
    "license": "CC0 1.0",
    "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
    "attributionRequired": False,
}
LIBRARY_CREDITS["karoryfer"] = {
    "name": "Karoryfer Black And Blue Basses",
    "credit": "Electric bass samples: Black And Blue Basses by Karoryfer Samples — CC0",
    "license": "CC0 1.0",
    "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
    "attributionRequired": False,
}
LIBRARY_CREDITS["functionloops"] = {
    "name": "Function Loops (licensed)",
    "credit": "Retro drum and synth samples: Function Loops (Ultimate SFX for Games bundle) — royalty-free license, purchased. The raw samples may not be redistributed",
    "license": "Function Loops EULA (royalty-free, purchased; no redistribution of raw samples)",
    "licenseUrl": "https://www.functionloops.com/about-us.html",
    "attributionRequired": False,
}
LIBRARY_CREDITS["squidpipes"] = {
    "name": "Karoryfer Squidpipes",
    "credit": "Double reed samples: Squidpipes by Karoryfer Samples — CC0",
    "license": "CC0 1.0",
    "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
    "attributionRequired": False,
}
LIBRARY_CREDITS["nakeddrums"] = {
    "name": "Naked Drums (Wilkinson Audio)",
    "credit": "Drum samples: \"Naked Drums\" by Wilkinson Audio — CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)",
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
    "attributionRequired": True,
}
LIBRARY_CREDITS["lute"] = {
    "name": "Laúd español (Toni Bellinte)",
    "credit": "Spanish lute samples by Toni Bellinte (Tonibel) — CC BY 3.0",
    "license": "CC BY 3.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/3.0/",
    "attributionRequired": True,
}


def available() -> bool:
    return (LIB_DIR / "salamander" / "Samples").exists() or (LIB_DIR / "vsco2").exists()
