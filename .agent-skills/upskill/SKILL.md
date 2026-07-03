---
name: upskill
description: >
  Turn a weak/cheap "Flash" model into a "Pro" performer by wrapping HKUDS
  UpSkill — captures agent session failures, has a strong Teacher model
  analyze them and draft a skill, then validates it against the weak Student
  model in a closed Ralph Loop (up to 3 rounds) before storing it for
  automatic reuse. Use when the user wants to install UpSkill, run
  `/upskill-init`, `/upskill-configure`, `/upskill-build`, `/upskill-run`,
  `/upskill-list`, `/upskill-status`, `/upskill-mode`, `/upskill-model`,
  `/upskill-remove`, or `/upskill-uninstall`, wants a cheap model to perform
  closer to a Pro model without switching, or wants a good session (success
  or failure) distilled into a validated skill. Triggers on: upskill,
  up-skill, flash to pro, teacher student distillation, ralph loop skill
  validation, distill agent failures into skills. Routes skill-quality
  ratcheting to `skill-autoresearch`, scaffolding to `write-a-skill`, and
  spec-compliance rewrites to `skill-standardization`.
allowed-tools: Bash Read Write Edit Glob Grep WebFetch
compatibility: >
  Reference implementation targets Claude Code (session hooks + skills +
  CLAUDE.md context injection). Requires bash, python3, git, and curl (for
  remote install). The Teacher/Student roles are model presets in
  `~/.claude/upskill.conf`, independent of the daily driver model set in
  Claude Code `settings.json`. The core building pipeline (worktree isolation,
  Ralph Loop, skill store) is harness-agnostic per upstream docs; porting to
  Codex/OpenClaw/Cursor needs an equivalent session-hook + context-injection
  layer.
metadata:
  tags: upskill, knowledge-distillation, teacher-student, ralph-loop, skill-generation, claude-code-hooks, terminal-bench, cost-optimization
  platforms: Claude Code
  keyword: upskill
  version: "1.0.0"
  license: MIT
  upstream: https://github.com/HKUDS/UpSkill
  installer: "curl -sSL https://raw.githubusercontent.com/HKUDS/Upskill/main/cc-integration/install.sh | bash -s -- --remote"
  source: akillness/jeo-skills
---

# upskill — Distill Agent Failures Into Validated Skills

> **Keyword**: `upskill` · `flash to pro` · `teacher student distillation` · `ralph loop skill validation`

