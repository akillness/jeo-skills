# License Enrichment Fallback (Hourly Survey)

Purpose: reduce false `license` degraded causes caused by sparse/shape-shifted GitHub search payloads.

## Workflow
1. Read raw lane candidate repos from `gh search repos` output.
2. Normalize license from payload keys in order: `spdx_id`, `spdxId`, `key`, `name`.
3. If still missing, call:
   - `gh repo view <owner/repo> --json licenseInfo`
4. If still missing, call one REST fallback:
   - `gh api repos/<owner>/<repo> --jq .license.spdx_id`
5. Persist `license_enriched` and `license_enrichment_source` in intermediate JSON before lane-quality scoring.

## Reusable script
- `.agent-skills/survey/scripts/enrich_license_metadata.py`

## Example
```bash
python3 .agent-skills/survey/scripts/enrich_license_metadata.py \
  --input .survey/<slug>/lane-stage-results.json \
  --output .survey/<slug>/lane-stage-results.enriched.json
```

## Provenance labels
- search payload: `indexed snippet`
- repo/API fallback fetches: `direct page retrieval`
