# Changelog

Full project history lives here as **monthly files**; the top-level `README.md`
and `README.ko.md` show only the **latest 5 dates** between the
`<!-- WHATS-NEW:START -->` / `<!-- WHATS-NEW:END -->` markers. That window is
**generated**, not hand-edited — which is what keeps the skill counts and dates
from drifting out of sync the way they used to.

```
changelog/
├── en/YYYY-MM.md   # English entries, one file per month
└── ko/YYYY-MM.md   # Korean entries, one file per month
```

## Add a new entry

1. Append a dated section to the current month's file in **both** `en/` and `ko/`,
   newest first, using the existing block shape:

   ```markdown
   ## 🆕 What's New in v2026-07-01      <!-- en/2026-07.md -->

   | Change | Details |
   |--------|---------|
   | **my-skill: one-line headline** | What changed, why, and the install line. |
   ```

   The Korean file uses the `## 🆕 vYYYY-MM-DD 업데이트` heading instead.

2. Regenerate the README windows and verify:

   ```bash
   python3 scripts/changelog.py sync     # rewrite the latest-5-date window in both READMEs
   python3 scripts/changelog.py check    # exit 1 if a README window is stale (CI-friendly)
   ```

`scripts/changelog.py` is stdlib-only (no dependencies). `extract` was the
one-time migration that created these files from the old in-README changelog;
day-to-day you only need `sync` and `check`.
