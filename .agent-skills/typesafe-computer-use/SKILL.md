---
name: typesafe-computer-use
description: >
  Operate or integrate awlevin/typesafe-computer-use (jev): inspect its deterministic OCR/accessibility
  plus TypeSafe Choice loop, configure macOS/Windows/browser prerequisites, run dry-run, replay,
  inspection, or benchmark commands, and gate real mouse/keyboard control, screen capture, remote
  writer/model calls, and provider spend. Use when the request names typesafe-computer-use, jev,
  clicker, clicker-inspect, clicker-bench, TypeSafe computer use, or this repository's run folders.
  This is an exact-project operator, not a generic desktop-automation or TypeSafe SDK skill.
allowed-tools: Bash Read
compatibility: Python 3.12+ and uv; macOS 14+ is the primary target; Windows 10/11 is experimental
license: MIT
metadata:
  version: "1.0"
  source: https://github.com/awlevin/typesafe-computer-use
  upstream_commit: 44ca11f0935b021b73020825da054b5c92cc1288
---

# typesafe-computer-use (jev)

## When to use this skill

Use this skill for the pinned `awlevin/typesafe-computer-use` repository at commit
`44ca11f0935b021b73020825da054b5c92cc1288`. It covers the project's `clicker`,
`clicker-inspect`, and `clicker-bench` entry points, their environment, decision loop, safety
boundaries, and run-folder evidence. It does not implement generic computer use, provide a
TypeSafe SDK tutorial, or authorize actions on a user's machine.

## Instructions

1. **Classify authority before running anything.** Treat `clicker-inspect`, `--image` replay, and
   fixture-only browser benchmarks as read-oriented evidence collection, but still ask whether
   screen capture, local artifacts, network access, and model calls are allowed. Treat desktop
   `--act`, live browser URLs, URL navigation, typing, clicks, key presses, scrolling, and
   off-screen accessibility presses as external side effects. A classifier choice or writer
   answer is a suggestion; it is not proof that an action happened.

2. **Preflight without exposing secrets.** Work from the project root with Python `>=3.12` and
   `uv`; the primary adapter requires macOS `>=14` and Windows support is experimental. Confirm
   that `TYPESAFE_API_KEY` is present without printing its value. `ANTHROPIC_API_KEY` is optional
   for the classifier but is needed for writer-composed text, writer-proposed URLs, and the final
   answer unless a custom writer endpoint is configured. `CLICKER_EMAIL` enables only the
   explicit `type_email` action; `CLICKER_BROWSER` defaults to Google Chrome. Never paste keys
   into goals, logs, screenshots, or reports. Completion criterion: prerequisites and key
   presence are known, and missing permission/key requirements are reported before execution.

3. **Choose the least-authoritative interface.**
   - `uv run clicker-inspect "<goal>"` counts down, captures the current screen, and writes
     `inspections/<timestamp>/raw.png`, `annotated.png`, and `state.txt`; use `--no-open` for
     file-only output. It is not a harmless command if the screen is sensitive.
   - `uv run clicker "<goal>"` is the documented dry-run first pass; it prints what one step
     would do. A saved capture can be replayed with `--image ... --app ... --url ...`; replay
     never acts, but a TypeSafe decision may still incur provider cost.
   - `uv run clicker "<goal>" --act` runs the desktop loop. On macOS it reads Vision OCR plus
     the frontmost app's accessibility tree and can drive the real mouse and keyboard. On
     Windows, UI Automation, `SendInput`, and Windows OCR are experimental.
   - `uv run clicker-bench ...` is the opt-in browser backend. It uses Chrome DevTools Protocol
     DOM perception rather than pixels; `clicker` never selects this backend. `clicker-bench`
     starts its own Chrome with a fresh temporary profile and loopback debugging socket, not the
     user's existing profile. Completion criterion: the selected mode matches the approved
     authority and data-sharing boundary.

4. **Understand the decision contract.** Each desktop step captures the frontmost window, OCR
   blocks, labelled accessibility controls, focused field, app/URL, date/layout facts, and
   same-screen history. One TypeSafe request then answers mutually exclusive `Choice`s for the
   action kind, item, site, and (when present) off-screen control. Code executes the selected
   deterministic action, waits, and uses the next capture as the witness. The classifier never
   composes free text. The writer is used only for field text, an out-of-catalog HTTPS URL, and
   the final screen answer/focus/question; it never chooses the action. Completion criterion:
   logs and reports distinguish classifier decisions, writer suggestions, and executed actions.

