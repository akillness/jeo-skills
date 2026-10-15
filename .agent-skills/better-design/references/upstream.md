# Better Design upstream evidence

## Identity and observation

- Candidate: “Better Design”, truncated `github.com/marvkr/better-…`.
- Verified full_name: `marvkr/better-design`.
- Official repository: https://github.com/marvkr/better-design
- Product homepage: https://better-design.com
- Immutable commit: `e146625f3041ef8089a2013587435fc763dc3b15`.
- Commit timestamp: `2026-09-22T18:58:47Z`.
- Observation UTC: `2026-10-15T16:26:03Z`.
- Source tree endpoint: https://api.github.com/repos/marvkr/better-design/git/trees/e146625f3041ef8089a2013587435fc763dc3b15?recursive=1
- Complete tree response: `truncated: false`, 6518 entries. Root LICENSE exists.

## Resolution method

Public GitHub search was executed:

```text
gh api -X GET search/repositories -f q='better in:name user:marvkr'
```

It returned `better-design`, `better-slack` and `better-design-internal-tools`.
The selected repository describes the design MCP and shadcn registry; public metadata
links better-design.com, reports non-archived state and MIT. Its README describes the
same product and installable skill. This official metadata plus pinned README resolves
the candidate without inferring a suffix or confusing it with the internal-tools examples.

## Selected exact source coordinates

