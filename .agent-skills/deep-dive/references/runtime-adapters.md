# Deep Dive Runtime Adapters

Use this reference to keep the trace -> interview -> handoff contract portable.

## Adapter Selection

| Signal | Adapter | Use |
|--------|---------|-----|
| Claude Code, OMC plugin, `/team`, `/autopilot`, `/ralph` | `omc` | Claude-native trace/interview/execution bridge |
| Codex CLI, OMX, `$deep-interview`, `$ralplan`, `$team` | `omx` | Codex-native workflow skills and tmux team runtime |
| Gemini CLI, Antigravity, oh-my-agent, `oma`, `.agents/` | `oma` | Portable harness with Gemini/Antigravity surfaces |

If multiple signals exist, prefer the runtime the user explicitly named. If the user only asks for a portable artifact, use `oma` and save under `.agents/specs/`.

## Shared Artifact Contract

Every adapter must produce the same two durable files:

```text
deep-dive-trace-{slug}.md
deep-dive-{slug}.md
```

The trace file must contain:
- `## Observed Result`
- `## Ranked Hypotheses`
- `## Evidence Summary by Hypothesis`
- `## Evidence Against / Missing Evidence`
- `## Per-Lane Critical Unknowns`
- `## Rebuttal Round`
- `## Convergence / Separation Notes`
- `## Most Likely Explanation`
- `## Critical Unknown`
- `## Recommended Discriminating Probe`

The spec file must contain:
- `## Goal`
- `## Constraints`
- `## Non-Goals`
- `## Acceptance Criteria`
- `## Assumptions Exposed`
- `## Technical Context`
- `## Trace Findings`

Validate with:

```bash
python3 .agent-skills/deep-dive/scripts/validate_deep_dive_artifacts.py --trace <trace.md> --spec <spec.md>
```

## OMC Adapter

Use when the active runtime is Claude Code / oh-my-claudecode.

| Concern | Rule |
|---------|------|
| Specs | `.omc/specs/` |
| State | `.omc/state/` or `state_write(mode="deep-interview")` |
| Trace lanes | Claude team mode, `/team`, or sequential fallback |
| Interview | `/deep-interview` behavior with trace injection |
| Planning | `/omc-plan --consensus --direct <spec_path>` |
| Execution | `/autopilot`, `/ralph`, or `/team` with explicit `spec_path` |

Do not use OMC paths for Codex-only or Antigravity-only projects.

## OMX Adapter

Use when the active runtime is Codex CLI / oh-my-codex.

| Concern | Rule |
|---------|------|
| Specs | `.omx/specs/` |
| State | `.omx/state/` |
| Trace lanes | `$analyze`, `$trace`, `$team`, or `omx team` |
| Interview | `$deep-interview` with trace-derived opening context |
| Planning | `$ralplan "<spec_path>"` or `$plan "<spec_path>"` |
| Execution | `$ralph "<plan_or_spec_path>"` or `$team N:role "<spec_path>"` |

Codex runs the agent work; OMX supplies workflow skills and runtime state. Keep the deep-dive artifact schema stable so the handoff can work even if OMX implementation details change.

## OMA / Antigravity Adapter

Use when the active runtime is Gemini CLI, Antigravity, or portable `oh-my-agent`.

| Concern | Rule |
|---------|------|
| Specs | `.agents/specs/` |
| State | `.agents/state/` |
| Trace lanes | Gemini-native generated agents when available; otherwise `oma agent:parallel` |
| Interview | `/plan` or one-question Socratic loop using the same trace injection |
| Planning | `/plan` or `oma agent:spawn pm "<spec_path>" <session>` |
| Execution | `/work`, `/orchestrate`, or `oma agent:parallel` |

Antigravity can consume `.agents/agents/` as a portable surface, but it is not equivalent to Gemini-native custom subagent spawning. When custom parallelism is required, name the `oma` CLI fallback instead of implying Antigravity owns that capability natively.

## State Shape

Persist at least:

```json
{
  "source": "deep-dive",
  "runtime_adapter": "omc|omx|oma",
  "slug": "...",
  "trace_path": "...",
  "spec_path": "...",
  "current_phase": "...",
  "current_ambiguity": 0.0
}
```

State files are runtime artifacts. Keep them ignored at repo root unless a skill deliberately stores examples under `.agent-skills/`.
