# Solution Landscape: user-guide-writing structural hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Diátaxis / Divio documentation system | Split docs by user intent (`tutorial`, `how-to`, `reference`, `explanation`) | Strongest structure for separating jobs and preventing mixed-purpose pages | Needs local adaptation for help-center / FAQ / release-update work | Best external support for hardening the existing skill in place |
| GitLab CTRT topic taxonomy | Topic types: concept, task, reference, troubleshooting | Good editorial discipline for page type, maintenance, and review workflow | Less explicit about launch/update packet design | Supports stronger route-outs and page-type decisions |
| Google / Microsoft procedural guidance | Audience-aware, task-first procedures | Strong on prerequisites, scannability, and observable actions | Not a full docs-program taxonomy | Supports concise page skeletons and maintenance checks |
| Docs-as-code workflows (Write the Docs, GitLab, repo-native docs) | Keep docs in PR/review/release flow | Strong for change control and source-of-truth discipline | Still leaves page classification and cross-doc sync manual | Reinforces packaging + maintenance guidance rather than a new wrapper skill |
| Hosted docs CMS with Git sync (GitBook, Mintlify) | Git-backed hosted docs, analytics, change requests, changelog surfaces | Useful evidence that teams maintain multiple adjacent surfaces, not one page | Publishing tools do not solve classification or boundary drift | Supports a stronger maintenance/output-packet layer inside the skill |

## Categories
- Documentation frameworks and taxonomies
- Procedure-first style systems
- Docs-as-code packaging and review workflows
- Hosted docs CMS with analytics, changelogs, and Git sync
- Repo-local support and help-center maintenance patterns

## What People Actually Use
Teams usually combine a documentation framework or internal taxonomy with repo-native Markdown or hosted docs tooling, then layer support replies, search analytics, changelogs, and screenshot refreshes around it. The workflow reality is multi-artifact and maintenance-heavy.

## Frequency Ranking
1. Separate page types by user intent/job
2. Put prerequisites and observable actions before the steps
3. Split mixed-purpose giant pages into smaller task-specific pages
4. Keep docs maintenance tied to release/review workflow
5. Use support/search signals as refresh triggers
6. Maintain adjacent artifacts like changelogs, FAQs, and analytics separately from the guide body

## Key Gaps
- Mature guidance exists for page types, but less for deciding when the right output is a single page vs a guide set vs a small refresh packet.
- Tooling solves publishing more than classification; teams still manually decide tutorial vs how-to vs FAQ vs release-help update.
- Cross-artifact drift (guide ↔ FAQ ↔ release update ↔ support macro ↔ screenshots) stays mostly manual.

## Contradictions
- Tool vendors emphasize smooth publishing and analytics, but the stubborn pain is still editorial: choosing the right doc shape and keeping boundaries intact.
- Many teams claim to use a docs taxonomy, yet Diátaxis still finds tutorial/how-to conflation to be the most common documentation mistake.

## Key Insight
The repo does not need another help-center or product-education wrapper. It needs a tighter `user-guide-writing` front door that chooses one primary mode quickly, emits the smallest useful user-doc packet, and routes multi-page packaging / maintenance detail into support references instead of bloating the main skill.

## Curated Sources
- Diátaxis: https://diataxis.fr/
- Diátaxis tutorials: https://diataxis.fr/tutorials/
- Diátaxis how-to guides: https://diataxis.fr/how-to-guides/
- Diátaxis complex hierarchies: https://diataxis.fr/complex-hierarchies/
- Divio documentation system: https://documentation.divio.com/
- GitLab documentation topic types: https://docs.gitlab.com/development/documentation/topic_types/
- GitLab documentation workflow: https://docs.gitlab.com/development/documentation/workflow/
- Google developer documentation style guide: https://developers.google.com/style
- Microsoft Writing Style Guide: https://learn.microsoft.com/en-us/style-guide/welcome/
- Write the Docs — Docs as Code: https://www.writethedocs.org/guide/docs-as-code/
- GitBook Git Sync / change requests / analytics: https://gitbook.com/docs/getting-started/git-sync , https://gitbook.com/docs/collaboration/change-requests , https://gitbook.com/docs/docs-site/insights
- Mintlify GitHub deploy / changelogs / analytics: https://mintlify.com/docs/deploy/github , https://mintlify.com/docs/create/changelogs , https://mintlify.com/docs/optimize/analytics
