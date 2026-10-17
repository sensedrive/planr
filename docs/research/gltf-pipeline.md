# Recherche: glTF-Pipeline aus Blender (KTX2, Meshopt/Draco, Normal-Maps, gebackene AO)

Stand 2026-10-17, zu Issue #7. Frage: Was braucht die Engine (`src/engine/render/meshes.ts`, `src/engine/shaders/mesh.ts`, `src/engine/gl/device.ts`), um glTF-Modelle aus Blender zu laden und zu zeichnen? Gemeint sind KTX2/Basis-Texturen, Meshopt- oder Draco-Kompression, Normal-Maps und gebackene AO/Lightmap auf der zweiten UV.

Quellen: Code im Repo als `datei:zeile`. three.js-Zitate stammen aus dem npm-Paket `three@0.186.1`, also genau der Version aus `package.json` (Pfade relativ zum Paket). Dazu kommen die Khronos-Spezifikationen, Meta-Doku, die Blender-Exporter-Doku (glTF-Blender-IO, `docs/blender_docs/scene_gltf2.rst`) und die Quellen von `@gltf-transform/cli`/`functions` 4.5.1.

## Kurzfassung

1. **Laden geht mit three.js, Zeichnen nicht.** `GLTFLoader` + `KTX2Loader` + `MeshoptDecoder` (+ optional `DRACOLoader`) aus three 0.186.1 können alles Nötige. Am Ende stehen `MeshStandardMaterial`s mit `normalMap`, `aoMap` (auf `texture.channel = 1`), `metalnessMap`/`roughnessMap` und `CompressedTexture`s. Unser `MeshRenderer` wertet davon heute nur `map` und `emissiveMap` aus. Komprimierte Texturen und quantisierte Vertexdaten würde er falsch oder gar nicht hochladen.
2. **Drei harte Lücken in der Engine:**
   - Upload von komprimierten Texturen: kein ASTC/ETC2, keine vorgefertigten Mip-Ketten.
   - Vertex-Attribute: kein `tangent`, kein `uv1`, und normalisierte Int8/Int16-Attribute werden falsch skaliert.
   - Shader: keine Normal-Map, kein AO/Lightmap auf UV1, kein ORM.
3. **Auf der Quest** transcodiert der KTX2Loader UASTC nach ASTC 4×4 und ETC1S nach ETC2. Meta empfiehlt KTX2/Basis für WebXR und ASTC für den Speicher. Budgets: < 100 Draw Calls / < 750 K Dreiecke (Quest 2), < 200 / < 1,5 M (Quest 3). Speicherlimit 4,4 GiB (Quest 2) bzw. 5,75 GiB (Quest 3/3S).
4. **Pipeline:**
   - Blender exportiert GLB mit UVs, Normalen und Tangenten, die AO über die Node-Gruppe „glTF Material Output“ auf einer zweiten UV-Map.
   - Danach `gltf-transform` (Meshopt plus KTX2 über `ktx create` aus KTX-Software ≥ 4.4.0; `toktx` ist abgelöst).
   - **Meshopt statt Draco** empfohlen.
5. **Lightmap:** glTF hat kein Lightmap-Feld, und der GLTFLoader setzt nie `lightMap`. Graue AO geht standardkonform über `occlusionTexture` mit `texCoord: 1`. Eine farbige Lightmap bräuchte eine eigene Konvention (extras/Plugin).

## 1. Reicht three.js 0.186.1 zum Laden?

Ja. `package.json` pinnt `three` auf `0.186.1` (`package.json:15`). In dieser Version gilt:

- **Unterstützte Erweiterungen**, laut Kopfkommentar `examples/jsm/loaders/GLTFLoader.js:84-105`: `KHR_draco_mesh_compression`, `KHR_mesh_quantization`, `KHR_meshopt_compression`, `EXT_meshopt_compression`, `KHR_texture_basisu`, `KHR_texture_transform`, `KHR_materials_emissive_strength`, `KHR_materials_unlit`, `EXT_texture_webp` und weitere. Die beiden Meshopt-Varianten (EXT und KHR) sind beide verdrahtet (`GLTFLoader.js:238`, `:244`).
- **Decoder müssen vorher gesetzt werden**: `setDRACOLoader` (`GLTFLoader.js:349`), `setKTX2Loader` (`:363`), `setMeshoptDecoder` (`:377`). Ohne sie bricht der Loader ab (`:1479` „setKTX2Loader must be called before loading KTX2 textures“, `:1622` für Meshopt).
- **Attribut-Namen**: `TANGENT → 'tangent'`, `TEXCOORD_0 → 'uv'`, `TEXCOORD_1 → 'uv1'`, `COLOR_0 → 'color'` (`GLTFLoader.js:2277-2289`).
- **Zweite UV**: Hat eine Texturreferenz `texCoord > 0`, klont der Loader die Textur und setzt `texture.channel = texCoord` (`GLTFLoader.js:3448-3451`). Eine AO auf UV1 kommt also als `material.aoMap` mit `aoMap.channel === 1` an.
- **Material-Mapping** (`GLTFLoader.js`):
  - `metallicRoughnessTexture` geht auf **dieselbe** Textur als `metalnessMap` und `roughnessMap` (`:3643-3646`).
  - `normalTexture` wird `normalMap` mit `normalScale` (`:3693-3701`).
  - `occlusionTexture` wird `aoMap` mit `aoMapIntensity = strength` (`:3707-3713`).
  - `emissiveTexture` wird `emissiveMap` in sRGB (`:3726-3728`).
