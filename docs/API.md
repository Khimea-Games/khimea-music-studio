# Khimea Music Studio — API de composición

Todo pasa por un solo endpoint:

```
POST http://localhost:3000/api/mcp/call
Content-Type: application/json

{ "toolName": "<herramienta>", "arguments": { ... }, "currentComposition": { ... } }
```

`GET /api/mcp/tools` devuelve la lista de herramientas con sus parámetros. La respuesta siempre es `{ "success": true|false, "result": ... }`; si falla, `result` (o `error`) explica por qué.

## Convenciones

- **Compases** 1-indexados e inclusivos: `[1, 8]` son los compases 1 a 8.
- **Tiempos** (beats) 0-indexados desde el inicio de la pieza. En 4/4, el compás 5 empieza en el tiempo 16.
- **Nota:** `[altura MIDI, inicio, duración, velocidad?, articulación?]` o `{pitch, start, duration, velocity?, articulation?}`.
- **Frase:** `[[altura, tiempo desde el inicio de la frase, duración, velocidad?], ...]`.
- **`compositionId`:** cualquier herramienta que necesita una composición acepta el id de una guardada en el servidor, en lugar de mandar `currentComposition`.
- **`saveAs`:** guarda el resultado en el servidor con ese id. Aplica a `get_demo`, `new_composition`, `create_variation` y `edit_composition`.
- **Sólo desde la misma máquina:** `export_audio`, `measure_mix`, `search_sfx`, `export_sfx`, `save_composition`, `load_composition`, `list_compositions`, `delete_composition` y `compare_compositions`, porque leen o escriben archivos o lanzan procesos.

## Flujo típico

```jsonc
// 1. Esqueleto guardado
{"toolName":"new_composition","arguments":{"title":"Exploration","bars":16,"tempo":66,"loop":true,"reverbPreset":"chamber",
  "saveAs":"ch1_exploration",
  "tracks":[{"id":"pno","instrumentId":"felt_piano","role":"melody","volume":0.9},
            {"id":"gtr","instrumentId":"nylon_guitar","role":"harmony","volume":0.5}]}}

// 2. Tabla de acordes con nombre
{"toolName":"get_chords","arguments":{}}

// 3. Notas por reglas (se guarda de nuevo en ch1_exploration; responde un resumen)
{"toolName":"edit_composition","arguments":{"compositionId":"ch1_exploration","operations":[
  {"op":"add_chord_pattern","trackId":"gtr","bars":[1,16],"chords":["D","A/C#","Bm","G"],
   "pattern":[[0,-1,2,50],[1,0,1,40],[2,1,1,40],[3,2,1,38]]},
  {"op":"place_phrase","trackId":"pno","bar":5,"phrase":[[69,0,1],[74,1,1],[78,2,2]],"velocity":60},
  {"op":"humanize","trackId":"pno","velJitter":4,"timeJitterBeats":0.015,"seed":3}]}}

// 4. Balance medido
{"toolName":"measure_mix","arguments":{"compositionId":"ch1_exploration","ranges":[[1,8],[9,16]],
  "groups":{"pianos":["pno"],"back":["gtr"]},"loop":true}}

// 5. Exportar
{"toolName":"export_audio","arguments":{"compositionId":"ch1_exploration","name":"mi-juego/ch1/01_exploration","loop":true,"lufs":-20}}
```

## Herramientas

### Material y composiciones

| Herramienta | Argumentos | Devuelve |
|---|---|---|
| `get_chords` | — | Tabla de acordes con nombre (`{bass, voicing}` por acorde) para `add_chord_pattern` |
| `get_demo` | `demoId?`, `saveAs?` | Una composición de la plataforma; sin `demoId`, la lista de ids |
| `new_composition` | `title, tempo=66, key=D, scale=major, bars=16, loop, reverbPreset, tracks[{id,instrumentId,role,...}], saveAs?` | Esqueleto vacío |
| `save_composition` | `compositionId?` + `currentComposition` | `{compositionId, resumen}` |
| `load_composition` | `compositionId` | La composición completa |
| `list_compositions` | — | `[{compositionId, title, tempo, durationBars, tracks, modified}]` |
| `delete_composition` | `compositionId` | `{deleted}` |
| `compare_compositions` | `a, b` (cada uno: id guardado, demoId u objeto), `examples=10` | `{identical, meta[], tracksAdded, tracksRemoved, tracks[{trackId, props[{field,from,to}], notes{added, removed, changed, unchanged, examples}}]}`. Las notas se emparejan por altura + inicio: si cambia el inicio, cuenta como quitada y agregada |

