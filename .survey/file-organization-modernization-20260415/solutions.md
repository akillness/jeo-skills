# Solution Landscape: file-organization modernization

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Feature-Sliced Design | Feature-first frontend architecture with layers, slices, and public APIs | Strong boundaries, scalable terminology, explicit public API thinking | Frontend-centric; can feel heavy for very small repos | Strong primary-source guidance on why type-based trees fail at scale |
| Bulletproof React | Opinionated production React architecture centered on `features/` plus shared folders | Practical folder examples, migration-friendly, high adoption in real React repos | Still React-oriented; not a universal backend/monorepo answer | Good evidence for actual day-to-day feature-folder behavior |
| Next.js project-organization guidance | Framework-native colocation, route groups, private folders, and feature/route splits | Matches framework conventions; avoids fighting router semantics | Intentionally unopinionated beyond framework-specific file conventions | Good source for route-aware structure decisions rather than global folder dogma |
| Turborepo workspace conventions | `apps/` + `packages/` monorepo/workspace structure | Good when multiple runnable apps and shared packages exist | Wrong abstraction if the repo is still one app | Useful as the “split into packages” route-out, not the default answer |
| General reproducibility guidance (MIT Comm Lab) | Purpose-first naming and hierarchy for revisitability and collaboration | Cross-domain, durable reasoning beyond JS frameworks | High-level; not enough alone for app architecture | Good support for naming, repeatability, and collaborator clarity |

## Categories
- **Feature-first app structure:** Feature-Sliced Design, Bulletproof React
- **Framework-native organization:** Next.js colocation, route groups, private folders
- **Repository/workspace split:** Turborepo workspace conventions
- **Cross-domain naming/repeatability rules:** MIT Comm Lab file-structure guidance

## What People Actually Use
In practice, teams rarely invent a perfect universal hierarchy from scratch. They mix one of three patterns:
1. Start with a type-based or framework-starter layout because it is easy to scaffold.
2. Migrate hot business areas into feature folders once the starter layout causes scattered changes.
3. Only split into `apps/` + `packages/` when multiple deployable apps/services or reusable packages actually justify workspace boundaries.

The recurring real-world compromise is not “choose one static tree forever.” It is “pick the smallest structure that preserves boundaries today, then add a migration rule for when code should move from shared or route folders into feature or package boundaries.”

## Frequency Ranking
1. **Feature-first organization** — most repeated recommendation across Feature-Sliced Design, Bulletproof React, and indexed practitioner summaries.
2. **Framework-native colocation** — common when using Next.js App Router and similar meta-frameworks.
3. **Workspace/package split** — common in monorepos, but clearly secondary to deciding whether the repo actually has multiple packages/apps.
4. **Naming/repeatability conventions** — universal but usually presented as support rules, not the main architecture choice.

## Key Gaps
- Existing guidance is often frontend-specific, while agents still need a transferable decision rubric for backend/fullstack/general repo organization.
- Many resources show example trees but spend less time on migration triggers: when to move code into a feature, shared folder, route group, or package.
- Repo-local skill boundaries are currently under-specified, so `file-organization` risks overlapping with `system-environment-setup`, `ui-component-patterns`, `design-system`, and `workflow-automation`.

## Contradictions
- Marketed examples often look like universal templates, but the best primary sources explicitly say structure should follow context: Next.js is unopinionated about overall organization, Bulletproof React warns it is not a silver bullet/template, and Turborepo only recommends workspace/package splitting when the repo is actually a workspace.[^next][^bulletproof][^turbo]
- Type-based starter layouts are often sold as “clean,” yet FSD directly calls out their scaling limit: feature code becomes scattered across 5–7 directories, making changes riskier.[^fsd]

## Key Insight
The highest-value improvement is not adding another project-template skill. It is turning `file-organization` into a decision-first structure router: choose the right boundary unit (feature, shared layer, route group, or package), explain when each is justified, provide a low-risk migration checklist, and route adjacent concerns to the skills that already own component APIs, environment setup, and repo automation.

## Curated Sources
- Feature-Sliced Design, "The Perfect Folder Structure for Scalable Frontend" — https://feature-sliced.design/blog/frontend-folder-structure
- Bulletproof React README — https://raw.githubusercontent.com/alan2207/bulletproof-react/master/README.md
- Bulletproof React project structure doc — https://raw.githubusercontent.com/alan2207/bulletproof-react/master/docs/project-structure.md
- Next.js docs, "Project structure and organization" — https://nextjs.org/docs/app/getting-started/project-structure
- Turborepo docs, "Structuring a repository" — https://turborepo.dev/docs/crafting-your-repository/structuring-a-repository
- MIT Comm Lab, "File Structure" — https://mitcommlab.mit.edu/broad/commkit/file-structure/

[^fsd]: Feature-Sliced Design, browser-rendered primary page evidence.
[^bulletproof]: GitHub raw primary-source retrieval.
[^next]: Direct page retrieval + browser-rendered primary page evidence.
[^turbo]: Browser-rendered primary page evidence.