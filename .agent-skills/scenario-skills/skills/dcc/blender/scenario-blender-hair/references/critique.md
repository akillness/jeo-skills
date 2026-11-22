# Critique rubric: judging a groom like the experts

Use this after every stage:

1. Run `H.groom_report(hair)` and `H.verdict(...)`.
2. Render `H.review([surface, hair], out, engine, views=...)`.
3. Open the sheet with the image reader.
4. Mark each line **OK** or **FIX**.

A FIX marked **B** (blocker) stops the next stage. **P** (polish) can wait for the polish pass.
Never deliver without a full-density render; the viewport at 4% hides most of these (Thommes
`[00:19:32]`).

## A. Attachment and setup (code)

| Check                                                   | How                                                                       | Sev | Source                                         |
| ------------------------------------------------------- | ------------------------------------------------------------------------- | --- | ---------------------------------------------- |
| Surface UVs not stacked (UDIM fine), mirror seam merged | `H.uv_report(surface)["overlap_faces"] == 0`                              | B   | Schmidbauer `[00:38:24]`, `[00:39:00]`         |
| Surface and UV map set, every guide attached            | report `uv_map_on_surface`, `has_attachment_uv`, `attachment_uv_nan == 0` | B   | Schmidbauer `[00:37:50]`                       |
| Roots on the surface                                    | `roots_off_surface == 0` (after surface edits: snap DEFORM or NEAREST)    | B   | Thommes `[00:03:04]`, Schmidbauer `[00:39:36]` |
| Object scale applied                                    | `surface.scale == (1, 1, 1)`: density counts local area                   | P   | verified 5.2.1                                 |
| Hair Dynamics last (animated)                           | `modifiers[-1] == "Hair Dynamics"`                                        | B   | 5.2 replacement of Surface Deform              |
| No hair inside the mouth or eyes                        | mouth interior separated from the surface, and Density Mask 0 there       | B   | Schmidbauer `[00:34:23]`                       |

## B. Guides (render the guides alone with a thick Profile, or Workbench)

| Check                                                     | Look for                                                      | Sev | Source                                         |
| --------------------------------------------------------- | ------------------------------------------------------------- | --- | ---------------------------------------------- |
| Directions per region match the flow plan and draw-over   | arrows on the reference vs guide directions, region by region | B   | Schmidbauer `[00:07:36]`                       |
| Even spacing                                              | `spacing_gaps_2x == 0`; no visible holes in the guide layer   | B   | Schmidbauer `[00:11:36]`                       |
| Low point count while blocking                            | `points_per_guide` 2 to 3 until directions are right          | P   | Schmidbauer `[00:21:00]`                       |
| Gradual lengths                                           | `length_outliers == 0`; no short patch among long guides      | B   | Schmidbauer `[00:36:05]`                       |
| No guide inside thin geometry (ears) or crossing the part | pose-free render from 3 views; part-side roots comb away      | B   | Schmidbauer `[00:41:56]`, Bystedt `[00:02:53]` |

## C. Density and coverage (full-density render, rest pose)

