# Critique rubric (the lighter judges its own frames)

Use after every stage, on the SAME `AgentView_*` bookmarks, with
`ut_lighting.stage_review(capture, previous=<last stage review>)` and the contact sheet opened. A
stage passes when every measurable line holds and the visual lines were checked by looking.
Thresholds marked [added] are this skill's start values for a stylized, display-referred review;
tune them per art direction and write the change down.

## 1. Frame sanity (every capture)

| Check                        | Measure                                                             | Pass                                                                | Source                           |
| ---------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------- |
| Something rendered           | `image_checks` flags `all_white`, `all_black`, `uniform`, `magenta` | none set                                                            | scenario-unity-expert            |
| Not the first-frame artifact | saturation vs previous stage                                        | no sudden collapse                                                  | observed (AgentCapture warms up) |
| Highlights                   | `clipped_fraction` (luma >= 250)                                    | <= 5% (15% with expect="bright": snow, overcast sky, a window view) | [added]                          |
| Shadows                      | `crushed_fraction` (luma <= 5)                                      | <= 30% (60% night)                                                  | [added]                          |
| Overall exposure             | `log_avg_ev` of the display image                                   | -2.5 to +1.5 (night -4.5)                                           | ut_review                        |

## 2. Exposure and balance (gray cards)

An 18% gray card (linear albedo 0.18, sRGB 0.461) is the lighter's anchor in URP, which has no
physical light units or auto exposure in 6.3. Place one square to the sun, one in shade (facing up),
one per interior zone.

| Check                       | Measure                                                                                       | Pass                                                       | Source                                           |
| --------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------ |
| Exposure first              | sunlit card `ev_vs_grey` (probe rectangle)                                                    | -0.5 to +0.5 EV under the final tonemapper                 | PYD method; band [added]                         |
| Lights, not exposure, moved | Post Exposure changed only when a zone's exposure is set; light intensities carry the balance | one exposure value per zone, written down                  | PYD [00:25:00], [00:28:42]                       |
| Value structure             | sunlit card minus shade card                                                                  | <= 4 stops for a readable stylized game                    | [added]                                          |
| Tonemapper switch           | any card moving > 1 EV between stages when only post changed                                  | re-solve exposure under the final tonemapper               | U25 [00:54:50]; observed -1.4 EV Neutral to ACES |
| Interiors                   | wall or table card per zone                                                                   | same band as outdoors, through that zone's exposure volume | PYD [00:21:25]                                   |
| Night                       | moonlit anchor about 5 stops under noon in the brief                                          | shadows still readable                                     | PYD EV table                                     |

## 3. Shadows

| Check                         | Measure                                                                        | Pass                                                                                                                                                                                      | Source                      |
| ----------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| Distance before resolution    | `shadow_density(res, distance, cascades, split1)` compared across options      | the smallest Max Distance that covers the farthest dynamic shadow in gameplay views                                                                                                       | 6.3 Manual; URPS [00:15:32] |
| Cascades                      | last split vs last caster                                                      | last cascade ends at the last caster (metric)                                                                                                                                             | URPS [00:16:38]             |
| Atlas                         | `atlas_plan(spots, points, atlas, tier)` / audit `light.shadow_atlas_overflow` | fits (spot 1, point 6 maps, <= 16)                                                                                                                                                        | 6.3 Manual                  |
| Look                          | pole view (poles 10 m apart) from player height                                | poles inside Max Distance shadowed, crisp enough for the style; no acne, no peter-panning at contacts; cascade seams invisible                                                            | URPS, CC [00:11:23]         |
| Shadow strength               | audit `light.shadow_strength`                                                  | 1 unless the brief asks for readability fill (then about 0.9, said explicitly)                                                                                                            | PYD vs KB                   |
| Stylized softness             | main light map with soft shadows                                               | 1024 unless the look wants crisper (audit `style.shadow_res_crisp`)                                                                                                                       | URP e-book                  |
| Lighting Mode really rendered | `shadow_contrast` near and far patches (P13), sun rotated without a rebake     | far contrast >= 1 stop where the tier promises baked distant shadows; under Distance Shadowmask the near shadow follows the rotated sun (observed 0.10 stop) and the far one stays (1.89) | observed (test 11)          |

