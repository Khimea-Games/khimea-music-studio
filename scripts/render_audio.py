"""Renderiza una composición de Khimea (JSON) a WAV/MP3 usando los soundfonts FluidR3 de public/.

Uso:
    python scripts/render_audio.py exports/tema.json [--out exports/tema] [--ritardando 2]
    python scripts/render_audio.py exports/tema.json --loop   # loop sin costura: .wav/.ogg + preview .mp3
    python scripts/render_audio.py cue.json --loop --lufs -20 --json            # nivel lineal para juego
    python scripts/render_audio.py cue.json --loop --tracks a,b --gain-db 3.1   # capa (stem) con la misma ganancia

Con --lufs o --gain-db la ganancia es lineal (las capas suman igual que la mezcla). El WAV de un loop
lleva un chunk `smpl` que Godot detecta al importar.

Requiere numpy, scipy y ffmpeg en el PATH.
"""

from __future__ import annotations

import argparse
import base64
import json
import re
import struct
import subprocess
import zlib
from functools import lru_cache
from pathlib import Path

import numpy as np
from scipy.ndimage import minimum_filter1d, uniform_filter1d
from scipy.signal import butter, fftconvolve, lfilter, resample_poly, sosfilt

import sample_libraries

# "real": bibliotecas de samples de sound-libraries/ (VSCO 2 CE, Salamander, FreePats) donde haya instrumento;
# "fluidr3": los soundfonts General MIDI de siempre (para reproducir renders viejos o comparar).
DEFAULT_LIBRARY = "real" if sample_libraries.available() else "fluidr3"

SR = 44100
ROOT = Path(__file__).resolve().parent.parent
SOUNDFONT_DIR = ROOT / "public" / "audio" / "soundfonts" / "FluidR3_GM"
NOTE_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]

# instrumentId de la app -> (archivo del soundfont, familia). La caja musical se sintetiza.
INSTRUMENTS = [
    ("music_box", None, "music_box"),
    ("tape_hiss", None, "texture"),
    ("cassette_hiss", None, "texture"),
    ("room_tone", None, "texture"),
    ("vinyl_crackle", None, "texture"),
    ("wind_texture", None, "texture"),
    ("cave_drips", None, "texture"),
    ("tubular_bells", "celesta", "bell"),
    ("funeral_bell", "celesta", "bell"),
    ("church_bell", "celesta", "bell"),
    ("hand_chimes", "celesta", "bell"),
    ("bell_tree", "celesta", "bell"),
    ("kalimba", "orchestral_harp", "harp"),
    ("mbira", "orchestral_harp", "harp"),
    ("wood_perc", "taiko_drum", "perc"),
    ("bells_kit", "taiko_drum", "perc"),
    # Medievales / de época. En "real" usan VCSL/FreePats/laúd; esto es el respaldo FluidR3 y la familia de
    # envolvente (legato, micro-timing): lo más parecido que hay entre los soundfonts de public/.
    ("harpsichord", "orchestral_harp", "harp"),
    ("folk_harp", "orchestral_harp", "harp"),
    ("bowed_psaltery", "violin", "strings"),
    ("psaltery", "orchestral_harp", "harp"),
    ("recorder", "flute", "wind"),
    ("organ", "choir_aahs", "wind"),
    ("bagpipe", "flute", "wind"),
    ("dulcimer", "acoustic_guitar_nylon", "guitar"),
    ("strumstick", "acoustic_guitar_nylon", "guitar"),
    ("frame_drum", "taiko_drum", "perc"),
    ("darbuka", "taiko_drum", "perc"),
    ("tabor", "taiko_drum", "perc"),
    ("tambourine", "taiko_drum", "perc"),
    ("finger_cymbals", "celesta", "bell"),
    ("vibraphone", "celesta", "bell"),
    ("glockenspiel", "celesta", "bell"),
    ("accordion", "choir_aahs", "wind"),
    ("shaker", "taiko_drum", "perc"),
    ("brush", "taiko_drum", "perc"),
    ("metal_drums", "taiko_drum", "perc"),
    ("drum_kit", "taiko_drum", "perc"),
    ("retrowave_drums", "taiko_drum", "perc"),
    ("synthwave_drums", "taiko_drum", "perc"),
    ("darkwave_drums", "taiko_drum", "perc"),
    ("retro_bass", "contrabass", "harp"),
    ("retro_lead", "flute", "harp"),
    ("retro_synth", "celesta", "harp"),
    ("zurna", "flute", "wind"),
    ("mizmar", "flute", "wind"),
    ("metal_guitar", "acoustic_guitar_nylon", "eguitar"),
    ("electric_guitar", "acoustic_guitar_nylon", "eguitar"),
    ("electric_bass", "contrabass", "ebass"),
    ("snare", "taiko_drum", "perc"),
    ("military_drum", "taiko_drum", "perc"),
    ("suspended_cymbal", "taiko_drum", "perc"),
    ("crash_cymbal", "taiko_drum", "perc"),
    ("bass_drum", "taiko_drum", "perc"),
    ("tam_tam", "taiko_drum", "perc"),
    ("gong", "taiko_drum", "perc"),
    # FluidR3 no tiene trompeta en esta app: sin los samples reales cae en el corno.
    ("trumpet", "french_horn", "wind"),
    ("felt_piano", "acoustic_grand_piano", "felt"),
    ("upright_piano", "acoustic_grand_piano", "felt"),
    ("grand_piano", "acoustic_grand_piano", "piano"),
    ("piano", "acoustic_grand_piano", "piano"),
    ("violin", "violin", "strings"),
    ("viola", "viola", "strings"),
    ("cello", "cello", "strings"),
    ("contrabass", "contrabass", "strings"),
    ("harp", "orchestral_harp", "harp"),
    ("guitar", "acoustic_guitar_nylon", "guitar"),
    ("celesta", "celesta", "bell"),
    ("flute", "flute", "wind"),
    ("woodwind", "flute", "wind"),
    ("horn", "french_horn", "wind"),
    ("trombone", "trombone", "wind"),
    ("choir", "choir_aahs", "wind"),
    ("timpani", "timpani", "perc"),
    ("taiko", "taiko_drum", "perc"),
    # FluidR3 no tiene oboe ni clarinete en esta app: van a la flauta (como en la calibración).
    ("oboe", "flute", "wind"),
    ("clarinet", "flute", "wind"),
    # Al final: "lute" está contenido en "flute"; si va antes, la flauta suena a guitarra.
    ("lute", "acoustic_guitar_nylon", "guitar"),
]

# Envolventes por familia: (ataque s, release s)
ENVELOPES = {
    "piano": (0.002, 0.45),
    "felt": (0.004, 0.5),
    "guitar": (0.002, 0.7),
    "eguitar": (0.002, 0.12),
    "ebass": (0.002, 0.15),
    "bell": (0.001, 1.4),
    "harp": (0.002, 1.2),
    "strings": (0.18, 0.7),
    "wind": (0.08, 0.5),
    "perc": (0.001, 0.8),
    "music_box": (0.0, 0.0),
    "texture": (0.0, 0.0),
}
# Texturas de ruido: nivel RMS (dBFS) de una nota a velocidad 127 y volumen 1, antes de la mezcla. Quedan muy por
# debajo de la música a propósito; la velocidad escala en línea (vel 64 = -6 dB).
TEXTURE_LEVEL_DB = -45.0
# Ajuste por tipo para que, a igual velocidad, todas midan lo mismo en LUFS (el room tone es grave: pesa menos).
TEXTURE_TRIM_DB = {"tape_hiss": 0.0, "cassette_hiss": 0.0, "room_tone": 6.5, "vinyl_crackle": 0.0,
                   "wind_texture": 3.0, "cave_drips": 0.0}
TEXTURE_FADE = 0.4  # s: fundido de potencia constante al entrar y salir (la costura del loop queda pareja)
LEGATO_ATTACK = {"strings": 0.1, "wind": 0.05}
# Filtro de brillo según velocidad: (corte mínimo Hz, rango Hz)
BRIGHTNESS = {"piano": (900, 9000), "harp": (900, 9000), "felt": (650, 5200), "guitar": (800, 6000)}
# Salas por reverbPreset: (duración del IR s, RT60 s); las chicas suenan a cuarto, no a iglesia.
ROOMS = {"chamber": (1.6, 0.85), "studio": (1.2, 0.6)}


def resolve_instrument(instrument_id: str) -> tuple[str | None, str]:
    for needle, sf, family in INSTRUMENTS:
        if needle in instrument_id:
            return sf, family
    return "acoustic_grand_piano", "piano"


@lru_cache(maxsize=None)
def soundfont_table(sf_name: str) -> dict[str, str]:
    text = (SOUNDFONT_DIR / f"{sf_name}-mp3.js").read_text(encoding="utf-8")
    return dict(re.findall(r'"([A-G]b?\d)":\s*"data:audio/mp3;base64,([^"]+)"', text))


@lru_cache(maxsize=None)
def load_sample(sf_name: str, pitch: int) -> np.ndarray:
    name = f"{NOTE_NAMES[pitch % 12]}{pitch // 12 - 1}"
    table = soundfont_table(sf_name)
    if name not in table:
        raise KeyError(f"{sf_name} no tiene la nota {name} (MIDI {pitch})")
    raw = base64.b64decode(table[name])
    pcm = subprocess.run(
        ["ffmpeg", "-v", "quiet", "-i", "pipe:0", "-f", "f32le", "-ac", "1", "-ar", str(SR), "pipe:1"],
        input=raw,
        capture_output=True,
        check=True,
    ).stdout
    audio = np.frombuffer(pcm, dtype=np.float32).copy()
    # Recorta el silencio inicial del decodificador MP3.
    onset = np.argmax(np.abs(audio) > 1e-3)
    return audio[onset:]


