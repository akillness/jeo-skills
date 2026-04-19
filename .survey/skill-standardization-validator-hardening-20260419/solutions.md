# Solution Landscape: Skill Standardization Validator Hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Keep `awk` + `xargs` and document the bug | Status quo with author-side workaround | Zero code churn | False failures remain; pushes parser limits onto writers | Weakest option |
| Shell-only repair (`awk` + safe trim without `xargs`) | Keep current bash validator, replace quote-parsing trim with whitespace-only normalization | Smallest bounded fix; no new dependency; preserves repo portability | Still not a full YAML parser; should stay focused on current validator scope | Best fit for this run |
| `yq --front-matter=extract` | CLI-native frontmatter extraction | Robust, frontmatter-aware, shell-friendly | New dependency; version/tooling drift risk | Strong later option if shell validator grows |
| Python + PyYAML / `python-frontmatter` | Extract and parse metadata in Python | Reliable multiline/YAML semantics; easy richer validation | Larger stack shift; adds runtime dependency or dual-language maintenance | Good if validator evolves beyond shallow checks |
| Node `gray-matter` / Ruby frontmatter parser | Dedicated content/frontmatter parser in app language | Good in Node/Ruby-native repos; strong edge-case handling | Not aligned with this repo's current validator path | More churn than needed here |
| Ultra-shallow grep-only validator | Only check a few required lines | Maximum simplicity | Gives up useful validation and still risks brittle matching | Acceptable only for extremely narrow schemas |

## Categories
- **Minimal bounded fix:** shell-only repair without `xargs`
- **CLI dependency:** `yq --front-matter=extract|process`
- **Runtime parser:** Python/PyYAML, `python-frontmatter`, `ruamel.yaml`
- **Language-native content parser:** `gray-matter`, RubyMatter/Psych
- **Retreat option:** shallow grep/sed checks for extremely constrained files

## What People Actually Use
In practice, developers usually do one of four things when shell YAML parsing gets brittle:
1. adopt `yq` to stay shell-native,
2. drop into Python/PyYAML,
3. simplify parsing to grep/sed if the structure is tiny,
4. keep shell logic only for boundary detection and let a real parser handle semantics.

This is consistent with upstream docs and public Q&A: `yq` is the usual shell escape hatch, Python is the common general-purpose fallback, and grep-only parsing is treated as a compromise for very simple structures rather than a durable answer.

Sources:
- https://github.com/mikefarah/yq
- https://mikefarah.gitbook.io/yq/usage/front-matter
- https://pyyaml.org/wiki/PyYAMLDocumentation
- https://github.com/eyeseast/python-frontmatter
- https://github.com/jonschlinkert/gray-matter
- https://stackoverflow.com/questions/76850581/reading-yaml-file-in-bash-script-and-running-commands-with-yaml-values-as-param#answer-76850902
- https://stackoverflow.com/questions/64237287/how-to-find-a-yaml-value-from-bash-using-pyyaml#answer-64247604

## Frequency Ranking
1. Python + PyYAML / `python-frontmatter`
2. `yq`
3. Lightweight line-based extraction paired with a parser
4. Node `gray-matter`
5. Ruby frontmatter tools
6. Pure shell semantic parsing

## Key Gaps
- Current repo guidance still treats parser-hostile wording changes as an acceptable workaround instead of repairing the validator.
- Pure shell parsing remains brittle around folded scalars, quotes, and encoding quirks.
- A validator can pass catalog sync while still failing on valid prose-level frontmatter, so evaluator reliability matters independently from discovery-surface correctness.

## Contradictions
- Some skill ecosystems document multiline descriptions while bundled validators still require single-line strings.
- Shell-only validators promise lightweight portability but can become less truthful than the YAML/frontmatter formats they are supposed to check.

## Key Insight
The best bounded improvement is not a full parser rewrite and not another author-side wording rule. It is to keep the current bash validator architecture, remove the `xargs` quote-parsing footgun, and add a regression case so valid multiline descriptions with apostrophes stop failing the fixed evaluation harness. If the validator later grows into semantic rewrites or more complex schema checks, then `yq` or Python becomes the next escalation path.
