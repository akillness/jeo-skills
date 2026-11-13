# Pinned NVIDIA SkillEvaluator operator notes

Repository: [NVIDIA/SkillEvaluator](https://github.com/NVIDIA/SkillEvaluator/tree/12b387f7a62b5f3e0de9eff392a3f6b7e952f2c2). Snapshot: `12b387f7a62b5f3e0de9eff392a3f6b7e952f2c2`, 2026-11-12, package version **0.8.0**. These are source-confirmed command recipes, not evidence of a local install or successful runtime. Commands below use an installed `skillevaluator`; install only after approval. Set target/output paths for the actual job before executing.

## Offline preflight

From any directory, with `SKILL_DIR` pointing to this package's canonical real directory (no symlink components, rather than a host-specific per-skill symlink):

```bash
python3 "$SKILL_DIR/scripts/preflight.py" --json
python3 "$SKILL_DIR/scripts/preflight.py" --json --repo /absolute/real/path/to/SkillEvaluator
```

The bundled helper reads `references/source.json`, discovers executable paths without running them, and optionally hashes the 12 listed files. Its source match is **selected bytes only**, not whole-tree integrity, Git HEAD, provenance authentication, malware/security scanning, dependency verification, scanner coverage, or runtime proof. Supply absolute nonsymlink package/source roots with nonsymlink ancestors; `/private/tmp/...` avoids macOS's `/tmp` symlink. Missing optional tools are informational. Exit `0` is successful inventory/matching selected bytes; `1` is missing/mismatched selected source; `2` is unsafe input or malformed manifest. The helper's three verification flags remain false. Its secure POSIX `dir_fd`/`O_NOFOLLOW` traversal fails closed as `secure_posix_traversal_unavailable` on unsupported hosts (including unsupported Windows configurations); evaluator CLI platform support is a separate question.

[Scenario assertions](../evals/evals.json) evaluate this operator skill's routing and claims; they are not upstream Tier 3 execution results. The helper lives at [scripts/preflight.py](../scripts/preflight.py).

## Installation: docs only versus evaluator runtime

Catalog/setup installation copies this skill's documentation and support files. It does not install NVIDIA's CLI, extras, scanner executables, Docker, agents, provider clients or credentials.

The pinned [package requirements](https://github.com/NVIDIA/SkillEvaluator/blob/12b387f7a62b5f3e0de9eff392a3f6b7e952f2c2/pyproject.toml) require **Python >=3.12,<3.15**. The [installation guide](https://github.com/NVIDIA/SkillEvaluator/blob/12b387f7a62b5f3e0de9eff392a3f6b7e952f2c2/docs/installation.mdx) supports uv-managed Python 3.13. With explicit install/download approval, pin the guide's Git install instead of following its moving default branch:

```bash
uv tool install --python 3.13 "skillevaluator @ git+https://github.com/NVIDIA/SkillEvaluator.git@12b387f7a62b5f3e0de9eff392a3f6b7e952f2c2"
```

Choose extras for the next lane: `llm` for rubric/model clients; `security` for Bandit/pip-audit; `tier2` for embeddings/chat; `tier3` for Harbor 0.25.0/live runs. `all` includes `tier2,tier3,security`, not optional `dashboard` or external tools. To replace an existing install with the full evaluator bundle, separately approve reinstall and downloads:

```bash
uv tool install --python 3.13 --reinstall "skillevaluator[all] @ git+https://github.com/NVIDIA/SkillEvaluator.git@12b387f7a62b5f3e0de9eff392a3f6b7e952f2c2"
skillevaluator --version
```

`--version` establishes command resolution/version only. A checkout operator may instead use the pinned source and the README's `uv run --python 3.13` plus the relevant `--extra`; uv can provision Python and dependencies, so it is not an offline inspection command.

## Quality versus Tier 1

For an already installed base CLI, choose the narrow, keyless first result:

```bash
skillevaluator quality-check ./my-skill -r cli -r json -o ./reports/quality
```

No model key, scanner, Docker or GPU is required. Minimum quality score defaults to **70**; the standalone file is `skillevaluator-quality.json`. Quality is one static dimension, not a security verdict or publication recommendation. Its isolated publication evidence remains `INCOMPLETE`.

For full static checks, first approve scanner provisioning and any dependency-audit network access, then:

```bash
skillevaluator tier1 ./my-skill --no-llm -r cli -r json -o ./reports/tier1
```

Direct Tier 1 includes dependency auditing. LLM stages otherwise join automatically when a provider is configured; `--no-llm` skips those stages, **not scanners or network**. At this pin:

- Missing SkillSpector triggers a **2.13.3** wheel download, SHA-256 verification and `uv tool run`; uv/network are required on first use.
- Missing Gitleaks triggers a checksum-verified **8.30.0** release download without a confirmation prompt, including in CI. Its provisioner supports Linux/macOS.
- Semgrep is optional unless `SKILLEVALUATOR_REQUIRE_SEMGREP=1`; `security` installs Bandit and pip-audit, not all external executables. Installed scanner executables take precedence.

Required scanner failures leave evidence `INCOMPLETE` and a nonzero result. Skipping a scanner or narrowing checks can produce a useful partial report but cannot certify complete Tier 1 publication evidence. Do not silently install a scanner, suppress its findings, or call keyless operation offline. See [Tier 1 guide](https://github.com/NVIDIA/SkillEvaluator/blob/12b387f7a62b5f3e0de9eff392a3f6b7e952f2c2/docs/tier1-validation.mdx) and installation's System tools section.

## Tier 2: approve content egress and name the comparison scope

```bash
skillevaluator tier2 ./my-skill -r cli -r json -o ./reports/tier2
```

This analyzes **one skill internally**, using embedding requests and chat-LLM verification of candidate clusters. Source reads being local does not keep processing local: configured hosted providers receive chunk text and candidate text. No external vector database is needed. Review the files and endpoint destinations before approving egress or spend; a local OpenAI-compatible server is an alternative only when separately configured and trusted.

For inter-skill coverage, build a versioned local catalog from the intended collection, then supply it:

```bash
skillevaluator similarity-check ./skills --save-catalog ./skill-catalog.json
skillevaluator tier2 ./my-skill --catalog ./skill-catalog.json -r cli -r json -o ./reports/tier2-catalog
```

Catalog generation writes a local JSON file and uses embeddings; `similarity-check` itself is embeddings-only. Direct `tier2` still includes chat-backed intra-skill analysis. Without `--catalog`, inter-skill comparison is explicitly **not run**, not zero matches. Record catalog membership, embedding provider/model and comparison mode; rebuild catalogs when changing embedding models. Provider failures are incomplete analysis, not duplicate-content findings.

Use the [Tier 2 guide](https://github.com/NVIDIA/SkillEvaluator/blob/12b387f7a62b5f3e0de9eff392a3f6b7e952f2c2/docs/tier2-deduplication.mdx) and [provider configuration](https://github.com/NVIDIA/SkillEvaluator/blob/12b387f7a62b5f3e0de9eff392a3f6b7e952f2c2/docs/configuration.mdx). OpenAI and NVIDIA Build can share one credential for chat and embeddings. Anthropic/Bedrock require a separate embedding-capable provider.

## Tier 3: review coverage before live execution

Check readiness without claiming inference:

```bash
skillevaluator doctor --env-mode docker
```

Ordinary readiness probes are not live agent trials. `doctor --verify-models` makes credential-bearing requests; Tier 3 checks model catalogs, which may be public or otherwise non-authoritative for inference. `doctor --tier 2 --verify-models` sends one embedding and one chat request. The optional live-run `--agent-runtime-preflight` executes an extra task per agent and can incur charges; it does not independently prove a judge-only route before grading.

For missing datasets, preview keyless templates before approving writes:

```bash
skillevaluator create-eval-dataset ./my-skill --full --no-llm --dry-run
```

After approval, remove `--dry-run` to write `evals/evals.json`, review every prompt/expected outcome/assertion/fixture, then validate:

```bash
skillevaluator tier3 validate ./my-skill --strict --json
```

`--full` with an LLM generates up to four buckets: explicit, implicit, contextual and negative. Keyless `--no-llm --full` templates supply positive buckets and include a negative case only when `evals/EVAL.md` authors one. Neither a larger count nor generated cases establishes representative coverage. Keep operator-skill eval scenarios separate from any upstream dataset you deliberately prepare.

With approved provider/agent credentials, code execution, image preparation and report retention, run a paired comparison against reviewed existing sources:

```bash
skillevaluator tier3 evaluate ./my-skill --agents opencode --env-mode docker --n-attempts 1
```

Choose an agent/model supported by the selected provider, not merely the example name. Native defaults are OpenCode for NVIDIA Build, Codex for OpenAI and Claude Code for Anthropic. Provider/agent credentials may have separate roles. Docker is the default sandbox; experimental local mode executes on the host with weaker isolation and is only for trusted skills/workspaces.

For a with-skill-only iteration, explicitly approve the reduced comparison:

```bash
skillevaluator tier3 evaluate ./my-skill --agents opencode --env-mode docker --n-attempts 1 --skip-baseline
```

`--skip-baseline` removes the no-skill arm, so **Skill Lift is unavailable**; it cannot establish benefit or harm relative to a baseline. Restore the paired run for comparative claims. Trial volume is approximately `cases × agents × attempts × arms`; agent/model requests, judges, dataset generation and optional runtime preflight add work, while managed sandboxes can add charges. Concurrency is not a cost cap.

The direct shortcut `skillevaluator tier3 ./my-skill` implicitly prepares one missing starter case and proceeds to live paired evaluation. Expert `tier3 evaluate` requires existing sources unless `--autopilot` is added. Both reuse valid sources and reject invalid ones rather than repairing them by overwrite. A one-case starter has limited coverage, especially negatives/expectations; do not advertise it as a benchmark. Generation and report writes are effects, not inspection.

See [live evaluation](https://github.com/NVIDIA/SkillEvaluator/blob/12b387f7a62b5f3e0de9eff392a3f6b7e952f2c2/docs/tier3-live-evaluation.mdx), [provider credentials](https://github.com/NVIDIA/SkillEvaluator/blob/12b387f7a62b5f3e0de9eff392a3f6b7e952f2c2/docs/configuration.mdx), and [CLI command implementations](https://github.com/NVIDIA/SkillEvaluator/blob/12b387f7a62b5f3e0de9eff392a3f6b7e952f2c2/src/skillevaluator/cli.py).

## Combined validation: freeze blocking policy

Only after approving all selected effects:

```bash
skillevaluator validate ./my-skill --no-autopilot -r cli -r json -o ./reports/combined
```

For skills, `validate` defaults to **all three tiers**, normally with autopilot; this example requires existing eval sources. Tier 1 always gates. Tier 2 runs and gates by default; `--no-block-on-dedup` makes findings advisory without skipping the analysis. Tier 3 is advisory unless `--block-on-agent-eval` is set. `--tiers 1,2` omits live evaluation, and `--tiers 1` selects static checks; selection must include Tier 1. `--no-dedup` alone does **not** disable Tier 3.

Unlike direct Tier 1, combined validation's dependency audit is opt-in; its LLM security/verification checks are opt-in and it does not add the direct workflow's rubric stage. Missing provider configuration can be recorded as skipped Tier 2/3 while reports are still written. A passing process can therefore coexist with missing publication evidence. See [CLI defaults and comparisons](https://github.com/NVIDIA/SkillEvaluator/blob/12b387f7a62b5f3e0de9eff392a3f6b7e952f2c2/docs/cli-reference.mdx).

## Reports: execution, gate and publication are different

| Observation | Truthful interpretation |
| --- | --- |
| Upstream CLI exit `0` | The command's execution/gating contract succeeded, not necessarily all findings or publication requirements |
| Upstream CLI exit `1` | Validation failed, required execution was incomplete, or an internal error occurred; inspect artifacts |
| Upstream CLI exit `2` | Usage/path/option error |
| Direct Tier 3 completed with verdict `FAIL` but exit `0` | Completed measurement with a negative skill verdict; direct Tier 3's exit is not the combined policy gate |
| Required scanner/provider/judge evidence unavailable | Preserve `INCOMPLETE` or execution failure; unavailable is not a measured zero |
| Publication card `PASS` | Its required evidence and policy support publication; not an NVIDIA certification |
| Publication card `FAIL` | Recorded evidence fails its verdict requirements; report the failed dimensions/findings |
| Publication card `NEUTRAL` | Evidence is complete but at least one required dimension remains below its pass band |
| Publication card `INCOMPLETE` | Missing/skipped/incomplete required evidence cannot support publication |

Confirmed check failures can take precedence over missing evidence in command summaries; retain both facts. `validate` writes `BENCHMARK.md` for skill targets even when validation fails, with publication assessment separate from the process gate. Required Tier 2/3 evidence is expected by default; disclosed policy exceptions do not imply those tiers ran. Quality-only and static-only evidence do not establish agent impact.

Direct Tier 1/2 use fixed `skillevaluator-tier1.*` / `skillevaluator-tier2.*` basenames; repeated runs can overwrite them. Combined reports use `skillevaluator-output-<timestamp>.*`. Tier 3 writes retained run artifacts including `result.json` and reports; use the emitted artifact paths, and `--results-dir` rather than Tier 1/2 `-r`/`-o`. Review source excerpts, task inputs, outputs and trajectories before sharing. See [Reports & Results](https://github.com/NVIDIA/SkillEvaluator/blob/12b387f7a62b5f3e0de9eff392a3f6b7e952f2c2/docs/reports.mdx).

## Repository CI: preview before save, PR or publication

For an existing target checkout, preview checks-only setup without login or changes:

```bash
skillevaluator ci init --mode preview --no-input --checks-only --show-files
```

The [onboarding implementation](https://github.com/NVIDIA/SkillEvaluator/blob/12b387f7a62b5f3e0de9eff392a3f6b7e952f2c2/src/skillevaluator/ci_onboarding.py) defines modes `preview`, `save` and `pr`. Preview inspects the local Git repository and renders a plan. `--mode save` writes workflow files after approval; `--mode pr` can change GitHub settings, push setup/history branches and open a PR. Bare `ci init` is interactive, not a read-only probe, and `--no-input --mode pr` is explicit authorization, not a harmless default.

Obtain separate approval for workflow writes, GitHub authentication/scopes/settings, branch pushes/PRs, merge/activation, model secrets/spend and report uploads/Pages/PR comments. The CLI does not merge the setup PR. Hosted reports can include source excerpts; a private repository does not automatically make its Pages site private. Prefer downloadable artifacts when hosting is inappropriate. Preserve existing workflows, action allowlists, Pages content and branch rules. Baseline quality/security onboarding does not demonstrate that Tier 2/3 ran.

For manual GitHub/GitLab setup, use the **0.8.0 bundle at this exact commit**, not `/main`, `/latest`, or an unpinned reusable workflow:

- [GitHub checks template](https://github.com/NVIDIA/SkillEvaluator/blob/12b387f7a62b5f3e0de9eff392a3f6b7e952f2c2/ci/bundles/0.8.0/skill-checks.yml) → `.github/workflows/skill-checks.yml`.
- [GitLab checks template](https://github.com/NVIDIA/SkillEvaluator/blob/12b387f7a62b5f3e0de9eff392a3f6b7e952f2c2/ci/bundles/0.8.0/gitlab-skill-checks.yml) → merge into root `.gitlab-ci.yml` under review.
- [Optional publisher](https://github.com/NVIDIA/SkillEvaluator/blob/12b387f7a62b5f3e0de9eff392a3f6b7e952f2c2/ci/bundles/0.8.0/publish-skill-reports.yml) and [bundle instructions](https://github.com/NVIDIA/SkillEvaluator/blob/12b387f7a62b5f3e0de9eff392a3f6b7e952f2c2/ci/bundles/0.8.0/README.md) have additional permissions, trusted-caller and hosting setup; preserve their filled-in workflow/image pins.

Copying or merging a template activates future automation only through the repository's approved process. It is not a verified scan. See the pinned [CLI setup guide](https://github.com/NVIDIA/SkillEvaluator/blob/12b387f7a62b5f3e0de9eff392a3f6b7e952f2c2/docs/cli-onboarding.mdx), [GitHub guide](https://github.com/NVIDIA/SkillEvaluator/blob/12b387f7a62b5f3e0de9eff392a3f6b7e952f2c2/docs/github-actions.mdx), and [GitLab guide](https://github.com/NVIDIA/SkillEvaluator/blob/12b387f7a62b5f3e0de9eff392a3f6b7e952f2c2/docs/gitlab-ci.mdx).

## Source scope and attribution

[README](https://github.com/NVIDIA/SkillEvaluator/blob/12b387f7a62b5f3e0de9eff392a3f6b7e952f2c2/README.md), the linked guides, package metadata and command source were inspected at the recorded pin. [source.json](source.json) stores actual raw-file byte SHA-256 values for a bounded 12-file subset; other linked/inspected files are outside that hash check. Git blob IDs, release versions and normalized text are not substituted for byte SHA-256.

Upstream is **Apache-2.0**, confirmed in [LICENSE](https://github.com/NVIDIA/SkillEvaluator/blob/12b387f7a62b5f3e0de9eff392a3f6b7e952f2c2/LICENSE) and `pyproject.toml`. Its [NOTICE](https://github.com/NVIDIA/SkillEvaluator/blob/12b387f7a62b5f3e0de9eff392a3f6b7e952f2c2/NOTICE) states:

```text
SkillEvaluator

Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.

This product includes software developed by NVIDIA CORPORATION & AFFILIATES.
Third-party dependency notices are listed in THIRD_PARTY_NOTICES.md.
```

This package supplies newly authored operator guidance and an offline manifest helper, not vendored NVIDIA evaluator implementation or scanners. If implementation is redistributed later, include the applicable license/NOTICE, preserve attribution and mark modifications; review [third-party notices](https://github.com/NVIDIA/SkillEvaluator/blob/12b387f7a62b5f3e0de9eff392a3f6b7e952f2c2/THIRD_PARTY_NOTICES.md) and scanner/backend licenses separately. Source inspection and selected-file matches make no runtime, support-entitlement, certification or security guarantee.
