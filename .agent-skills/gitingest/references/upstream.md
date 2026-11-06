# gitingest audited reference

Audit of [`coderamp-labs/gitingest`](https://github.com/coderamp-labs/gitingest) at commit
[`4e259a02fe72115bee538271622f1234a81c8e1a`](https://github.com/coderamp-labs/gitingest/tree/4e259a02fe72115bee538271622f1234a81c8e1a)
(committed 2025-08-16T01:30:46Z, a CodeQL action bump; `pyproject.toml` version 0.3.1), observed 2026-11-06.
License: MIT. Latest GitHub release and PyPI version at audit time: 0.3.1 (published 2025-07-31). The
default branch's latest commit is the one above (2025-08-16); the GitHub API reported `pushed_at` 2026-11-06T00:02:37Z, and this audit did not determine which ref moved.
`references/source.json` records the SHA-256 of the 9 files this audit read.

## Identity

"Turn any Git repository into a prompt-friendly text ingest for LLMs." Four surfaces: the `gitingest`
CLI (`gitingest.__main__:main`), the Python API (`ingest`, `ingest_async`), the hosted site
[gitingest.com](https://gitingest.com), and a self-hostable FastAPI server (`pip install gitingest[server]`
or Docker). Browser extensions for Chrome, Firefox and Edge are linked from the README and are developed
in a separate repository (`lcandy2/gitingest-extension`), not by the maintainers of this one.

## CLI and Python API

```bash
pip install gitingest                 # or pipx install gitingest
gitingest /path/to/directory          # writes digest.txt in the current directory
gitingest https://github.com/user/repo
gitingest https://github.com/user/repo/tree/main/src/pkg    # a subdirectory
gitingest -o - https://github.com/user/repo                 # digest to stdout
```

Options (`src/gitingest/__main__.py`): `--max-size/-s` (default 10485760 bytes), `--exclude-pattern/-e` and `--include-pattern/-i` (shell-style, repeatable), `--branch/-b`, `--include-gitignored`, `--include-submodules`, `--token/-t` (default from `GITHUB_TOKEN`), `--output/-o` (default `digest.txt`, `-` for stdout). `source` defaults to `.`.

```python
from gitingest import ingest
summary, tree, content = ingest("path/or/url")      # ingest_async for asyncio and Jupyter
```

- Limits (`src/gitingest/config.py`): 10 MiB per file, depth 20, 10,000 files, 500 MiB total output, 60 s default timeout. Temporary clones live under `<tempdir>/gitingest`; `entrypoint.py` removes the clone's parent directory after processing.
- Remote clones are shallow and single-branch (`--depth=1`, `--single-branch`, `--no-checkout`); a subdirectory URL uses a blobless sparse clone. `--include-submodules` runs a recursive depth-1 submodule update.
- Python 3.8 through 3.13 per the package classifiers; `requires-python >= 3.8`; runtime dependencies `click`, `gitpython`, `httpx`, `loguru`, `pathspec`, `pydantic`, `python-dotenv`, `starlette`, `tiktoken`.
- `--include-gitignored` includes files matched by `.gitignore` and `.gitingestignore`; by default they are skipped.

Observed locally (2026-11-06, PyPI `gitingest==0.3.1` in a throwaway Python 3.11 virtualenv, directory containing fake files): the CLI prints `Summary:`, `Directory:`, `Files analyzed:`, and `Estimated tokens:` after writing the digest; the digest starts with `Directory structure:` and a tree, then each file under `FILE: <path>` banners.

## Hosted service

- The README's tagline and usage say to replace `hub` with `ingest` in any GitHub URL. That request goes to gitingest.com, which clones and digests the repository on the operator's servers.
- The server's web form (`src/server/templates/components/git_form.jinja`) has a "Private Repository" checkbox and a password-style "Personal Access Token" field. A token typed there is sent to whoever runs the site.
- README stack lists PostHog analytics and Sentry error tracking for the hosted/server application.

## Safety findings

- **Secrets are not filtered by name.** `DEFAULT_IGNORE_PATTERNS` in `src/gitingest/utils/ignore_patterns.py` lists `env` and `.env` under "Virtual environments", plus build artifacts, caches and media. It has no key, certificate or credential patterns. Observed with 0.3.1: a directory containing `.env`, `.env.local`, `server.pem`, `app.py` and six Markdown files produced a digest of 9 files that included the contents of `.env.local` and `server.pem` (fake values) and excluded only `.env`.
- **Token in the clone URL.** `create_authenticated_url` builds `x-oauth-basic:<token>@host` and passes it to `git clone` for GitHub hosts, so the token is in the git process arguments while the clone runs. `resolve_token` also reads `GITHUB_TOKEN` from the environment for any GitHub URL, validated only by a PAT-format regex. Use a fine-grained, read-only, short-lived token in the environment for one command.
- **Prompt injection.** A digest is repository text placed into a model's context. Instructions inside the repository reach the model as if from the user; treat the digest as data.
- **Disclosure.** Pasting a digest into a hosted model sends every included file to that provider. Scope with `-i` and `-e`, review the digest, then share.
- **Size.** A whole-repository digest can exceed a model's context window; the CLI prints an estimated token count (tiktoken) to help.

## Self-host

- Docker: `docker build -t gitingest .` then `docker run -d --name gitingest -p 8000:8000 gitingest`; `ALLOWED_HOSTS` defaults to `gitingest.com, *.gitingest.com, localhost, 127.0.0.1`. `compose.yml` has `app` (prod), `app-dev` and `minio` services; the README lists default MinIO credentials `minioadmin` / `minioadmin` and app S3 credentials `gitingest` / `gitingest123`, and a metrics port bound to `127.0.0.1:9090` by default.
- Sentry: `GITINGEST_SENTRY_SEND_DEFAULT_PII` defaults to `"true"` when Sentry is enabled; `GITINGEST_SENTRY_ENABLED` and `GITINGEST_SENTRY_DSN` turn it on.
- [INFERENCE] The server accepts repository URLs from clients, so it is plausibly an SSRF and resource-exhaustion surface; the audit did not review its hardening. Put it behind the user's own access control and change every default credential.

## Not verified

No remote ingestion, hosted-site request, token use, server start or Docker build was run during this
audit; the local smoke above used fake files only. The helper's `runtime_verified` is always false.
