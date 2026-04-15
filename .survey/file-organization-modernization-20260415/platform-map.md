# Platform Map: file-organization modernization

## Alternatives
| Alternative | What it covers instead | Why people reach for it | Why it is not enough |
|-------------|------------------------|--------------------------|----------------------|
| `codebase-search` | Finding where things live right now | Repo is already messy and the immediate pain is navigation | Search helps locate files, not decide the future structure or migration rules |
| `workflow-automation` | Generators, bootstrap scripts, task runners | Teams want consistency through scaffolding or recurring commands | Automation preserves a chosen structure; it does not define the structure boundaries |
| `system-environment-setup` | Runnable environments, toolchains, devcontainers, local services | Folder problems often appear alongside setup pain | Environment setup makes a repo runnable across machines, not legible inside the repo |
| `state-management` | Frontend state ownership and boundaries | Feature-folder design often touches slices/stores/hooks | State layout is one subsystem inside the repo, not the whole folder strategy |
| `design-system` | Shared UI primitives and package boundaries | Large frontend repos often split design-system packages early | A design system explains shared UI ownership, not the whole app/repo shape |
| `bmad-gds` / game-production skills | Game production planning and execution | Game teams feel code/content structure pain alongside production pain | Production orchestration does not define asset/code folder boundaries |
| Starter templates / framework defaults | Initial generated shape | Lowest-friction default | They rarely explain scale-up decisions, hybrid migrations, or adjacent-boundary handoffs |

## Boundary Map
| Concern | Own here in `file-organization` | Route out to adjacent skill |
|---------|-------------------------------|-----------------------------|
| Repo shape for a growing frontend/backend/fullstack/docs/game project | Yes — choose default vs feature/domain vs app/package vs engine-aware hybrid | — |
| Where to put the next folder/file and what top-level buckets should exist | Yes | — |
| How to find an existing file or trace current ownership | No | `codebase-search` |
| How to automate scaffolds, generators, hooks, or recurring tasks | No | `workflow-automation` |
| How to make the repo runnable with Docker/devcontainers/toolchains | No | `system-environment-setup` |
| How to split frontend state stores, reducers, caches, and server-state ownership | No | `state-management` |
| How to design shared UI package boundaries and component primitives | No | `design-system` |
| How to plan game production phases or milestone delivery | No | `bmad-gds` / game-production lane |

## Platform Gaps / Skill Gaps
- The current skill is strong on example trees but weak on **decision criteria**.
- It does not say when to keep framework or engine defaults versus when to escalate to feature/domain or monorepo boundaries.
- It barely covers docs/ops repos and game-development repos.
- It does not teach anti-pattern recognition (`shared/`, `common/`, `misc/`, barrel-file overuse, premature shared packages).
- It does not provide migration-oriented advice for hybrid or incremental reorgs.

## Key differentiators
1. **Decision-first over template-first** — choose the minimum structure that matches repo scale and constraints.
2. **Cross-stack coverage** — frontend, backend, fullstack/monorepo, docs/ops, and game-development repos.
3. **Boundary clarity** — explain what belongs in structure design vs search, automation, environment setup, state architecture, design systems, and production planning.
4. **Migration realism** — support incremental adoption, hybrid trees, naming rules, and ownership docs rather than pretending every repo can reboot from scratch.

## Sources
- Repo-local boundary evidence: `.agent-skills/workflow-automation/SKILL.md`, `.agent-skills/codebase-search/SKILL.md`, `.agent-skills/system-environment-setup/SKILL.md`, `.agent-skills-wiki/concepts/developer-workflow-cluster.md`
- External context: [Next.js Project Structure](https://nextjs.org/docs/app/getting-started/project-structure), [Nx Workspace Layout](https://nx.dev/concepts/more-concepts/workspace-layout), [Redux Style Guide](https://redux.js.org/style-guide/#structure-files-as-feature-folders-with-single-file-logic), [Unity Special Folders](https://docs.unity3d.com/Manual/SpecialFolders.html)
