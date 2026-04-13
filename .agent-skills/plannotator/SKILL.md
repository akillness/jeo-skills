---
name: plannotator
description: >
  Review and annotate AI agent plans or diffs in a visual browser UI, then approve,
  request changes, or archive the result with structured feedback. Use when a human
  needs a plan-review gate before implementation, wants visual diff review after
  coding, or needs to save reviewed plans to Obsidian/Bear. Triggers on: plan
  review, diff review, approve plan, request changes, visual code review,
  plannotator, planno, annotate plan, review agent plan, and save reviewed plans.
allowed-tools: Read Bash Write
compatibility: >
  Best for Claude Code, Codex CLI, Gemini CLI, OpenCode, and orchestration flows
  like JEO where an agent already produced a plan or diff and a human wants a
  browser-based approval loop. Not for creating the plan itself or for broad code
  review policy.
license: MIT
metadata:
  tags: plan, planning, planno, plannotator, plan-review, diff-review, code-review, claude-code, opencode, codex, gemini, annotation, visual-review, obsidian, bear-notes
  platforms: Claude, OpenCode, Codex, Gemini
  keyword: plan
  version: "1.0.0"
  source: backnotprop/plannotator
---

# plannotator

Use this skill when the main job is **reviewing an agent-produced plan or diff in a visual UI before work proceeds**.

`plannotator` is the **human approval gate**, not the planner itself.
It sits between:
- plan/spec creation (`task-planning`, `ralph`)
- execution orchestration (`jeo`, `vibe-kanban`, `bmad`)
- downstream code/UI feedback (`code-review`, `agentation`)

Read these support docs before making setup or routing decisions:
- [references/review-modes-and-boundaries.md](references/review-modes-and-boundaries.md)
- [references/platform-setup.md](references/platform-setup.md)
- [references/notes-and-troubleshooting.md](references/notes-and-troubleshooting.md)

## When to use this skill
- A coding agent already produced an implementation plan and a human must approve or request changes before coding starts
- You want to review a git diff visually after implementation and send targeted feedback
- You need a browser-based annotation loop instead of a long chat reply
- You want to save reviewed plans to Obsidian or Bear after approval or for team reference
- You need a clear install / integration path for Claude Code, Codex CLI, Gemini CLI, or OpenCode

## When not to use this skill
- **The main job is creating or improving the plan itself** → use `task-planning`, `ralph`, or another planning/spec skill first
- **The main job is broad PR judgment, policy review, or risk-based approval criteria** → use `code-review`
- **The main job is UI screenshot annotation that should drive code fixes** → use `agentation`
- **The main job is orchestration, kanban movement, or multi-agent execution state** → use `jeo` or `vibe-kanban`
- **The main job is generic note-taking or wiki curation** → use `obsidian` / `llm-wiki`

## Instructions

### Step 1: Classify the review mode
Normalize the request into one primary mode:

```yaml
plannotator_mode:
  primary_mode: plan-review | diff-review | note-export | platform-setup | troubleshooting
  artifact_ready: yes | no
  platform: claude | codex | gemini | opencode | unknown
  feedback_goal: approve | request-changes | archive | unknown
  repo_context: git-repo | markdown-only | remote-container | unknown
```

Use one primary mode per run. If the user is vague, default to the smallest obvious interpretation:
- existing plan to review → `plan-review`
- existing code changes to inspect → `diff-review`
- save reviewed plan → `note-export`
- install/integrate plannotator → `platform-setup`

### Step 2: Verify the artifact exists before opening review
`plannotator` is only useful once something concrete exists.

Checklist:
1. A plan, diff, or markdown file already exists.
2. The user wants human review, not plan generation.
3. For diff review, a git repo or commit range is available.
4. For note export, plannotator is running in the right mode and saving is configured.

If the artifact is missing, route out instead of forcing the review tool.

### Step 3: Choose the smallest review path

#### A. Plan review
Use when a plan exists and the human wants to approve or request changes before execution.

Typical flow:
1. Ensure plannotator is installed and integrated for the current platform.
2. Trigger the plan-review UI from the platform’s normal plan/hook flow.
3. Annotate with one concrete intent at a time:
   - `delete`
   - `insert`
   - `replace`
   - `comment`
4. End in one explicit outcome:
   - **Approve** → implementation can proceed
   - **Request changes** → agent replans with structured feedback
   - **Archive / save** → store the plan without advancing work

#### B. Diff review
Use when the code already changed and the human wants visual line-level review.

Typical flow:
```bash
# current working tree
bash scripts/review.sh

# specific commit
bash scripts/review.sh HEAD~1

# branch diff
bash scripts/review.sh main...HEAD
```

