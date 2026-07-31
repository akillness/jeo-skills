# jeo-skills — LLM Installation Delegation Guide

> **For AI agents:** read this guide in full, detect the host OS and installed coding
> agents, then perform the requested installation. The default mode is **full**. Use
> **core only** or **minimal** only when the user explicitly asks for that narrower mode.

> **Preserve existing work:** add or update jeo-skills targets only. Never run a remove,
> clear, reset, or cleanup command against existing skill directories. Never delete an
> unrelated skill or replace an agent's entire configuration file.

## Outcomes and modes

| Mode | Trigger | Outcome |
|---|---|---|
| `full` | Default | Install every jeo-skills skill, register supported MCP/shell tools, and configure detected integrations. |
| `core` | User says “core only” | Install the `starter` bundle through `jeo-skill`; do not install the entire catalog. |
| `minimal` | User says “minimal” | Install only the `jeo-skill` router and its CLI link; skip MCP, shell, and plugin setup. |

A full install installs the skill documents plus the explicitly listed shared tools below.
It does **not** download every app, model weight, media runtime, SDK, or service mentioned
inside all skills. Those remain on demand when a real task selects the corresponding skill.

## Step 1 — Detect OS, prerequisites, and coding agents

Determine the platform before choosing paths or package managers:

```bash
case "$(uname -s 2>/dev/null || echo Windows)" in
  Darwin*) PLATFORM=macos ;;
  Linux*) PLATFORM=linux ;;
  MINGW*|MSYS*|CYGWIN*) PLATFORM=windows ;;
  *) PLATFORM=windows ;;
esac

if [ "$PLATFORM" = windows ]; then
  USER_HOME="${USERPROFILE:-$HOME}"
else
  USER_HOME="$HOME"
fi
SKILLS_ROOT="$USER_HOME/.agents/skills"
REPO_URL="https://github.com/akillness/jeo-skills"

printf 'platform=%s\nhome=%s\nskills_root=%s\n' "$PLATFORM" "$USER_HOME" "$SKILLS_ROOT"
for cmd in node npm npx python3 claude codex gemini opencode cursor agy pi crush jeo gjc jeopi; do
  command -v "$cmd" >/dev/null 2>&1 && printf 'found: %s\n' "$cmd"
done
```

Install only missing prerequisites. Prefer the native package manager:

- macOS: Homebrew (`brew install node python uv`);
- Linux: the detected distro manager, or Snap when that is the managed option
  (`sudo snap install node --classic`; install Python 3 through the distro);
- Windows: Winget (`winget install OpenJS.NodeJS.LTS Python.Python.3.12 astral-sh.uv`),
  then run Bash snippets in Git Bash or WSL2.

Verify Node/npm/npx and Python before continuing:

```bash
node --version
npm --version
npx --version
python3 --version
```

## Step 2 — Install the skills CLI

```bash
if ! command -v skills >/dev/null 2>&1; then
  npm install -g skills
fi
skills --version
```

## Step 3 — Build non-duplicating agent targets

The skills CLI accepts runtime IDs, not executable names. Always target `universal`; it
populates `~/.agents/skills`, which Codex, Gemini CLI, OpenCode, Cursor, jeo-code, GJC,
and jeopi can share. Add a dedicated target only when that runtime uses a distinct root.
Do **not** pass unsupported IDs such as `jeo`, `gjc`, or `jeopi`.

```bash
SKILLS_AGENT_ARGS=(-a universal)
command -v claude >/dev/null 2>&1 && SKILLS_AGENT_ARGS+=(-a claude-code)
(command -v agy >/dev/null 2>&1 || command -v antigravity >/dev/null 2>&1) \
  && SKILLS_AGENT_ARGS+=(-a antigravity)
(command -v pi >/dev/null 2>&1 && [ -d "$USER_HOME/.pi/agent" ]) \
  && SKILLS_AGENT_ARGS+=(-a pi)
command -v crush >/dev/null 2>&1 && SKILLS_AGENT_ARGS+=(-a crush)
printf 'skills targets:'; printf ' %q' "${SKILLS_AGENT_ARGS[@]}"; printf '\n'
```

