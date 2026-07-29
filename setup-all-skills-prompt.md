# jeo-skills — Lightweight Installation Delegation Guide

> **For AI agents:** install the lightweight `jeo-skill` catalog/router first. Do not
> install the full repository unless the user explicitly asks for every skill.

> **Preserve existing work:** add or update selected skills only. Never remove unrelated
> skill directories, reset agent configuration, or install heavy upstream apps/models/MCP
> servers before a selected skill actually needs them.

## Default outcome

The default installation adds one skill and one CLI:

- `jeo-skill`: category browser, relationship index, and selective installer;
- `~/.local/bin/jeo-skill`: a symlink to its Python CLI.

The catalog remains remote/on-demand. Individual skills are installed only after the user
chooses a name, category slice, or curated bundle.

## Step 1 — Check prerequisites

```bash
python3 --version
node --version
npx --version
```

Python 3.9+ runs the lightweight CLI. Node/npx is needed only for `skills add`.

## Step 2 — Install only the jeo-skill router

```bash
npx --yes skills add https://github.com/akillness/jeo-skills \
  --skill jeo-skill --global --agent universal --yes --copy --full-depth

python3 "$HOME/.agents/skills/jeo-skill/scripts/jeo-skill.py" link
jeo-skill doctor
```

If the runtime has a different shared skill root, locate the installed file without
changing other skills:

```bash
find "$HOME/.agents" "$HOME/.claude" -path '*/jeo-skill/scripts/jeo-skill.py' -print 2>/dev/null
```

Then run that file with `python3 ... link`.

## Step 3 — Browse by category

```bash
jeo-skill categories
jeo-skill list --category web
jeo-skill list --category web --subcategory frontend
jeo-skill list --category game --subcategory motion-vfx
jeo-skill list --category cli-tools --interface cli
```

Primary categories are:

- `web`: frontend, backend, design, API, auth, data, testing, accessibility,
  performance, graphics, capture;
- `infrastructure`: deployment, environment, observability, security, cloud/data,
  automation, tooling;
- `game`: client, web, server, design/UI, audio, animation, motion/VFX,
  sprite/image, art resources, storytelling, tooling, QA/performance, release;
- `creative-media`: image, video, motion, audio, presentation, diagram, design,
  capture, storytelling;
- `cli-tools`: developer, AI, media, automation, search, benchmark CLIs;
- `ai-agents`: orchestration, frameworks, skill authoring, evaluation,
  planning/review, discovery, prompting;
- `engineering`: code quality, testing, architecture, documentation, code navigation;
- `research`: academic, web research, data analysis, experimentation, benchmarks,
  intelligence;
- `business`: marketing, support, publishing;
- `utilities`: knowledge, files, Git, workspace, project management, productivity.

## Step 4 — Review overlap before choosing

```bash
jeo-skill related code-review
jeo-skill related environment-setup
jeo-skill related video-motion-previs
```

Relationship groups connect adjacent skills without copying their documentation. Keep
separate skills when the job or runtime differs—for example, human code-review judgment
and the `ocr` CLI. Only exact compatibility aliases should point to a canonical skill.

## Step 5 — Preview and install the narrowest selection

```bash
# No mutation
jeo-skill install --bundle starter --dry-run
jeo-skill install --category game --subcategory audio --dry-run

# Install reviewed selections
jeo-skill install --bundle web-frontend --global --yes
jeo-skill install responsive-design react-best-practices --global --yes
```

Useful curated bundles:

- `starter`
- `web-frontend`, `web-backend`, `web-design`
- `infrastructure-core`
- `game-client`, `game-web`, `game-art`
- `media-video`
- `skill-authoring`
- `cli-core`

A category can contain many skills. Prefer a bundle or subcategory unless the user truly
needs the full category.

## Optional — Explicit full install

Only when the user explicitly says “install every jeo skill”:

```bash
npx --yes skills add https://github.com/akillness/jeo-skills \
  --skill '*' --global --agent universal --yes --copy --full-depth
```

This installs skill documents, not every upstream dependency. Apps, model weights,
language runtimes, MCP servers, and media toolchains remain on-demand according to each
selected skill's instructions.

## Verification

```bash
jeo-skill doctor
jeo-skill categories --json
jeo-skill install --bundle starter --dry-run
npx --yes skills list --global --json
```

Success means:

1. `doctor` resolves a valid catalog and reports the installed skill count/categories;
2. category and subcategory filters return deterministic selections;
3. dry-run prints names and an exact `npx skills add` command without installing;
4. the global skill list contains `jeo-skill`;
5. no unrelated skill was removed and no heavy dependency was installed implicitly.
