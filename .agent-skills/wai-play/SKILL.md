---
name: wai-play
description: >
  Route web-game auto-playtesting with WAI Play (waiterve/wai-play): decide
  whether the next move is a testability check, authoring or repairing the
  `GameFlowAgentAPI` bridge, running a real browser playtest, reading the
  five-dimension quality report, or unblocking a key node the agent cannot
  reach. Use when the user wants an AI agent to actually play their HTML5 /
  canvas / vibe-coded web game and return reproducible evidence, scores, and
  fix suggestions across the five supported types (survivor-like, arcade
  shooter, platformer, puzzle/card, visual novel). Triggers on: wai-play, WAI
  Play, auto-playtest, AI plays my game, web game testing agent,
  GameFlowAgentAPI, GameFlowIntegration, jumpToScenario, game quality score,
  playtest evidence. Route Unity/Unreal frame-time work to
  `game-performance-profiler`, engine build failures to
  `game-build-log-triage`, human playtest notes to
  `game-demo-feedback-triage`, and generic browser automation to
  `browser-harness`.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Python 3.12 recommended. Runs locally as a Streamlit app with Playwright
  Chromium (`streamlit`, `playwright`, `openai`, `python-dotenv`). DeepSeek
  (planner) and Kimi (reporter) API keys are optional but degrade source
  modeling, route planning, and natural-language suggestions when absent. The
  upstream UI and reports are Chinese-language. Docker image available.
metadata:
  tags: wai-play, web-game-testing, auto-playtest, game-qa, playwright, streamlit, gameflow-agent-api, evidence, game-scoring, html5-game
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "1.0"
  source: https://github.com/waiterve/wai-play
---

# WAI Play — agent auto-playtesting for web games

WAI Play drives a real browser against a running web game, models the game's
goal and key nodes, plays it, and returns a five-dimension quality score with
reproducible problem cards (state deltas, screenshots, ≤20 s clips) and fix
suggestions. Test credibility is reported **separately** from game quality, so
a weak harness never inflates or deflates the game's score.

The work almost never starts at "run the test". It starts at **can this game
be tested at all**, and that answer decides everything downstream.

## When to use this skill

- A vibe-coded web game needs an automated play-through before a demo, jam
  deadline, or release, and the user wants evidence rather than vibes
- The game has no agent-readable state and needs a `GameFlowAgentAPI` bridge
  authored or repaired
- A test run finished and the user needs help reading the score, the problem
  cards, or the credibility diagnostics
- A required key node (first upgrade, boss phase, level goal, ending) cannot
  be reached and the user must choose between repairing preconditions,
  jumping, or taking the natural route
- The user is deciding between local, Docker, and keyless (degraded) operation

## When not to use this skill

- Unity / Unreal frame-time or profiler work → `game-performance-profiler`
- Engine build, cook, or package failures → `game-build-log-triage`
- Human playtest notes, Steam Playtest responses, streamer reactions →
  `game-demo-feedback-triage`
- General browser automation or a scripted E2E suite with no game model →
  `browser-harness` or `playwriter`
- Building the game itself rather than testing it → `web-game-development`

## Instructions

### Step 1: Capture the intake packet before touching the tool

Collect five facts. Missing any of them changes the recommendation:

1. **Game type** — one of `survivor_like`, `arcade_shooter`, `platformer`,
   `puzzle_card`, `visual_novel`. WAI Play supports these five and nothing
   else; a game outside them gets the closest profile plus a stated caveat.
2. **Reachable URL** — the running game, not a repo. Localhost is fine.
3. **Integration state** — does the page expose `window.GameFlowAgentAPI`?
   URL-only black-box testing works, but flow modeling and key-node routing
   are markedly weaker without it.
4. **Source availability** — an optional ZIP matching the deployed version.
   It is analyzed as a temporary copy only; WAI Play never edits the project.
