---
name: image-to-github-repo
description: >
  Find the GitHub repository behind an image. Reads a screenshot, card-news slide,
  SNS post (Instagram, Threads, X), YouTube thumbnail, slide-deck page, or README or
  terminal capture that names open-source programs without a clickable link, extracts
  each project name, owner/repo slug, printed URL, star count, and "what it does" hint,
  then verifies every candidate against the GitHub API (exists, renamed, stars, archived,
  same-name rivals) and reports a confidence level instead of guessing. Use when the user
  shares an image and asks for its GitHub address, repo link, source code, or which
  repository it shows. Triggers on: 이미지 깃허브 주소, 깃허브 링크 찾아줘, 이 프로그램 레포,
  카드뉴스 깃허브, find the GitHub URL in this screenshot, which repository is this,
  image to repo, repo link from a post.
allowed-tools: Bash Read Write Glob Grep WebFetch
compatibility: Needs an agent that can read images (or a local OCR such as tesseract) and Python 3.9+. Verification needs network access to api.github.com; GITHUB_TOKEN is optional and only raises rate limits.
license: MIT
metadata:
  tags: github, image, screenshot, ocr, repo-discovery, open-source, card-news
  version: "1.0.0"
  source: akillness/jeo-skills
---

# Image to GitHub Repo

Turn "what is the GitHub address for this image?" into verified repository URLs. The image is the
evidence, the GitHub API is the check, and the report says how sure each answer is.

## When to use this skill

- The user sends a screenshot, card-news slide, social post, thumbnail, or slide and asks for the GitHub address, repo, or source of the program(s) shown.
- The image lists several tools ("5 free GitHub programs") and the user wants one link per tool.
- The image carries only a partial reference — an `owner/repo`, a handle, a `gitingest.com/...` URL, or a star count — and the canonical URL is needed.

Route elsewhere when the job is different:
- Ranking or filtering a list of search hits → `github-repo-candidate-quality-gate`.
- Downloading files or folders from a known repo → `ghgrab`.
- Evaluating or summarizing a repo after its URL is known → `research`.
- Operating a program once it is resolved → its dedicated skill when one exists: `fabric`, `moneyprinter-v2`, `agent-s`, `google-maps-scraper`, or `gitingest` (the `github-five-programs` bundle).
- An image that names no software (reverse image search is out of scope).

## Instructions

### Step 1: Read the whole image first

- View the image with the host's image capability; zoom or crop dense areas.
- Posts split content: the slide may show one project and the caption five. Read slide, caption, and any visible comments, and list every project, not only the headline one.
- Transcribe verbatim before interpreting: names, URLs, `owner/repo` slugs, `@handles`, star/fork counts with their units (Korean `만` = 10,000, `천` = 1,000), and one-line descriptions.
- If the host cannot read images, run `tesseract <image> - -l kor+eng` when installed, say OCR was used, and treat unclear names as unverified.
- For a carousel, only the visible slide was read. Say so and ask for the other slides if a link might be on them.

### Step 2: Build one candidate per project

Fields (details in `references/extraction-and-confidence.md`):
- `name` — exactly as printed (`Agent S`, not `agent-s`).
- `owner` — only if printed.
- `url` — only if its characters are literally in the image. Never construct one.
- `stars` — as printed, with units (`3.16만`).
- `hints` — two to four English keywords for what the image says the project does. Translate; skip marketing words.

### Step 3: Resolve with the helper

From the repo root (installed skills use `$HOME/.agents/skills/image-to-github-repo/scripts/resolve_repo.py`):

```bash
python3 .agent-skills/image-to-github-repo/scripts/resolve_repo.py --batch candidates.json --format markdown
python3 .agent-skills/image-to-github-repo/scripts/resolve_repo.py --name "MoneyPrinterV2" --stars "3.16만" --hint "money online automation"
python3 .agent-skills/image-to-github-repo/scripts/resolve_repo.py --url github.com/simular-ai/Agent-S
```

`candidates.json` is an array of `{"name","owner","url","stars","hints"}` objects; every key is optional but a `name` or `url` is required, and a batch holds at most 25. Add `--dry-run` to print the API requests without touching the network. Exit codes: `0` every result is verified/high/medium, `1` something is low/ambiguous/not found/error, `2` invalid input.

