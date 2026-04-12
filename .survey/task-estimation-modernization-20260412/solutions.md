# Solution Landscape: task-estimation modernization

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Story points | Relative sizing | Familiar, fast, works well for sprint-candidate comparison | Commonly drift into disguised hours; weak direct date signal | Still the dominant default in agile tooling and team rituals |
| Planning Poker | Consensus estimation | Surfaces hidden assumptions and creates team alignment | Slow for large backlogs; can still anchor on early opinions | Best when a small set of near-term items needs discussion |
| T-shirt sizing / coarse buckets | Coarse relative sizing | Good for roadmap and intake triage | Too coarse for delivery forecasting | Useful when detail is premature |
| Velocity-based forecasting | Historical points heuristic | Easy to explain to teams already using points | Weak under team/work changes; invites velocity gaming | Common but often over-trusted |
| Throughput / cycle-time forecasting | Flow-based empirical forecasting | Better date/scope signal from actual delivery history | Requires stable item definitions and decent history | Stronger modern forecasting layer than raw point totals |
| Monte Carlo forecasting | Probabilistic forecast | Gives confidence ranges instead of fake certainty | Needs trustworthy historical inputs | Best for forecast-support, not first-pass backlog sizing |
| Reference class / anchor comparison | Outside-view heuristic | Grounds estimates in past work and combats optimism | Harder when work is novel | Highly transferable inside a skill workflow |
| NoEstimates / slice-small-first | Estimation-minimizing practice | Reduces ceremony and pushes better slicing | Still needs forecasting and stakeholder expectation management | Good corrective pressure, not a universal replacement |
| Evidence-based scheduling / confidence ranges | Historical + probabilistic schedule support | Makes uncertainty explicit | Can feel heavier than lightweight agile rituals | Useful when stakeholders ask for dates anyway |
| Formal models (Function Points / COCOMO / COSMIC) | Standardized size/cost models | Auditable and structured | Heavyweight for most repo-level skill use | Niche for this repository |

## Categories
- **Relative sizing** — story points, T-shirt sizes, affinity/buckets
- **Consensus rituals** — planning poker and team estimate calibration
- **Historical forecasting** — velocity, throughput, cycle time
- **Probabilistic forecasting** — Monte Carlo, confidence ranges
- **Outside-view estimation** — reference class / evidence-based scheduling
- **Estimation-minimizing alternatives** — NoEstimates and slice-small-first practices
- **Formal enterprise models** — Function Points, COSMIC, COCOMO

## What People Actually Use
In practice, teams mix layers instead of following one pure method. Common behavior:
- relative sizing for backlog comparison
- rough anchors/reference stories for calibration
- coarse buckets for fuzzy roadmap items
- explicit or implicit translation into time/risk language when stakeholders demand dates
- spreadsheets or ad-hoc rollups for what-if analysis that issue trackers do poorly

## Frequency Ranking
1. Story points
2. Planning Poker
3. T-shirt sizing / coarse buckets
4. Velocity-based forecasting
5. Throughput / cycle-time forecasting
6. Reference-story calibration
7. Monte Carlo / confidence-range forecasting
8. NoEstimates / slice-small-first
9. Formal size/cost models

## Key Gaps
- Many mainstream estimation guides stop at point scales and planning poker instead of teaching **estimate-vs-commitment boundaries**.
- Tools and guides often underplay **discovery spikes**, even though uncertainty-heavy work is common in product and game settings.
- Cross-functional burden is frequently flattened into engineering-only numbers.
- Forecast-safe language and confidence notes are often missing from otherwise decent estimation rituals.

## Contradictions
- Marketed claim: a number can cleanly drive planning and forecasting.
  Reality: teams usually need a second layer of assumptions, ranges, and historical context.
- Marketed claim: points protect teams from false precision.
  Reality: many orgs still convert points back into hours or commitments behind the scenes.
- Marketed claim: one estimation method should be used everywhere.
  Reality: teams change methods by horizon — coarse triage, sprint-candidate sizing, and forecast support are not the same job.

## Key Insight
The highest-value upgrade for `task-estimation` is not inventing another estimation framework. It is turning the skill into a **mode-selecting estimation workflow** that chooses the right unit for the planning horizon, uses anchors instead of raw guesswork, preserves estimate-vs-commitment boundaries, and handles discovery-heavy or cross-functional work explicitly. That gives the PM cluster a clearer sizing lane without overlapping `task-planning`, `standup-meeting`, or `sprint-retrospective`.