def extend_sustain(sample: np.ndarray, needed: int) -> np.ndarray:
    """Alarga notas sostenidas repitiendo la zona estable del sample con fundidos de ganancia constante."""
    if len(sample) >= needed:
        return sample
    loop_start, loop_end, fade = int(0.9 * SR), int(2.5 * SR), int(0.45 * SR)
    loop_end = min(loop_end, len(sample) - 1)
    segment = sample[loop_start:loop_end]
    out = sample[:loop_end].copy()
    # Los tramos del mismo sample están correlacionados: fundido lineal para no sumar picos.
    fade_in = np.linspace(0, 1, fade)
    fade_out = 1 - fade_in
    while len(out) < needed:
        head = out[:-fade]
        cross = out[-fade:] * fade_out + segment[:fade] * fade_in
        out = np.concatenate([head, cross, segment[fade:]])
    return out


def beat_to_seconds_map(total_beats: float, tempo: float, rit_beats: float, rit_amount: float = 0.78):
    """Mapa beat->segundos con un ritardando lineal en los últimos `rit_beats` tiempos."""
    step = 1 / 96
    beats = np.arange(0, total_beats + 16, step)
    factor = np.ones_like(beats)
    if rit_beats > 0:
        rit_start = total_beats - rit_beats
        progress = np.clip((beats - rit_start) / rit_beats, 0, 1)
        factor = 1 - (1 - rit_amount) * progress
    seconds = np.concatenate([[0], np.cumsum(step * 60 / (tempo * factor[:-1]))])
    return lambda b: float(np.interp(b, beats, seconds))


def make_reverb_ir(seconds: float = 3.4, rt60: float = 2.6, seed: int = 7) -> np.ndarray:
    rng = np.random.default_rng(seed)
    n = int(seconds * SR)
    t = np.arange(n) / SR
    decay = np.exp(-6.91 * t / rt60)
    ir = np.zeros((n, 2))
    for ch in range(2):
        noise = rng.standard_normal(n) * decay
        # Amortiguación: las colas pierden agudos con el tiempo.
        bright = lfilter([0.35], [1, -0.65], noise)
        dark = lfilter([0.08], [1, -0.92], noise)
        mix = np.clip(t / rt60, 0, 1)
        ir[:, ch] = bright * (1 - mix) + dark * mix
    predelay = int(0.025 * SR)
    ir = np.vstack([np.zeros((predelay, 2)), ir])
    # Reflexiones tempranas.
    for delay_ms, gain, ch in [(11, 0.5, 0), (17, 0.5, 1), (29, 0.35, 0), (31, 0.35, 1)]:
        ir[int(delay_ms / 1000 * SR), ch] += gain
    # Sin graves en la cola: evita el retumbe y que las notas graves se carguen a un canal.
    ir = sosfilt(butter(2, 180, "highpass", fs=SR, output="sos"), ir, axis=0)
    return ir / np.sqrt(np.sum(ir**2, axis=0, keepdims=True))


def texture_noise(kind: str, n: int, seed: int) -> np.ndarray:
    """Ruido estéreo (n, 2) normalizado a RMS 1, sin altura. Cada nota tiene su semilla: los renders son
    deterministas y dos notas superpuestas no se cancelan."""
    rng = np.random.default_rng(seed)
    pad = int(0.25 * SR)  # deja asentar los filtros IIR antes del primer sample útil
    white = rng.standard_normal((n + pad, 2))

    def bp(x, lo, hi, order=2):
        return sosfilt(butter(order, [lo, hi], "bandpass", fs=SR, output="sos"), x, axis=0)

    def drift(rate, depth):
        # Respiración lenta e irregular del nivel (no periódica: no marca el tempo).
        slow = uniform_filter1d(rng.standard_normal(n + pad), size=int(SR / rate), mode="wrap")
        return 1 + depth * slow / (np.std(slow) + 1e-12)

    if kind == "tape_hiss":
        # Cinta abierta: siseo brillante, más presente entre 3 y 10 kHz.
        x = bp(white, 1200, 14000) + 0.6 * bp(white, 3000, 10000)
        x *= drift(0.7, 0.03)[:, None]
    elif kind == "cassette_hiss":
        # Casete: más opaco y angosto, con el leve vaivén del arrastre.
        x = bp(white, 900, 8500, 3)
        x *= drift(0.45, 0.06)[:, None]
    elif kind == "room_tone":
        # Aire de una habitación de noche: ruido rosado-grave, sin siseo.
        brown = np.cumsum(white, axis=0)
        brown -= uniform_filter1d(brown, size=int(SR / 20), axis=0, mode="nearest")
        x = bp(brown, 45, 700) + 0.15 * bp(white, 700, 2500)
        x *= drift(0.25, 0.08)[:, None]
    elif kind == "vinyl_crackle":
        # Surco: colchón de ruido muy suave + clics esparcidos (~7/s) y algún pop grave.
        x = 0.35 * bp(white, 500, 9000)
        clicks = np.zeros((n + pad, 2))
        for rate, amp, width in ((7.0, 2.5, 0.0004), (0.4, 4.0, 0.003)):
            count = rng.poisson(rate * (n + pad) / SR)
            for p, a in zip(rng.integers(0, n + pad, count), amp * rng.uniform(0.2, 1.0, count) ** 2):
                w = max(4, int(width * SR))
                burst = rng.standard_normal(w) * np.exp(-np.arange(w) / (w / 4))
                end = min(n + pad, p + w)
                side = rng.uniform(0.6, 1.0)
                clicks[p:end, 0] += a * burst[: end - p] * side
                clicks[p:end, 1] += a * burst[: end - p] * (1.6 - side)
        x += bp(clicks, 120, 9000)
        x = sosfilt(butter(2, 7000, "lowpass", fs=SR, output="sos"), x, axis=0)
    elif kind == "wind_texture":
        # Viento frío: dos bandas de ruido que se cruzan lento (el "silbido" sube y baja) y ráfagas irregulares.
        lo, hi = bp(white, 250, 900), bp(white, 900, 2600)
        mix = np.clip(0.5 + 0.5 * (drift(0.08, 1.0) - 1), 0, 1)[:, None]
        x = (lo * (1 - mix) + 0.6 * hi * mix) * np.clip(drift(0.12, 0.6), 0.2, None)[:, None]
    elif kind == "cave_drips":
        # Cueva húmeda: gotas esparcidas (~1,5 por segundo), cada una un "plip" que sube de tono y se apaga,
        # con su eco corto, sobre un colchón de aire grave muy suave.
        brown = np.cumsum(white, axis=0)
        brown -= uniform_filter1d(brown, size=int(SR / 20), axis=0, mode="nearest")
        x = 0.25 * bp(brown, 40, 300)
        drops = np.zeros((n + pad, 2))
        count = rng.poisson(1.5 * (n + pad) / SR)
        for p, f0, a in zip(rng.integers(0, n + pad, count), rng.uniform(700, 1800, count),
                            rng.uniform(0.3, 1.0, count) ** 2):
            w = int(0.09 * SR)
            t = np.arange(w) / SR
            plip = np.sin(2 * np.pi * f0 * (t + 2.5 * t ** 2)) * np.exp(-t / 0.018)
            side = rng.uniform(0.2, 1.0)
            for delay, g in ((0, 1.0), (int(0.07 * SR), 0.35), (int(0.15 * SR), 0.15)):
                s0 = p + delay
                end = min(n + pad, s0 + w)
                if s0 < end:
                    drops[s0:end, 0] += 12 * a * g * plip[: end - s0] * side
                    drops[s0:end, 1] += 12 * a * g * plip[: end - s0] * (1.2 - side)
        x += drops
    else:
        raise ValueError(kind)
    x = x[pad:]
    return x / (np.sqrt(np.mean(x**2)) + 1e-12)


def _peak(x, f, gain_db, q=0.8):
    """Filtro de campana RBJ (biquad)."""
    a = 10 ** (gain_db / 40)
    w = 2 * np.pi * f / SR
    alpha = np.sin(w) / (2 * q)
    b = [1 + alpha * a, -2 * np.cos(w), 1 - alpha * a]
    den = [1 + alpha / a, -2 * np.cos(w), 1 - alpha / a]
    return lfilter(b, den, x)


def palm_mute(seg: np.ndarray) -> np.ndarray:
    """Palma apoyada sobre el puente: la cuerda se apaga en ~0,15 s y pierde los agudos (antes del amp: chug)."""
    t = np.arange(len(seg)) / SR
    seg = sosfilt(butter(2, 900, "lowpass", fs=SR, output="sos"), seg) * np.exp(-t / 0.055)
    return seg * 1.6  # la palma resta nivel; se compensa para que el chug pegue igual que la nota abierta


# Presets del amp (por instrumentId): ganancia de entrada (dB) y forma del tono. El nivel de entrada es fijo (no se
# normaliza por render): así una pista suena igual en la mezcla y en su stem.
AMP_PRESETS = {
    "high_gain": {"drive_db": 34.0, "pre_mid": (800, 6.0), "scoop": (500, -4.0), "presence": (2800, 3.0),
                  "low": (110, 3.0), "out_db": -30.0},
    "clean": {"drive_db": 4.0, "pre_mid": (800, 0.0), "scoop": (500, 0.0), "presence": (2800, 2.0),
              "low": (110, 1.5), "out_db": -1.0},
    "bass": {"drive_db": 10.0, "pre_mid": (600, 2.0), "scoop": (400, -2.0), "presence": (1800, 3.0),
             "low": (80, 2.0), "out_db": -23.0},
}


