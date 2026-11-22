# Levels: density, fidelity, color

Three dials, set in the build plan and recorded in the hand-off sheet. They are independent: an
expert scene can be rough, a simple one detailed. `K` is `bx_kits`, `B` is `bx_blockout`.

**Defaults when the brief is silent: advanced density, shaped fidelity, category colors.** A dressed
world with crowd, traffic and two to four shots is what makes the render read as a real place, and
it held as well as the simple scene in the test below. A brief that names only its heroes and shots
is silent on density, even when two heroes and two shots also fit the medium row: take advanced. Go
down only when the brief is genuinely small (one actor, one place, one move); go up to expert when
it asks for scale, a crowd or a cut sequence. Record the choice in the build plan. The brief's own
length overrides the `seconds` and `shot_s` columns of `K.audit_budget`, and its shot count
overrides `shots`. A 6 s advanced brief fails only `seconds`; a single 8 s shot fails `shots` and
`shot_s`. The rest of the budget still holds.

## Density: how much scene

| Level    | Footprint | Elements   | Heroes | Extras    | Shots   | Each shot  | One take   | Typical brief                                                  |
| -------- | --------- | ---------- | ------ | --------- | ------- | ---------- | ---------- | -------------------------------------------------------------- |
| simple   | 20 m      | 10 to 80   | 1 to 2 | 0 to 2    | 1       | 4 to 6 s   | 4 to 6 s   | one actor, one move, one place: a rider pulls up at a stall    |
| medium   | 40 m      | 50 to 250  | 1 to 2 | 0 to 12   | 1 to 2  | 3 to 8 s   | 5 to 10 s  | a dressed street, a few passers-by, one camera idea            |
| advanced | 80 m      | 150 to 800 | 2 to 4 | 10 to 60  | 2 to 4  | 2.5 to 6 s | 8 to 12 s  | a market with crowd and traffic, wide plus follow coverage     |
| expert   | 120 m +   | 500 +      | 2 to 6 | 50 to 300 | 3 to 12 | 2 to 5 s   | 10 to 15 s | a district in layers, cross traffic, a dense crowd, a cut plan |

`K.audit_budget(level)` checks every column: elements (a jointed figure counts once, not per limb),
heroes, extras, shots, each shot's length, the take and the footprint. An empty list is a pass.

- **Elements are cheap, heroes and shots are not.** The video model keeps what the clip shows, so
  set dressing adds richness at no risk. Risk grows with independent actors and with cuts.
- **Heroes** are the movers the story needs: each gets a saturated color (its own, unless the brief
  puts two in one color), a line in the prompt with its direction of travel, and a clear path. Past
  four heroes in one shot, identities start to swap: spread them over shots.
- **Extras** are crowd and traffic, tagged by `K.crowd` or `K.mark_extra`. The prompt names them as
  one class ("the gray walkers are pedestrians"), never one by one. Keep sight lines clear:
  `K.crowd(..., keep_clear=[(frame_a, frame_b, (xmin, xmax, ymin, ymax))])` drops any walker that
  would cross the zone between a camera and its subject during that shot.
- **Expert is a cut plan, not a crowded single take.** One shared layout, cameras stored per shot,
  shots of 2 to 5 s. MiniMax H3 Max 3D to Video held three cuts, three heroes and about 140 extras
  in one 12 s take in our test; it takes 15 s and 32 shots per request at the time of writing (read
  the caps from `model_schema_get`). Longer, or on a model that does not hold cuts: one take per
  shot over the same layout.
- **Wide shots carry blocking, medium shots carry faces.** At advanced and expert, open wide for
  geography, then cut closer for the heroes.

## Fidelity: how far each proxy is shaped

| Tier     | Set                                                                                  | Figures                                            | Vehicles                                       |
| -------- | ------------------------------------------------------------------------------------ | -------------------------------------------------- | ---------------------------------------------- |
| rough    | single boxes, cylinders, faceted crowns                                              | `capsule` by default (cast style, [cast](cast.md)) | one box body, marked front                     |
| shaped   | plinth, floor bands, roof form, door; stalls with posts and canopy; trunk plus crown | `jointed` by default: thirteen parts that step     | cab, wheels, headlights, grille, dark red rear |
| detailed | windows, sills, signs, glass shop fronts, balconies, roof units                      | `jointed` plus a nose block and a hair cap         | shaped plus finer parts a camera reads at 2 m  |

