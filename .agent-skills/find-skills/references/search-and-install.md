# Search and Install Workflow

Operative guidance adapted from `vercel-labs/skills` commit
`435076e78988e1e6ec40d00b0b1d76bdbbc5419a` (2026-08-18), MIT licensed,
© 2026 Vercel, Inc. Redistributed under MIT with attribution; the full notice
ships as `LICENSE.upstream.txt` in this skill.

## Command surface

| Command | Effect |
|---|---|
| `npx skills find [query]` | search the registry; interactive when query omitted |
| `npx skills find <q> --owner <owner>` | scope the search to one GitHub owner |
| `npx skills add <owner/repo@skill>` | install one skill |
| `npx skills add <owner/repo> --skill <name>` | install by explicit name |
| `npx skills update` | update installed skills |
| `npx skills init <name>` | scaffold a new skill locally |

## Flags that change blast radius

| Flag | Effect | Approval |
|---|---|---|
| `-g` / `--global` | writes user-level, affects every project | separate |
| `-y` / `--yes` | skips prompts *and* the security summary | separate |
| `--agent <runtime>` | targets one runtime (`claude-code`, …) | routine |
| `--copy` | vendors files instead of linking; stops tracking upstream | note it |

`-g` and `-y` are independent risks. "Install it" is not consent for either.

## Name resolution

`--skill <name>` resolves against the `name:` field in a skill's YAML
frontmatter, **not** its directory name. Both can differ:

```
repo:        Leonxlnx/taste-skill
folder:      skills/taste-skill/
frontmatter: name: design-taste-frontend
installs as: design-taste-frontend
```

Practical consequence: browsing the GitHub tree for a folder that matches the
requested `--skill` value can produce a false "this skill does not exist"
conclusion. Confirm by running the install into a scratch directory, or by
reading the frontmatter of candidate folders, before telling a user their
command is wrong.

## Search technique

1. Check the [leaderboard](https://skills.sh/) first — install counts rank the
   battle-tested options ahead of the long tail.
2. Use two-word domain-plus-task queries: `react performance`, `pr review`,
   `changelog`.
3. Try synonyms before giving up: `deploy` / `deployment` / `ci-cd`.
4. Scope with `--owner` when the user already trusts a publisher.

Common domains and query starters:

| Domain | Queries |
|---|---|
| Web | react, nextjs, typescript, css, tailwind |
| Testing | testing, jest, playwright, e2e |
| DevOps | deploy, docker, kubernetes, ci-cd |
| Docs | docs, readme, changelog, api-docs |
| Quality | review, lint, refactor, best-practices |
| Design | ui, ux, design-system, accessibility |

## Install placement

Where files land depends on flags and detected runtimes:

- project-level (default) → the repo's per-agent skill directory
- `-g` → the user-level directory, shared across projects
- `--agent <runtime>` → only that runtime's directory
- `--copy` → real files rather than links; upstream updates stop arriving

Know which of these applied before attempting removal or debugging a "skill not
found" report.

## Verifying an install landed

```bash
npx skills add <owner/repo> --skill <name> --agent claude-code --yes --copy
find .claude/skills -maxdepth 2 -name SKILL.md
head -5 .claude/skills/<name>/SKILL.md
```

Confirm the frontmatter `name:` matches what was requested. The CLI's
"Installation complete" line reports its own action, not the file's suitability.

## When nothing fits

State that plainly, offer to do the task directly, and route authoring to
`write-a-skill`. `npx skills init <name>` scaffolds a local skill, but writing a
good one is a separate job with its own skill.
