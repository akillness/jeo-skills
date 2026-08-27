# Pinned source audit

## Audit record

| Field | Value |
|---|---|
| Repository | `https://github.com/bam-bam-2/solo-skills` |
| Audited commit | `d5789f592af17980054052fc7c05fe8a8e46be79` |
| Commit date | 2026-08-23 |
| Release tags at audit | none |
| Tracked files | 66 |
| Public skill directories | 26 |
| Agent Skills CLI 1.5.23 discoveries | 24 |
| Fleet total claim | 49; eight category headings sum to 48 |
| License | MIT |

This wrapper contains original audit, routing, adaptation, and safety guidance.
It does not vendor the upstream personal skills or automation code.

## Primary-source evidence

- [README and 26-skill install claims](https://github.com/bam-bam-2/solo-skills/blob/d5789f592af17980054052fc7c05fe8a8e46be79/README.md)
- [Actual 26-folder skills tree](https://github.com/bam-bam-2/solo-skills/tree/d5789f592af17980054052fc7c05fe8a8e46be79/skills)
- [MIT license](https://github.com/bam-bam-2/solo-skills/blob/d5789f592af17980054052fc7c05fe8a8e46be79/LICENSE)
- [Fleet catalog](https://github.com/bam-bam-2/solo-skills/blob/d5789f592af17980054052fc7c05fe8a8e46be79/fleet.md)
- [Claude-to-Codex fallback script](https://github.com/bam-bam-2/solo-skills/blob/d5789f592af17980054052fc7c05fe8a8e46be79/skills/claude-codex-fallback/scripts/llm-with-fallback.sh)
- [Notion archive script](https://github.com/bam-bam-2/solo-skills/blob/d5789f592af17980054052fc7c05fe8a8e46be79/skills/notion-delete/notion_archive.py)
- [Discord reminder installer](https://github.com/bam-bam-2/solo-skills/blob/d5789f592af17980054052fc7c05fe8a8e46be79/skills/discord-reminder/scripts/make-reminder.sh)
- [Naver mail sender](https://github.com/bam-bam-2/solo-skills/blob/d5789f592af17980054052fc7c05fe8a8e46be79/skills/naver-mail/scripts/send_naver_mail.py)
- [Threads reply publisher](https://github.com/bam-bam-2/solo-skills/blob/d5789f592af17980054052fc7c05fe8a8e46be79/skills/threads-reply/scripts/publish-thread.mjs)
- [Remote offload script](https://github.com/bam-bam-2/solo-skills/blob/d5789f592af17980054052fc7c05fe8a8e46be79/skills/remote-offload/scripts/offload.sh)

## Reproduced findings

### Frontmatter and discovery

The repository has 26 `skills/*/SKILL.md` folders. PyYAML and Agent Skills CLI
1.5.23 reject `style-skill-creator` and `voice-dna-creator` because their
one-line descriptions contain unquoted colon-space sequences.

`style-skill-creator` also declares `name: cw-style-skill-creator`, so its name
does not match its folder even after the YAML quoting issue is addressed. The
real CLI lists 24 available skills. Do not report all 26 as installed.

### Existing catalog collision

The upstream pack includes `harness`, and jeo-skills already has a canonical
`harness` from another source. A broad install into one target can replace or
shadow it. The read-only plan blocks a same-name destination.

### Personal environment coupling

A deterministic source scan at the pin found 105 occurrences of selected
author-bound path or host terms across the repository and ten long numeric ID
candidates. These counts are audit signals, not secrets and not proof that every
match is unsafe. Read context before adapting.

The repository includes workflows tied to specific project paths, SSH aliases,
launchd labels, Discord bots and recipients, Notion token locations, Naver and
Threads accounts, private voice data, and adjacent projects that are not part
of the public repository.

### Permission and action surfaces

The fallback shell contains both a Claude permission-skip flag and a Codex
approval-and-sandbox bypass flag. The Notion script archives pages, the reminder
script installs launchd state and uses Discord credentials, the mail script can
send through SMTP, the Threads script publishes only when `--go` is supplied,
and the offload script executes on an SSH host and fails closed rather than
falling back locally.

These upstream choices may fit the author's private environment. They are not
safe portable defaults for a new user.

### Fleet is a separate surface

`fleet.md` claims 49 automations in its title and closing text, while its eight
category headings sum to 48. It is not additional public skill folders, and its
status text is not evidence that those jobs exist or run in a new environment.
Treat the unresolved count as discovery data only.

## Audit helper contract

`scripts/audit-pack.py` uses the Python standard library plus read-only Git
queries. It does not clone, fetch, copy, link, install, edit, execute upstream
code, read environment values, print matches, or create the target.

It reports safe origin, commit, license marker, real directory and support-file
counts, bounded frontmatter status, directory-name mismatch, README count,
fixed risk-signal counts, and exact destination collisions. A full YAML parser
and the real receiving host remain required for final validation.

## Refresh checklist

1. `git ls-remote https://github.com/bam-bam-2/solo-skills.git HEAD`
2. Fetch the candidate into a separate checkout.
3. Re-run `doctor`, `inventory`, and Agent Skills CLI `--list`.
4. Count real public skill folders separately, and compare the fleet title
   claim with the category-heading sum.
5. Recheck MIT license and release-tag availability.
6. Diff every file in each selected folder.
7. Re-audit personal paths, IDs, credential search, providers, schedulers,
   bypass flags, live-action flags, and external destinations.
8. Re-run collision planning against the actual target.
9. Reapply adaptations explicitly; do not assume patches still fit.
10. Update this record only after every claim is reproduced.
