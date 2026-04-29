# Context: file-organization modernization

## Workflow Context
`file-organization` activates when a repo has outgrown ad hoc folder decisions and the team needs a durable structure for features, shared code, framework conventions, and later refactors. This shows up in greenfield app setup, legacy repo cleanup, monorepo/package splits, and feature-boundary review before moving files around. Primary evidence this run points to a repeated pattern: starter type-based trees are easy to begin with, but they scatter related work across `components/`, `hooks/`, `utils/`, and `store/`, which raises change amplification as products and teams grow. Feature-Sliced Design explicitly frames folder structure as an architecture choice that drives cohesion, modularity, isolation, onboarding speed, and safe change velocity.[^fsd] Bulletproof React documents the same practical behavior in production-style React apps: keep most code inside `features/`, and only keep truly shared code in shared folders.[^bulletproof] MIT Comm Lab's reproducibility guidance reinforces the broader cross-domain principle: file structures should communicate purpose, support repeatability, and help collaborators revisit and revise work later.[^mit]

Framework guidance matters too. Next.js is intentionally unopinionated about most project organization, but its official docs emphasize colocation, route groups, private folders, and splitting project files by feature or route rather than pretending there is one canonical global tree.[^next] Turborepo similarly recommends beginning with ecosystem workspace conventions and separating `apps/` from `packages/` when the real problem is a multi-package repository, not a single app folder tree.[^turbo]

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Fullstack developer | Choose repo/app structure before feature work compounds | Intermediate |
| Frontend lead | Keep React/Next code modular as product scope and team size grow | Intermediate–Advanced |
| Tech lead / staff engineer | Set boundary rules for shared vs feature code and refactor migrations | Advanced |
| AI coding agent | Propose or review structure changes without over-scattering files | Intermediate |

## Current Workarounds
1. Copy a starter tree from an old repo or template, then keep appending folders until the structure drifts.
2. Group everything by technical type (`components`, `hooks`, `utils`, `store`) even after business areas become large, then manually remember boundaries.
3. Use framework routing folders as the only organizing principle, then hide unrelated domain logic nearby because the repo lacks a clearer feature/shared split.
4. Split into monorepo packages too early or too late because the decision is treated as style preference instead of dependency/runtime isolation.

## Adjacent Problems
- Boundary confusion with `ui-component-patterns`, `design-system`, `state-management`, `system-environment-setup`, and `workflow-automation`.
- Risky reorganizations that move files without a migration checklist, barrel/import cleanup plan, or ownership rules.
- Discovery docs and setup prompts still advertise the skill as generic folder advice instead of a decision-first structure router.
- Weak support coverage: no `references/`, no `evals/`, and no sharper examples for migration or route-outs.

## User Voices
- Feature-Sliced Design notes that when a folder structure grows organically, teams often get low cohesion, high coupling, and change amplification because feature code is spread across technical folders.[^fsd]
- Bulletproof React says the repo is meant to show “a good project structure that scales very well” and recommends organizing most code inside feature folders for scalability and maintenance.[^bulletproof]
- An indexed DuckDuckGo HTML result for Applifting's Frontend Playbook summarizes a common practitioner view: React itself does not impose a strict structure, so teams fall back to Feature-Sliced Design / Bulletproof React style organization after experimenting with alternatives.[^ddg-actual]

[^fsd]: Feature-Sliced Design, "The Perfect Folder Structure for Scalable Frontend" (browser-rendered primary page evidence), https://feature-sliced.design/blog/frontend-folder-structure
[^bulletproof]: GitHub raw primary-source retrieval, `alan2207/bulletproof-react` README and `docs/project-structure.md`, https://raw.githubusercontent.com/alan2207/bulletproof-react/master/README.md and https://raw.githubusercontent.com/alan2207/bulletproof-react/master/docs/project-structure.md
[^mit]: MIT Comm Lab, "File Structure" (direct page retrieval), https://mitcommlab.mit.edu/broad/commkit/file-structure/
[^next]: Next.js docs, "Project structure and organization" (direct page retrieval + browser-rendered primary page evidence), https://nextjs.org/docs/app/getting-started/project-structure
[^turbo]: Turborepo docs, "Structuring a repository" (browser-rendered primary page evidence), https://turborepo.dev/docs/crafting-your-repository/structuring-a-repository
[^ddg-actual]: DuckDuckGo HTML indexed snippet (medium confidence), query: `repo structure feature based bulletproof react github`, snippet for https://applifting.github.io/frontend-playbook/project-structure/feature-sliced-design-overview/