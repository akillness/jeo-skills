# AGENTS.md

Guidance for coding agents working on this repository. To use the skill rather than develop it, see the README.

## Layout

```text
skills/video-to-game/          the skill (this is what gets installed)
  SKILL.md                     entry point: workflow, hard rules, reference routing
  references/                  study the video, fal assets, game loop, look and post-processing, playtest
  scripts/                     study_video, fal_asset, side_by_side, best_window (Python), record_play (Node)
  templates/                   game.html (Three.js skeleton, post stack, state contract), play.mjs (scenario)
gallery/<game>/                poster.gif, README.md, game/ (code only; assets live on the demo site)
prompts/                       gameplay video prompts
examples/plays/                real playtest scenarios
tests/check_repo.py            static checks: links, sizes, hygiene, script syntax
.claude-plugin/                Claude Code plugin + marketplace manifests
```

## Commands

```bash
python3 tests/check_repo.py
```

## Rules

- Python scripts: 3.9+, standard library, ffmpeg/ffprobe on PATH; `fal-client` only in `fal_asset.py`. Every script
  has a docstring with usage lines and `--help`. The recorder needs Node 18+ and `playwright-core`.
- A new gallery entry: `poster.gif` (video left, game right, under 1 MB), `README.md` with the prompt, controls, fal
  calls and cost, `game/` with the code, and a cell in the README table. Keep the repo under 40 MB.
- No absolute home paths, secrets or API keys in committed files. Code comments in English.
