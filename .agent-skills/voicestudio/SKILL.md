---
name: voicestudio
description: >
  Use when operating debpalash/VoiceStudio as a local-first voice cloning, voice design, speech generation, transcription, and video-dubbing repository: inspect the Electron and FastAPI surfaces, check host fit offline, prepare approval-gated installs and launches, map Hugging Face model downloads and licenses, use the local MCP/API, and troubleshoot model, device, port, and media failures without claiming runtime proof. Require documented speaker consent before cloning a real person's voice and refuse impersonation or fraud. Route hosted ElevenLabs TTS to `elevenlabs-tts`, programmatic or templated video assembly to `video-production`, timeline editing to `opencut`, and hosted generative video to `open-generative-ai`.
allowed-tools: Bash Read
compatibility: Requires Python 3.11+ for VoiceStudio, Bun/Node for Electron source workflows, and ffmpeg for media paths; GPU acceleration is host-dependent.
license: AGPL-3.0-only
metadata:
  version: "1.0.0"
  source: https://github.com/debpalash/VoiceStudio
  upstream_commit: 28bf2c7a83b8a64836297340c52a45d716684aed
---

## When to use this skill

Use this skill for source-grounded VoiceStudio fit checks, offline repository preflight, approval-gated Electron or backend setup handoff, local voice cloning, text-described voice design, speech generation, transcription, and ASR → translation → TTS → mux dubbing workflows. Treat model weights, tokens, generated files, and remote providers as separate boundaries from the AGPL application.

## Instructions

1. Run the offline gate first. From the repository root run `python3 .agent-skills/voicestudio/scripts/preflight.py --json`; from an installed skill root run `python3 "$SKILLS_ROOT/voicestudio/scripts/preflight.py" --json`. It is offline-only and never launches VoiceStudio, invokes upstream tools, reads secrets, downloads weights, or calls a network.
2. For a checkout, use `--repo PATH --expect-commit 28bf2c7a83b8a64836297340c52a45d716684aed`; report missing markers, tool availability, and the fact that `runtime_verified` remains false.
3. Select the maintained Electron desktop path. Source setup is `bun install`, `bun run setup:api`, then `bun run dev`; the local FastAPI backend defaults to loopback port 3900, with web 3901 and Electron development 3902. Docker is a separate headless backend and binds published container traffic.
4. Before any install, launch, server/port bind, credential entry, model or weight download, remote API call, analytics enablement, publishing, or destructive uninstall/data deletion, state the exact action, paths, network endpoints, model size/license implications, and obtain approval. Do not answer first-run analytics consent for the user.
5. For voice cloning, require documented consent from the speaker for a real person's voice. Refuse impersonation, fraud, unauthorized identity capture, or deceptive disclosure; prefer a consent-verified profile or a designed voice.
6. For voice design, use text attributes with an engine that supports design; OmniVoice uses one attribute per category, while some engines accept free-form descriptions. Do not claim that reference-only engines can design voices.
7. For dubbing, preserve the local source and output paths, identify ASR/translation/TTS choices, and describe the ASR → translate → synthesize → mux stages. Verify output existence and playback only after an approved runtime run.
8. Troubleshoot from `/health`, `/openapi.json`, `/models`, `/models/install/status`, backend logs, device/ffmpeg checks, and the pinned docs. Distinguish source evidence from an unverified live result; never call a paid or remote provider implicitly.

## Examples

```text
Use VoiceStudio for a local dub: run the offline preflight, report whether Python, Bun, Node, ffmpeg, and git are discoverable, then ask before installing the required Hugging Face models. Clone only a speaker with documented consent; otherwise use Voice Design. Keep the backend loopback-only and route timeline assembly to opencut.
```

## Best practices

- Pin and report the upstream commit and distinguish AGPL application code from model, tokenizer, voice, and generated-output terms.
- Keep HF caches and VoiceStudio data paths explicit; default data locations are platform-specific under `OmniVoice` and generated audio is under `outputs`.
- Treat `3900` as the default backend endpoint and restrict any non-loopback exposure to a trusted network with HTTPS/WSS and explicit authentication.
- Label model download size, gated-access requirements, hardware mode, and license review before approval.
- Never present a preflight or source inspection as proof that a model loaded, a server is healthy, or audio quality is acceptable.
- Prefer loopback host defaults for local development and state explicitly when Docker changes the bind boundary.
- Keep speaker consent records outside generated audio paths and avoid embedding personal identifiers in filenames.
- Separate ASR transcript review from translation review; preserve subtitle timing before muxing.
- Treat `/models` catalog metadata as a planning hint, not proof that weights are installed or usable on the host.
- If a model is gated, explain token scope and cache location without printing or copying the token.
- Route hosted TTS, timeline editing, and hosted video generation to their dedicated catalog skills rather than adding provider code here.
- For failures, capture the first actionable error and the exact endpoint or engine selected before changing settings.
- Keep generated samples attributable to the chosen engine and disclose synthetic voice use where the surrounding product requires it.

## References

- [Pinned upstream operator matrix](references/upstream.md)
- [VoiceStudio README at the pinned commit](https://raw.githubusercontent.com/debpalash/VoiceStudio/28bf2c7a83b8a64836297340c52a45d716684aed/README.md)
- [Install and agent handoff](https://raw.githubusercontent.com/debpalash/VoiceStudio/28bf2c7a83b8a64836297340c52a45d716684aed/docs/install/agent.md)
- [Model download behavior](https://raw.githubusercontent.com/debpalash/VoiceStudio/28bf2c7a83b8a64836297340c52a45d716684aed/docs/downloading-models.md)
- [Local speech and MCP surfaces](https://raw.githubusercontent.com/debpalash/VoiceStudio/28bf2c7a83b8a64836297340c52a45d716684aed/docs/speech-platform.md)
