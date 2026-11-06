# Fabric audited reference

Audit of [`danielmiessler/fabric`](https://github.com/danielmiessler/fabric) at commit
[`8e8511c770b2589a6066398a86343fbf8c2a56a3`](https://github.com/danielmiessler/fabric/tree/8e8511c770b2589a6066398a86343fbf8c2a56a3)
(committed 2026-11-03T22:21:18Z, "chore(release): Update version to v1.4.564"), observed 2026-11-06.
License: MIT. `references/source.json` records the SHA-256 of the 9 files this audit read and
`scripts/preflight.py --repo` compares a checkout against them. The rest of this skill's guidance
predates the pin (it cites the upstream README from 2026-04-18); this file adds the audited facts the
offline helper depends on and does not replace the routing guidance in `SKILL.md`.

## Install names

The README lists `install.sh` piped to bash, Homebrew `fabric-ai`, Arch `fabric-ai` (AUR), winget `danielmiessler.Fabric`, Scoop `fabric-ai`, `go install github.com/danielmiessler/fabric/cmd/fabric@latest`, and Docker images. Homebrew, Arch and Scoop expose the binary as `fabric-ai`, so the README suggests `alias fabric='fabric-ai'`. The helper therefore accepts either name on PATH. The `install.sh` line executes a downloaded script; treat it as a remote-code approval.

## Configuration and state

- Everything lives under `~/.config/fabric`: `.env` (provider keys and plugin settings), `patterns/`, `strategies/`, and session and context data. `fabric --setup` (`-S`) creates and fills it.
- `.env` is written atomically with a lock and mode `0600` by this version (`internal/plugins/db/fsdb/db.go`); a comment there notes older versions saved it with `0644`. The helper reports a group- or other-readable `.env` without reading it.
- Provider key names stored in `.env` include `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `MISTRAL_API_KEY`, `OPENROUTER_API_KEY`, `DEEPSEEK_API_KEY` (`internal/server/configuration.go`). The helper reports only whether the same names are set in its own process environment.
- `FABRIC_MODEL_<PATTERN>` selects a model per pattern; `FABRIC_API_KEY` and `FABRIC_CORS_ORIGINS` configure the server.

## Network behavior

- **Patterns download.** `internal/tools/patterns_loader.go` defaults to `https://github.com/danielmiessler/fabric.git`, folder `data/patterns`, cloned with go-git (falling back to the git CLI). Setup and `--updatepatterns` therefore pull prompt text from upstream at run time, not pinned to this audit. The repository URL and folder are setup questions, so a team can point them at its own fork.
- **Jina AI.** `--scrape_url` and `--scrape_question` use Jina AI (`https://r.jina.ai/<url>`); the URL or question leaves the machine for that service.
- **Models.** Every pattern run sends the input to the configured provider, or to a local Ollama or LM Studio endpoint.
- **External tools.** `--youtube` runs `yt-dlp`; `--visual` and large-audio splitting run `ffmpeg`.
- A name search of `internal` and `cmd` found no analytics or telemetry code (posthog, sentry, mixpanel) and no update-check call; the only `api.github.com` use is the changelog generator tool.

## REST server

`fabric --serve` (README; `internal/cli/flags.go`, `internal/server/auth.go`, `loopback_guard.go`):

- `--address` defaults to `127.0.0.1:8080`.
- A non-loopback address is refused unless an API key is set (`requireAPIKeyForBind`); an empty or unspecified host counts as non-loopback. A key under 16 characters triggers a warning.
- The key is sent as the `X-API-Key` header, compared by SHA-256 in constant time, with a lock-out after 10 wrong keys within a minute; `/swagger/` routes are exempt from auth.
- `--api-key` puts the key on the command line; `FABRIC_API_KEY` supplies it from the environment instead.
- `loopback_guard.go` checks the Host header against loopback names and configured CORS origins to resist DNS rebinding; `--cors-origins` or `FABRIC_CORS_ORIGINS` adds browser origins (`*` allows all).
- `--serveOllama` adds Ollama-compatible endpoints. The `configuration` handler can write provider keys into `.env`, so keep the server loopback-only and behind the user's own access control unless there is a reason not to.

## Not verified

No fabric binary, pattern, provider call, server, setup run, download, or `install.sh` was executed during
this audit. The helper's `runtime_verified` is always false.
