# Context: file-organization modernization

## Workflow Context
Project-structure pain usually appears when a repo outgrows a single obvious layout and the team stops agreeing on whether to organize by route/page, feature/domain, technical layer, docs taxonomy, or engine-required folders.

- **Frontend**: React and Next.js teams hit this when `components/`, `hooks/`, and `utils/` become junk drawers and route-driven or feature-driven colocation becomes more maintainable.
- **Backend**: service repos split routers, schemas, services, jobs, and data access once single-file or single-package layouts stop scaling.
- **Fullstack / monorepo**: multi-app repos need deliberate `apps/` vs `packages/libs/` boundaries and ownership rules instead of ad hoc top-level sprawl.
- **Docs / ops**: docs-as-code repos need user-facing information architecture, not just historical folder growth.
- **Game dev**: Unity / Unreal repos need engine-aware folder rules plus naming discipline for scenes, prefabs, scripts, art, and other assets.

Sources: [React FAQ: File Structure](https://legacy.reactjs.org/docs/faq-structure.html), [Next.js Project Structure](https://nextjs.org/docs/app/getting-started/project-structure), [FastAPI Bigger Applications](https://fastapi.tiangolo.com/tutorial/bigger-applications/), [Turborepo Structuring a Repository](https://turbo.build/repo/docs/crafting-your-repository/structuring-a-repository), [Nx Workspace Layout](https://nx.dev/concepts/more-concepts/workspace-layout), [Write the Docs: Docs as Code](https://www.writethedocs.org/guide/docs-as-code/), [Diátaxis](https://diataxis.fr/), [Unity Special Folders](https://docs.unity3d.com/Manual/SpecialFolders.html), [Unity project organization](https://unity.com/how-to/organizing-your-project)

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Frontend engineer | Keep UI code discoverable as routes, features, and shared UI grow | intermediate–advanced |
| Backend engineer | Split services into modules without scattering one workflow across many folders | intermediate–advanced |
| Fullstack / platform engineer | Define `apps/`/`packages/` boundaries, shared code rules, and ownership lines | advanced |
| Product / ops / docs owner | Organize docs, runbooks, and reference content around user tasks | intermediate |
| Game developer / technical artist | Keep engine-required folders, content assets, and gameplay code understandable | intermediate–advanced |

## Current Workarounds
1. Start from framework or engine defaults, then add feature/domain folders where churn is highest.
2. Use monorepo conventions like `apps/` + `packages/` / `libs/` when top-level sprawl becomes unmanageable.
3. Rely on generators, starter templates, or copy-paste of a "good" module to keep new work somewhat consistent.
4. Add README files, CODEOWNERS, ADRs, and migration checklists when the folder tree alone stops communicating intent.
5. In game repos, accept hybrid layouts: engine-mandated buckets where required, feature/domain grouping where possible, and strict naming rules to fill the gaps.

Sources: [Redux Style Guide](https://redux.js.org/style-guide/#structure-files-as-feature-folders-with-single-file-logic), [GitHub CODEOWNERS](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners), [Martin Fowler: Strangler Fig Application](https://martinfowler.com/bliki/StranglerFigApplication.html), [Feature-Sliced Design](https://feature-sliced.design/docs/get-started/overview), [Unity Special Folders](https://docs.unity3d.com/Manual/SpecialFolders.html)

## Adjacent Problems
- Ownership and discoverability failures: people cannot tell where to add the next file or who owns a directory.
- Boundary erosion: `shared/`, `common/`, and `utils/` become dumping grounds.
- Refactor cost: moving folders later breaks imports, docs references, tests, build assumptions, and human habits.
- Tooling coupling: framework routing, backend module loaders, or engine import rules constrain what counts as a valid structure.
- Documentation drift: repos compensate with docs and spreadsheets because the tree no longer communicates the mental model.

## User Voices
- “What is a good way to structure a React application?” — React treats this as a persistent, context-dependent question rather than a one-tree answer. Source: [React FAQ: File Structure](https://legacy.reactjs.org/docs/faq-structure.html)
- “Bigger Applications - Multiple Files” — FastAPI’s own tutorial title captures the typical backend inflection point where the original layout stops working. Source: [FastAPI Bigger Applications](https://fastapi.tiangolo.com/tutorial/bigger-applications/)
- Turborepo and Nx both surface repository structure as a first-order scaling decision rather than a cosmetic folder preference. Sources: [Turborepo Structuring a Repository](https://turbo.build/repo/docs/crafting-your-repository/structuring-a-repository), [Nx Workspace Layout](https://nx.dev/concepts/more-concepts/workspace-layout)
- Unity’s special-folder rules show that game-repo organization is partly dictated by the engine, not just abstract architecture taste. Source: [Unity Special Folders](https://docs.unity3d.com/Manual/SpecialFolders.html)