Ids de `get_demo`: `dark_forest`, `orc_boss`, `romantic`.

### `edit_composition`

`{ operations: [...], compositionId?, saveAs?, returnComposition? }`. Las operaciones se aplican en orden sobre una copia. Si una falla, no se aplica ninguna y el error nombra la operación (`operation #2 (fade): ...`). Con `compositionId` el resultado se guarda y la respuesta trae un resumen; `returnComposition: true` devuelve la composición completa. Siempre incluye `applied` y `validation` (errores y avisos).

| op | Campos |
|---|---|
| `set` | `title, tempo, key, scale, durationBars, mode, reverbPreset` |
| `add_track` | `track: {id, name, instrumentId, role, volume?, pan?, reverbSend?, notes?}` |
| `remove_track` / `update_track` | `trackId` / `trackId, props` |
| `copy_track` | `fromTrackId, newId, name?, instrumentId?, role?, transpose?` |
| `set_notes` / `add_notes` | `trackId, notes` |
| `remove_notes` | `trackId?, fromBeat?, toBeat?, pitches?` |
| `transpose` | `semitones, trackId?, fromBeat?, toBeat?` |
| `scale_velocity` | `factor, trackId?, fromBeat?, toBeat?` |
| `crop` | `startBar, barCount` (recorta y corre al inicio) |
| `add_chord_pattern` | `trackId, bars:[from,to], chords`: una entrada por compás, en ciclo. Cada entrada es un acorde (`nombre \| {bass, voicing}`) o segmentos `[[acorde, tiempo, dur], ...]`; con segmentos, cada nota usa el acorde vigente y se corta al terminar su segmento. `pattern:[[tiempo, voz, dur, vel, art?]]` (voz `-1` = bajo; el índice da la vuelta sobre el voicing), `skipBars?` |
| `limit_duration` | `maxBeats, trackId?, fromBeat?, toBeat?, shiftLongFromDownbeat?`: acorta las notas más largas que `maxBeats` y conserva altura e inicio. Con `shiftLongFromDownbeat: N`, las notas largas que caen en el tiempo 1 se atrasan N tiempos (una respiración del arco) |
| `place_phrase` | `trackId, bar, phrase, transpose?, velocity?, articulation?` (legato por defecto) |
| `humanize` | `trackId?, velJitter?, timeJitterBeats?, seed?, fromBeat?, toBeat?`. Con la misma semilla da el mismo resultado; ninguna nota queda más allá del final |
| `restrike` | `maxBeats, every, velDrop?, trackId?, fromBeat?, toBeat?`: divide cada nota más larga que `maxBeats` en reataques cada `every` tiempos (`every` ≤ `maxBeats`, sin huecos). Cada reataque dura como máximo `maxBeats`, el último termina donde terminaba la original y todos entran `velDrop` más suave que la original. Sirve para colchones continuos sin sonido a órgano: 4 tiempos con `maxBeats 2.5, every 2` → 0–2,5 y 2–4 |
| `fade` | `trackId?, bars:[from,to]` y `fromVel+toVel` (absoluto) o `fromFactor+toFactor` (escala) |

### `measure_mix`

`{ ranges?, groups?, loop? }` + composición. Renderiza cada pista una vez a 0 dB (lineal) y devuelve el loudness integrado BS.1770 (LUFS, dentro de ~0,06 dB de ffmpeg) para:
- `tracks.<id>`: `total` y un valor por rango;
- `groups.<nombre>`: la suma de sus pistas;
- `mix`: la mezcla completa.

