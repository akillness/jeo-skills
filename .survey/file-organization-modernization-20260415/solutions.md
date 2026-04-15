# Solution Landscape: file-organization modernization

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Next.js / Nuxt / SvelteKit project structure | Framework-imposed conventions plus route colocation | Low decision cost, tooling/doc alignment, easy onboarding | Weak guidance for large cross-feature boundaries; can blur domain ownership | Best default for framework-first frontend/fullstack repos |
| Angular style guide | Official feature-area and naming guidance | Explicit official rules, good consistency pressure | Can feel heavy for small apps | Strong example of “feature area + naming” guidance |
| FastAPI / Nest modular layouts | Backend module/package splits | Clear service boundaries once one-file apps break down | Easily turns into ceremony or layer sprawl | Good backend evidence for growth-triggered restructuring |
| Nx / Turborepo / pnpm workspaces | Monorepo app-package separation | Scales across apps and shared packages; supports boundary tooling | Premature shared packages and ownership tangles are common | Strong fullstack/developer-platform pattern |
| create-next-app / Angular CLI / Nest CLI / create-t3-app | Generator-led starter structures | Real-world adoption is high because teams keep generator output | Templates fossilize early decisions and can be cargo-culted | Shows why the skill must discuss scaffolds and migration |
| Feature-Sliced Design / Bulletproof React | Opinionated large-app architecture templates | Good escalation path when framework defaults are no longer enough | Often too heavy or abstract for small/medium teams | Better as “scale-up options” than defaults |
| Unity / Unreal project structure guidance | Engine-aware code + asset organization | Respects engine/tool constraints; useful for code + content repos | Pure feature/domain advice breaks when engine folders are required | Important game-dev lane that the current skill ignores |
| Docs-as-code / Diátaxis | Information architecture for docs repos | Organizes around user need, not arbitrary history | Not a full repo architecture system by itself | Useful for product/ops documentation repositories |

## Categories
- **Official defaults**: Next.js, Nuxt, SvelteKit, Angular, FastAPI, Nest, Unity, Unreal
- **Monorepo/workspace structure**: Nx, Turborepo, pnpm workspaces
- **Scaffolding surfaces**: create-next-app, Angular CLI, Nest CLI, create-t3-app
- **Scale-up templates**: Feature-Sliced Design, Bulletproof React, Clean Architecture variants
- **Docs / ops information architecture**: Diátaxis, docs-as-code guidance
- **Maintainability heuristics**: colocation, fewer top-level buckets, delayed extraction of shared code, explicit ownership and naming rules

## What People Actually Use
People usually do not jump from a messy repo to a pristine universal structure. They keep framework or engine defaults, carve out feature/domain folders where change is most frequent, add monorepo boundaries when multi-app sprawl appears, and use generators, barrel files, aliases, ADRs, or CODEOWNERS as stopgaps.

## Frequency Ranking
1. Official framework/engine conventions
2. Feature/domain-first organization
3. Monorepo `apps/` + `packages/libs/`
4. Generator-led starter layouts
5. Opinionated large-app templates
6. Layer-first controller/service/repository splits
7. Supporting heuristics like naming rules, barrels, and ownership docs

## Key Gaps
- Most guidance stops at starter templates and does not help teams choose **when to stay with defaults vs when to escalate**.
- Few sources explain **boundary handoff** between file organization and adjacent concerns like automation, state architecture, design systems, or environment setup.
- Many guides ignore **docs repos** and **game/content repos**, even though those domains have strong structure pain.
- Template-heavy advice underexplains **incremental migration** and hybrid layouts.

## Contradictions
- Marketed promise: “Use this clean structure and your repo will stay organized.”
  Reality: teams still accumulate hybrid trees, legacy folders, and partial migrations.
- Marketed promise: “Monorepo/package boundaries solve complexity.”
  Reality: shared-package sprawl and weak ownership often replace folder sprawl.
- Marketed promise: “Barrel files improve ergonomics.”
  Reality: overused barrels hide coupling and create circular dependency problems.

## Key Insight
A strong `file-organization` skill should not prescribe one perfect folder tree. It should help the user choose the **lowest-complexity structure that matches the repo’s scale and constraints**: start with framework/engine defaults, escalate to feature/domain grouping when change locality matters, adopt app/package boundaries when multi-project sprawl appears, and use migration-friendly heuristics instead of big-bang restructures.

## Curated Sources
- [Angular Style Guide](https://angular.dev/style-guide)
- [Next.js Project Structure](https://nextjs.org/docs/app/getting-started/project-structure)
- [Nuxt Directory Structure](https://nuxt.com/docs/guide/directory-structure/app)
- [SvelteKit Project Structure](https://svelte.dev/docs/kit/project-structure)
- [FastAPI Bigger Applications](https://fastapi.tiangolo.com/tutorial/bigger-applications/)
- [NestJS Monorepo](https://docs.nestjs.com/cli/monorepo)
- [Nx Workspace Layout](https://nx.dev/concepts/more-concepts/workspace-layout)
- [Turborepo Structuring a Repository](https://turbo.build/repo/docs/crafting-your-repository/structuring-a-repository)
- [pnpm Workspaces](https://pnpm.io/workspaces)
- [Redux Style Guide](https://redux.js.org/style-guide/#structure-files-as-feature-folders-with-single-file-logic)
- [Feature-Sliced Design](https://feature-sliced.design/docs/get-started/overview)
- [Bulletproof React](https://github.com/alan2207/bulletproof-react)
- [Write the Docs: Docs as Code](https://www.writethedocs.org/guide/docs-as-code/)
- [Diátaxis](https://diataxis.fr/)
- [Unity Special Folders](https://docs.unity3d.com/Manual/SpecialFolders.html)
- [Unreal Engine Directory Structure](https://dev.epicgames.com/documentation/en-us/unreal-engine/directory-structure)
- [TkDodo: Please Stop Using Barrel Files](https://tkdodo.eu/blog/please-stop-using-barrel-files)