- **Fehlende Tangenten**: Hat die Geometrie kein `tangent`-Attribut, gilt `useDerivativeTangents` (`GLTFLoader.js:3498`), und der Loader **negiert `normalScale.y`** am geklonten Material (`:3564`). three rechnet dann die Tangentenbasis im Shader aus Ableitungen (`src/renderers/shaders/ShaderChunk/normalmap_pars_fragment.glsl.js:20-24`, `getTangentFrame` mit `dFdx`). Unser Shader muss dieses Vorzeichen genauso übernehmen, sonst kippen die Normal-Maps.
- **Bilder**: Der Loader nutzt `ImageBitmapLoader`, wo möglich (`GLTFLoader.js:2654-2660`), und setzt `texture.flipY = false` (`:3306`). Das passt zu unserem Upload, der `UNPACK_FLIP_Y_WEBGL` aus `t.flipY` setzt (`src/engine/render/meshes.ts:261`).
- **Interleaving**: Hat ein BufferView einen `byteStride`, entstehen `InterleavedBufferAttribute`s (`GLTFLoader.js:3188-3197`). `gltf-transform` schreibt standardmäßig interleaved (`@gltf-transform/cli src/cli.ts:1816`, `default: VertexLayout.INTERLEAVED`).

**KTX2Loader** (`examples/jsm/loaders/KTX2Loader.js`):

- `detectSupport(renderer)` liest bei WebGL nur `renderer.extensions.has(...)` bzw. `.get(...)`: `WEBGL_compressed_texture_astc`, `_etc`, `_etc1`, `_s3tc`, `EXT_texture_compression_bptc`, PVRTC (`:230-255`). Einen `WebGLRenderer` brauchen wir also nicht. Ein Shim `{ extensions: { has: n => !!gl.getExtension(n), get: n => gl.getExtension(n) } }` auf unserem Kontext reicht. Das ist abgeleitet aus dem Code, nicht dokumentiert.
- **Formatwahl** (`:793-860`):
  - UASTC → ASTC 4×4, wenn `astcSupported` (`:795-803`, `priorityUASTC: 1`).
  - Für ETC1S ist ASTC ausgeschlossen (`priorityETC1S: Infinity`, `:800`). ETC1S → `RGB_ETC2_Format`/`RGBA_ETC2_EAC_Format` mit Priorität 1 (`:825-833`).
  - Ist nichts davon da, gibt es ungepacktes RGBA32 als Rückfall (`:864-873`). Das kostet 4× so viel Speicher wie ASTC 4×4.
- **Ergebnis**: eine `CompressedTexture` mit fertiger Mip-Kette in `mipmaps[]`, `generateMipmaps = false` und Farbraum aus dem KTX-Header (`:431-458`).
- Der Transcoder liegt als `examples/jsm/libs/basis/basis_transcoder.{js,wasm}` im Paket und wird per `setTranscoderPath` geladen (`KTX2Loader.js:182`). Draco liegt unter `examples/jsm/libs/draco/`. `meshopt_decoder.module.js` bringt sein WASM eingebettet mit (`examples/jsm/libs/meshopt_decoder.module.js:6-15`) und braucht keine Zusatzdatei.
- Wie three die Formate auf GL-Enums abbildet (Vorlage für unser Device): ETC2 auf `COMPRESSED_(S)RGB8_ETC2` / `COMPRESSED_(SRGB8_ALPHA8|RGBA8)_ETC2_EAC`, ASTC auf `COMPRESSED_(SRGB8_ALPHA8|RGBA)_ASTC_4x4_KHR`, je nach Farbraum (`src/renderers/webgl/WebGLUtils.js:111-112`, `:138`). Upload pro Mip-Level per `compressedTexSubImage2D`/`compressedTexImage2D` (`src/renderers/webgl/WebGLTextures.js:1130-1136`).

Im Repo wird bisher kein Loader genutzt. Aus `three/examples/jsm` kommen nur `BufferGeometryUtils`, `RoundedBoxGeometry`, `VRButton` und die XR-Controller-Factories (`src/world/forest.ts:2`, `src/cockpit/interior.ts:2`, `src/main.ts:2`, `src/input/xrCockpit.ts:3-4`).

