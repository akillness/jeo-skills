# Public evidence

This directory holds sanitized observations and decisions that make dataset changes reviewable. It is part of the source repository and must be excluded from installable skill/plugin packages. It does not contain private reasoning traces or raw user sessions.

## Layout

```text
evidence/
  feedback/           # sanitized observations; separate authored inferences
  dataset-changes/
    <change-id>/
      events.jsonl
      artifacts/       # optional, redistributable supporting material
      snapshots/<collection>/<record-id>/<revision>/<hash>.json   # one snapshot per revision
  kits/
    <blueprint-record-id>/   # proof captures for one blueprint, written by scripts/kit-proof.py
      far.png mid.png close.png detail.png
      close-motion.png       # only for a blueprint with animate(), from --motion-check MS
      proof-log.json         # SHA-256 of each capture, plus renderer, versions and distances
.local/
  evidence/
    <run-id>/          # ignored private working files
```

A blueprint record names its own captures and its proof log under `evidence/kits/<record-id>/`.
`python3 scripts/validate.py` refuses the record unless every declared capture exists and its
SHA-256 matches the digest the log states, and the runtime pass on the `record-curated` event
must cite the same artifact path as the passing `check-run`. The captures are observations of
what one headless browser drew; they do not certify that the blueprint looks good.

Use one change directory per contribution rather than a shared global log. Use kebab-case paths and globally unique event IDs. Keep raw notes, captures, and tool output in ignored local storage; verify they remain untracked before committing.

## What to record

Use the actual JSONL event schema provided with the implementation: one UTF-8 JSON object per line. Each event identifies the change, actor, time, affected collection/record/revision, concise summary, and event-specific payload. Validate the event contract instead of using free-form executable instructions.

- **Change:** record identity/revision, relevant before/after hashes, and why the content changed.
- **Source read:** source identity, precise locator, version or access date, and supported claims.
- **Claim check:** verification scope, assumptions, source references, and uncertainty.
- **Check run:** method, input/artifact revision, observer, actual outcome, and output reference; numerical tolerance when relevant.
- **Status change or correction:** evidence supporting the transition and the prior event/record being corrected.

A spelling correction needs only proportionate change evidence. Creative choices need rationale. Do not fabricate source reads for creative work or test passes for planned checks. Failed, skipped, unavailable, and unrun checks must remain distinguishable.

## What to keep out

Never commit credentials, personal conversations, identifying private data, machine-specific paths, private reasoning traces, or full copyrighted sources. Confirm redistribution rights for supporting assets. Link large evidence through stable versioned artifact references with a digest when available instead of bloating the skill package.

Source and artifact hashes identify content; they do not certify truth, trusted authorship, or tamper-proof history. Record meaningful observations rather than implying certification from a digest.

## Corrections

Before merge, a contributor may clean up their own draft log. After merge, append a correction or supersession event rather than silently rewriting an observation. A `correction` event that targets a `check-run` also marks that observation retired: its artifact and output paths are no longer required to exist, and the retired check-run no longer supports a runtime curation pass. Only check-runs can be retired this way. Old record revisions may be located through a real Git commit or a portable content-addressed snapshot when they are no longer active in the catalog.

Sensitive information is an exception: remove it through the [security process](../SECURITY.md), including history or published artifacts when necessary. Append-only policy is never a reason to preserve secrets.

See [contributing data](../docs/contributing-data.md) for the end-to-end contribution workflow. Passing log validation proves structure and linkage, not the correctness of a scientific claim or a rendered scene.


## Portable historical revisions

Store each preserved record as a single JSON object at `dataset-changes/<change-id>/snapshots/<collection>/<record-id>/<revision>/<sha256>.json` inside this evidence directory. The filename digest is SHA-256 of canonical record JSON (sorted keys, compact separators, UTF-8, `ensure_ascii=false`), independent of pretty-printing. Identity, revision, collection prefix, path and digest are checked together.

A new historical reference can use `snapshot:sha256:<digest>:evidence/dataset-changes/.../<digest>.json`; the `before_ref` of a revision proposal should identify its prior content explicitly. Git provenance retains `git:<40-character commit>:<JSON path>` and requires that actual history. Old event references lacking provenance are resolved against a unique matching snapshot under the constrained layout, so promotion does not require rewriting their event lines. Missing, ambiguous, tampered or repository-escaping snapshots fail validation.

Publish snapshots alongside the repository evidence, preserve each revision before replacement, and reuse an existing snapshot rather than duplicating its location. The [water-surface revision](dataset-changes/water-surface-coverage/proposal.json) demonstrates three revision-1 snapshots and revision-2 proposal/curation events without Git history. This is portable content linkage, not a signature, trusted timestamp or tamper-proof audit store.
