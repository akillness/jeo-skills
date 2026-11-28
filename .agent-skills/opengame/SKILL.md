---
name: opengame
description: >
  Operate nexu-io/opengame, an open-source super game agent and full-stack AI game studio for remixing, generating, and publishing 3D and 9:16 mini-games (WeChat, TikTok, Douyin, Telegram, itch.io) across 20+ coding agents. Use when scaffolding web/mobile games from prompts or templates, configuring Three.js/WebGL runtime pipelines, generating game mechanics, or building and exporting mini-games with MCP tools. Do not use for native Unity/Unreal C++ engine compilation (route to game-client) or pure 2D sprite generation (route to game-art). Triggers on: opengame, super game agent, remix game, wechat minigame, tiktok game, ai game studio, nexu-io/opengame.
allowed-tools: Read Glob Grep Bash
compatibility: Node.js 18+, npm/npx, WebGL/Three.js browser runtime. Preflight runs offline in Python 3.10+.
license: Apache-2.0
metadata:
  version: "1.0.0"
  source: https://github.com/nexu-io/opengame
  upstream_commit: f17151f3cc7838ddbe13d9b94392e0f983fc341b
  pinned_at: "2026-11-27"
---
# OpenGame (`nexu-io/opengame`)

Source-pinned operator guide for `nexu-io/opengame` (Apache-2.0), providing verified instructions and offline preflight validation.

## When to use this skill

- Operate nexu-io/opengame AI game studio to remix, test, and publish 3D/mini-games across 20+ coding agents.
- For complete trigger patterns: opengame, game-generator, threejs, mini-games, wechat-minigame, ai-game-studio.
- Cross-routing boundaries: route out to `game-client`, `game-art`, `threejs-fundamentals` where appropriate.

## Instructions

1. **Run offline preflight first** to confirm tool availability and pinned file integrity:
   ```bash
   python3 scripts/preflight.py --json
   ```

2. **Verify installation channels & environment prerequisites**:
   - Official repository: `git clone https://github.com/nexu-io/opengame`
   - npm / npx runner: `npx opengame init`
   - Agent integration: native Claude Code, Codex, and DeepSeek harness MCP plugins (`.agents/`, `.mcp.json`)

3. **Execute verified workflows & operations**:
   - **Super Game Agent Architecture**: Combines template remixing, prompt-to-mechanics code synthesis, and browser runtime previews.
   - **Multi-Platform Export**: Targets 9:16 mobile formats and WebGL engines for WeChat Mini Games, Douyin, TikTok, Telegram, and itch.io.
   - **Coding Agent Integration**: Ships pre-configured MCP tools and agent skills in `.agents/` and `.mcp.json` for autonomous asset/logic iteration.

4. **Gate sensitive mutating operations & respect boundaries**:
   - Gate full build export commands and remote asset publishing with user confirmation.
   - Route out: Native C++/C# desktop engines -> `game-client`; 2D sprite asset pipelines -> `game-art`.

## References

- Pinned upstream summary and concepts: [references/upstream.md](references/upstream.md)
- Pinned source provenance and file digests: [references/source.json](references/source.json)
- Offline manifest preflight helper: [scripts/preflight.py](scripts/preflight.py)
- Eval suite: [evals/evals.json](evals/evals.json)
