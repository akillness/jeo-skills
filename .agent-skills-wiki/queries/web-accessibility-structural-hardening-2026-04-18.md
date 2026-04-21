---
title: Web Accessibility Structural Hardening
created: 2026-04-18
updated: 2026-04-18
type: query
tags: [skills, survey, trigger-design, skill-quality, graphify, docs]
sources: [.survey/web-accessibility-structural-hardening-20260418/triage.md, .survey/web-accessibility-structural-hardening-20260418/context.md, .survey/web-accessibility-structural-hardening-20260418/solutions.md, .survey/web-accessibility-structural-hardening-20260418/loop-charter.md, .agent-skills/web-accessibility/SKILL.md, .agent-skills/web-accessibility/references/intake-packets-and-route-outs.md, graphify-out/GRAPH_REPORT.md]
---

# Web Accessibility Structural Hardening

## Question
What is the best bounded next improvement for the existing `web-accessibility` skill now that support coverage is already complete: add another accessibility helper, or tighten `web-accessibility` into a smaller routing-first remediation front door?

## Answer
Tighten `web-accessibility` in place.

The survey evidence still points to one coherent accessibility-remediation router: semantics/structure, keyboard/focus, labels/announcements, visual perception/reflow, media alternatives, and routed-app navigation feedback. The stronger move is not another WCAG helper or scanner wrapper. It is a smaller front door that quickly chooses one failing accessibility surface, recommends one bounded remediation packet, names the manual verification still required, and routes broader critique, layout strategy, component API work, and design-system governance outward.

## Why this won
1. Primary sources consistently say automated tools are helpful but incomplete, so the highest-value improvement is better remediation + verification routing, not another tool-shaped wrapper.
2. Real practice still mixes scanner output, keyboard walkthroughs, selective screen-reader checks, and external tracking docs, which makes packet selection and handoff clarity more valuable than a generic accessibility encyclopedia.
3. The graph refresh showed support coverage is already complete repo-wide, so dense-anchor cleanup and discovery-sync remain more valuable than adding a neighboring skill.
4. `web-accessibility` was still large enough to benefit from the same packet-first structural hardening pattern already applied across adjacent frontend anchors.

## Accepted changes
- Shrink `web-accessibility/SKILL.md` from 290 to 231 lines
- Reframe the front door around six remediation packets with one primary packet chosen per run
- Add `references/intake-packets-and-route-outs.md`
- Expand `evals/evals.json` with routed-app navigation-feedback and responsive-boundary cases
- Refresh `SKILL.toon`, `skills.json`, `skills.toon`, README.md, README.ko.md, and `setup-all-skills-prompt.md`
- Refresh graph artifacts so the structural layer records the smaller frontend accessibility anchor

## Rejected changes
- Adding another generic WCAG/accessibility-audit wrapper
- Letting `web-accessibility` absorb broad UI critique, viewport/layout strategy, or reusable component API design
- Treating axe/Lighthouse scores as proof of completion without manual verification and AT follow-up

## Durable findings
- Accessibility remediation remains strongest as a **routing** skill, not a scanner transcript or standards dump.
- The most useful split is between **semantics**, **keyboard/focus**, **labels/announcements**, **visual perception/reflow**, **media alternatives**, and **routed navigation feedback**.
- Routed-app focus/announcement behavior is a durable accessibility sub-lane worth keeping explicit inside the skill rather than leaving implicit in generic scanner language.

## Related pages
- [[frontend-skill-canonicalization]]
- [[skill-support-coverage]]
- [[web-accessibility-modernization-2026-04-13]]
- [[responsive-design-modernization-2026-04-13]]
- [[ui-component-patterns-modernization-2026-04-13]]