[HKUDS/UpSkill](https://github.com/HKUDS/UpSkill) (MIT) turns a cheap/weak
"Flash" model into a "Pro" performer without a model upgrade. When a session
fails, it captures the full context, has a strong **Teacher** model analyze
the failure and draft a skill, then validates that skill against the weak
**Student** model in a closed **Ralph Loop** (up to 3 rounds) before storing
it. Validated skills auto-inject into every future session via a CLAUDE.md
index (always in context) plus a full `SKILL.md` loaded on demand. On
Terminal-Bench 2.0, a Flash model + UpSkill (**51.6%** pass rate, **$0.04**/task)
beat the Pro model it was validated against (**50.0%**, **$0.06**/task) — a
**41% lower cost** result documented in [`tb_harbor_2.0/RESULTS.md`](https://github.com/HKUDS/UpSkill/blob/main/tb_harbor_2.0/RESULTS.md).

This skill is the routing-first wrapper: it installs the tool, wires the
three roles (Daily / Teacher / Student), and walks the daily
capture → build → validate → serve loop.

## When to use this skill

- The user wants to install UpSkill or run any `/upskill-*` slash command
- The user wants a cheap model ("Flash", Haiku, mini, DeepSeek-Flash) to
  perform closer to a Pro model on recurring task categories
- A session just failed and the user wants to turn that failure into a
  reusable, validated skill instead of just retrying manually
- The user wants to distill a **successful** session into a reusable skill
  (not just failures — `/upskill-build` works on either)
- The user asks how the Ralph Loop, Teacher/Student roles, or skill-store
  serve modes (`interactive` vs `auto`) work

## When not to use this skill

- The user wants generic guidance on writing or standardizing a `SKILL.md`
  from scratch → use `write-a-skill` or `skill-standardization`
- The user wants a repo-local skill-quality **ratcheting loop** (freeze a
  benchmark, mutate one change, keep/revert by score) for *this* jeo-skills
  repo → use `skill-autoresearch`
- The user wants a general model fine-tuning / RLHF pipeline → that changes
  weights; UpSkill only prepends context, it never trains anything
- The user is not on Claude Code and has no equivalent session-hook /
  context-injection surface → see [Porting](#porting-to-other-agent-harnesses)
  first; do not promise parity with an unadapted harness

## The three roles

| Role | Set in | Purpose |
|------|--------|---------|
| **Daily model** | Claude Code `settings.json` | Whatever the user runs day to day — untouched by UpSkill |
| **Teacher** | `~/.claude/upskill.conf` | Strong model — analyzes failures, drafts skills (e.g. `claude-opus-4-7`, `deepseek-v4-pro[1m]`) |
| **Student** | `~/.claude/upskill.conf` | Weak model — every skill must be validated against it before storage (e.g. `claude-haiku-4-5`, `deepseek-v4-flash`) |

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| Claude Code | Reference integration lives in `cc-integration/` |
| bash, python3, git | Required by hooks and the build pipeline |
| curl | Only for the remote one-line installer |
| API access to a Teacher and a Student model | Anthropic or DeepSeek recommended by upstream |

## Instructions

### Step 1 — Install

```bash
# Remote (recommended)
curl -sSL https://raw.githubusercontent.com/HKUDS/Upskill/main/cc-integration/install.sh | bash -s -- --remote

# Local (from a cloned repo)
git clone https://github.com/HKUDS/UpSkill && cd UpSkill/cc-integration && bash install.sh

# Or via this skill's wrapper script (adds jeo-skills plugin registration too)
bash scripts/install.sh                 # remote install (default)
LOCAL_REPO=/path/to/UpSkill bash scripts/install.sh   # install from an existing clone
```

This writes `~/.claude/{hooks,skills,upskill-store}/` and
`~/.claude/upskill.conf`. To update later, run `/upskill-init` inside Claude
Code — it re-runs the installer and migrates legacy config.

### Step 2 — Configure Teacher / Student models

Edit `~/.claude/upskill.conf`:

```bash
UPSKILL_TEACHER="deepseek-v4-pro[1m]"   # or: claude-opus-4-7
UPSKILL_STUDENT="deepseek-v4-flash"     # or: claude-haiku-4-5
UPSKILL_SERVE_MODE="interactive"        # interactive (default) | auto
```

The Daily model is unaffected — it stays whatever Claude Code's own
`settings.json` selects. Run `/upskill-model` to view the current preset, or
`bash ~/.claude/hooks/upskill-store.sh sync` after a manual edit.

### Step 3 — Enable building per project

```bash
/upskill-configure
```

Merges `UserPromptSubmit`, `SessionStart`, and `SessionEnd` hooks plus a
`claudeMd` pointer into `.claude/settings.local.json` for the current
project — additive, never overwrites existing hook entries.

### Step 4 — Use the agent normally; skills build themselves

A `SessionEnd` hook captures a failed session (verify.sh present, non-zero
exit) and sets a pending flag. Next session start, Claude Code prints:

```
[upskill] ⚠ 1 pending failure(s) ready for building. Run /upskill-build to generate skills.
```

Run `/upskill-build` (works on failures **and** successes) and the pipeline
runs through 5 phases in an isolated git worktree — see
[references/pipeline-and-ralph-loop.md](references/pipeline-and-ralph-loop.md)
for the full Teacher → generate → Ralph-validate sequence.

### Step 5 — Serve

Validated skills appear automatically in the agent's context via the global
`~/.claude/upskill-store/CLAUDE.md` index (~5 lines/skill). In **interactive**
mode (default), run `/upskill-run` to browse matches (★ = recommended) and
apply one. In **auto** mode, skills are keyword-matched on every prompt and
proactively suggested. Switch modes with `/upskill-mode auto|interactive`.

### Step 6 — Manage the library

```bash
/upskill-list                                   # browse skills by category
/upskill-status                                 # skill count + active builds
/upskill-remove --category data-analysis --skill-id skill_20260605_001
/upskill-uninstall                              # remove hooks/skills/config
```

Full command reference: [references/commands.md](references/commands.md).

## How it works — the Ralph Loop

Most distillation approaches stop at "Teacher writes advice, hope it helps."
UpSkill closes the loop instead: the Student **retries the task with the
draft skill applied**, and if it still fails, the Teacher revises based on
"what went wrong even with guidance" — up to 3 rounds — discarding the skill
if it never passes. This calibrates every stored skill to what the Student
model can actually follow, not generic best practices. Architecture,
worktree isolation, and the 3-file skill format (Domain Knowledge /
Step-by-Step / Feedback-Lessons) are detailed in
[references/pipeline-and-ralph-loop.md](references/pipeline-and-ralph-loop.md).

## Porting to other agent harnesses

The core pipeline (build script, Ralph Loop, skill store) is harness-agnostic;
only the hook-integration and context-injection layer is Claude Code-specific.
Porting to Codex, OpenClaw, or Cursor needs: (1) before/after-session hook
equivalents, (2) a CLAUDE.md-equivalent auto-loaded context mechanism, (3)
slash-command equivalents, (4) worktree/sandbox isolation for Teacher/Student
runs. Do not claim full parity on an unadapted harness — state the gap.

## Output format

When the user asks `upskill` for help, return a compact brief:

```markdown
# upskill Routing Brief

## Scope
- Stage: install | configure-models | configure-project | build | serve | manage
- Roles: Teacher=<model> Student=<model> (Daily model unaffected)
- Serve mode: interactive | auto

## Recommended next move
- one concrete `/upskill-*` command or install step

## Why
- 2-3 bullets grounded in the user's packet

## Route-outs
- `skill-autoresearch` for repo-local skill-quality ratcheting
- `write-a-skill` / `skill-standardization` for hand-authoring a SKILL.md
```

## Examples

### Example 1: First-time setup for a cost-conscious team
Install with the remote one-liner, set `UPSKILL_TEACHER="claude-opus-4-7"` and
`UPSKILL_STUDENT="claude-haiku-4-5"` in `~/.claude/upskill.conf`, then run
`/upskill-configure` in each active project. The Daily model stays whatever
the team already uses in `settings.json`.

### Example 2: A recurring CSV-parsing task keeps failing on Haiku
After a failure, `/upskill-build` picks the failed session, the Teacher
drafts a skill, and the Ralph Loop retries it against Haiku up to 3 rounds.
Once it passes, the skill auto-appears in the global CLAUDE.md index and is
offered via `/upskill-run` (interactive) or auto keyword-match next time a
similar CSV task starts.

### Example 3: Distilling a successful session
`/upskill-build` is not failure-only — run it on a session that went well to
capture the working approach as a reusable, Student-validated skill before
the pattern is forgotten.

## Best practices

1. **Never let Teacher == Student.** Validation is meaningless if the model
   analyzing failures is the same one being validated against.
2. **Build from successes too**, not only failures — `/upskill-build` accepts
   both, and good working patterns are just as worth distilling.
3. **Trust the Ralph Loop's discard.** A skill that fails all 3 rounds is
   dropped by design — do not manually force-save an unvalidated draft.
4. **Match serve mode to review appetite.** `interactive` (default) keeps a
   human in the loop per task; `auto` trades that for zero-friction matching.
5. **Re-run `/upskill-init` after upstream releases** instead of hand-patching
   `~/.claude/hooks/*.sh` — it migrates legacy config safely.
6. **Route pure skill-authoring or spec-compliance asks elsewhere** — this
   skill owns the distillation pipeline, not generic `SKILL.md` writing.

## References

- Upstream repo: <https://github.com/HKUDS/UpSkill>
- Full CC integration docs: <https://github.com/HKUDS/UpSkill/blob/main/cc-integration/README.md>
- Terminal-Bench 2.0 results: <https://github.com/HKUDS/UpSkill/blob/main/tb_harbor_2.0/RESULTS.md>
- Command reference: [references/commands.md](references/commands.md)
- Pipeline + Ralph Loop detail: [references/pipeline-and-ralph-loop.md](references/pipeline-and-ralph-loop.md)
- Installer script: [scripts/install.sh](scripts/install.sh)
- Adjacent skills: `../skill-autoresearch/SKILL.md`, `../write-a-skill/SKILL.md`,
  `../skill-standardization/SKILL.md`
- License: MIT (see upstream `LICENSE`)
