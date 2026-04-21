# Solution Landscape: web-accessibility modernization

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| axe DevTools | Automated accessibility testing toolkit | Strong automation story, integrates into existing test processes, widely recognized | Does not replace manual/AT checks | Source: https://www.deque.com/axe/devtools/ |
| Lighthouse | Browser-based automated audit | Easy first pass, familiar to web teams, broad web-audit adoption | Only part of accessibility workflow | Source: https://developer.chrome.com/docs/lighthouse/overview |
| Pa11y | Automated accessibility testing tool | Lightweight automation option | Same automated-only limitation | Source: https://pa11y.org/ |
| Accessibility Insights | Guided accessibility testing and issue discovery | Good for finding issues before release | Still part of a broader workflow | Source: https://accessibilityinsights.io/docs/en/web/overview/ |
| W3C / A11Y Project checklists | Standards and checklist guidance | Strong baseline vocabulary and coverage | Checklist alone does not decide component-level implementation boundaries | Sources: https://www.w3.org/WAI/test-evaluate/ , https://www.a11yproject.com/checklist/ |
| Repo skill: `web-design-guidelines` | Review-oriented UI guideline audit | Good fit for file review and design/polish checks | Overlaps with `web-accessibility` trigger language around "check accessibility" | Repo source: `.agent-skills/web-design-guidelines/SKILL.md` |
| Repo skill: `ui-component-patterns` | Reusable component API / composition patterns | Good fit for primitive and component-library design | Not a dedicated WCAG remediation skill | Repo source: `.agent-skills/ui-component-patterns/SKILL.md` |
| Repo skill: `responsive-design` | Breakpoint and viewport adaptation | Good fit for layout adaptation | Not a dedicated accessibility audit/remediation skill | Repo source: `.agent-skills/responsive-design/SKILL.md` |

## Categories
- **Automated scanners:** axe DevTools, Lighthouse, Pa11y, Accessibility Insights
- **Standards/checklists:** WCAG/W3C guidance, A11Y Project checklist
- **Repo-adjacent implementation/review skills:** `web-design-guidelines`, `ui-component-patterns`, `responsive-design`

## What People Actually Use
The practical workflow is layered, not single-tool:
1. Run an automated scanner for fast issue discovery.
2. Manually test keyboard, focus, contrast, labels, and content behavior because automation misses part of WCAG.
3. Use a checklist or standard to verify coverage and language.
4. Fix the underlying component or flow in product code.

## Frequency Ranking
1. **Automated-first but not automated-only** is the dominant pattern across W3C, web.dev, and vendor tooling.
2. **Keyboard/focus/manual verification** shows up as a repeated must-have workflow, not a nice-to-have.
3. **Checklist-backed remediation** remains common because teams need WCAG mapping and issue phrasing.
4. **Repo boundary routing** matters because audit/review work and implementation work are adjacent but not identical.

## Key Gaps
- The current `web-accessibility` skill lacks a decision-first boundary between **audit**, **manual verification**, and **code remediation**.
- It lacks support files that make reusable checks and route-outs durable.
- It is example-heavy but does not clearly say when to hand off to `web-design-guidelines`, `ui-component-patterns`, or `responsive-design`.
- Discovery surfaces still describe it too broadly for a frontend cluster that now has more specialized neighbors.

## Contradictions
- Tool vendors sell automation, but W3C and web.dev both reinforce that automation alone is insufficient.
- Repo wording currently implies `web-accessibility` and `web-design-guidelines` can both own an accessibility audit unless the skill boundary is tightened.

## Key Insight
The highest-value improvement is not adding another accessibility skill. It is modernizing `web-accessibility` into a decision-first accessibility remediation and verification anchor: automated + manual + AT-aware workflow guidance, explicit route-outs to adjacent frontend skills, and support files/evals that keep the boundary stable.
