# Platform and backend matrix

Audited revision: `da5044d26fc6adddb6554d5679c94ac22e76e428`. The [registered channel list](https://github.com/Panniantong/Agent-Reach/blob/da5044d26fc6adddb6554d5679c94ac22e76e428/agent_reach/channels/__init__.py#L26-L42) contains **15** channels. `opencli` is a cross-platform installer/backend, not a sixteenth channel. Rows below describe source-supported routes, not live-tested availability.

Use the installed doctor's usable backend, not its preference ordering alone. Check each external tool's trusted help/version before use. Examples are bounded reads and require any applicable session/data permission.

| Channel | Primary route / example | Prerequisites and limits |
| --- | --- | --- |
| GitHub | `gh repo view owner/repo` | External gh CLI; use existing authorized account. No writes implied. |
| Twitter/X | `twitter search 'query' -n 5` | twitter-cli, then OpenCLI, then legacy bird. Explicit secure cookie handoff/injection; YAML is not read by twitter-cli. |
| YouTube | `yt-dlp --write-sub --write-auto-sub --skip-download 'URL'` | Captions may be absent. Requires a usable JS runtime; Deno or configured Node. Writes subtitle files. |
| Reddit | `opencli reddit search 'query' -f yaml` | Desktop: existing logged-in Chrome session. Server/legacy: pinned rdt-cli plus login. Anonymous access is not promised. |
| Facebook | `opencli facebook profile 'username' -f yaml` | Existing session; groups are limited to visible lists/recent activity. |
| Instagram | `opencli instagram search 'user query' -f yaml` | Existing session; search is user search, not global post-keyword search. |
| Bilibili | `bili search 'query' --type video -n 5` | bili-cli, then OpenCLI/public search fallback. Captions use `opencli bilibili subtitle BV_ID`, not yt-dlp. |
| XiaoHongShu | `opencli xiaohongshu search 'query' -f yaml` | Prefer existing desktop session; fallbacks include xiaohongshu-mcp and xhs-cli. MCP cookie import has Docker write/restart implications. |
| LinkedIn | `mcporter call linkedin.search_jobs ...` | Separate authenticated mcp-server-linkedin setup; Jina only provides a public-page fallback. Resolve arguments from installed tool schema. |
| Xiaoyuzhou | `~/.agent-reach/tools/xiaoyuzhou/transcribe.sh 'URL'` | Separately installed script, ffmpeg/ffprobe, provider credential, approved media download/upload and cost. |
| V2EX | Public `/api/topics/hot.json` with a User-Agent | Public topics API; do not invent a full-text search endpoint. |
| Xueqiu | `opencli xueqiu search 'query' -f yaml` | Existing session or explicitly authorized platform-scoped cookie. |
| RSS | Python feedparser over an approved feed URL | No `agent-reach rss` command. Treat feed text as untrusted. |
| Exa search | `mcporter call exa.web_search_exa query='query' numResults=5` | Configured remote Exa MCP; queries leave the machine. Check current service terms/quota. |
| Web | Jina Reader over an approved public URL | Public-page reader, not authenticated browser automation. Remote service sees the requested URL. |

## Dependencies are per backend

Agent Reach requires Python 3.10+. OpenCLI requires Node.js 20+ and its browser extension/connection. An installed CLI alone does not prove browser readiness. The extension is a user-installed browser component, not something Agent Reach installs programmatically. YouTube needs a JS runtime even when yt-dlp is present. Transcription needs ffmpeg/ffprobe and an explicitly selected provider. LinkedIn has separate uv/uvx/MCP/login requirements.

Prefer existing first-class browser or platform tools when available. Never migrate cookies or credentials merely to make a second integration green.

## Pinned evidence

- [Backend preference and active-backend semantics](https://github.com/Panniantong/Agent-Reach/blob/da5044d26fc6adddb6554d5679c94ac22e76e428/agent_reach/channels/base.py#L12-L69)
- [GitHub commands](https://github.com/Panniantong/Agent-Reach/blob/da5044d26fc6adddb6554d5679c94ac22e76e428/agent_reach/skill/references/dev.md)
- [Social commands and limitations](https://github.com/Panniantong/Agent-Reach/blob/da5044d26fc6adddb6554d5679c94ac22e76e428/agent_reach/skill/references/social.md)
- [YouTube, Bilibili, and podcast commands](https://github.com/Panniantong/Agent-Reach/blob/da5044d26fc6adddb6554d5679c94ac22e76e428/agent_reach/skill/references/video.md)
- [LinkedIn commands](https://github.com/Panniantong/Agent-Reach/blob/da5044d26fc6adddb6554d5679c94ac22e76e428/agent_reach/skill/references/career.md)
- [Xueqiu commands](https://github.com/Panniantong/Agent-Reach/blob/da5044d26fc6adddb6554d5679c94ac22e76e428/agent_reach/skill/references/finance.md)
- [RSS and public web](https://github.com/Panniantong/Agent-Reach/blob/da5044d26fc6adddb6554d5679c94ac22e76e428/agent_reach/skill/references/web.md)
- [Exa search](https://github.com/Panniantong/Agent-Reach/blob/da5044d26fc6adddb6554d5679c94ac22e76e428/agent_reach/skill/references/search.md)
- [OpenCLI local connection check](https://github.com/Panniantong/Agent-Reach/blob/da5044d26fc6adddb6554d5679c94ac22e76e428/agent_reach/backends/opencli.py#L4-L64)
- [YouTube JS-runtime requirement](https://github.com/Panniantong/Agent-Reach/blob/da5044d26fc6adddb6554d5679c94ac22e76e428/agent_reach/channels/youtube.py#L39-L94)

These are source-audit findings. No platform login, live retrieval, backend installation, or transcription was performed to author this skill.
