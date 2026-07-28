# Open Design Control Contract

## Use One Shared Runtime

Use the installed Open Design desktop release so the GUI, daemon, CLI, MCP, project store, and preview renderer all address the same data. On macOS, `/usr/bin/od` is a binary-dump utility, not Open Design. Prefer:

```bash
od
```

Do not hardcode a daemon port. The packaged app chooses a dynamic port. Discover it from the packaged daemon log or let the CLI/MCP sidecar discover it:

```text
~/Library/Application Support/Open Design/namespaces/release-stable/logs/daemon/latest.log
```

Verify health with `GET <daemon-url>/api/health`.

The packaged CLI must discover the desktop daemon through the stable sidecar socket before it can mint the
desktop import token. Export this for every headless CLI call (an explicit `--daemon-url` is not sufficient
for folder import):

```bash
export OD_SIDECAR_IPC_PATH=/tmp/open-design/ipc/release-stable/daemon.sock
```

## Model Contract

Before a design run, verify Open Design reports:

```text
agent: codex
model: gpt-5.6-sol
reasoning: ultra
```

The packaged config currently lives under the Open Design namespace data directory in `app-config.json`. Prefer the app/API configuration surface over editing it by hand. Open Design 0.14.1 advertises reasoning choices only through `xhigh`, while Codex 0.144.1 reports that `gpt-5.6-sol` also supports `max` and `ultra`; `ultra` is the highest level. Configure `agentCliEnv.codex.CODEX_BIN` to a local wrapper that prepends `-c model_reasoning_effort="ultra"`, start the Open Design run without a lower explicit reasoning override, and verify the spawned process arguments. Record effective model/reasoning evidence, not only intent.

The Open Design run event may report `reasoning: null` because no lower request-level override was sent. That
is expected. The acceptance evidence is the spawned Codex command line containing
`model_reasoning_effort="ultra"`, plus the handoff manifest recording `gpt-5.6-sol / ultra`.

## Project Loop

Before import, run `open-design-game-ui-handoff` and require a valid `preservation-contract.json`. The imported
folder must contain current runtime stills plus video/keyframes for every motion-critical surface. The Open Design
run is authoritative only for component axes explicitly assigned in that contract; omission means
`unspecified-preserve-runtime`.

Import the complete handoff folder so Open Design and the external Codex session share the same files:

```bash
od project import-folder /absolute/path/to/handoff \
  --name "Darkbone Archer Steam Meta UI" --json
```

Start a run in that project:

```bash
od run start \
  --project <project-id> \
  --agent codex \
  --model gpt-5.6-sol \
  --message "You are crafting AAA dark-fantasy game UI for 冥骨魂殿 (Darkbone Archer), a gothic-Egyptian underworld game. Read in this order: (1) DESIGN.md — the creative brief; (2) darkbone-visual-language.md — the craft bible: real palette tokens, material CSS recipes (engraved gilt plates, breathing soul-glow, rune march), layout grammar, motion personality; (3) open exemplar-craft.html — your output must MATCH OR EXCEED this craft level; (4) brief.md + README.md for scope; (5) preservation-contract.json — hard boundaries (omission = preserve runtime, never delete). Build the requested interactive artifact only; do not edit runtime source. Make the 100% version gorgeous FIRST — every container engraved/chamfered/material, primary object dominant, one orchestrated entry per screen — then annotate density fallbacks. Before returning, run the 7-point game-feel checklist in the visual language doc against every screen; if any surface reads as a web dashboard, redo it before returning." \
  --json
```

Immediately bind the live child process and successful result package:

```bash
node .agents/skills/open-design-game-ui-concept/scripts/capture_open_design_generation_evidence.mjs \
  --run=<run-id> \
  --artifact=<artifact.html> \
  --out=.omc/artifacts/open-design-generation-evidence/<run-id>.json
```

The resulting evidence must show one successful `codex` run, the live child PID, only `gpt-5.6-sol` model
overrides, only `model_reasoning_effort=ultra` reasoning overrides, the result-package artifact name, immutable
revision URL, and exact artifact SHA-256. A prompt or config claim without live process capture is insufficient.