5. **Key availability** — DeepSeek and Kimi keys, or the honest keyless path.

### Step 2: Pick exactly one mode

| Mode | Use when | Produces |
|---|---|---|
| `testability` | Unknown whether the game can be driven at all | A go / no-go readiness note naming each blocking capability |
| `integration` | No API, or the bridge is a stub | A `GameFlowIntegration` bridge wired to real game state |
| `run` | The game is testable and configured | A configured run: type, URL, optional ZIP, step budget |
| `report` | A run finished | Score reading that separates game quality from test credibility |
| `scenario-gap` | A required key node is unreachable | Repair-plan / jump / natural-route decision with a reason |
| `ops` | Deployment, privacy, or keyless questions | Local vs Docker vs degraded operating choice |

Do not blend modes. `testability` before `run` is the single highest-value
ordering in this skill — a run against an unreadable game produces confident
nonsense.

### Step 3: Check readiness with the read-only doctor

```bash
bash .agent-skills/wai-play/scripts/wai-play.sh doctor
bash .agent-skills/wai-play/scripts/wai-play.sh doctor /path/to/wai-play
```

`doctor` reports Python version, the four runtime packages, whether a
Playwright Chromium build is present, and which `.env` keys are set — by
name only, never by value. It installs nothing and starts no test.

### Step 4: Author or repair the bridge before blaming the game

The upstream v2 template refuses to fabricate state: an unimplemented
`observe()` or `step()` throws instead of returning plausible-looking data.
That is deliberate. A bridge that returns invented state produces a score
describing the bridge, not the game.

Statically check a candidate integration file before shipping it:

```bash
python3 .agent-skills/wai-play/scripts/check_integration.py \
  --game-type survivor_like path/to/game-integration.js
```