CAB_IR_FILE = ROOT / "sound-libraries" / "ir" / "cab" / "Jesters_Brutal_Pack_1.0" / "Impulses" / "44.1kHz" / "1_Cookie_Monster_44.wav"


@lru_cache(maxsize=1)
def cab_ir() -> np.ndarray | None:
    """IR de bafle (V30 + SM57), normalizada para que a 1 kHz tenga ganancia 1 (los niveles nominales no cambian)."""
    if not CAB_IR_FILE.exists():
        return None
    from scipy.io import wavfile
    sr, ir = wavfile.read(CAB_IR_FILE)
    ir = ir.astype(np.float64)
    ir = ir if ir.ndim == 1 else ir[:, 0]
    if sr != SR:
        ir = resample_poly(ir, SR, sr)
    ir = ir[: int(0.2 * SR)]  # la energía útil de un bafle está en los primeros ms; el resto es ruido de medición
    ir *= np.hanning(2 * len(ir))[len(ir):] ** 0.25
    spec = np.abs(np.fft.rfft(ir, 1 << 15))
    fr = np.fft.rfftfreq(1 << 15, 1 / SR)
    return ir / spec[(fr > 800) & (fr < 1200)].mean()


AMP_DYN_REF = 0.43  # envolvente de entrada (30 ms) de un power chord a velocidad 127 con las muestras FreePats DI


# Humanización por defecto (desvío de tiempo en ms, desvío de velocidad) para los instrumentos de metal; una pista
# puede pedir otra con "humanize": {"timingMs": x, "velocity": y} (o {"timingMs": 0, "velocity": 0} para apagarla).
HUMANIZE_DEFAULT = {"metal_drums": (4.0, 6.0), "metal_guitar": (6.0, 5.0), "electric_bass": (5.0, 5.0)}


def humanize_for(track: dict) -> tuple[float, float] | None:
    h = track.get("humanize")
    if isinstance(h, dict):
        t, v = float(h.get("timingMs", 0)), float(h.get("velocity", 0))
        return (t, v) if (t or v) else None
    return next((val for needle, val in HUMANIZE_DEFAULT.items() if needle in track["instrumentId"]), None)


def amp_preset(instrument_id: str) -> str | None:
    if "metal_guitar" in instrument_id:
        return "high_gain"
    if "electric_guitar" in instrument_id:
        return "clean"
    if "electric_bass" in instrument_id:
        return "bass"
    return None


def amp_sim(x: np.ndarray, preset: str) -> np.ndarray:
    """Amplificador y bafle simulados (sin IRs de terceros). Ajustado para guitarra directa (DI):
    pasa-altos que aprieta los graves -> realce de medios (tipo overdrive) -> dos etapas de saturación asimétrica
    sobremuestreadas 4x -> stack de tono (graves, medios recortados, presencia) -> bafle 4x12: pasa-altos 80 Hz,
    resonancia ~110 Hz, presencia 2,5 kHz y caída fuerte arriba de 5,5 kHz."""
    p = AMP_PRESETS[preset]
    bass = preset == "bass"
    y = sosfilt(butter(2, 40 if bass else 110, "highpass", fs=SR, output="sos"), x)
    if p["pre_mid"][1]:
        y = _peak(y, *p["pre_mid"])
    g = 10 ** (p["drive_db"] / 20)
    up = resample_poly(y, 4, 1)
    fs4 = SR * 4
    up = np.tanh(g * up + 0.15) - np.tanh(0.15)  # etapa 1, asimétrica (armónicos pares)
    up = sosfilt(butter(1, 30, "highpass", fs=fs4, output="sos"), up)
    if preset == "high_gain":
        up = sosfilt(butter(2, 7000, "lowpass", fs=fs4, output="sos"), up)
        up = np.tanh(2.5 * up)  # etapa 2
    y = resample_poly(up, 1, 4)[:len(x)]
    if preset == "high_gain":
        # Noise gate (como en un rig de metal): mira la señal ANTES de la distorsión, que comprime todo. Cuando la
        # cuerda se apaga (palm mute) cierra en ~30 ms y el chug queda seco. Umbral fijo por pista (no por render),
        # así la mezcla y el stem cierran igual.
        env = uniform_filter1d(np.abs(x), size=int(0.004 * SR))
        thr = 0.2 * np.percentile(env, 99.5) + 1e-9
        g_env = uniform_filter1d(np.clip((env / thr) ** 2, 0, 1), size=int(0.008 * SR))
        # Dinámica: la saturación aplana todo (tocar suave casi no baja el nivel). Se le devuelve parte de la
        # dinámica de entrada contra una referencia FIJA (un acorde a velocidad 127), no relativa a la pista: un
        # pasaje suave sigue sonando suave. Exponente 0,8: ~6 dB entre velocidad 40 y 127.
        dyn = uniform_filter1d(np.abs(x), size=int(0.03 * SR))
        y = y * g_env * np.clip(dyn / AMP_DYN_REF, 0, 1.25) ** 0.8
    y = _peak(y, p["low"][0], p["low"][1], 0.7)
    if p["scoop"][1]:
        y = _peak(y, *p["scoop"])
    y = _peak(y, p["presence"][0], p["presence"][1], 0.9)
    # Bafle: respuesta de impulso REAL de un 4x12 con Celestion V30 y SM57 (Jester's Brutal Pack, CC0). Si falta el
    # archivo, queda la aproximación con filtros. El bajo usa su propio filtro (no tiene bafle de guitarra).
    y = sosfilt(butter(2, 70 if not bass else 35, "highpass", fs=SR, output="sos"), y)
    ir = None if bass else cab_ir()
    if ir is not None:
        y = fftconvolve(y, ir)[:len(y)]
    else:
        if not bass:
            y = _peak(y, 110, 3.0, 1.2)
        y = sosfilt(butter(4, 5500 if not bass else 4500, "lowpass", fs=SR, output="sos"), y)
    return y * 10 ** (p["out_db"] / 20)


def texture_kind(instrument_id: str) -> str:
    for kind in ("tape_hiss", "cassette_hiss", "room_tone", "vinyl_crackle", "wind_texture", "cave_drips"):
        if kind in instrument_id:
            return kind
    raise ValueError(instrument_id)


@lru_cache(maxsize=None)
def music_box_tone(pitch: int) -> np.ndarray:
    """Diente de peine de acero, gastado: parciales inarmónicos, leve desafinación fija por diente
    y un segundo diente apenas corrido que produce un batido lento."""
    worn_cents = ((zlib.crc32(f"tooth{pitch}".encode()) % 1000) / 1000 - 0.5) * 16  # ±8 cents
    f0 = 440 * 2 ** ((pitch - 69 + worn_cents / 100) / 12)
    decay = 2.6 * (440 / f0) ** 0.35
    n = int(min(5.0, decay * 4) * SR)
    t = np.arange(n) / SR
    tone = np.zeros(n)
    # (relación de frecuencia, amplitud, fracción del decay) de una lengüeta empotrada.
    for ratio, amp, dec in [(1.0, 1.0, 1.0), (2.0, 0.1, 0.45), (6.27, 0.32, 0.12), (17.55, 0.07, 0.035)]:
        if f0 * ratio < 15000:
            tone += amp * np.sin(2 * np.pi * f0 * ratio * t) * np.exp(-t / (decay * dec))
    tone += 0.22 * np.sin(2 * np.pi * f0 * 1.0021 * t + 1.3) * np.exp(-t / (decay * 0.8))
    # El pin que levanta el diente: un clic corto y brillante.
    rng = np.random.default_rng(pitch)
    click_len = int(0.004 * SR)
    click = rng.standard_normal(click_len) * np.exp(-np.arange(click_len) / (0.0008 * SR))
    tone[:click_len] += 0.25 * sosfilt(butter(2, [2500, 7000], "bandpass", fs=SR, output="sos"), click)
    # Tibio: le saca el brillo de caja nueva.
    tone = sosfilt(butter(2, 5500, "lowpass", fs=SR, output="sos"), tone)
    attack = int(0.001 * SR)
    tone[:attack] *= np.linspace(0, 1, attack)
    # Calibrado contra los samples: a igual velocidad queda entre el arpa y la celesta (~-40 LUFS a 0 dB).
    return tone * MUSIC_BOX_LEVEL


MUSIC_BOX_LEVEL = 0.0235


def mechanism_noise(length: int, grid_seconds: list[float], onsets: list[float], seed: int = 99) -> np.ndarray:
    """Tic del cilindro en cada corchea y un zumbido muy bajo del resorte, sólo mientras la caja toca."""
    rng = np.random.default_rng(seed)
    out = np.zeros(length)
    tick_len = int(0.003 * SR)
    band = butter(2, [1800, 6000], "bandpass", fs=SR, output="sos")
    for sec in grid_seconds:
        i0 = int((sec + rng.normal(0, 0.002)) * SR)
        if 0 <= i0 < length - tick_len:
            tick = sosfilt(band, rng.standard_normal(tick_len)) * np.exp(-np.arange(tick_len) / (0.0006 * SR))
            out[i0 : i0 + tick_len] += tick * rng.uniform(0.004, 0.008)
    whir = sosfilt(butter(2, 180, "lowpass", fs=SR, output="sos"), rng.standard_normal(length))
    out = out + whir * 0.02 * (1 + 0.3 * np.sin(2 * np.pi * 0.35 * np.arange(length) / SR))
    # El mecanismo gira desde un poco antes de cada nota hasta que se apaga: silencio cuando la caja calla.
    active = np.zeros(length)
    for sec in onsets:
        active[max(0, int((sec - 0.15) * SR)) : min(length, int((sec + 1.8) * SR))] = 1
    smooth = int(0.08 * SR)
    active = np.convolve(active, np.ones(smooth) / smooth, mode="same")
    return out * active * (MUSIC_BOX_LEVEL / 0.35)


