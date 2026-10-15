# Design Taste: source evidence

## Identity and observation

- Candidate supplied: `github.com/madebymustafa/…`, labeled Design Taste.
- Resolved `full_name`: `madebymustafa/design-taste`.
- Official repository: <https://github.com/madebymustafa/design-taste>.
- Immutable observed revision: `c4a6bff0871eb4b15371b0e7d2751628b0ed4608`.
- Observation UTC: `2026-10-15T16:23:57Z`.
- Public GitHub search: `gh api --method GET search/repositories -f q='user:madebymustafa design taste' -f per_page=10`.
- Search returned one public match, `total_count=1`, `incomplete_results=false`.
  No guessed repository suffix or authenticated/private material was needed.
- Recursive Git tree at this SHA returned `truncated=false`.

## Selected inspected coordinates

All links below are immutable. Inspection was source-only; no upstream code,
installer, screenshots, demos, servers or builds were executed.

| Source | Coordinates and established evidence |
| --- | --- |
| [README.md](https://github.com/madebymustafa/design-taste/blob/c4a6bff0871eb4b15371b0e7d2751628b0ed4608/README.md) | `The catalog`, `How they compose`, `Install (5 seconds)`: core, ten genre packs and craft/code skills; installer targets multiple agent directories. Entire README read. |
| [skills/design-taste/SKILL.md](https://github.com/madebymustafa/design-taste/blob/c4a6bff0871eb4b15371b0e7d2751628b0ed4608/skills/design-taste/SKILL.md#L22-L109) | L22 design read; L38 contextual default avoidance; L55 typography; L66 color; L74 layout; L82 surface; L89 motion; L96 pre-flight. Entire file read. |
| [skills/corporate-trust/SKILL.md](https://github.com/madebymustafa/design-taste/blob/c4a6bff0871eb4b15371b0e7d2751628b0ed4608/skills/corporate-trust/SKILL.md) | Sections 1–6: system sans, restrained blue, conventional grids, evidence and tables, nearly static motion. Entire file read. |
| [LICENSE](https://github.com/madebymustafa/design-taste/blob/c4a6bff0871eb4b15371b0e7d2751628b0ed4608/LICENSE) | Entire MIT license read; full text below. |

The README identifies these genre names: `editorial-minimal`,
`brutalist-industrial`, `quiet-luxury`, `dark-tech`, `playful-color`,
`retro-print`, `japanese-minimal`, `neo-brutalism`, `corporate-trust` and
`cinematic-motion`. This is a discovery index, not an inspection claim for all
packs. Read only the selected pinned pack before using it. Craft names in the
README likewise require their own source read when selected.

## Original operator interpretation

This operator selects one identity and inspects only needed craft references.
It preserves brand, semantic structure and functioning product behavior.
`corporate-trust` demonstrates why applying every core taste rule mechanically
would be wrong: its system typography and conventional structure are intentional.
The local operator adds explicit reduced-motion, teardown and verification
boundaries; these are operating safeguards, not a claim that every upstream pack
already implements or tests them. No fonts, graphics, examples or source skills
are bundled into this operator. Fonts/assets require their own rights review.

Reading pinned public content does not authorize running `scripts/install.sh`,
copying into global skill paths or adding dependencies. If installation is
requested later, inspect the installer and destination collisions first.
Upstream `skills/design-taste/SKILL.md` uses the same skill name as this operator.

## Comparison and supersession decision

Compared local `design-taste-frontend/SKILL.md`, `web-design/SKILL.md` and
`react-bits/SKILL.md` through the required workspace codemode reader.

- Keep `design-taste-frontend`: it bundles a different author/repository,
  `Leonxlnx/taste-skill` at `ccbc15639c97057cbfcf32ecebc38ef716e4bb37`,
  and owns the explicit three-dial/default anti-generic workflow. This operator
  deliberately activates on Mustafa or his named genre collection instead.
- Keep `web-design`: it routes MengTo's visual recipe families rather than
  operating this genre catalog. A similar aesthetic is not duplicate provenance.
- Keep `react-bits`: animated component selection/integration is a different job.
- Recommend no retirement. Similar vocabulary does not establish migration,
  lineage or a drop-in replacement.

The observed HEAD commit, dated `2026-08-15T02:59:07Z`, adds only `SECURITY.md`
(25 lines), message `Add SECURITY.md — private reporting path and disclosure policy`.
That is policy maintenance, not a newer design engine or substantive core rewrite.
The `skills/design-taste/SKILL.md` path history returned one content commit,
`85843db453fa7b8179a434577e27fdf605ef66ea`, dated `2026-08-15T00:55:23Z`.
No newer-replacement claim is made, including against Leonxlnx's separate source.

## Complete license observation

The entire `LICENSE` at the observed pin reads:

```text
MIT License

Copyright (c) 2026 Mustafa

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

MIT is the observed upstream source license, not a certification of third-party
asset permissions, accessibility, measured performance or design outcomes.
Behavioral fixtures in this folder are proposed checks and were not executed.
