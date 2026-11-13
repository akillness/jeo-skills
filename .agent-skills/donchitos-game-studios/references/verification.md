# Package verification record

## Executed checks

The following are package/static results, not an upstream game run or measured
agent improvement. The source pin is `abc0de79d6ceb0b5d7aa693945849b3937afbe6a`;
the evaluator pin is `12b387f7a62b5f3e0de9eff392a3f6b7e952f2c2` (0.8.0).

| Check | Observed result |
| --- | --- |
| `python3 -B -m unittest discover -s scripts -p 'test_donchitos_game_studios.py' -v` | 18 tests passed: synthetic source drift, missing source, unsafe paths, secret-path rejection, symlink/FIFO/size/manifest failures, no tool execution, baseline integrity, catalog selection and local links |
| `preflight.py --repo /private/tmp/claude-code-game-studios-eval --json` | Twelve selected public-file hashes matched; runtime, whole-revision and tool-version verification remain false |
| `validate_skill.sh .agent-skills/donchitos-game-studios` | No errors or warnings |
| `validate_catalog_sync.py --repo-root <checkout>` | 433 live and manifest skills; no drift |
| `validate-catalog-projections.py` / projection generator `--check` | 433 skills and synchronized projections |
| `repair-skill-frontmatter.py --check` | 433 loadable documents match the manifest |
| `flatten_skills.py --dry-run` | Completed without moving files |
| Isolated-HOME router installation from the local source, npm offline mode | All guide package files copied byte-identically; no upstream hooks or template runtime installed |
| MEX scaffold audit | 0 errors; two pre-existing unreferenced-pattern warnings remain. The isolated worktree has no graph index; no graph freshness is claimed |
| NVIDIA `quality-check` with the default 70-point threshold | 92.8 / A, `overall_passed=true`, publication `incomplete` |

The black-box helper tests use trap executables to detect accidental execution.
The standalone helper reuses the existing `nvidia-skill-evaluator` package's secure
selected-file preflight contract, rather than inventing a different traversal policy.

## Failures retained and corrected

1. The discovery-document test caught that setup linked support files but did not
   directly link the new SKILL.md. The setup entry now includes that front door;
   the same test passed after the fix.
2. The first local package name, `claude-code-game-studios`, received a quality
   score of 80.5 but failed the evaluator's reserved-name rule. The package was
   renamed to `donchitos-game-studios`; no evaluator thresholds or gates changed.
3. Existing committed README count sections contained conflict markers around
   identical generated text. Only those equivalent duplicate paragraphs/markers
   were removed; category tables were regenerated from the manifest.

4. MEX audit caught malformed scaffold frontmatter caused by my multi-directive
   edit payload. I corrected the placement using one anchored edit per call and
   checked all changed Markdown for leaked edit directives. The final audit has
   no errors; the two existing pattern-reference warnings above remain.

## Remaining evaluator findings: deliberately not hidden

- Missing recommended top-level `version`, `metadata.author` and `metadata.tags`.
  Agent Skills requires name/description, and this repo centralizes taxonomy/tags
  in the catalog. The package retains `metadata.version` and source provenance.
- Non-doc JSON in references: `quality-baseline.json`. The baseline and selected
  source JSON follow existing repository provenance conventions.
- Description exceeds the evaluator's 50–150-character recommendation (665), but
  is below the specification's 1024-character maximum. Named-project triggers and
  explicit route-outs are intentional; their actual routing quality is unmeasured.

These findings remain in the report. The score is for this operator package, not
an improved score for the original 78 skills, and is not compared as behavioral
lift against their mean. The full local JSON report was written under
`/private/tmp/donchitos-game-studios-quality/`; temporary paths are not durable
public artifact storage.

## Not executed

No upstream game/studio workflows, Claude session, hooks, browser or engine tests,
security scanner suite, Tier 2 overlap analysis, Tier 3 paired runs, paid provider
calls or model-driven execution of the eight authored eval cases were performed.
Publication `incomplete` is preserved. The helper's match covers twelve selected
files only and does not establish the entire checkout's integrity.
