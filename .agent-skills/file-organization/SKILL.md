---
name: file-organization
description: >
  Choose and evolve project/repository structure without cargo-culting one folder
  tree. Use when the user needs to decide between framework defaults,
  feature/domain folders, workspace/monorepo boundaries, docs taxonomy, or
  engine-aware game/content layouts; when a repo has grown messy and needs
  clearer ownership; or when `shared/`, `common/`, `helpers/`, barrels, and
  package sprawl are hurting discoverability. Triggers on: file organization,
  folder structure, project structure, repo layout, monorepo structure, docs
  taxonomy, code organization, Unity folders, Unreal directories.
allowed-tools: Read Write Glob Bash
compatibility: >
  Best for repository-shape decisions and incremental reorganizations across
  frontend, backend, fullstack, docs/ops, and game-development repos. Pair with
  `codebase-search` for archaeology, `workflow-automation` for enforcement or
  generators, and `system-environment-setup` for runnable environments.
metadata:
  tags: file-organization, project-structure, repo-layout, feature-folders, monorepo, naming-conventions, docs-taxonomy, game-development
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "2.1"
  source: akillness/oh-my-skills
---

# File Organization

Use this skill when the real question is **"what structure should this repo use next, and how do we improve it without creating a bigger mess?"**

The job is to choose the lowest-complexity structure that fits, define the boundary rules, and give an incremental migration path when the repo already exists.

Read [references/repo-shape-decision-guide.md](references/repo-shape-decision-guide.md) before choosing a structure.
Read [references/migration-playbook.md](references/migration-playbook.md) when the repo is already messy.
Read [references/repo-type-patterns.md](references/repo-type-patterns.md) when the request spans frontend, backend, docs/ops, or game-development layouts.

## When to use this skill
- Decide how to structure a frontend, backend, fullstack, docs, or game-development repo
- Choose between framework defaults, feature/domain folders, `apps/` + `packages/libs/`, docs taxonomy, or engine-aware hybrid layouts
- Reorganize an existing repo whose folders no longer communicate ownership or intent
- Define naming and placement rules for code, docs, scripts, assets, tests, or packages
- Stop `shared/`, `common/`, `misc/`, `helpers/`, or `utils/` junk drawers from spreading
- Plan an incremental reorganization instead of a risky all-at-once rewrite

## When not to use this skill
- **The main task is finding where something currently lives** → use `codebase-search`
- **The main task is scaffolding generators, task runners, hooks, or recurring commands** → use `workflow-automation`
- **The main task is Docker/devcontainers/toolchains/services needed to run the repo** → use `system-environment-setup`
- **The main task is frontend state ownership or store boundaries** → use `state-management`
- **The main task is shared UI primitives, tokens, or package boundaries inside the design system** → use `design-system`
- **The main task is game-production planning or milestone routing** → use `bmad-gds`

## Core idea
Good file organization is a **decision ladder**, not one canonical folder tree:
1. Keep framework or engine defaults first when they already solve the problem.
2. Escalate to feature/domain grouping when change locality matters more than technical layers.
3. Escalate to `apps/` + `packages/libs/` when multiple deployables or real shared packages appear.
4. Add naming rules, placement rules, and migration guardrails before inventing more folders.
5. Prefer incremental migrations unless the repo is small enough to restart safely.

## Instructions

### Step 1: Classify the repository before proposing structure
Normalize the request into this intake:

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

1. **framework-default mode** — early framework/engine defaults still fit; add only small colocated boundaries.
2. **feature/domain mode** — one workflow touches UI/state/api/tests/docs together and layer-first folders are scattering the work.
3. **workspace/monorepo mode** — multiple deployables or reusable packages need explicit top-level separation.
4. **docs-taxonomy mode** — the repo is mostly documentation, runbooks, or knowledge assets and should be organized by reader task and content type.
5. **engine-aware hybrid mode** — the project must honor engine-required folders while still preserving ownership and naming rules.

Return the chosen mode explicitly before proposing folders.

### Step 3: Define the boundary packet
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

