# Extraction and Confidence Rules

How to turn an image into candidates, and exactly how `scripts/resolve_repo.py` turns candidates into a confidence level. Read this when a result surprises you or when you must apply the rules by hand.

## What to extract

| Field | Take it from | Rule |
|---|---|---|
| `name` | The project title or a numbered list item | Exactly as printed. `Agent S` and `Agent-S` normalize to the same name; the helper compares letters and digits only, case-insensitively. |
| `owner` | A printed `owner/repo`, a `github.com/<owner>/...` URL, or an `@handle` clearly tied to the project | Only if printed. An `@handle` of the post's author is not the project owner. |
| `url` | A URL or `owner/repo` slug in the image | Only if its characters are in the image. A short link, QR code, or "link in bio" is not a URL you can read. |
| `stars` | A badge or phrase like `★ 3.16만`, `12.9k stars`, `1.4k forks` | Copy it with its units. Forks are not stars; do not pass a fork count. |
| `hints` | The description next to the name | Two to four English keywords for what it does (`computer use agent`, `google maps business`). Translate Korean or other languages; drop marketing words (`best`, `amazing`, `free`). |

Count formats the helper accepts: `31600`, `12,886`, `1.2k`, `1.5M`, `3.16만`, `3만 1천`, and any of those followed by `개` or `stars`. Units: `k`/`천` = 1,000, `만` = 10,000, `m` = 1,000,000, `억` = 100,000,000. Anything else is rejected with exit 2 so a mistyped value cannot silently become "no hint".

## Naming traps

- **Separators and suffixes.** `Agent S` is the repo `Agent-S`; `MoneyPrinterV2` is not `MoneyPrinter`. Keep version suffixes.
- **Same-named clones.** Popular names collect copies: a search for `MoneyPrinterV2` finds 20+ repos with that exact name. The original usually has the stars; copies have a handful.
- **Moved repositories.** A printed `cyclotruc/gitingest` now lives at `coderamp-labs/gitingest`; GitHub answers the old slug with a redirect. Report the current URL and mention the old one.
- **Mirror hosts.** `gitingest.com/<owner>/<repo>` and `www.github.com/...` are read as the same `owner/repo`. Other hosts (`gitlab.com`, `example.com`) are not GitHub references; the helper falls back to the name if one was given.
- **Not every named thing is a repo.** Hosted products and companies may have no public repository. `not_found` is a valid outcome.
- **Image text errors.** OCR confuses `l`/`I`/`1` and `O`/`0`. If a name looks odd, report it as unverified before searching.

## How the helper decides

Printed `url` or `owner/repo` → one request, `GET /repos/{owner}/{repo}`:

- exists → `verified`. A response whose `full_name` differs from the request means the repo was renamed or transferred: `match.renamed_from` holds the old slug.
- 404 → `not_found`. The helper does not try to "repair" a printed link by searching.
- A printed star count outside the window adds a note, not a failure.

Name only → `GET /search/repositories?q="<spelling>" in:name&per_page=30` in GitHub's default best-match order. Spellings are tried in order `Agent-S`, `AgentS`, `Agent S` and the loop stops at the first spelling that yields an exact-name repo. Then:

1. **Exact name** = same letters and digits as the printed name, ignoring case and separators. No exact name → `low` (partial matches listed, none chosen).
2. **Star window.** A printed count `P` supports a repo with `0.9 × P ≤ stars ≤ 2 × P`. Outside the window the repo is ruled out. Stars grow after a post and printed values are rounded, hence the asymmetric window.
3. **Keywords.** A hint word found in the repo's description or topics supports it. Words that are part of the project name, and stop words such as `open`, `source`, `free`, are ignored, because every same-named repo contains them. A missing keyword never rules a repo out.
4. **No hints at all** (no stars, no usable keywords):
   - one exact-name repo → `medium`;
   - several, and the most popular has at least 10× the stars of the next → `medium`;
   - otherwise → `ambiguous`.
5. **With hints.** Take the most popular supported repo as the pick.
   - Nothing supported → `low`.
   - A more popular exact-name repo that is not ruled out exists → `ambiguous` (the pick might be a lookalike of the real one).
   - Another supported repo within 10× of the pick's stars → `medium`.
   - Otherwise → `high`.

Why popularity is not the answer by itself: with no printed stars, `Fabric` has several repos within 3× of each other, and picking the biggest is a guess. The helper names the guess `ambiguous` and shows the facts.

Exit code `0` only when every result is `verified`, `high`, or `medium`. A `medium` result still goes into the report labeled "verify".

## Report template

```markdown
| Project | Repository | Confidence | Found by | Notes |
|---|---|---|---|---|
| MoneyPrinterV2 | https://github.com/FujiwaraChoki/MoneyPrinterV2 | high | name search; stars match the printed 3.16만 | none |
| gitingest | https://github.com/coderamp-labs/gitingest | verified | printed link | moved from cyclotruc/gitingest |
```

Add a plain sentence when the image carried no link at all: "No URL appears in the image; these were resolved by name against the GitHub API."

## OCR fallback

When the host cannot see images and `tesseract` is installed:

```bash
tesseract "$IMAGE" - -l kor+eng --psm 6
```

Use `--psm 11` for sparse text such as thumbnails. Read the output as a draft: names, URLs, and counts all need the same verification as image-read text.
