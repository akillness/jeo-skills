# Superdesign upstream evidence

## Identity and observation

- Candidate: “Superdesign Skill”, truncated `github.com/superdesigndev…`.
- Verified full_name: `superdesigndev/superdesign-skill`.
- Official repository: https://github.com/superdesigndev/superdesign-skill
- Product homepage: https://superdesign.dev
- Immutable commit: `f9f05cd988c247dce6c072eaf9ac6b162f2ffc4b`.
- Commit timestamp: `2026-08-21T05:23:23Z`.
- Observation UTC: `2026-10-15T16:26:03Z`.
- Source tree endpoint: https://api.github.com/repos/superdesigndev/superdesign-skill/git/trees/f9f05cd988c247dce6c072eaf9ac6b162f2ffc4b?recursive=1
- Tree response reported `truncated: false`; LICENSE was present at repository root.

## Resolution method

Public GitHub repository search was executed, not an inferred suffix lookup:

```text
gh api -X GET search/repositories -f q='superdesign in:name user:superdesigndev'
```

It returned `superdesign`, `superdesign-skill`, `superdesign-prompts` and
`superdesign-extension`. The selected repository's description explicitly identifies
the design skill, its README links superdesign.dev, and package.json identifies the
same GitHub repository. README “What is Superdesign?” explicitly distinguishes the
archived legacy IDE extension `superdesigndev/superdesign` from this maintained skill.
Public repository metadata confirmed the selected repository is not archived and
reports MIT. This official-source cross-check resolves the competing names.

## Selected exact source coordinates

Every link is pinned; headings, symbols and ranges identify inspected material.

