# Godogen setup and delivery

Verified against upstream commit `05cebffc8b10c5817e8a3db495b82e7b6004ab84`.

## Host matrix

### Shared

| Requirement | Upstream expectation | Verify |
|---|---|---|
| Bash and rsync | required publication runtime | `bash --version`; `rsync --version` |
| Git | optional repository initialization; strongly recommended | `git --version` |
| Python | 3.10+ | `python3 --version` |
| ffmpeg | video encoding and frame extraction | `ffmpeg -version` |
| ImageMagick | image resize, flip, crop | `magick -version` or `convert -version` |
| Vulkan tools | GPU-path validation | `vulkaninfo --summary` |
| Xvfb | headless Linux engine/browser runs | `xvfb-run --help` |

Ubuntu/Debian system packages documented upstream:

```bash
sudo apt-get install vulkan-tools xvfb ffmpeg imagemagick
```

macOS packages documented upstream:

```bash
brew install coreutils ffmpeg dotnet@9
```

Package installation changes the host and may require admin access. Do not install during a
blanket skill setup or without the user's request.

### Godot lane

- Godot 4 **.NET/Mono build**, not the standard build
- .NET 9 for Godot 4.5+
- `GodotSharp/` adjacent to the Godot binary on Linux

```bash
dotnet --version             # upstream expects 9.0.x for Godot 4.5+
godot --version              # must identify a 4.x mono build
godot --headless --quit      # RID warnings at exit can be benign
```

If assembly loading fails:

```bash
ls "$(dirname "$(command -v godot)")/GodotSharp/"
```

macOS upstream install path:

```bash
brew install --cask godot-mono
sudo ln -sf /Applications/Godot_mono.app/Contents/MacOS/Godot /usr/local/bin/godot
```

### Bevy lane

- current stable Rust toolchain
- Cargo and rustc
- Bevy resolved from the current stable release and pinned exactly in the generated game

```bash
rustup update stable
cargo --version
rustc --version
```

Do not install or update Rust merely to verify the skill. Report what is present and let the
user choose the environment change.

### Babylon.js lane

- Node.js 22.12+ and npm
- Chrome or Chromium
- hardware WebGL2 for reliable browser proof

```bash
node --version
npm --version
command -v google-chrome || command -v chromium || command -v chromium-browser
```

If the browser is elsewhere, set `CHROME_BIN` to its executable. Headless capture should read
the WebGL `RENDERER` string. On a GPU host, `swiftshader`, `llvmpipe`, or `lavapipe` means the
browser is on a software fallback and the GPU path is misconfigured.

## Python asset environment

Published requirements live at:

- Claude: `.claude/skills/asset-gen/tools/requirements.txt`
- Codex: `.agents/skills/asset-gen/tools/requirements.txt`

The pinned requirements include `xai-sdk`, `google-genai`, `requests`, `numpy`, `pillow`,
`rembg`, `pymatting`, `onnxruntime-gpu`, and `nvidia-cudnn-cu12==9.*`.

```bash
python3 --version
pip install -r <asset-gen-dir>/tools/requirements.txt
```

The requirements favor an NVIDIA/CUDA matting runtime. Inspect the target machine before
installing them on a CPU-only or Apple-Silicon host; do not promise that the pinned GPU wheels
will work there unchanged.

## Provider keys

| Variable | Provider | Operations |
|---|---|---|
| `GOOGLE_API_KEY` | Google Gemini | image generation |
| `XAI_API_KEY` | xAI Grok | image and video generation |
| `TRIPO3D_API_KEY` | Tripo3D | GLB, rigging, and retargeting |

Never print key values. The bundled doctor reports only `SET` or `MISSING`:

```bash
bash .agent-skills/godogen/scripts/godogen.sh doctor all
```

Missing keys do not block publication or non-asset game work. They block only the provider
operations that need them.

## Rendering checks

Upstream's Linux verification examples:

```bash
VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/nvidia_icd.json \
  vulkaninfo --summary 2>&1 | grep "deviceName"
xvfb-run -a godot --headless --quit
```

Do not hardcode the NVIDIA ICD path on machines with another driver layout. First inspect
`/usr/share/vulkan/icd.d/` and the real GPU.

## Delivery modes

Godogen chooses delivery from the task framing, not merely from whether the user is online.

### Collaborative or open-ended brief

- expose a running game early;
- checkpoint decisions of taste, scope, and cost;
- continue freely between checkpoints;
- keep the live surface current as the project changes.

The user watches Godot with `godot --path .` or the editor, Bevy with `cargo run`, and Babylon
at the fixed Vite URL such as `http://<host>:5173`.

### Finished brief

- make reasonable implementation decisions without needless blocking;
- maintain steady progress;
- verify structure and runtime behavior;
- if the user did not see the live game, finish with a 15-20 second proof recording;
- watch the recording before reporting completion.

### Durable status

Maintain `README.md` in the generated game repository with:

- what is built;
- what remains;
- how to run and verify the current game;
- an asset table with name, description, in-game size, path, and cost.

A compile or build command proves only that the code passes that gate. It does not prove the
result looks or plays correctly.

## Long runs

A full generation can take hours. On a remote host:

```bash
tmux new -s godogen
# or: screen -S godogen
```

Use the official Claude Code or Codex remote-control interface for steering. Do not leave an
untracked background process and assume it will survive an SSH drop.
