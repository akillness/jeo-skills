# Pre-submission report review

The submission-validation loop: review a vulnerability report against a
program's eligibility rules BEFORE submitting, fix the gaps, re-review, submit
only on SUBMIT-READY. Catches locally what the program's triage would catch
later, while fixing it is still free.

Uses the same measurement discipline as the benchmark harness: the reviewer is
an independent LLM that must pass a falsification battery before it is allowed
to grade (an obviously eligible report must pass, an obviously out-of-scope one
must fail), it refuses to review a report written by its own model, and every
verdict cites the rule it applied plus a concrete fix.

## The loop

```
finding + report
      |
      v
review.py --report report.md --rules rules/<program>.json
      |
  SUBMIT-READY? --no--> fix the cited gaps --> re-run
      |
     yes
      v
   submit
```

Exit codes: `0` submit-ready, `2` gaps found, `3` reviewer not trusted
(battery failed or configuration error).

## Checks

| Check | What it enforces |
|---|---|
| eligibility | class is in the rules' accepted list and not in the rejected list (cites both) |
| poc_remote | reproduction is a remote attacker over HTTP, not server-side access |
| reproduction | a third party can follow it; requests complete; expected vs actual stated |
| impact_measured | quantified with denominator or a demonstrated outcome, not adjectives |
| consolidation | one finding per report; same-type findings consolidated |
| version_current | component + exact version + latest-at-time stated |
| ban_risk | no untested claims presented as verified |

## Usage

```bash
REVIEW_API=https://api.example.com REVIEW_API_KEY=... REVIEW_MODEL=<reviewer> \
python3 review.py --report my-finding.md --rules rules/strict-vdp.json \
    --subject-model <model that wrote the report>
```

`--subject-model` exists so a model never reviews its own writing (pass
`--allow-self-review` to override knowingly). Verdicts land next to the report
as `<report>.review.json` with every check, the applied rule, the reason, and
the suggested fix.

## Rule files

`rules/strict-vdp.json` is the default: a strict disclosure policy's shape
(accepted classes with chaining conditions, rejected classes, format
requirements, risk notes). Copy it per program and paste the program's exact
published criteria — the reviewer judges only against what the file says, so
fidelity to the real policy is the file's job, not the reviewer's.

## Limits

The reviewer is an LLM and can misjudge; every verdict carries its reason and
the rule text, so audit before trusting a pass. A single pass is one opinion:
for high-stakes submissions, re-run after every edit (the loop is cheap; a
rejection is not).