`codex`, `gemini-cli`, `opencode`, and `cursor` also map to the shared root, so adding
all of those alongside `universal` would create redundant platform exposure rather than
additional skills.

## Step 4 — Install the requested scope

### Default: full

Unless the user said “core only” or “minimal”, install every live skill:

```bash
skills add -g "$REPO_URL" --skill '*' "${SKILLS_AGENT_ARGS[@]}" --yes --copy --full-depth
```

### Core only

```bash
skills add -g "$REPO_URL" --skill jeo-skill "${SKILLS_AGENT_ARGS[@]}" --yes --copy --full-depth
python3 "$SKILLS_ROOT/jeo-skill/scripts/jeo-skill.py" link
jeo-skill install --bundle starter --global --yes
```

### Minimal

```bash
skills add -g "$REPO_URL" --skill jeo-skill "${SKILLS_AGENT_ARGS[@]}" --yes --copy --full-depth
python3 "$SKILLS_ROOT/jeo-skill/scripts/jeo-skill.py" link
jeo-skill doctor
```

Stop here in minimal mode. In core mode, install only dependencies explicitly required
by the selected starter skills; do not continue into the full shared-tool setup by default.

## Step 5 — Full-mode shared tools

Run this step only in full mode. Reuse working installations and make every registration
idempotent: inspect/list first, add only when missing, and never rewrite a whole config.

### RTK shell output compaction

```bash
if ! command -v rtk >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then
    brew install rtk
  elif [ "$PLATFORM" = windows ]; then
    printf '%s\n' 'Install the matching rtk.exe from https://github.com/rtk-ai/rtk/releases or use WSL2.'
  else
    curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh
    export PATH="$USER_HOME/.local/bin:$PATH"
  fi
fi
command -v rtk >/dev/null 2>&1 && rtk init -g
```

Do not use `cargo install rtk`; crates.io contains an unrelated package with that name.

### Semble CLI and MCP server

```bash
if ! command -v uvx >/dev/null 2>&1; then
  if [ "$PLATFORM" = windows ]; then
    powershell -NoProfile -Command "irm https://astral.sh/uv/install.ps1 | iex"
  else
    curl -LsSf https://astral.sh/uv/install.sh | sh
    export PATH="$USER_HOME/.local/bin:$USER_HOME/.cargo/bin:$PATH"
  fi
fi
command -v semble >/dev/null 2>&1 || uv tool install 'semble[mcp]'

if command -v claude >/dev/null 2>&1 && ! claude mcp list 2>/dev/null | grep -q '^semble'; then
  claude mcp add semble -s user -- uvx --from 'semble[mcp]' semble
fi
if command -v codex >/dev/null 2>&1 && ! codex mcp list 2>/dev/null | grep -q '^semble'; then
  codex mcp add semble -- uvx --from 'semble[mcp]' semble
fi
```

For another detected agent, use its documented MCP command/config surface; do not guess a
JSON/TOML schema or overwrite its existing settings.

### Ouroboros (`ooo`) MCP server

```bash
if ! command -v ouroboros >/dev/null 2>&1; then
  if command -v uv >/dev/null 2>&1; then
    uv tool install 'ouroboros-ai[all]'
  else
    python3 -m pip install --user 'ouroboros-ai[all]'
  fi
fi

if command -v claude >/dev/null 2>&1 && ! claude mcp list 2>/dev/null | grep -q '^ooo'; then
  claude mcp add ooo -s user -- ouroboros mcp serve
fi
if command -v codex >/dev/null 2>&1 && ! codex mcp list 2>/dev/null | grep -q '^ooo'; then
  codex mcp add ooo -- ouroboros mcp serve
fi
```

### Claude Code orchestration plugin

When Claude Code is detected, install the official marketplace plugin without removing
or replacing existing plugins:

