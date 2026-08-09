# Pre-publish and pre-deploy security gate

Upstream ships its own checklist (`docs/security-and-open-sourcing.md`) opening
with a CAUTION. This reference makes each item actionable and says what it
actually costs. Run `scripts/preflight_audit.py` to check them deterministically.

```bash
python3 .agent-skills/goalflow/scripts/preflight_audit.py /path/to/goal-flow
```

## Blockers — fix before any push to a shared or public remote

### 1. Credentials in git history

The rule this encodes: the `.env*` files are no longer tracked and a
`.env.example` ships in their place, but **untracking does not remove them
from history**. A clean `git status` says nothing about what a clone can still
recover.

> **Where this actually bites.** The published `wanmol/goal-flow` history is
> already scrubbed — it has two commits and the only surviving `.env` blob is
> `.env.example`, so the audit is normally clean against a fresh clone.
> Upstream's warning was written for the pre-scrub state, and it still applies
> in full to **internal forks, mirrors, CI caches, and developer clones made
> before the scrub**. Those are what leak. Audit your own checkout, not the
> public one, and never treat "upstream is clean" as "we are clean".

What the files contained:

| File | Contains |
|---|---|
| `.env` | MySQL host/user/password, Redis cluster host/password, `DASHSCOPE_KEY`, Azure `OPENAI_KEY`, `OSS_*` keys, `LANGFUSE_*` keys, MCP/knowledge/image API keys, internal service URLs |
| `.env_prod` | production equivalents |
| `.env_test` | test equivalents |
| `.env_uat` | UAT equivalents |
| `deployment.yaml` | deployment config — review for embedded secrets |

Two steps, in this order:

1. **Rotate every credential now**, independent of any cleanup. They have been
   sitting in history; treat all of them as compromised — database passwords,
   Redis password, DashScope key, Azure OpenAI key, OSS access keys, Langfuse
   keys, MCP/image keys.
2. **Scrub history** before the first public push:

```bash
pip install git-filter-repo
git filter-repo --path .env --path .env_prod --path .env_test --path .env_uat --invert-paths
```

Then force-push to a **fresh** remote. Do not reuse a remote that already
carries the secrets in its history — the old objects survive there. This
rewrites history, so coordinate with anyone holding a clone.

### 2. Hard-coded internal endpoints

`src/goalflow/dify_parser/dify_dsl_parser.py` rewrites a list of hard-coded
internal hosts (rerank, knowledge indexer, hologres, image-gen, time service,
ES), and `.env` pins internal IP ranges (`10.3.x.x`, `172.26.x.x`) and
internal domains.

Replace hard-coded hosts with env vars plus documented defaults, and scrub
internal IPs and domains from committed files and examples. This also matters
for *your* correctness: see the host-substitution warning in
`references/dify-transpile.md`.

### 3. Alibaba Cloud endpoints in defaults

`oss-cn-region.aliyuncs.com` and `dashscope.aliyuncs.com` appear in
`.env.example` and the docs. These are **public vendor endpoints, not leaks** —
the audit reports them as `info`. They matter only because they encode the
project's origin: make them configurable if you are not on Alibaba Cloud.

## Already resolved upstream — verify, do not redo

| Item | State |
|---|---|
| `.gitignore` | Now ignores `.env`, `.env.*`, `.env_*` with a `!.env.example` exception, alongside `*.log`; `app.log` untracked |
| `.env.example` | Ships with placeholder values only. Keep it in sync as new vars appear, and make sure no real values slip back |
| `LICENSE` | MIT present. `agent_kit` is vendored (not a submodule) and relicensed MIT — no external remote, compatible license |

The audit script still checks these, because a fork can regress them.

## Should fix before a real deployment

### API-key auth is MD5-based

`src/goalflow/api/auth_validator.py` keys the workflow map by
`md5(api_key)`. MD5 is unsuitable for hashing secrets. If keys are secrets,
use a constant-time compare of a strong hash, or a proper token store. At
minimum, document the map as a demo mechanism — never present it as
production auth.

### CORS is fully open

`allow_origins="*"` combined with `allow_credentials=True` is **invalid per
the CORS spec** and unsafe. Restrict origins for any real deployment. The
audit flags this pairing specifically, not either setting alone.

### `CodeNode` executes provided Python

`CodeNode` runs model- or DSL-provided Python through `exec`, and the
parser's `safe_check()` AST guard is currently disabled/TODO. Treat generated
code as **trusted input only**. Re-enable and strengthen sandboxing before
accepting untrusted DSLs — a Dify export from an untrusted author is remote
code execution otherwise.

### Domain-specific leftovers

The project came out of an internal production system. Remove or clearly
isolate domain-specific URLs and business logic (financial service endpoints,
member-rights endpoints, and similar) rather than shipping them as examples.

## Nice to have

- `CONTRIBUTING.md`, issue templates, a code of conduct
- CI running the existing tests (`test/`, `src/agent_kit/tests/`)
- A `.env.example` per environment if the multi-env pattern stays
- Redact `app.log` history if it captured request payloads

## Manual audit commands

The script automates these; run them by hand when you want to see raw output.

```bash
# what secrets/config are tracked?
git ls-files | grep -E '\.env|\.pem|\.key|deployment\.yaml|\.log$'

# scan history for a known secret fragment
git log -p -S 'sk-' -- . | head

# find hard-coded internal IPs
grep -rEn '10\.3\.|172\.26\.|\.aliyuncs\.com' --include='*.py' --include='*.env*' .
```

## What a clean audit does and does not mean

A clean result means the checked patterns are absent from the working tree and
from the history paths the script inspects. It is **not** an authorization to
publish, and it cannot prove a secret was never committed under a filename the
script does not know about. Treat it as one gate among several, and keep
rotation as the durable mitigation — scrubbing history reduces exposure, but
only rotation ends it.
