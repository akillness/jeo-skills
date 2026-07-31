# Upstream and adaptation boundary

Upstream project: [otdnnc/Animato](https://github.com/otdnnc/Animato) — MIT, a local FastAPI +
`bpy` 5.x backend with a React/three.js editor that turns a rigged model plus a text request into a
baked animation. Requirements upstream states: Python 3.13 with `uv` (no separate Blender install —
`bpy` is a project dependency), Node 20+ for the frontend, and `uv run fastapi run main.py` to serve
UI and API on one origin at `:8000`. Development mode runs the API on `:8000` and Vite on `:5173`,
with `VITE_API_URL` pointing the UI at another backend.

## What this skill ships

Original, stdlib-only tooling that drives the **API-key path** of that server:

- `scripts/animato_agent.py` — upload / prompt / one inference / static gate / execute, plus
  `doctor`, `files`, `validate`, `run`, and `remove` subcommands.
- `scripts/validate_bpy_script.py` — static gate for model-written `bpy` scripts.
- `scripts/selftest.py` — offline verification of the loop against a stub server and stub LLM.
- `references/example-bpy-script.py` — a gate-passing example of the required script shape.

No upstream source, model, or asset is vendored or copied here. Endpoint shapes, the destructive
overwrite behavior, the `.obj` limitation, and the bpy 5.x cheat-sheet rationale are taken from the
upstream README; the agent loop, the gate, and the self-test are this skill's own work.

## Safety notes carried over from upstream

- `/api/run` (and `/api/chat`, which runs the model's output) executes arbitrary Python **by
  design**. The child process isolates `bpy` crashes; it does not sandbox the code. Keep the server
  local/trusted.
- The generated script **overwrites the uploaded file in place**. Keep a copy of anything you cannot
  re-upload.
- API keys are per-request and never stored server-side; this skill likewise reads keys from the
  environment and never writes them to `--out-dir`.

## Drift to re-check before trusting the defaults

Model ids (`ANIMATO_MODEL` defaults to upstream's `gemini-3-flash-preview` example), provider
endpoints, and the response field names of `/api/chat` are the parts most likely to move. Run
`animato_agent.py doctor` and one `--dry-run` animate against a fresh checkout before assuming the
defaults still match.