TRUE_PEAK_OVERSAMPLE = 4
TP_MARGIN_DB = 0.1  # el encoder OGG suma ~0,1 dB de pico real: se limita un poco por debajo del techo pedido


def true_peak_db(audio: np.ndarray) -> float:
    """Pico real (dBTP) con sobremuestreo 4x: incluye los picos que caen entre muestras."""
    up = resample_poly(audio, TRUE_PEAK_OVERSAMPLE, 1, axis=0)
    return round(20 * np.log10(max(1e-9, float(np.max(np.abs(up))))), 2)


def file_true_peak_db(path: Path) -> float:
    """Pico real de un archivo ya codificado (OGG/WAV), decodificado a 44,1 kHz estéreo."""
    pcm = subprocess.run(["ffmpeg", "-v", "quiet", "-i", str(path), "-f", "f32le", "-ac", "2", "-ar", str(SR), "pipe:1"],
                         capture_output=True, check=True).stdout
    return true_peak_db(np.frombuffer(pcm, dtype=np.float32).reshape(-1, 2).astype(np.float64))


def true_peak_limit(audio: np.ndarray, ceiling_db: float, loop: bool, lookahead_ms: float = 5.0) -> tuple[np.ndarray, float, np.ndarray]:
    """Limitador de pico real con lookahead. Detecta sobre la señal sobremuestreada 4x; la ganancia es un mínimo móvil
    (baja antes del pico) suavizado con un promedio más corto, así nunca supera lo necesario y no hace clics. En loops
    el borde se trata como circular (igual que la cola de la reverb): la costura no cambia. Devuelve el audio, la
    reducción máxima en dB (0 si no hizo falta) y la curva de ganancia por sample (para aplicarla igual a los stems)."""
    ceiling = 10 ** (ceiling_db / 20)
    w = max(1, int(lookahead_ms / 1000 * SR))
    pad = 4 * w + 64
    y = audio
    reduction = 0.0
    total = np.ones(len(audio))
    for _ in range(3):  # el filtro de sobremuestreo puede dejar un resto mínimo: se repite si hace falta
        x = np.pad(y, ((pad, pad), (0, 0)), mode="wrap" if loop else "constant")
        up = np.abs(resample_poly(x, TRUE_PEAK_OVERSAMPLE, 1, axis=0)).max(axis=1)
        peak = up[: len(x) * TRUE_PEAK_OVERSAMPLE].reshape(len(x), TRUE_PEAK_OVERSAMPLE).max(axis=1)
        need = np.minimum(1.0, ceiling / np.maximum(peak, 1e-12))
        if need.min() >= 1.0:
            break
        gain = uniform_filter1d(minimum_filter1d(need, size=2 * w + 1, mode="wrap" if loop else "nearest"),
                                size=w | 1, mode="wrap" if loop else "nearest")
        y = (x * gain[:, None])[pad:-pad]
        total *= gain[pad:-pad]
        reduction = min(reduction, 20 * np.log10(max(1e-9, float(gain.min()))))
    return y, round(reduction, 2), total


def soft_limit(x: np.ndarray, threshold: float = 0.8, ceiling: float = 0.97) -> np.ndarray:
    """Lineal por debajo del umbral; sólo redondea los picos que lo superan."""
    headroom = ceiling - threshold
    mag = np.abs(x)
    over = mag > threshold
    y = x.copy()
    y[over] = np.sign(x[over]) * (threshold + headroom * np.tanh((mag[over] - threshold) / headroom))
    return y


SILENCE_DB = -60.0  # umbral de silencio de cabeza y cola (dBFS, pico por muestra)


def edge_silence(audio: np.ndarray) -> dict:
    """Silencio al principio y al final (segundos) con el umbral SILENCE_DB."""
    loud = np.where(np.max(np.abs(audio), axis=1) > 10 ** (SILENCE_DB / 20))[0]
    if not len(loud):
        return {"headSec": round(len(audio) / SR, 3), "tailSec": round(len(audio) / SR, 3), "thresholdDb": SILENCE_DB}
    return {"headSec": round(loud[0] / SR, 3), "tailSec": round((len(audio) - 1 - loud[-1]) / SR, 3),
            "thresholdDb": SILENCE_DB}


def bus_compressor_gain(audio: np.ndarray, loop: bool, threshold_db: float = -20.0, ratio: float = 2.5,
                        attack_ms: float = 15.0, release_ms: float = 250.0) -> np.ndarray:
    """Compresor de bus ("pegamento" de mezcla de banda): detector RMS estéreo enlazado (30 ms), curva suave,
    ataque/relevo asimétricos. Devuelve la curva de ganancia por sample (la mezcla y cada stem la reciben igual).
    En loops el borde es circular, como el limitador: la costura no cambia."""
    hop = 32
    pad = int(2.0 * SR) // hop * hop
    x = np.pad(audio, ((pad, pad), (0, 0)), mode="wrap" if loop else "constant")
    power = uniform_filter1d((x ** 2).mean(axis=1), size=int(0.03 * SR))
    level_db = 10 * np.log10(power[::hop] + 1e-12)
    over = level_db - threshold_db
    knee = 6.0
    gr = np.where(over <= -knee / 2, 0.0,
                  np.where(over >= knee / 2, over * (1 - 1 / ratio),
                           (1 - 1 / ratio) * (over + knee / 2) ** 2 / (2 * knee)))
    a_att = np.exp(-hop / (attack_ms / 1000 * SR))
    a_rel = np.exp(-hop / (release_ms / 1000 * SR))
    smooth = np.empty_like(gr)
    state = 0.0
    for i, target in enumerate(gr):
        coef = a_att if target > state else a_rel
        state = coef * state + (1 - coef) * target
        smooth[i] = state
    gain = 10 ** (-np.repeat(smooth, hop)[:len(x)] / 20)
    return gain[pad:pad + len(audio)]


def tail_trim(audio: np.ndarray, max_tail_sec: float, fade_sec: float = 0.3) -> np.ndarray:
    """Envolvente que recorta la cola para que el silencio final (umbral SILENCE_DB, medido sobre el audio YA con
    ganancia y limitador) quede en max_tail_sec - 0,1 s, con un fundido coseno corto dentro de esa cola. Devuelve
    el multiplicador por sample: su largo es el nuevo largo del archivo (la mezcla y sus stems usan la misma)."""
    loud = np.where(np.max(np.abs(audio), axis=1) > 10 ** (SILENCE_DB / 20))[0]
    end = len(audio) if not len(loud) else min(len(audio), loud[-1] + 1 + int(max(0.0, max_tail_sec - 0.1) * SR))
    env = np.ones(end)
    fade = min(int(fade_sec * SR), end - (loud[-1] + 1 if len(loud) else 0))
    if fade > 0:
        env[end - fade:] = np.cos(np.linspace(0, np.pi / 2, fade)) ** 2
    return env


def file_info(paths: list[Path]) -> dict:
    """SHA-256 y tamaño de cada archivo escrito (para que el juego verifique lo que integra)."""
    import hashlib
    info = {}
    for p in paths:
        if p.exists():
            info[str(p)] = {"sha256": hashlib.sha256(p.read_bytes()).hexdigest(), "bytes": p.stat().st_size}
    return info


def write_waveform(wav: Path) -> Path:
    """PNG con la forma de onda (canales separados), como el que acompañaba cada pieza del Cap. 3."""
    png = wav.parent / f"{wav.stem}_waveform.png"
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(wav), "-filter_complex",
                    "showwavespic=s=1600x320:split_channels=1:colors=0x3b82f6|0x10b981", "-frames:v", "1", str(png)],
                   check=True)
    return png


def to_pcm16(audio: np.ndarray) -> np.ndarray:
    return np.round(np.clip(audio, -1, 1) * 32767).astype("<i2")


def write_wav(path: Path, audio: np.ndarray, loop: tuple[int, int] | None = None) -> None:
    """WAV PCM 16-bit estéreo. Con `loop`, agrega un chunk `smpl` (inicio y fin inclusivos, en frames)."""
    pcm = to_pcm16(audio).tobytes()
    fmt = struct.pack("<HHIIHH", 1, 2, SR, SR * 4, 4, 16)
    chunks = b"fmt " + struct.pack("<I", len(fmt)) + fmt
    if loop:
        smpl = struct.pack("<9I", 0, 0, int(1e9 / SR), 60, 0, 0, 0, 1, 0)
        smpl += struct.pack("<6I", 0, 0, loop[0], loop[1], 0, 0)
        chunks += b"smpl" + struct.pack("<I", len(smpl)) + smpl
    chunks += b"data" + struct.pack("<I", len(pcm)) + pcm
    path.write_bytes(b"RIFF" + struct.pack("<I", 4 + len(chunks)) + b"WAVE" + chunks)