- [README.md](https://github.com/marvkr/better-design/blob/e146625f3041ef8089a2013587435fc763dc3b15/README.md): complete file, especially “How it works”, “What the MCP gives your agent”, “Available Design Systems”, “Setup”, “Connect via Remote MCP manually”, and “Project Structure”.
- [skills/better-design/SKILL.md](https://github.com/marvkr/better-design/blob/e146625f3041ef8089a2013587435fc763dc3b15/skills/better-design/SKILL.md): complete file; “Connect”, “Respect trust boundaries”, “Follow the interface workflow”, “Start new interface builds with a system”, and “Keep the MCP authoritative”.
- [registry/linear/button.json](https://github.com/marvkr/better-design/blob/e146625f3041ef8089a2013587435fc763dc3b15/registry/linear/button.json): top-level `name`, `type`, dependency arrays, `cssVars` light-only structure, `files[].path` and complete embedded button source. CSS variable values were sampled, not an exhaustive palette audit.
- [scripts/transitions-src/modal-transition.tsx](https://github.com/marvkr/better-design/blob/e146625f3041ef8089a2013587435fc763dc3b15/scripts/transitions-src/modal-transition.tsx): entire file; `MODAL_CSS`, `useStyles`, `readMs`, `focusables`, `ModalTransition`, closing timer effect, double-rAF entry effect and document keydown/focusin effect with cleanup.
- [LICENSE](https://github.com/marvkr/better-design/blob/e146625f3041ef8089a2013587435fc763dc3b15/LICENSE): complete root file fetched through public contents API; reproduced below.

No application package or hosted MCP implementation was present in the inspected tree
paths: the complete tree's package/server/mcp path query returned `tests/package.json`
and no server/mcp paths. Public source provides registry/component material and a skill,
not enough implementation evidence to independently verify hosted tool semantics,
auth enforcement, runtime behavior, uptime, price or the installer implementation.

## Tool-name and access drift

The README's example generation advertises:

```text
resolve-design-system
get-design-system-docs
get-ui-principle
get-review-rules
resolve-icon-library
search-icons
```

The newer pinned SKILL.md instead names capabilities including:

```text
find-design-system
get-design-system-kit
get-ux-principle
find-icon-library / find-icons / install-icons
check-comprehension / review-ui-code / inspect-spacing
create-design-system / get-design-system-status
extract-design-system / extract-from-url
```

These are documented names, not observed live tools or verified aliases. The operator
requires runtime discovery/schema inspection before constructing calls; absence must
remain explicit. It does not infer argument shapes from prose or fabricate tool results.
The README states installer setup requires no account but manual remote MCP setup
requires an API key at better-design.com/settings. Distinguish these connection paths.
The documented hosted endpoint is `https://better-design.com/api/mcp`; no request to
that service was made in this pass. Never store API keys in a skill or prompt.

## Registry contract and bounded integration

The README documents this mutable public item URL:

```text
https://www.better-design.com/registry/linear/button.json
```

It documents `npx shadcn@latest add <registry-url>` as installation, not a read-only
fetch. The inspected pinned button is `registry:ui`, writes
`components/ui/button.tsx`, depends on `@radix-ui/react-slot` and
`class-variance-authority`, and declares `registryDependencies: ["utils"]`.
Its embedded `Button` forwards a ref and switches to Radix Slot for `asChild`;
`buttonVariants` includes default, secondary, outline, ghost, destructive and link,
plus sm/default/lg/icon sizes. Focus-visible rings and disabled classes appear in
source; those classes are not a verified conformance claim. The payload also supplies
light-only CSS variables, so a single component install may change application tokens.
The operator therefore compares destinations, dependencies, aliases and token diffs
before an approved installation. The source pin does not freeze the hosted registry URL.

The latest commit adds nine transitions.dev ports across 31 systems. Its message names the
bundle exports `P1Bell`, `P2Menu`, `P3Panel`, `P4Resize`, `P5IconSwap`, `P6TextSwap`,
`P7Modal`, `P8PageSlide`, `P9Number`, while the inspected source modules
have descriptive component names. Inspect the exact bundled payload before relying
on either export shape; this pass inspected `ModalTransition` source, not all 31 bundles.

The inspected modal disables transitions under `prefers-reduced-motion`, scopes its
CSS duration variables, installs a style element once per document, and cleans up
closing timers, animation frames and document listeners in effect returns. It attempts
focus containment/return and respects already-handled nested Escape. Those mechanisms
remain source facts; test close/reopen, unmount, hidden focusables and assistive-tech
behavior in the real host before claiming accessibility. The persistent style element
is deduplicated by a DOM query rather than removed on unmount. Profile actual usage
before claiming performance benefits; nine effects need not all be mounted or animated.

## Canonical ownership and history decision

Create a narrow independent `better-design` operator for this named MCP/registry.
Do not copy the upstream skill's universal “always active” scope or its claim of authority
over all generic frontend skills. Existing local `design-system` remains canonical for
shared tokens and primitive APIs, and `web-design` remains the recipe-selection router.
`ui-component-patterns` is absent at this base and is not resurrected as a competing owner.
None of those owners manages this service's schema drift, hosted-connection consent or
registry file/token collision checks. No adjacent retirement is justified.

Substantive history inspected through public commit listing:

- `d5e9557362f9` (`2026-08-20`) publishes the MCP skill.
- `63360420f964` (`2026-08-20`) hardens external-content trust boundaries.
- `e146625f3041` (`2026-09-22`) adds transitions components; this is component substance, not a reason to replace shared-system governance.
- `703bbcace9dd` trims README/setup/structure; `73d125720ebc` installs another skill. Documentation/chore timestamps do not establish a new owner.
- Local `82faddac` hardens design-system structure; `1b602186` introduces the web-design pack. Their inspected responsibilities remain distinct even though upstream commits are newer.

No shared manifest, existing owner or retirement was edited by this source-author lane.

## License observation: complete root LICENSE

The entire root file is MIT, with the following copyright and permission notice.
Preserve it when copying substantial source. The repository-wide notice does not
prove separate licensing for every font, icon, brand identity, generated output,
third-party transition provenance or hosted service. The modal source credits
Jakubantalik/transitions.dev as MIT; its separate license was not independently audited
here, and no upstream component code was vendored into this skill.

```text
MIT License

Copyright (c) 2026 Marvin Kaunda

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

Source inspection only: no upstream project, build, installer, server, MCP tool,
registry install, account, browser profile or paid service was executed/accessed.
Behavioral eval fixtures are proposed and not run. Local file/JSON/skill validation
is structural evidence only, not a hosted MCP or visual quality benchmark.