## 2. Was `meshes.ts` heute vom Material liest

Der `MeshRenderer` behandelt three.js als reine Szenengraph-Bibliothek. Jedes Pixel kommt aus unseren Shadern (`src/engine/render/meshes.ts:5-9`). Pro Draw liest `draw()`:

| three.js-Feld | Verwendung | Stelle |
|---|---|---|
| `map` + `map.matrix` (UV-Transform) | `u_map`, `u_uvTransform` | `meshes.ts:317-324` |
| `emissiveMap` | `u_emissiveMap` (auf UV0, mit Transform der `map`) | `meshes.ts:326-328`, `mesh.ts:141` |
| `color`, `opacity` | `u_color` | `meshes.ts:331-336` |
| `emissive`, `emissiveIntensity` (×1,2) | `u_emissive` | `meshes.ts:337-339` |
| `roughness` (Standard/Physical), `shininess` (Phong) | `u_material.x` | `meshes.ts:340-341` |
| `metalness`, `alphaTest` | `u_material.y/.w` | `meshes.ts:341` |
| `type` (Basic/Line/Points/Sprite ⇒ unlit) | `u_unlit` | `meshes.ts:330` |
| `flatShading` bzw. fehlende Normalen | `u_flat` | `meshes.ts:345` |
| `side`, `transparent`, `blending`, `depthTest`, `depthWrite`, `polygonOffset*`, `fog`, `toneMapped` | GL-State bzw. Faktoren | `meshes.ts:335`, `:346`, `:353-374` |
| `userData.foliage`, `userData.pull`, `userData.interior` (Vorfahre) | Spezialfälle | `meshes.ts:94`, `:343`, `:352` |

**Ignoriert** werden `normalMap`/`normalScale`, `aoMap`/`aoMapIntensity`, `lightMap`/`lightMapIntensity`, `metalnessMap`, `roughnessMap`, `alphaMap`, `texture.channel` und die UV-Transforms aller Texturen außer `map`. Für glTF-PBR heißt das: Faktoren ja, Texturen außer Basecolor/Emissive nein.

Passt schon zu glTF: `alphaMode: MASK` (wird `alphaTest`), `BLEND` (wird `transparent`), `doubleSided`, `COLOR_0` (immer gebunden, `meshes.ts:176`) und `KHR_materials_unlit` (wird `MeshBasicMaterial`, also unlit).

## 3. Vertex-Attribute: was fehlt und was falsch ist

- **Feste Slots** für alle Programme: `a_position, a_normal, a_uv, a_color, a_i0..a_i3, a_extra` (`src/engine/gl/device.ts:251`). Gebunden werden nur `position`, `normal`, `uv`, `color` (`meshes.ts:173-176`). Der Shader deklariert dieselben vier (`src/engine/shaders/mesh.ts:4-7`). **`tangent` und `uv1` fehlen** in Slot-Liste, VAO-Aufbau und Shader.
- Der Versions-Schlüssel, der den VAO-Neubau auslöst, kennt auch nur diese vier Attribute (`meshes.ts:141`). Neue Attribute müssen dort hinein.
- **Alles wird nach Float32 kopiert** (`meshes.ts:159-171`, `vertexAttribPointer(..., gl.FLOAT, false, ...)`). Quantisierte Daten belegen dadurch auf der GPU wieder 4 Byte pro Komponente. Den Speichergewinn aus Quantisierung/Meshopt gibt es so nur beim Download.
- **Fehler bei quantisierten Daten (`KHR_mesh_quantization`):**
  - `gltf-transform quantize`/`meshopt` schreiben POSITION und NORMAL/TANGENT als **Int8/Int16**, TEXCOORD und COLOR als **Uint8/Uint16**, alle mit `normalized = true` (`@gltf-transform/functions src/quantize.ts:460`, `:474-493`). Standard-Bits: Position 14, Normale 10, UV 12 (`quantize.ts:76-87`). Meshopt erbt diese Defaults (`src/meshopt.ts:13-16`, `:87`).
  - Unser Code skaliert normalisierte Daten nur für `Uint8Array`/`Uint16Array` (`meshes.ts:165-167`). **Int8/Int16 normalisiert bleiben unskaliert.** Positionen kämen um ~32767 zu groß an.
  - Bei **interleaved** Attributen denormalisiert `getComponent` schon selbst (`src/core/InterleavedBufferAttribute.js:184-188`). Danach skaliert `meshes.ts:165-167` Uint8/Uint16 ein zweites Mal: UVs wären ~0.
  - Saubere Lösung: Rohdaten unverändert hochladen und `vertexAttribPointer(slot, size, <BYTE|SHORT|UNSIGNED_*>, normalized, stride, offset)` mit dem echten Typ, Stride und Offset setzen. Das ist korrekt und spart GPU-Speicher.
