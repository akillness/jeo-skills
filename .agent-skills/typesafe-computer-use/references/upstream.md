# Pinned upstream contracts

This reference is the source-backed detail for `awlevin/typesafe-computer-use` at commit
`44ca11f0935b021b73020825da054b5c92cc1288`. It is deliberately separate from the router in
`SKILL.md`; do not substitute current `main` documentation.

## Entry points and authority

- `uv run clicker-inspect "<goal>"` counts down, captures the current screen, and writes
  `inspections/<timestamp>/raw.png`, `annotated.png`, and `state.txt`. `--no-open` keeps output
  file-only, but capture is still sensitive screen access.
- `uv run clicker "<goal>"` is the dry-run baseline and prints what one step would do. Replaying a
  saved capture uses `--image <path> --app <name> --url <https-url>`; replay does not act, although
  the TypeSafe decision may still incur provider cost.
- `uv run clicker "<goal>" --act` enables the desktop loop. macOS uses Vision OCR plus the
  frontmost app's accessibility tree and can drive mouse/keyboard. Windows UI Automation,
  `SendInput`, and Windows OCR are experimental.
- `uv run clicker-bench ...` is the opt-in browser backend. It uses Chrome DevTools Protocol DOM
  perception rather than pixels; `clicker` never selects it. It starts its own Chrome with a fresh
  temporary profile and loopback debugging socket, not the user's existing profile.
- Treat dry-run, `--image` replay, and fixture-only browser loops as evidence collection, not as
  permission to inspect a sensitive screen or send remote state. Treat `--act`, live browser URLs,
  navigation, typing, clicks, keys, scrolling, and off-screen accessibility presses as side effects.
  A classifier choice or writer answer is only a suggestion until the run history records action.

## Environment and configuration

- Project execution requires Python `>=3.12` and `uv`. macOS `>=14` is the primary adapter target;
  Windows 10/11 support is experimental. The offline preflight reports static availability only;
  it does not test Screen Recording, Accessibility, UI Automation, Chrome sessions, or provider
  readiness.
- `TYPESAFE_API_KEY` is required for every TypeSafe decision. `ANTHROPIC_API_KEY` is optional for
  the classifier but is needed for writer-composed text, writer-proposed URLs, and the final answer
  unless a custom writer endpoint is configured. `CLICKER_EMAIL` enables only the explicit
  `type_email` action. `CLICKER_BROWSER` defaults to Google Chrome.
- A custom writer uses `CLICKER_WRITER_API` (`anthropic` or `openai`),
  `CLICKER_WRITER_BASE_URL`, `CLICKER_WRITER_API_KEY`, model variables, and optional vision/reasoning
  flags. Writer keys stay paired with their endpoint; `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` are
  not sent to a custom writer endpoint. Default writer models are `claude-haiku-4-5` (writing) and
  `claude-sonnet-5` (answers). Any writer call can be remote or paid; bound `--handoffs` because
  each handoff is another answer-model call.
- Document static availability separately from permissions, account/session state, keys, and
  provider readiness. Never print or place secrets in goals, logs, screenshots, or reports.

## Decision, action, and URL contracts

Each desktop step captures the frontmost window, OCR blocks, labelled accessibility controls,
focused field, app/URL, date/layout facts, and same-screen history. One TypeSafe request returns
mutually exclusive `Choice`s for action kind, item, site, and (when present) an off-screen control.
The deterministic action executes, waits, and uses the next capture as witness. The classifier never
composes free text. The writer may produce only field text, an out-of-catalog HTTPS URL, and the
final screen answer/focus/question; it never chooses an action.

- Passwords are never typed. Desktop `type_text` asks the writer for structured
  `{fill,text,reason,submit}`, refuses credential fields, and verifies non-submitted text with a
  TypeSafe Noul. Failed verification may restore text only through the original accessibility
  element.
- `type_email` is offered only when `CLICKER_EMAIL` exists. Browser typing refuses credential,
  secret, and card-data labels. `navigate` accepts only a clean HTTPS URL with a hostname.
- Before `--act`, confirm goal, frontmost app/browser, allowed websites, account/session, and
  whether clicks or typing may commit changes. Stop or require human takeover at login, payment,
  purchase, sending, account/security, or any irreversible screen.
