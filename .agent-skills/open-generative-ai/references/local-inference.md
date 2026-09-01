# Local Inference

Local inference exists **only in the Electron desktop app**. The hosted web build
and Docker always call MuAPI. When a user's goal is privacy, offline use, or
zero per-generation cost, this is the only path that delivers it — say so before
they install a server build.

Two independent engines with different hardware requirements.

| Engine | Ships with app | Runs where | Covers |
|---|---|---|---|
| sd.cpp | yes, one-click install | same machine | image models only |
| Wan2GP | no, user-run server | separate CUDA/ROCm GPU box | video + large image models |

## Engine 1 — sd.cpp (bundled)

C++ engine from `leejet/stable-diffusion.cpp`. Metal on Apple Silicon;
CUDA/Vulkan/ROCm on Linux and Windows; CPU everywhere as fallback.

| Model | Family | Weights | Notes |
|---|---|---|---|
| Z-Image Turbo | DiT | 2.5 GB + 2.7 GB aux | 8-step; memory hungry |
| Z-Image Base | DiT | 3.5 GB + 2.7 GB aux | 50-step; memory hungry |
| Dreamshaper 8 | SD 1.5 | 2.1 GB | 20-step; lightest tested on Mac |
| Realistic Vision v5.1 | SD 1.5 | 2.1 GB | 25-step photorealistic |
| Anything v5 | SD 1.5 | 2.1 GB | 20-step anime |
| SDXL Base 1.0 | SDXL | 6.9 GB | 30-step high-res |

Z-Image additionally needs two shared auxiliary files, downloaded once:
Qwen3-4B text encoder (2.4 GB) and FLUX VAE (335 MB).

Setup: Settings → Local Models → install the sd.cpp engine → download a model →
in Image Studio toggle **⚡ Local** → select and generate. No API key needed.
Everything installs inside the app's data directory; nothing goes system-wide.

### Memory reality

Z-Image on 16 GB is workable (~7.4 GB weights + ~2.4 GB compute buffer). On a
base 8 GB Apple Silicon Mac it is **documented to hang the machine** — route
those users to SD 1.5. Confirm available RAM before recommending Z-Image.

### Storage location

Default roots:

- macOS: `~/Library/Application Support/open-generative-ai/local-ai`
- Windows: `%APPDATA%\open-generative-ai\local-ai`
- Linux: `~/.config/open-generative-ai/local-ai`

Override with `OPEN_GENERATIVE_AI_LOCAL_AI_DIR` **before launching**.
`electron/lib/localInferencePaths.js` resolves `bin/`, `models/`, and `tmp/`
under it. Settings → Local Models shows the resolved path — use that to confirm,
rather than assuming the default.

Total footprint reaches double-digit gigabytes quickly. Confirm target disk free
space before starting downloads.

### Verifying the Metal path

Slow generation almost always means the binary fell back to CPU. On Apple
Silicon expect roughly 1–2 s/step for SD 1.5; ~10 s/step means CPU.

```bash
APP_DATA="${OPEN_GENERATIVE_AI_LOCAL_AI_DIR:-$HOME/Library/Application Support/open-generative-ai/local-ai}"
ls "$APP_DATA/bin"      # sd-cli, libstable-diffusion.dylib
ls "$APP_DATA/models"

DYLD_LIBRARY_PATH="$APP_DATA/bin" "$APP_DATA/bin/sd-cli" \
  -m "$APP_DATA/models/DreamShaper_8_pruned.safetensors" \
  -p "a serene mountain lake at sunrise, oil painting" \
  -o /tmp/sd15-test.png \
  --steps 12 -H 512 -W 512 --cfg-scale 7.5 --seed 42 \
  --sampling-method euler_a
```

A Metal-backed run reports nonzero VRAM in its
`total params memory size = ... (VRAM ..., RAM ...)` line. `VRAM 0.00MB` means
the dylib is CPU-only:

```bash
otool -L "$APP_DATA/bin/libstable-diffusion.dylib" | grep -i metal
```

No Metal linkage → reinstall the engine from Settings → Local Models.

This is a real inference run: it consumes CPU/GPU and writes a file. Get
agreement before running it on someone's machine.

## Engine 2 — Wan2GP (remote Gradio server)

The app bundles neither Python nor Wan2GP weights. The user runs the server; the
app is an HTTP client.

```bash
git clone https://github.com/deepbeepmeep/Wan2GP
cd Wan2GP
./install.sh                                    # install.bat on Windows
python wgp.py --listen --server-name 0.0.0.0    # binds all interfaces
```

Then Settings → Local Models → Wan2GP server → paste the URL (e.g.
`http://192.168.1.42:7860`) → Test → Save.

| Model | Type | Notes |
|---|---|---|
| Flux.1 Dev | image | 1024px, 28 steps |
| Qwen Image | image | 1024px, 30 steps |
| Wan 2.2 (T2V/I2V) | video | slow on consumer GPUs |
| Hunyuan Video | video | high-quality T2V |
| LTX Video | video | fastest video option |

Wan2GP image models appear in Image Studio. Video models are reachable through
the same generation API, but Image Studio rejects video output explicitly — full
Video Studio wiring is not done. Do not promise Wan2GP video inside Video Studio.

### Why it is a separate server

Wan2GP's runtime (Sage attention, flash-attn, AWQ/GGUF kernels) is CUDA-only,
with no MPS path. Treating it as remote lets a Mac user keep the desktop app
while offloading inference to a Linux/Windows GPU box, a LAN gaming PC, or a
rented RunPod/vast.ai instance.

`--server-name 0.0.0.0` binds every interface. On anything but a trusted LAN,
put it behind a firewall, VPN, or SSH tunnel — it is an unauthenticated GPU
endpoint.

## Choosing between them

- Mac, images, simple → sd.cpp with SD 1.5.
- Mac, wants video locally → needs a separate GPU box running Wan2GP.
- NVIDIA/AMD desktop → either; Wan2GP covers more models.
- Server or Docker deployment → neither. Local inference is desktop-only.
