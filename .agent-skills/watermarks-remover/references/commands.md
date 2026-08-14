# Watermarks Remover command reference

Curated from `python3 <script>.py --help` in the upstream repo
(`skills/remove-ai-marks/scripts/`), grouped by workflow stage. Run any
script with `--help` for the authoritative, version-pinned flag list.
`SCRIPTS` below means `<clone>/skills/remove-ai-marks/scripts`.

## Unified inspect / clean (any supported format)

```
python3 "$SCRIPTS/inspect_file.py" path [--json] [--aggressive] [--as {text,image,container,auto}] [--force-text]
python3 "$SCRIPTS/clean_file.py" path [-o OUTPUT] [--in-place] [--json] [--nfkc]
    [--aggressive-homoglyphs] [--keep-non-ai-metadata] [--as {auto,text,image,container}] [--force-text]
```

`--as` overrides format auto-detection; `--force-text` treats binary
containers as raw text (destructive if misused — prefer the router).
`--keep-non-ai-metadata` on `clean_file.py` only drops C2PA/AI-looking
image segments instead of all metadata.

## Text — Layer A (invisible Unicode / space homoglyphs)

```
python3 "$SCRIPTS/inspect_text.py" [path|-] [--json] [--aggressive] [--strip-emoji-glue] [--force-text]
python3 "$SCRIPTS/clean_text.py" [path|-] [-o OUTPUT] [--nfkc] [--aggressive-homoglyphs]
    [--no-normalize-spaces] [--strip-emoji-glue] [--stats] [--force-text] [--in-place]
```

`--aggressive` / `--aggressive-homoglyphs` additionally flag Latin
confusable / fullwidth lookalikes. `--strip-emoji-glue` is a paranoid flag
that also flags emoji presentation selectors/ZWJ even right after an emoji
base (off by default to avoid false positives on legitimate emoji).

## Text — Layer B (statistical rewrite hook)

```
python3 "$SCRIPTS/rewrite_text.py" [path|-] [-o OUTPUT]
    --backend {print-prompt,ollama,openai-compatible}
    [--model MODEL] [--base-url BASE_URL] [--allow-remote]
    --strength {paraphrase,backtranslate,structural,humanize,code}
    [--lang LANG] [--original-lang ORIGINAL_LANG]
    [--timeout TIMEOUT] [--temperature TEMPERATURE] [--candidates N]
    [--no-layer-a-after] [--json-stats] [--force-text]
```

Env: `WATERMARKS_REWRITE_BACKEND`, `WATERMARKS_REWRITE_BASE_URL`,
`WATERMARKS_REWRITE_MODEL`, `WATERMARKS_REWRITE_API_KEY` (env-only, never
argv), `WATERMARKS_REWRITE_ALLOW_REMOTE=1` to permit non-loopback
endpoints. Redirects are refused outright so an API key can never leak to
an unvalidated host. `--candidates N` generates N rewrites and keeps the
most lexically diverged one (bigram Jaccard distance) with a length-drift
guard.

## Images

```
python3 "$SCRIPTS/inspect_image.py" path [--json]
python3 "$SCRIPTS/clean_image.py" path [-o OUTPUT] [--keep-non-ai-metadata] [--remove-pixel ctrlregen]
```

Both auto-report a pixel-domain SynthID confidence score when
`REVERSE_SYNTHID_DIR` is set to a bootstrapped checkout (detection only).
`--remove-pixel ctrlregen` on `clean_image.py` chains: metadata strip →
CtrlRegen pixel removal → optional before/after SynthID score.

## Optional external backends (not bundled)

```
"$SCRIPTS/setup_synthid.sh" [--dir PATH] [--ref REF] [--full]
REVERSE_SYNTHID_DIR=~/reverse-SynthID <that venv python> "$SCRIPTS/score_synthid.py" path
    [--upstream-dir DIR] [--codebook PATH] [--model MODEL] [--json]

"$SCRIPTS/setup_ctrlregen.sh"
NOAI_WATERMARK_DIR=~/noai-watermark <that venv python> "$SCRIPTS/clean_ctrlregen.py" path
    [-o OUTPUT] [--upstream-dir DIR] [--strength 0.15-0.7] [--steps N]
```

`score_synthid.py` exit codes: `0` scored, `1` scorer runtime error, `2`
bad input, `3` scorer unavailable (not configured / missing deps /
missing codebook). CtrlRegen strength presets: `0.15` minimal / `0.25`
default / `0.35` balanced / `0.5` aggressive / `0.7` max (backend default
0.5); `--steps` defaults to 50 (effective denoising steps ≈ steps ×
strength). Both scripts require `HF_TOKEN` as an env var (never argv) for
gated upstream models where applicable.

## Aggregate audits

```
python3 "$SCRIPTS/audit_dir.py" DIR [--json] [--skip DIR1,DIR2]
python3 "$SCRIPTS/audit_website.py" [--sitemap URL] [--base URL]
    [--max-pages N] [--timeout SECONDS] [--max-bytes N] [--json]
```

`audit_dir.py` recursively inspects supported text/image/container files
and classifies every finding as `confirmed` / `probable` / `informational`
/ `likely_false_positive`. `audit_website.py` is stdlib-only, downloads
each sitemap URL, and does not invoke `c2patool`/`exiftool` for remote
assets — download and run `audit_dir.py` locally for that level of detail.

## Docker (optional, for the heavy backends)

```
make docker-synthid-build && docker run --rm --user "$(id -u):$(id -g)" --read-only --tmpfs /tmp \
  -v "$(pwd):/data" watermarks-remover-synthid-scorer /data/shot.png

make docker-ctrlregen-build && docker run --rm -e HF_TOKEN="$HF_TOKEN" --user "$(id -u):$(id -g)" \
  -v "$(pwd):/data" watermarks-remover-ctrlregen /data/shot.png -o /data/shot.ctrlregen.png
```

Both images are built locally from the upstream source; neither backend
is published, so building locally avoids redistributing upstream code.
