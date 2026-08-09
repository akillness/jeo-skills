# Setup, operating modes, and route-outs

WAI Play is a local Streamlit app driving Playwright Chromium. Nothing here is
installed by this skill; run it only when a task actually needs a playtest.

## Install

Python 3.12 is the recommended interpreter.

```bash
git clone https://github.com/waiterve/wai-play.git
cd wai-play
python3 -m venv .venv
source .venv/bin/activate          # Windows: .\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m playwright install chromium
cp .env.example .env               # Windows: Copy-Item .env.example .env
streamlit run app.py
```

Then open <http://127.0.0.1:8501>.

Runtime dependencies are deliberately small: `streamlit`, `playwright`,
`openai`, `python-dotenv`.

## Keys and degradation

`.env` carries two providers with distinct jobs:

| Variable | Job |
|---|---|
| `DEEPSEEK_API_KEY` / `DEEPSEEK_BASE_URL` | Source modeling and route planning |
| `DEEPSEEK_PLANNER_MODEL`, `..._TIMEOUT_SECONDS`, `..._MAX_RETRIES` | Planner tuning |
| `DEEPSEEK_SOURCE_MODEL_TIMEOUT_SECONDS`, `..._ATTEMPTS` | ZIP source-modeling budget |
| `KIMI_API_KEY` / `KIMI_BASE_URL` / `KIMI_REPORTER_MODEL` | Turning structured findings into readable recommendations |
| `USE_AI_PLANNER`, `USE_AI_REPORTER` | Feature switches, default `true` |

Never commit `.env`.

**Keyless is a real mode, not a failure.** Rule-based checks still run. What
degrades: source modeling, AI route planning, and natural-language
suggestions. Say which of those were off when reporting a keyless run.

## Demo games

Five reference games ship in-repo, one per supported type. Use them to
validate the harness before debugging a real game.

```bash
python3 -m http.server 8768 --bind 127.0.0.1 --directory web_examples/five_games
```

| Type | Demo |
|---|---|
| survivor / roguelike | `/survivor.html` |
| arcade / shooter | `/arcade-shooter.html` |
| platformer | `/platformer.html` |
| puzzle / card | `/puzzle-card.html` |
| visual novel | `/visual-novel.html` |

## Docker

```bash
docker build -t wai-play .
docker run --rm -p 8501:8501 --env-file .env wai-play
```

When the container tests a game running on the host, replace `127.0.0.1` in
the game URL with `host.docker.internal`. This is the single most common
"the container cannot reach my game" cause.

## Upstream tests

```bash
python -m compileall -q app.py agent web llm games database rag
python -m unittest discover -s tests -p "test_*.py" -v
```

Integration tests start the bundled demo servers themselves; they do not
depend on a developer-specific path. CI runs compile plus tests on push and PR.

## Key code entry points

| Concern | File |
|---|---|
| Streamlit UI | `app.py` |
| Test orchestration | `agent/orchestrator.py` |
| Browser adapter | `web/web_game_adapter.py` |
| Type profiles and scoring standards | `game_profiles.py`, `agent/scoring_standards.py` |
| Integration templates | `integration_templates.py` |
| Evidence chain | `agent/evidence_collector.py`, `evidence_confidence.py`, `evidence_integrity.py`, `evidence_media_policy.py`, `video_clip_exporter.py` |
| Replanning after failure | `agent/completion_backplanner.py`, `memory_aware_planner.py` |

## Privacy and authorization

- Test only games and source you own or are explicitly authorized to test.
- `.env`, recordings, screenshots, reports, logs, and local memory directories
  are gitignored upstream — keep them out of commits.
- An uploaded ZIP is extracted to a temporary copy and analyzed there; the
  original project is never modified. Clean the temp copy up after a run.
- With AI source modeling enabled, source summaries leave the machine for the
  configured providers. Disclose this before pointing it at unreleased or
  client-owned code.
- The current version suits local use, learning, and demos. A public service
  would additionally need accounts, a job queue, quotas, remote-URL safety
  limits, and automatic test-data cleanup — none of which exist yet.

## Route-outs

| Situation | Better skill |
|---|---|
| Unity / Unreal frame-time, profiler captures, device review | `game-performance-profiler` |
| Engine build, cook, package, or editor log failures | `game-build-log-triage` |
| Human playtest notes, Steam Playtest, streamer reactions | `game-demo-feedback-triage` |
| CI/CD for game builds and release candidates | `game-ci-cd-pipeline` |
| Generic browser automation, scripted E2E with no game model | `browser-harness`, `playwriter` |
| Extracting page content rather than playing a game | `scrapling` |
| Building the web game itself | `web-game-development` |
| Broader production coordination and milestone pressure | `game-studio-harness`, `bmad-gds` |

The honest boundary: WAI Play answers "does this web game actually play, and
where does it break". It is not an engine profiler, not a build system, and
not a general browser automation framework.