```bash
if command -v claude >/dev/null 2>&1; then
  claude plugin marketplace add https://github.com/Yeachan-Heo/oh-my-claudecode || true
  claude plugin install oh-my-claudecode || true
fi
```

If the installed Claude version does not expose non-interactive plugin commands, report
these two commands for the user to run through Claude Code's `/plugin` interface instead
of editing plugin configuration by hand.

### Animato animation runtime (on demand)

The `animato` skill installs as documents plus stdlib-only scripts; it never installs Blender,
the upstream server, or a model key. Set those up only when a task actually animates a model:

```bash
# 1. upstream server (Python 3.13 + uv; bpy is a project dependency, no Blender install)
git clone https://github.com/otdnnc/Animato.git && cd Animato && uv sync
uv run fastapi run main.py            # UI + API on http://localhost:8000

# 2. the key the agent loop spends (free tier is enough — one inference per animation)
export ANIMATO_API_KEY=...            # or GEMINI_API_KEY / OPENAI_API_KEY

# 3. verify wiring, then the loop itself
python3 "$SKILLS_ROOT/animato/scripts/selftest.py"      # offline: stub server + stub LLM
python3 "$SKILLS_ROOT/animato/scripts/animato_agent.py" doctor
```

`selftest.py` needs neither the server nor a key, so it is safe to run during installation
verification. Skip steps 1–2 unless the user asked for animation work: `/api/run` and `/api/chat`
execute model-written Python by design and must stay on a trusted local machine.

### UniRig rigging runtime (on demand)

The `unirig` skill installs as documents plus shell/Python wrappers; it never clones the
upstream repository, downloads checkpoints, or installs CUDA wheels during setup. UniRig
inference needs Python 3.11 and an NVIDIA GPU, so prepare it only when a task actually rigs
a model:

```bash
# 1. readiness first — every blocking item is reported before any GPU work
bash "$SKILLS_ROOT/unirig/scripts/doctor.sh"

# 2. upstream checkout + dependencies (CUDA tag must match the machine)
bash "$SKILLS_ROOT/unirig/scripts/install.sh" --repo-only          # checkout only
bash "$SKILLS_ROOT/unirig/scripts/install.sh" --cuda cu121         # checkout + venv + deps

# 3. plan a run without executing it (works on any machine, including macOS)
bash "$SKILLS_ROOT/unirig/scripts/rig.sh" --input model.glb \
     --output out/model_rigged.glb --dry-run
```

`doctor.sh` and `rig.sh --dry-run` need neither a GPU nor the checkout, so both are safe during
installation verification. Skip step 2 unless the user asked for rigging work on a CUDA machine;
on macOS or a CPU-only box, route out per `unirig/references/route-outs-and-troubleshooting.md`
instead of forcing the install.

## Step 6 — Runtime-specific shared-root checks

- `jeo` and `jeopi` discover `~/.agents/skills` directly; no skills CLI agent ID is needed.
- GJC may require skill discovery to be enabled and `~/.agents/skills` added to its
  `skills.customDirectories`. Inspect its current config and merge only those keys; never
  replace the whole file.
- If an agent has no native skill loader, report that limitation rather than copying all
  skill folders into an unverified directory.

## Step 7 — Verify and report

```bash
skills list -g 2>/dev/null || npx --yes skills list --global
python3 "$SKILLS_ROOT/jeo-skill/scripts/jeo-skill.py" link
jeo-skill doctor
jeo-skill categories --json
command -v rtk >/dev/null 2>&1 && rtk gain
command -v semble >/dev/null 2>&1 && semble --help >/dev/null
command -v claude >/dev/null 2>&1 && claude mcp list
command -v codex >/dev/null 2>&1 && codex mcp list
```

Finally report:

1. detected OS and agents;
2. selected mode and installed skill count;
3. exact global and per-agent paths used;
4. MCP/shell/plugin registrations completed or skipped, with reasons;
5. verification output and any manual follow-up.

Compare pre-existing skill names captured before installation with the final listing. A
successful run adds or updates jeo-skills targets and leaves every unrelated pre-existing
skill present.
