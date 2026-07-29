---
name: rfxgen
description: >
  Generate, convert, preview, and integrate retro game sound effects with
  raysan5/rfxgen. Use when a user needs coin, laser, explosion, power-up, hit,
  jump, or blip SFX; wants `.rfx` parameters converted to WAV/raw/C headers;
  needs batch CLI generation; or must build and troubleshoot rFXGen. Triggers on:
  rFXGen, rfxgen, sfxr, chiptune SFX, .rfx, procedural game sound, or sound preset.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: rFXGen desktop binary, or CMake 3.11+ and a desktop C toolchain for source builds
metadata:
  tags: game-development, audio, sound-effects, procedural-audio, raylib, cli
  version: "1.0.0"
  source: https://github.com/raysan5/rfxgen
---

# rFXGen

## When to use this skill

- Generate compact retro/chiptune sound effects from named presets.
- Tune and save `.rfx` parameter files in the desktop UI.
- Convert `.rfx` into `.wav`, `.qoa`, `.raw`, or C header data.
- Batch sound generation or diagnose an rFXGen source build.

Route coding-agent notification packs to `game-sounds`. Route runtime event architecture and engine playback integration to an engine-specific audio skill after assets are generated.

## Instructions

### Step 1: Define the asset contract

Capture the gameplay event, preset family, output format, sample rate, sample size, channel count, duration/style constraints, loop behavior, naming, and runtime target. Start with one representative sound before generating a full kit.

Supported upstream generation presets at the inspected revision are:

```text
coin laser explosion powerup hit jump blip
```

Supported format values are sample rates `22050|44100`, sample sizes `8|16|32`, and channels `1|2`.

### Step 2: Prefer an existing binary or online tool

```bash
bash .agent-skills/rfxgen/scripts/setup.sh --check
```

Use the official WebAssembly tool for quick interactive design when local installation is unnecessary. Build from source only when a reproducible CLI or code change is required.

```bash
bash .agent-skills/rfxgen/scripts/setup.sh --clone
bash .agent-skills/rfxgen/scripts/setup.sh --build
```

The upstream CMake project fetches raylib when it is not already available, so a build may require network access and platform development libraries.

### Step 3: Generate through the validated wrapper

```bash
bash .agent-skills/rfxgen/scripts/generate.sh \
  --preset explosion --output assets/sfx/explosion.wav \
  --format 44100,16,1
```

The wrapper validates preset, extension, and format before invoking `rfxgen`. Set `RFXGEN_BIN` when the binary is not on `PATH`.

### Step 4: Convert or export deliberately

The native CLI accepts `.rfx` and supported audio input with `--input`, and output in `.wav`, `.qoa`, `.raw`, or `.h`. Keep `.rfx` alongside exported audio when future tuning matters. Use `.h` only when embedding bytes is appropriate for the target build; otherwise prefer an external asset pipeline.

### Step 5: Integrate as an event-driven kit

Name assets by abstract game event, not by implementation callsite. Keep loudness and frequency ranges distinct enough for rapid recognition. Test common overlap cases, repeated triggers, pause/resume, and low-volume playback.

### Step 6: Verify observable output

For every generated asset:

- confirm the file exists and is non-empty;
- inspect sample rate, bit depth, and channels with `ffprobe` or equivalent;
- audition on target hardware;
- confirm no clipping and no unintended long tail;
- verify the game event triggers the right semantic sound;
- preserve attribution/license information when distributing source or modified rFXGen code.

## Examples

### Generate a mono jump sound

```bash
bash .agent-skills/rfxgen/scripts/generate.sh \
  --preset jump --output jump.wav --format 22050,16,1
```

### Convert tuned parameters

```bash
rfxgen --input tuned-hit.rfx --output tuned-hit.wav --format 44100,16,1
```

## Best practices

1. Design one sound per semantic gameplay event.
2. Preserve `.rfx` sources for iteration.
3. Use mono unless stereo carries intentional information.
4. Audition repeated and overlapping playback, not just isolated files.
5. Pin source builds and retain the zlib license notice.

## References

- `references/cli-and-build.md` — CLI matrix, build notes, and verification checklist.
- `references/upstream.md` — inspected revision and license.
- [rFXGen](https://github.com/raysan5/rfxgen)
- [Official WebAssembly tool](https://raylibtech.itch.io/rfxgen)