Todo comparte ganancia: las diferencias entre números son diferencias reales de volumen. Si una pista queda por debajo de la compuerta de -70 LUFS de BS.1770, el valor se informa sin compuerta (puede ser menor a -70) y se marca en `belowGate` (`{total, ranges[]}`); `null` significa silencio digital. Sin `ranges`, mide cada sección. Sirve para la regla de balance: pianos 3–4 dB por encima de guitarra y cuerdas juntas.

### `export_audio`

`{ name, loop?, lufs=-18, gainDb?, trackIds?, ritardando=2, clipFrom?, clipTo?, library? }` + composición.
- `library`: `"real"` (por defecto) usa las bibliotecas de samples reales; `"fluidr3"` usa los soundfonts General MIDI de antes, para reproducir renders viejos o comparar. `measure_mix` acepta el mismo campo. El resumen devuelve qué biblioteca se usó.
- `name`: ruta dentro de `exports/`, con subcarpetas (`mi-juego/ch1/01_exploration`).
- `loop`: loop sin costura. La cola se suma al principio y el WAV lleva un chunk `smpl` que Godot detecta solo (*Detect From WAV*). También escribe `_preview_2x.mp3` para escucharlo dos veces seguidas.
- `lufs`: ganancia lineal hasta ese loudness. `gainDb`: ganancia fija; úsala con la `gainDb` que devolvió la mezcla para exportar capas con `trackIds` que sumen exacto.
- `truePeakDb` (default `-1.0`): techo de pico real en dBTP. Un limitador con lookahead y sobremuestreo 4x actúa después de la ganancia de loudness; en los loops trata el borde como circular, así la unión no cambia. El resultado trae `truePeakDb: {ceilingDb, wav, ogg, maxReductionDb, withinCeiling}` medido sobre los archivos finales; si el OGG se pasa (el encoder suma ~0,1 dB), se vuelve a limitar más abajo. `null` lo desactiva. Las capas (`trackIds`) no se limitan salvo que se pida, porque un limitador por capa rompería la suma exacta con la mezcla.
- `credits.instruments` (y cada `_CREDITS.txt`): licencia y fuente **por instrumento y por sample concreto** que sonó en ese archivo: `[{trackId, instrumentId, kind: samples|soundfont|synthesized, library, license, licenseUrl, attributionRequired, samples: [{file, sha256, sourceUrl, licenseFile}]}]`. `file` es relativo a `sound-libraries/` y `licenseFile` es el archivo de licencia de la biblioteca que lo cubre. Los stems listan sólo lo suyo.
- Todo export devuelve además `silence: {headSec, tailSec, thresholdDb}` (silencio de cabeza y cola, umbral -60 dBFS por muestra) de la mezcla y de cada stem, `fileInfo: {ruta: {sha256, bytes}}` de cada archivo escrito, y escribe `<name>_waveform.png` (forma de onda de la mezcla, canales separados).
- `fadeOutSec` (sólo sin loop): fundido de salida coseno² sobre los últimos N segundos, después del limitador (y del recorte de `maxTailSilenceSec`). Junto con `clipTo` sirve para remates y clips de A/B: un golpe final con crash que resuena 10 s se deja en 5 s con `clipFrom: 0, clipTo: 5, fadeOutSec: 1.5`. Los stems reciben la misma curva.
- `busCompression` (`"auto"` por defecto, `true` o `false`): compresor de bus, el "pegamento" de una banda grabada. Detector RMS estéreo enlazado, umbral -20 dBFS sobre la señal ya normalizada, relación 2,5:1 con rodilla suave, ataque de 15 ms y relevo de 250 ms. En los loops el borde se trata como circular. La misma curva de ganancia se aplica a cada stem, así `sumCheck` sigue exacto, y el loudness se vuelve a llevar al objetivo. En `auto` sólo se activa si suena `metal_guitar`, `electric_guitar`, `electric_bass` o `metal_drums`, así los renders orquestales ya aprobados no cambian. El resultado trae `busComp: {mode, maxReductionDb}`.
- `maxTailSilenceSec` (sólo sin loop): después de la ganancia de loudness y del limitador, recorta el final para que el silencio de cola (< -60 dBFS, el mismo umbral que `silence`) quede en ese valor menos 0,1 s, con un fundido coseno de 0,3 s dentro de ese silencio (no toca nada audible). Los stems se recortan en el mismo sample, así que `sumCheck` sigue exacto. En loops se ignora. Ej.: `1.0` deja `silence.tailSec` ≈ 0,9.
- `stemGroups` (`{"grupo": [trackIds]}`): en una sola llamada exporta la mezcla y un stem por grupo (`<name>_<grupo>.wav/.ogg/...`, cada uno con su `_CREDITS.txt`). Cada stem recibe la misma ganancia de loudness y la misma curva de ganancia del limitador de la mezcla, sample a sample, y termina en el mismo sample que la mezcla: la suma da la mezcla aunque el limitador actúe. Las pistas que no estén en ningún grupo van a un stem `other` automático. El resultado agrega `stems: [{group, trackIds, files, lufs, peakDbfs}]` y `sumCheck: {maxDiffLsb, maxDiffDbfs, bits, stems, exact}` (máxima diferencia entre la suma de los WAV y el WAV de la mezcla; cada archivo redondea a 16 bits por separado, así que hasta ~0,5 LSB por stem es inevitable). No se combina con `trackIds` y necesita el limitador (`truePeakDb` no puede ser `null`).
- `clipFrom`/`clipTo` (segundos): exporta un tramo, sin marcas de loop, para comparaciones A/B al mismo loudness.
- **Créditos:** cada exportación detecta qué bibliotecas sonaron y escribe `<name>_CREDITS.txt` junto al audio, con el texto listo para copiar a los créditos del juego. El resultado trae `credits: {attributionRequired, libraries[{name, license, credit, instruments}], text, notice}`. Si `attributionRequired` es `true` (pianos Salamander, o celesta, coro y taiko de FluidR3, todos CC BY 3.0), el crédito **tiene que** aparecer en el juego, y la respuesta repite el aviso en un campo `notice` de primer nivel. **Si sos un agente de IA, transmitile ese aviso al usuario.** Solo CC0 o caja musical: no hace falta crédito.
- Escribe `.wav`, `.ogg`, `.mp3` (o el preview), `.mid` y `.json`. Devuelve `files, seconds, frames, lufs, peakDbfs, gainDb, sections[{name, bars, lufs}]` y, en loops, `seamJump` y `seamJumpVsP99Step`: menos de 1 significa que el salto de la costura es menor que el paso normal entre muestras, o sea, sin clic.

