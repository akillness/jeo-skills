# API-key agent loop

## Server contract (upstream Animato)

Base URL defaults to `http://localhost:8000`; uploads and exports are served under `/public/...`.

| Endpoint | Purpose | Notes |
|---|---|---|
| `POST /api/upload` | multipart upload of `.fbx` / `.gltf` / `.obj` | validated by loading it in `bpy`, stored in `public/upload/` |
| `GET /api/files` | list uploaded models | same shape as the upload response |
| `POST /api/prompt` | `{filename, message}` → the full bpy prompt | includes scene units, armature, every bone, existing animation, and a bpy 5.x cheat-sheet |
| `POST /api/run` | execute a bpy script | `text/plain` body preferred; ```` ```python ```` fences tolerated; separate process, 300 s timeout |
| `POST /api/chat` | prompt + LLM call + execute, server-side | `{api_key, endpoint, model, filename, message, history}`; credentials are per-request, never stored |
| `POST /api/animation/remove` | delete a named clip | fixed deterministic `bpy`, no AI |

`/api/run` returns HTTP 200 even when the script failed — branch on `ok`, never on the status code.

## Two modes, one inference each

- **`--mode local` (default)** — `/api/prompt` → one LLM call from the agent → static gate → `/api/run`.
  The generated script is written to `--out-dir` before anything executes, so a bad script is a
  reviewable artifact instead of an overwritten model.
- **`--mode server`** — hand `{api_key, endpoint, model, filename, message}` to `/api/chat` and let
  Animato do the round trip. Simpler, but the server executes the script the moment the model
  answers; `animato_agent.py` can then only report a *post-hoc* gate result.

Both modes spend exactly one inference per animation. Do not build retry loops that re-ask the
model on every `bpy` warning — re-read the prompt dump and fix the request instead.

## Credentials and configuration

| Variable | Default | Meaning |
|---|---|---|
| `ANIMATO_SERVER` | `http://localhost:8000` | Animato base URL |
| `ANIMATO_API_KEY` | — | LLM key; `GEMINI_API_KEY` / `OPENAI_API_KEY` are fallbacks |
| `ANIMATO_PROVIDER` | `gemini` | `gemini` (`:generateContent`) or `openai` (`/chat/completions`) |
| `ANIMATO_LLM_ENDPOINT` | `https://generativelanguage.googleapis.com/v1beta` | provider base **including** the version segment |
| `ANIMATO_MODEL` | `gemini-3-flash-preview` | model id; upstream's editor ships this Gemini free-tier example |

The key is read from the environment or `--api-key`, sent per request, and never printed or written
to `--out-dir`. Model ids change often — set `ANIMATO_MODEL` rather than trusting the default.

## Failure routing

| Symptom | Read this before re-prompting |
|---|---|
| gate rejects a stale API call | the prompt already contains the bpy 5.x cheat-sheet; state the Blender version explicitly in `--message` |
| gate rejects "no keyframe_insert" | the model summarized instead of writing code — shorten the request to one concrete motion |
| `/api/run` returns `ok: false` | inspect `stderr` for the real bone name; bone names come from the prompt dump, not from guesses |
| model animates but the viewer shows nothing | the export dropped animation (`bake_anim` / `export_animations`) or the viewer never calls `mixer.update(delta)` |
| `.obj` upload | `.obj` carries no skeleton and cannot be animated — re-export a rigged `.fbx`/`.gltf` |

## Route-outs

- Authoring rigs, retargeting mocap, or hand-keying a full shot → use Blender directly; this loop
  writes one short script per motion.
- Real-time gameplay VFX and effect budgets → `game-vfx`.
- Playing the exported clip in a browser viewer → the Three.js skills (`threejs-animation`,
  `threejs-loaders`); Animato's job ends at the baked file.
- Free-form multi-tool agent orchestration → this skill deliberately stays at one inference per
  animation and one auditable script.
