# Solution Landscape: obsidian-cli structural hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Obsidian CLI | First-party desktop CLI | Official, broad command surface, TUI + one-shot mode, developer commands | Requires running desktop app, installer/channel constraints, not headless | Best when the app itself is part of the workflow |
| Obsidian URI | First-party URI protocol | Built-in, good for app launchers and callback handoff | Narrower than plugin/API layers, requires careful encoding | Best for open/new/daily/search and callback-style launch flows |
| Advanced URI | Community plugin | Richer URI actions: command invocation, workspace, frontmatter, replace/write flows | Plugin dependency, long/brittle encoded URLs possible | Most common “official URI isn’t enough” workaround |
| Local REST API for Obsidian | Community local API plugin | Structured CRUD/search/command execution for external automation | Plugin install/config, auth/cert handling, still tied to a live Obsidian environment | Better than CLI when a local API is the real need |
| Actions URI | Community callback plugin | Strong x-callback-url style app automation | Smaller ecosystem, narrower than REST/API routes | Good for shortcut/callback chains |
| Obsidian Headless | First-party headless client | Sync/Publish without desktop app, Node 22+, official path for service workflows | Beta and service-focused, not a desktop-control replacement | Correct route-out for sync/publish without GUI |
| Obsidian Git | Community plugin | Common backup/versioning/sync companion for dev/content workflows | Git conflict/credential complexity | Adjacent support tool, not a note-control API |
| LiveSync | Community sync plugin | Self-hosted sync with strong infra control | High operational overhead | Alternative to official Sync/Headless in self-hosted contexts |
| nb | Terminal-native notes CLI | Shell-native, Git-backed, no GUI dependency | Not Obsidian-native | Good adjacent alternative for plain-text note automation |
| zk | Terminal-native Zettelkasten CLI | Strong editor/CLI flow, plain-text first | Not Obsidian-native | Better when the requirement is note CLI, not app control |
| Joplin Terminal | Terminal-native notes app | Real headless CLI with sync and cron-friendly usage | Different ecosystem and workflow model | Strong comparison point for shell-native note operations |

## Categories
### 1. First-party desktop control
- Obsidian CLI
- Obsidian URI

### 2. Plugin/API expansion layer
- Advanced URI
- Local REST API for Obsidian
- Actions URI

### 3. Headless or sync-oriented routes
- Obsidian Headless
- Obsidian Git
- LiveSync

### 4. Adjacent terminal-native alternatives
- nb
- zk
- Joplin Terminal

## What People Actually Use
In practice, users mix surfaces instead of committing to one:
- Official CLI for desktop-local one-shot commands and plugin/theme development.
- URI links for launchers, shortcuts, and callback-style handoff.
- Advanced URI or Local REST API when built-in surfaces lack enough control.
- Filesystem writes or a different note CLI when desktop coupling becomes the problem.

## Frequency Ranking
1. Obsidian URI — baseline built-in automation layer
2. Local REST API — strongest structured external automation option in the plugin ecosystem
3. Advanced URI — most visible URI-extension workaround
4. Obsidian CLI — important first-party surface, but newer and desktop-bound
5. Obsidian Git / LiveSync — common supporting flows for sync and versioning
6. Obsidian Headless — strategically important route-out for no-desktop service workflows
7. nb / zk / Joplin Terminal — adjacent alternatives when terminal-native persistence is the real need

## Key Gaps
- First-party Obsidian automation still splits awkwardly between desktop CLI, URI handoff, and plugin/API workarounds.
- There is no one official surface that covers both app-control and headless/service use cases.
- Agent-safe deterministic targeting (`vault=` + exact `path=` + plugin prerequisite checks) is easy to under-specify.
- Installation and troubleshooting guidance can rot quickly because official CLI packaging details change.

## Contradictions
- Marketed idea: “Obsidian CLI = Obsidian automation.”  
  User reality: desktop app control, URI handoff, plugin automation, and headless sync are different jobs.
- Marketed idea: “URI automation is enough for external workflows.”  
  User reality: workspace switching, richer writes, command execution, and frontmatter edits still push people toward plugins like Advanced URI or Local REST API.
- Marketed idea: “CLI is a terminal interface.”  
  User reality: it is a terminal interface to a desktop runtime, not a shell-native note backend.

## Key Insight
The best bounded improvement is not another note-automation wrapper. It is to tighten `obsidian-cli` into a routing-first front door that quickly separates four cases: **desktop CLI command/TUI work**, **URI handoff/callback work**, **plugin/API-level automation that exceeds first-party coverage**, and **headless/sync jobs that should route away from this skill entirely**.

## Curated Sources
- Obsidian CLI: https://help.obsidian.md/Extending%20Obsidian/Obsidian%20CLI
- Obsidian URI: https://help.obsidian.md/Extending%20Obsidian/Obsidian%20URI
- Obsidian Headless: https://help.obsidian.md/Extending%20Obsidian/Obsidian%20Headless
- Advanced URI: https://github.com/Vinzent03/obsidian-advanced-uri
- Local REST API: https://github.com/coddingtonbear/obsidian-local-rest-api
- Actions URI: https://github.com/czottmann/obsidian-actions-uri
- Obsidian Git: https://github.com/denolehov/obsidian-git
- LiveSync: https://github.com/vrtmrz/obsidian-livesync
- nb: https://github.com/xwmx/nb
- zk: https://github.com/zk-org/zk
- Joplin Terminal: https://joplinapp.org/help/apps/terminal/
