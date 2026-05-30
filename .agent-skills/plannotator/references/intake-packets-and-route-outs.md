# plannotator Intake Packets and Route-Outs

Use this file after the request is classified. The goal is to pick **one primary review packet** and keep planning, policy, browser verification, and UI-critique work outside the answer unless they are truly primary.

## Packet router

| Packet | Use when | First decisions | Common route-outs |
|---|---|---|---|
| `plan-review` | A concrete implementation plan already exists and a human must approve or request changes before execution | artifact exists, native-hook vs manual trigger, approve vs request-changes outcome, whether the plan is mature enough to review | `task-planning` / `ralph` if the plan still needs shaping; `jeo` / `vibe-kanban` if the real job is orchestration state |
| `diff-review` | Code already changed and the reviewer wants browser-based markup on a commit range, branch diff, or PR | diff target, repo context, whether the review is artifact-specific vs broad PR policy | `code-review` for merge criteria / broader risk judgment; `debugging` if root-cause isolation is the real job |
| `markdown-review` | The artifact is a spec, PRD, architecture note, generated plan package, or other markdown file | exact artifact path, annotation vs approval expectations, native vs manual review reality on the runtime | `task-planning` / `ralph` if the markdown is still being authored; `obsidian` / `llm-wiki` if durable note management is the real job |
| `platform-setup` | The main job is installing or connecting `plannotator` to Claude, Gemini, Codex, or OpenCode | CLI install, status check, native-hook vs manual-review support, remote-mode needs | `omc` / `omx` / `ohmg` when the issue is really broader runtime ownership rather than plannotator setup |
| `troubleshooting` | The review flow concept is correct but setup, browser opening, port stability, remote mode, or runtime behavior is failing | current status output, platform, remote mode, stable URL/port needs, whether the failure is actually upstream/runtime-specific | `system-environment-setup` for machine/runtime provisioning; neighboring platform skills when the blocker is outside plannotator |

## Selection rules
1. Pick the packet that answers the **current review job**, not every downstream concern.
2. If both plan review and platform setup are present, choose whichever is blocking progress now and list the other as follow-up.
3. If the artifact does not exist yet, do not fake review — route out to planning or artifact creation.
4. If the user really wants merge policy, CODEOWNERS, reviewer assignment, or broad PR governance, route to `code-review`.
5. If the user wants exact rendered-UI critique or clean disposable browser automation, route to `agentation` or `browser-harness` instead of stretching `plannotator`.

## Manual-vs-hook reality
- **Claude / Gemini:** strongest native or hook-driven plan-review story.
- **Codex:** treat manual review and partial setup as the honest default until upstream `plannotator` documents stronger plan-review parity.
- **OpenCode:** keep manual control visible because users explicitly asked for less eager auto-invocation.

## Invariants
- `plannotator` reviews **concrete artifacts**, not vague ideas.
- One packet per run is better than a mixed setup/review/policy lecture.
- Note export is secondary to the review packet.
- Stable ports/URLs matter in remote and multi-reviewer loops.
- The strongest distinct value is the **visual approval gate before silent workflow continuation**.

## Output reminder
A good answer ends with:
- primary packet
- artifact and platform
- native-hook vs manual-review status
- next command/trigger
- explicit outcome or limitation
- route-outs for adjacent work
