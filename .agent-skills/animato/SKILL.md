---
name: animato
description: >
  Drive Animato (github.com/otdnnc/Animato) as an API-key agent loop that turns a rigged
  .fbx/.gltf model plus a plain-text motion request into a baked animation: upload the model,
  build the bpy prompt, spend one LLM call with your own key, gate the generated script, run it
  headless, and verify the animated output. Use when the user wants text-to-animation for a 3D
  character, an unattended animation pipeline driven by a Gemini or OpenAI-compatible API key,
  or help operating a local Animato server. Triggers on: animato, text to animation, animate a
  rigged model, bpy animation script, blender headless keyframe, /api/chat animation,
  character motion from a prompt, GEMINI_API_KEY animation.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: Local Animato server (FastAPI + bpy 5.x, Python 3.13/uv) with any Gemini or OpenAI-compatible API key; scripts are stdlib-only
metadata:
  tags: game-development, animation, blender, bpy, 3d, agent-loop, api-key
  version: "1.0.0"
  source: https://github.com/otdnnc/Animato
---

# Animato

## When to use this skill

- Animate a rigged `.fbx` / `.gltf` character from a text request without opening Blender.
- Run the animation loop unattended from a key (`ANIMATO_API_KEY` / `GEMINI_API_KEY` / `OPENAI_API_KEY`)
  instead of copy-pasting prompts into a chat window.
- Review or gate an LLM-written `bpy` script before a server executes it.
- Operate, debug, or health-check a local Animato server and its `/api/*` endpoints.

Route out when the job is rig authoring or mocap retargeting (use Blender directly), real-time
gameplay effects (`game-vfx`), or browser playback of the finished clip (`threejs-animation`,
`threejs-loaders`).

## Instructions

### Step 1: Capture one animation packet

Record before any call: the **model file** and its format, whether it is already uploaded, the
**motion request** in one sentence, the **provider/model/key** to spend, and whether the source file
is expendable. The generated script **overwrites the uploaded model in place** — if the source is
irreplaceable, copy it before uploading. `.obj` has no skeleton and cannot be animated.

### Step 2: Confirm the server and the key

```bash
uv run fastapi run main.py   # in the Animato checkout, serves UI + API on :8000
python3 .agent-skills/animato/scripts/animato_agent.py doctor
```

`doctor` checks server reachability, key presence (never printing the value), and the gate script.
Configure with `ANIMATO_SERVER`, `ANIMATO_PROVIDER` (`gemini` | `openai`), `ANIMATO_LLM_ENDPOINT`,
and `ANIMATO_MODEL`; see `references/agent-loop.md`.

### Step 3: Run the gated loop, not the raw endpoint

```bash
export ANIMATO_API_KEY=...   # free-tier key is enough; one inference per animation
python3 .agent-skills/animato/scripts/animato_agent.py animate \
  --file "./X Bot.fbx" --message "wave hello with the right arm, 2 seconds"
```

`--mode local` (default) does upload → `/api/prompt` → **one** LLM call → static gate → `/api/run`,
writing the prompt and the generated script into `--out-dir` (default `animato-out/`) so a failure
is a reviewable artifact. Use `--dry-run` to stop before execution, and `--mode server` only when
you accept that `/api/chat` executes the script before any gate can run.

### Step 4: Read the gate output before re-prompting

A rejected script means the request or the model choice was wrong, not that the loop should retry.

```bash
python3 .agent-skills/animato/scripts/validate_bpy_script.py animato-out/X-Bot.generated.py \
  --model-path public/upload/X-Bot.fbx
```

The gate refuses stale Blender APIs, missing keyframes, a missing frame range, a missing export,
`export_animations=True` / `bake_anim=True` omissions, format mismatches, and host-side calls such as
`subprocess`/`os.system`/`eval`. Full table: `references/bpy-script-contract.md`.

### Step 5: Verify the animated file, not just the HTTP status

`/api/run` returns HTTP 200 even for a failed script — branch on `ok`, then confirm `output_url`
loads and actually carries a clip (`gltf.animations` / FBX `.animations` non-empty, `mixer.update(delta)`
called every frame). Fix a wrong clip with a fresh request; drop a bad clip deterministically:

```bash
python3 .agent-skills/animato/scripts/animato_agent.py remove --filename X-Bot.fbx --name wave
```

### Step 6: Keep the loop honest

Treat `/api/run` and `/api/chat` as a local remote-code-execution surface: trusted machine only,
never public without a sandbox. Never spend more than one inference per animation on autopilot, and
never claim an animation works from a passing gate alone — the gate is static.

## Examples

### Verify the whole loop offline (no key, no Blender)

```bash
python3 .agent-skills/animato/scripts/selftest.py
```

Runs a stub Animato server and stub LLM through six cases: happy path, gate rejection blocking
execution, `--dry-run`, `/api/chat` mode, missing-key failure, and `doctor`.

### Animate a model that is already uploaded, with an OpenAI-compatible provider

```bash
ANIMATO_PROVIDER=openai ANIMATO_LLM_ENDPOINT=https://api.example.com/v1 ANIMATO_MODEL=my-model \
python3 .agent-skills/animato/scripts/animato_agent.py animate \
  --filename X-Bot.fbx --message "idle breathing loop, 3 seconds" --dry-run
```

### Inspect the prompt the server builds

```bash
python3 .agent-skills/animato/scripts/animato_agent.py prompt \
  --filename X-Bot.fbx --message "wave hello" --out prompt.txt
```

## Best practices

1. Copy the source model before uploading — the animated export replaces it in place.
2. Prefer `--mode local`: gate the script before execution instead of after.
3. Spend one inference per animation; fix the request or the prompt, do not loop the model.
4. Take bone names, axes, and units from the `/api/prompt` dump, never from an example script.
5. Keep the persisted prompt and generated script together so a bad result is diagnosable.
6. Keep the server local and trusted; keys stay in the environment, out of logs and artifacts.
7. Confirm the exported file plays before reporting success.

## References

- `references/agent-loop.md` — endpoints, modes, environment variables, failure routing.
- `references/bpy-script-contract.md` — gate rules and removed-API table.
- `references/example-bpy-script.py` — gate-passing script shape.
- `references/upstream.md` — provenance, requirements, safety boundary.
- [otdnnc/Animato](https://github.com/otdnnc/Animato)
