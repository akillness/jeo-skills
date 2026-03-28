---
name: strix
description: >
  Install, configure, and operate Strix for AI-driven application security testing.
  Use when you need to run authorized vulnerability scans against local codebases,
  GitHub repositories, staging URLs, domains, or CI pipelines; configure Docker and
  LLM providers; choose quick, standard, or deep scan depth; or pass authenticated
  testing instructions to Strix. Triggers on: strix, ai pentest, vulnerability scan cli,
  appsec scan, bug bounty automation, strix ci, strix docker, strix scan mode,
  strix instruction file, headless security scan.
allowed-tools: Bash Read Write Edit Glob Grep WebFetch
compatibility: Requires Docker access and a configured LLM provider or compatible OpenAI-style endpoint. The CLI installs a native binary and pulls a sandbox image on first run.
license: Apache-2.0
metadata:
  tags: strix, appsec, pentest, vulnerability-scan, ci-cd, docker, llm, security-testing, bug-bounty, browser-automation
  version: "1.0"
  source: https://github.com/usestrix/strix
---

# strix - AI-Driven Application Security Testing

> **Keyword**: `strix` · `ai pentest` · `vulnerability scan cli` · `strix ci`
>
> Only use Strix against systems you own or are explicitly authorized to test.

Strix is an AI-driven application security CLI. It runs scans inside a Docker-backed sandbox, uses an LLM provider for reasoning, and can assess local directories, GitHub repositories, live URLs, domains, and multi-target combinations.

## When to use this skill

- Install Strix and verify Docker plus sandbox readiness
- Configure `STRIX_LLM`, `LLM_API_KEY`, optional `LLM_API_BASE`, and related runtime settings
- Run local white-box scans against a repository or directory
- Run black-box or grey-box scans against staging or production-like URLs you are authorized to test
- Pass credentials, scope, or rules of engagement with `--instruction` or `--instruction-file`
- Choose the right scan depth: `quick`, `standard`, or `deep`
- Run Strix headlessly in CI/CD and interpret exit codes
- Understand Strix's internal security "skills" and how they differ from this repo's skills

## Instructions

### Step 1: Install and preflight

1. Run `bash scripts/install.sh`
2. Confirm `strix --version` succeeds
3. Ensure Docker is installed and the daemon is running
4. Let the installer pull the sandbox image on first setup unless you intentionally skip it
5. For manual installation alternatives and direct commands, see [references/commands.md](references/commands.md)

### Step 2: Configure the model provider

Set the minimum required environment variables before running a scan:

```bash
export STRIX_LLM="openai/gpt-5.4"
export LLM_API_KEY="your-api-key"
```

Optional runtime variables:

- `LLM_API_BASE` for OpenAI-compatible proxies or local endpoints
- `PERPLEXITY_API_KEY` for web search during scans
- `STRIX_REASONING_EFFORT` to tune model effort
- `STRIX_DISABLE_BROWSER=true` when UI automation is unnecessary
- `STRIX_TELEMETRY=0` to disable telemetry defaults

Provider examples, config-file format, and optional environment variables are in [references/providers-and-config.md](references/providers-and-config.md).

### Step 3: Pick the target and scan mode

Strix accepts these target types:

- Local directory: `./app`
- GitHub repository URL: `https://github.com/org/repo`
- Live web app URL: `https://staging.example.com`
- Domain or IP
- Multi-target scans via repeated `--target` or `-t`

Scan modes:

- `quick`: PR checks, smoke tests, fast CI feedback
- `standard`: routine security reviews
- `deep`: default full assessment and longer bug-bounty-style exploration

Detailed mode and CI guidance lives in [references/scan-modes-and-ci.md](references/scan-modes-and-ci.md).

### Step 4: Run the scan

Use `bash scripts/run-scan.sh` for a repeatable wrapper or call `strix` directly.

Common direct commands:

```bash
strix --target ./app
strix --target https://github.com/org/repo
strix --target https://staging.example.com --instruction-file ./instruction.md
strix -t https://github.com/org/repo -t https://staging.example.com
```

When authenticated or scoped testing matters, prefer `--instruction-file` over long inline prompts so credentials, exclusions, and rules of engagement stay explicit and reviewable.

### Step 5: Review outputs and iterate

Strix stores results under `strix_runs/<run-name>`.

Exit codes to remember:

- `0`: completed without findings
- `1`: execution or environment error
- `2`: vulnerabilities found in headless mode

Use the run artifacts to confirm what Strix tested, what it found, and what needs revalidation after fixes.

### Step 6: Automate in CI/CD

Use headless mode in automation:

```bash
strix -n --target ./ --scan-mode quick
```

CI runners need Docker access. For pull requests, default to `quick`; reserve `standard` or `deep` for scheduled or release-stage jobs. See [references/scan-modes-and-ci.md](references/scan-modes-and-ci.md) and `scripts/ci-scan.sh`.

### Step 7: Understand Strix internal skills

Strix has its own internal security knowledge packs under `strix/skills/`. They are not the same as this repo's agent skills.

- Strix auto-selects up to 5 relevant internal skills per task
- Categories include vulnerabilities, frameworks, technologies, protocols, and tooling
- These internal skills enrich Strix agent behavior during the scan itself

See [references/built-in-skills.md](references/built-in-skills.md) before assuming "skill" means the same thing across both ecosystems.

## Examples

### Example 1: Quick PR scan of a local repository

```bash
export STRIX_LLM="openai/gpt-5.4"
export LLM_API_KEY="your-api-key"
strix -n --target ./ --scan-mode quick
```

### Example 2: Standard scan of a GitHub repository

```bash
strix --target https://github.com/acme/payments --scan-mode standard
```

### Example 3: Grey-box scan of a staging URL

```bash
strix --target https://staging.example.com \
  --instruction-file ./instruction.md \
  --scan-mode deep
```

### Example 4: Combined repo plus live target

```bash
strix -t https://github.com/acme/payments \
  -t https://staging.example.com \
  --instruction "Correlate source paths with exposed runtime issues"
```

### Example 5: Browser-disabled API-focused scan

```bash
STRIX_DISABLE_BROWSER=true \
strix --target https://api.example.com --scan-mode standard
```

### Example 6: Scripted run wrapper

```bash
bash scripts/run-scan.sh \
  --target ./app \
  --scan-mode quick \
  --non-interactive
```

## Best practices

1. Only test assets you own or are explicitly permitted to assess.
2. Start with `quick` in CI and widen depth only when signal justifies the extra runtime.
3. Keep secrets in environment variables, secret stores, or instruction files under your control instead of scattering them inline.
4. Use both source and live targets together when you need better reproduction and remediation context.
5. Expect the first run to be slower because Strix may pull its sandbox image.
6. Treat `strix_runs/` as evidence: archive useful runs, especially when findings are heading into triage or remediation.
7. Be explicit about scope, exclusions, credentials, and rate limits so Strix does not waste time exploring irrelevant surfaces.
8. Distinguish this repo's `strix` skill from Strix internal skills to avoid instruction confusion.

## References

- [references/commands.md](references/commands.md)
- [references/providers-and-config.md](references/providers-and-config.md)
- [references/scan-modes-and-ci.md](references/scan-modes-and-ci.md)
- [references/built-in-skills.md](references/built-in-skills.md)
- [scripts/install.sh](scripts/install.sh)
- [scripts/run-scan.sh](scripts/run-scan.sh)
- [scripts/ci-scan.sh](scripts/ci-scan.sh)
- [Strix GitHub Repository](https://github.com/usestrix/strix)
- [Strix Documentation](https://docs.strix.ai)