- **Default to shaped.** Silhouette and identifying features (wheel count, a marked front, a roof
  form, a figure's facing) decide what the model renders; surface detail mostly does not. Detailed
  pays off in medium and close shots, where windows, signs and shop fronts set the rhythm the model
  keeps.
- **Keep one tier per scene.** A detailed hero among rough proxies reads as the only real object.
  Figures are the exception: their cast style is a separate dial (next bullet), and a capsule or a
  featured capsule fits any set tier. A capsule's facing barely reads in a wide shot, so the sheet
  gives it as its direction of travel.
- **Figures depend on the video model.** The cast style (`capsule`, `featured`, `jointed`,
  `mannequin`) is chosen per character and per model, independent of the set's fidelity: a stand-in
  with limbs hands the model a gait it copies, one without lets it invent the motion. Without
  `style`, `fidelity` keeps its old mapping (rough: capsule; shaped, detailed: jointed). Options,
  per-model results and prompt clauses: [cast](cast.md).
- **Past detailed**, when a detail must stay identical across many shots (a signature vehicle, a
  building facade): generate the asset as 3D through Scenario (`scenario-blender`'s 3D lane), place
  it at the proxy's position, height and facing, and keep filming it in the scheme's colors.

## Color: what each mass reads as

`K.scheme(name)` maps every role (ground, wall, roof, vegetation, glass, fabric, crowd and so on) to
a color; `K.tint(rgb, seed)` shifts value per instance so neighbors separate.

| Scheme   | Set                                                                                                            | Use                                                       |
| -------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| category | one muted hue per role: sand walls, terracotta roofs, green trees, blue water, mauve canopies; extras mid gray | default: masses separate at a glance, the legend is short |
| identity | a different gray per role                                                                                      | when a model copies proxy colors into the render          |
| material | colors near the real material's albedo                                                                         | when whatever leaks should already look right             |

In every scheme heroes keep their saturated `B.PALETTE` color, light sources glow in their own
color, and the set never uses bright primaries (they read as toys and leak).

On the same H3 Max test, no scheme came back as flat paint: hues moved into plausible materials
(sand stalls into wood, a red canopy color into red awnings), and the gray identity scheme came back
colder, with steel stalls. Category kept the most market context behind the heroes. The model reads
a hue as a material hint, so give a hue only where its real-world reading is right, and a hero's
color only to something the hero really wears: the garment the brief colors, when the palette has
that color.

## The prompt per level

Two grammars, by model. Seedance-style reference models: the motion-first grammar in
[handoff](handoff.md), with no geometry words. A 3D-to-video model whose page asks what each proxy
stands for (H3 Max): the authority clause (the clip is the sole authority for camera, framing, cuts,
timing, position, scale and motion; if text and video disagree, the video wins), a replacement map
naming each proxy class by shape and color ("open booths with posts and sloped canopies are food
stalls"), one line per hero with its direction of travel, a re-render clause (no frame may show the
flat colors, gray material or primitive shapes of the previs), then the look. That grammar held all
eight takes of the test.

From advanced up, add one line per shot with its time span and camera move. Stay inside the prompt
limit (2,000 characters on H3 Max at the time of writing, the plugin's own wrapper included on its
Render Video lane): at expert, classes take the words, never individuals.

## The test behind these numbers

A night market built with `bx_kits` (stall rows, shophouses, lantern strings, a rider who pulls up
at a noodle stall, a cook, a customer, crowd and traffic), rendered once per variant through MiniMax
H3 Max 3D to Video at 768P, no reference images, one prompt per density. Four densities at shaped
fidelity and category colors (29, 81, 195 and 566 elements; 1 to 3 heroes; 0 to 142 extras; 1 to 3
shots over 5 to 12 s), then rough and detailed fidelity and identity and material schemes on the
advanced scene. Every take kept the camera, the cuts, the heroes' identities and their paths. One
take per variant is an indication, not a measurement: rerun before leaning on a small difference.
