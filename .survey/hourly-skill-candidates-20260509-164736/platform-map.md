# Platform Map: oh-my-skills hourly survey hourly-skill-candidates-20260509-164736

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Survey lanes | required | required | required | five fixed lane families |
| Provenance labels | required | required | required | validator contract labels |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Open-PR hard gate | triage existing PR first | triage existing PR first | triage existing PR first | no duplicate PR when open count >=1 |
| Merge policy | checks must be green | checks must be green | checks must be green | no checks reported => blocker comment |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Discovery | search lanes | search lanes | search lanes | evidence.json with lane metrics |
| Validation | validator scripts | validator scripts | validator scripts | diff and artifact contracts |

## What People Actually Use
- Evidence-first lane promotion with guardrails for fit/signal/freshness. (provenance: indexed snippet)

## Frequency Ranking
1. agentic-ai-skill
2. game-development-skill
3. cli-open-source-skill
4. web-frontend-skill
5. web-backend-skill

## Key Gaps
- recommended_lane_count=3, single_lane_concentration=false

## Contradictions
- Coverage breadth and recommendation quality can diverge across lanes in the same run.

## Key Insight
- Keep degraded lane causes explicit to support deterministic reviewer triage.

## Platform Gaps
1. agentic-ai-skill: status=pass, causes=-, median_stars_raw=0
1. web-frontend-skill: status=degraded, causes=license, low-signal, stale, median_stars_raw=0
1. web-backend-skill: status=degraded, causes=low-fit, median_stars_raw=7532
1. cli-open-source-skill: status=pass, causes=-, median_stars_raw=34473
1. game-development-skill: status=pass, causes=-, median_stars_raw=0
