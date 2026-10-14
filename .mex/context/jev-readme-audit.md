---
name: jev-readme-audit
description: Fresh README-versus-source and installed-runtime verification, including the probability-rounding installation drift.
last_updated: 2026-10-14
---

# Initial Jev README verification (before remediation)

Audit date: 2026-10-14 (Asia/Seoul). Source HEAD: `1564adc4`.
Scope: root README and `jev/README.md`, current source, isolated regression tests,
read-only actual installation/configuration, and loopback protocol reproduction.
No installed configuration, credentials, model, plugin registration or product code was changed.
No hosted inference request was made.

## Findings

1. **Source contracts pass targeted tests; installed code has drifted.**
   `~/.agents/jev/jev-harness.mjs` lacks the source's 0.02 probability-sum tolerance
   and renormalization (`jev/jev-harness.mjs:608-647`). A local TypeSafe-shaped
   fixture returning probabilities `{a:0.60,b:0.39}`, served model and usage
   succeeds through source `requestJev` (normalized to approximately .6061/.3939),
   but installed `requestJev` returns `answers:null` and
   `Malformed Jev response: choice probabilities must sum to 1 for pick`.
   This establishes a reproducible protocol compatibility difference, not a live
   provider outage or a claim that every production response fails.

2. **Advisory callbacks do not automatically perform all three operations.**
   `jev/jev-plugin.mjs:738-782` short-circuits OFF before stdin, otherwise calls
   only `routeSkills(prompt,{topK:3})` and returns advisory skill/model names.
   It does not invoke prune/review, install selected skills, switch host models,
   or intercept actions. `host-plan` and `model-plan` emit unexecuted plans.
   This matches the README's host-responsibility caveat; the root README's
   action-gate language requires that caveat when describing actual enforcement.

3. **Current machine configuration is not demonstrated automatic integration.**
   Legacy configuration selects `api`/`jev-latest`; status is `active:true`,
   `ready:null`, API `state:unverified`, `tier:unvalidated`, no attestation.
   All three operation chains are `[api]`, with empty explicit fallback lists.
   No saved per-agent profile files exist. Controller status for Codex reports
   `profilePresent:false`, `enabled:false`, `configured:false`, `mapping:null`.
   Codex host-plan reports `adapter-only`, `ui-only`, `verified:false`,
   `executed:false`. Shared rule/skill files exist, but presence does not prove
   a host has loaded or enforced them. These observations do not rule out every
   possible manual invocation or separately launched host session.

4. **Operation meanings and limits.**
   Routing ranks local catalog skills and emits model advice; weak matches emit
   a public-registry fallback plan without searching/installing anything.
   Pruning returns per-block keep/drop decisions, rather than editing host
   context; uncertain, failed or oversized blocks remain keep. Review returns
   a verdict and receipt; unvalidated/mock backends cannot authorize a permit.
   Review does not execute tests or builds: `validation` defaults to
   `{ok:true,errors:[]}` and the normal CLI supplies no override
   (`jev/jev-harness.mjs:1106,1396-1399`). Failed validation rejection is a
   library-call path requiring the caller to provide failure evidence.
   Validation evidence and permissions remain the host's responsibility.
   Token estimates use name+description character length divided by four
   (`jev/jev-harness.mjs:799,946,988-999`), not measured end-to-end token savings.

## Fresh verification

- `node jev/jev-harness.mjs self-test --mock`: 20/20.
- `python3 -m unittest scripts.test_jev_regressions`: 64 passed.
- `python3 -m unittest scripts.test_installer_regressions`: 48 passed.
- `JEV_LIVE_SMOKE=0 node --test jev/install.test.mjs jev/plugin.test.mjs jev/profile.test.mjs`:
  54 total, 53 passed, 1 explicit opt-in live skip, zero failures.
- Loopback source-versus-installed rounding reproduction: source accepted;
  installation rejected. Temporary HOME and fake fixture key only.
- Actual source and installed harness status: exit 0, but readiness unverified.
- Actual Codex controller status and host-plan: read-only, no activation.
- `git diff --check`: passed. Catalog/projection, frontmatter and flat-layout
  checks are not applicable: no catalog, skill metadata or skill layout changed.

Hosted authentication/inference quality, probability calibration, live host
registration/enforcement and measured token/cost reduction remain unverified.
Fixture and machine-readable result are preserved with the vault report:
`~/vaults/llm-wiki/raw/sources/audits/2026-10-14-jev-readme-audit/`.

## Subsequent remediation

The user-authorized runtime changes and real installation are recorded in
[jev-runtime-activation.md](jev-runtime-activation.md). The installed drift and
missing Codex profile described above are historical findings, not the final state.
