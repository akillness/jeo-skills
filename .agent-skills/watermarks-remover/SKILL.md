---
name: watermarks-remover
description: >
  Strip multi-vendor AI provenance marks from text and files using the
  guillaumemeyer/watermarks-remover Python toolkit: invisible Unicode/space
  homoglyphs (Layer A, deterministic), statistical token-sampling watermarks
  via agent-guided rewrite (Layer B, best-effort), and C2PA/EXIF/XMP/doc-props
  metadata on PNG, JPEG, SVG, PDF, DOCX, ODT, HTML, and Markdown. Covers
  Claude, Gemini/SynthID-Text, OpenAI provenance surfaces, and open-LLM
  Kirchenbauer-style marks, plus optional external backends for SynthID pixel
  scoring and CtrlRegen pixel-domain removal. Use when the user wants to
  strip AI watermarks, remove C2PA / Content Credentials, clean AI metadata
  from a file, remove invisible Unicode / zero-width characters from
  AI-generated text, or audit a directory/website for AI provenance signals.
  Triggers on: "remove watermark", "strip C2PA", "remove AI metadata", "clean
  invisible unicode", "remove-ai-marks", "SynthID removal", "audit_dir.py",
  "Layer A / Layer B watermark removal".

allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Python 3.10+ stdlib only for the core inspect/clean scripts (no pip
  install required beyond the clone). Optional system tools `c2patool` and
  `exiftool` improve C2PA/PDF handling when present. Optional heavy external
  backends (SynthID pixel scoring via `aloshdenny/reverse-SynthID`, CtrlRegen
  pixel removal via `mertizci/noai-watermark`) need their own venvs, ~10 GB
  of model downloads, and a GPU is strongly recommended for CtrlRegen. MIT
  license.
metadata:
  tags: watermark-removal, ai-provenance, c2pa, synthid, unicode-scrub, metadata-stripping, privacy-hygiene, exif, content-credentials, python
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "1.0"
  source: https://github.com/guillaumemeyer/watermarks-remover
---

# Watermarks Remover — strip AI provenance marks

Agent skill wrapping `guillaumemeyer/watermarks-remover`, a set of stdlib
Python scripts that remove multi-vendor AI provenance marks from **text**
(invisible Unicode, statistical sampling watermarks) and **files** (C2PA /
EXIF / XMP / document properties). It is for privacy and hygiene on content
**you own or are authorized to process** — not for academic fraud or
falsely claiming "human-written" origin.

## When to use this skill

- Stripping invisible Unicode, bidi controls, tag characters, or exotic
  space homoglyphs that AI tools silently inject into generated text
- Removing C2PA manifests, EXIF/XMP AI-provenance fields, or generator
  metadata from PNG, JPEG, SVG, PDF, DOCX, ODT, HTML, or Markdown files
- Reducing a statistical (token-sampling) watermark's signal in AI-written
  prose via a guided rewrite pass, while preserving facts/names/numbers
- Auditing a whole directory tree or a live website (via its sitemap) for
  AI provenance signals and getting a confidence-classified report
- Optionally scoring or removing a pixel-domain SynthID-class watermark on
  an image, using the project's external bootstrap scripts

## When not to use this skill

- The user wants a guarantee that a vendor's official detector will fail —
  this toolkit only reports verifiable removals plus best-effort rewrites;
  no local tool can certify that outcome
- Removing audio/video watermarks or defeating training-data backdoor
  triggers — explicitly out of scope upstream
- Clearing **C2PA soft binding** (a watermark that re-links a stripped file
  to a remote Content Credentials manifest) — stripping hard-bound C2PA
  metadata does not clear this channel
- The user's stated goal is academic fraud, plagiarism, or a false
  "human-written" claim about content they don't own — warn per
  `skills/remove-ai-marks/references/ethics.md` upstream and only perform
  technical cleaning on content they are authorized to process

## Instructions

### Step 1: Clone the repo and resolve the scripts directory

```bash
git clone --depth 1 https://github.com/guillaumemeyer/watermarks-remover.git
SCRIPTS=watermarks-remover/skills/remove-ai-marks/scripts
```

The toolkit is not published as a pip package; it is consumed as a
standalone script directory (Python 3.10+ stdlib only). `c2patool` and
`exiftool` are auto-detected and used when present, especially for PDF.