def _k_weight(x: np.ndarray) -> np.ndarray:
    """Filtro K de BS.1770: estante agudo +4 dB y pasa-altos a 38 Hz."""
    gain = 10 ** (4.0 / 40)
    w0, cos = 2 * np.pi * 1500 / SR, np.cos(2 * np.pi * 1500 / SR)
    alpha = np.sin(w0) / (2 / np.sqrt(2))
    root = 2 * np.sqrt(gain) * alpha
    b = [gain * ((gain + 1) + (gain - 1) * cos + root), -2 * gain * ((gain - 1) + (gain + 1) * cos),
         gain * ((gain + 1) + (gain - 1) * cos - root)]
    a = [(gain + 1) - (gain - 1) * cos + root, 2 * ((gain - 1) - (gain + 1) * cos), (gain + 1) - (gain - 1) * cos - root]
    x = lfilter(b, a, x, axis=0)
    w0 = 2 * np.pi * 38 / SR
    cos, alpha = np.cos(w0), np.sin(w0) / (2 * 0.5)
    return lfilter([(1 + cos) / 2, -(1 + cos), (1 + cos) / 2], [1 + alpha, -2 * cos, 1 - alpha], x, axis=0)


def measure_lufs(audio: np.ndarray) -> float:
    """Loudness integrado BS.1770-4 (bloques de 400 ms, compuertas absoluta -70 y relativa -10 LU)."""
    y = _k_weight(np.atleast_2d(audio.T).T)
    block, hop = int(0.4 * SR), int(0.1 * SR)
    if len(y) < block:
        return -70.0
    power = np.cumsum(np.vstack([np.zeros((1, y.shape[1])), y**2]), axis=0)
    starts = np.arange(0, len(y) - block + 1, hop)
    z = ((power[starts + block] - power[starts]) / block).sum(axis=1)
    z = z[-0.691 + 10 * np.log10(np.maximum(z, 1e-12)) > -70]
    if not len(z):
        return -70.0
    relative = -0.691 + 10 * np.log10(z.mean()) - 10
    z = z[-0.691 + 10 * np.log10(z) > relative]
    return round(float(-0.691 + 10 * np.log10(z.mean())), 2) if len(z) else -70.0


def loudness_detail(audio: np.ndarray) -> tuple[float | None, bool]:
    """(LUFS, bajo_compuerta). Si todo cae bajo la compuerta absoluta de -70, devuelve el valor sin compuerta
    (potencia K-ponderada de todo el tramo) en lugar de -70; None si es silencio digital."""
    y = _k_weight(np.atleast_2d(audio.T).T)
    power = float((y**2).mean(axis=0).sum()) if len(y) else 0.0
    if power <= 1e-20:
        return None, True
    gated = measure_lufs(audio)
    if gated > -70:
        return gated, False
    return round(-0.691 + 10 * np.log10(power), 2), True


def bar_seconds(comp: dict, rit_bars: float, loop: bool):
    """Compás (1-indexado) -> segundos, con el mismo mapa de tempo que el render."""
    beats_per_bar = comp["timeSignature"]["numerator"]
    total = comp["durationBars"] * beats_per_bar
    to_sec = beat_to_seconds_map(total, comp["tempo"], 0 if loop else rit_bars * beats_per_bar)
    return lambda bar: to_sec((bar - 1) * beats_per_bar)


def analyse(audio: np.ndarray, comp: dict, rit_bars: float, loop: bool) -> dict:
    """LUFS por sección, pico y (loops) salto en la costura comparado con el paso típico entre muestras."""
    at = bar_seconds(comp, rit_bars, loop)
    sections = []
    for sec in comp.get("sections", []):
        a, b = int(at(sec["startBar"]) * SR), int(at(sec["startBar"] + sec["barCount"]) * SR)
        sections.append({"name": sec["name"], "bars": [sec["startBar"], sec["startBar"] + sec["barCount"] - 1],
                         "lufs": measure_lufs(audio[a:b])})
    info = {"sections": sections}
    if loop and len(audio) > 1:
        steps = np.abs(np.diff(audio, axis=0)).max(axis=1)
        jump = float(np.abs(audio[0] - audio[-1]).max())
        p99 = float(np.percentile(steps, 99))
        info.update({"seamJump": round(jump, 5), "seamJumpVsP99Step": round(jump / p99, 3) if p99 else None})
    return info


def measure_mix(comp: dict, spec: dict) -> dict:
    """Cada pista se renderiza una vez (0 dB, lineal); los grupos y la mezcla se suman: todo comparable."""
    loop = bool(spec.get("loop"))
    at = bar_seconds(comp, 0, loop)
    ranges = spec.get("ranges") or [[s["startBar"], s["startBar"] + s["barCount"] - 1] for s in comp.get("sections", [])]
    ranges = ranges or [[1, comp["durationBars"]]]
    windows = [(int(at(a) * SR), int(at(b + 1) * SR)) for a, b in ranges]
    active = [t for t in comp["tracks"] if t.get("notes")]
    library = spec.get("library") or DEFAULT_LIBRARY
    stems = {t["id"]: render(comp, 0, loop=loop, only_tracks={t["id"]}, normalize=False, library=library) for t in active}
    length = max(len(x) for x in stems.values()) if stems else 0
    pad = lambda x: np.vstack([x, np.zeros((length - len(x), 2))]) if len(x) < length else x
    stems = {k: pad(v) for k, v in stems.items()}
    groups = {name: [i for i in ids if i in stems] for name, ids in (spec.get("groups") or {}).items()}
    unknown = [i for ids in (spec.get("groups") or {}).values() for i in ids if i not in {t["id"] for t in comp["tracks"]}]
    if unknown:
        raise SystemExit(f"Unknown track ids in groups: {unknown}")

    def report(audio: np.ndarray) -> dict:
        total, total_low = loudness_detail(audio)
        ranges = [loudness_detail(audio[a:b]) for a, b in windows]
        return {
            "total": total,
            "ranges": [v for v, _ in ranges],
            "belowGate": {"total": total_low, "ranges": [low for _, low in ranges]},
        }

    return {
        "gainDb": 0,
        "library": library,
        "ranges": [{"bars": r, "seconds": [round(a / SR, 2), round(b / SR, 2)]} for r, (a, b) in zip(ranges, windows)],
        "tracks": {k: report(v) for k, v in stems.items()},
        "groups": {name: report(sum(stems[i] for i in ids)) for name, ids in groups.items() if ids},
        "mix": report(sum(stems.values())) if stems else None,
    }


