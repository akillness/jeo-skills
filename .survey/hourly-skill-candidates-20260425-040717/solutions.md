## Solution List
1. Ratchet survey relevance gate with a freshness floor: exclude candidates with `pushed_at` older than 24 months unless exception rationale is explicit.
2. Keep unknown/missing license exclusion as default and require concrete exception notes.
3. Preserve lane coverage evidence while separating discovery evidence from recommendation-grade keep list.

## Categories
- Process guardrail hardening (survey SKILL.md/SKILL.toon/evals)
- Evidence quality control (metadata-floor + exception rationale)
- Documentation clarity for hourly operators (reference update)

## What People Actually Use
- agentic-ai-skill: kept=6; top examples: [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills), [Orchestra-Research/AI-Research-SKILLs](https://github.com/Orchestra-Research/AI-Research-SKILLs), [pinchbench/skill](https://github.com/pinchbench/skill)
- web-frontend-skill: kept=3; top examples: [zarazhangrui/frontend-slides](https://github.com/zarazhangrui/frontend-slides), [liyupi/yupi-hot-monitor](https://github.com/liyupi/yupi-hot-monitor), [liyupi/github-global](https://github.com/liyupi/github-global)
- web-backend-skill: kept=5; top examples: [andreasbm/web-skills](https://github.com/andreasbm/web-skills), [skill6/skill6-website-backend](https://github.com/skill6/skill6-website-backend), [liyupi/yupi-hot-monitor](https://github.com/liyupi/yupi-hot-monitor)
- cli-open-source-skill: kept=4; top examples: [jeremylongshore/claude-code-plugins-plus-skills](https://github.com/jeremylongshore/claude-code-plugins-plus-skills), [dp-archive/archive](https://github.com/dp-archive/archive), [skrun-dev/skrun](https://github.com/skrun-dev/skrun)
- game-development-skill: kept=2; top examples: [AlloVince/physics_mathematics_skills_for_game_development](https://github.com/AlloVince/physics_mathematics_skills_for_game_development), [alinebastos/dev-practice](https://github.com/alinebastos/dev-practice)

## Frequency Ranking
1. agentic-ai-skill (high-signal, active)
2. cli-open-source-skill (moderate signal with some platform noise)
3. web-frontend/web-backend lanes (higher noise ratio)
4. game-development lane (mixed relevance; needs stronger fit checks)

## Key Gaps
- Freshness rule is implied but not explicit enough for unattended hourly gating.
- Recommendation list can still include stale repos when keyword matches are broad.

## Contradictions
- Broad keyword coverage increases recall but can conflict with recommendation precision without stricter keep thresholds.

## Key Insight
- The safest incremental improvement is a non-destructive policy ratchet: make freshness/license floor explicit across survey skill docs and evals.

Provenance: browser-rendered retrieval; direct page retrieval.