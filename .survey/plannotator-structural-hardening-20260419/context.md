# Context: plannotator structural hardening

## Workflow Context
`plannotator` belongs in the handoff between **agent planning** and **agent execution**. In upstream docs, Claude-style flows intercept plan exit, open a browser review UI, accept inline annotations, then either approve implementation or send revision feedback back to the agent ([README](https://github.com/backnotprop/plannotator/blob/main/README.md), [apps/hook/README.md](https://github.com/backnotprop/plannotator/blob/main/apps/hook/README.md)). Gemini follows the same plan-review pattern, while Codex currently exposes manual diff/markdown review but not first-class plan interception in upstream `plannotator` yet ([apps/codex/README.md](https://github.com/backnotprop/plannotator/blob/main/apps/codex/README.md)).

The adjacent market default is still **PR-first review after code exists**. GitHub Copilot’s cloud-agent flow centers on plan → branch → pull request, and most policy gates live in branch protection, CODEOWNERS, and required reviews rather than a dedicated pre-code approval UI ([research-plan-iterate](https://docs.github.com/en/copilot/how-tos/copilot-on-github/use-copilot-agents/research-plan-iterate), [protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches), [CODEOWNERS](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners)). That means `plannotator` only stays distinct if it clearly owns the visual review gate **before execution** and the targeted diff/annotation loop around concrete artifacts.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Solo coding-agent operator | Review an implementation plan before letting the agent mutate code | Intermediate |
| Tech lead or reviewer | Mark up a concrete git diff or PR with line-targeted feedback | Intermediate to advanced |
| Spec-driven workflow owner | Review markdown artifacts such as PRDs/specs/architecture notes and decide approve vs revise | Intermediate |
| Codex / OpenCode power user | Work around weaker or more manual plan-review integration | Advanced |
| Remote / container operator | Keep review URLs, ports, and browser handoff stable across repeated review cycles | Advanced |

## Current Workarounds
1. **Use hook interception where the runtime supports it.** Claude and Gemini rely on hookable plan-review boundaries; OpenCode uses plugin/event integration ([README](https://github.com/backnotprop/plannotator/blob/main/README.md), [apps/hook/README.md](https://github.com/backnotprop/plannotator/blob/main/apps/hook/README.md)).
2. **Fall back to manual review commands when hook support is weak or too eager.** Codex users use manual review/annotate flows; OpenCode users asked for manual “review the last plan” behavior rather than automatic interception ([apps/codex/README.md](https://github.com/backnotprop/plannotator/blob/main/apps/codex/README.md), [issue #479](https://github.com/backnotprop/plannotator/issues/479)).
3. **Use markdown annotation as a stand-in for plan/spec approval.** This works for spec-driven loops, but approval semantics are weaker than the explicit approve/request-changes flow of plan review ([issue #570](https://github.com/backnotprop/plannotator/issues/570)).
4. **Use diff review as the fallback approval checkpoint.** Recent upstream releases invested heavily in merge-base diffs, PR worktrees, and AI review agents when plan interception is unavailable ([v0.17.0](https://github.com/backnotprop/plannotator/releases/tag/v0.17.0), [v0.17.1](https://github.com/backnotprop/plannotator/releases/tag/v0.17.1)).
5. **Pin remote-mode ports or URLs manually.** Remote/devcontainer/SSH users need stable review endpoints so another human or agent can re-open the same session ([apps/hook/README.md](https://github.com/backnotprop/plannotator/blob/main/apps/hook/README.md), [issue #589](https://github.com/backnotprop/plannotator/issues/589)).

## Adjacent Problems
- **Auto-intercept vs manual invocation ambiguity.** Users like the review UI but do not want every planning agent or build agent to trigger it automatically ([issue #479](https://github.com/backnotprop/plannotator/issues/479)).
- **Artifact approval semantics differ by mode.** Plan review supports approve/request-changes, but markdown annotation still lacks an equally strong approve path for spec workflows ([issue #570](https://github.com/backnotprop/plannotator/issues/570)).
- **Platform capability mismatch remains visible.** Codex now has public hook docs, but upstream `plannotator` still frames Codex as diff/manual-first, creating a route-out gap the skill should explain honestly ([Codex hooks](https://developers.openai.com/codex/hooks), [issue #497](https://github.com/backnotprop/plannotator/issues/497), [issue #576](https://github.com/backnotprop/plannotator/issues/576)).
- **PR-native review systems are the market default.** GitHub, Reviewable, Gerrit, and CodeRabbit all assume the first serious human checkpoint is a pull request or change list, not a pre-code visual plan gate.
- **Review-session continuity matters.** Stable ports, URLs, and repeatable sessions become important once review is part of the workflow rather than a one-shot UI flourish ([issue #589](https://github.com/backnotprop/plannotator/issues/589)).

## User Voices
- “I really enjoy Plannotator when I want to call it, but invoking itself on the OpenCode Plan mode is a bit annoying.” / “I don't want the build agent to call it.” ([issue #479](https://github.com/backnotprop/plannotator/issues/479))
- “Plannotator's annotation UI is a perfect fit for reviewing these artifacts” but `plannotator annotate` still lacks a true approve/accept path for spec workflows ([issue #570](https://github.com/backnotprop/plannotator/issues/570)).
- “OpenAI recently introduced a new hook system for Codex... it should be possible to implement a similar ‘Plan Review’ workflow for Codex users.” ([issue #497](https://github.com/backnotprop/plannotator/issues/497))
- “In practice, the install script appears to only install the plannotator binary. It does not add anything to Codex itself.” ([issue #576](https://github.com/backnotprop/plannotator/issues/576))
- “When using another agent to review, this means I have to tell it what the new port is when I ask it to re-review the plan.” ([issue #589](https://github.com/backnotprop/plannotator/issues/589))
