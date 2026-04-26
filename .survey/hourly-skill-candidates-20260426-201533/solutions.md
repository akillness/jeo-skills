# Solutions
## Solution List
1. Ratchet raw-quality collapse trigger in keyword sweep reference (selected).
2. Keep current gates unchanged and rely on manual reviewer judgment.
3. Increase minimum star threshold globally (higher risk of false negatives).

## Categories
- selected: low-risk documentation/process ratchet
- fallback: no-change/manual-only
- high-risk: stricter threshold policy

## What People Actually Use
- In practice, maintainer loops keep deterministic guardrails in survey reference docs and avoid code-path churn.
- GitHub search + gh api metadata fallback is the stable data path in unattended cron runs.

## Frequency Ranking
1) deterministic guardrails in reference docs
2) degraded-cause reporting refinements
3) threshold policy overhauls

## Key Gaps
- Existing gates can still pass noisy raw discovery if counts look healthy but quality is low.

## Contradictions
- Higher strictness improves precision but may reduce discovery breadth; keep ratchet narrow and reversible.

## Key Insight
- Aggregate zero-star ratio was 0.57; add an explicit collapse trigger to prevent count-only false confidence.

## Curated Sources
- agentic ai skill | AbdelhakRazi/flutter-bloc-clean-architecture-skill | https://github.com/AbdelhakRazi/flutter-bloc-clean-architecture-skill | provenance: indexed snippet
- agentic ai skill | iwe-org/skills | https://github.com/iwe-org/skills | provenance: indexed snippet
- game development skill | tjboudreaux/cc-plugin-unity-gamedev | https://github.com/tjboudreaux/cc-plugin-unity-gamedev | provenance: indexed snippet
