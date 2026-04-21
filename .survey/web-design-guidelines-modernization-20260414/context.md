# Context: web-design-guidelines modernization

## Workflow Context
`web-design-guidelines` sits in the remaining weak spot of the frontend review lane. The repo already sharpened neighboring skills for accessibility remediation, responsive layout adaptation, reusable component APIs, and system-level design governance, but `web-design-guidelines` still presents itself as a thin Vercel-rules fetcher.

The broad opportunity scan across the required domains showed several under-supported skills, but `web-design-guidelines` was the strongest bounded candidate because it is both high-visibility and structurally under-specified:
- repo scan: `web-design-guidelines` is still missing `references/`, `evals/`, and `scripts/`, while most neighboring frontend anchors already have support bundles.
- wiki boundary note: `web-accessibility` owns accessibility remediation, while `web-design-guidelines` should stay the broader UI-review lane.
- current skill copy still tells agents to fetch one external command file on every run instead of first framing scope, categories, or route-outs.

Primary sources:
- Repo baseline: [`/.agent-skills/web-design-guidelines/SKILL.md`](../../.agent-skills/web-design-guidelines/SKILL.md)
- Frontend boundary note: [`/.agent-skills-wiki/concepts/frontend-skill-canonicalization.md`](../../.agent-skills-wiki/concepts/frontend-skill-canonicalization.md)
- Broad support-gap scan from this run: `loop-charter.md` + repo support analysis
- Vercel command source: <https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md>
- Vercel repo landing page: <https://github.com/vercel-labs/web-interface-guidelines>
- NN/G heuristics: <https://www.nngroup.com/articles/ten-usability-heuristics/>
- W3C tool inventory: <https://www.w3.org/WAI/test-evaluate/tools/list/>
- UI audit checklist article: <https://www.roastmyweb.com/blog/ui-audit-checklist>

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Frontend engineer | Audit UI code before merge or release | Intermediate–advanced |
| Fullstack engineer | Review page-level UI quality without confusing it with backend or pure accessibility work | Intermediate |
| Design-minded product engineer | Convert vague “review this UI” requests into a structured audit packet | Intermediate |
| Agent/skill maintainer | Keep trigger boundaries clean across frontend review skills | Advanced |
| PM/UX collaborator | Request a broad interface review that covers clarity, states, consistency, and handoffs | Beginner–intermediate |

## Current Workarounds
1. **Use a single external rule list as the whole review method**  
   Limitation: good for spot checks, weak for triage, scope control, and boundary routing.
2. **Fallback to accessibility-only audits**  
   Limitation: misses hierarchy, copy clarity, CTA placement, visual consistency, and interaction-state review.
3. **Fallback to generic design-system guidance**  
   Limitation: useful for system architecture, but too broad when the user wants a page or flow audit.
4. **Mix automated tools and ad-hoc human review without a packet**  
   Limitation: findings become noisy, duplicate, and hard to hand off.
5. **Use neighboring skills opportunistically** (`web-accessibility`, `responsive-design`, `ui-component-patterns`)  
   Limitation: helps narrow issues, but leaves no canonical broad UI review workflow.

## Adjacent Problems
- Trigger confusion between broad UI review and accessibility remediation
- Overlap with responsive-layout, component-API, and system-governance skills
- Discovery docs still advertise the skill as generic “guidelines compliance review” instead of a structured audit lane
- No evals means trigger quality and boundary behavior are untested
- No references bundle means the best reusable checklists live outside the repo

## User Voices
> "A UI audit checks visual consistency, clarity, and interaction quality." — Roast My Web, *UI Audit Checklist: Template + Report Outline* (<https://www.roastmyweb.com/blog/ui-audit-checklist>)

> "A strong UI audit covers: visual design and layout, navigation clarity, content clarity and CTAs, interaction states and feedback, mobile responsiveness, performance and speed, accessibility basics, behavior data." — Roast My Web, *UI Audit Checklist* (<https://www.roastmyweb.com/blog/ui-audit-checklist>)

> "Jakob Nielsen's 10 general principles for interaction design... are broad rules of thumb and not specific usability guidelines." — NN/G, *10 Usability Heuristics for User Interface Design* (<https://www.nngroup.com/articles/ten-usability-heuristics/>)

> "Web accessibility evaluation tools are software programs or online services that help you determine if web content meets accessibility guidelines." — W3C WAI, *Web Accessibility Evaluation Tools List* (<https://www.w3.org/WAI/test-evaluate/tools/list/>)

> The current Vercel command source is already broader than pure accessibility; it mixes accessibility, focus states, forms, motion, performance, and responsive behavior into one review surface. That suggests the repo skill should classify and route review areas explicitly instead of pretending the job is only one rules fetch. Source: Vercel command.md direct retrieval (<https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md>) and repo page (<https://github.com/vercel-labs/web-interface-guidelines>).
