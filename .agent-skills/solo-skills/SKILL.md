---
name: solo-skills
description: >
  Audit, selectively adapt, install, route, and maintain the Korean
  solopreneur skill pack from bam-bam-2/solo-skills. Use when the user names
  solo-skills, bam-bam-2/solo-skills, its 26-skill collection, or `fleet.md`;
  wants a pinned inventory or selective install; needs to choose among its
  content, messaging, publishing, remote, media, or agent workflows; or needs
  to remove author-specific assumptions before adoption. Inspect frontmatter,
  support scripts, licenses, destination collisions, personal paths, account
  IDs, credential names, network targets, schedulers, permission-bypass flags,
  and live-action switches before copying or running anything. Require explicit
  approval for external messages, publishing, archives, remote commands,
  desktop control, scheduled agents, paid providers, account access, or local
  persistence. Route generic agent-team design to the canonical local `harness`
  and reusable skill authoring to `skill-standardization`.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Pack auditing needs Python 3.9+ and Git. Selective installation examples use
  the Agent Skills CLI. Individual upstream skills may require macOS, Orca,
  Claude Code, Codex, SSH, launchd, Discord, Notion, Naver, Threads, browser
  automation, ffmpeg, Paged.js, image providers, or author-specific local files.
license: MIT
metadata:
  tags: solo-skills, bam-bam-2, korean, solopreneur, agent-skills, skill-pack, discord, notion, naver, threads, automation, content-workflow
  platforms: Claude, ChatGPT, Gemini, Codex, Cursor, Cline
  version: "1.0"
  source: https://github.com/bam-bam-2/solo-skills
---

# Solo Skills

