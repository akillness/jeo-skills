# Impeccable: source evidence

## Identity and observation

- Repository: [pbakaus/impeccable](https://github.com/pbakaus/impeccable), default branch `main`,
  GitHub-reported license `Apache-2.0`.
- Audited commit: [`02523aec3e4c4580102d996d1b6a71fbe062e03f`](https://github.com/pbakaus/impeccable/tree/02523aec3e4c4580102d996d1b6a71fbe062e03f),
  committed `2026-10-29T18:41:44Z` ("Fix: read surface-brief targets from cwd (#1222) (#1227)").
- Observed `2026-10-30` through `gh api repos/pbakaus/impeccable/commits/main` and a partial,
  sparse clone checked out at that SHA. Recursive tree listing returned `truncated=false`.
- Versions at the pin: npm package and skill `4.8.0` (`package.json`, built `SKILL.md`
  frontmatter); engine `0.1.18` (`ENGINE_VERSION`, `skill/scripts/VERSION`).
- Selected file SHA-256 values and commit-pinned URLs: [`source.json`](source.json). They are
  selected-file evidence, not a whole-revision, dependency, runtime or security attestation.

No upstream installer, launcher, engine, npm package, hook, browser helper or live server was
executed for this audit, and no engine binary was downloaded.

## What upstream is

- `skill/` is the source of truth: `SKILL.src.md` (templated with `{{scripts_path}}`,
  `{{command_prefix}}`), 41 `reference/*.md` playbooks, `scripts/` (POSIX and `.cmd` launchers,
  `VERSION`, `engine-checksums.txt`, `command-metadata.json`, live-mode browser JS, font index),
  four subagent prompts, and a Hermes hook plugin. Per-tool builds are committed at the repo root
  (`.claude/`, `.agents/`, `.cursor/`, `.omp/`, …; 20 project skill folders).
- Every `impeccable <verb>` runs in a self-contained Rust engine built from `crates/`; the
  launcher resolves or downloads it (see [install and safety](install-and-safety.md)).
- The skill is one router: setup (`impeccable context`, playbook load, craft floor before edits),
  four surface modes, 24 command rows (`craft` deprecated) plus `pin`, `hooks` and `doctor`.
- The detector registry holds 62 built-in rules; rule packs can register more ids.

## How this operator was derived

| This folder | Derived from | Treatment |
|---|---|---|
| `SKILL.md` | `SKILL.src.md`, `README.md` | original operator text; routing, approval gates, collision handling are local |
| `references/commands.md` | Commands table, `command-metadata.json`, per-command playbook headers | command list and categories match upstream; descriptions are summaries |
| `references/method.md` | `critique.md`, `audit.md`, `polish.md`, `init.md`, `document.md`, `SKILL.src.md` | paraphrased method: modes, scoring, bands, severity, personas, cognitive load |
| `references/craft-floor.md` | `craft-floor.md` | paraphrased verify/refuse lists |
| `references/detector.md` | `cli.rs`, `registry.rs`, `findings.rs`, `hooks.md` | CLI facts and rule table from source; command routes are local heuristics |
| `references/install-and-safety.md` | `README.md`, `scripts/impeccable`, `hooks.md`, `live.md` | effects and approvals restated for this catalog |
| `scripts/doctor.py` | launcher candidate order, checksums, provider folder layout | original stdlib implementation; never runs the launcher |
| `scripts/triage_findings.py` | finding schema, registry | original stdlib implementation |

No upstream file is copied except the license text. The paraphrased method in `method.md` and
`craft-floor.md` is a derivative of Apache-2.0 material and carries attribution in place;
[`LICENSE.upstream.txt`](../LICENSE.upstream.txt) is the byte-exact pinned `LICENSE`.

## License observation

The pinned `LICENSE` is the full Apache License 2.0 text with the appendix line
`Copyright 2025 Paul Bakaus` (SHA-256 `02bb8c3b4e70190e3986c0404ad2fd8d639b4f534252d82379cc1b502b6d1812`).
The pinned `NOTICE.md` says only that `skill/reference/ios.md` and `skill/reference/android.md`
are distilled from ehmo's MIT-licensed `platform-design-skills`; this operator reproduces
neither file, so no NOTICE text applies to it. The README states Impeccable started from
Anthropic's `frontend-design` skill. Apache-2.0 is the observed source license, not a clearance
for fonts, images or brand assets a project uses, and not a statement about design quality.

## Comparison and supersession decision

Compared against the catalog's `design-taste-frontend`, `design-taste`, `web-design`,
`design-system`, `web-accessibility`, `responsive-design` and `optimize-web-animations`.

- **No retirement.** Impeccable is a separate source with its own engine, detector, command
  vocabulary and context files. Similar goals (anti-generic UI, review, polish) do not
  establish lineage or a drop-in replacement for any local owner.
- `design-taste-frontend` keeps the Leonxlnx three-dial anti-slop workflow; this operator does
  not own those dials.
- `design-taste` keeps Mustafa's genre packs.
- `web-design` keeps MengTo recipe selection; `design-system` keeps token and primitive
  governance; `responsive-design` keeps layout strategy; `optimize-web-animations` keeps
  measured animation performance work.
- `web-accessibility` keeps generic accessibility remediation and its broad UI-critique
  default. This operator activates on the exact source: Impeccable by name, `/impeccable` or
  `$impeccable` commands, its detector or hook, or its `PRODUCT.md`/`DESIGN.md` workflow.

## Re-pinning

To move the pin: resolve the new `main` SHA, re-read `SKILL.src.md`, `command-metadata.json`,
`engine-checksums.txt`, `VERSION`, `registry.rs` and `cli.rs`, regenerate `source.json`
(commands, checksums, rules, file hashes), update the rule table in `detector.md` and the
routes in `scripts/triage_findings.py` for any added or removed rule, then run
`python3 -B scripts/test_impeccable_skill.py -v` from the repository root.
