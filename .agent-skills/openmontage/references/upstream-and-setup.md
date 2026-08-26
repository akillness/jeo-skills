# Upstream, setup, providers, and licensing

## Audited source

| Field | Value |
|---|---|
| Repository | `https://github.com/calesthio/OpenMontage` |
| Audited commit | `cd9f3c1f03368be87b140af494914b8ee4e3c7a4` |
| Commit date | 2026-08-22 |
| Default branch | `main` |
| License | AGPL-3.0 |
| Tags at audit time | none |
| GitHub releases at audit time | none |
| Audit date | 2026-08-26 |

The absence of releases makes `main` a moving target. Use a full commit hash for a
reproducible production, then compare intentionally when upgrading:

```bash
git clone https://github.com/calesthio/OpenMontage.git
cd OpenMontage
git checkout cd9f3c1f03368be87b140af494914b8ee4e3c7a4
git rev-parse HEAD
```

At the pin, the repository contains 13 pipeline YAML files, 103 pipeline-director
Markdown files, 157 Layer 2 Markdown files in `skills/`, 89 Layer 3 `SKILL.md` files,
167 Python files under `tools/`, and 109 `test_*.py` files. These are audit coordinates,
not promises about current `main`.

Recount from the checkout instead of repeating the snapshot:

```bash
find pipeline_defs -maxdepth 1 -type f -name '*.yaml' | wc -l
find skills/pipelines -type f -name '*.md' | wc -l
find skills -type f -name '*.md' | wc -l
find .agents/skills -type f -name SKILL.md | wc -l
find tools -type f -name '*.py' | wc -l
find tests -type f -name 'test_*.py' | wc -l
```

## Runtime model

OpenMontage has no Python control-loop process that makes the creative decisions. The
coding agent is the orchestrator:

```text
pipeline manifest -> stage director -> registry tool -> artifact/review/checkpoint -> human gate
```

Python provides tools, schemas, registry discovery, cost tracking, persistence, and the
Backlot server. The instructions in `AGENT_GUIDE.md`, `skills/`, and `.agents/skills/`
are runtime behavior, not optional documentation.

## Prerequisites

Baseline:

- Python 3.10+
- FFmpeg and ffprobe
- Node.js 18+ and npm/npx for the Remotion composer
- Git
- GNU Make on the documented quick-start path
- A coding assistant that can read files and run shell/Python commands

HyperFrames additionally needs Node.js 22+, FFmpeg, and a resolvable `npx hyperframes`
command. A local GPU is optional and only needed for local generation lanes. Provider
keys are optional; they expand capabilities but can introduce direct usage costs.

Run the skill's read-only preflight before installing:

```bash
bash .agent-skills/openmontage/scripts/openmontage.sh doctor /path/to/OpenMontage
bash .agent-skills/openmontage/scripts/openmontage.sh pipelines \
  /path/to/OpenMontage --strict
```

The doctor never clones, installs, starts a server, calls a provider, or prints a key.
It returns nonzero for missing hard prerequisites or an invalid checkout and reports
Node 18/22 readiness separately.

## What the Make targets do

| Target | Effect | Use |
|---|---|---|
| `make setup` | Creates `.venv`, installs core Python requirements, installs `remotion-composer` npm dependencies, installs Piper TTS, creates `.env` from example if absent | Chosen local checkout only |
| `make install` | Core Python dependencies | Minimal Python runtime |
| `make install-dev` | Core plus pytest, pytest-asyncio, httpx | Contribution/test lane |
| `make install-gpu` | Adds torch, torchaudio, torchvision | Only after hardware and disk approval |
| `make preflight` | Discovers registry and prints the full provider menu | Deep debugging; the skill wrapper uses the smaller summary first |
| `make test-contracts` | Runs `tests/contracts/` | Narrow governance regression |
| `make test` | Runs all tests | Full repository verification |
| `make lint` | Compiles selected core modules | Fast syntax smoke check |
| `make demo` | Renders zero-key demo videos | Explicit demo request only; writes media and can be slow |
| `make hyperframes-doctor` | Executes the HyperFrames doctor through the tool adapter | HyperFrames troubleshooting |
| `make hyperframes-warm` | Uses online npm resolution and refreshes the npx cache | Network-changing action; never blanket setup |
| `make clean` | Removes Python caches outside virtual environments | Explicit cleanup only |

`make setup`, `make install*`, npm commands, and demo renders are not valid blanket-skill
installation steps. Keep them on demand.

Manual setup without Make is documented upstream as:

```bash
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
(cd remotion-composer && npm install)
python -m pip install piper-tts
cp .env.example .env
```

On Windows, use the upstream PowerShell instructions. Do not improvise POSIX activation
or path syntax there.

## Credentials and provider discovery

The repository's `.env.example` lists many cloud providers. Do not turn that list into a
hardcoded preference order. Provider availability, dependencies, setup offers, status,
and runtime warnings come from the live registry:

```bash
.venv/bin/python -c "
from tools.tool_registry import registry
import json
registry.discover()
print(json.dumps(registry.provider_menu_summary(), indent=2))
"
```

Safe handling rules:

1. Never print, commit, copy into artifacts, or include credential values in logs.
2. Report a dependency only as configured or missing.
3. Keep `.env` untracked. At the pin, `.gitignore` excludes `.env`, `projects/`, and
   `music_library/`.
4. Group setup offers by shared dependency and explain what each unlocks.
5. Check current provider pricing before approval. Prices in docs and estimators are
   observations, not permanent contracts.
6. Announce tool, provider, model/variant, sample versus batch, and the maximum approved
   cost before the first paid request.
7. A timeout does not justify repeating a paid request. Inspect task ids, tool result,
   checkpoint partial progress, and provider status first.
8. In restricted shared installations, request administrator provisioning instead of
   telling a user to create a local `.env`.

The registry's summary is the first preflight surface. Use `provider_menu()` for focused
per-tool setup detail and `support_envelope()` only when debugging a full tool contract.
The latter can be extremely large.

## Zero-key does not mean zero dependency

OpenMontage documents local/free paths through Piper, FFmpeg, Remotion, HyperFrames, and
open or stock media. A path is usable only if live preflight reports its dependencies as
available. Some stock sources still need free developer keys. Local video generation
needs compatible models, GPU memory, disk, and additional packages.

Never promise a zero-key deliverable from README prose alone. Report `passed`, `degraded`,
or `blocked` from the actual host and selected manifest.

## AGPL boundary

The upstream repository is licensed under GNU Affero General Public License v3.0. In
operational terms:

- preserve the upstream license and notices;
- keep a record of the exact source revision used;
- review AGPL source-offer obligations before distributing a modified build or making a
  modified version available as a network service;
- do not paste or relicense upstream implementation code into an incompatible proprietary
  or permissively licensed codebase without an explicit licensing decision;
- prefer linking to upstream and writing original wrappers or operational guidance when
  a code copy is unnecessary.

This is workflow guidance, not legal advice. Escalate commercial redistribution,
embedding, and hosted-service questions to the project's legal owner.

## Upgrade audit

Before moving a production from the pin to current `main`:

1. fetch without discarding local work;
2. compare `AGENT_GUIDE.md`, `PROJECT_CONTEXT.md`, `pipeline_defs/`, `skills/meta/`,
   `tools/tool_registry.py`, `tools/base_tool.py`, `lib/checkpoint.py`, schemas, and
   `Makefile`;
3. run the dependency-free strict pipeline inventory;
4. run provider summary and record runtime changes;
5. run contract tests, lint, and the full suite;
6. exercise one zero-paid-call smoke production or fixture;
7. review generated artifacts and Backlot state before migrating a live project.
