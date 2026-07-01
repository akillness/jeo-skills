# Evaluation and venue style packs

## VLM-as-a-Judge evaluation

`paperbanana evaluate` compares a generated diagram against a human reference using a
VLM-as-a-Judge, scoring four dimensions with hierarchical aggregation (per the paper):

- **Primary**: Faithfulness (does the figure match the source method/context?),
  Readability (is it legible and well-organized?)
- **Secondary**: Conciseness (no redundant clutter), Aesthetics (visual quality)

```bash
paperbanana evaluate \
  --generated diagram.png \
  --reference human_diagram.png \
  --context method.txt \
  --caption "Overview of our framework"
```

Required: `--generated/-g`, `--reference/-r`, `--context` (text or PDF), `--caption/-c`.
PDF context supports `--pdf-pages`. Use evaluation as the objective gate before claiming a
figure is publication-ready, and as the ranking signal behind `sweep`'s
`quality_proxy_score`.

The MCP surface exposes `evaluate_diagram` and `evaluate_plot` for agent-driven scoring.

## Venue style packs

A venue style pack is a directory with `methodology_style_guide.md`,
`plot_style_guide.md`, and an optional `venue.yaml`. The Stylist agent applies the pack's
aesthetics (palette, layout, typography) during Phase 1.

Built-in packs: `neurips` (default), `icml`, `acl`, `ieee`. On a name clash built-in packs
win — user packs cannot shadow them. Unknown venue names fail fast with the available list.

```bash
# Scaffold a custom pack (seeded from NeurIPS templates)
paperbanana venues init mylab

# Or synthesize guides from a corpus of example figures
paperbanana guidelines synthesize --reference-set ./examples \
  --output ~/.config/paperbanana/venues/mylab/methodology_style_guide.md

# Use it anywhere --venue is accepted
paperbanana generate --input method.txt --caption "Overview" --venue mylab
paperbanana venues list
```

`venue.yaml` (all fields optional):

```yaml
display_name: "My Lab Style"
aspect_ratio: "16:9"
fonts:
  - "Helvetica"
```

Custom packs live under `~/.config/paperbanana/venues/` (override with `--venue-dir` or
`PAPERBANANA_VENUE_DIR`) — no repo edits needed. `--venue` is accepted by `generate`,
`plot-batch`, and `polish`.

## Reference dataset

Retrieval uses a curated reference set. Download PaperBananaBench (~254 MB, SHA256-verified,
cached under `~/.cache/paperbanana/`, override with `PAPERBANANA_CACHE_DIR`):

```bash
paperbanana data download            # diagrams
paperbanana data download --task plot
paperbanana data download --task both
paperbanana data info                # inspect cache
paperbanana data clear               # clear cache
```

Generation commands can fetch it on first use with `--auto-download-data`.