- Authentication goals such as `log in` stay dry-run-only unless a human is present to approve and take over before the authentication control is activated.
- macOS needs Screen Recording for capture and Accessibility for synthetic input; without Screen Recording capture is wallpaper. The helper does not inspect those permissions. Clear the terminal before capture because it is OCR input and do
  not use the machine during a live run. Abort with Ctrl-C or by moving the mouse to top-left;
  checks occur before clicks, keys, scrolls, app switches, accessibility actions, and between typed
  characters. No credential, OTP, card, private key, or unreviewed personal data may be typed/sent.

## Egress, bounds, and evidence

Every desktop classifier step sends goal-derived state to the configured TypeSafe destination:
OCR text blocks; accessibility labels, roles, and control state; focused-field metadata; frontmost
app and browser URL; derived date/layout facts; and recent action history. Approve remote state
egress separately from screen authority: visible desktop text can leave the machine even when no
writer screenshot is uploaded. The default answer path sends a PNG capture to the answer model;
approve that upload separately, especially for custom/remote endpoints. Set
`CLICKER_WRITER_VISION=false` only when the configured answer model is intended to read text without
an image. Browser mode avoids Screen Recording and pixels but still sends DOM/page text and state to
TypeSafe and, when enabled, the writer. Do not commit or broadly share run folders.

After browser runs, inspect the printed outcome and saved run folder. For live runs set `--steps`, `--min-confidence`, `--delay`, and `--handoffs` explicitly. Documented
defaults are 100 steps, confidence `0.4`, two-second delay, and 10 handoffs. Run folders contain
`runs/<timestamp>/run.json`, `run.log`, raw/annotated step PNGs, payloads, answers, timing,
histories, and writer reviews. Verify `run.json` fields including `act`, `outcome`, `history`,
`calls`, `usage`, `handoffs`, `questions`, and `goal_achieved`. Outcomes include `done`,
`nothing helps`, `low confidence`, `stalled`, `stuck`, `step limit`, `dry run`, `aborted`, and
`crashed`. Report only actions recorded in history as performed; classifier choices, writer focus,
writer questions, and proposed URLs remain suggestions until recorded. State command, outcome,
evidence path, and every refused or unverified action.

## Source-pinned files

- [Commit](https://github.com/awlevin/typesafe-computer-use/commit/44ca11f0935b021b73020825da054b5c92cc1288)
- [README](https://raw.githubusercontent.com/awlevin/typesafe-computer-use/44ca11f0935b021b73020825da054b5c92cc1288/README.md)
- [CLI](https://raw.githubusercontent.com/awlevin/typesafe-computer-use/44ca11f0935b021b73020825da054b5c92cc1288/typesafe_computer_use/cli.py)
- [Config defaults and site catalog](https://raw.githubusercontent.com/awlevin/typesafe-computer-use/44ca11f0935b021b73020825da054b5c92cc1288/typesafe_computer_use/config.py)
- [Decision contract](https://raw.githubusercontent.com/awlevin/typesafe-computer-use/44ca11f0935b021b73020825da054b5c92cc1288/typesafe_computer_use/decide.py)
- [Deterministic actions](https://raw.githubusercontent.com/awlevin/typesafe-computer-use/44ca11f0935b021b73020825da054b5c92cc1288/typesafe_computer_use/actions.py)
- [Runner and stop rules](https://raw.githubusercontent.com/awlevin/typesafe-computer-use/44ca11f0935b021b73020825da054b5c92cc1288/typesafe_computer_use/runner.py)
- [Writer guards/endpoints](https://raw.githubusercontent.com/awlevin/typesafe-computer-use/44ca11f0935b021b73020825da054b5c92cc1288/typesafe_computer_use/writer.py)
- [Step walk](https://raw.githubusercontent.com/awlevin/typesafe-computer-use/44ca11f0935b021b73020825da054b5c92cc1288/docs/how-a-step-works.md)
- [Browser backend](https://raw.githubusercontent.com/awlevin/typesafe-computer-use/44ca11f0935b021b73020825da054b5c92cc1288/docs/browser-backend.md)
- [Writer endpoints](https://raw.githubusercontent.com/awlevin/typesafe-computer-use/44ca11f0935b021b73020825da054b5c92cc1288/docs/writer-endpoints.md)
- [Run-folder contract](https://raw.githubusercontent.com/awlevin/typesafe-computer-use/44ca11f0935b021b73020825da054b5c92cc1288/docs/run-folder.md)
- [MIT license](https://raw.githubusercontent.com/awlevin/typesafe-computer-use/44ca11f0935b021b73020825da054b5c92cc1288/LICENSE)
