# Contributing

Help make 3D explanations more creative, accurate, and inspectable. The catalog currently has recipes in all 24 registered directions, but useful subject depth matters more than filling a quota or claiming that a populated direction is complete.

The project is [MIT licensed](LICENSE), and contributions are accepted under the same license. Before submitting material, confirm that you have the right to contribute it under MIT and make any restriction on third-party material explicit. Do not assume third-party assets or source passages can be redistributed.

## Choose a focused change

- Correct a factual claim, confusing instruction, or broken interaction contract.
- Add a recipe that solves a distinct visualization task.
- Improve a source locator, reproducible check, or compatibility observation.
- Improve English documentation or contribute a properly attributed demo.

Read [data contribution guidance](docs/contributing-data.md) before changing catalog content. Keep authored prose, prompts, captions, and contributor notes in English. Preserve historical media honestly; do not relabel it as new evaluation evidence.

## Prepare the change

1. Edit the canonical files under `skills/3dviz-pro-max/`; do not hand-edit generated distribution copies.
2. Keep the change narrow. Use stable record IDs and update revisions according to the actual record contract.
3. For dataset changes, add a sanitized log under `evidence/dataset-changes/<change-id>/events.jsonl`. Include the affected IDs and revisions. A spelling-only correction needs only a change event, not invented research. `python3 scripts/evidence-log.py snapshot` before editing a record and `… propose` after bumping its revision writes the snapshot and the change/curation events for you; `source-read` and `claim-checked` log the matching research events.
4. Run the repository checks relevant to your change. Report the exact checks and results; distinguish structural validation from rendered behavior and factual verification.
5. Explain the user-visible effect, evidence, and unresolved limits in the pull request. Include screenshots or recordings when appearance or interaction changes.

Use Python's standard library for small developer helpers where practical. If Node tooling is needed, use pnpm. Do not add a renderer dependency just to edit knowledge records.

## Evidence and review

Follow the [public evidence policy](evidence/README.md). New factual meaning requires source locators and a stated verification scope. Promotion to behavior-tested requires actual observations tied to an artifact revision. Record failed, unavailable, and skipped checks explicitly.

Review findings are evaluated against the actual model, artifact, and evidence. Explain disagreements with concrete sources or reproducible checks. Never manufacture a pass to satisfy a status label.

Keep raw research and private captures in ignored local storage. Do not commit credentials, personal conversations, machine-specific paths, full copyrighted sources, or internal planning files. Public logs contain concise decisions and observations, not private reasoning traces.

Security-sensitive reports follow [SECURITY.md](SECURITY.md). Ordinary bugs can include a minimal reproducer, affected record IDs, host/runtime versions, and the observed versus expected behavior.

## Shared scripts and collection scope

Experiment workers must reuse the existing [shared tooling](docs/shared-tooling.md). Propose missing capabilities to the main agent before creating or changing reusable automation; do not add local helper-script copies. Shared scripts preserve common inputs, assumptions, validation and evidence behavior across experiments.

During collection, escalate newly discovered domains or substantially new topics to the main agent with overlap, value, primary sources and a bounded proposal. The main agent records an accept, merge, defer or reject decision before assigning additional collection work. See [agent working rules](AGENTS.md).

## Local checks

From the repository root:

```sh
python3 scripts/validate.py
python3 scripts/build-index.py --check
python3 scripts/check-docs.py
python3 scripts/check-retrieval.py
python3 -m unittest discover -s tests
python3 scripts/package.py
```

After changing catalog data, regenerate the index with `python3 scripts/build-index.py` before checking it. For scene changes, run `pnpm build` from `examples/`, then inspect the affected interactions in a browser. A successful build alone does not establish visual correctness.

These checks are unchanged by screen capture: `skills/3dviz-pro-max/scripts/capture.py` needs an optional Playwright install, is never required by the checks above, and its own unit tests run without a browser. See [installation](docs/installation.md).
