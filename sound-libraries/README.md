# Bibliotecas de samples

`scripts/render_audio.py` las usa para exportar con sonido real (`library: "real"`, el valor por defecto). Si esta carpeta falta, el renderizador vuelve a los soundfonts FluidR3 de `public/`. Pesan unos 2,6 GB (VSCO 1,2 GB, Salamander 1,4 GB, guitarra 20 MB), más la caché de samples decodificados (~0,9 GB), y no se sirven al navegador.

| Carpeta | Biblioteca | Licencia |
|---|---|---|
| `vsco2/` | [VSCO 2 Community Edition](https://github.com/sgossner/VSCO-2-CE), rama `SFZ`, solo los instrumentos que usa la app | CC0 1.0 |
| `salamander/` | [Salamander Grand Piano V3](https://github.com/sfzinstruments/SalamanderGrandPiano) (FLAC, 16 capas de intensidad) | CC BY 3.0: crédito obligatorio |
| `guitar/` | [FreePats Spanish Classical Guitar](https://freepats.zenvoid.org/Guitar/acoustic-guitar.html) (SFZ + WAV, 2019-06-18) | CC0 1.0 |
| `vcsl/` | [Versilian Community Sample Library](https://github.com/sgossner/VCSL), solo los instrumentos medievales y de época que usa la app (WAV sueltos; las zonas se arman por nombre de archivo) | CC0 1.0 |
| `bagpipe/` | [FreePats Bagpipe](https://freepats.zenvoid.org/Ethnic/bagpipe.html) (SFZ + WAV, 2026-08-06) | CC0 1.0 |
| `swirly/` | [Karoryfer Swirly Drums](https://github.com/sfzinstruments/karoryfer.swirly-drums), sólo las carpetas del kit de escobillas | CC0 1.0 |
| `accordion/` | [FreePats Button Accordion HN](https://freepats.zenvoid.org/Organ/accordion.html) (SFZ + WAV, 2024-03-29) | CC0 1.0 |
| `eguitar/` | [FreePats FSBS Electric Guitar Direct](https://freepats.zenvoid.org/ElectricGuitar/clean-electric-guitar.html) (SFZ+FLAC, 2022-09-11), guitarra eléctrica sin amplificar | CC0 1.0 |
| `bass/` | [Karoryfer Black And Blue Basses](https://github.com/sfzinstruments/karoryfer.black-and-blue-basses), sólo el bajo con púa (`Samples/babyblue/reg`) | CC0 1.0 |
| `nakeddrums/` | [Wilkinson Audio Naked Drums](https://github.com/sfzinstruments/WilkinsonAudio.NakedDrums) (SFZ ARIA + FLAC, 1,3 GB; se borró su `.git` para ahorrar disco: se re-baja con `git clone --depth 1`) | CC BY 4.0: crédito obligatorio |
| `ir/cab/` | [Jester's Brutal Pack](https://www.jester-dyne-productions.com/content/files/2023/04/JestersBrutalPack_1.0.zip), IRs de bafle 4x12 (se usa `1_Cookie_Monster_44.wav`: V30 + SM57) | CC0 1.0 (manual del pack) |
| `functionloops/` | Function Loops, Ultimate SFX for Games (biblioteca comercial, **opcional**: sin ella los instrumentos retro usan sonidos de reemplazo): golpes sueltos de batería Neon Highway, Darkwave y Retrowave, y one-shots de sinte Retrowave | EULA de Function Loops: royalty-free, **no se redistribuyen los samples sueltos** (no subir esta carpeta a ningún lado) |
| `squidpipes/` | [Karoryfer Squidpipes](https://github.com/sfzinstruments/karoryfer.squidpipes) (v1.001), caña doble: se usa `Samples/long_clean` como zurna | CC0 1.0 |
| `sfx/voices/` | Gritos para SFX (OpenGameArt): ver `sfx/voices/SOURCES.md` | CC0 / CC-BY 3.0 |
| `lute/` | [Laúd español de Toni Bellinte](https://musical-artifacts.com/artifacts/8452) (SF2). **Se baja a mano** (ver abajo). Sin él, `acoustic_lute` usa la guitarra | CC BY 3.0: crédito obligatorio |
| `.cache/` | Samples decodificados a mono 44,1 kHz (`.npy`), para no decodificar en cada render | Se regenera sola; se puede borrar |

El texto de créditos para el juego está en [`exports/CREDITS.md`](../exports/CREDITS.md).

## Volver a descargarlas

```bash
cd sound-libraries
git clone --depth 1 --branch SFZ --filter=blob:none --sparse https://github.com/sgossner/VSCO-2-CE.git vsco2
cd vsco2
MSYS_NO_PATHCONV=1 git sparse-checkout set --no-cone '/*.sfz' '/LICENSE' '/README.md' '/Readme.txt' \
  '/Strings/Solo Violin/Arco Vib/' '/Strings/Solo Violin/Pizz/' '/Strings/Violin Section/susVib/' \
  '/Strings/Violin Section/Pizz/' '/Strings/Viola Section/susvib/' '/Strings/Viola Section/pizz/' \
  '/Strings/Cello Section/susvib/' '/Strings/Cello Section/pizzT/' '/Strings/Solo Contrabass/SusVib/' \
  '/Strings/Harp/' '/Woodwinds/Flute/susvib/' '/Woodwinds/Oboe/Vib/' '/Woodwinds/Clarinet/susLong/' \
  '/Brass/F Horn/sus/' '/Brass/Tenor Trombone/sus/' '/Percussion/Timpani/'   '/Strings/Solo Contrabass/Pizz/' '/Percussion/Glock/' '/Keys/Upright Piano/' '/Brass/Trumpet/sus/'
cd ..
git clone --depth 1 --filter=blob:none https://github.com/sfzinstruments/SalamanderGrandPiano.git salamander
curl -L -o guitar.7z https://freepats.zenvoid.org/Guitar/SpanishClassicalGuitar/SpanishClassicalGuitar-SFZ-20190618.7z
7z x -oguitar guitar.7z && rm guitar.7z
```

Instrumentos medievales (VCSL, gaita):

```bash
git clone --depth 1 --filter=blob:none --sparse https://github.com/sgossner/VCSL.git vcsl
cd vcsl
MSYS_NO_PATHCONV=1 git sparse-checkout set --no-cone '/LICENSE' '/README.md' \
  '/Aerophones/Edge-blown Aerophones/Baroque Soprano Recorder/Sustain/' '/Aerophones/Edge-blown Aerophones/Baroque Alto Recorder/Sustain/' \
  '/Aerophones/Edge-blown Aerophones/Baroque Tenor Recorder/' '/Aerophones/Edge-blown Aerophones/Baroque Bass Recorder/' \
  "/Aerophones/Edge-blown Aerophones/Renaissance Organ/8'/" '/Chordophones/Composite Chordophones/Folk Harp/' \
  '/Chordophones/Composite Chordophones/Strumstick/' '/Chordophones/Zithers/Psaltery, Bowed and Plucked/Pluck/' \
  '/Chordophones/Zithers/Psaltery, Bowed and Plucked/LongBow/' '/Chordophones/Zithers/Harpsichord, Italian/Sustains/' \
  '/Membranophones/Struck Membranophones/Frame Drum/' '/Membranophones/Struck Membranophones/Darbuka/' \
  '/Membranophones/Struck Membranophones/Snare Drum, Rope Tension/' '/Idiophones/Struck Idiophones/Tambourine 1/' \
  '/Idiophones/Struck Idiophones/Finger Cymbals/'
# Cap. 2 (shaker, vibráfono) y percusión orquestal (redoblante, platillos, bombo, gong):
MSYS_NO_PATHCONV=1 git sparse-checkout add '/Idiophones/Struck Idiophones/Shaker, Small/'   '/Idiophones/Struck Idiophones/Shaker, Large/' '/Idiophones/Struck Idiophones/Vibraphone/'   '/Membranophones/Struck Membranophones/Snare Drum, Modern 1/' '/Idiophones/Struck Idiophones/Suspended Cymbal 1/'   '/Idiophones/Struck Idiophones/Clash Cymbals 1/' '/Membranophones/Struck Membranophones/Bass Drum 2/'   '/Idiophones/Struck Idiophones/Gong 1/'
cd ..
curl -L -o bagpipe.7z https://github.com/freepats/bagpipe/releases/download/2026-08-06/Bagpipe-SFZ+WAV-20260806.7z
7z x -obagpipe bagpipe.7z && rm bagpipe.7z
```

**Laúd español (a mano):** Musical Artifacts bloquea las descargas automáticas. Abrí https://musical-artifacts.com/artifacts/8452 en el navegador, bajá `La_d_Espa_ol.sf2` y guardalo como `sound-libraries/lute/Laud_Espanol.sf2`. Después corré `python scripts/calibrate_libraries.py` para calibrar su nivel. Al exportar con laúd, el aviso de créditos pide el crédito de Toni Bellinte.

`MSYS_NO_PATHCONV=1` hace falta en Git Bash de Windows: sin eso, convierte las rutas que empiezan con `/` en rutas de Windows.

## Cómo se usan

- `scripts/sample_libraries.py` lee los SFZ de VSCO y FreePats (zonas por nota e intensidad, volumen, afinación, envolvente, round-robin y azar) y mapea Salamander por nombre de archivo. En la tabla `MAPPING` está qué `instrumentId` de la app usa cada instrumento; las cuerdas con articulación `pizzicato` usan su variante pizzicato.
- `TONE` en `sample_libraries.py` ajusta el timbre por instrumento. A las velocidades suaves de estas piezas, Salamander usa sus capas más suaves, más opacas que el sample único de FluidR3; para compensar, elige capas algo más fuertes sin cambiar el volumen y realza los agudos desde 2,5 kHz (piano de cola +5 dB, fieltro +3,5 dB, guitarra +2,5 dB).
- `scripts/calibration.json` guarda el ajuste de nivel por instrumento y altura: a igual velocidad, cada instrumento real suena como su equivalente FluidR3, así las mezclas existentes no se desbalancean. Se regenera con `python scripts/calibrate_libraries.py`.
- Sin equivalente con licencia libre, la celesta, el coro y el taiko siguen con FluidR3. La caja musical es sintetizada.
- No hay zanfona: los únicos samples libres que encontré (MidiGurdy) son CC BY-SA, y esa licencia no cumple la regla de usar solo CC0 o CC-BY.
- Percusión VCSL: `kit_regions` asigna un golpe por nota MIDI, sin transponer (mapas en `docs/API.md`).