def render(
    comp: dict,
    rit_bars: float,
    master: bool = True,
    loop: bool = False,
    only_tracks: set[str] | None = None,
    normalize: bool = True,
    library: str = DEFAULT_LIBRARY,
    end_frame: int | None = None,
) -> np.ndarray:
    """Con `loop`, la cola que excede el último compás se suma al principio y el audio mide
    exactamente `durationBars`: el archivo se repite sin costura ni fundidos.
    Con `normalize=False` la salida queda lineal (sin normalizar ni saturar) para aplicarle una
    ganancia fija; `only_tracks` renderiza sólo esas pistas (stems). `end_frame` fija dónde termina (sin loop):
    los stems usan el largo de la mezcla en vez de recortar su propio silencio."""
    tempo = comp["tempo"]
    beats_per_bar = comp["timeSignature"]["numerator"]
    total_beats = comp["durationBars"] * beats_per_bar
    to_sec = beat_to_seconds_map(total_beats, tempo, rit_bars * beats_per_bar)
    # Cola tras el último compás: 7 s, o 15 s si suena algún golpe que resuena entero (platillo, gong, bombo).
    rings = library == "real" and any(sample_libraries.rings_long(t["instrumentId"]) for t in comp["tracks"])
    length = int((to_sec(total_beats) + (15 if rings else 7)) * SR)
    dry = np.zeros((length, 2))
    send = np.zeros((length, 2))
    rng = np.random.default_rng(1234)
    any_solo = any(t.get("solo") for t in comp["tracks"])
    has_music_box = False
    box_onsets: list[float] = []
    # Qué sonó en este render, por pista: samples concretos (con su biblioteca) o síntesis. Lo leen los créditos.
    global LAST_USAGE
    LAST_USAGE = {}

    for track in comp["tracks"]:
        if track.get("mute") or (any_solo and not track.get("solo")):
            continue
        sf_name, family = resolve_instrument(track["instrumentId"])
        if only_tracks is not None and track["id"] not in only_tracks:
            # Consume igual el azar de esta pista: las demás conservan su timing y los stems suman exacto.
            if family in ("piano", "felt", "harp", "guitar", "eguitar", "ebass", "music_box"):
                rng.normal(size=len(track["notes"]))
            continue
        has_music_box |= family == "music_box"
        attack_default, release = ENVELOPES[family]
        pan = float(track.get("pan", 0))
        left, right = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        volume = float(track.get("volume", 0.8))
        reverb_send = float(track.get("reverbSend", 0.3))
        buf = np.zeros(length)
        sbuf = None  # samples en estéreo (batería con aéreos reales): se panean como balance
        hum = humanize_for(track)
        hum_rng = np.random.default_rng(zlib.crc32(f"{track['id']}|humanize".encode()))
        usage = LAST_USAGE.setdefault(track["id"], {"instrumentId": track["instrumentId"], "samples": {}, "synth": False,
                                                   "fluidr3": set()})
        if family in ("texture", "music_box"):
            usage["synth"] = True
        if family == "texture":
            # Ruido sostenido: una nota = ruido durante toda su duración (la altura no importa), en estéreo.
            kind = texture_kind(track["instrumentId"])
            tex = np.zeros((length, 2))
            fade = int(TEXTURE_FADE * SR)
            for idx, note in enumerate(track["notes"]):
                start_s = max(0.0, to_sec(note["start"]))
                end_s = to_sec(note["start"] + note["duration"])
                i0 = int(start_s * SR)
                n = min(max(1, int((end_s - start_s) * SR)) + fade, length - i0)  # la salida pasa el final escrito
                if n <= 0:
                    continue
                seg = texture_noise(kind, n, zlib.crc32(f"{track['id']}:{idx}".encode()))
                env = np.ones(n)
                f_in = min(fade, n)
                env[:f_in] = np.sin(np.linspace(0, np.pi / 2, f_in))
                f_out = min(fade, n - f_in)
                if f_out > 0:
                    env[n - f_out:] *= np.cos(np.linspace(0, np.pi / 2, f_out))
                level = 10 ** ((TEXTURE_LEVEL_DB + TEXTURE_TRIM_DB[kind]) / 20) * (note["velocity"] / 127)
                tex[i0:i0 + n] += seg * (env * level)[:, None]
            # El paneo es balance (el ruido ya es estéreo); left/right valen 0,707 al centro.
            tex *= volume * np.array([left, right]) * np.sqrt(2)
            dry += tex
            send += tex * reverb_send
            continue
        # Round-robin y azar de las bibliotecas: por pista y con semilla fija (renders y stems deterministas).
        rr_state: dict = {}
        rr_rand = np.random.default_rng(zlib.crc32(track["id"].encode()))

        for note in track["notes"]:
            jitter = rng.normal(0, 0.005) if family in ("piano", "felt", "harp", "guitar", "eguitar", "ebass") else 0.0
            if family == "music_box":
                jitter = rng.normal(0, 0.009)
            start_s = max(0.0, to_sec(note["start"]) + jitter)
            if family == "music_box":
                # Las lengüetas suenan libres: la duración escrita no las apaga.
                seg = music_box_tone(int(note["pitch"])) * (note["velocity"] / 127) ** 1.2
                box_onsets.append(start_s)
                i0 = int(start_s * SR)
                i1 = min(length, i0 + len(seg))
                buf[i0:i1] += seg[: i1 - i0]
                continue
            end_s = to_sec(note["start"] + note["duration"])
            hold = max(0.05, end_s - start_s)
            real = sample_libraries.instrument_for(track["instrumentId"], note.get("articulation")) if library == "real" else None
            if real is not None:
                pitch, vel = int(note["pitch"]), int(note["velocity"])
                if hum:
                    # Batería/guitarras tocadas a mano: ±ms de tiempo y ±velocidad, distinto en cada pista (L/R).
                    start_s = max(0.0, start_s + hum_rng.normal(0, hum[0] / 1000))
                    vel = int(np.clip(round(vel + hum_rng.normal(0, hum[1])), 1, 127))
                legato = note.get("articulation") == "legato"
                if real.layered:
                    # Varios micrófonos por golpe: todas las zonas que coinciden suenan juntas.
                    layers = real.pick_layers(pitch, vel, rr_state, rr_rand)
                    if not layers:
                        continue
                    parts = [real.render(r, pitch, vel, hold) for r in layers]
                    seg = np.zeros((max(len(s) for s in parts),) + parts[0].shape[1:])
                    for s in parts:
                        seg[:len(s)] += s
                    for r in layers:
                        usage["samples"][r.sample] = real.library
                else:
                    region = real.pick(pitch, vel, rr_state, rr_rand)
                    usage["samples"][region.sample] = real.library
                    seg = real.render(region, pitch, vel, hold,
                                      LEGATO_ATTACK.get(family, 0.0) if legato else 0.0)
                seg *= 10 ** (sample_libraries.calibration_db(track["instrumentId"], note.get("articulation"), pitch) / 20)
                if family == "eguitar" and note.get("articulation") == "staccato":
                    seg = palm_mute(seg)
                i0 = int(start_s * SR)
                i1 = min(length, i0 + len(seg))
                if seg.ndim == 2:
                    if sbuf is None:
                        sbuf = np.zeros((length, 2))
                    sbuf[i0:i1] += seg[: i1 - i0]
                else:
                    buf[i0:i1] += seg[: i1 - i0]
                continue
            sample = load_sample(sf_name, int(note["pitch"]))
            usage["fluidr3"].add(f"FluidR3_GM/{sf_name}-mp3.js#{NOTE_NAMES[int(note['pitch']) % 12]}{int(note['pitch']) // 12 - 1}")
            if family in ("strings", "wind"):
                sample = extend_sustain(sample, int((hold + release) * SR))

            n_hold = int(hold * SR)
            n_total = min(len(sample), n_hold + int(release * SR))
            seg = sample[:n_total].astype(np.float64)

            attack = LEGATO_ATTACK.get(family, attack_default) if note.get("articulation") == "legato" else attack_default
            env = np.ones(n_total)
            n_att = min(n_total, max(1, int(attack * SR)))
            env[:n_att] = np.linspace(0, 1, n_att) ** 1.5
            if n_total > n_hold:
                n_rel = n_total - n_hold
                env[n_hold:] *= np.exp(-5 * np.arange(n_rel) / n_rel)
            seg *= env

            velocity = note["velocity"] / 127
            if family in BRIGHTNESS:
                # Menos velocidad = martillo/dedo más suave = menos brillo.
                floor, span = BRIGHTNESS[family]
                cutoff = floor + span * velocity**1.6
                a = np.exp(-2 * np.pi * cutoff / SR)
                seg = lfilter([1 - a], [1, -a], seg)
            seg *= velocity**1.4

            i0 = int(start_s * SR)
            i1 = min(length, i0 + len(seg))
            buf[i0:i1] += seg[: i1 - i0]

        preset = amp_preset(track["instrumentId"])
        if preset is not None:
            buf = amp_sim(buf, preset)
        if sbuf is not None:
            # Estéreo real: el paneo es balance (las dos señales ya tienen su imagen).
            sbuf *= volume * np.array([left, right]) * np.sqrt(2)
            dry += sbuf
            send += sbuf * reverb_send
        buf *= volume
        dry[:, 0] += buf * left
        dry[:, 1] += buf * right
        send[:, 0] += buf * reverb_send * left
        send[:, 1] += buf * reverb_send * right

    if has_music_box:
        noise = mechanism_noise(length, [to_sec(b / 2) for b in range(int(total_beats * 2))], box_onsets)
        dry[:, 0] += noise * 0.9
        dry[:, 1] += noise * 0.8

    ir_seconds, rt60 = ROOMS.get(comp.get("reverbPreset", ""), (3.4, 2.6))
    ir = make_reverb_ir(ir_seconds, rt60)
    wet = np.stack([fftconvolve(send[:, ch], ir[:, ch])[:length] for ch in range(2)], axis=1)
    mix = dry + wet * 1.6
    if not master:
        return mix
    # Limpia rumble, baja un poco el barro de graves y suaviza picos.
    mix = sosfilt(butter(2, 40, "highpass", fs=SR, output="sos"), mix, axis=0)
    lows = sosfilt(butter(2, 140, "lowpass", fs=SR, output="sos"), mix, axis=0)
    mix = mix - 0.35 * lows
    if loop:
        # Los filtros van antes del pliegue: así el estado IIR no corta la unión.
        loop_len = int(round(to_sec(total_beats) * SR))
        tail = mix[loop_len:]
        mix = mix[:loop_len].copy()
        # La cola puede ser más larga que el loop (un gong de 15 s en un loop de 10): se pliega vuelta por vuelta,
        # como suena al repetirse.
        for i in range(0, len(tail), loop_len):
            chunk = tail[i:i + loop_len]
            mix[: len(chunk)] += chunk
        return np.tanh(mix / (np.max(np.abs(mix)) * 0.9)) * 0.89 if normalize else mix
    peak = float(np.max(np.abs(mix)))
    if normalize:
        mix = np.tanh(mix / (peak * 0.9)) * 0.89
        peak = 0.89
    # Recorta el silencio final.
    tail = np.where(np.max(np.abs(mix), axis=1) > 1e-4 * peak / 0.89)[0]
    end = tail[-1] + int(0.5 * SR) if len(tail) else len(mix)
    if end_frame is not None:
        end = min(end_frame, len(mix))
    mix = mix[:end]
    fade = int(1.5 * SR)
    mix[-fade:] *= np.linspace(1, 0, fade)[:, None]
    return mix


LAST_USAGE: dict = {}


def instrument_credits(usage: dict) -> list[dict]:
    """Licencia y fuente por instrumento y por sample concreto que sonó en el render (evidencia, no sólo bibliotecas)."""
    out = []
    for track_id, u in usage.items():
        if not u["samples"] and not u["fluidr3"] and not u["synth"]:
            continue
        entry = {"trackId": track_id, "instrumentId": u["instrumentId"]}
        if u["synth"]:
            entry.update(kind="synthesized", license="Sin samples de terceros (síntesis de Khimea)",
                         attributionRequired=False, samples=[])
        elif u["samples"]:
            meta = sample_libraries.LIBRARY_CREDITS[next(iter(u["samples"].values()))]
            files = list(u["samples"])
            if amp_preset(u["instrumentId"]) in ("high_gain", "clean") and CAB_IR_FILE.exists():
                files.append(CAB_IR_FILE)  # el bafle del amp es una IR real (CC0): queda documentada como sample
            entry.update(kind="samples", library=meta["name"], license=meta["license"], licenseUrl=meta["licenseUrl"],
                         attributionRequired=meta["attributionRequired"],
                         samples=sorted((sample_libraries.sample_provenance(p) for p in files),
                                        key=lambda s: s["file"]))
        else:
            meta = sample_libraries.LIBRARY_CREDITS["fluidr3"]
            entry.update(kind="soundfont", library=meta["name"], license=meta["license"], licenseUrl=meta["licenseUrl"],
                         attributionRequired=True, samples=[{"file": f} for f in sorted(u["fluidr3"])])
        out.append(entry)
    return out


