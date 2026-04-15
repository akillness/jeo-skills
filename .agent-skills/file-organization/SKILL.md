---
name: file-organization
description: >
  Choose and evolve project/repository structure without cargo-culting one folder
  tree. Use when the user needs to decide how a frontend, backend, fullstack,
  docs/ops, or game-development repo should be organized; when a repo has grown
  messy and needs clearer boundaries; when feature folders, route colocation,
  monorepo `apps/` + `packages`, docs taxonomy, or engine-aware asset layouts are
  being debated; or when naming rules, barrel-file sprawl, and shared-folder junk
  drawers are hurting discoverability. Triggers on: file organization, project
  structure, folder structure, repo layout, monorepo structure, feature folders,
  code organization, docs taxonomy, Unity folders, Unreal directories.
allowed-tools: Read Write Glob Bash
compatibility: >
  Best for repository-structure decisions and incremental reorganization across
  frontend, backend, monorepo/fullstack, documentation, and game-development
  projects. Pair with `codebase-search` for repo archaeology, `workflow-automation`
  for generators/task runners, and `system-environment-setup` for runnable
  environments.
metadata:
  tags: file-organization, project-structure, repo-layout, feature-folders, monorepo, naming-conventions, docs-taxonomy, game-development
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "2.0"
  source: akillness/oh-my-skills
---

# File Organization

Use this skill when the real question is **"what structure should this repo use next, and how do we improve it without creating a bigger mess?"**

The job is not to dump one giant folder tree and call it done.
The job is to:
1. identify the repo shape and growth pressure,
2. choose the lowest-complexity structure that fits,
3. define clear top-level boundaries and naming rules,
4. spot anti-patterns before they fossilize,
5. provide an incremental migration path when the repo already exists.

Read [references/repo-shape-decision-guide.md](references/repo-shape-decision-guide.md) before choosing a structure.
Read [references/migration-playbook.md](references/migration-playbook.md) when the repo is already messy.
Read [references/repo-type-patterns.md](references/repo-type-patterns.md) when the request spans web, docs/ops, or game-dev layouts.

## When to use this skill
- Decide how to structure a new frontend, backend, fullstack, docs, or game-development repo
- Refactor an existing repo whose folders no longer communicate ownership or intent
- Choose between framework defaults, feature/domain folders, or monorepo `apps/` + `packages/libs/`
- Establish naming and placement rules for files, folders, tests, docs, or assets
- Reduce `shared/`, `common/`, `misc/`, `helpers/`, or `utils/` junk-drawer sprawl
- Plan an incremental reorganization instead of a risky big-bang rewrite
- Clarify how code, docs, scripts, assets, or packages should be separated at the top level

## When not to use this skill
- **The main task is finding where something currently lives** → use `codebase-search`
- **The main task is scaffolding generators, task runners, hooks, or recurring commands** → use `workflow-automation`
- **The main task is Docker/devcontainers/toolchains/services needed to run the repo** → use `system-environment-setup`
- **The main task is frontend state ownership, cache boundaries, or store organization** → use `state-management`
- **The main task is shared UI primitives or design-token package boundaries** → use `design-system`
- **The main task is game-production planning, milestone routing, or studio process** → use `bmad-gds`

## Core idea
Good file organization is a **decision ladder**, not one canonical tree:

1. **Follow framework or engine defaults first** when they already solve the problem.
2. **Escalate to feature/domain grouping** when change locality and ownership matter more than technical layers.
3. **Escalate to `apps/` + `packages/libs/`** when multiple deployables or shared libraries appear.
4. **Add naming rules, boundary docs, and migration guardrails** before inventing more folders.
5. **Keep migrations incremental** unless the repo is small enough to safely restart.

## Instructions

### Step 1: Classify the repository before proposing structure
Normalize the request into this intake first:

```yaml
repo_structure_intake:
  repo_type: frontend-app | backend-service | fullstack-monorepo | docs-ops-repo | game-project | library-cli | mixed | unknown
  lifecycle: greenfield | growing | messy-existing | partial-reorg | unknown
  dominant_pressure:
    - route-sprawl
    - feature-sprawl
    - shared-folder-junk-drawer
    - ownership-unclear
    - docs-taxonomy-drift
    - asset-sprawl
    - too-many-top-level-folders
    - monorepo-boundary-confusion
    - unknown
  current_shape: framework-defaults | layer-first | feature-first | monorepo | hybrid | ad-hoc | unknown
  migration_tolerance: low | medium | high
  contributors: solo | small-team | multi-team | mixed-discipline
  constraints:
    - framework-routing-rules
    - engine-special-folders
    - generator-lock-in
    - import-path-stability
    - docs-url-stability
    - asset-pipeline-rules
    - unknown
```

If the request is vague, prefer the smallest reasonable interpretation and state the assumption.