Use this as the safe discovery, adaptation, installation, and routing front
door for [bam-bam-2/solo-skills](https://github.com/bam-bam-2/solo-skills).
The upstream repository publishes an opinionated personal operating system, not
26 portable drop-in tools. Many documents encode one author's machines,
projects, accounts, channel IDs, voice, schedules, provider choices, and
credential locations. Treat those details as examples to parameterize, not as
facts about the current user.

The audited snapshot is commit
`d5789f592af17980054052fc7c05fe8a8e46be79`. It contains 26 directories with a
`SKILL.md`. Agent Skills CLI 1.5.23 discovers 24 because
`style-skill-creator` and `voice-dna-creator` have invalid YAML frontmatter at
that snapshot. `style-skill-creator` also declares the frontmatter name
`cw-style-skill-creator`, which does not match its directory. The repository had
no release tags at audit time.

## When to use this skill

- Inspect, pin, selectively install, refresh, remove, or troubleshoot
  `bam-bam-2/solo-skills`.
- List all 26 source directories and route an explicit request to the narrowest
  upstream workflow.
- Audit portability before adopting Korean writing, Naver, Threads, Discord,
  Notion, meeting, PDF, image, browser, remote-machine, or agent-team workflows.
- Replace author-bound paths, IDs, voice samples, tokens, bots, hosts, projects,
  and schedules with reviewed configuration.
- Review external-action and permission boundaries before running a selected
  script.

Do not use this wrapper for these nearby jobs:

- Designing an agent team without explicitly requesting the Solo pack: use the
  canonical local `harness`.
- Creating or standardizing a reusable skill: use `skill-standardization` or
  `write-a-skill`.
- Ordinary Gmail, Google Calendar, Docs, or Sheets work: use the matching Google
  Workspace skill.
- Connecting Aside to Discord or inspecting Aside runtimes: use `aside`.
- General technical docs or internal runbooks: use `technical-writing`.
- General browser automation that does not depend on this pack: use the
  appropriate browser skill.

## Instructions

### Step 1: Choose one operating mode

| Mode | Use when | Default result |
|---|---|---|
| `audit` | provenance, inventory, license, frontmatter, portability, risk | read-only report |
| `route` | user explicitly wants one Solo workflow | one upstream owner |
| `adapt` | remove personal assumptions before install | reviewed portability patch |
| `install` | place selected safe-enough skills | selective copied install |
| `refresh` | compare a new upstream commit | pin-aware diff and re-audit |
| `operate` | execute an adapted installed workflow | preview, approval, verify |
| `troubleshoot` | discovery, script, account, host, or provider failure | first failing contract |

Do not let `install` imply `operate`. Installing a Threads, Notion, mail,
Discord, desktop, scheduler, or remote-host skill does not authorize a live
action.

### Step 2: Pin and audit before trusting the collection

1. Prefer an existing checkout. Record the exact commit and origin.
2. Verify the top-level MIT license. Keep upstream attribution for copied code.
3. Do not treat `main`, the README's "latest", or a commit count as a release.
   No release tags were present at audit time.
4. Run the standard-library-only helper:

```bash
python3 .agent-skills/solo-skills/scripts/audit-pack.py doctor \
  --repo /path/to/solo-skills \
  --expect-commit d5789f592af17980054052fc7c05fe8a8e46be79 \
  --format json
```

At the audited pin, `WARN` is expected for two invalid frontmatter documents and
one directory-name mismatch. A missing or mismatched commit, missing or
unexpected origin, missing license marker, symlinked checkout or payload entry,
or missing skills tree is `BLOCKED`.

The helper reports only fixed signal labels and counts. It never prints matched
credential values, personal paths, IDs, or file contents, and it never executes
upstream scripts. See [pinned source audit](references/source-audit.md).

### Step 3: Route only after confirming the user chose this pack

Use [catalog and routing](references/catalog-and-routing.md) for all 26 folders.
Core lanes are:

| Intent | Upstream owner |
|---|---|
| Korean AI-tone removal | `humanize-korean` |
| voice or style extraction | `voice-dna-creator` or `style-skill-creator` |
| Naver how-to article or mail | `naver-blog-post` or `naver-mail` |
| Threads personal replies | `threads-reply` |
| meeting summary or full publication flow | `meeting-summary` or `meeting-minutes` |
| Discord community, fleet, brief, or reminder | matching Discord specialist |
| Notion page archive | `notion-delete` |
| broad local UI or Orca agent coordination | `computer-use` or `orchestration` stub |
| author-bound remote machine work | `remote-offload` or `kakaotalk-cli` |
| Claude-to-Codex fallback | `claude-codex-fallback` |
| PDF book, demo video, image variants, UI callouts | matching media specialist |
| reusable agent-team architecture | upstream `harness`, only when explicitly requested |

Two upstream names are not installable through the real CLI at the audited pin.
Do not claim `style-skill-creator` or `voice-dna-creator` is installed unless a
newer verified commit fixes the YAML or a separately reviewed local adaptation
has valid frontmatter and provenance.

### Step 4: Separate public skills from the fleet catalog

The top-level README describes 26 public skills. `fleet.md` separately claims
49 automations used in the author's private environment, but its eight category
headings sum to 48. Its entries may describe scheduled jobs, hooks, bots,
scripts, projects, machines, and credentials that are not present in this
repository.

- Do not convert a `fleet.md` entry into proof that an automation is installed,
  running, accessible, or portable.
- Do not infer hostnames, account ownership, schedules, status, or secrets for
  the current user.
- Audit an automation's real repository and runtime separately before adopting
  it.
- Use `fleet.md` for discovery only unless the user supplies the missing system
  and explicitly asks to reproduce it.

### Step 5: Preview a selective install

Agent Skills CLI 1.5.23 was verified to accept a local checkout and read-only
`--list`:

```bash
npx --yes skills@1.5.23 add /path/to/solo-skills --list --full-depth

python3 .agent-skills/solo-skills/scripts/audit-pack.py plan \
  --repo /path/to/solo-skills \
  --target /path/to/agent/skills \
  --skill humanize-korean \
  --format json
```

The plan never creates the target. It returns `BLOCKED` for invalid selected
frontmatter or an existing same-name destination.

The jeo-skills catalog already owns a canonical `harness`. Never let a broad
Solo install overwrite it. A full install also cannot faithfully include the
two invalid frontmatter skills. Default to a selected lane, copied into an
isolated target if naming or behavior conflicts remain.

### Step 6: Adapt author-specific assumptions

Before installation, inspect the entire selected folder and complete the
portability worksheet in
[installation and adaptation](references/install-and-adaptation.md). At
minimum, parameterize or remove:

- absolute or home-relative project paths and author-specific repository names;
- SSH aliases, remote machine assumptions, launchd labels, and filesystem
  layouts;
- Discord bot identities, user/channel/guild IDs, DM recipients, and schedules;
- Notion page/database locations and token paths;
- Naver, Threads, KakaoTalk, Google, image-provider, and browser account
  assumptions;
- private voice samples, personal metrics, event claims, brand names, and
  audience rules;
- credential search paths and fallback behavior;
- commands that bypass permissions, approvals, or sandboxes;
- live-action flags such as `--go` and default-send behavior.

Do not install first and promise to clean it later. Agent instruction text is
executable policy for the receiving model.

### Step 7: Install the reviewed selection

After `plan` returns `READY` and the adaptation diff is approved:

```bash
npx --yes skills@1.5.23 add /path/to/solo-skills \
  --skill humanize-korean \
  --global --agent universal --yes --copy --full-depth
```

Preserve every reference, script, template, eval, and resource in the selected
folder. If adaptation is required, install from the reviewed adapted checkout,
not the untouched personal version. Record original commit, patch commit or
diff, license, target, and rollback path.

Do not use a symlink to moving `main` for a workflow that can send, publish,
archive, schedule, control a desktop, or execute remotely.

### Step 8: Gate every external or privileged operation

Get a separate explicit confirmation before:

- sending email, Discord, KakaoTalk, Naver, Threads, Notion, or community output;
- publishing a post, reply, article, announcement, meeting minutes, sales copy,
  or external artifact;
- archiving or deleting a Notion page;
- registering launchd, cron, hooks, bots, persistent agents, or reminders;
- using SSH, SCP, rsync, remote shell, desktop automation, Accessibility, or
  Computer Use;
- using `--dangerously-skip-permissions`,
  `--dangerously-bypass-approvals-and-sandbox`, or equivalent bypass flags;
- loading account credentials or calling paid LLM, image, mail, social, or
  browser providers;
- downloading and executing CDN code or author-provided scripts.

For each action, freeze identity, account, target, recipients, content, time,
timezone, host, command, files, cost, credential names, rollback, and validation.
Never print secret values. The full matrix is in
[external actions and safety](references/external-actions-and-safety.md).

### Step 9: Verify installation and operation separately

For installation:

1. destination exists and is not a symlink to moving content;
2. frontmatter name equals the destination;
3. every linked relative file exists;
4. installed bytes match the reviewed source or recorded adaptation;
5. original commit, patch provenance, and MIT license are recorded;
6. no unrelated existing skill changed or disappeared.

For a live operation:

1. the previewed account, recipient, target, content, and time match;
2. the tool reports accepted state;
3. read-back confirms the resulting external state;
4. no secret, private author detail, or unintended recipient appears;
5. scheduled or persistent services have a documented stop and removal path.

Do not report success based only on a zero exit code from an author-specific
wrapper.

## Examples

### Example 1: Audit the collection

Request: "bam-bam-2/solo-skills 26개가 실제로 다 설치되는지 확인해줘."

Choose `audit`. Pin the commit, run `doctor` and the real CLI `--list`, report
26 source folders versus 24 discoverable skills, the two invalid frontmatters,
and the `style-skill-creator` name mismatch. Stop before installation.

### Example 2: Install Korean humanization only

Request: "Solo Skills에서 humanize-korean만 프로젝트에 복사해줘."

Choose `install`. Inspect its full agents, references, and tests; plan against
the exact target; remove any author-only voice assumptions; then copy the
reviewed folder and verify every support file.

### Example 3: Reject a broad overwrite

Request: "기존 스킬은 신경 쓰지 말고 Solo 26개 전부 전역 설치해."

Do not overwrite. Show the local `harness` collision, two invalid frontmatter
files, and personal-environment coupling. Offer selected low-risk content skills
or an isolated, adapted target.

### Example 4: Schedule a Discord reminder

Request: "discord-reminder를 깔았으니 원격 Mac에 내일 10시 공지를 바로 등록해."

Choose `operate`, but preview first. Confirm KST resolution, remote host,
launchd label, script path, bot identity, channel or DM recipient, exact message,
credential source, start/stop commands, and removal path before any SSH or
launchd action.

### Example 5: Publish a Threads reply

Request: "threads-reply로 이 댓글에 바로 답글 달아."

Keep the upstream dry-run default. Show the exact account, parent post, reply,
and API target. Use the live `--go` path only after explicit approval, then
read back the posted reply.

## Best practices

1. Treat the pack as a personal case study that requires adaptation.
2. Pin a commit because upstream has no release tags at the audited snapshot.
3. Count actual `skills/*/SKILL.md` folders and test the real installer.
4. Install one reviewed lane, not an unbounded personal operating system.
5. Never overwrite the canonical local `harness` silently.
6. Preserve support files and original MIT attribution.
7. Remove personal paths, IDs, profiles, schedules, and account assumptions
   before installation.
8. Keep permission bypasses disabled and live-action flags off by default.
9. Separate content generation from external publication or delivery.
10. Verify remote, scheduled, and account state with read-back and rollback.

## References

- [Catalog and routing](references/catalog-and-routing.md)
- [Installation and adaptation](references/install-and-adaptation.md)
- [External actions and safety](references/external-actions-and-safety.md)
- [Pinned source audit](references/source-audit.md)
- [bam-bam-2/solo-skills](https://github.com/bam-bam-2/solo-skills)
- [Agent Skills specification](https://agentskills.io/specification)
