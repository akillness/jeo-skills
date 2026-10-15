# Pinned upstream contracts

This reference records the inspected `browser-use/jev-ultrafast` project at commit
`1231850a0bf1a0c0341fe408ef1668dbbfdfac46` (package version `0.1.0`, audited 2026-10-15).
The repository's `LICENSE` at this pin is MIT. Use the source links at this exact commit;
`main` is not a stable contract.

## Project and runtime

- `pyproject.toml` declares Python `>=3.12`, `browser-harness==0.1.13`, and
  `httpx[http2]>=0.28,<1`. The `jev` console entry point is
  `jev_ultrafast.demo:main`.
- The documented setup is `uv sync`, then private configuration from `.env.example`, then
  `uv run jev`. Dependency installation contacts package registries and changes the local
  environment; it is not part of the offline preflight.
- The default inspector URL is `http://127.0.0.1:8766`. The server binds to loopback and
  checks the Host, per-process token, and Origin on POST requests. Keep it loopback-only.
  The local UI offers Flights, Travel, and Research scenarios. Flights navigates to Google;
  the other built-in scenarios use the local fixture.
- `Browser` calls Browser Harness `ensure_daemon`, creates an owned background tab, and
  navigates it to the requested URL. The README says the Browser Harness uses the existing
  Chrome profile. Treat cookies, account state, and target-site access as in scope even when
  the tab is not foregrounded.

## Configuration and provider data

`.env.example` names `TYPESAFE_API_KEY`, `TYPESAFE_MODEL`, `TEXT_MODEL_API_KEY`,
`TEXT_MODEL_BASE_URL`, `TEXT_MODEL`, and `TEXT_MODEL_REASONING`. Its sample TypeSafe model is
`jev-latest`; the text helper sample uses the OpenRouter-compatible endpoint and
`inception/mercury-2.5`. Source defaults, when those variables are unset, use
`jev-latest`, `https://api.deepseek.com/v1`, and `deepseek-chat`. Do not assume the sample
configuration and code defaults are the same.

The source sends TypeSafe a goal, the current page URL/title/text, observed controls, and
recent actions at `https://api.typesafe.ai/v1/systemone`. Only the selected operation's
compatible observed target is executable. On `TYPE_TEXT`, `field_text()` sends goal, field
label/value, up to 6,000 characters of page text, and recent actions to the configured
OpenAI-compatible `/chat/completions` endpoint. Provider calls may be paid. Keep keys private;
never print or inspect `.env` to prove setup.

The browser reads supported visible HTML/ARIA controls and keeps actual DOM node references.
Click and select operations check that the observed element is still present and usable;
clicks also check current geometry and hit-testing. These are useful safeguards, not a
security boundary or a guarantee that the chosen operation is correct. Unsupported or
limited cases include shadow roots, frames, canvas, uploads, popup tabs, nested scrolling,
and arbitrary keyboard widgets. The source README explicitly says a `DONE` choice still
needs independent outcome verification.

## Routes and commands

### Offline source and test work

```bash
python3 .agent-skills/jev-ultrafast/scripts/preflight.py --json
python3 .agent-skills/jev-ultrafast/scripts/preflight.py \
  --repo /path/to/jev-ultrafast \
  --expect-commit 1231850a0bf1a0c0341fe408ef1668dbbfdfac46 --json

uv run ruff check .
uv run pytest
node --check jev_ultrafast/static/app.js
node --check jev_ultrafast/snapshot.js
uv build
```

The upstream README describes its tests as offline. `preflight.py` is a separate helper:
it reports local interpreter/tool/package metadata, source path shape, and optional local Git
HEAD only. It does not run `uv`, import project code, call upstream executables, contact the
network, read environment secrets, or prove runtime readiness. Its `runtime_verified` field
is always `false`.

### Browser-guard checks

```bash
uv run python scripts/check_guards.py
```

At the pinned source this script builds a local `data:text/html` fixture, opens an owned
Browser Harness tab, checks stale-page and hit-test guards, and closes the tab. Its docstring
says it makes no model calls or external website requests. It still starts/uses local Chrome
and performs local browser input; get approval for that browser session before running it.
This is not evidence that a live provider or arbitrary website works.

### Inspector and library examples

```bash
uv run browser-harness --doctor
uv run jev
# Open http://127.0.0.1:8766 in a browser after the server starts.

uv run --env-file .env python examples/run.py \
  --url https://en.wikipedia.org/wiki/Main_Page \
  --goal 'Find and open the Wikipedia article about Gödel’s incompleteness theorems.'
```

These operations start a browser task and make TypeSafe calls. `TYPE_TEXT` also calls the
configured text model. Confirm the URL, session, page-state egress, possible spend, and stop
condition before executing. Run history may include page text and actions.

The live example in `examples/flights.py` searches Google Flights, saves JSON evidence, and
independently checks the route/date/results. Its goal and source explicitly say not to select
or book a flight. The example does not prove that other sites, controls, or tasks are safe or
supported.

Recording scripts create output directories and save screenshots/video or measurement data.
Review output paths, contents, and privacy before using `scripts/record_flights.py`,
`scripts/measure_flights.py`, or render scripts; do not broadly share generated traces.

## Performance evidence boundary

The pinned `docs/performance.md` describes six alternating runs of one Google Flights task
using one existing Chrome profile. Both arms passed 3/3; the median was 9.450 seconds versus
7.092 seconds, and the reported browser protocol-call median was 1,092 versus 101. Three
matched pairs are too few for a strong statistical claim (the document reports two-sided
sign-test `p = 0.25`). These measurements are not a general speed, reliability, or model
quality guarantee. Preserve the stated task, browser, model, timing, and sample boundaries
when summarizing them.

## Source-pinned files

- [Commit](https://github.com/browser-use/jev-ultrafast/commit/1231850a0bf1a0c0341fe408ef1668dbbfdfac46)
- [README](https://raw.githubusercontent.com/browser-use/jev-ultrafast/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/README.md)
- [Project dependencies and entry point](https://raw.githubusercontent.com/browser-use/jev-ultrafast/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/pyproject.toml)
- [Environment variable names](https://raw.githubusercontent.com/browser-use/jev-ultrafast/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/.env.example)
- [Agent loop](https://raw.githubusercontent.com/browser-use/jev-ultrafast/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/jev_ultrafast/agent.py)
- [Browser Harness and DOM execution](https://raw.githubusercontent.com/browser-use/jev-ultrafast/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/jev_ultrafast/browser.py)
- [TypeSafe and text model calls](https://raw.githubusercontent.com/browser-use/jev-ultrafast/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/jev_ultrafast/model.py)
- [Loopback inspector](https://raw.githubusercontent.com/browser-use/jev-ultrafast/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/jev_ultrafast/demo.py)
- [Local guard checks](https://raw.githubusercontent.com/browser-use/jev-ultrafast/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/scripts/check_guards.py)
- [Flights example and independent verification](https://raw.githubusercontent.com/browser-use/jev-ultrafast/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/examples/flights.py)
- [Performance report](https://raw.githubusercontent.com/browser-use/jev-ultrafast/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/docs/performance.md)
- [MIT license](https://raw.githubusercontent.com/browser-use/jev-ultrafast/1231850a0bf1a0c0341fe408ef1668dbbfdfac46/LICENSE)