Use diff review when the code exists. If the user is still deciding the approach, route back to plan review first.

#### C. Note export
Use when the review result should be saved to Obsidian or Bear.

Use this only after confirming the relevant save path is configured. Keep note export secondary to the review decision; it is not the main trigger for the skill.

#### D. Platform setup
Use when the user needs plannotator installed or connected to Claude / Codex / Gemini / OpenCode.

Start with:
```bash
bash scripts/install.sh
bash scripts/check-status.sh
```

Then choose the platform-specific setup from [references/platform-setup.md](references/platform-setup.md).

### Step 4: Keep boundaries explicit
Use these route-outs aggressively:
- **Need the plan written or refined?** → `task-planning`, `ralph`
- **Need a broader approval / risk / correctness review of code changes?** → `code-review`
- **Need UI screenshot markup that should turn into code fixes?** → `agentation`
- **Need orchestration state, ledger updates, or multi-agent gating?** → `jeo`, `vibe-kanban`
- **Need note-system management beyond reviewed plan export?** → `obsidian`, `llm-wiki`

### Step 5: Prefer structured, low-ambiguity annotations
Good annotations are:
- narrow
- tied to one issue
- actionable
- anchored to a specific plan step or diff line range
- explicit about expected acceptance criteria

Bad annotations are:
- vague (“this feels wrong”)
- multi-issue bundles
- generic style commentary with no requested change
- hidden planning work that should have happened before review

### Step 6: Use the script bundle instead of ad hoc commands
Available scripts:
- `scripts/install.sh` — install CLI and optional integrations
- `scripts/setup-hook.sh` — Claude Code hook setup
- `scripts/setup-gemini-hook.sh` — Gemini setup
- `scripts/setup-codex-hook.sh` — Codex setup
- `scripts/setup-opencode-plugin.sh` — OpenCode setup
- `scripts/check-status.sh` — integration/status verification
- `scripts/configure-remote.sh` — remote/devcontainer/WSL setup
- `scripts/review.sh` — diff review launcher

If you need the exact per-platform commands, caveats, or remote-mode notes, read the support references instead of bloating the main flow.

### Step 7: Return one of these output shapes
Preferred outputs:

```markdown
# plannotator Review Brief

## Mode
- Primary mode:
- Why it fits:

## Artifact
- What is being reviewed:
- Review surface:
- Platform:

## Next action
1. command / trigger
2. review action
3. outcome decision

## Route-outs
- Neighboring skills to use before/after this step:

## Risks / caveats
- Setup prerequisites:
- Known limitations:
```

Or:

```markdown
# plannotator Setup Brief

## Platform
- Claude / Codex / Gemini / OpenCode

## Install
- exact commands

## Verification
- status checks
- how to trigger review

## Caveats
- remote mode / note export / known limitations
```

## Examples

### Example 1: Plan approval gate
**Input**
> The agent proposed a 6-step implementation plan. I want to inspect it visually and either approve it or send corrections back before coding starts.

**Good output direction**
- mode: `plan-review`
- verify the plan already exists
- trigger plannotator through the platform’s normal plan-review flow
- annotate one issue per change
- finish with approve vs request-changes
- route plan-creation work back to `task-planning` if the plan is missing or too immature

### Example 2: Review a recent code diff
**Input**
> The agent already changed three files. Open the visual diff review and let me mark up the changes.

**Good output direction**
- mode: `diff-review`
- verify git repo / diff range
- use `bash scripts/review.sh` with the right target
- keep broader approval-policy questions routed to `code-review`

### Example 3: Save reviewed plans to notes
**Input**
> I want reviewed plans saved to Obsidian so my team can revisit them later.

**Good output direction**
- mode: `note-export`
- verify save integration prerequisites and hook-mode caveat
- explain how review output gets saved
- route broader vault-management work to note-taking skills

## Best practices
1. Treat `plannotator` as the visual approval gate, not the planning engine.
2. Review one concrete artifact at a time.
3. Use one annotation per issue whenever possible.
4. Keep the final outcome explicit: approve, request changes, or archive.
5. Use `scripts/check-status.sh` before debugging cross-platform integration issues.
6. Move platform/setup specifics into references so the core skill stays short and trigger-friendly.
7. When in doubt, route planning/spec generation and orchestration state to neighboring skills instead of stretching this one.

## References
- [GitHub: backnotprop/plannotator](https://github.com/backnotprop/plannotator)
- [Official site: plannotator.ai](https://plannotator.ai)
- [references/review-modes-and-boundaries.md](references/review-modes-and-boundaries.md)
- [references/platform-setup.md](references/platform-setup.md)
- [references/notes-and-troubleshooting.md](references/notes-and-troubleshooting.md)
