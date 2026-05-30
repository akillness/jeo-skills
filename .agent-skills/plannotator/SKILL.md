---
name: plannotator
description: >
  Routing-first visual approval gate for AI agent plans, markdown specs, and diffs.
  Use when a human needs to review a concrete plan before execution, inspect a
  targeted diff in a browser, mark up a spec/PRD/architecture note, or set up
  the review loop on Claude Code, Gemini CLI, Codex CLI, or OpenCode. Route
  planning/spec creation to `task-planning` or `ralph`, broad PR-policy review
  to `code-review`, rendered-UI critique to `agentation`, and fresh-session
  browser verification to `browser-harness`.
allowed-tools: Read Bash Write
compatibility: >
  Best for Claude Code, Gemini CLI, Codex CLI, OpenCode, and orchestration flows
  like JEO where an agent already produced a plan, spec artifact, or diff and a
  human wants a browser-based approval loop. Not for creating the plan itself,
  owning merge policy, or doing generic UI screenshot review.
license: MIT
metadata:
  tags: plan, plannotator, plan-review, diff-review, spec-review, markdown-review, claude-code, codex, gemini, opencode, annotation, visual-review, obsidian, bear-notes
  platforms: Claude, OpenCode, Codex, Gemini
  keyword: plan
  version: "1.1.0"
  source: backnotprop/plannotator
  modernization: 2026-04-13
  hardening: 2026-04-19
---

# plannotator

Use this skill when the job is to **classify one review packet, open the smallest honest visual review path, and leave broad planning / PR policy / UI critique work outside the front door**.

`plannotator` is not the planner.
It is the **human approval gate** that sits between:
- plan/spec creation (`task-planning`, `ralph`)
- orchestration/runtime ownership (`jeo`, `vibe-kanban`, `bmad`)
- broader PR/code judgment (`code-review`)
- rendered-UI bug markup (`agentation`)
- clean browser verification (`browser-harness`)

Read these support docs first:
- [references/intake-packets-and-route-outs.md](references/intake-packets-and-route-outs.md)
- [references/platform-setup.md](references/platform-setup.md)
- [references/notes-and-troubleshooting.md](references/notes-and-troubleshooting.md)

## When to use this skill
- A coding agent already produced an implementation plan and a human must approve or request changes before coding starts.
- A concrete git diff, commit range, or PR exists and the reviewer wants browser-based line-targeted feedback.
- A markdown artifact such as a spec, PRD, architecture note, or generated plan package needs visual review and revision feedback.
- The user needs to connect `plannotator` to Claude Code, Gemini CLI, Codex CLI, or OpenCode and the main job is setup for the review loop.
- The review flow exists but remote mode, stable URLs/ports, or platform-specific behavior is flaky and needs targeted troubleshooting.

## When not to use this skill
- **The main job is writing or refining the plan/spec itself** → `task-planning`, `ralph`, or `survey`
- **The main job is broad PR policy, merge criteria, risk judgment, or code-owner approval** → `code-review`
- **The main job is exact rendered-UI critique that should drive frontend fixes** → `agentation`
- **The main job is clean disposable browser automation or deterministic website verification** → `browser-harness`
- **The main job is task orchestration, board state, or multi-agent routing** → `jeo`, `vibe-kanban`, `bmad`
- **The main job is note taxonomy, wiki curation, or long-term note-system management** → `obsidian`, `llm-wiki`

## Instructions

### Step 1: Classify the review packet first
Normalize the request into one primary packet before discussing commands.

```yaml
plannotator_intake:
  primary_packet: plan-review | diff-review | markdown-review | platform-setup | troubleshooting
  artifact_ready: yes | no
  artifact_type: plan | git-diff | pr | markdown-spec | generated-response | unknown
  platform: claude | gemini | codex | opencode | mixed | unknown
  trigger_mode: native-hook | manual-review | unknown
  feedback_goal: approve | request-changes | annotate | archive | unknown
  repo_context: git-repo | markdown-only | remote-container | unknown
  confidence: high | medium | low
```

Default to the smallest obvious interpretation:
- existing implementation plan → `plan-review`
- existing code changes / PR / commit range → `diff-review`
- existing spec or markdown artifact → `markdown-review`
- install/integration question → `platform-setup`
- flaky remote/browser/status issue → `troubleshooting`

### Step 2: Verify the concrete artifact exists
`plannotator` only helps once something concrete can be reviewed.

Checklist:
1. A plan, diff, PR, markdown file, or generated response already exists.
2. The user wants **review**, not plan generation.
3. For diff review, a git repo, PR URL, or explicit commit range exists.
4. For markdown/spec review, the file or generated artifact is identifiable.
5. For note export, save/integration is configured; treat it as secondary, not the main packet.

If the artifact is missing, route out instead of forcing the review tool.

