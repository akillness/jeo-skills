# Query: hourly survey noise-gate evolution

## Prior knowledge referenced
- graphify-out/memory/query_20260424_143124_hourly_후보_탐색에서_어떤_기존_스킬을_우선_개선해야_하는가.md
- graphify-out/memory/query_20260424_154230_hourly_후보_탐색에서_survey_스킬의_반복_품질을_높이기_위해_필수로_추가할_규칙.md

## This run synthesis
- Added stronger negative gate in survey skill docs: drop assessment/homework-only hits and unknown-license candidates unless exception rationale exists.
- Added eval coverage for noisy keyword lanes.
- Added new utility skill: ccpi-marketplace for CLI plugin-marketplace operations.

## Evolution note
Previous runs focused on keyword coverage + rescue fallback; this run adds quality filtering to reduce low-transfer false positives while preserving provenance.
