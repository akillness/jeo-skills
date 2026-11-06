# GitHub API Notes

What `scripts/resolve_repo.py` calls, what it observed, and how to do the same by hand.

## Endpoints used

| Purpose | Request |
|---|---|
| Printed link or `owner/repo` | `GET /repos/{owner}/{repo}` |
| Name search | `GET /search/repositories?q="<spelling>" in:name&per_page=30` |

Both send `Accept: application/vnd.github+json` and `X-GitHub-Api-Version: 2022-11-28`. The helper makes no other request and writes nothing.

## Search behavior worth knowing (observed 2026-11-06)

- `in:name` matches word tokens, not the literal string. An unquoted `Agent S in:name` matched `agent-skills` repos; the real `simular-ai/Agent-S` was absent from the first page. Quoting the hyphenated spelling (`"Agent-S" in:name`) returned it first.
- `sort=stars` buries exact names under popular partial matches (`agent-skills` repos with 30k+ stars outranked `Agent-S`). The helper therefore uses the default best-match order and does its own exact-name ranking.
- Exact-name collisions are common: `Fabric` matched 19 repositories and `gitingest` 14 within the first page of 30 results.
- Forks are excluded from search by default.

## Renames and transfers

`GET /repos/{old-owner}/{old-name}` for a moved repo answers `301` with `Location: https://api.github.com/repositories/<id>`. The helper follows redirects only to the same host (so a token cannot be redirected elsewhere), compares the returned `full_name` with the request, and records `renamed_from` on a difference. A redirect to another host is reported as `redirect_off_host`.

## Rate limits and tokens

| | Unauthenticated | With token |
|---|---|---|
| Core (`/repos/...`) | 60 per hour | 5,000 per hour |
| Search | 10 per minute | 30 per minute |

`GITHUB_TOKEN` or `GH_TOKEN`, when set, is sent as a bearer token to `api.github.com` only; with any other `--api-base` it is withheld. The helper never prints it. A 403 or 429 caused by exhaustion becomes `error.code = "rate_limited"` with the reset time, and the remaining candidates in the batch are skipped without further requests so one limit hit cannot turn into a burst of failures. Batches are capped at 25 candidates.

## Error codes in results

| `error.code` | Cause |
|---|---|
| `rate_limited` | 403/429 with `x-ratelimit-remaining: 0` or a rate-limit message |
| `network` | DNS, connection, or timeout failure |
| `redirect_off_host` | A redirect pointed at another host |
| `bad_response` | Non-JSON body or a body over 4 MiB |
| `unsupported_url` | A `url` that is not a GitHub repository reference and no `name` to fall back on |
| `http_<code>` | Any other HTTP error status |

## Doing it by hand

Without Python, use `gh` or `WebFetch` and apply the rules in `extraction-and-confidence.md`:

```bash
gh api "search/repositories?q=%22Agent-S%22+in:name&per_page=30" --jq '.items[] | [.full_name, .stargazers_count, .description] | @tsv'
gh api repos/cyclotruc/gitingest --jq '.full_name'   # prints the current slug after a rename
```

A manual answer still needs an exact-name check, the printed-star check, and the "is there a more popular same-named repo" check before it can be called more than a lead.
