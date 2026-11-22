# Retrieval observations

These are local lexical observations, not held-out semantic evaluation. The regression fixtures preserve known intents; their success does not measure arbitrary prompt understanding.

## Shared profile expansion

Against 72 recipes and 94 knowledge records, five of six exploratory queries returned the intended shared profile within the top three family-filtered results. The five successful queries are recorded in `pilot-cases.json`.

The query `display scientific values without lighting changing their colors` did not return `knowledge.shared-unlit-quantitative-encoding` within the top three lighting-profile results. It instead returned studio, enclosure and comparison lighting profiles. The catalog uses vocabulary such as *unlit*, *colour*, *value* and *legend*; lexical lookup does not interpret the negation or bridge every word form. This miss is retained here rather than counted as a passed regression.

Agents should inspect applicability and rephrase a query with domain vocabulary when candidates miss the intent. Directly reading the family index is another fallback. Scores remain lexical rankings, not confidence or a restriction on model capability. Broader paraphrase evaluation and query expansion remain future retrieval work, separate from authored coverage.

## Completed depth-wave checkpoint

With 144 recipes and 262 knowledge records, all 68 authored known-intent cases pass. The wave adds 23 regressions across geometry, lighting, output, domain validation, conditional reasoning and the new recipes. These queries were selected from known subjects and inspected against candidates; they are not a held-out sample.

The earlier lighting/colour paraphrase miss remains an unresolved observation. More data and passing these regressions do not establish arbitrary-prompt recall or a measured ranking improvement. No search weights were tuned to hide that miss.

## Default collection and alias expansion

`search.py` and `check-retrieval.py` now cover both collections by default (`--collection all`); the knowledge collection (416 records at the time of writing) was previously invisible to an unflagged query. The manifest gained `search.query_aliases`, a validated phrase table (word-boundary, casefolded, at most four tokens per phrase) whose matched tokens are added to the query and reported back as `expanded_terms`. `defaults.values.feeling` became a search field, so authored feeling words are reachable.

Widening the default demoted exactly one legacy case. `gear tooth ratio` → `recipe.coupled-gears` now ranks behind `knowledge.gear-mechanism` and a ratio validation profile, which share that vocabulary honestly. The case is pinned with `"collection": "recipes"` and a note rather than deleted, and the recipe's search fields were left alone because tuning another family's record to win one case would be fitting the data to the fixture. **One pinned case** in total.

Twelve cases were added for craft vocabulary (styles, lighting moods, the new camera and sun-arc records, and the Blender handoff tooling records), taking the file to 241 authored cases, all passing. This measures authored intents against the current catalog. It is not held-out evaluation, alias expansion is lexical rather than semantic, and `expanded_terms` is printed so an over-firing alias is visible rather than hidden in a score. The earlier lighting/colour paraphrase miss remains unresolved: no alias was added to paper over it.
