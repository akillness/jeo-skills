# VoiceStudio pinned operator reference

This reference records the audited VoiceStudio operator surface at commit `28bf2c7a83b8a64836297340c52a45d716684aed` under AGPL-3.0-only. The local `scripts/preflight.py` is read-only and offline; it never runs these commands, binds a port, reads credentials, downloads weights, or calls providers.

## Command and feature matrix

| Surface | Purpose | Side-effect boundary |
| --- | --- | --- |
| `python3 scripts/preflight.py --json` | inspect host tools and an optional checkout | offline inspection only; no upstream execution |
| `bun install` | install Electron workspace dependencies | network/package writes; approval required |
| `bun run setup:api` | prepare Python API dependencies | package installation and environment writes; approval required |
| `bun run dev` | launch the maintained Electron desktop app and supervised backend | starts desktop process and local ports; approval required |
| `python backend/main.py --health-check` | boot backend and poll `/health` | starts a local server and may initialize ML dependencies; approval required |
| `curl http://127.0.0.1:3900/health` | check a running backend | read-only loopback request |
| `GET /models` | inspect model catalog and installed state | read-only API request |
| `POST /models/install` | download a Hugging Face model snapshot | network, disk, and potentially gated-token use; explicit approval required |
| `GET /models/install/status` | poll model-install progress | read-only API request |
| `POST /generate` or MCP `generate_speech` | synthesize local speech | writes generated output and consumes local model resources |
| MCP mounted at `/mcp` or `python -m backend.mcp_shim` | expose speech, cloning, transcription, and voice-list tools to agents | local API/stdio transport; credentials or non-loopback exposure require approval |
| dubbing workspace/API | ASR → translation → TTS → mux/export | reads media and writes dub jobs/exports; remote translation/provider choices require approval |

## Prerequisites and platform limits

- `pyproject.toml` requires Python `>=3.11`; the API stack includes Torch, Transformers, FastAPI/Uvicorn, WhisperX/faster-whisper, ffmpeg support, and `mcp`. The Electron source path uses Bun and Node; the root manifest pins `bun@1.4.2` and the installer guide requires Node.js 22+ for source builds.
- README support evidence lists NVIDIA CUDA on Windows/Linux, Apple Silicon Metal/MPS, and CPU operation with slower inference. Intel Macs provide the UI but local Python/ML support is not the supported local path. Windows on ARM is experimental and uses an x64 Python backend under emulation in the documented path.
- The default ports in `config/app.json` are backend `3900`, web `3901`, and Electron development `3902`. `backend/main.py` and `services/network_share.py` default the backend bind host to `127.0.0.1`; Docker's entrypoint defaults to `0.0.0.0` for published container traffic. Do not infer a safe public deployment from a local default.
- Default data paths come from `backend/core/config.py`: macOS `~/Library/Application Support/OmniVoice`, Windows `%APPDATA%/OmniVoice`, and other platforms `~/.omnivoice`. Within that data directory, voices, generated outputs, dub jobs, and previews are stored under `voices`, `outputs`, `dub_jobs`, and `preview`; the SQLite database is `omnivoice.db`. `HF_HOME`, `HF_HUB_CACHE`, and `OMNIVOICE_CACHE_DIR` can redirect model caches.

## Model, network, and license boundaries

- `backend/config/models.yaml` is the catalog source of truth. The required default TTS model is `k2-fsa/OmniVoice`, listed at approximately 2.4 GiB; optional ASR and other model entries include faster-whisper, MLX Whisper, Parakeet, Moonshine, sherpa-onnx, and other Hugging Face repositories. Treat catalog sizes as approximate and confirm the current entry before approval.
- `docs/downloading-models.md` says first-use models download from Hugging Face Hub. The implementation uses `snapshot_download`/`hf_hub_download`, supports resumable/segmented transfers, and may use an explicit `HF_ENDPOINT` mirror. A token may be required for gated models such as diarization; the docs say tokens must not be sent to a mirror.
- `pyproject.toml` documents an Apache-2.0 upstream OmniVoice model/library alongside the AGPL application. README and `LICENSE-NOTICE.md` state that model weights, tokenizers, voices, and generated-output conditions are separate from application licensing. The catalog also marks some weights as research/non-commercial or with unresolved review; review the model's own card/license before download or redistribution.
- Remote-capable dependencies and integrations exist (`openai`, LiteLLM, AWS, Google auth, translation providers, and optional PostHog analytics). `README.md` describes remote services as optional and analytics as consent-gated; never assume a given engine or translator is local without checking its provider setting.
- The open-source desktop app has no separate Pro license client or licensing network call according to `electron/README.md`; that does not change the terms of model weights or third-party providers.