If Python or the network is unavailable, use the manual path in `references/github-api-notes.md` and apply the same confidence rules by hand.

### Step 4: Read the confidence; do not override it

| Result | Meaning | Do |
|---|---|---|
| `verified` | A printed URL/slug exists on GitHub | Report it; note a rename if `renamed_from` is set |
| `high` | Exact name, backed by printed stars or keywords, nothing more popular left unexplained | Report it |
| `medium` | Exact name only, or backed but with similar rivals | Report it labeled "verify"; show `alternatives` |
| `ambiguous` | Same-named repos the hints cannot separate | Show the top two or three with distinguishing facts; ask for one detail |
| `low` | No exact name, or nothing matches the printed stars/keywords | Show partial matches as leads, never as the answer |
| `not_found` / `error` | Missing repo, rate limit, or network failure | State it plainly; for `rate_limited` retry after the reset or set `GITHUB_TOKEN` |

### Step 5: Report

One row per project: name, URL, confidence, how it was found (printed link vs. name search), and caveats (renamed, archived, star count drifted since the post). If every result is `verified` or `high`, one line of provenance is enough. Say plainly when the image carried no link and the URL came from a name search. Carry through any legal or terms-of-service caution printed in the image.

## Available scripts

- `scripts/resolve_repo.py` — stdlib-only, read-only resolver. Flags: `--name`, `--owner`, `--url`, `--stars`, `--hint` (repeatable), `--batch FILE|-`, `--format json|markdown`, `--limit N`, `--timeout S`, `--api-base URL`, `--dry-run`. Reads `GITHUB_TOKEN` or `GH_TOKEN` from the environment and sends it to `api.github.com` only.

## Examples

### Example 1: Card news listing five programs

The caption names Fabric, MoneyPrinterV2 (printed `3.16만` stars), Agent S, google-maps-scraper, and gitingest. Write one candidate each, run the batch, and expect:

| Project | Repository | Confidence |
|---|---|---|
| Fabric | `danielmiessler/Fabric` | high with a `prompts` hint |
| MoneyPrinterV2 | `FujiwaraChoki/MoneyPrinterV2` | high (stars within window) |
| Agent S | `simular-ai/Agent-S` | high with a `computer use agent` hint |
| google-maps-scraper | `gosom/google-maps-scraper` | medium with `phone email`; ambiguous with `business` alone |
| gitingest | `coderamp-labs/gitingest` | high with a `codebase prompt` hint |

Observed on 2026-11-06; repositories move and star counts change, so rerun the helper rather than reusing this table.

### Example 2: A printed link for a renamed repository

`--url github.com/cyclotruc/gitingest` returns `verified` with `renamed_from: cyclotruc/gitingest` and `match.html_url` pointing at `coderamp-labs/gitingest`. Report the current URL and mention the old one.

### Example 3: A weak hint that cannot decide

`--name google-maps-scraper --hint business` returns `ambiguous`: a more popular same-named repository exists that the keyword neither supports nor rules out. Do not pick one. Show the alternatives and ask for the owner, a printed star count, or another slide.

## Best practices

1. Every URL in the answer either came from the image or was returned by the API; never assemble `github.com/<guess>/<guess>`.
2. A printed link that returns 404 is reported as not found, not silently "fixed" by a name search.
3. Keywords are positive evidence only: a missing keyword never rules a repo out. Only a printed star count can contradict a candidate.
4. Star counts drift. They support a match; they never prove one, and an older post will show fewer stars than today.
5. Stay inside the rate limit: unauthenticated search allows 10 requests per minute, so batches are capped at 25 and searching stops after the first rate-limit error.
6. This skill is read-only. Do not clone, install, or run the projects it finds; installing them is a separate request.

## References

- [Extraction and confidence rules](references/extraction-and-confidence.md)
- [GitHub API notes](references/github-api-notes.md)
- [Search repositories (GitHub REST)](https://docs.github.com/en/rest/search/search#search-repositories)
- [Rate limits (GitHub REST)](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)
- [Agent Skills specification](https://agentskills.io/specification)