### Efectos de sonido: `search_sfx` y `export_sfx`

Trabajan sobre una biblioteca de efectos propia: la carpeta de `KHIMEA_SFX_LIBRARY`, con su `CATALOGO.tsv` (columnas `categoria`, `carpeta`, `archivo`, `extension`, `kb`, `segundos`). La biblioteca no se copia. Si la carpeta tiene un `LICENSE.json` (`name`, `license`, `licenseUrl`, `attributionRequired`, `proof`), esos datos van al `_CREDITS.txt` de cada export. Revisá la licencia de tus efectos antes de publicar.

- `search_sfx` `{ query?, category?, maxSec?, limit=25 }`: cada palabra de `query` tiene que aparecer en la ruta. Devuelve `{total, results: [{source, category, seconds, kb}]}`.
- `export_sfx` `{ source, name, clipFrom?, clipTo?, trim=true, fadeIn=0, fadeOut=0.02, lufs=-18, peakDb?, truePeakDb=-1, pitch=0, variations=1, variationPitch=1, variationGain=1.5, seed=1, mono? }`:
  - Pasos: recorta el silencio de cabeza y cola (-60 dBFS) y aplica los fundidos.
  - Nivel: los sonidos de 0,4 s o más se nivelan por LUFS integrado. Los más cortos, o si se pasa `peakDb`, se nivelan por pico (-3 dBFS por defecto).
  - Al final pasa por el limitador de pico real.
  - `variations: N` escribe `name`, `name_v2`, … con un tono (±`variationPitch` st) y un nivel (±`variationGain` dB) al azar. El resultado es determinista para una misma `seed`.
  - Archivos: escribe `.wav`, `.ogg` y `_CREDITS.txt` (fuente, sha256 del original y licencia) en `exports/<name>`.
  - Devuelve, por archivo, `seconds, lufs, truePeakDb, limiterReductionDb, headSec, tailSec, pitchSemitones, sha256Ogg`.
  - `mono: true` sirve para sonidos posicionales 3D.