### Step 2: Pick the right layer for the input

| Input | Path |
| --- | --- |
| Pasted text / `.txt` / code | Text Layer A (`inspect_text.py` / `clean_text.py`) |
| `.md` / `.html` | Container clean (frontmatter/meta) + Layer A |
| `.png` / `.jpg` / `.jpeg` | Image metadata strip (`inspect_image.py` / `clean_image.py`) |
| `.svg` / `.pdf` / `.docx` / `.odt` | Container metadata strip |
| Mixed / unknown | Unified `inspect_file.py` / `clean_file.py` (auto-routes by format) |
| Directory | `audit_dir.py` for an aggregate report |
| Website / sitemap | `audit_website.py` |

Text tools refuse binary input by default (magic-number + control-byte
detection) so a `.docx`/`.pdf`/image never gets mangled by decoding its
compressed bytes as text; pass `--force-text` to override, or use the
`_file.py` unified tools which route correctly on their own.

### Step 3: Inspect before cleaning

```bash
python3 "$SCRIPTS/inspect_file.py" --json path/to/input
python3 "$SCRIPTS/inspect_text.py" --json path/or/-
python3 "$SCRIPTS/inspect_image.py" --json image.png
```

Findings are classified `confirmed` / `probable` / `informational` /
`likely_false_positive`. Summarize suspicious codepoints and C2PA/AI flags
before cleaning; do not silently overwrite the original.

### Step 4: Deterministic clean (Layer A + file metadata)

```bash
python3 "$SCRIPTS/clean_text.py" INPUT -o OUTPUT --stats
python3 "$SCRIPTS/clean_file.py" INPUT -o OUTPUT       # unified, any supported format
python3 "$SCRIPTS/inspect_file.py" OUTPUT               # verify the result
```

Prefer writing `*.cleaned.*` outputs unless the user explicitly asked for
an in-place edit (`--in-place` is available but destructive).

### Step 5: Always offer Layer B (statistical rewrite) for prose

After Layer A, propose — do not silently skip — a rewrite pass for
natural-language content to reduce a token-sampling watermark's signal:

```bash
python3 "$SCRIPTS/rewrite_text.py" draft.md --backend print-prompt --strength paraphrase
```

`print-prompt` is the CI-safe default (no model call; it just emits the
rewrite prompt for the agent to run itself). Local Ollama or an
OpenAI-compatible backend can be wired via env vars:

```bash
export WATERMARKS_REWRITE_BACKEND=ollama
export WATERMARKS_REWRITE_MODEL=llama3.2
python3 "$SCRIPTS/rewrite_text.py" draft.md -o draft.rewritten.md --strength paraphrase
```

Rules: API keys come from `WATERMARKS_REWRITE_API_KEY` only (never on
argv); non-loopback endpoints are refused unless `--allow-remote` or
`WATERMARKS_REWRITE_ALLOW_REMOTE=1` is set explicitly; prefer a rewrite
model that is **not** the suspected origin vendor, to avoid re-stamping.
Always tell the user this step trades prose quality (voice/tone) for
hygiene — see the upstream README's "Disclaimer" section — and is
best-effort, never a certified bypass.

### Step 6: Optional pixel-domain SynthID scoring / CtrlRegen removal

Only reach for these when the input is an **image** with a suspected
pixel-domain watermark (SynthID-class, StegaStamp, Tree-Ring,
StableSignature). Both are heavy, external, and not bundled in this repo:

```bash
# Detection-only score (external aloshdenny/reverse-SynthID checkout)
"$SCRIPTS/setup_synthid.sh"
REVERSE_SYNTHID_DIR=~/reverse-SynthID ~/reverse-SynthID/.venv/bin/python "$SCRIPTS/score_synthid.py" shot.png

# Removal (external mertizci/noai-watermark checkout; conservative default strength 0.25)
"$SCRIPTS/setup_ctrlregen.sh"
NOAI_WATERMARK_DIR=~/noai-watermark ~/noai-watermark/.venv/bin/python \
  "$SCRIPTS/clean_ctrlregen.py" shot.png -o shot.ctrlregen.png
```