### Step 2: Choose one primary organization mode
Pick exactly one primary mode for the run:

1. **framework-default mode**
   - Use when official framework/engine structure already covers most needs.
   - Typical fits: early Next.js/Nuxt/SvelteKit apps, straightforward FastAPI/Nest apps, Unity/Unreal projects that mainly need naming discipline.

2. **feature/domain mode**
   - Use when one workflow or feature touches UI/state/api/tests/docs together and layer-first folders scatter the work.
   - Typical fits: growing product apps, medium-size backend domains, feature teams.

3. **workspace/monorepo mode**
   - Use when multiple deployables, packages, or services need explicit top-level separation.
   - Typical fits: `apps/` + `packages/libs/`, app-plus-docs/tooling repos, multiple clients/services.

4. **docs-taxonomy mode**
   - Use when the repo is mostly documentation, runbooks, or knowledge assets.
   - Organize by user need and content type, not by org chart or publishing history.

5. **engine-aware hybrid mode**
   - Use when game/content repos must honor engine-required folders while still preserving feature or ownership boundaries.

Return the chosen mode explicitly before proposing folders.

### Step 3: Apply the repo-type pattern that fits

#### A. Frontend / meta-framework app
Default order of preference:
1. keep framework routing/layout conventions,
2. colocate route-specific code near the route,
3. group shared UI and utilities only when they are truly shared,
4. introduce feature folders when `components/` and `hooks/` become dumping grounds.

Good signs:
- route-specific code changes together,
- shared UI is small and intentional,
- top-level folders explain ownership,
- tests/stories/styles live near the code they exercise when practical.

Common anti-patterns:
- one giant `components/` tree with no feature ownership,
- `utils/` absorbing business logic,
- barrels at every directory level,
- adding monorepo complexity before a single app has stable boundaries.

#### B. Backend service
Default order of preference:
1. keep framework/module conventions,
2. split by domain/module once one service file/package becomes overloaded,
3. keep interfaces/adapters/storage boundaries legible without scattering one workflow across too many technical folders.

Good signs:
- a domain change touches one module area rather than six folders,
- routers/controllers/services/jobs/schemas are not duplicated across arbitrary buckets,
- background jobs, migrations, scripts, and operational docs have clear homes.

Common anti-patterns:
- controller/service/repository layers so rigid that every small change crosses the whole tree,
- `common/` or `shared/` becoming unowned infra/business-logic storage,
- scripts hidden inside unrelated app folders.

#### C. Fullstack / monorepo
Default order of preference:
1. keep top-level `apps/` plus `packages/` or `libs/`,
2. extract only genuinely shared code,
3. document package ownership and public APIs,
4. avoid turning every convenience helper into its own package.

Good signs:
- deployables are obvious,
- shared packages have a clear reason to exist,
- package boundaries map to ownership or reuse,
- docs/scripts/tooling are top-level peers when they matter.

Common anti-patterns:
- premature shared package extraction,
- package names that mirror old folders without a stable API,
- dumping scripts/docs/infra into random app directories,
- using the monorepo as an excuse not to define ownership.

#### D. Docs / ops repo
Default order of preference:
1. organize by user intent and document type,
2. separate tutorials/how-to/reference/explanation or equivalent taxonomy,
3. isolate runbooks, architecture notes, onboarding, and product reference when their audiences differ.

Good signs:
- readers can predict where a document belongs,
- docs paths mirror how users seek information,
- runbooks and policy docs are not mixed with end-user help.

Common anti-patterns:
- docs folders based on team names only,
- one giant `misc/` or `notes/` bucket,
- architecture notes buried alongside user support material.

#### E. Game-development repo
Default order of preference:
1. respect engine-mandated roots and special folders,
2. separate content assets, scenes/levels, scripts, and tools clearly,
3. use naming and ownership rules to compensate where pure feature grouping is impossible,
4. use feature/system grouping where the engine allows it.

Good signs:
- non-programmers can predict where assets belong,
- engine-required folders are deliberate rather than accidental,
- gameplay systems, tools, and content pipelines have distinct homes.

Common anti-patterns:
- asset-type buckets with no ownership rules,
- feature folders that break engine assumptions,
- build/generated/cache directories treated like first-class source structure.

### Step 4: Define the boundary packet
For any chosen mode, return this packet:

```yaml
structure_packet:
  primary_mode: framework-default | feature-domain | workspace-monorepo | docs-taxonomy | engine-aware-hybrid
  top_level_folders:
    - name: <folder>
      purpose: <why it exists>
      owner: <role/team/unknown>
  naming_rules:
    files: <rule>
    folders: <rule>
    shared_code: <rule>
  placement_rules:
    - "new route-specific code goes near the route"
    - "extract to shared only after proven reuse"
  anti_patterns_to_block:
    - <pattern>
  migration_scope: greenfield | incremental | targeted-reorg
  route_outs:
    - <adjacent skill if needed>
```