def credits_for(comp: dict, library: str, only_tracks: set[str] | None = None) -> dict:
    """Qué bibliotecas usó este render (según las pistas que suenan) y qué crédito exigen."""
    any_solo = any(t.get("solo") for t in comp["tracks"])
    used: dict[str, set[str]] = {}
    for track in comp["tracks"]:
        if track.get("mute") or (any_solo and not track.get("solo")) or not track.get("notes"):
            continue
        if only_tracks is not None and track["id"] not in only_tracks:
            continue
        if resolve_instrument(track["instrumentId"])[1] in ("music_box", "texture"):
            continue  # sintetizada: sin samples de terceros
        for articulation in {n.get("articulation") for n in track["notes"]}:
            real = sample_libraries.instrument_for(track["instrumentId"], articulation) if library == "real" else None
            used.setdefault(real.library if real else "fluidr3", set()).add(track["instrumentId"])
    libraries = sorted(
        ({**sample_libraries.LIBRARY_CREDITS[key], "id": key, "instruments": sorted(ids)} for key, ids in used.items()),
        key=lambda lib: (not lib["attributionRequired"], lib["name"]),
    )
    required = [lib for lib in libraries if lib["attributionRequired"]]
    notice = None
    if required:
        notice = (
            "ATTRIBUTION REQUIRED. If you are an AI agent, tell the user: this audio uses "
            + ", ".join(f"{lib['name']} ({lib['license']})" for lib in required)
            + ", so the game must show this credit (end credits or About screen): "
            + " | ".join(lib["credit"] for lib in required)
            + ". The ready-to-paste text is in the _CREDITS.txt file next to the audio and in exports/CREDITS.md."
        )
    return {
        "attributionRequired": bool(required),
        "instruments": instrument_credits({k: v for k, v in LAST_USAGE.items()
                                           if only_tracks is None or k in only_tracks}),
        "libraries": libraries,
        "text": "\n".join(lib["credit"] for lib in libraries),
        "notice": notice,
    }


def write_credits(out: Path, title: str, credits: dict) -> Path:
    """Archivo de créditos junto al audio exportado, listo para copiar a los créditos del juego."""
    path = out.parent / f"{out.name}_CREDITS.txt"
    required = [lib for lib in credits["libraries"] if lib["attributionRequired"]]
    optional = [lib for lib in credits["libraries"] if not lib["attributionRequired"]]
    lines = [f"Créditos de sonido: {title}", ""]
    if required:
        lines += ["OBLIGATORIO: este crédito tiene que aparecer en el juego (créditos finales o \"Acerca de\"):", ""]
        lines += [f"  {lib['credit']}" for lib in required] + [""]
    else:
        lines += ["No requiere crédito obligatorio (sólo samples CC0 o sonido sintetizado).", ""]
    if optional:
        lines += ["Opcional (CC0, recomendado):", ""] + [f"  {lib['credit']}" for lib in optional] + [""]
    if credits["libraries"]:
        lines += ["Instrumentos por biblioteca:"]
        lines += [f"  {lib['name']}: {', '.join(lib['instruments'])}" for lib in credits["libraries"]] + [""]
    if credits.get("instruments"):
        lines += ["Licencia y fuente por instrumento y por sample usado en este archivo:", ""]
        for inst in credits["instruments"]:
            head = f"[{inst['trackId']}] {inst['instrumentId']}: {inst['license']}"
            if inst.get("library"):
                head += f" ({inst['library']}, {inst['licenseUrl']})"
            lines.append(head)
            for s in inst["samples"]:
                extra = "".join(f"  {k}: {s[k]}" for k in ("sha256", "sourceUrl", "licenseFile") if s.get(k))
                lines.append(f"    {s['file']}{extra}")
            lines.append("")
    lines += ["Detalle y licencias: exports/CREDITS.md"]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