Do not stop at a folder tree. Explain **why** each boundary exists.

### Step 4: Apply the repo-type pattern that fits
Use the references for detailed patterns. In the front door, keep only the routing decision:

- **Frontend / meta-framework app** → keep framework routing/layout conventions first, colocate route-specific code, and add feature folders only when `components/` or `hooks/` become dumping grounds.
- **Backend service** → keep framework/module conventions first, then group by domain/module when one workflow keeps crossing controllers/services/schemas/jobs unnecessarily.
- **Fullstack / monorepo** → keep `apps/` + `packages/libs/`, extract shared code only after repeated reuse, and document ownership/public APIs.
- **Docs / ops repo** → organize by user need and document type; separate tutorials, runbooks, reference, and explanation when audiences differ.
- **Game-development repo** → respect engine-required roots and special folders, then add naming and ownership rules for scenes/assets/scripts/tools.

### Step 5: Plan migration only if needed
If the repo already exists, prefer this order:
1. freeze the target vocabulary,
2. pick one hot path or one feature/domain,
3. move new work into the new shape before backfilling old code,
4. add compatibility notes or shims where needed,
5. clean the highest-confusion legacy buckets last.

### Step 6: Guard against junk-drawer patterns
Always call out these failure modes if they appear:
- `shared/`, `common/`, `misc/`, `helpers/`, `utils/` with unclear ownership
- barrels at every folder level
- too many top-level folders without distinct purpose
- packages extracted before a stable public API exists
- docs trees organized around org history instead of reader tasks
- game asset trees that ignore engine/tool constraints
- generated or cache folders treated like first-class source structure

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
**Input:** “Our Next.js repo has `components`, `hooks`, `lib`, and `utils`, and no one knows where new checkout code belongs.”

**Output direction:** Keep App Router defaults, choose feature/domain mode only for high-churn product areas, shrink `components/` to truly shared UI primitives, and route store-boundary questions to `state-management`.

### Example 2: Fullstack monorepo with premature package extraction
**Input:** “We have three apps, six packages, duplicated helpers, and no clarity on what should stay shared.”

**Output direction:** Keep `apps/` + `packages/`, collapse pseudo-shared packages that do not have stable public APIs, define extraction rules, and route generator/task-runner follow-up to `workflow-automation`.

### Example 3: Docs repo with a giant mixed notes tree
**Input:** “Our docs repo has onboarding notes, runbooks, architecture docs, and user help all mixed together.”

**Output direction:** Choose docs-taxonomy mode, separate by reader task and document type, keep runbooks distinct from end-user help, and avoid one catch-all `notes/` bucket.

### Example 4: Unity repo with asset sprawl
**Input:** “Our Unity project has art, prefabs, scenes, tools, and scripts mixed together under `Assets/`.”

**Output direction:** Choose engine-aware hybrid mode, respect Unity special folders, separate scenes/prefabs/scripts/tools/content assets intentionally, and add naming/ownership rules for cross-discipline contributors.

## Best practices
1. Start from framework or engine defaults before inventing custom top-level folders.
2. Organize by what changes together, not just by file type.
3. Extract shared code only after repeatable reuse is obvious.
4. Keep top-level folders few, named, and purposeful.
5. Treat naming and placement rules as part of the design, not optional polish.
6. Prefer incremental migrations over heroic restructures.
7. Document exceptions when the tree cannot fully explain the repo.
8. Respect engine/tooling constraints in game/content repositories.

## References
- [references/repo-shape-decision-guide.md](references/repo-shape-decision-guide.md)
- [references/migration-playbook.md](references/migration-playbook.md)
- [references/repo-type-patterns.md](references/repo-type-patterns.md)
- [Next.js Project Structure](https://nextjs.org/docs/app/getting-started/project-structure)
- [GitHub Well-Architected: Monorepos](https://wellarchitected.github.com/library/scenarios/monorepos/)
- [Diátaxis](https://diataxis.fr/)
- [Unity: Best practices for organizing your project](https://unity.com/how-to/organizing-your-project)
