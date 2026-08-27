# Catalog and routing

## Snapshot authority

This map was audited at commit
`d5789f592af17980054052fc7c05fe8a8e46be79` on 2026-08-27 KST. The
repository has 26 directories containing `SKILL.md`, while Agent Skills CLI
1.5.23 discovers 24 because two frontmatter documents fail parsing.

## Full 26-skill map

### Writing, voice, and sales

| Skill | Route here for | Portability boundary |
|---|---|---|
| `humanize-korean` | detect and remove common AI-like Korean writing patterns | includes a multi-agent workflow, model preferences, agents, references, and tests; inspect all support files |
| `style-skill-creator` | extract an author's style into AI instructions | invalid YAML and declares `cw-style-skill-creator` instead of its directory name at the pin |
| `voice-dna-creator` | infer a reusable voice profile from samples | invalid YAML at the pin; writing samples may be private or client-confidential |
| `event-sales-script` | channel-specific Korean event sales messages from a seven-step framework | examples and success claims belong to one event; do not transfer claims to another campaign |
| `workshop-prep` | facilitate pre-work for a Claude Code vibe-coding workshop | author-specific tool choices and audience assumptions need review |

### Publishing and platform content

| Skill | Route here for | Portability boundary |
|---|---|---|
| `naver-blog-post` | Korean search-oriented Naver how-to articles | branded as one user's blog and links author evidence; verify current platform rules and target persona |
| `threads-reply` | replies to comments on one personal Threads account | voice and handle are account-specific; script keeps live publishing behind `--go` |
| `community-launch` | launch and operate a community using specialized agents | references encode one project's lessons, personas, channel choices, and commercial flow |
| `daangn-search` | search Daangn across multiple administrative areas | browser scraping, platform terms, rate limits, location, and item handling apply |

### Meetings and knowledge

| Skill | Route here for | Portability boundary |
|---|---|---|
| `meeting-summary` | format a Korean meeting summary | output template contains author-specific style and emoji conventions |
| `meeting-minutes` | transcription to minutes, Notion publication, and Discord announcement | hard-coded project folders, people, Notion destinations, and external publication steps |
| `notion-delete` | archive a Notion page through the API | destructive external action; script searches an author-specific token path and archives immediately |

### Messaging, mail, reminders, and fleets

| Skill | Route here for | Portability boundary |
|---|---|---|
| `naver-mail` | IMAP read guidance and a Naver SMTP sender | document title and included send script cover different actions; recipient and send approval required |
| `discord-reminder` | create a scheduled Discord reminder on a remote Mac | SSH alias, project path, launchd, bot `.env`, DM identity, and KST defaults are author-bound |
| `discord-agent-fleet` | operate three persistent Discord agents on a remote machine | host, bot folders, agents, launchd labels, channels, and tokens belong to one environment |
| `daily-brief-bot` | curate articles and send a daily Discord brief | source, personal knowledge base, DM target, schedule, and taste profile are author-specific |
| `kakaotalk-cli` | read or send KakaoTalk through a remote Mac and `kmsg` | private chat database, SSH, GUI and Accessibility permissions, recipients, and Korean personal data |

### Agent runtime and remote work

| Skill | Route here for | Portability boundary |
|---|---|---|
| `claude-codex-fallback` | run Claude first and Codex only on confirmed usage-limit failure | bundled shell uses permission or sandbox bypass flags; never adopt those defaults blindly |
| `harness` | generate agent teams, skills, and project rules | collides with the canonical jeo-skills `harness`; install only when explicitly selecting this variant |
| `computer-use` | discover Orca's current computer-use reference | stub only; requires a compatible Orca binary that serves version-matched instructions |
| `orchestration` | discover Orca's current multi-agent orchestration reference | stub only; requires a compatible Orca binary and live reference output |
| `remote-offload` | send a heavy command to an SSH host | author SSH alias, remote path, key, resource assumptions, and quoted command execution |

### Media and artifact production

| Skill | Route here for | Portability boundary |
|---|---|---|
| `book-pdf` | turn Markdown into book-like PDF and EPUB | downloads Paged.js from a public CDN and runs browser/ebook tooling; pin or vendor reviewed code |
| `measured-ui-callouts` | annotate a real screenshot using measured DOM coordinates | screenshots can contain personal data; separate source evidence from decorative edits |
| `multi-method-image-generation` | generate multiple image candidates across available providers | searches author project paths for keys, may call paid providers, and can expose input images |
| `web-demo-video` | record a real web product and edit a demonstration video | login, personal data, browser capture, audio, codec, and publication destination need review |

## Routing rules

1. Enter this router only when the user names the Solo pack or explicitly wants
   one of its source workflows.
2. Generic agent-team design routes to the canonical local `harness` unless the
   user deliberately chooses the upstream Solo variant.
3. Generic skill creation routes to `skill-standardization` or `write-a-skill`.
4. For `computer-use` and `orchestration`, verify a matching Orca binary and ask
   it for the live reference. The checked-in stubs are not usage guides.
5. Treat `fleet.md` as discovery data, not installed public skills. It claims
   49 automations, while its eight category headings sum to 48.
6. Do not route to the two invalid frontmatter folders as installed at the
   audited pin.
7. Any send, publish, archive, scheduler, remote, desktop, account, or provider
   action moves from `route` into a separately approved `operate` step.

## Upstream links

- [Actual 26-folder skills tree](https://github.com/bam-bam-2/solo-skills/tree/d5789f592af17980054052fc7c05fe8a8e46be79/skills)
- [README with the public collection](https://github.com/bam-bam-2/solo-skills/blob/d5789f592af17980054052fc7c05fe8a8e46be79/README.md)
- [Fleet catalog with a claimed total of 49](https://github.com/bam-bam-2/solo-skills/blob/d5789f592af17980054052fc7c05fe8a8e46be79/fleet.md)