### Step 3: Choose exactly one review packet
Use the router in [references/intake-packets-and-route-outs.md](references/intake-packets-and-route-outs.md) and pick one primary packet:
- `plan-review`
- `diff-review`
- `markdown-review`
- `platform-setup`
- `troubleshooting`

List anything else as follow-up, not as a co-owner.

### Step 4: Run the chosen packet
- **Plan review** → confirm the runtime can hand the plan into `plannotator`, use the native/hook path when real, annotate one issue per step, and end with **approve**, **request changes**, or **archive/save**.
- **Diff review** → use a concrete target and launch the smallest diff packet:
  ```bash
  bash scripts/review.sh
  bash scripts/review.sh HEAD~1
  bash scripts/review.sh main...HEAD
  ```
- **Markdown review** → confirm the spec/PRD/architecture file exists, use annotation/review mode directly, and be explicit when the runtime only supports annotation rather than a stronger approval path.
- **Platform setup** → start with:
  ```bash
  bash scripts/install.sh
  bash scripts/check-status.sh
  ```
  then use [references/platform-setup.md](references/platform-setup.md).
- **Troubleshooting** → start with:
  ```bash
  bash scripts/check-status.sh
  bash scripts/configure-remote.sh
  ```
  then use [references/notes-and-troubleshooting.md](references/notes-and-troubleshooting.md).

### Step 5: Keep manual-vs-hook reality explicit
- Claude and Gemini are the clearest native/hook-driven plan-review fits.
- Codex has public hooks, but upstream `plannotator` still documents the practical path as manual diff/markdown review or partial setup.
- OpenCode users explicitly asked for more manual control when auto-invocation is too eager.

Do **not** flatten this into “all platforms work the same.”

### Step 6: Route adjacent work aggressively
- planning/spec creation or refinement → `task-planning`, `ralph`, `survey`
- orchestration state or multi-agent routing → `jeo`, `vibe-kanban`, `bmad`
- broad PR policy, merge gating, or risk judgment → `code-review`
- rendered UI bug markup → `agentation`
- clean disposable browser verification → `browser-harness`
- note/vault/wiki administration beyond saving reviewed artifacts → `obsidian`, `llm-wiki`

### Step 7: Use a short output contract
Preferred output:

```markdown
# plannotator Review Packet
- Primary packet:
- Artifact:
- Platform + trigger mode:
- Next action:
- Outcome or limitation:
- Route-outs:
```

For setup-heavy asks, use a short setup brief with:
- platform
- native-hook vs manual-review status
- install commands
- verification steps
- caveats

## Examples

### Example 1: Approve a concrete plan
**Input**
> The agent already proposed a 6-step implementation plan. I want to inspect it visually and either approve it or send corrections back before coding starts.

**Good output direction**
- choose `plan-review`
- verify the plan already exists
- use the runtime's real review surface
- annotate one issue per step
- end with approve vs request-changes
- route plan creation back out if the plan is still immature

### Example 2: Review a diff
**Input**
> The agent already changed three files. Open the visual diff review for `main...HEAD` and let me leave targeted feedback.

**Good output direction**
- choose `diff-review`
- verify git context / diff range
- use `bash scripts/review.sh main...HEAD`
- keep broader PR-policy review routed to `code-review`

### Example 3: Review a PRD/spec artifact
**Input**
> I want to mark up this architecture note and either accept it as-is or send revision feedback before we continue.

**Good output direction**
- choose `markdown-review`
- verify the markdown artifact exists
- explain whether the current platform supports native approval or manual annotation only
- keep note export secondary and route wiki/vault management outward

### Example 4: Codex setup reality check
**Input**
> Set up plannotator for Codex so I can review plans before code runs.

**Good output direction**
- choose `platform-setup`
- start with install + status verification
- explain the current Codex manual/partial reality honestly instead of promising parity that upstream docs do not show
- route broad hook/platform policy work outward if needed

## Best practices
1. Treat `plannotator` as a visual approval gate, not the planning engine.
2. Review one concrete artifact at a time.
3. Keep manual-review vs native-hook differences explicit.
4. Use one annotation per issue whenever possible.
5. End with a clear outcome: approve, request changes, annotate only, or archive.
6. Keep note export secondary to the review packet.
7. Route PR policy, orchestration, and rendered-UI critique to neighboring skills instead of stretching `plannotator`.

## References
- [GitHub: backnotprop/plannotator](https://github.com/backnotprop/plannotator)
- [Official site: plannotator.ai](https://plannotator.ai)
- [references/intake-packets-and-route-outs.md](references/intake-packets-and-route-outs.md)
- [references/platform-setup.md](references/platform-setup.md)
- [references/notes-and-troubleshooting.md](references/notes-and-troubleshooting.md)
- [references/review-modes-and-boundaries.md](references/review-modes-and-boundaries.md)