- Indizes: Uint8 wird zu Uint32 aufgeblasen (`meshes.ts:181-182`). Uint16 wäre ausreichend.

## 4. Shader: was fehlt

Heute (`src/engine/shaders/mesh.ts`): ein UV-Satz `v_uv` mit dem Transform der `map` (`mesh.ts:17`, `:64`). Basecolor (`:103`), Emissive-Map (`:141`), Roughness und Metalness nur als Konstanten (`:139-140`). Occlusion nur aus der prozeduralen Laub-AO (`v_ao`, `mesh.ts:41-47`, `:142`).

Im Lighting wirkt `s.occlusion` nur auf das indirekte Licht (Himmel/Boden-Ambient und Reflexion, `src/engine/shaders/lighting.ts:114`, `:118`), nicht auf die Sonne. Das passt zur glTF-Semantik der Occlusion (Spezifikation §3.9.3; laut glTF-Spec wird die Occlusion-Map nur auf indirektes Licht angewandt). Eine gebackene AO kann also direkt in `s.occlusion` multipliziert werden.

Nötige Erweiterungen, jeweils über Defines (`Device.program` baut Varianten pro Define-Satz, `device.ts:104-120`), damit Content ohne Maps nichts bezahlt:

1. **`a_tangent` (vec4) + `v_tangent`**: TBN im Vertex-Shader mit `u_normalMat`. `w` ist die Händigkeit; laut glTF-Spec muss sie ±1 sein, und ohne TANGENT soll der Client MikkTSpace rechnen (glTF 2.0 §3.7.2.1).
   - **Rückfall ohne Tangenten**: Basis aus `dFdx/dFdy` von Position und UV wie three (`normalmap_pars_fragment.glsl.js:20-24`), mit dem vom Loader negierten `normalScale.y` (`GLTFLoader.js:3564`).
   - Besser: Tangenten in der Pipeline erzeugen (Blender „Tangents“) und den Rückfall nur als Sicherheitsnetz.
2. **`u_normalMap` + `u_normalScale`**: `n = normalize(TBN * vec3((tex.xy*2-1)*scale, tex.z))`. Im Shader ist vor der Beleuchtung mit `u_flat`/`u_doubleSided` umzugehen (`mesh.ts:118-121`). Bei `doubleSided` die Tangentenbasis mitdrehen.
3. **`a_uv1` + `v_uv1`** und pro Textur ein Kanal-Flag (aus `texture.channel`). Mindestens AO bzw. Lightmap müssen UV1 lesen können.
4. **`u_aoMap` + `u_aoIntensity`**: `occ = 1 + strength*(tex.r - 1)` (gleiche Formel wie three, `src/renderers/shaders/ShaderChunk/aomap_fragment.glsl.js:5`), multipliziert in `s.occlusion`.
5. **`u_ormMap`**: G = Roughness, B = Metalness (glTF §3.9.2), multipliziert mit den Faktoren. Da der Loader dieselbe Textur in `roughnessMap` und `metalnessMap` legt (`GLTFLoader.js:3645-3646`), reicht ein Sampler. Sinnvoll ist, AO in R derselben Textur zu packen, wenn sie auf UV0 liegt.
6. Optional **`u_lightMap` + `u_lightMapIntensity`** als zusätzliche Irradianz im Ambient-Term, analog zu three (`lights_fragment_maps.glsl.js:6-9`). Setzt eine eigene Konvention voraus (siehe 7).
7. **`meshShadowFS`** (`mesh.ts:167-181`) braucht keine Änderung. Die Attribut-Slots sind fix, und im Shadow-Programm ungenutzte Attribute schaden nicht.

**Texture Units:** `meshFS` nutzt heute etwa 10 Sampler:

- 3 Atmosphäre (`atmosphere.ts:110-112`)
- 2 Schatten (`lighting.ts:7-8`)
- 1 Wolkenschatten (`clouds.ts:275`, eingebunden über `lighting.ts:22`)
- 2 Wolken (`clouds.ts:235-236`)
- 2 Material (`mesh.ts:80-81`)

Mit Normal, ORM und AO/Lightmap sind es 13–14. OpenGL ES 3.0 garantiert mindestens 16 Fragment-Units (ES-3.0-Mindestwert, nicht eigens nachgeschlagen); das wird knapp. Die Unit-Vergabe läuft automatisch in Deklarationsreihenfolge (`device.ts:178-188`), Unit 31 ist für Uploads reserviert (`device.ts:368-370`). Das passt, solange `MAX_TEXTURE_IMAGE_UNITS` nicht überschritten wird. Auf der Quest abfragen.

## 5. Komprimierte Texturen im Device

