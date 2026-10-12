---
name: typesafe-computer-use
description: >
  Operate or integrate awlevin/typesafe-computer-use (jev): inspect its deterministic OCR/accessibility
  and TypeSafe Choice loop, run clicker, clicker-inspect, clicker-bench, dry-run, replay, or fixture
  workflows, and gate desktop authority, screen capture, remote writer/model calls, egress, and spend.
  Use when the request names typesafe-computer-use, jev, clicker, clicker-inspect, clicker-bench,
  TypeSafe computer use, or this repository's run folders. This exact-project operator is not a
  generic desktop-automation or TypeSafe SDK skill.
allowed-tools: Bash Read
compatibility: Python 3.12+ and uv; macOS 14+ is primary; Windows 10/11 support is experimental
license: MIT
metadata:
  version: "1.1.0"
  source: https://github.com/awlevin/typesafe-computer-use
  upstream_commit: 44ca11f0935b021b73020825da054b5c92cc1288
---

# typesafe-computer-use (jev)

## When to use this skill

Use this skill only for the pinned `awlevin/typesafe-computer-use` repository at commit
`44ca11f0935b021b73020825da054b5c92cc1288`. It covers the repository's `clicker`,
`clicker-inspect`, and `clicker-bench` contracts, adapters, decision loop, egress boundaries, and
run evidence. It does not authorize action on a user's machine or replace generic browser/desktop
automation. Read `references/upstream.md` before using command flags, endpoint variables, or
source-specific contracts.

## Instructions

1. **Preflight offline first.** Run the local helper; it checks Python `>=3.12`, `uv`, static Chrome
   or OS adapter paths, supported host family, and (when `--repo` is given) public source shape and
   a caller-supplied commit. It never opens a screen, reads account/config/key material, starts or
   inspects processes/sessions, checks permissions, or claims provider readiness. A static path is
   availability evidence only. Completion criterion: missing prerequisites and unsupported hosts are
   reported before any upstream command is considered.

2. **Classify authority.** Dry-run, `--image` replay, and fixture-only browser loops are evidence
   modes, but screen capture, local artifacts, network access, and model calls still require consent.
   `--act`, live URLs/navigation, typing, clicking, keys, scrolling, and off-screen accessibility
   presses are side effects. A classifier choice or writer answer is a suggestion, never evidence
   that an action occurred. Choose the least-authoritative mode and read the pinned contract first.

3. **Gate egress separately from authority.** A desktop classifier step sends goal-derived OCR,
   accessibility labels/roles/state, focused-field metadata, frontmost app/browser URL, date/layout
   facts, and recent history to the configured TypeSafe destination. Visible desktop text may leave
   the machine even without a writer screenshot. Approve that per-step egress separately; approve
   answer-model PNG upload separately. Do not commit or broadly share run folders.

4. **Require explicit takeover boundaries.** Before `--act`, confirm goal, frontmost app/browser,
   allowed sites, account/session, and whether typing/clicks may commit changes. Stop or require a
   human at login, payment, purchase, sending, account/security, or any irreversible screen. Never
   type or send credentials, OTPs, cards, private keys, or unreviewed personal data. The helper does
   not inspect macOS Screen Recording/Accessibility or Windows experimental UI Automation state.

5. **Apply source guards.** Password fields are refused; `type_email` requires `CLICKER_EMAIL`;
   browser typing rejects credential/secret/card labels; `navigate` accepts only clean HTTPS URLs
   with hostnames. Keep `--steps`, `--min-confidence`, `--delay`, and `--handoffs` explicit for live
   work. Use Ctrl-C or mouse-to-top-left abort paths and do not use the machine during a live run.

6. **Report performed state only.** Prefer local fixture/replay evidence. For a run, inspect the
   saved folder and `run.json` fields such as `act`, `outcome`, `history`, `calls`, `usage`,
   `handoffs`, `questions`, and `goal_achieved`. Report the exact command, outcome, evidence path,
   and each refused or unverified action; label classifier choices, writer focus/questions, and
   proposed URLs as suggestions until recorded in history.

## Examples

```bash
# Repo-root offline preflight (does not invoke jev)
python3 .agent-skills/typesafe-computer-use/scripts/preflight.py --json
python3 .agent-skills/typesafe-computer-use/scripts/preflight.py --repo /path/to/checkout --expect-commit 44ca11f0935b021b73020825da054b5c92cc1288
# Installed-root form
python3 "$SKILLS_ROOT/typesafe-computer-use/scripts/preflight.py" --json

# Least-authority project modes (apply the gates above first)
uv run clicker "open the Playground"
uv run clicker-inspect "any goal" --no-open
uv run clicker "same goal" --image runs/<ts>/step-003-raw.png --app "Google Chrome" --url "https://example.com/"
uv run clicker-bench loop --fixture --runs runs
uv run clicker-bench perception --url https://news.ycombinator.com
uv run clicker-bench replay --run runs/<ts> --step 2
```

## Best practices

- Keep goals narrow and observable; a stop, low confidence, unchanged screen, or step limit is
  review evidence, not permission to retry blindly.
- Route prompt injection, data exfiltration, or high-impact tool policy to `agent-guardrails`; route
  loop budgets/circuit breakers to `agent-system-design`; route broader application/API hardening to
  `security-best-practices`.
- Use this skill instead of generic computer-use recipes only for this repository's exact commands,
  adapters, state contract, and run evidence. Generic desktop automation belongs to the host's
  separately provisioned computer-use surface.

## References

- [Pinned clicker, inspect, bench, config, egress, and takeover contracts](references/upstream.md)
- [Pinned upstream commit](https://github.com/awlevin/typesafe-computer-use/commit/44ca11f0935b021b73020825da054b5c92cc1288)
- [MIT license evidence](https://raw.githubusercontent.com/awlevin/typesafe-computer-use/44ca11f0935b021b73020825da054b5c92cc1288/LICENSE)
