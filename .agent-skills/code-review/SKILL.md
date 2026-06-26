---
name: code-review
description: ">"
compatibility: ">"
allowed-tools: Read Grep Glob Bash Write
metadata:
  tags: code-review, pull-request-review, diff-review, security-review, risk-review, pre-merge
  platforms: Claude, ChatGPT, Gemini, Codex
  version: 2.1
  source: akillness/jeo-skills
---






# Code Review

Use this skill when the main question is **"is this specific change ready, what evidence do we trust, and what should a reviewer actually say?"**

The job is not to dump a giant clean-code checklist.
The job is to:
1. normalize the review packet,
2. choose the right review mode,
3. inspect the highest-risk behavior first,
4. separate missing evidence from proven defects,
5. classify findings by severity,
6. route non-review work out immediately.

Read [references/intake-packets-and-escalations.md](references/intake-packets-and-escalations.md) before handling an unfamiliar review packet.
Read [references/review-modes.md](references/review-modes.md) for deeper heuristics by change type.
Read [references/handoff-boundaries.md](references/handoff-boundaries.md) when deciding whether `code-review`, `git-workflow`, `debugging`, `testing-strategies`, `web-design-guidelines`, `web-accessibility`, or repo/PR workflow skills should own the next step.

## When to use this skill
- Reviewing a PR, MR, local diff, patch stack, or self-review packet before merge
- Deciding what reviewer comments matter most and how severe they are
- Checking a change for correctness, security, migration/rollout risk, maintainability, and missing validation evidence
- Writing a concise approve / request-changes / block / route-out review brief
- Reviewing backend, frontend, CLI, fullstack, or game-programming changes where the core task is judgment on the change rather than implementation

## When not to use this skill
- **The real task is splitting commits, rebasing, conflict resolution, or push recovery** → use `git-workflow`
- **The real task is reproducing or isolating a live failure** → use `debugging`
- **The real task is choosing long-term coverage shape, CI gates, or flaky-suite policy** → use `testing-strategies`
- **The real task is pure design, accessibility, or visual-governance critique** → use `web-design-guidelines` or `web-accessibility`
- **The real task is reviewer assignment, CODEOWNERS interpretation, labels, merge queue, or repo settings** → use a repo / PR workflow skill
- **The real task is measurement-led bottleneck analysis or tuning** → use `performance-optimization`

## Instructions

### Step 1: Normalize the review packet
Start from the evidence already present instead of asking for an idealized packet.

Capture:
- review surface: PR / MR / local diff / patch stack / self-review
- goal of the change
- hotspots: API, UI, schema, auth, config, build/release, game runtime, tooling, unknown
- packet shape: diff only | diff + tests | schema/auth rollout notes | screenshots/preview | CI bot findings | game/runtime validation notes | mixed
- obvious evidence present or missing

Minimum frame:
```markdown
Review surface: PR
Goal: add coupon support to checkout
Hotspots: discount logic, schema migration, auth edge cases
Packet: diff + tests, no rollout notes
```

If the packet is still mostly branch hygiene or repo-admin work, route out before pretending review has started.

### Step 2: Choose one primary review mode
Pick one primary mode from [references/review-modes.md](references/review-modes.md):
- general change review
- backend / platform review
- frontend / UX-adjacent review
- game-programming / engine review
- policy / meta review

Rule: one primary mode, optional secondary mode.
Do not flatten every diff into the same checklist.

### Step 3: Inspect the highest-risk path first
Prioritize in this order:
1. broken correctness or edge-case handling
2. security / privacy / trust-boundary mistakes
3. schema, migration, config, rollout, or compatibility risk
4. missing or misleading tests / screenshots / previews / rollout proof
5. maintainability problems that will slow future work
6. style and readability nits

High-value questions:
- Can the change behave incorrectly even if current tests are green?
- Did a trust boundary, permission rule, secret path, or user-controlled input change?
- Did the change alter schemas, contracts, jobs, rollout behavior, or game/runtime state without enough safeguards?
- Is the packet missing the one artifact needed to judge the risky path honestly?

### Step 4: Separate findings from missing evidence
A review can fail because the code is wrong **or** because the packet is not convincing enough.

Evidence sources to check:
- the diff itself
- nearby code paths and existing invariants
- tests and fixtures
- schema / contract / migration notes
- screenshots, recordings, or preview links for behavior/layout-sensitive frontend work
- rollout notes, config changes, and CI bot findings
- playtest or engine-validation notes for game/runtime work

Good finding shape:
```markdown
[Blocker] The new API still trusts the client-provided discount amount. Recompute discount server-side and add a regression test for mismatched input.
```

Good missing-evidence shape:
```markdown
[Major] The diff changes responsive navigation states, but the packet has no screenshots or preview link for mobile/tablet open-close behavior.
```

### Step 5: Classify severity and route-outs
Use a small, explicit severity model.

