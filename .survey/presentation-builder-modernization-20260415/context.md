# Context: presentation-builder modernization

## Workflow Context
- Presentation-building pain consistently appears at the conversion boundary between living work artifacts and stakeholder-ready narrative decks.
- In developer workflows, teams need to turn code, terminals, architecture diagrams, product demos, and benchmark evidence into a shareable deck; code-first slide systems such as Slidev and Marp exist because ordinary slide tools fit poorly when the source material already lives in Markdown, Git, browsers, and code ([Slidev](https://sli.dev/), [Marp](https://marp.app/)).
- In web/fullstack product work, the recurring job is packaging screenshots, roadmap material, traction, UX evidence, and product narrative into customer, investor, or internal strategy decks ([Y Combinator pitch deck guide](https://www.ycombinator.com/library/2u-how-to-build-your-seed-round-pitch-deck)).
- In PM / ops practice, roadmap, QBR, status, and planning communication still need deck-shaped outputs even though the source data usually lives in project or spreadsheet systems ([Atlassian roadmap guide](https://www.atlassian.com/work-management/project-management/roadmap)).
- In GTM and launch work, teams repeatedly compress messaging, launch plans, personas, channels, and approvals into presentation artifacts for internal briefings and sales/customer handoff ([Product Marketing Alliance GTM guide](https://www.productmarketingalliance.com/ultimate-guide-to-go-to-market-strategy/)).
- In game-development business workflows, pitch/update decks package gameplay vision, milestones, audience, budget, and production risk for publishers, investors, or platform partners ([Xsolla game pitch deck guide](https://xsolla.com/blog/how-to-build-a-pitch-deck-for-your-video-game)).

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Engineers / DevRel / solution architects | Turn code, terminals, demos, and architecture into editable decks | Mixed; usually technical |
| Product managers / founders / designers | Build roadmap, investor, product-review, and strategy decks | Mixed |
| PM / ops leads / chiefs of staff | Build recurring review, planning, and status decks from project/ops artifacts | Mixed |
| Product marketers / launch managers / sales enablement | Package messaging, GTM plans, launch briefs, and customer-facing collateral into slides | Mixed |
| Game producers / studio founders / biz-dev leads | Create pitch decks and milestone-update decks with creative assets + production plans | Mixed |

## Current Workarounds
1. Use PowerPoint / Google Slides / Keynote / Canva directly and paste screenshots, charts, copied text, and exported assets from the real source systems.
2. Use code-first tools like Slidev or Marp for technical decks, then still hand off PDF/PPTX or screenshots for broader review.
3. Duplicate an older deck and manually refresh screenshots, metrics, dates, and milestones rather than regenerate from structured source material.
4. Keep the outline, narrative, and source-of-truth in docs/Notion/Figma/Jira, then build slides only when an external audience explicitly needs them.
5. Record demos as GIF/video/screen capture instead of relying on a live app during presentation, then embed those artifacts into slides.
6. Design visually complex slides in Figma/Canva and keep simpler text/status slides in Google Slides or PowerPoint.

## Adjacent Problems
- Source-of-truth drift: decks are snapshots, while the underlying truth lives elsewhere.
- Narrative assembly across tools: screenshots, metrics, design assets, roadmap data, and messaging are pulled from different systems.
- Review/approval churn: comments and approvals often converge only at the slide artifact layer.
- Export fidelity problems: PPTX/PDF conversion, fonts, embeds, and layouts drift across tools.
- Audience-specific repackaging: one source deck often turns into leadership, customer, investor, sales, or publisher variants.

## User Voices
- Slidev positions itself as “Presentation Slides for Developers,” which is direct evidence that technical users want deck workflows to behave more like code/docs authoring than desktop slide design ([Slidev](https://sli.dev/)).
- Marp likewise centers plain-Markdown presentation authoring, reinforcing the same demand for text-first slide workflows ([Marp](https://marp.app/)).
- Atlassian’s roadmap guidance frames roadmap artifacts as communication tools for stakeholders, which matches the recurring PM/ops reality that the presentation is an alignment layer built from constantly changing project data ([Atlassian roadmap guide](https://www.atlassian.com/work-management/project-management/roadmap)).
- PMA’s GTM guidance and common startup/game pitch guidance show that teams need decks because external or cross-functional audiences expect them, even when the “real” work lives in docs, builds, research, or production trackers ([Product Marketing Alliance GTM guide](https://www.productmarketingalliance.com/ultimate-guide-to-go-to-market-strategy/), [Y Combinator pitch deck guide](https://www.ycombinator.com/library/2u-how-to-build-your-seed-round-pitch-deck), [Xsolla game pitch deck guide](https://xsolla.com/blog/how-to-build-a-pitch-deck-for-your-video-game)).