## 4. Baked lighting and probes

| Check                              | Measure                                                                                | Pass                                                                          | Source                              |
| ---------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------- |
| Bake report                        | `LightingBake.Bake` result                                                             | `bake_messages` has no UV overlap or failed-denoiser line; bake time logged   | TRB                                 |
| Memory                             | `lightmap_gpu_mb`, `apv_mb_without_support`, settings_memory                           | within the platform budget agreed before iterating                            | CC [00:35:51]                       |
| Texel economy                      | audit `light.small_lightmapped`, `lightmap_scale` for background                       | small props on probes, background 0.1 to 0.5                                  | CC [00:17:30], [00:48:30]           |
| UVs                                | audit `light.no_lightmap_uv`                                                           | 0 (Plane and Quad primitives have no uv2)                                     | observed                            |
| Gray after bake                    | saturation and std vs the pre-bake stage                                               | expected to drop; fixed in post, not by relighting                            | KB [00:04:58]                       |
| Leaks (look)                       | corner bookmark at wall and ceiling joints                                             | no bright bands, no exterior light inside                                     | TRB, APV24                          |
| Shadowmask channels                | audit `light.shadowmask_overlap`                                                       | at most 4 shadowed Mixed lights per lightmapped surface                       | 6.3 Manual                          |
| Shaders can show and feed the bake | audit `light.shader_no_lightmap`, `light.shader_no_shadowmask`, `light.shader_no_meta` | 0 on lightmapped renderers (a toon shader without LIGHTMAP_ON loses the bake) | 6.3 Manual; observed keyword spaces |
| Props in GI                        | audit `light.static_not_gi`, `light.small_lightmapped`                                 | small props Contribute GI on, Receive GI = Light Probes                       | CC [00:48:30]                       |
| APV masks                          | audit `apv.masks_without_rendering_layers`                                             | 0 (Use Rendering Layers on every tier's asset)                                | 6.3 Manual                          |
| Dynamic objects (look)             | the dynamic capsule inside and outside                                                 | no sky tint indoors, smooth transition at thresholds                          | U25 [00:45:56]                      |

## 5. Reflections

| Check                | Measure                                                                            | Pass                                                                                                                                                                                     | Source                              |
| -------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Interior reflections | `blue_minus_red` of a mid-smooth surface (wood 0.3) and of the chrome ball         | <= 0 indoors (reflects the room, not the sky); observed wood -0.07 to -0.39 after one box probe. A pitch-black ball in an Editor capture is an Editor artifact: verify in a player (P12) | PYD22 [00:08:17]; observed          |
| Glossy coverage      | audit `light.glossy_without_probe`                                                 | 0                                                                                                                                                                                        | KB [00:17:21]                       |
| Probe setup          | box projection indoors, importance 2 over the exterior probe, small blend (0.25 m) | yes                                                                                                                                                                                      | CC [00:54:35], PYD22 frame 00:10:09 |
| Hidden sky specular  | mid-smooth surfaces (wood 0.3) gray-blue before the probe                          | turn to their albedo after                                                                                                                                                               | observed (Table_Top)                |

## 6. Post and color

| Check                       | Measure                                                                                                          | Pass                                                                                                                                | Source                              |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Tonemapper present with HDR | audit `post.no_tonemapping`                                                                                      | 0                                                                                                                                   | BP [00:04:00], PYD                  |
| Grade effect                | saturation and `std_luma` vs the baked stage                                                                     | up, without clipping beyond the limit                                                                                               | KB [00:12:36]                       |
| Bloom                       | threshold >= 1 so only HDR emissives glow; Downscale Half, Max Iterations about 5; HQ filtering off on mobile    | set                                                                                                                                 | SBS, KB [00:15:10]                  |
| Neutral inputs              | bloom tint, fog color, shadow color                                                                              | white/neutral unless the brief says otherwise                                                                                       | PYD                                 |
| Volume hygiene              | audit `post.equal_priority`, `post.global_dof`                                                                   | 0                                                                                                                                   | PYD, EBR                            |
| Tier post                   | ReportPipeline `volume_profile` per level; findings `post.bloom_hq_mobile`, `post.dof_mobile`, `urp.ssao_mobile` | one profile per tier; cost fields (bloom filter, HQ, downscale, iterations, DoF, leak reduction) only there, never in scene volumes | URPS [00:30:06]; observed (test 13) |
| One grading setup           | `tiers.grading_mode_mismatch`, `tiers.lut_size_mismatch`                                                         | 0 (HDR grading, LUT 32 on every tier)                                                                                               | SBS frame 00:03:31; 6.3 Manual      |
| Tonemapper owner            | which profile tonemaps (scene grade or Graphics default)                                                         | written down; replacing the template's shared asset profile removes its Neutral tonemapper                                          | observed                            |
| Mood (look)                 | written emotion brief vs the sheet                                                                               | the brief's words describe the frame (KB vocabulary: flat vs punchy, washed out, grounded)                                          | KB [00:16:15]                       |
| Stylized economy            | audit facts `opaque_shaders`, `opaque_materials`; `style.many_shaders`, `style.lit_on_low_end`                   | few shared shaders with a palette texture; Simple Lit on the low tier                                                               | KB [00:22:04]; URP e-book           |
| Contact grounding           | SSAO on PC tiers (Downsample), not overdone; on phones one extra APV subdivision in key areas instead            | contacts read, no dark halos                                                                                                        | KB [00:05:32]; APV24 [00:25:24]     |

## 7. Tiers

| Check                                 | Measure                                                                            | Pass                                                                                                                                     | Source                             |
| ------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Asset that renders                    | `ReportPipeline` levels                                                            | each level its own asset, `falls_back_to_graphics_default` false                                                                         | URPS [00:03:14]                    |
| Readback                              | `tier_check` on a fresh-process report                                             | 0 mismatches                                                                                                                             | observed                           |
| Same image, cheaper                   | PC vs Mobile capture: delta log-average EV, relative saturation                    | <= 0.35 EV, <= 15%                                                                                                                       | [added]                            |
| Mobile bandwidth                      | ReportPipeline findings `urp.*_mobile`                                             | 0                                                                                                                                        | ASSET, U25                         |
| Mobile shadows indoors (look + count) | near-white pixels on the Mobile capture that are not near-white on PC, corner view | 0 to a handful; a sawtooth line at joints means bias too high or realtime sun where it should be baked                                   | observed (test 10)                 |
| Tier-only oddities                    | a difference that appears on one path only (black metals on Forward)               | re-check in a player before fixing: Editor batch captures can differ                                                                     | observed (test 9)                  |
| Frame time                            | `AgentProfile` + `ut_stat.budget_check`                                            | pass in Editor as a trend; the verdict is a development player on the target device                                                      | scenario-unity-expert              |
| Tile bandwidth                        | `L.pass_summary(PassAudit)` on each phone tier                                     | DrawOpaqueObjects, DrawSkybox and DrawTransparentObjects in one native pass; any split explained (depth copy, opaque texture, a feature) | U25 [00:30:26]; observed (test 14) |
| GRD (PC)                              | ReportPipeline `urp.grd_*` and play-mode batches                                   | chain clean; batches drop (observed 2,455 to 38 on 900 cubes)                                                                            | 6.3 Manual; observed (test 12)     |
| Shader hitches                        | PSO trace and warm-up (P15)                                                        | warmed == traced states, one collection per graphics API and platform; no PSO spikes in a device replay                                  | U25 [00:17:11]                     |
| Phone heat                            | device thermal soak with a vendor GPU capture (scenario-unity-mobile)              | frame time holds after the device is hot; bandwidth is the main power cost (phone about 5 W, no active cooling)                          | U25 [00:26:45]                     |

## 8. How to write the verdict

One line per stage: what changed (one change), the numbers that moved (card EV, clipped, saturation,
bake MB and seconds), what you saw on the sheet, pass or the next fix. Then the two lists from
scenario-unity-expert: Verified (job ids, numbers, sheets looked at) and Assumed (thresholds
[added], anything not run, device numbers not measured).