- **Blocker** — merge should not proceed: correctness break, security issue, data loss, broken migration, or clearly missing validation for a risky path
- **Major** — important but fixable in the current review round: missing tests/evidence for a core path, incomplete rollout/migration story, or a high-maintenance design choice
- **Minor** — readability, naming, local cleanup, optional simplification
- **Route-out** — the concern is real, but another skill owns the next step

Typical route-outs:
- commit cleanup / rebase / push safety → `git-workflow`
- reproduce and isolate live failure → `debugging`
- broader coverage policy or flaky-suite direction → `testing-strategies`
- visual/accessibility/product polish review → `web-design-guidelines` or `web-accessibility`
- reviewer assignment, CODEOWNERS, branch rules, merge queue, PR operations → repo / PR workflow skill

### Step 6: Produce a reviewer-grade decision brief
Preferred shape:
```markdown
# Code Review Brief

## Decision
- Approve | Request changes | Block pending investigation | Needs follow-up from another skill

## Review frame
- Surface:
- Goal:
- Primary mode:
- Packet:

## Key findings
1. [Severity] ...
2. [Severity] ...
3. [Route-out] ...

## Missing evidence
- ...

## Recommended next step
- merge
- patch specific issues
- collect one missing artifact
- split the diff
- route next to another skill
```

If approving, say why the change looks safe:
- risky areas reviewed
- evidence that exists
- residual concerns, if any

### Step 7: Escalate confidence honestly
- If the diff is too large, say review confidence is limited and focus on the highest-risk slice.
- If frontend or marketing-site behavior depends on rendering states, ask for preview evidence instead of bluffing.
- If backend or rollout risk is high, demand migration/config/rollback proof before approval.
- If game/runtime behavior still needs playtest or engine validation, state that clearly.
- If bot findings exist (reviewdog, CI comments, static-analysis annotations), treat them as evidence inputs, not as the final review judgment.

## Output format
Always return a concise review brief or review-comment set.

Required qualities:
- identify the review surface and change goal
- focus on the highest-risk findings first
- separate concrete defects from missing evidence
- choose an explicit decision
- name the correct neighboring skill when the task has shifted
- avoid generic checklist filler

## Examples

### Example 1: Backend PR with migration risk
**Input**
> Review this PR that adds coupon support to the checkout API. There is a schema migration and a few tests.

**Output sketch**
- Decision: Request changes
- Review frame: backend / platform review, packet = diff + tests + migration
- Key findings:
  1. [Blocker] discount value is still accepted from the client instead of recomputed server-side
  2. [Major] migration lacks rollback/backfill notes and no compatibility test covers old rows
  3. [Major] no test for invalid or expired coupon race conditions
- Recommended next step: patch validation + add migration/test evidence, then re-review

### Example 2: Frontend diff that needs preview evidence
**Input**
> Can you code-review this responsive navbar change before I merge it?

**Output sketch**
- Decision: Needs follow-up before approval
- Summary: implementation may be maintainable, but behavior cannot be fully judged from the diff alone
- Key findings:
  1. [Major] missing mobile/tablet screenshots or preview link for menu states
  2. [Minor] duplicated breakpoint logic should be centralized
  3. [Route-out] accessibility or visual-polish checks should go through `web-design-guidelines` / `web-accessibility`

### Example 3: Request that should route away
**Input**
> Before review, help me split this huge branch into smaller commits and rebase it cleanly.

**Output sketch**
- Decision: Route out
- Summary: this is primarily a Git-structure problem, not review judgment yet
- Route: `git-workflow`

### Example 4: Review packet with bot annotations
**Input**
> reviewdog already commented on the lint and static-analysis issues. Can you do the final review pass?

**Output sketch**
- Treat the bot comments as inputs, not the full answer
- Re-check the risky behavior, missing evidence, and merge decision
- Route repo-admin follow-up elsewhere if the request shifts into PR operations

## Best practices
1. Review the highest-risk behavior before style or formatting.
2. Tie every serious finding to evidence from the diff, nearby code, tests, or one clearly missing artifact.
3. Distinguish missing evidence from proven bugs.
4. Use severity labels so authors know what blocks merge.
5. Keep one primary review mode instead of flattening every diff into one checklist.
6. Ask for previews/screenshots when rendered behavior matters.
7. Demand rollout or migration proof when backend/platform risk is high.
8. Treat CI bots and static-analysis comments as evidence inputs, not as the reviewer.
9. Route Git, debugging, test-policy, UI-governance, and repo-admin tasks out instead of absorbing everything.
10. If approving, say why the change looks safe — not just "LGTM".

## References
- [GitHub Docs — About pull request reviews](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/about-pull-request-reviews)
- [GitHub Docs — About code owners](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners)
- [GitHub Docs — About protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [GitLab Docs — Merge request approvals](https://docs.gitlab.com/ee/user/project/merge_requests/approvals/)
- [reviewdog](https://github.com/reviewdog/reviewdog)
- [Danger JS](https://danger.systems/js/)