5. **Gate desktop authority and data egress.** Every desktop classifier step sends a TypeSafe request
   containing the goal-derived state to the configured TypeSafe destination: OCR text blocks,
   accessibility labels/roles and control state, focused-field metadata, frontmost app and browser
   URL, derived date/layout facts, and recent action history. Approve this per-step remote data
   egress separately from screen authority; it can contain text visible on the desktop even when no
   writer screenshot is uploaded. Before `--act`, explicitly confirm the intended goal, frontmost
   app/browser, allowed websites, account/session, and whether clicks or typing may commit changes.
   macOS needs Screen Recording (otherwise capture is wallpaper) and
   Accessibility (otherwise synthetic input is dropped and `--act` refuses). Clear the terminal
   before capture because it is OCR input; do not use the machine during a live run. The abort
   paths are Ctrl-C or moving the mouse to the top-left corner; the abort check runs before
   clicks, keys, scrolls, app switches, accessibility actions, and between typed characters.
   Stop or require human takeover at login, payment, purchase, sending, account/security, or
   other irreversible screens. Completion criterion: a human can name the exact side effect
   that is permitted and the stop condition that ends it.

6. **Apply the project's input and URL guards.** Passwords are never typed. Desktop `type_text`
   asks the writer for a structured `{fill,text,reason,submit}` response, refuses credential
   fields, and verifies non-submitted text with a TypeSafe Noul; failed verification attempts a
   safe restoration only through the original accessibility element. `type_email` is offered
   only when `CLICKER_EMAIL` exists. Browser typing refuses fields labelled like credentials or
   secret/card data, and `navigate` accepts only a clean HTTPS URL with a hostname. Keep
   `--handoffs` bounded because each handoff is another answer-model call. Completion criterion:
   no credential, OTP, card, private key, or unreviewed personal data is typed or sent.

7. **Bound steps, confidence, waits, and spend.** Keep the dry run as the baseline, then set
   `--steps`, `--min-confidence`, `--delay`, and `--handoffs` explicitly for any live run. The
   documented defaults are 100 steps, minimum confidence `0.4`, two-second delay, and 10
   handoffs. `TYPESAFE_API_KEY` is required for every decision. The default writer models are
   `claude-haiku-4-5` for writing and `claude-sonnet-5` for answers; a writer call can be paid or
   remote. A custom endpoint uses `CLICKER_WRITER_API` (`anthropic` or `openai`),
   `CLICKER_WRITER_BASE_URL`, `CLICKER_WRITER_API_KEY`, model variables, and optional vision/
   reasoning flags. The project keeps writer keys paired with their endpoint and does not send
   `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` to a custom writer endpoint. Completion criterion:
   provider, model, budget/step cap, and endpoint are recorded before a call is allowed.

8. **Treat screenshots, DOM text, and run folders as sensitive.** Desktop runs write
   `runs/<timestamp>/run.json`, `run.log`, raw and annotated step PNGs, payloads, answers, timing,
   histories, and writer reviews; the default answer path sends a PNG capture to the answer model.
   Approve that upload separately from desktop authority, especially for custom/remote endpoints;
   set `CLICKER_WRITER_VISION=false` only when the configured answer model is intended to read text
   without an image. Browser mode avoids Screen Recording and pixels but still sends DOM/page text
   and state to TypeSafe and, when enabled, the writer. Do not commit or broadly share run folders.
   Completion criterion: retention, destination, and redaction of each artifact are known.

9. **Use bounded verification and report performed state.** Prefer local fixture/replay evidence
   before a live URL. For browser runs, inspect the printed outcome and saved run folder; for
   desktop runs, verify `run.json` fields such as `act`, `outcome`, `history`, `calls`, `usage`,
   `handoffs`, `questions`, and `goal_achieved`. Outcomes include `done`, `nothing helps`, `low
   confidence`, `stalled`, `stuck`, `step limit`, `dry run`, `aborted`, and `crashed`. Report
   only actions present in the run history as performed; label classifier choices, writer focus,
   writer questions, and proposed URLs as suggestions until the corresponding action is recorded.
   Completion criterion: the final report names the exact command, outcome, evidence path, and
   any unverified or refused action.

