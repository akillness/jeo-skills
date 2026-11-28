# Upstream Provenance: `nexu-io/opengame`

- **Repository**: <https://github.com/nexu-io/opengame>
- **Pinned Commit**: `f17151f3cc7838ddbe13d9b94392e0f983fc341b` (`2026-11-27`)
- **License**: `Apache-2.0`
- **Primary Interface**: `cli`

## Installation & Setup Channels

- Official repository: `git clone https://github.com/nexu-io/opengame`
- npm / npx runner: `npx opengame init`
- Agent integration: native Claude Code, Codex, and DeepSeek harness MCP plugins (`.agents/`, `.mcp.json`)

## Key Architecture & Concepts

- **Super Game Agent Architecture**: Combines template remixing, prompt-to-mechanics code synthesis, and browser runtime previews.
- **Multi-Platform Export**: Targets 9:16 mobile formats and WebGL engines for WeChat Mini Games, Douyin, TikTok, Telegram, and itch.io.
- **Coding Agent Integration**: Ships pre-configured MCP tools and agent skills in `.agents/` and `.mcp.json` for autonomous asset/logic iteration.

## Boundaries & Cross-Routing

- Gate full build export commands and remote asset publishing with user confirmation.
- Route out: Native C++/C# desktop engines -> `game-client`; 2D sprite asset pipelines -> `game-art`.