Expect ~10 GB of model downloads and a strong GPU recommendation for
CtrlRegen; CPU runs are slow. `clean_image.py --remove-pixel ctrlregen`
also wires this into the unified image pipeline after a metadata strip.
CtrlRegen's backend ships no LICENSE file (treated as all-rights-reserved)
and is only ever loaded at runtime from the user's own checkout.

### Step 7: Aggregate audits for a tree or a website

```bash
python3 "$SCRIPTS/audit_dir.py" DIR --json
python3 "$SCRIPTS/audit_website.py" --sitemap https://example.com/sitemap.xml --json
python3 "$SCRIPTS/audit_website.py" --base https://example.com --json   # auto-discovers the sitemap
```

`audit_website.py` is stdlib-only and does not shell out to
`c2patool`/`exiftool` for remote URLs; download assets and run
`audit_dir.py` locally when that level of detail is needed.

### Step 8: Use the wrapper for a read-only environment check

```bash
bash .agent-skills/watermarks-remover/scripts/watermarks-remover.sh doctor <repo-dir>
bash .agent-skills/watermarks-remover/scripts/watermarks-remover.sh inspect <repo-dir> <file>
bash .agent-skills/watermarks-remover/scripts/watermarks-remover.sh clean <repo-dir> <file> <output>
```

`doctor` only reports Python version and optional-tool availability
(`c2patool`, `exiftool`); it never writes to disk or installs packages.

## Best practices

1. **Inspect before you clean, and verify after** — `inspect_*` first,
   `clean_*` second, `inspect_file.py` on the output third.
2. **Never overwrite silently** — default to `*.cleaned.*` output paths;
   only use `--in-place` on explicit user request.
3. **Always offer Layer B, but be honest about its cost** — statistical
   watermark removal means rewording, and rewording degrades voice/tone;
   surface that trade-off rather than silently rewriting production copy.
4. **Prefer a non-origin rewrite model** — rewriting Claude text with
   Claude (or Gemini with Gemini) risks re-stamping the same watermark
   class into the output.
5. **Report confidence honestly** — distinguish `confirmed`/`probable`
   findings from `informational`/`likely_false_positive` noise, and never
   claim an official vendor detector will fail.
6. **Treat C2PA soft binding and pixel/audio/video marks as out of scope**
   for the deterministic path — only the optional external CtrlRegen
   backend addresses pixel-domain image marks, and even then only as a
   best-effort regenerating remover.
7. **Keep heavy backends opt-in** — don't run `setup_synthid.sh` /
   `setup_ctrlregen.sh` unless the user actually needs pixel-domain
   scoring/removal; they pull GBs of dependencies and models.

## References

- [references/commands.md](references/commands.md) — curated command reference by workflow stage
- [scripts/watermarks-remover.sh](scripts/watermarks-remover.sh) — read-only doctor + thin inspect/clean wrappers
- Upstream repo: [guillaumemeyer/watermarks-remover](https://github.com/guillaumemeyer/watermarks-remover)
- Upstream skill: [`skills/remove-ai-marks/SKILL.md`](https://github.com/guillaumemeyer/watermarks-remover/blob/main/skills/remove-ai-marks/SKILL.md)
- Upstream ethics notes: [`skills/remove-ai-marks/references/ethics.md`](https://github.com/guillaumemeyer/watermarks-remover/blob/main/skills/remove-ai-marks/references/ethics.md)
- Project standards: `.agent-skills/skill-standardization/SKILL.md`

## Examples

### Example 1: Clean a Markdown draft and verify

```bash
git clone --depth 1 https://github.com/guillaumemeyer/watermarks-remover.git
SCRIPTS=watermarks-remover/skills/remove-ai-marks/scripts
python3 "$SCRIPTS/inspect_file.py" --json draft.md
python3 "$SCRIPTS/clean_file.py" draft.md -o draft.cleaned.md
python3 "$SCRIPTS/inspect_file.py" draft.cleaned.md
```

### Example 2: Strip C2PA/EXIF from a screenshot, then check for a pixel watermark

```bash
python3 "$SCRIPTS/inspect_image.py" shot.png
python3 "$SCRIPTS/clean_image.py" shot.png -o shot.cleaned.png
```

### Example 3: Environment check before recommending a workflow

```bash
bash .agent-skills/watermarks-remover/scripts/watermarks-remover.sh doctor ~/src/watermarks-remover
```
