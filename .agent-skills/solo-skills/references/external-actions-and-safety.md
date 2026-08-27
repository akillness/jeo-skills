# External actions and safety

## Approval model

Keep four decisions separate:

1. inspect the source;
2. install or adapt instructions;
3. authenticate a tool or account;
4. perform one exact live action.

Approval at one layer does not authorize the next. A phrase such as "set it
up" is not approval to send, publish, archive, schedule, persist, or bypass
permissions.

## Action matrix

| Surface | Example upstream skills | Required preview |
|---|---|---|
| email and social | `naver-mail`, `threads-reply`, `naver-blog-post` | account, recipient or parent post, exact content, attachments, visibility, live switch, read-back |
| Discord and community | `discord-reminder`, `discord-agent-fleet`, `daily-brief-bot`, `community-launch`, `meeting-minutes` | bot, guild/channel/DM identity, recipients, content, time, token name, rate limit, rollback |
| Notion | `notion-delete`, `meeting-minutes` | workspace, human-readable page/database title, page ID, archive or write diff, token scope, recovery path |
| KakaoTalk | `kakaotalk-cli` | account, chat title and verified recipient, exact text or media, privacy, Accessibility/DB access, read-back |
| remote and desktop | `remote-offload`, `computer-use`, `orchestration`, `kakaotalk-cli` | host/app/window, command or clicks, files, privileges, data exposure, stop and rollback |
| scheduler and persistence | `discord-reminder`, fleet automations | timezone, cadence, executable, label, logs, owner, start, stop, unload, removal |
| model and image providers | `humanize-korean`, `multi-method-image-generation`, `claude-codex-fallback` | provider/model, input data, cost, credential name, fallback, output location, retention |
| CDN and downloaded code | `book-pdf` | exact URL/version/hash, offline alternative, execution context, artifact validation |
| browser and scraping | `daangn-search`, `web-demo-video`, `computer-use` | site/account, terms and rate, pages/actions, login/privacy capture, data handling |

## Permission-bypass flags

The bundled `claude-codex-fallback/scripts/llm-with-fallback.sh` uses
`--dangerously-skip-permissions` for Claude and
`--dangerously-bypass-approvals-and-sandbox` for Codex at the audited commit.
Those are not portable safe defaults.

- Do not run the script unchanged by default.
- Remove bypass flags in the adapted version where possible.
- Preserve the existing fail-closed usage-limit detection. Do not fall back on
  generic nonzero exits, authentication failures, malformed output, or network
  errors.
- Keep the prompt in a permission-restricted temporary file and delete it.
- If a bypass is genuinely required, show the exact command, workspace, tool
  permissions, and untrusted-input boundary, then ask for separate approval.
- Never combine bypass flags with an unreviewed repository, web content, mail,
  chat input, or remote command.

## Author-bound credential discovery

Some upstream scripts look for credentials under the author's adjacent project
or home paths. Do not scan unrelated user folders to find a working key.

Adapt to one approved source:

- a named password manager item;
- one environment variable;
- an OS credential store;
- a scoped configuration file explicitly chosen by the user.

Report `SET` or `MISSING`, never the value. Validate least privilege. Discord,
Notion, Naver, Threads, KakaoTalk, SSH, LLM providers, image providers, and
browser sessions are separate scopes.

## Send and publish

Default every outbound workflow to preview or dry run. Before live action:

1. resolve raw IDs to visible account and recipient names;
2. show the final text, media, links, mentions, and attachments;
3. state whether it is a reply, DM, channel post, email, article, or public post;
4. identify live flags such as the upstream Threads `--go` option;
5. obtain approval for that exact payload and target;
6. send once;
7. read back provider state, message ID, post URL, or thread position;
8. do not retry after ambiguous success without checking remote state.

## Archive and deletion

The upstream `notion-delete` workflow immediately sets a page's archived state.
Adapt it to preview the page title, workspace, parent, and page ID first. Confirm
that child pages, links, databases, and collaborators are not being confused
with the requested target. After approval, archive once and read back the page
state. Document recovery from trash.

Do not infer deletion authority from access to a token.

## Scheduler, fleet, and remote host

Before launchd, cron, persistent bot, hook, or remote command:

- confirm the user owns or administers the host;
- verify SSH host key and resolved host without printing private key material;
- show the remote working directory and fully quoted command;
- set explicit timeouts and log paths;
- fail closed when the remote host is unavailable;
- use Asia/Seoul only if the current user confirms that timezone;
- avoid duplicate labels and schedules;
- provide stop, unload, remove, and log-cleanup steps;
- verify the service is loaded exactly once.

`fleet.md` status and counts describe the author's environment. They are not
runtime evidence for the current user's machines.

## Personal and private content

Voice samples, meeting transcripts, browser recordings, screenshots, chat
history, email, Notion pages, and private project folders can contain sensitive
information.

- minimize collection and redact before provider calls;
- keep originals separate from generated artifacts;
- use only approved accounts and destinations;
- do not upload private inputs to multiple image or LLM providers merely to
  satisfy "all methods";
- define retention and cleanup for temporary prompts, screenshots, audio, and
  exports;
- do not reuse one person's style or account analytics as another person's
  identity.

## Verification

A successful local exit code is not enough. Verify the real destination:

- mail provider Sent folder or message ID;
- Threads reply under the intended post;
- Discord or KakaoTalk content in the intended conversation;
- Notion page archived state;
- launchd job status and next run;
- remote process, file, or artifact;
- provider generation result and charge record;
- PDF, EPUB, or video rendered and inspected.

On ambiguous results, inspect before retrying to prevent duplicates.