Do not stop at a folder tree. The packet must explain **why** each boundary exists.

### Step 5: Plan migration only if needed
If the repo already exists, avoid a full rewrite unless the blast radius is genuinely small.

Preferred migration order:
1. freeze the target vocabulary (top-level folders, naming rules, what counts as shared),
2. pick one hot path or one feature/domain first,
3. move new work into the new shape before backfilling old code,
4. add compatibility shims, aliases, or README notes where necessary,
5. clean up the highest-confusion legacy buckets last.

### Step 6: Guard against junk-drawer patterns
Explicitly check for these and call them out:
- `shared/`, `common/`, `misc/`, `helpers/`, `utils/` with unclear ownership
- barrels at every folder level
- too many top-level folders without distinct purpose
- packages extracted before a stable public API exists
- docs trees organized around org history instead of reader tasks
- game asset trees that ignore engine/tool constraints

### Step 7: Produce the output in this order
1. **Repository diagnosis** — current shape, pressure, and constraints
2. **Chosen organization mode** — one sentence
3. **Boundary packet** — top-level folders, naming rules, placement rules, anti-patterns
4. **Migration plan** — only if the repo already exists
5. **Route-outs** — adjacent skills when the problem expands beyond structure

## Output format

### Repository diagnosis
- Repo type:
- Lifecycle:
- Main pressure:
- Constraints:

### Recommended structure
| Folder / boundary | Purpose | Typical contents | Notes |
|-------------------|---------|------------------|-------|
| `...` | ... | ... | ... |

### Naming and placement rules
- Files:
- Folders:
- Shared code:
- Assets/docs/scripts:

### Anti-patterns to block
- ...

### Migration plan
1. ...
2. ...
3. ...

### Route-outs
- ...

## Examples

### Example 1: Growing Next.js app with `components/` sprawl
**Input:** “Our Next.js repo has `components`, `hooks`, `lib`, `utils`, and no one knows where new feature code belongs.”

**Output direction:**
- Keep App Router defaults.
- Move route-specific code close to the route.
- Introduce feature folders for high-churn product areas.
- Shrink `components/` to truly shared UI primitives.
- Route state-boundary questions to `state-management` if the issue becomes store ownership.

### Example 2: Backend service that outgrew one package
**Input:** “Our API started simple but now controllers, jobs, schemas, migrations, and services are scattered.”

**Output direction:**
- Choose feature/domain mode.
- Group endpoints, schemas, policies, and workflows by domain/module.
- Keep migrations, scripts, and operational entrypoints in explicit peer folders.
- Avoid creating a giant global `common/` folder as the escape hatch.

### Example 3: Fullstack monorepo with premature package extraction
**Input:** “We have three apps, six packages, duplicated helpers, and no clarity on what should stay shared.”

**Output direction:**
- Keep `apps/` + `packages/`.
- Collapse pseudo-shared packages that do not have stable public APIs.
- Define package ownership and extraction rules.
- Route generator/task-runner follow-up to `workflow-automation`.

### Example 4: Unity repo with asset sprawl
**Input:** “Our Unity project has art, prefabs, scenes, tools, and scripts mixed together under `Assets/`.”

**Output direction:**
- Choose engine-aware hybrid mode.
- Respect Unity special folders.
- Separate scenes/prefabs/scripts/tools/content assets intentionally.
- Add naming and ownership rules for cross-discipline contributors.

## Best practices
1. Start from framework or engine defaults before inventing custom top-level folders.
2. Organize by what changes together, not just by file type.
3. Extract shared code only after repeatable reuse is obvious.
4. Keep top-level folders few, named, and purposeful.
5. Treat naming rules and placement rules as part of the design, not optional polish.
6. Prefer incremental migrations over heroic restructures.
7. Document exceptions when the tree cannot fully explain the repo.
8. Respect engine/tooling constraints in game/content repositories.

## References
- [references/repo-shape-decision-guide.md](references/repo-shape-decision-guide.md)
- [references/migration-playbook.md](references/migration-playbook.md)
- [references/repo-type-patterns.md](references/repo-type-patterns.md)
- [React FAQ: File Structure](https://legacy.reactjs.org/docs/faq-structure.html)
- [Next.js Project Structure](https://nextjs.org/docs/app/getting-started/project-structure)
- [Redux Style Guide](https://redux.js.org/style-guide/#structure-files-as-feature-folders-with-single-file-logic)
- [Nx Workspace Layout](https://nx.dev/concepts/more-concepts/workspace-layout)
- [Turborepo Structuring a Repository](https://turbo.build/repo/docs/crafting-your-repository/structuring-a-repository)
- [Diátaxis](https://diataxis.fr/)
- [Unity Special Folders](https://docs.unity3d.com/Manual/SpecialFolders.html)
