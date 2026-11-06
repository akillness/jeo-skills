# MoneyPrinterV2 audited reference

Audit of [`FujiwaraChoki/MoneyPrinterV2`](https://github.com/FujiwaraChoki/MoneyPrinterV2) at commit
[`a734fa924adb9ffe5ab8472aa5526e469e42a8b5`](https://github.com/FujiwaraChoki/MoneyPrinterV2/tree/a734fa924adb9ffe5ab8472aa5526e469e42a8b5)
(committed 2026-09-15T22:33:05Z, "Add custom topic option for YouTube Shorts"), observed 2026-11-06.
License: AGPL-3.0 (GitHub API and README). `references/source.json` records the SHA-256 of the 16 files
this audit read; `scripts/preflight.py --repo` compares a checkout against them. The upstream README
calls the project educational and disclaims liability; it is not a compliance guarantee.

## Identity

MPV2 is a rewrite of MoneyPrinter V1 with four features (README): a Twitter bot with scheduled posting, a YouTube Shorts automator, Amazon-plus-Twitter affiliate marketing, and "find local businesses and cold outreach". It is a different project from `harry0703/MoneyPrinterTurbo` (the README links it only as a community Chinese version). Entry point: `python src/main.py` (an interactive menu). `docs/Roadmap.md` lists cold calling, item flipping, long-form-to-Short and subtitles as not implemented.

## Install and setup

README path:

```bash
git clone https://github.com/FujiwaraChoki/MoneyPrinterV2.git
cd MoneyPrinterV2
cp config.example.json config.json
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python src/main.py
```

- Python: README note and `.python-version` say 3.12.
- `requirements.txt` includes `kittentts` pinned to a wheel URL on GitHub releases (0.8.1), not PyPI, plus `selenium`, `selenium_firefox`, `webdriver_manager`, `moviepy`, `faster-whisper`, `ollama`, `assemblyai`, `yagmail`, `Pillow>=10.0.0`. `undetected_chromedriver` is listed but no module under `src/` imports it.
- `scripts/setup_local.sh` creates `config.json` if absent, makes a venv, installs requirements, then rewrites `config.json`: it sets `imagemagick_path`, fills `firefox_profile` from a macOS Firefox profile directory when empty, and replaces `ollama_model` with a model it finds installed. It also seeds `llm_provider`, `image_provider`, `automatic1111_base_url` and `cloudflare_worker_url`; nothing under `src/` reads those four keys. It finishes by running `scripts/preflight_local.py` and ignoring its exit status.
- `scripts/preflight_local.py` (upstream's own, not this skill's helper) makes network calls: Ollama `/api/tags` and the Gemini base URL. Missing image key counts as a failure; a missing `imagemagick_path` or Firefox profile is a warning.
- Treat every one of those as an approval gate; `scripts/preflight.py` in this skill does none of it.

## Configuration

`config.json` is a copy of `config.example.json`. Keys read by `src/config.py` and documented in `docs/Configuration.md` include `firefox_profile`, `headless`, `ollama_base_url`, `ollama_model`, `twitter_language`, `nanobanana2_api_base_url` / `_api_key` / `_model` / `_aspect_ratio`, `threads`, `zip_url`, `is_for_kids`, `google_maps_scraper`, `email` (`smtp_server`, `smtp_port`, `username`, `password`), `google_maps_scraper_niche`, `scraper_timeout`, `outreach_message_subject`, `outreach_message_body_file`, `stt_provider`, `whisper_*`, `assembly_ai_api_key`, `tts_voice`, `font`, `imagemagick_path`, `script_sentence_length`, and the `post_bridge` block.

- Environment fallbacks: `GEMINI_API_KEY` when `nanobanana2_api_key` is empty; `POST_BRIDGE_API_KEY` when `post_bridge.api_key` is empty.
- Text generation goes only through the `ollama` client at `ollama_base_url` (`src/llm_provider.py`). With `ollama_model` empty, `main.py` lists models and asks. `cron.py` needs the model name as its third argument.
- Speech to text defaults to local `faster-whisper`; `third_party_assemblyai` sends audio to AssemblyAI. Text to speech is local KittenTTS (`KittenML/kitten-tts-mini-0.8`).
- Docs drift: `docs/YouTube.md` and `docs/TwitterBot.md` show `llm` and `image_model` keys that `config.example.json` does not define. Trust the example file and `src/config.py`.

## Feature areas

Menu (`src/constants.py`): YouTube Shorts Automation, Twitter Bot, Affiliate Marketing, Outreach, Quit.

- **YouTube Shorts**: submenu Upload Short, Upload Short with custom topic, Show all Shorts, Setup CRON Job. Script, title, description and image prompts come from Ollama; images from the Gemini image API ("Nano Banana 2"); voice from KittenTTS; subtitles via MoviePy and ImageMagick; upload by driving YouTube Studio in Firefox with the account's profile. Songs come from the `zip_url` archive (60 s timeout; only audio extensions extracted).
- **Twitter Bot**: Post something, Show all Posts, Setup CRON Job. Posting drives X in Firefox; `src/constants.py` carries an absolute XPath for the post button, so UI changes break it.
- **Affiliate Marketing**: scrapes an Amazon product page (title and feature bullets via element ids), has Ollama write a pitch, and posts it from a Twitter account with the affiliate link.
- **Post Bridge** (optional): after a successful YouTube upload, hands the video to the Post Bridge API for TikTok and Instagram. `auto_crosspost` defaults to false; cron runs skip it unless true and skip when several accounts exist without fixed `account_ids`.
- State lives in `.mp/` (account caches with profile paths, product cache, working media). At startup `src/main.py` calls `rem_temp_files()`, which deletes every file in `.mp/` whose name does not end in `.json`.

## Scheduling truth

The CRON menu entries call `schedule.every()...do(job)` where `job` runs `python src/cron.py <purpose> <account-id> <model>` in a subprocess. No code under `src/` calls `schedule.run_pending()`, and `main.py` just loops on the menu, so those jobs are registered in a process that never runs them. Use an OS scheduler (cron, launchd, Task Scheduler) to call `src/cron.py` directly, after approval. `scripts/upload_video.sh` calls `src/cron.py youtube <id>` with two arguments, but `cron.py` exits unless a third (the Ollama model) is given, so the script fails as written.

## Outreach chain

1. `Outreach` checks `go version`, downloads the zip named by `google_maps_scraper` (default: the `gosom/google-maps-scraper` v0.9.7 tag archive) with `requests.get` and no timeout or checksum, extracts it (skipping `..` and absolute members), runs `go mod download` and `go build`, and moves the binary into the working directory.
2. It writes the niche to `niche.txt` and runs the binary with only `-input niche.txt -results <path>` for `scraper_timeout` seconds.
3. It reads the results file as text lines, splits each on commas, takes the first `http` field as the website, requests it (no timeout), and, on HTTP 200, regex-extracts the first email from the page into the results CSV.
4. In the same loop it takes the recipient from the last comma-separated field of the line it read before that crawl, skips lines without an `@`, and sends the HTML message from `outreach_message_body_file` through `yagmail` using `email.username` and `email.password` from `config.json`, in plaintext. There is no confirmation prompt, rate limit, per-recipient log, or unsubscribe handling; the loop sends to every row that passes those checks. Comma-splitting a CSV also misreads fields that contain commas.

The default archive pins tag v0.9.7. At audit time the `gosom/google-maps-scraper` latest release was v1.18.1 (2026-09-20) and its default branch was 306 commits past v0.9.7; MPV2's fixed two-flag invocation is untested against newer scraper versions here. Treat any URL change as a separate, approved experiment and read the `google-maps-scraper` skill first. Scraped emails are personal data in many jurisdictions; require a lawful basis, an opt-out, and platform and recipient-law review before any send, and prefer reviewing the scraped list before enabling the send loop.

## Process hazards

- `src/utils.py` runs `pkill firefox` (or `taskkill /f /im firefox.exe` on Windows) to clear running browsers before automation; unsaved Firefox work is lost.
- A Firefox profile that stays logged in is account access. Use a dedicated profile.
- Platform rules (YouTube, X, Amazon Associates, TikTok, Instagram) may restrict automation, undisclosed AI content, and affiliate posting; the audit does not assess them.

## Not verified

No MPV2 process, Ollama call, Gemini call, browser session, upload, post, scrape or email was run during this audit. The helper's `runtime_verified` is always false.