Use `od run info <run-id>`, `od run watch <run-id>`, and `od run result-package <run-id> --json` for status and output discovery. Do not cancel a healthy `running` run because it is quiet while the model is thinking.

**Follow-up / iteration runs**: `od run start --message` on the project's default conversation silently drops
the message after the first generation — the plugin pipeline reports instant `converged` and the resumed codex
child receives no new prompt (it answers "未收到新的具体任务"). For every follow-up (acceptance fixes, owner
feedback), first create a side chat and run on it:

```bash
od chat new --project <project-id> --seed-from <first-conversation-id> \
  --title "acceptance fix round N" --json          # returns conversation.id
od run start --project <project-id> --conversation <new-conversation-id> \
  --agent codex --model gpt-5.6-sol --message "<self-contained fix brief>" --json
```

Project files are shared across conversations, so the new run edits the same artifact. Keep the fix message
self-contained (tell it to re-read DESIGN.md / the craft docs); the seeded side chat may start with zero
copied messages. Verify within ~30s (events.jsonl narration) that the run actually engaged the task instead
of reporting no-task; capture fresh generation evidence for every fix run because the artifact SHA changes.

BYOK third-party engines (e.g. Kimi K3 via byok-opencode) truncate single large file writes: a ~1500-line
one-shot write ends the run with the target file untouched (the run may report `succeeded` after planning, or
fail `empty_output` with one auto-retry). For big artifacts, instruct the engine to write INCREMENTALLY
(5-8 smaller edits: skeleton → markup → JS systems → APIs → verify), and always check the artifact byte size
after any "succeeded" run before trusting it.

Generated game-UI artifacts run infinite ambient animations by design (breathing glow, sheen, particles) —
an Open Design GUI preview window left open renders them at a full CPU core forever. Close project preview
windows/tabs when a session ends, and check for orphaned `Open Design Helper (Renderer)` processes
(`ps aux | grep "Open Design Helper (Renderer)"`) after long sessions; kill any that survive quitting the app.

After a fix run completes, the daemon may register the new immutable revision with a short lag — a
`preview-url` fetched immediately can still point at the PREVIOUS revision, so the capture gate re-tests
stale bytes and re-reports fixed findings. Before rerunning the capture, refetch `preview-url`, confirm the
URL/revision id changed, and spot-check the fetched content for one fixed marker.

The REST equivalents are `POST /api/projects`, `POST /api/runs`, `GET /api/runs/:id`, `GET /api/projects/:id/files`, and `GET /api/projects/:id/preview-url?file=<name>`. MCP exposes the same project/file/run lifecycle. Prefer semantic CLI/MCP/API operations over GUI automation.

## Review Loop

1. Open the project in the Open Design GUI.
2. Get the artifact preview URL from the daemon.
3. Capture the artifact independently with Playwright at the contract viewports and locales.
4. Build the Chinese screenshot review HTML.
5. Feed owner feedback into a follow-up run in the same project/conversation.
6. Preserve generated files and run metadata in Open Design; keep local screenshot/review outputs outside git.

**Independent review scoring model (owner rule, 2026-07-19): all blind/comparative review scoring runs on
`codex exec -m gpt-5.6-sol -c model_reasoning_effort=high` with images/videos attached via `-i`** — not
gpt-5.5. Shuffle/anonymize candidate labels to avoid position and identity bias.

**Motion-bearing artifacts (VFX / RIG / animation / reveal choreography) must never be scored on stills
alone.** Stills flatten timing curves, easing, anticipation, and secondary motion — a stills-only panel
systematically under-scores mature motion work (measured 2026-07-19: a shipped Claude Design VFX lab scored
last on stills while the owner judged it far ahead live). Score them on screen-recorded video of driven
interactions (or a live session), with per-candidate evidence parity: drive every candidate's controls to
the same beats/states before comparing.

Do not start runtime implementation from a technically green artifact alone. Apply the upgrade-only aesthetic
gate, obtain owner design approval, then use `open-design-game-ui-takeover` for the separate integration phase.

GUI review is evidence, not the only control surface. Codex must remain able to list projects, inspect files, start/follow runs, read artifacts, and capture previews without manual clicks.
