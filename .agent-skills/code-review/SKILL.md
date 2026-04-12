---
name: code-review
description: >
  Review diffs, pull requests, merge requests, and patch stacks for correctness,
  maintainability, security, test gaps, and rollout risk with a workflow-aware
  review pass. Use when the user wants to approve, block, or comment on a code
  change; assess review findings by severity; or decide whether a change needs
  deeper testing, debugging, UI review, or repo-policy follow-up. Triggers on:
  review this PR, inspect this diff, request changes, approve or block, code
  review checklist, what would you comment on, and pre-merge risk review.
allowed-tools: Read Grep Glob Bash Write
compatibility: >
  Best for code and change-set review across CLI/dev workflow, backend, frontend,
  fullstack, and game-programming repos. Not for local Git mechanics, runtime
  debugging, broad testing-program design, or pure UI/brand critique.
metadata:
  tags: code-review, pull-request-review, diff-review, security-review, risk-review, pre-merge
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "2.0"
  source: akillness/oh-my-skills
---

# Code Review

Use this skill when the main question is **"is this change ready, and what should a reviewer say about it?"**

The job is not to restate a generic clean-code checklist.
The job is to:
1. identify the review surface,
2. understand the intent and risk of the change,
3. look for the highest-value correctness and maintainability issues,
4. classify findings by severity,
5. decide whether to approve, request changes, or route to a neighboring skill.

Read [references/review-modes.md](references/review-modes.md) before handling an unfamiliar review situation.
Read [references/handoff-boundaries.md](references/handoff-boundaries.md) when deciding whether `code-review`, `git-workflow`, `debugging`, `testing-strategies`, `web-design-guidelines`, or hosted PR/repo workflows should own the next step.

## When to use this skill
- Reviewing a pull request, merge request, local diff, or patch stack before merge
- Deciding what reviewer comments matter most and how severe they are
- Checking a change for correctness, edge cases, security, maintainability, and missing validation
- Writing a review summary, approve/request-changes decision, or pre-merge risk brief
- Performing a self-review before asking teammates for review
- Reviewing backend, frontend, fullstack, CLI, or game-programming code when the core task is judgment on the change rather than implementation

## When not to use this skill
- **Branch cleanup, staging, rebase/merge choice, conflict resolution, or safe push recovery** → use `git-workflow`
- **Runtime bug isolation, flaky failure investigation, or root-cause debugging after a failure exists** → use `debugging`
- **Broad test-program design, test pyramid policy, or organization-wide QA strategy** → use `testing-strategies`
- **Pure UI consistency, accessibility, visual polish, or design-system compliance review** → use `web-design-guidelines` or `web-accessibility`
- **Hosted pull-request administration such as reviewer assignment, labels, branch protection, merge queue, or repo settings** → use a repo/PR workflow skill
- **Performance profiling and optimization planning** where the core task is measurement and tuning, not change review → use `performance-optimization`

## Instructions

### Step 1: Identify the review surface
Before commenting, define what is being reviewed.

Capture:
- review surface: PR / MR / local diff / patch stack / changelist
- goal of the change
- size of the change and obvious hotspots
- affected areas: API, UI, schema, auth, config, build/release, game runtime, tooling
- evidence available: tests, screenshots, preview links, rollout notes, issue/spec links

Quick frame:
```markdown
Review surface: PR
Goal: add coupon support to checkout API
Hotspots: discount logic, payment validation, schema migration
Evidence present: unit tests, API contract diff, no rollout plan
```

If the request is still mostly "help me clean up commits / split this branch / push safely", route to `git-workflow` first.

### Step 2: Choose the right review mode
Pick the mode that matches the change.

**General code-change review**
- correctness of logic
- maintainability and readability
- security and data handling
- missing tests or missing evidence

**Backend / platform review**
- migrations and backward compatibility
- authz/authn changes
- state transitions and failure modes
- rollout, config, and observability implications

**Frontend / UX-adjacent review**
- whether screenshots, previews, or interaction evidence are needed
- whether the diff hides state or layout behavior that needs a running preview
- whether the code is maintainable even if visual/UX critique belongs elsewhere

**Game-programming / engine review**
- gameplay/runtime correctness
- determinism/state sync risks
- config/data coupling
- where manual playtest or asset validation is still required because the diff is not enough

**Policy / meta review**
- PR missing description, tests, changelog, migration notes, or reviewer context
- oversized change that should be split before deep review

Use [references/review-modes.md](references/review-modes.md) for the detailed heuristics.

### Step 3: Scan for the highest-value risks first
Do not start with style nits.

Prioritize in this order:
1. **Broken correctness or missing edge-case handling**
2. **Security / privacy / trust-boundary mistakes**
3. **Data-loss / migration / rollout / compatibility risk**
4. **Missing or misleading tests / verification evidence**
5. **Maintainability problems that will slow future work**
6. **Minor readability or style issues**

Questions to ask:
- Can this produce the wrong behavior even if tests are green?
- Does it change trust boundaries, permissions, secrets, or user-controlled input handling?
- Does it alter schemas, contracts, background jobs, or release behavior without enough safeguards?
- Is there enough evidence that the author exercised the risky paths?
- Would a future maintainer understand and safely extend this code?

### Step 4: Review by evidence, not vibe
Tie each finding to something concrete.