- [README.md](https://github.com/superdesigndev/superdesign-skill/blob/f9f05cd988c247dce6c072eaf9ac6b162f2ffc4b/README.md): “What is Superdesign?”, “Install”, “Tooling overview”, “Overall SOP”, “Quick reference”. Read in full.
- [package.json](https://github.com/superdesigndev/superdesign-skill/blob/f9f05cd988c247dce6c072eaf9ac6b162f2ffc4b/package.json): complete file; `name: superdesign-dsh`, `version: 0.6.0`, repository URL, dsh bundle entry and MIT field. This is not the CLI implementation or a pinned CLI package version.
- [skills/superdesign/SKILL.md](https://github.com/superdesigndev/superdesign-skill/blob/f9f05cd988c247dce6c072eaf9ac6b162f2ffc4b/skills/superdesign/SKILL.md): “Core scenarios”, “Step 1.5”, “Init Files”, “Superdesign CLI”, “Surface the canvas URL”. Selected workflow and approval implications inspected; no upstream instructions executed.
- [references/SUPERDESIGN.md L25–78](https://github.com/superdesigndev/superdesign-skill/blob/f9f05cd988c247dce6c072eaf9ac6b162f2ffc4b/skills/superdesign/references/SUPERDESIGN.md#L25-L78): real render branch, context dependency tracing, payload guidance and faithful baseline.
- [references/SUPERDESIGN.md L329–353](https://github.com/superdesigndev/superdesign-skill/blob/f9f05cd988c247dce6c072eaf9ac6b162f2ffc4b/skills/superdesign/references/SUPERDESIGN.md#L329-L353): replace versus branch; deterministic correction versus generation.
- [references/SUPERDESIGN.md L400–429](https://github.com/superdesigndev/superdesign-skill/blob/f9f05cd988c247dce6c072eaf9ac6b162f2ffc4b/skills/superdesign/references/SUPERDESIGN.md#L400-L429): command contract, line-range grammar, single-prompt trap, CLI init distinction, actual image references and returned URLs.
- [references/RESUME.md L1–141](https://github.com/superdesigndev/superdesign-skill/blob/f9f05cd988c247dce6c072eaf9ac6b162f2ffc4b/skills/superdesign/references/RESUME.md#L1-L141): schemaVersion 1, context fingerprints, safe paths, target selection, warm versus incremental refresh and recorded draft history.
- [LICENSE](https://github.com/superdesigndev/superdesign-skill/blob/f9f05cd988c247dce6c072eaf9ac6b162f2ffc4b/LICENSE): entire root file retrieved through public GitHub contents API; complete text below.

## Operational facts and caveats

The current upstream skill uses `npx --yes @superdesign/cli@latest`, whereas README
installation examples also describe a global CLI install. Both execute external code;
neither was run. An immutable documentation pin does not pin that mutable runner.
Require separate installation/execution consent and verify help in an authorized session.

Real-codebase UI initialization requires non-empty `components.md`, `layouts.md`,
`routes.md`, `theme.md`, `pages.md`, `extractable-components.md` under `.superdesign/init/`.
Those are agent-authored context files; CLI `init` installs skill files and is not repo
analysis. Before authoring the six files, load the pinned
[INIT.md](https://github.com/superdesigndev/superdesign-skill/blob/f9f05cd988c247dce6c072eaf9ac6b162f2ffc4b/skills/superdesign/references/INIT.md)
procedure. That reference is a follow-on pointer, not claimed as inspected in this pass.
For non-UI surfaces, load their pinned scenario references before constructing commands.

Resume state is untrusted cache data, not stored upload consent. Whole-file SHA-256
fingerprints accompany exact context arguments, including line ranges. Invalid paths
or IDs invalidate the target before file access or service calls. Changed fingerprints
alone do not force cold rediscovery. Selected branch and version are explicit state.

The current command reference is more specific than README's older replica-first SOP.
Use the pinned skill/reference path for warm state and actual source-file context.
`create-design-draft` and replace take one prompt; branch handles alternatives;
`execute-flow-pages` extends an existing design. The approximately 900-line guidance
is upstream payload advice, not a measured hard API capacity. A 400 is not permission
to fabricate a stripped-down target. Returned HTML and URLs are generated artifacts;
they do not prove responsive, accessible or production-integrated behavior.

The original operator intentionally adds permission gates before the upstream runner,
login, source/image transfer and paid generation. It does not import upstream directives
to automatically log in, choose another model, or use a service after failure. The active
session provider/model constraints take precedence. Product auth and data behavior,
loading/error states, a11y, reduced motion and resource lifecycle remain integration work.
No quality adjective in the upstream README is adopted as a verified outcome.

## Canonical ownership and history decision

Retain this independent skill as the narrow Superdesign service/canvas operator.
Retain local `design-system` as canonical shared foundations and primitive API governance;
retain `web-design` as the MengTo recipe router. They neither drive this CLI nor own its
resume IDs, external transfer boundaries or draft-selection state. `ui-component-patterns`
is absent at the inspected base; do not recreate it or add a dangling route-out.

History observations separate substance from packaging:

- `f2cfa23eaf4a` adds the complete presentation workflow; `093eb9ec62eb` changes default prompt limits.
- `addd899490e1` bumps plugin version to 0.6.0; it is packaging history, not independent evidence of a better design method.
- Latest `f9f05cd988c2` merges the prompt-limit work; recency alone does not supersede adjacent local owners.
- Local history includes `82faddac` hardening design-system structure and `1b602186` introducing the web-design recipe pack. Their inspected contracts, not dates, determine retained ownership.

No retirement or replacement of adjacent tooling is justified. The replacement distinction
is upstream skill versus legacy Superdesign IDE extension, not this repo's design-system.
No shared manifest or existing skill was edited by this source-author lane.

## License observation: complete root LICENSE

MIT permits reuse with preservation of its copyright and permission notice for copies
or substantial portions. Hosted service access, account terms, generated assets, third-party
brands and model services are not licensed or verified merely by this repository notice.
These instructions are original; upstream source was inspected, not vendored.

```text
MIT License

Copyright (c) 2026 Superdesign (superdesign.dev)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Validation boundary

Source inspection only. No upstream CLI, dependency installation, installer, login,
account inspection, service call, design generation or app execution occurred.
Local structural validators do not convert the proposed behavioral fixtures into runs.