### Otras

`validate_composition`, `create_variation` (conserva notas; cambia tempo y modo), `list_instruments`, `get_music_knowledge`. `create_composition` genera una melodía al azar.

## Instrumentos y límites del render

Con `library: "real"` (por defecto) se usan samples reales, todos aptos para uso comercial en juegos (créditos en `exports/CREDITS.md`):

| instrumentId (contiene) | Biblioteca | Notas |
|---|---|---|
| `piano` (`felt_piano`, `cinematic_grand_piano`) | Salamander Grand Piano V3, 16 capas de intensidad | Para ganar presencia a velocidades suaves, elige capas grabadas algo más fuertes (el volumen sigue la velocidad) y realza los agudos. `felt_piano` queda un poco más cálido que el de cola |
| `violin_solo`, `violin`, `viola`, `cello` | VSCO 2 CE (solo y sección) | Con `articulation: "pizzicato"` usan su variante pizzicato |
| `contrabass`, `harp`, `flute`/`woodwind`, `oboe`, `clarinet`, `horn`, `trombone`, `timpani` | VSCO 2 CE | |
| `guitar` (`nylon_guitar`) | FreePats Spanish Classical Guitar | |
| `celesta`, `choir`, `taiko` | FluidR3 (no hay equivalente con licencia libre) | |
| `recorder` | VCSL: flautas dulces barrocas (alto, soprano, tenor, bajo) | Sostenidas, 41-86 |
| `renaissance_organ` (o cualquier id con `organ`) | VCSL: órgano renacentista, registro de 8' | 24-84 |
| `folk_harp` | VCSL: arpa folk/celta, 2 capas | 24-84 |
| `psaltery` / `bowed_psaltery` | VCSL: salterio pulsado / con arco | 55-81 |
| `harpsichord` | VCSL: clave italiano | 21-84 |
| `dulcimer` (o `strumstick`) | VCSL: strumstick de dedo, 3 capas | 38-72 |
| `bagpipe` | FreePats: gaita en Sol | Notas 36-59: bordones (G2/G3); 64-81: puntero |
| `acoustic_lute` (o cualquier id con `lute`) | Laúd español de Toni Bellinte si está en `sound-libraries/lute/`; si no, la guitarra FreePats | El laúd pide crédito (CC BY 3.0) |
| `frame_drum` | VCSL: pandero (kit) | 36 grande, 37 grande apagado, 38 grande con la mano, 40 chico, 41 chico apagado, 42 chico con la mano |
| `darbuka` | VCSL (kit) | 36-40: cinco golpes distintos |
| `tabor` | VCSL: tambor de cuerdas (kit) | 36 grave con bordonera, 37 grave sin, 38 agudo, 39 grave tenso, 40 baqueta, 41 aro |
| `tambourine` | VCSL (kit) | 36 golpe, 37 redoble, 38 sacudida |
| `finger_cymbals` | VCSL: crótalos | 36 |
| `contrabass_section` + `articulation: "pizzicato"` | VSCO 2 CE: contrabajo pizzicato | Bajo tipo jazz/upright |
| `vibraphone` | VCSL: vibráfono, baquetas blandas (sin motor) | 45-89 aprox. |
| `glockenspiel` | VSCO 2 CE | Agudo, usar con moderación |
| `accordion` | FreePats: acordeón a botones Hohner | Lengüeta libre; lo más cercano a un armonio que hay con licencia libre |
| `shaker` | VCSL (kit) | 36 golpe grande, 37-38 sacudida grande abajo/arriba, 40-41 doble abajo/arriba, 42-43 agudo rápido abajo/arriba, 44-45 grave rápido abajo/arriba, 46 golpe seco, 47 redoble |
| `brush_kit` (o `drum_kit`) | Karoryfer Swirly Drums, tocada con escobillas (kit) | 36 bombo, 37 flutter, 38 golpe de escobilla, 39 barrido (sweep), 40 toque en el borde, 42 hi-hat cerrado, 44 hi-hat con pedal, 46 hi-hat abierto, 51 ride |
| `music_box` | Sintetizada en el renderizador | Calibrada para quedar entre el arpa y la celesta |
| `metal_guitar` | FreePats FSBS Electric Guitar Direct (DI, CC0) + amp simulado del estudio | Guitarra eléctrica directa por un amp de alta ganancia (realce de medios, dos etapas de saturación sobremuestreadas, stack de tono), bafle 4x12 simulado y noise gate. El amp se aplica a la pista entera: los acordes de quinta (raíz + 5ª + 8ª en la misma pista) distorsionan juntos. `articulation: "staccato"` = palm mute (chug seco). Para un muro estéreo: dos pistas con las mismas notas, `pan` -0.8 y +0.8 (cada una toma otros round-robins). Rango 35-86 (afinaciones graves hasta C2). No se calibra contra FluidR3: el amp fija el nivel |
| `electric_guitar` | Misma guitarra DI + amp limpio | Guitarra eléctrica limpia |
| `tubular_bells` (o `church_bell`, `funeral_bell`) | VCSL: campanas tubulares, 2 capas | Castillo, iglesia, campana fúnebre. Suenan enteras. 48-70 |
| `hand_chimes` | VCSL | Campanillas sostenidas, frías y vidriosas (nieve/hielo). 48-86 |
| `bell_tree` | VCSL | Golpes afinados de árbol de campanas (destellos, esporas). 72-82 |
| `kalimba` (o `mbira`) | VCSL: kalimba de Kenia | Pulsado orgánico de madera (cueva). 47-86 |
| `bowed_vibraphone` | VCSL | Vibráfono con arco: notas vidriosas sostenidas, inquietantes. 45-77 |
| `pipe_organ` / `pipe_organ_soft` | VCSL: órgano de tubos (Ivy Audio), registro abierto fuerte / suave | Salón de castillo, catedral, gótico; el suave sirve para drones rituales. 24-96 |
| `wood_perc` | VCSL (kit) | 36 slit/log drum grave, 37 agudo, 38 woodblock con dinámica: maderas huecas, tipo hueso |
| `bells_kit` | VCSL (kit) | 36/37/38 yunque (industrial), 40 cascabeles golpe, 41 cascabeles sacudida, 42 cascabeles golpe 2, 44/45/46 campanas de mano nepalesas (ritual), 48 árbol de campanas (barrido) |
| `wind_texture`, `cave_drips` | Sintetizadas (sin samples) | Texturas sostenidas como `room_tone`: viento frío con ráfagas / gotas de cueva con eco. Una nota = textura durante toda su duración |
| `retrowave_drums` / `synthwave_drums` / `darkwave_drums` | Function Loops (biblioteca comercial, opcional: sin ella se usan sonidos de reemplazo) | Kits GM de golpes sueltos. retrowave: 35/36 bombo, 37/38/39/40 cajas (38 gated), 41/43/45/47/48/50 toms de grave a agudo, 42/44 hi-hat cerrado, 46 abierto, 49/57 crash. synthwave: 35/36 bombo, 38/40 caja, 39 clap, 42/44 hi-hat, 46 abierto, 41/43/45/47 toms, 49/57 crash, 54 pandereta, 67 agogó, 70 shaker. darkwave: 35/36 bombo, 37/38/40 caja, 39 clap, 42/44 hi-hat, 46 hi-hat largo, 49 crash, 51 platillo |
| `retro_bass`, `retro_lead`, `retro_synth` (+ `_<patch>`) | Function Loops (biblioteca comercial, opcional) | One-shots de sinte retro mapeados desde su altura medida, sin loop: si la nota dura más que el sample se apaga natural. Patches: bajo (analog, chrome, cyber, dark, deep, dirty, drive, electric, heavy, magnetic, midnight, neon, noir, obsidian, pulse, retro, shadow, static, subzero, thick; default analog), lead (bright, chrome, crystal, digital, electric, flash, glowing, laser, neon, plasma, radiant, sharp, sonic, turbo, vivid; default digital), synth (analog, chrome, crystal, dark, dreamy, electric, midnight, neon, retro, soft; default neon). Ej.: `retro_bass_dirty` |
| `zurna` (o `mizmar`) | Karoryfer Squidpipes (CC0): caña doble real grabada nota por nota, sin bordón | El color de zurna/mizmar más cercano con licencia libre (no hay ney ni oud libres de calidad: investigado el 2026-10-09). Altura real 55-96 (Sol3-Do7). Líneas monofónicas con ornamentos Hijaz |
| `choir_pad` | FreePats Synth Pad Choir (CC0), sintético | Pad de coro (no son cantantes reales): debajo de `low_male_choir` / `ethereal_female_choir` (FluidR3, CC BY 3.0) suma cuerpo y sostén. No hay coros reales mejores con licencia CC0/CC-BY (investigado el 2026-10-09: los buenos son pagos, Sampling+ o SA) |
| `electric_bass` | Karoryfer Black And Blue Basses, bajo de 5 cuerdas con púa (CC0) | 2 dinámicas (0-79 / 80-127), 4-6 round-robins, drive de bajo leve. **Altura real**: 23 = Si grave, 28 = Mi grave (una octava debajo de la escritura de bajo) |
| `metal_drums` | Wilkinson Audio Naked Drums (CC BY 4.0, **crédito obligatorio**), programa GM, micrófonos cercanos + aéreos | 36 bombo, 37 aro, 38/40 caja, 41/43/45/47/48 toms, 42 hi-hat tight, 54 cerrado, 56 medio, 46 abierto, 44 pedal, 49/57 crash, 58/59 campana de crash, 51 ride, 53 campana de ride, 52 china, 55 splash. Hasta 5 capas de velocidad y 10 round-robins: el doble bombo rápido no suena a ametralladora. Los golpes suenan enteros (one-shot). Mezcla mono (los samples se cargan en mono) |
| `brass_trumpet` (o cualquier id con `trumpet`) | VSCO 2 CE: trompeta solista, sostenida sin vibrato, 2 capas (0-62, 63-127) | 52-84 (F3-C6). Calibrada contra el corno; sin samples reales cae en el corno de FluidR3 |
| `snare_drum` (o cualquier id con `snare`) | VCSL: redoblante de concierto (kit) | 37 golpe sin bordonera, 38 golpe (5 capas), 39 redoble, 40 redoble sin bordonera, 41 clic de baquetas, 42 toques suaves, 43 flam |
| `military_drum` | VCSL: tambor de campaña con tensión de cuerdas (kit) | 36 grave, 37 grave sin bordonera, 38 agudo, 39 redoble (el del redoblante de concierto), 40 clic de baquetas, 41 aro, 42 grave tenso, 43 flam |
| `suspended_cymbals` (o ids con `suspended_cymbal` / `crash_cymbal`) | VCSL: platillo suspendido + platillos de choque (kit) | 48 platillos de choque apagados, 49 platillos de choque a dos manos (pp-ff), 51 platillo suspendido con maza blanda (pp-fff), 52 con baqueta, 53 campana, 55 redoble, 56/57/58/59 swells (crescendo) de ~1,5/2/4/7,5 s, 60 con arco, 61 raspado |
| `bass_drum_impacts` (o cualquier id con `bass_drum`) | VCSL: bombo de concierto (kit) | 36 golpe (5 capas pp-ff), 37 redoble, 38 redoble rápido, 39 crescendo corto, 40 crescendo medio |
| `tam_tam` (o `gong`) | VCSL: gong grande (kit) | 36 golpe (p, mf, f, fff), 37 segundo gong (mp, f), 38 raspado |
| `upright_piano` | VSCO 2 CE, Upright Piano de Ivy Audio (Simon Dalzell), 3 capas (0-60, 61-110, 111-127) con round-robin | Piano vertical de casa: más cálido y con más cuerpo que `felt_piano` (centroide ~500 Hz contra ~850 Hz). Calibrado por altura contra la misma referencia que `felt_piano`, así cambiar uno por el otro conserva la mezcla; la curva de velocidad es más empinada (35 → 120 = 17 dB), a velocidad 40 queda ~2 dB más suave que el felt. Ruido de fondo de los samples ~-83 dBFS |
| Percusión orquestal: cómo suena | | **Golpes** (todo salvo los redobles): suenan enteros aunque la nota sea corta (platillos y gong hasta 15-30 s); la duración escrita no los corta y el render deja 15 s de cola si los hay. **Redobles** (redoblante 39/40, platillo 55, bombo 37/38): duran lo que la nota, con fundido de salida; si la nota es más larga que el sample (7-36 s), se repite con fundido cruzado. **Swells** (platillo 56-59, bombo 39/40): son one-shot; el pico llega ~1,5/2/4/7,5 s después del inicio de la nota, así que hay que adelantarlos. **Flam** (43): golpe de gracia ~8 dB más suave y el principal 25 ms después. Capas: velocidad 1-127 repartida en partes iguales entre las dinámicas grabadas |
| `tape_hiss`, `cassette_hiss`, `room_tone`, `vinyl_crackle` | Sintetizadas en el renderizador (sin samples, sin crédito) | Texturas de ruido sostenido: una nota = ruido durante toda su duración, la altura se ignora (usar 60). Fundidos de potencia constante de 0,4 s al entrar y salir: una nota que cubre todo el loop no deja costura. Velocidad lineal (64 = -6 dB respecto de 127); a velocidad 64 y volumen 0.8 miden ~-46 LUFS antes de la ganancia de loudness, unos 15-20 dB por debajo de un piano suave. Todas miden lo mismo a igual velocidad. Estéreo descorrelacionado; `pan` actúa como balance. Sin wow/flutter de altura: `cassette_hiss` sólo tiene una deriva leve de nivel |

