# GUI paths (scenario-unity-web): the same procedures by windows and menus

For a computer-use agent or a human. Unity 6.3 names the platform "Web" in menus while code, folders
and defines keep "WebGL" (`BuildTarget.WebGL`, `PlayerSettings.WebGL`, `Assets/WebGLTemplates`,
`UNITY_WEBGL`). File > Build Settings is now File > Build Profiles.

## Switch to Web and build

1. `File > Build Profiles`. Web grayed out: Unity Hub > Installs > the editor > Add modules > Web
   Build Support, restart the editor (Max O'Didily 8iApGVX--B0 [00:00:00]).
2. Select **Web** > **Switch Platform** (do this BEFORE editing Web graphics APIs, Cam Ayres
   bF_eUuxGEcA [00:01:33]).
3. Optional: **Add Build Profile** > Web > pick a configuration preset (Mobile or Desktop,
   Development or Release, 6.2+). 6.3 has no public API to create a profile (the lead's traps
   table); scripts set the same values on Player Settings and `UserBuildSettings` instead.
4. **Scene List**: remove missing scenes, **Add Open Scenes**, tick the scene (a stale list "builds
   nothing", [00:04:02]).
5. Build Profile fields: **Texture Compression** (Use Player Settings, ETC2, ASTC, DXT; it overrides
   the Player Settings format and, for the platform profile, lives in
   `Library/EditorUserBuildSettings.asset`, not version control), **Development Build** (off for
   release), **Code Optimization** (Shorter Build Time default; Disk Size while iterating; Disk Size
   with LTO or Runtime Speed with LTO for release; also stored in `Library/`: a fresh clone reads
   Shorter Build Time, observed). To carry both in the repo, **Add Build Profile** and commit the
   asset; CI then builds with `-activeBuildProfile`.
6. **Build** into an empty folder, or **Build and Run** (desktop localhost only; its server has no
   data caching and a phone cannot reach it, Makaka F-NzcSQLiJs [00:01:12]).

## Player settings (`Edit > Project Settings > Player`, Web tab, or Build Profiles > Player Settings)

- **Resolution and Presentation**: Default Canvas Width/Height, Run In Background, **Web Template**
  (Default, Minimal, PWA, or `PROJECT:<Name>` from `Assets/WebGLTemplates/<Name>/`; re-select after
  adding custom template variables). With AgentWeb selected, its custom variables appear as text
  fields below the template list: `AGENTWEB_TIP`, `AGENTWEB_ERROR_URL`, `AGENTWEB_MOBILE_MAX_DPR`,
  `AGENTWEB_REQUIRE_WASM2023`, `AGENTWEB_TAP_TO_PLAY` (script:
  `PlayerSettings.SetTemplateCustomValue`).
- **Splash Image**: Show Splash Screen, **Show Unity Logo** (turn both off: the logo stays if only
  the splash is off, CrazyGames).
- **Other Settings > Rendering**: Color Space; untick **Auto Graphics API** > **+** > WebGPU > drag
  above WebGL 2 (keep WebGL 2); Static Batching; Texture compression format; Lightmap Encoding.
- **Other Settings > Configuration**: Scripting Backend (IL2CPP only for Web), **API Compatibility
  Level** (.NET Standard 2.1; a script reads it back as `NET_Standard_2_0`, observed), **IL2CPP Code
  Generation** ("Optimize for code size and build time", renamed in 6.2), **Allow downloads over
  HTTP** (default Not Allowed: on a plain-HTTP host other than localhost, UnityWebRequest to the
  game's own StreamingAssets throws "Insecure connection not allowed", observed), Active Input
  Handling.
- **Other Settings > Optimization**: **Strip Engine Code**, **Managed Stripping Level** (template:
  Minimal; raise to High and test), Optimize Mesh Data, Texture Mipmap Stripping.
- **Publishing Settings > Memory**: **Initial Memory Size** (default 32 MB; on mobile set it to the
  measured typical heap), **Memory Growth Mode** (Geometric recommended; step 0.2, cap 96 MB),
  **Maximum Memory Size** (2048 MB).
- **Publishing Settings**: **Compression Format** (Gzip, Brotli, Disabled; release builds only; the
  URP template ships Brotli), **Name Files As Hashes**, **Data Caching**, **Debug Symbols** (Off,
  External, Embedded), **Decompression Fallback**, **Power Preference**, **Show Diagnostics
  Overlay**; WebAssembly Language Features: **Enable Exceptions**, **Enable Native C/C++
  Multithreading** (experimental, needs COOP/COEP/CORP), **Enable WebAssembly 2023**, **Use
  WebAssembly.Table**, **Enable BigInt**, **Initial / Maximum Memory Size**, **Memory Growth Mode**.

## Graphics and quality for Web

- `Edit > Project Settings > Graphics`: Lightmap Modes and Fog Modes Automatic, Instancing Variants
  Strip Unused, BatchRendererGroup Variants Strip all (unless GPU Resident Drawer is used), prune
  Always Included Shaders.
- `Edit > Project Settings > Quality`: pick a low level for the Web target; URP asset
  (`Assets/Settings/*_RPAsset.asset`) > Shadows > Cascade Count 1 or 2.
- URP renderer (`Assets/Settings/*_Renderer.asset`, every renderer the Web quality levels use) >
  **Post-processing** off when no Volume effects ship: 1.61 MB here (about 1 MB, CrazyGames).
- `Window > Rendering > Lighting` > Lightmapping Settings > **Directional Mode: Non-Directional**
  for WebGL 2 builds that bake.

## Imports (select the asset > Inspector > Web tab > Override For Web)

- Textures: Max Size (step down one or two levels and judge at play distance), Format (ASTC 8x8 for
  mobile, DXT/BC for desktop), Use Crunch Compression + Compressor Quality, mipmaps off on sprites.
- Audio: Load Type (Compressed In Memory for music; Decompress On Load for low-latency SFX, silent
  on iOS in Silent Mode), Force To Mono, Sample Rate Setting Optimize, Quality.
- Plug-ins: select the `.jslib` > Inspector > Web platform ticked (default for `.jslib`).
- Video: no VideoClip assets on the Web; VideoPlayer > Source URL with a file in
  `Assets/StreamingAssets/`.

## Addressables (for deferred content; authoring is scenario-unity-pipeline-automation's)

`Window > Asset Management > Addressables > Groups`: first-scene content in a local group, the rest
remote; group schema compression **LZ4** (LZMA fails on the Web: "Decompressing this format (1)
isn't supported"); Build > New Build > Default Build Script; upload `ServerData` to the CDN with
CORS.

## Bundles and stripping

- Select a prefab > Inspector footer > **AssetBundle** name; `Assets > Build AssetBundles` needs a
  script (no built-in menu item): use `WebJobs.BuildBundles`.
- `Assets/link.xml` (any folder under Assets) keeps types used only inside bundles:
  `<linker><assembly fullname="UnityEngine.WindModule"><type fullname="UnityEngine.WindZone" preserve="all"/></assembly></linker>`;
  to confirm a stripping problem, temporarily untick **Strip Engine Code** (Player > Other
  Settings > Optimization).

## Tests in the Editor

- `Window > General > Test Runner` > EditMode > run `AgentWeb.EditorTests` (the release policy
  tests, `ProjectSettings/AgentWebPolicy.json`).

## Profiling and debugging

- `Window > Analysis > Profiler` > Play Mode dropdown > **Enable Web Profiling**, copy IP:port,
  press **Profile** in a development build page (Default or PWA template only). 6.3 can profile a
  running Web build over IP (deltas § 12).
- Frame Debugger: does not work on the Web.
- Browser: F12 > Console (Unity's startup lines, `AGENTWEB` probe lines, `AGENTWEB_ERROR` reports,
  WebGPU line), Network tab (Content-Encoding, sizes, 304 revalidation), Performance tab (frame
  time, CPU), Application tab > IndexedDB (`UnityCache`, `/idbfs`).
- Diagnostics Overlay: Publishing Settings > **Show Diagnostics Overlay** (Default and Minimal
  templates carry the icon; the AgentWeb template does not, read `unityInstance.GetMetricsInfo()`
  instead); JS memory reads N/A on Safari, Firefox and iOS.
- Production stack traces: Debug Symbols External; copy
  `Library/Bee/artifacts/WebGL/il2cppOutput/cpp/Symbols/MethodMap.tsv` beside the build artifacts.

## Publish

- **Unity Play**: `File > Build Profiles > Publish to Play` (under 1 GB).
- **itch.io**: Upload new project > Kind of project **HTML** (not Unity) > upload the zip whose root
  holds `index.html` > tick "This file will be played in the browser" > viewport = build
  resolution > save **Restricted** first, then edit to **Public** (Max O'Didily [00:02:17] to
  [00:05:39]). Command line alternative for uploads: itch.io's
  `butler push <folder> <user>/<game>:html5` [not run here: needs an itch.io account].
- **Own host / CDN**: upload `Build/`, `TemplateData/`, `StreamingAssets/`, `index.html`; set
  headers per `ut_web.headers_table()`; check with `curl -sI`.
- **CrazyGames / Poki**: portal SDK packages and their inspectors (Poki Inspector) are dashboard
  steps; an agent wires the SDK calls in C# and a human submits.

## Phone test over the LAN (Makaka F-NzcSQLiJs)

Same Wi-Fi; `python3 ut_web.py serve <build> --host 0.0.0.0 --https` prints the URL; on the phone
open `https://<LAN IP>:8080/`, Advanced > Proceed (self-signed), grant motion permission on iOS;
stop the server afterwards (it exposes the folder to the network).
