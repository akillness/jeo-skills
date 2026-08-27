# Pinned source audit

## Audit record

| Field | Value |
|---|---|
| Repository | `https://github.com/Unity-Technologies/skills` |
| Audited commit | `87fac23d66a1f44f5e06c2935eccce0b40b9715a` |
| Commit date | 2026-08-21 |
| Release tags at audit | none |
| Tracked files | 125 |
| Skill directories | 22 |
| Agent Skills CLI 1.5.23 discoveries | 21 |
| License | Unity Companion License for Unity-dependent projects |

This local wrapper contains original routing, safety, and audit guidance. It
does not vendor upstream skill prose, C#, HLSL, or templates.

## Primary-source evidence

- [README install and advertised list](https://github.com/Unity-Technologies/skills/blob/87fac23d66a1f44f5e06c2935eccce0b40b9715a/README.md)
- [Actual 22-folder skills tree](https://github.com/Unity-Technologies/skills/tree/87fac23d66a1f44f5e06c2935eccce0b40b9715a/skills)
- [Contribution, structure, and no-per-skill-release policy](https://github.com/Unity-Technologies/skills/blob/87fac23d66a1f44f5e06c2935eccce0b40b9715a/CONTRIBUTING.md)
- [Unity Companion License notice](https://github.com/Unity-Technologies/skills/blob/87fac23d66a1f44f5e06c2935eccce0b40b9715a/LICENSE.md)
- [Unity CLI security notes](https://github.com/Unity-Technologies/skills/blob/87fac23d66a1f44f5e06c2935eccce0b40b9715a/skills/unity-cli/SECURITY.md)
- [Unity CLI skill at the pin](https://github.com/Unity-Technologies/skills/blob/87fac23d66a1f44f5e06c2935eccce0b40b9715a/skills/unity-cli/SKILL.md)
- [UGS deployment reference](https://github.com/Unity-Technologies/skills/blob/87fac23d66a1f44f5e06c2935eccce0b40b9715a/skills/build-live-game/references/deployment.md)
- [IAP pre-check and route order](https://github.com/Unity-Technologies/skills/blob/87fac23d66a1f44f5e06c2935eccce0b40b9715a/skills/implement-in-app-purchases/references/pre-check.md)
- [LevelPlay privacy boundary](https://github.com/Unity-Technologies/skills/blob/87fac23d66a1f44f5e06c2935eccce0b40b9715a/skills/levelplay-unity-integration/references/privacy-settings.md)

## Reproduced findings

### Inventory drift

The README table names 13 skills. The repository contains 22 directories with
`SKILL.md`. Therefore the README is not the complete installation inventory at
this commit.

### Frontmatter failure

`skills/physics-3d-collision/SKILL.md` has an unquoted colon-space sequence in
its one-line description. Both PyYAML and Agent Skills CLI 1.5.23 reject the
frontmatter. The CLI prints a YAML parse warning, skips that directory, and
reports 21 available skills.

Do not patch or silently rewrite the upstream file in place during an install.
Either use a newer verified commit where it is fixed or create a separately
reviewed local adaptation with clear provenance.

### Name collision

The jeo-skills catalog already includes `unity-cli`, while the official pack
also includes a folder and frontmatter name `unity-cli`. A broad install into
the same target can replace or shadow one with the other. The read-only plan
blocks this exact destination collision.

### Moving-main versioning

Upstream `CONTRIBUTING.md` says versioning is repository history and pull
requests, with no per-skill release mechanism. The audit found no repository
tags. Record a commit for every install and refresh.

## Audit helper contract

`scripts/audit-pack.py` uses only the Python standard library and read-only Git
queries. It does not clone, fetch, install, copy, link, edit, execute upstream
code, inspect environment values, or create a target.

It reports:

- safe origin URL and current commit;
- license marker presence;
- actual skill-directory and support-file counts;
- a bounded frontmatter parse and directory-name check;
- README listed count;
- counts of fixed risk-signal labels, never matching content;
- destination collisions for an explicit selection.

The parser is intentionally narrower than a full YAML implementation. Final
installation validation should also use the real Agent Skills CLI and the
receiving host's skill loader.

## Refresh checklist

1. `git ls-remote https://github.com/Unity-Technologies/skills.git HEAD`
2. Fetch the candidate into a separate checkout.
3. Run `doctor`, `inventory`, and Agent Skills CLI `--list`.
4. Recount actual `skills/*/SKILL.md` folders.
5. Recheck license text and tag/release availability.
6. Diff selected folders and all support files against the prior pin.
7. Recheck `unity-cli`, Unity, SDK, UGS, IAP, LevelPlay, Vivox, and package
   version assumptions.
8. Review new scripts, C#, network calls, credential names, and destructive
   commands.
9. Re-run collision planning against the real target.
10. Update this audit record only after all evidence agrees.
