---
name: moneyprinter-v2
description: >
  Operate FujiwaraChoki/MoneyPrinterV2 (MPV2), the AGPL-3.0 Python CLI that automates
  online-income workflows: YouTube Shorts generation and upload, a Twitter/X posting bot,
  Amazon affiliate pitches, and Google-Maps-based local-business outreach. Use when the user
  names MoneyPrinterV2, MPV2 or its `src/main.py` menu, `config.json`, `.mp` cache or
  `src/cron.py` and needs a fit check, install, configuration, offline preflight, a run,
  scheduling, or troubleshooting. Do not use for harry0703/MoneyPrinterTurbo (use
  `moneyprinter-turbo`), generic video production, or bulk unsolicited email and
  platform-evasion automation. Triggers on: MoneyPrinterV2, MoneyPrinter V2, MPV2,
  유튜브 쇼츠 자동화, 트위터 봇, 제휴 마케팅 자동화, 콜드 메일 자동화, 돈 버는 프로그램.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Audited commit needs Python 3.12, a local or remote Ollama server, a Gemini image API key
  for image generation, Firefox with a logged-in profile for Twitter/YouTube/affiliate flows,
  ImageMagick, and Go only for Outreach. Network access, accounts, API keys and SMTP
  credentials are separate authority boundaries.
license: AGPL-3.0
metadata:
  version: "1.0.0"
  source: https://github.com/FujiwaraChoki/MoneyPrinterV2
  upstream_commit: a734fa924adb9ffe5ab8472aa5526e469e42a8b5
---

# MoneyPrinterV2 operator

Operate the named MPV2 application safely. This skill was audited against commit
`a734fa924adb9ffe5ab8472aa5526e469e42a8b5` (2026-09-15); the audited facts, hazards and pin live in
[`references/upstream.md`](references/upstream.md). Upstream describes the project as educational;
the operator's job is to run it only on accounts and data the user owns.

## When to use this skill

- Fit-check, install, configure, preflight, run, schedule, or troubleshoot MoneyPrinterV2.
- Work with its four menu areas: YouTube Shorts Automation, Twitter Bot, Affiliate Marketing, Outreach.
- Explain `config.json`, the `.mp/` cache, Post Bridge cross-posting, or why a scheduled job did not run.
- Not for `harry0703/MoneyPrinterTurbo` (`moneyprinter-turbo`), the Maps scraper alone (`google-maps-scraper`), or general video editing.

## Instructions

### 1. Freeze the surface

Pick one mode: `orient`, `install`, `configure`, `run`, `schedule`, or `troubleshoot`, and one feature
area. Confirm the user owns the target accounts and has the right to publish the generated content.
MPV2 and MoneyPrinterTurbo are different projects; confirm which one the user means.

### 2. Run the offline gate first

The helper reads host facts and, with `--repo`, a checkout. It never starts MPV2, Firefox, Ollama,
Go or pip, opens no sockets, and writes nothing:

```bash
python3 .agent-skills/moneyprinter-v2/scripts/preflight.py --json
python3 .agent-skills/moneyprinter-v2/scripts/preflight.py --repo /path/to/MoneyPrinterV2 --config /path/to/config.json --json
```

An installed skill uses `python3 "$SKILLS_ROOT/moneyprinter-v2/scripts/preflight.py"`. Output
includes `audit:*` findings read from the checkout. A `blocked` `repo.files` result means the checkout
differs from the audited commit; re-audit before trusting this skill's guidance.

### 3. Gate every side effect

Require separate explicit approval for each, in this order of escalation:

1. `pip install -r requirements.txt` (third-party packages plus a wheel fetched from a GitHub release URL) into a virtualenv.
2. `bash scripts/setup_local.sh`, which installs packages and rewrites `config.json`.
3. Pulling Ollama models, and any Gemini image-API spend.
4. Any run that drives a logged-in Firefox profile. MPV2 force-kills every running Firefox first; save browser work.
5. Anything that publishes: YouTube upload, tweets, Post Bridge cross-posting.
6. Scheduling, including OS cron or launchd entries that call `src/cron.py`.
7. Outreach: downloading and building the Maps scraper with Go, scraping, crawling business websites for emails, and sending mail over SMTP.

Never copy a Firefox profile path's contents, SMTP password, API key, or `.mp/` account cache into chat or logs.

### 4. Follow the matching reference branch

- Install, Python, dependencies, `setup_local.sh` → **Install and setup** in `references/upstream.md`.
- Config keys, env fallbacks, stale docs → **Configuration**.
- YouTube, Twitter, affiliate flows → **Feature areas**.
- Scheduled jobs that do not fire → **Scheduling truth**.
- Maps scraping and email → **Outreach chain** and the responsible-use gate below.

### 5. Verify narrowly

Check the smallest effect first: `python3 scripts/preflight_local.py` inside the checkout (it makes
network calls to Ollama and the image API, so it needs approval too), one dry generation without
upload, then one upload. Report what ran and what did not; a green preflight is not proof of a
working upload because the Twitter and YouTube flows depend on page selectors.

## Responsible-use gate

Refuse or redirect requests that use MPV2 for unsolicited bulk email without a lawful basis and an
opt-out, impersonation, fake engagement, evading platform detection, or posting under accounts the user
does not control. For Outreach, ask what law and platform terms apply to the user's recipients and
data before any scrape or send; collected business emails are personal data in many jurisdictions.
AI-generated posts and videos may need disclosure under platform rules.

## Examples

### Fit check and gate

Ask which feature area and account the user means, run the preflight with `--repo` and `--config`,
and report: Python 3.12 present, Ollama reachable class (loopback or remote), whether the image key is
set, and the `audit:*` hazards. Do not install anything yet.

### "My daily upload never ran"

Read **Scheduling truth**. The in-app CRON menu only registers jobs in a process that never runs
them, so propose an OS scheduler calling `src/cron.py <purpose> <account-id> <ollama-model>` after
approval, and note that `scripts/upload_video.sh` omits the model argument.

## Best practices

- Prefer the checkout's `config.example.json` and `src/config.py` over the prose docs; some docs list keys the code no longer reads.
- Keep one account and one feature per session; test with `headless: false` so a person can watch.
- Treat `config.json` as a secret file: it can hold SMTP credentials in plaintext.
- Keep the helper offline and honest: a tool on PATH is not a working Ollama, Firefox login, or API key.

## References

- [Audited MPV2 facts, hazards and pin](references/upstream.md)
- [Pinned source manifest](references/source.json)
- [MPV2 README at the audited commit](https://github.com/FujiwaraChoki/MoneyPrinterV2/blob/a734fa924adb9ffe5ab8472aa5526e469e42a8b5/README.md)
- [MPV2 Configuration doc](https://github.com/FujiwaraChoki/MoneyPrinterV2/blob/a734fa924adb9ffe5ab8472aa5526e469e42a8b5/docs/Configuration.md)
- [AGPL-3.0 license at the pin](https://github.com/FujiwaraChoki/MoneyPrinterV2/blob/a734fa924adb9ffe5ab8472aa5526e469e42a8b5/LICENSE)
- [Offline helper](scripts/preflight.py)