**Ist-Zustand:**

- `Device` fragt keine Kompressions-Erweiterung ab. In den Caps stehen nur Clip-Control, Float-Targets, Multiview und Anisotropie (`device.ts:68-85`).
- `Texture` legt Speicher per `texStorage2D` mit errechneter Mip-Zahl an (`device.ts:321-323`).
- `upload()` kennt nur unkomprimierte Formate (`uploadFormat`, `device.ts:372-393`, sonst `throw`) und schreibt nur Level 0 (`device.ts:339-350`). Mips entstehen per `generateMipmap` (`device.ts:352-357`), was mit komprimierten Formaten nicht geht.
- `MeshRenderer.texture()` legt jede Textur als `RGBA8`/`SRGB8_ALPHA8` an (`meshes.ts:248-255`) und lädt `t.image` hoch (`meshes.ts:267`). Bei einer `CompressedTexture` ist `image` nur `{width, height}`, die Daten liegen in `t.mipmaps[]` (`KTX2Loader.js:449`). Das scheitert an `texSubImage2D`.

**Spezifikation:**

- ETC2/EAC kommen in WebGL über `WEBGL_compressed_texture_etc`. Die Extension „exposes the compressed texture formats defined as core in the OpenGL ES 3.0 spec to WebGL“, Enums `COMPRESSED_RGB8_ETC2` (0x9274) … `COMPRESSED_SRGB8_ALPHA8_ETC2_EAC` (0x9279) ([Khronos](https://registry.khronos.org/webgl/extensions/WEBGL_compressed_texture_etc/)). Man muss sie also auch unter WebGL2 per `getExtension` aktivieren.
- ASTC kommt über `WEBGL_compressed_texture_astc` mit `COMPRESSED_RGBA_ASTC_4x4_KHR` / `COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR`. Datengröße pro Level `floor((w+3)/4)*floor((h+3)/4)*16` Byte, sonst `INVALID_VALUE`. `getSupportedProfiles()` meldet LDR/HDR ([Khronos](https://registry.khronos.org/webgl/extensions/WEBGL_compressed_texture_astc/)).
- `texStorage2D` ist in WebGL2 auch für komprimierte Formate definiert (Verweis auf `compressedTexImage2D` im Pseudocode, [WebGL 2.0 Spec](https://registry.khronos.org/webgl/specs/latest/2.0/), Abschnitt Texture objects).
- KTX2/Basis braucht Seitenlängen als Vielfache von 4 ([KTX Artist Guide](https://github.com/KhronosGroup/3D-Formats-Guidelines/blob/main/KTXArtistGuide.md)).

**Soll:**

- `Caps` um `astc`/`etc2` erweitern (`getExtension('WEBGL_compressed_texture_astc' | '_etc')`) und daraus den Shim für `KTX2Loader.detectSupport` bauen.
- `TextureOptions` erlaubt komprimierte `format` und `levels` explizit, `texStorage2D(target, levels, compressedFormat, w, h)`. Neue Methode `uploadCompressed(level, w, h, data)` mit `compressedTexSubImage2D`.
- `MeshRenderer.texture()` erkennt `t.isCompressedTexture`, bildet `t.format` + `t.colorSpace` auf das GL-Enum ab (wie `WebGLUtils.js:111-112`, `:138`) und lädt alle `t.mipmaps` hoch. `generateMipmap` gibt es nicht, Filter `LINEAR_MIPMAP_LINEAR`, wenn `mipmaps.length > 1`.
- Wichtig: Normal- und ORM-Texturen sind linear. Der KTX2-Farbraum kommt aus dem Header (`KTX2Loader.js:458`), deshalb Normal-/ORM-Texturen mit linearer OETF kodieren (siehe 8).
- Für ungepackte Rückfall-Texturen (RGBA32 vom Transcoder) bleibt der bestehende Pfad; die `isDataTexture`-Logik passt nicht, also auf `mipmaps[0].data` achten.

**Quest-Hardware:** Laut Meta „Compress textures using ASTC format for optimal memory usage on both devices“ (Quest 2/3) ([Meta, Device optimization comparison](https://developers.meta.com/horizon/resources/device-optimization-comparison/)). Dass der Quest-Browser beide Extensions meldet, habe ich nicht primär belegt. Beim ersten Start auf dem Gerät `getSupportedExtensions()` loggen. Der KTX2Loader fällt notfalls auf RGBA32 zurück.

## 6. Budgets auf der Quest

| | Quest 2 | Quest 3 / 3S | Quelle |
|---|---|---|---|
| Draw Calls | < 100 | < 200 | [Meta, Device optimization comparison](https://developers.meta.com/horizon/resources/device-optimization-comparison/) |
| Dreiecke/Frame | < 750 K | < 1,5 M | ebd. |
| GPU | Basis | ~2,5× Quest 2 | ebd. |
| RAM gesamt | 6 GB | 8 GB | ebd. |
| Speicherlimit App (PSS) | 4,4 GiB (auch Quest Pro) | 5,75 GiB | [Meta, Memory (RAM)](https://developers.meta.com/horizon/essentials/memory-ram/) |

- Meta empfiehlt für Quest 2 „lower-resolution textures or fewer mip levels“ und Asset-Streaming (Device optimization comparison).
- Für WebXR gilt: „KTX 2.0/Basis Universal is the recommended approach to texture-compression for WebXR experiences on Meta Quest devices“. Texturbandbreite ist ein typischer Flaschenhals ([Meta, WebXR Performance Best Practices](https://developers.meta.com/horizon/documentation/web/webxr-perf-bp/)).
- Die PSS-Limits gelten für Apps. Was ein Browser-Tab davon bekommt, dokumentiert Meta nicht. Eine **eigene Grenze von deutlich darunter** ansetzen.

Ein festes Textur-Budget in MB nennt Meta nicht. Rechenbeispiel aus den Blockgrößen, Mip-Kette ≈ +⅓:

| 2048² | Level 0 | mit Mips |
|---|---|---|
| RGBA8 ungepackt | 16 MiB | ≈ 21,3 MiB |
| ASTC 4×4 (16 B pro 4×4-Block, s. o.) | 4 MiB | ≈ 5,3 MiB |
| ETC2 RGB (8 B/Block, ES-3.0-Format, nicht eigens nachgeschlagen) | 2 MiB | ≈ 2,7 MiB |

Ein Cockpit mit z. B. 4 Materialsätzen à 2048² (BaseColor, Normal, ORM) plus einer 2048²-AO/Lightmap liegt in ASTC bei ≈ 70 MiB, ungepackt bei ≈ 280 MiB. Der Khronos-Guide zeigt dasselbe Verhältnis: PNG-Duck 1,5 MB GPU, KTX 277 KB ([KTX Artist Guide](https://github.com/KhronosGroup/3D-Formats-Guidelines/blob/main/KTXArtistGuide.md)). `gltf-transform optimize` begrenzt Texturen standardmäßig auf 2048 px (`@gltf-transform/cli src/cli.ts:322-323`). Für Quest 2 ist 1024 px für Nebenflächen sinnvoll (Empfehlung, nicht belegt).

## 7. AO und Lightmap auf der zweiten UV

- **Blender:** glTF kann eine gebackene AO speichern, Blender nutzt sie aber selbst nicht. Der Exporter sucht eine Node-Gruppe namens **„glTF Material Output“** mit Eingang **„Occlusion“** und exportiert das daran hängende Image Texture als Occlusion-Map. Hinzufügen über *Add › Output › glTF Material Output* (Shader-Editor-Add-ons in den Einstellungen aktivieren). Backen über das Bake-Panel von Cycles. glTF speichert Occlusion im **R-Kanal**, daher kann sie sich ein Bild mit Roughness/Metallic teilen (glTF-Blender-IO `scene_gltf2.rst`, Abschnitt „Baked Ambient Occlusion“).
- **UV-Wahl:** „Control over UV map selection … is available by connecting a UV Map node … to any Image Texture node“ (ebd., „UV Mapping“). Ein UV-Map-Node mit der Lightmap-UV vor der AO-Textur führt zu `texCoord: 1`. Dass der Exporter dabei die richtige `TEXCOORD_n` vergibt, habe ich nicht im Exporter-Code geprüft. Nach dem Export mit `gltf-transform inspect` kontrollieren.
- **Teilen mit ORM geht nur auf derselben UV.** Liegt die AO auf UV1 und ORM auf UV0, braucht es zwei Texturen.
- **Farbige Lightmap:** glTF 2.0 hat dafür kein Feld, und der GLTFLoader 0.186.1 setzt nirgends `lightMap` (keine Fundstelle in `GLTFLoader.js`).
  - **(a)** Nur graue AO über `occlusionTexture` (standardkonform, funktioniert mit jedem Viewer).
  - **(b)** Eigene Konvention: Textur-Index in Material-`extras` (landet in `material.userData`) und ein kleines `GLTFLoader`-Plugin, das sie per `parser.getDependency('texture', i)` lädt und `lightMap` setzt.
  - **(c)** Licht in Basecolor backen und das Material unlit machen. Das verliert Sonnenwechsel und Schatten, passt also nicht zu unserem Tag/Nacht-Licht.
  - Empfehlung: **(a)** zuerst, **(b)** nur bei Bedarf.

## 8. Pipeline: Blender → gltf-transform → Engine

**Blender-Export** (glTF-Blender-IO-Doku):

- Format **glTF Binary (.glb)**.
- *Data › Mesh*: **UVs** („Export UVs (texture coordinates) with meshes“), **Normals**, **Tangents** („Export vertex tangents with meshes“), wenn Normal-Maps im Spiel sind. Der Normal-Map-Node muss auf **Tangent Space** bleiben.
- *Images*: PNG (verlustfrei) als Ausgangsmaterial für die KTX2-Kodierung. WebP schreibt der Exporter „without any png/jpg fallback“.
- *Compression*: Der Exporter kann **Draco** (Compression Level, Quantization Position/Normal/Texture Coordinates/Color/Generic) und inzwischen **Meshopt** („Compress using Meshoptimizer“, Wahl zwischen `EXT_meshopt_compression` und `KHR_meshopt_compression`). KTX2 kann er nicht.
- Empfehlung: in Blender **unkomprimiert** exportieren und erst in gltf-transform komprimieren. Dort gibt es KTX2, und die Geometrie wird nicht zweimal verlustbehaftet kodiert.

**gltf-transform** (`npm install --global @gltf-transform/cli`, Version 4.5.1):

- Für KTX2 ruft es das CLI **`ktx`** aus KTX-Software auf (`ktx create`), Mindestversion **4.4.0** (`@gltf-transform/cli src/transforms/toktx.ts:39-40`, `:279-280`, `:437`). Das ältere `toktx`-Binary wird nicht mehr benutzt; die Transform heißt nur noch so.
- `optimize`-Defaults: `--compress meshopt` (`cli.ts:303-310`), `--texture-compress auto` (`cli.ts:312-319`), `--texture-size 2048` (`cli.ts:322-323`).
- Mit `--texture-compress ktx2` kodiert `optimize` `normalTexture`, `occlusionTexture`, `metallicRoughnessTexture` als **UASTC** (Level 4, RDO) und den Rest (Basecolor, Emissive) als **ETC1S** (`cli.ts:422-446`). Das deckt sich mit Khronos: UASTC für gepackte Texturen (ORM, Normal), ETC1S für große einfarbige Flächen ([KTX Artist Guide](https://github.com/KhronosGroup/3D-Formats-Guidelines/blob/main/KTXArtistGuide.md)). Auf der Quest wird daraus ASTC (UASTC) bzw. ETC2 (ETC1S), siehe 1.
- Feinsteuerung einzeln: `gltf-transform uastc --slots "{normalTexture,occlusionTexture,metallicRoughnessTexture}" …` und `gltf-transform etc1s …` (`cli.ts:1319-1350`, `:1407-1437`).
- Normal- und ORM-Texturen linear kodieren. Im Khronos-Beispiel stehen dafür `--assign_oetf linear --assign_primaries none` (KTX Artist Guide). Fehlerhafte Farbraum-Metadaten repariert `gltf-transform ktxfix` (`cli.ts:1541-1548`).
- Beispiel: `gltf-transform optimize cockpit.glb cockpit.opt.glb --compress meshopt --texture-compress ktx2 --texture-size 2048`, danach `gltf-transform inspect cockpit.opt.glb`.
- **Achtung:** `optimize` hat `--flatten` und `--join` standardmäßig an (`cli.ts:325-331`). Das verschmilzt Nodes. Bewegliche Teile (Stick, Throttle, Schalter) müssen benannt bzw. mit `--join false`/`--flatten false` geschützt werden, sonst sind sie nicht mehr einzeln animierbar.

**Meshopt vs. Draco:**

- Meshopt ist der `optimize`-Default.
- Der Decoder ist eine einzige JS-Datei mit eingebettetem WASM.
- Meshopt komprimiert auch Animationen (`cli.ts:305-306`: „Draco compresses geometry; Meshopt and quantization compress geometry and animation“).
- Die Daten bleiben quantisiert im Speicher und passen damit zu einem typtreuen Upload (Abschnitt 3).
- Draco braucht `DRACOLoader` + `draco_decoder.wasm` und dekodiert zu Float.
- **Empfehlung: Meshopt.** Draco nur unterstützen, wenn fremde Assets es mitbringen.

**Engine-seitiges Laden:**

- Basis- und (optional) Draco-Dateien aus `three/examples/jsm/libs/{basis,draco}/` nach `public/` kopieren oder per Vite-Asset-URL ausliefern.
- `KTX2Loader.setTranscoderPath(...)`, `detectSupport(shim)`, `GLTFLoader.setKTX2Loader/setMeshoptDecoder`.
- Die geladene `gltf.scene` einfach in die bestehenden Roots hängen. `collect()` läuft den Baum generisch ab (`meshes.ts:86-134`).

## 9. Liste der nötigen Engine-Änderungen

**`src/engine/gl/device.ts`**

1. `Caps` um `astc`, `astcHdr`, `etc2` erweitern; Extensions in `constructor` holen (`device.ts:68-85`).
2. `TextureOptions` um komprimierte Formate und explizite `levels` erweitern. `texStorage2D` mit diesen Werten (`device.ts:321-323`).
3. `Texture.uploadCompressed(level, w, h, data)` per `compressedTexSubImage2D`. `uploadFormat` (`device.ts:372-393`) bleibt für unkomprimierte Formate.
4. Optional `vertexAttribPointer`-Helfer, der Typ/normalized/stride/offset aus einer three-`BufferAttribute`/`InterleavedBufferAttribute` ableitet.
5. `ATTRIBUTES` um `a_tangent`, `a_uv1` erweitern (`device.ts:251`). Ans Ende hängen, damit die bestehenden Slot-Nummern (`meshes.ts:173-176`, `:220-231`) gleich bleiben.

**`src/engine/render/meshes.ts`**

6. VAO-Aufbau: `tangent` und `uv1` binden, beide in den Versions-Schlüssel (`meshes.ts:141`, `:173-176`).
7. Normalisierte Int8/Int16-Attribute korrekt behandeln und doppelte Skalierung bei Interleaved beheben (`meshes.ts:159-171`). Am besten Rohdaten typtreu hochladen (spart GPU-Speicher).
8. `texture()`: `CompressedTexture` erkennen, Enum aus `format` + `colorSpace`, alle `mipmaps` hochladen, kein `generateMipmap` (`meshes.ts:237-273`). Gleiche `Texture`-Instanz für geklonte three-Texturen mit gleicher `source` teilen; der Loader klont für `texCoord > 0` (`GLTFLoader.js:3450`).
9. In `draw()` zusätzlich lesen: `normalMap` + `normalScale`, `aoMap` + `aoMapIntensity` + `aoMap.channel`, `roughnessMap`/`metalnessMap` (eine ORM-Textur), optional `lightMap` + `lightMapIntensity` + `channel`. Shader-Variante per Define wählen (`meshes.ts:72-80`, `:317-341`).
10. Programmwahl pro Material-Feature-Satz. Heute gibt es nur `plain`/`instanced` (`meshes.ts:72-80`, `:290`), künftig z. B. `NORMAL_MAP`, `TANGENTS`, `AO_MAP`, `ORM_MAP`, `UV1`. `Device.program` cacht pro Define-Kombination (`device.ts:106-108`). Draws nach Programm sortieren, damit der Wechsel nicht teurer wird.

**`src/engine/shaders/mesh.ts`**

11. VS: `a_tangent`, `a_uv1`, `v_tangent` (mit `u_normalMat` und Instanzmatrix, `mesh.ts:30-36`), `v_uv1`.
12. FS: Normal-Map mit TBN, Rückfall über Ableitungen und `normalScale.y`-Vorzeichen, Behandlung von `u_flat`/`u_doubleSided` (`mesh.ts:118-121`).
13. FS: ORM (G/B × Faktoren) in `s.roughness`/`s.metalness` (`mesh.ts:139-140`). AO aus R auf UV0 oder UV1 mit `strength` in `s.occlusion` (`mesh.ts:142`).
14. Optional Lightmap als Irradianz-Zusatz im Ambient-Term (Erweiterung von `shade()` in `lighting.ts:91-132`, z. B. Feld `Surface.bakedIrradiance`).
15. Sampler-Zahl im Blick behalten: heute ≈ 10, danach ≈ 13–14; `MAX_TEXTURE_IMAGE_UNITS` auf der Quest prüfen.

**Laden/Build (neu, außerhalb der Engine-Kerndateien)**

16. Lade-Modul mit `GLTFLoader` + `KTX2Loader` (Shim für `detectSupport`) + `MeshoptDecoder`, optional `DRACOLoader`. Transcoder-Dateien über `public/` ausliefern.
17. Asset-Skript, z. B. `npm run assets`: `gltf-transform optimize … --compress meshopt --texture-compress ktx2`, mit Schutz beweglicher Nodes vor `flatten`/`join`. Dokumentieren, dass KTX-Software ≥ 4.4.0 (`ktx`) installiert sein muss.
18. Tests (vitest): Attribut-Dekodierung für Int8/Int16/Uint16 normalisiert, separat und interleaved. Format-Mapping `CompressedTexture` → GL-Enum.

## Offene Punkte

- Welche Kompressions-Extensions der Quest-Browser tatsächlich meldet (ASTC LDR, ETC2) und wie hoch `MAX_TEXTURE_IMAGE_UNITS` ist: auf dem Gerät loggen.
- Speicherlimit eines Browser-Tabs auf der Quest: von Meta nicht dokumentiert.
- Ob der Blender-Exporter bei AO mit UV-Map-Node verlässlich `texCoord: 1` schreibt: an einem Testmodell prüfen.