## Voice, dubbing, and safety

- `docs/voice-design.md` says Voice Design uses an `instruct` description without reference audio. OmniVoice supports categories such as gender, age, pitch, style, accent, and dialect with one value per category; other engines may accept free-form descriptions, while reference-only engines cannot design a new timbre.
- `docs/mcp.md` exposes `generate_speech`, `clone_voice`, `describe_voice`, transcription, and voice-list tools through the running backend. A `ref_audio_path` must be under the configured base path when using the local tool surface.
- `README.md` says to clone voices only with permission. The calls guide requires a cloned voice verified as the user's own with a recorded consent statement, or a designed voice that imitates nobody. Apply the stricter rule: documented speaker consent is required for any real-person clone; refuse impersonation, fraud, and deceptive use.
- Dubbing export writes artifacts beneath the configured dub job and output directories, with ffmpeg used for muxing. Verify a resulting file exists and plays only after an approved runtime run; source inspection alone is not a generation proof.

## Pinned evidence links

- [README.md](https://raw.githubusercontent.com/debpalash/VoiceStudio/28bf2c7a83b8a64836297340c52a45d716684aed/README.md)
- [LICENSE](https://raw.githubusercontent.com/debpalash/VoiceStudio/28bf2c7a83b8a64836297340c52a45d716684aed/LICENSE)
- [pyproject.toml](https://raw.githubusercontent.com/debpalash/VoiceStudio/28bf2c7a83b8a64836297340c52a45d716684aed/pyproject.toml)
- [package.json](https://raw.githubusercontent.com/debpalash/VoiceStudio/28bf2c7a83b8a64836297340c52a45d716684aed/package.json)
- [config/app.json](https://raw.githubusercontent.com/debpalash/VoiceStudio/28bf2c7a83b8a64836297340c52a45d716684aed/config/app.json)
- [backend/config/models.yaml](https://raw.githubusercontent.com/debpalash/VoiceStudio/28bf2c7a83b8a64836297340c52a45d716684aed/backend/config/models.yaml)
- [backend/core/config.py](https://raw.githubusercontent.com/debpalash/VoiceStudio/28bf2c7a83b8a64836297340c52a45d716684aed/backend/core/config.py)
- [backend/main.py](https://raw.githubusercontent.com/debpalash/VoiceStudio/28bf2c7a83b8a64836297340c52a45d716684aed/backend/main.py)
- [backend/docker_entrypoint.py](https://raw.githubusercontent.com/debpalash/VoiceStudio/28bf2c7a83b8a64836297340c52a45d716684aed/backend/docker_entrypoint.py)
- [docs/install/agent.md](https://raw.githubusercontent.com/debpalash/VoiceStudio/28bf2c7a83b8a64836297340c52a45d716684aed/docs/install/agent.md)
- [docs/install/script.md](https://raw.githubusercontent.com/debpalash/VoiceStudio/28bf2c7a83b8a64836297340c52a45d716684aed/docs/install/script.md)
- [docs/downloading-models.md](https://raw.githubusercontent.com/debpalash/VoiceStudio/28bf2c7a83b8a64836297340c52a45d716684aed/docs/downloading-models.md)
- [docs/voice-design.md](https://raw.githubusercontent.com/debpalash/VoiceStudio/28bf2c7a83b8a64836297340c52a45d716684aed/docs/voice-design.md)
- [docs/speech-platform.md](https://raw.githubusercontent.com/debpalash/VoiceStudio/28bf2c7a83b8a64836297340c52a45d716684aed/docs/speech-platform.md)
- [docs/mcp.md](https://raw.githubusercontent.com/debpalash/VoiceStudio/28bf2c7a83b8a64836297340c52a45d716684aed/docs/mcp.md)
- [docs/calls.md](https://raw.githubusercontent.com/debpalash/VoiceStudio/28bf2c7a83b8a64836297340c52a45d716684aed/docs/calls.md)