| Check                      | Look for                                                                       | Sev | Source                             |
| -------------------------- | ------------------------------------------------------------------------------ | --- | ---------------------------------- |
| No bald spots              | skin showing through in patches, especially at region borders and object seams | B   | Schmidbauer `[00:33:16]`           |
| Not a solid mass           | strands readable; `root_area_fraction` well under 0.5 (Thommes' fur is 0.13)   | B   | Thommes `[00:16:44]`               |
| No blobs from over-density | lumpy shapes that show every ripple                                            | P   | Schmidbauer `[00:12:42]`           |
| Part and crown (human)     | no scalp stripe at the part, crown not flat from the top view                  | B   | Bystedt `[00:31:29]`, `[00:33:15]` |
| Density mask edges         | no hard density border unless the reference has one                            | P   | Bystedt `[00:22:04]`               |
| Budget                     | `H.count(hair)` full curves and points vs the stated budget                    | B   | brief                              |

## D. Variation: Thommes' first-render critique plus Schmidbauer's "never straight"

| Check                               | Look for                                                                                 | Sev | Source                                         |
| ----------------------------------- | ---------------------------------------------------------------------------------------- | --- | ---------------------------------------------- |
| Clumps not uniform                  | identical clump sizes or spacing: add a second clump layer (Guide Mask) and Clump Offset | P   | Thommes `[00:19:32]`, `[00:31:01]`             |
| Strays between clumps               | a few runaway hairs (about 10% of curves)                                                | P   | Thommes `[00:29:54]`                           |
| Lengths vary                        | tips all ending on one surface: Trim with Replace Length off and Random Offset           | B   | Schmidbauer `[00:27:26]`, Thommes `[00:21:46]` |
| Tips curl slightly (human)          | ruler-straight tips read as CG: Roll at the tip                                          | P   | Bystedt `[00:14:32]`                           |
| Frizz on a minority                 | uniform fuzz everywhere: per-curve mask, about 20% of curves                             | P   | Thommes `[00:26:03]`                           |
| Clumps readable but not "too crazy" | A/B the clump layer; use Tip Spread and Clump Offset if needed                           | P   | Schmidbauer `[00:30:18]`, Bystedt `[00:21:31]` |
| Duplicated layers differ            | two populations moving identically: change seed and frequency                            | P   | Bystedt `[00:29:08]`                           |
| Curl tips preserved                 | frizz destroying curl shapes: negative Frizz Shape                                       | P   | Thommes `[00:15:04]`                           |
| Every layer earns its place         | toggling it off in a render makes a visible difference                                   | P   | Thommes `[00:26:37]`                           |

## E. Subject-specific

**Animals (Schmidbauer)**

- Likeness: landmark regions (ruff, chest, back, tail fan) read as in the reference of the same
  subspecies and season `[00:03:24]`, `[00:07:36]`. Sev B.
- Each region has its own character (cheeks clumpy, chest straight), set by masks `[00:28:35]`. Sev
  P.
- Seams between landmark objects: no density jump and no clipping `[00:13:49]`. Sev B.

**Human hairstyle (Bystedt)**

- Wide and thin clump populations overlap, flyaways are few, and art-directed strands are placed
  `[00:01:43]`. Sev P.
- Hairline and nape: roots hidden, soft transition (hair cap texture or an extra system) (Bystedt
  g_ZIOafq4QU `[00:22:28]`, Matsumoto `[00:40:21]`). Sev P.

## F. Shading and light (Cycles or EEVEE render)

| Check                       | Look for                                                                                                                | Sev | Source                               |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --- | ------------------------------------ |
| Right shader for the engine | EEVEE plus Principled Hair BSDF means dark and flat (0.09 vs 0.26 luminance in the test)                                | B   | Thommes `[00:18:25]`                 |
| Root to tip gradient        | root darker than tip (Intercept)                                                                                        | P   | Thommes `[00:18:25]`                 |
| Per-strand variation        | color and roughness vary between strands (Random, surface-UV noise)                                                     | P   | Thommes `[00:20:04]`                 |
| Highlights                  | stretched along strands, not round blobs; they move plausibly when the light moves (for cards: anisotropy plus tangent) | P   | Matsumoto `[00:11:37]`, `[00:14:20]` |
| Display                     | not Strand in EEVEE (radius invisible); Strip plus subdivisions                                                         | B   | Bystedt `[00:10:23]`                 |
| Sparkle                     | EEVEE strips can sparkle under a grazing rim light (seen in the tests); judge in Cycles or soften the rim               | P   | test observation [added]             |
| Review light                | warm top fill, side key, cool rim, darker bluish world                                                                  | P   | Thommes `[00:17:16]`                 |

## G. Deformation (render 2 to 3 extreme poses, same camera)

| Check                   | Look for                                                                                 | Sev | Source                   |
| ----------------------- | ---------------------------------------------------------------------------------------- | --- | ------------------------ |
| No gaps in pose         | bald stretches at joints and folds                                                       | B   | Schmidbauer `[00:44:23]` |
| No clipping             | strands inside the body in pose                                                          | B   | Schmidbauer `[00:33:50]` |
| Mesh deformation smooth | harsh mesh folds are amplified ten times in the hair: fix the rig or mesh, not the groom | B   | Schmidbauer `[00:33:50]` |

## H. Cards and tubes (games, EEVEE)

| Check                                       | How / look for                                                                                | Sev | Source                             |
| ------------------------------------------- | --------------------------------------------------------------------------------------------- | --- | ---------------------------------- |
| Card planes invisible from the main camera  | no flat ribbons edge-on; cards lie along the scalp (root faces mean \|n · surface n\| near 1) | B   | Bystedt g_ZIOafq4QU `[00:03:26]`   |
| Roots on the scalp, nothing inside the head | `card_stats`, root-row distance, inside test                                                  | B   | Bystedt `[00:03:59]`, `[00:04:34]` |
| Coverage                                    | textured hair cap underneath; no bald look between cards                                      | B   | Bystedt `[00:22:28]`               |
| Budget and UVs                              | tris vs budget; card U in [0, 0.5], tubes [0, 1]; V root 0 to tip 1                           | B   | Matsumoto `[00:31:27]`             |
| Card and tube match                         | same width and texture density when switching                                                 | P   | Matsumoto `[00:24:21]`             |
| Long cards bend smoothly                    | about 1 subdivision per 20 cm                                                                 | P   | Bystedt `[00:05:08]`               |

## Delivery report (what to hand back)

- Counts: guides, full-density curves and points, card triangles.
- Stack: modifier list with key inputs (`H.get_inputs`).
- `verdict()` output, empty or explained.
- Review sheets: the rest pose, 2 to 3 poses, and a close-up if hero.
- What was **not** verified: brush-only steps the user did, Physics-mode dynamics, render time at
  final resolution.