## Examples

These examples are copied from the pinned README/docs/source and are safe only under the gates
above:

```bash
# Dry run and explicit live run
uv run clicker "open the Playground"
uv run clicker "open the Playground" --act
# Authentication goals such as `log in` stay dry-run-only unless a human is present to approve and
# take over before the authentication control is activated; this block uses a non-authentication goal.

# Capture an inspection without opening files
uv run clicker-inspect "any goal" --no-open

# Offline desktop replay; --image never acts
uv run clicker "same goal" --image runs/<ts>/step-003-raw.png --app "Google Chrome" --url "https://example.com/"

# Browser backend with the local deterministic fixture
uv run clicker-bench loop --fixture --runs runs
uv run clicker-bench perception --url https://news.ycombinator.com
uv run clicker-bench replay --run runs/<ts> --step 2
```

## Best practices and route-outs

- Start with dry run, fixture, or replay; use `--act` only with explicit side-effect approval.
- Keep goals narrow and observable. A stop, low confidence, unchanged screen, or step limit is
  evidence to review, not permission to retry blindly.
- Route prompt-injection, data-exfiltration, or high-impact tool policy to the manifest's
  `agent-guardrails` skill; route loop budgets/circuit breakers to `agent-system-design`; route
  broader application/API hardening to `security-best-practices`.
- Use this skill instead of a generic computer-use recipe only when the request concerns this
  repository's exact commands, adapters, state contract, or run evidence. Generic desktop
  automation requires the host's separately provisioned computer-use surface.
- For source-backed details, follow the pinned references below rather than copying current
  `main` documentation.

## References

- [Pinned repository commit](https://github.com/awlevin/typesafe-computer-use/commit/44ca11f0935b021b73020825da054b5c92cc1288)
- [Pinned README](https://raw.githubusercontent.com/awlevin/typesafe-computer-use/44ca11f0935b021b73020825da054b5c92cc1288/README.md)
- [Pinned CLI](https://raw.githubusercontent.com/awlevin/typesafe-computer-use/44ca11f0935b021b73020825da054b5c92cc1288/typesafe_computer_use/cli.py)
- [Pinned config defaults and site catalog](https://raw.githubusercontent.com/awlevin/typesafe-computer-use/44ca11f0935b021b73020825da054b5c92cc1288/typesafe_computer_use/config.py)
- [Pinned decision contract](https://raw.githubusercontent.com/awlevin/typesafe-computer-use/44ca11f0935b021b73020825da054b5c92cc1288/typesafe_computer_use/decide.py)
- [Pinned deterministic actions](https://raw.githubusercontent.com/awlevin/typesafe-computer-use/44ca11f0935b021b73020825da054b5c92cc1288/typesafe_computer_use/actions.py)
- [Pinned runner and stop rules](https://raw.githubusercontent.com/awlevin/typesafe-computer-use/44ca11f0935b021b73020825da054b5c92cc1288/typesafe_computer_use/runner.py)
- [Pinned writer guards/endpoints](https://raw.githubusercontent.com/awlevin/typesafe-computer-use/44ca11f0935b021b73020825da054b5c92cc1288/typesafe_computer_use/writer.py)
- [Pinned step walk](https://raw.githubusercontent.com/awlevin/typesafe-computer-use/44ca11f0935b021b73020825da054b5c92cc1288/docs/how-a-step-works.md)
- [Pinned browser backend](https://raw.githubusercontent.com/awlevin/typesafe-computer-use/44ca11f0935b021b73020825da054b5c92cc1288/docs/browser-backend.md)
- [Pinned writer endpoint guide](https://raw.githubusercontent.com/awlevin/typesafe-computer-use/44ca11f0935b021b73020825da054b5c92cc1288/docs/writer-endpoints.md)
- [Pinned run-folder contract](https://raw.githubusercontent.com/awlevin/typesafe-computer-use/44ca11f0935b021b73020825da054b5c92cc1288/docs/run-folder.md)
- [MIT license evidence](https://raw.githubusercontent.com/awlevin/typesafe-computer-use/44ca11f0935b021b73020825da054b5c92cc1288/LICENSE)