- **Percusión (kits):** cada nota MIDI es un golpe distinto y nunca se transpone. Una nota fuera del mapa usa el golpe más cercano. En los kits, la duración de la nota importa: un barrido (39) dura lo que dure la nota.

- **Nivel:** cada instrumento real está calibrado por altura contra su equivalente FluidR3 (`scripts/calibration.json`), para que las mezclas existentes no cambien de golpe. Aun así, el sonido real sostiene y resuena distinto: conviene revisar el balance con `measure_mix` después de cambiar de biblioteca.
- **Notas largas:** los sostenidos reales de cuerdas y vientos duran entre 6,5 y 24 s, así que el aviso `sustain` salta recién a partir de 6 s. El coro sigue con FluidR3 (samples de ~3,1 s): para él el límite es 2,4 s. `limit_duration` y `restrike` siguen disponibles para frasear.
- **Pizzicato:** existe en violín, violas, cellos y contrabajo.
- **Sin equivalente libre (CC0/CC-BY):** piano eléctrico (el único gratuito, jRhodes3d, tiene samples CC BY-NC y se descartó), armonio (se ofrece el acordeón), guitarra de acero (la de FreePats es GPL con excepción) y zanfona (MidiGurdy es CC BY-SA).
- **Reproducción dentro de la app:** es una aproximación sintetizada en el navegador. El sonido real está en lo que exporta `export_audio`.