The checker is stdlib-only and prints one ` ```review ` fenced JSON block
listing missing methods, leftover template placeholders, unimplemented
throw-stubs, and required state fields it could not find. It exits `1` when a
blocker is present. It is a **static text check**: passing it means the file
looks contract-shaped, never that the bridge is wired to real game logic.
Confirm that separately.

Contract details live in
[references/integration-api.md](references/integration-api.md).

### Step 5: Run against the demo games first when the contract is new

The repo ships five reference games, one per type. Serve them and point a run
at one to confirm the harness works before debugging a real game:

```bash
bash .agent-skills/wai-play/scripts/wai-play.sh demo /path/to/wai-play 8768
```

This starts a local static server in the foreground — a deliberate,
user-visible action, not something to run as a background side effect.

### Step 6: Read the report with quality and credibility kept apart

Five weighted dimensions score the **game**: core flow (0.24), gameplay
(0.26), UI/visual (0.20), feedback (0.15), technical stability (0.15).
API integration completeness, evidence completeness, and agent reliability
are reported as credibility diagnostics and are excluded from those scores.

Two rules that are easy to get wrong:

- The `feedback` dimension scores only what a player can **see or hear**, or
  what a reviewer can confirm from the clip. An internal API value changing
  is not on its own evidence of good feedback.
- A single problem appears once, bound to the best attempt's evidence. Do not
  re-report the same defect per occurrence.

Bands, per-criterion weights, and evidence rules live in
[references/scoring-and-reports.md](references/scoring-and-reports.md).

### Step 7: Resolve unreachable key nodes honestly

When a required scenario cannot be entered, the API returns a coded reason,
and each code has one correct response:

| Code | Meaning | Correct response |
|---|---|---|
| `SCENARIO_PRECONDITION_MISSING` | Judgement state is unreadable | Add the missing fields to `observe()`, then re-check |
| `SCENARIO_LOADER_NOT_IMPLEMENTED` | No scenario initializer exists | Implement it, or take the natural route |
| `SCENARIO_UNSAFE_TO_JUMP` | Jumping would leave state incoherent | Natural route; do not force a partial jump |
| `SERVER_AUTHORITATIVE_STATE` | Server owns the state | Request a test account, save, or injection endpoint |
| `REPAIRER_NOT_IMPLEMENTED` | No safe repair path | Natural route |

Never satisfy a key node by setting one field. Upstream calls this out
directly: writing `elapsed = 360` to reach a boss phase without initializing
level, gear, map, spawn pool, and boss AI produces a scenario that passes and
means nothing.

Scenario tables per game type live in
[references/game-profiles-and-scenarios.md](references/game-profiles-and-scenarios.md).

### Step 8: Respect the operating boundary

- Test only games and source you own or are authorized to test.
- Uploaded ZIPs are analyzed as temporary copies; clean them up after a run.
- With AI source modeling on, source **summaries** are sent to the configured
  third-party model providers (DeepSeek, Kimi). Say so before enabling it on
  unreleased or client-owned code.
- The current version targets local use. Public multi-user hosting needs
  accounts, a job queue, quotas, remote-URL restrictions, and automatic test
  data cleanup that upstream has not built yet — say this plainly rather than
  implying it is deploy-ready.

Setup, Docker, keyless degradation, and route-outs live in
[references/setup-and-route-outs.md](references/setup-and-route-outs.md).

## Best practices

1. **Testability before test.** A run against an unreadable game yields a
   confident, wrong report.
2. **Never fabricate state in the bridge.** A stub that returns invented data
   scores the stub. Throwing is the correct unimplemented behavior.
3. **Keep game quality and test credibility separate** in every summary, the
   way the tool does.
4. **Initialize whole scenarios, not single fields.** Partial jumps produce
   passing key nodes with no meaning.
5. **Prefer the natural route over an unsafe jump.** A slower honest path
   beats a fast incoherent one.
6. **Bind every problem to one best-attempt evidence set** — state delta plus
   screenshot or a ≤20 s clip — and report it once.
7. **Say when a result is degraded.** No keys means no source modeling, no AI
   route planning, and rule-level suggestions only.
8. **Name the five-type limit up front** when the game does not fit one.

## Examples

### Example 1: "Can WAI Play even test my game?"

Run `doctor`, then check whether the page mounts `GameFlowAgentAPI`. If it
does not, the answer is black-box-only testing plus an `integration` mode
recommendation — not a run.

### Example 2: A bridge exists but every score is suspiciously low

```bash
python3 .agent-skills/wai-play/scripts/check_integration.py \
  --game-type platformer web/game-integration.js
```

Leftover `throw new Error(...)` stubs and template placeholders explain low
scores far more often than the game does.

### Example 3: The boss phase never triggers

Read the returned code. `SCENARIO_UNSAFE_TO_JUMP` means take the natural
route and lengthen the step budget — not force a jump.

### Example 4: The user wants this deployed as a public service

Answer honestly: local and demo use today; public hosting needs accounts,
queueing, quotas, URL restrictions, and data cleanup that do not exist yet.

## References

- [references/integration-api.md](references/integration-api.md) — `GameFlowAgentAPI` / `GameFlowIntegration` method contract, v1 vs v2, per-type state shapes
- [references/game-profiles-and-scenarios.md](references/game-profiles-and-scenarios.md) — five game types, actions, required key nodes, success operators
- [references/scoring-and-reports.md](references/scoring-and-reports.md) — dimension weights, criteria, rating bands, evidence and credibility rules
- [references/setup-and-route-outs.md](references/setup-and-route-outs.md) — install, `.env`, Docker, demo games, degraded modes, route-outs
- [scripts/wai-play.sh](scripts/wai-play.sh) — read-only `doctor`, `check` passthrough, foreground `demo` server
- [scripts/check_integration.py](scripts/check_integration.py) — stdlib-only static contract check for an integration file
- [WAI Play GitHub Repository](https://github.com/waiterve/wai-play)
- Project standards: `.agent-skills/skill-standardization/SKILL.md`