Look for evidence in:
- the diff itself
- nearby code paths
- tests and fixtures
- schema or contract changes
- preview links / screenshots / recordings for UI-heavy work
- config or rollout notes
- changelog / migration notes / docs updates when relevant

Avoid unsupported claims like:
- "this feels wrong"
- "probably a bug"
- "needs more tests" without naming the missing case

Prefer findings like:
```markdown
Request changes — high
The new branch accepts `couponCode` in the request body, but the validation path still trusts the client-provided discount amount. A malicious client could send a valid code with an arbitrary discount. Recompute discount server-side and add a regression test covering mismatched input.
```

### Step 5: Classify findings by severity and route properly
Use a small, explicit severity model.

- **Blocker** — merge should not proceed: correctness break, security issue, data loss, broken migration, clear missing validation for a risky path
- **Major** — important but may be fixable within the same review round: missing tests for a core path, high-maintenance design, incomplete edge-case handling, missing rollout evidence
- **Minor** — readability, naming, local cleanup, optional simplification
- **Route-out** — the issue is real but belongs to another skill or workflow

Typical route-outs:
- commit hygiene / split diff / rebase choice → `git-workflow`
- reproduce and isolate an already-failing behavior → `debugging`
- broader coverage strategy or flaky-suite policy → `testing-strategies`
- visual/accessibility/product polish review → `web-design-guidelines` or `web-accessibility`
- reviewer assignment / branch policy / merge queue handling → repo/PR workflow skill

### Step 6: Produce a reviewer-grade output
A useful review result should help the human or agent act immediately.

Preferred format:
```markdown
# Code Review Brief

## Decision
- Approve | Request changes | Block pending investigation | Needs follow-up from another skill

## Summary
- 1-3 sentences on overall change quality and risk

## Key findings
1. [Severity] ...
2. [Severity] ...
3. [Route-out] ...

## Missing evidence
- tests / screenshots / migration notes / rollout notes / preview link / contract diff

## Recommended next step
- merge
- patch specific issues
- split the diff
- route next to another skill
```

If there are no serious problems, still say why the change looks safe:
- risky areas reviewed
- evidence that exists
- residual concerns, if any

### Step 7: Handle common review situations explicitly

**Large PR / diff dump**
- say review confidence is limited
- ask for or recommend splitting the change if signal is too diluted
- focus on the highest-risk slices instead of pretending a full deep review happened

**Frontend diff with weak visual evidence**
- note that code review is incomplete without screenshots, recordings, or a preview when behavior/layout matters
- still review maintainability and correctness of the implementation
- route visual critique to the appropriate design/accessibility skill if needed

**Backend change with schema/auth risk**
- check compatibility, failure behavior, rollback expectations, and missing tests around migrations or permissions
- if runtime failure is already happening, hand off to `debugging`

**Game or asset-heavy change**
- review the text/code portions directly
- call out where manual playtest, engine validation, or asset review is still required because the diff alone cannot prove safety

**Self-review before opening a PR**
- use the same severity model
- bias toward finding missing evidence, oversized change boundaries, and unclear reviewer context

## Output format
Always return a concise review brief or review-comment set.

Required qualities:
- identify the review surface and change goal
- focus on the highest-risk findings first
- separate concrete issues from optional suggestions
- mention missing evidence explicitly
- choose an explicit decision: approve / request changes / block / route out
- name the correct neighboring skill when the task has shifted

## Examples

### Example 1: Backend PR with migration risk
**Input**
> Review this PR that adds coupon support to the checkout API. There is a schema migration and a few tests.

**Output sketch**
- Decision: Request changes
- Summary: logic mostly coherent, but migration and discount validation need stronger safeguards
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
- Summary: implementation looks locally maintainable, but responsive behavior cannot be fully judged from the diff alone
- Key findings:
  1. [Major] missing mobile/tablet screenshots or preview link for menu open/close states
  2. [Minor] duplicated breakpoint logic should be centralized
  3. [Route-out] accessibility and visual polish checks should go through `web-design-guidelines` / `web-accessibility`

### Example 3: Request that should route away
**Input**
> Before review, help me split this huge branch into smaller commits and rebase it cleanly.

**Output sketch**
- Decision: Route out
- Summary: this is primarily a Git-structure problem, not review judgment yet
- Route: `git-workflow`
- Why: review quality depends on a cleaner diff before meaningful comments will transfer

## Best practices
1. Review the highest-risk behavior before style or formatting.
2. Tie every serious finding to evidence from the diff, tests, or missing artifacts.
3. Use severity labels so authors know what blocks merge.
4. Distinguish missing evidence from proven bugs.
5. Call out when the change is too large for a high-confidence review.
6. For frontend work, ask for previews/screenshots when behavior matters.
7. For backend/platform work, inspect compatibility, migrations, auth, and rollout risk explicitly.
8. Route neighboring concerns out instead of absorbing Git, debugging, testing-policy, or UI-governance tasks.
9. A short, high-signal review is better than a huge generic checklist.
10. If approving, say why the change looks safe — not just "LGTM".

## References
- [GitHub Docs — About pull request reviews](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/about-pull-request-reviews)
- [GitHub Docs — About code owners](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners)
- [GitHub Docs — About protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [GitLab Docs — Merge request approvals](https://docs.gitlab.com/ee/user/project/merge_requests/approvals/)
- [reviewdog](https://github.com/reviewdog/reviewdog)
- [Danger JS](https://danger.systems/js/)
