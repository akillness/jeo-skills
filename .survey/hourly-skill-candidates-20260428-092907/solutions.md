# Solution Landscape: hourly-skill-candidates

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Survey lane gate hardening | Keep strict license/freshness/signal/fit filters with lane metrics | Deterministic quality floor for cron | Can reduce keeps in sparse lanes | indexed snippet |
| License-shape normalization | Normalize gh search `license.key/name` before unknown-license fallback | Prevents false degraded status from schema mismatch | Needs explicit guidance in survey skill docs | direct page retrieval |
| Lane recovery escalation | Stage-2 query only when sparse/noisy triggers fire | Preserves coverage expectations | Higher runtime and result noise | feed recovery |

## What People Actually Use
Top recommendation-grade repositories from this run after gates:

| Lane | Name | Approach | Strengths | Weaknesses | Notes |
|------|------|----------|-----------|------------|-------|
| cli-open-source | nxtrace/NTrace-core | https://github.com/nxtrace/NTrace-core | 7762 | gpl-3.0 | intent overlap=cli,tool; freshness_days=5; stars=7762 |
| cli-open-source | modelscope/FunClip | https://github.com/modelscope/FunClip | 5561 | mit | intent overlap=cli,tool; freshness_days=290; stars=5561 |
| cli-open-source | alexellis/arkade | https://github.com/alexellis/arkade | 4575 | mit | intent overlap=tool; freshness_days=14; stars=4575 |
| agentic-ai | AbdelhakRazi/flutter-bloc-clean-architecture-skill | https://github.com/AbdelhakRazi/flutter-bloc-clean-architecture-skill | 14 | apache-2.0 | intent overlap=agent,ai; freshness_days=88; stars=14 |
| agentic-ai | VoDaiLocz/Enhance-Prompt | https://github.com/VoDaiLocz/Enhance-Prompt | 10 | mit | intent overlap=agent,ai; freshness_days=53; stars=10 |
| agentic-ai | iwe-org/skills | https://github.com/iwe-org/skills | 7 | mit | intent overlap=agent,ai; freshness_days=21; stars=7 |
| game-development | tjboudreaux/cc-plugin-unity-gamedev | https://github.com/tjboudreaux/cc-plugin-unity-gamedev | 3 | mit | intent overlap=game,unity,gamedev; freshness_days=80; stars=3 |

## Frequency Ranking
1. CLI/open-source tooling repos dominate recommendation-grade keeps in this run.
2. Agentic AI lane has a few keepers after gating.
3. Web frontend/backend lanes remain degraded and need better recovery quality.

## Key Gaps
- web-frontend/web-backend lanes ended with kept_count=0 in this run.
- License field-shape handling is not explicit enough in survey contract text.
- Recommendation concentration risk remains when only a subset of lanes pass.

## Contradictions
- Broad discovery returns many candidates, but strict recommendation gates eliminate most of them in sparse lanes.
- High-star repositories may still be filtered out if lane-intent overlap is weak.

## Key Insight
A low-risk, high-value ratchet is to codify license-field normalization (`license.spdx_id|spdxId|key|name`) before classifying unknown-license; this protects lane status fidelity without weakening quality gates.

## Categories
- Metadata reliability
- Lane recovery quality
- Recommendation-grade gating
