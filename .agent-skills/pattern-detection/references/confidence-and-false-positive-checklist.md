# Confidence and False-Positive Checklist

Use this checklist before presenting a finding as meaningful.

## Confidence questions
- Is the signal repeated or just a one-off?
- Is the coverage window large enough to compare?
- Is the grouping key stable (event name, browser, build, cohort, function shape)?
- Does the pattern persist across more than one segment or example?
- Would a human reviewer likely agree the matches belong to the same family?

## Common false-positive sources
- broad regex or string matching
- parser/grok failures
- instrumentation drift after a release
- one noisy cohort dominating the counts
- duplicated rows / repeated retries / replayed events
- seasonality or launch timing misread as abnormal behavior
- code matches that share text but not structure

## Default labels
### High confidence
- strong structure or grouping
- multiple supporting examples
- low ambiguity

### Medium confidence
- signal is plausible, but one major caveat remains

### Low confidence
- thin data, weak baseline, broad matching, or likely data/parser issues

## Minimum follow-up per finding
Every finding should include:
1. one sentence on why it matters
2. one sentence on what could make it misleading
3. one fast validation step

## Example phrasing
- **Confidence:** medium — repeated across three mobile Safari cohorts, but the post-release window is only 24 hours.
- **False-positive risk:** event instrumentation changed in the same deployment.
- **Next check:** compare with server-side purchase success and browser/version split.