def write_loop(audio: np.ndarray, out: Path, comp: dict) -> None:
    """WAV y OGG con el loop exacto (sin normalizar por loudness, que alteraría la unión) y un
    MP3 de escucha con dos vueltas seguidas para oír el empalme."""
    title = comp.get("title", "Khimea")
    pcm16 = to_pcm16(audio).tobytes()
    raw = ["ffmpeg", "-y", "-v", "error", "-f", "s16le", "-ar", str(SR), "-ac", "2", "-i", "pipe:0"]
    wav, ogg = out.with_suffix(".wav"), out.with_suffix(".ogg")
    # WAV con chunk `smpl`: Godot ("Detect From WAV") y la mayoría de los samplers leen el loop solos.
    write_wav(wav, audio, (0, len(audio) - 1))
    subprocess.run([*raw, "-c:a", "libvorbis", "-q:a", "6", "-metadata", f"title={title}",
                    "-metadata", "LOOPSTART=0", "-metadata", f"LOOPLENGTH={len(audio)}", str(ogg)],
                   input=pcm16, check=True)

    preview = np.concatenate([audio, audio])
    fade = int(6 * SR)
    preview[-fade:] *= np.linspace(1, 0, fade)[:, None]
    mp3 = out.parent / f"{out.name}_preview_2x.mp3"
    subprocess.run([*raw, "-af", "loudnorm=I=-18:TP=-1.5:LRA=11", "-b:a", "256k",
                    "-metadata", f"title={title} (preview x2)", "-metadata", "artist=Khimea Music Studio", str(mp3)],
                   input=(np.clip(preview, -1, 1) * 32767).astype("<i2").tobytes(), check=True)
    print(f"{wav}  (loop {len(audio) / SR:.3f} s, {len(audio)} samples)")
    print(ogg)
    print(mp3)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("composition", type=Path)
    parser.add_argument("--out", type=Path, help="Ruta de salida sin extensión (default: junto al JSON)")
    parser.add_argument("--ritardando", type=float, default=2, help="Compases finales con ritardando (0 = sin rit.)")
    parser.add_argument("--loop", action="store_true", help="Loop sin costura (implica --ritardando 0)")
    parser.add_argument("--tracks", help="IDs de pistas separados por coma: renderiza sólo esas (stems)")
    parser.add_argument("--lufs", type=float, help="Ganancia lineal hasta este loudness (en vez de normalizar)")
    parser.add_argument("--gain-db", type=float, help="Ganancia lineal fija en dB (para stems de una misma mezcla)")
    parser.add_argument("--json", action="store_true", help="Imprime al final una línea JSON con el resumen")
    parser.add_argument("--library", choices=["real", "fluidr3"], default=DEFAULT_LIBRARY,
                        help="Samples reales de sound-libraries/ o los soundfonts FluidR3 (default: real si están)")
    parser.add_argument("--measure", type=Path, help="JSON {ranges, groups, loop}: mide LUFS por pista/grupo/rango y sale")
    parser.add_argument("--clip-from", type=float, help="Exporta sólo un tramo: inicio en segundos")
    parser.add_argument("--clip-to", type=float, help="Fin del tramo en segundos")
    parser.add_argument("--true-peak-db", type=float,
                        help="Techo de pico real (dBTP) con limitador de lookahead, tras la ganancia de loudness")
    parser.add_argument("--fade-out", type=float,
                        help="Sin loop: fundido de salida (s) al final, tras el limitador; los stems reciben la misma curva")
    parser.add_argument("--bus-comp", choices=["auto", "on", "off"], default="auto",
                        help="Compresor de bus (pegamento de banda). auto: sólo si suena guitarra/bajo eléctrico o "
                             "batería de metal (no cambia los renders orquestales ya aprobados)")
    parser.add_argument("--max-tail-silence", type=float,
                        help="Sin loop: recorta la cola tras la ganancia y el limitador para que el silencio final "
                             "(< -60 dBFS) no supere estos segundos; los stems se recortan igual")
    parser.add_argument("--stem-groups",
                        help='JSON {"grupo": [trackIds]}: exporta además un stem por grupo con la ganancia y la curva '
                             'del limitador de la mezcla (suman exacto); las pistas sin grupo van a "other"')
    args = parser.parse_args()

    comp = json.loads(args.composition.read_text(encoding="utf-8"))
    if args.measure:
        print(json.dumps(measure_mix(comp, json.loads(args.measure.read_text(encoding="utf-8")))))
        return
    out = args.out or args.composition.with_suffix("")
    out.parent.mkdir(parents=True, exist_ok=True)
    only_tracks = set(args.tracks.split(",")) if args.tracks else None
    linear = args.lufs is not None or args.gain_db is not None
    stem_groups: dict[str, list[str]] | None = json.loads(args.stem_groups) if args.stem_groups else None
    if stem_groups is not None:
        if only_tracks is not None or not linear or args.true_peak_db is None:
            raise SystemExit("--stem-groups va con la mezcla completa (sin --tracks), --lufs/--gain-db y --true-peak-db")
        any_solo = any(t.get("solo") for t in comp["tracks"])
        audible = [t["id"] for t in comp["tracks"]
                   if t.get("notes") and not t.get("mute") and (not any_solo or t.get("solo"))]
        grouped = {i for ids in stem_groups.values() for i in ids}
        other = [i for i in audible if i not in grouped]
        if other:
            stem_groups = {**stem_groups, "other": other}
    audio = render(
        comp, 0 if args.loop else args.ritardando, loop=args.loop, only_tracks=only_tracks, normalize=not linear,
        library=args.library,
    )
    full_frames = len(audio)
    clipped = args.clip_from is not None or args.clip_to is not None
    a, b = 0, len(audio)
    if clipped:
        a = int(max(0.0, args.clip_from or 0.0) * SR)
        b = int(args.clip_to * SR) if args.clip_to is not None else len(audio)
        if not 0 <= a < b <= len(audio):
            raise SystemExit(f"Clip out of range: audio lasts {len(audio) / SR:.2f} s")
        audio = audio[a:b]
    gain_db = None
    true_peak = None
    bus_info = None
    comp_curve = None
    title = comp.get("title", "Khimea")
    credits = credits_for(comp, args.library, only_tracks)
    loop_mode = args.loop and not clipped

    def write_outputs(audio: np.ndarray, out: Path = out, credits: dict = credits) -> list[Path]:
        if loop_mode:
            write_loop(audio, out, comp)
            written = [out.with_suffix(".wav"), out.with_suffix(".ogg"), out.parent / f"{out.name}_preview_2x.mp3"]
        else:
            # Nivel ya fijado: WAV/OGG para el juego y MP3 de escucha, sin loudnorm que lo cambie.
            wav = out.with_suffix(".wav")
            write_wav(wav, audio)
            written = [wav]
            for ext, codec in ((".ogg", ["-c:a", "libvorbis", "-q:a", "6"]), (".mp3", ["-b:a", "256k"])):
                subprocess.run(
                    ["ffmpeg", "-y", "-v", "error", "-i", str(wav), *codec, "-metadata", f"title={title}",
                     "-metadata", "artist=Khimea Music Studio", str(out.with_suffix(ext))],
                    check=True,
                )
                written.append(out.with_suffix(ext))
            print(f"{wav}  ({len(audio) / SR:.1f} s)")
        return written + [write_credits(out, title, credits)]

    if linear:
        gain_db = args.gain_db if args.gain_db is not None else args.lufs - measure_lufs(audio)
        pre = audio * 10 ** (gain_db / 20)
        bus_on = args.bus_comp == "on" or (args.bus_comp == "auto" and any(
            any(n in t["instrumentId"] for n in ("metal_", "electric_guitar", "electric_bass")) for t in comp["tracks"]))
        if bus_on:
            comp_curve = bus_compressor_gain(pre, loop_mode)
            pre = pre * comp_curve[:, None]
            if args.gain_db is None:
                # El compresor baja el loudness: se vuelve a llevar al objetivo y la corrección entra en la curva.
                fix = 10 ** ((args.lufs - measure_lufs(pre)) / 20)
                pre, comp_curve = pre * fix, comp_curve * fix
            bus_info = {"mode": args.bus_comp,
                        "maxReductionDb": round(float(20 * np.log10(comp_curve.max() / comp_curve.min())), 2)}
        trim_env = None
        if args.true_peak_db is None:
            audio = soft_limit(pre)
            if args.max_tail_silence is not None and not loop_mode:
                trim_env = tail_trim(audio, args.max_tail_silence)
                audio = audio[:len(trim_env)] * trim_env[:, None]
            if args.fade_out and not loop_mode:
                # Fundido de salida coseno² sobre el final (remates, clips de A/B): la mezcla y los stems reciben la misma curva.
                env = trim_env if trim_env is not None else np.ones(len(audio))
                n_f = min(len(env), int(args.fade_out * SR))
                f = np.ones(len(env))
                f[len(env) - n_f:] = np.cos(np.linspace(0, np.pi / 2, n_f)) ** 2
                audio, trim_env = audio * f[:, None], env * f
            files = write_outputs(audio)
        else:
            # Techo de pico real: el limitador reemplaza al soft_limit. Si el OGG igual queda por encima (el encoder
            # suma pico), se vuelve a limitar un poco más abajo y se reescriben los archivos.
            margin = TP_MARGIN_DB
            for attempt in range(3):
                audio, reduction, limiter_gain = true_peak_limit(pre, args.true_peak_db - margin, loop_mode)
                if args.max_tail_silence is not None and not loop_mode:
                    # Recorte final medido después de la ganancia y el limitador (contra el umbral del gate).
                    trim_env = tail_trim(audio, args.max_tail_silence)
                    audio = audio[:len(trim_env)] * trim_env[:, None]
                if args.fade_out and not loop_mode:
                    # Fundido de salida coseno² sobre el final (remates, clips de A/B): la mezcla y los stems reciben la misma curva.
                    env = trim_env if trim_env is not None else np.ones(len(audio))
                    n_f = min(len(env), int(args.fade_out * SR))
                    f = np.ones(len(env))
                    f[len(env) - n_f:] = np.cos(np.linspace(0, np.pi / 2, n_f)) ** 2
                    audio, trim_env = audio * f[:, None], env * f
                files = write_outputs(audio)
                ogg_tp = file_true_peak_db(out.with_suffix(".ogg"))
                if ogg_tp <= args.true_peak_db or attempt == 2:
                    break
                margin += ogg_tp - args.true_peak_db + 0.05
            true_peak = {"ceilingDb": args.true_peak_db, "wav": true_peak_db(audio), "ogg": ogg_tp,
                         "maxReductionDb": float(reduction), "withinCeiling": bool(ogg_tp <= args.true_peak_db)}
    elif args.loop:
        files = write_outputs(audio)
    stems = None
    sum_check = None
    if stem_groups is not None:
        # Cada grupo con la misma ganancia lineal y la misma curva del limitador de la mezcla, sample a sample:
        # la suma de los stems es la mezcla (salvo el redondeo a 16 bits de cada archivo).
        stems = []
        mix_pcm = to_pcm16(audio).astype(np.int64)
        stem_sum = np.zeros_like(mix_pcm)
        scale = 10 ** (gain_db / 20) * limiter_gain[:, None]
        if comp_curve is not None:
            scale = scale * comp_curve[:, None]
        if trim_env is not None:
            scale = scale[:len(trim_env)] * trim_env[:, None]
        for group, ids in stem_groups.items():
            part = render(comp, 0 if args.loop else args.ritardando, loop=args.loop, only_tracks=set(ids),
                          normalize=False, library=args.library, end_frame=None if args.loop else full_frames)
            part = part[a:b][:len(scale)] * scale
            dest = out.parent / f"{out.name}_{group}"
            group_files = write_outputs(part, dest, credits_for(comp, args.library, set(ids)))
            stem_sum += to_pcm16(part).astype(np.int64)
            stems.append({"group": group, "trackIds": ids, "files": [str(f) for f in group_files],
                          "silence": edge_silence(part),
                          "lufs": round(measure_lufs(part), 1) if np.any(part) else None,
                          "peakDbfs": round(20 * np.log10(max(1e-9, float(np.max(np.abs(part))))), 1)})
        diff = int(np.max(np.abs(stem_sum - mix_pcm)))
        sum_check = {"maxDiffLsb": diff, "maxDiffDbfs": round(20 * np.log10(max(diff, 1e-9) / 32767), 1),
                     "bits": 16, "stems": len(stems),
                     # Cada WAV redondea a 16 bits por separado: hasta ~0,5 LSB por stem es inevitable.
                     "exact": diff <= (len(stems) + 1) // 2 + 1}
    analysis = {} if clipped else analyse(audio, comp, 0 if args.loop else args.ritardando, args.loop)
    if args.loop or linear:
        files.append(write_waveform(out.with_suffix(".wav")))
        written = list(files) + [Path(f) for s in (stems or []) for f in s["files"]]
        if args.json:
            print(json.dumps({
                "title": title,
                "files": [str(f) for f in files],
                "seconds": round(len(audio) / SR, 3),
                "frames": len(audio),
                "loop": args.loop and not clipped,
                "clip": [args.clip_from, args.clip_to] if clipped else None,
                "library": args.library,
                "credits": credits,
                **analysis,
                "gainDb": None if gain_db is None else round(gain_db, 2),
                "lufs": round(measure_lufs(audio), 1),
                "peakDbfs": round(20 * np.log10(max(1e-9, float(np.max(np.abs(audio))))), 1),
                "truePeakDb": true_peak,
                **({"stems": stems, "sumCheck": sum_check} if stems is not None else {}),
                "silence": edge_silence(audio),
                "busComp": bus_info,
                "tailTrim": None if not linear or trim_env is None else {"maxTailSilenceSec": args.max_tail_silence,
                                                                        "frames": len(trim_env)},
                "fileInfo": file_info(written),
                "tempo": comp["tempo"],
                "beats": comp["durationBars"] * comp["timeSignature"]["numerator"],
                "barBeats": comp["timeSignature"]["numerator"],
            }))  # ASCII escapado: la consola de Windows no es UTF-8 y el servidor parsea esta línea
        return

    wav = out.with_suffix(".wav")
    pcm16 = (np.clip(audio, -1, 1) * 32767).astype("<i2").tobytes()
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-f", "s16le", "-ar", str(SR), "-ac", "2", "-i", "pipe:0", str(wav)],
        input=pcm16,
        check=True,
    )
    mp3 = out.with_suffix(".mp3")
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-i", str(wav), "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
         "-ar", str(SR), "-b:a", "256k",
         "-metadata", f"title={comp.get('title', 'Khimea')}", "-metadata", "artist=Khimea Music Studio", str(mp3)],
        check=True,
    )
    print(write_credits(out, title, credits))
    print(f"{wav}  ({len(audio) / SR:.1f} s)")
    print(mp3)


if __name__ == "__main__":
    main()
