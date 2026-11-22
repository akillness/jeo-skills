# Starting from the studio's own files

Read this when the user already has art, 3D, sound or music for the game: production sprites, a
background, a logo, characters, a sound bank, a music track, a key art, a previous ad's files. The
agent catalogs the files and uses them in one of three modes, chosen per kind of asset.

The recording (or the screenshots) still decides the mechanic, the beats and the layout. Supplied
files change where the art comes from, never what the game is.

## 1. Intake

Ask in the first round of questions ("Start here" in `SKILL.md`), in the same message:

- "Do you already have art, 3D models, sounds or music for this game? Send what you can, in any
  format: PNG, PSD exports, sprite sheets, GLB or FBX, WAV or MP3, fonts. Say which files are the
  game's current art and which are concept or marketing art."
- Who owns the files, and whether they may be used in ads (section 7).

Put every file in `intake/assets/`, keeping the user's folder names.

- Never edit, rename, convert or overwrite a file there.
- Every change (a cut-out, a recolor, a trimmed loop, a converted model) is a new file in
  `assets/raw/`.
- `prep_assets.py` reads either folder and writes only `assets/web/`, so the originals stay as sent,
  for the next ad and for the report.

## 2. Catalog: `asset_inventory.py`

```bash
python3 "$SKILL/scripts/asset_inventory.py" "$P" # reads intake/assets/, never writes there
python3 "$SKILL/scripts/asset_inventory.py" "$P" --src intake/client_pack --max-mb 2
```

It writes `analysis/assets_inventory.json` and `analysis/assets_inventory.md`, one row per file:

- **image**: width, height, transparency, the number of separate shapes (a sheet or an atlas), five
  main colors, the WebP size at playable resolution.
- **audio**: length, channels, sample rate, peak and mean level, silence at either end, and the loop
  seam of music 8 s and longer.
- **video**: length, size, frame rate, sound track. Read it like the recording; it is never inlined.
- **3D**: GLB meshes, vertices, materials, textures, skin and joints, animation clips with their
  names, Draco compression.
- **font**: family, and whether the file allows embedding.

Each row carries `flags`, the problems to fix before use, and an empty `use` field. The summary
estimates the inlined size if every usable file went in as it is, against the strictest cap (Meta's
2 MB HTML).

Read the `.md`, not the files. Look at the art itself once, as one contact sheet (ImageMagick
`montage`, 1600 px at most), to describe the style. Then write under "Supplied assets" in
`analysis/brief.md`:

- **The style, in words:** palette (the inventory's colors), line weight, shading, proportions,
  camera angle, texture detail. This text goes into every prompt in section 4.
- **The 3D:** rigged or not, which clips exist, and the vertex count against the 10k to 30k a phone
  ad carries.
- **The audio:** which sound maps to which event, which take is too quiet or clips, whether the
  music loops.
- **What cannot be used as it is,** with the flag's fix, and what cannot be used at all (an unknown
  type, a broken file, a file the rights do not cover). Tell the user in one message and carry on:
  an unusable file never blocks the build.

Flags and their fix:

- **separate shapes in one image**: a sheet or an atlas. Check
  `prep_assets.py <project> --blobs <file>`, then cut each piece with `"blob": n`.
- **JPEG, no transparency**: a plate or a reference. A sprite needs a cut-out: `"key": true` on a
  flat background, or an image edit.
- **over 4096 px**: fine as a source. Send a 2048 px copy when it is a generation reference.
- **several frames in one file** (GIF, animated PNG): export the frames, or a sheet.
- **FBX, OBJ, BLEND, USD**: convert to one `.glb` in a 3D tool, then pack it with `pack_glb.py`.
- **Draco-compressed GLB**: export it without Draco, since `pack_glb.py` reads plain glTF buffers.
- **several mesh parts**: `pack_glb.py` packs the first one only. Join them first.
- **rigged**: `pack_glb.py` packs the static mesh, without the skin or the clips. For motion, render
  the clips to frames in a 3D tool and cut them as a sheet (`"grid"` and `"cell"`, or `"blob"`).
- **peaks at 0 dBFS**: `"boost_db": 0` in its manifest entry, a limiter with no gain.
- **leading silence on a short sound**: `"trim": true`.
- **music with an audible seam, or too long**: cut at a bar line, or `"max_s"` with `"fade_s"`.
- **font forbids embedding**: an OFL face from `assets/fonts/`, or the owner's written permission.

## 3. Three modes, chosen per kind of asset

Ask once, in the same message as the genre question. Record the answer in `assets_inventory.json`
(`"mode"`, for example `{"art": "complement", "3d": "as-is", "audio": "derive"}`) and in
`analysis/brief.md`. Without an answer, use complement: it keeps everything the user sent and fills
the rest.

- **As supplied**: only the user's files for that kind of asset, cut, keyed, resized and compressed.
  Nothing of that kind is generated.
- **Complement**: the user's files, plus generated pieces for the slots they do not cover, in the
  same style (section 4).
- **Derive**: everything else of that kind, made from one or a few supplied files.

Mixing is the normal case: the art as supplied, the 3D complemented, the audio derived from the art.

**As supplied.** Map every slot the game needs to a file before writing the config.

- A slot the game cannot do without, with no file, is a question for the user, never art drawn in
  code.
- An optional element with no file drops out of the level.
- The only additions are the effects the game draws in code (sparks, rings, numbers) and the hint
  hand.

**Complement.** In the asset map of `analysis/design.md`, give each slot its source: a supplied
file, or "to generate". Generate only the second group. A supplied file always wins over a generated
one for the same slot. If you think a supplied file hurts the ad, say so in the report.

**Derive.** Name the source file of each derived asset. Common cases:

- **From one key art to the whole set:** the plate (an edit that removes the characters and the
  text), each character and prop as a transparent still, the icon, and the logo when there is none.
  The key art is the reference on every job. The character stills then get their sheets as in
  [scenario-assets.md](scenario-assets.md).
- **From the assets to variants:** color variants ("same piece, only the color changes", or a hue
  shift on a copy for flat colors), themes (the same plate in snow, at night, dressed for a
  festival), new levels laid out from the same pieces. A variant is not a new mechanic: the
  recording rule still holds.
- **From the art to the audio:** music and SFX that fit what the art shows. Name the setting, the
  materials (wood, glass, slime, metal), the mood and the pace in the prompt, with one SFX per event
  in the design.
- **From a 3D model to 2D:** renders of a supplied GLB, from a 3D tool or a three.js page, as stills
  or sheet sources when the ad is 2D.

## 4. Style matching for every generated asset

The supplied art is the style reference. On Scenario MCP:

1. Upload 2 to 4 supplied files per job with `upload_asset`: the one closest in subject (the same
   character, the same kind of prop) and the one that carries the style best. Crop or downsize
   first, to 2048 px at most.
2. `recommend` with the `img2img` capability and a prompt that names an edit from several
   references. Check in `model_schema_get` that the pick takes that many references, and returns a
   transparent background when the slot needs one.
3. Put the brief's style text in the prompt, plus "match the line weight, shading, palette and
   proportions of the reference sprites exactly; same camera angle and scale; only the subject is
   new".
4. For a sheet of new pieces, give the existing pieces as references and say how big the new ones
   are relative to them.
5. Sounds next to a supplied bank: describe the bank (length, attack, brightness, how dry or wet)
   and level-match with `boost_db`. Music next to supplied SFX: the same instruments and energy.
6. 3D next to supplied models: image-to-3D from a still made in the supplied style, at the same
   vertex budget and texture size ([3d-games.md](3d-games.md)).

Check the match before building: one contact sheet with each generated asset beside its closest
supplied one. Reject a take that reads as another game (another outline, lighting or proportions),
and redo it with the difference named in the prompt.

## 5. Manifest and asset map

A manifest entry's `src` may point straight into `intake/assets/`, since `prep_assets.py` reads any
path under the project. Three `images` entries:

```json
[
  { "name": "boss", "src": "intake/assets/art/boss_idle.png", "alpha_floor": 40, "max": 360 },
  { "name": "plate", "src": "assets/raw/plate.png", "size": [720, 1280] },
  { "name": "robot_pink", "src": "assets/raw/robot_pink.png", "max": 200 }
]
```

The asset map in `analysis/design.md` names the source of every asset, as for art rebuilt from
frames:

- As supplied: the file itself.
- Complement: the supplied files used as references, plus the recording frame that shows the piece.
- Derive: the file it was derived from.

## 6. Size budget and QA

Production files are made for a game install, not a 2 MB ad. Before building, compare the
inventory's estimate with the cap of the strictest network the user runs: Meta 2 MB for the HTML,
Google 5 MB for the ZIP, every other network 5 MB. If it is tight or over:

- **images**: `max` per slot at the size it shows on a 720 x 1280 screen, `quality` 70 to 82,
  `alpha_floor` on soft edges, one sheet instead of many files;
- **sheets**: fewer frames per state, a smaller `max`;
- **audio**: `"bitrate": "48k"` for effects (prep encodes mono), music cut to one 20 to 30 s loop
  with `max_s`, effects trimmed;
- **fonts**: `prep_assets.py` subsets them to the game's text;
- **3D**: `pack_glb.py` with `--tex-max` 256 to 512; decimate a model above 30k vertices first.

`qa.py` treats supplied and generated assets the same way: the same size checks per network, the
same game checks, the same storyboard. It cannot tell them apart, so check by eye that compression
did not damage the supplied art (banding on gradients, halos on cut-outs, a logo gone soft), and
that a supplied sound does not clip after `boost_db`.

## 7. Rights and ownership

- Ask the user to confirm the files are theirs or licensed for advertising. Write the answer in
  `analysis/brief.md`: "Rights, supplied assets: confirmed by the user" or "not confirmed".
- Licenses often cover the game and not ads: store-bought asset packs, music licensed for in-game
  use, fonts licensed for the app but not for web embedding. Ask about each one the inventory shows.
- Uploading a file as a reference sends it to the user's Scenario project: say so when you ask.
- A file the user does not own or license is not used, even as a reference.

## 8. Report

`notes.md` gets one table: every asset in the build with its source.

| Asset        | Source                                                  | Change                              |
| ------------ | ------------------------------------------------------- | ----------------------------------- |
| `plate`      | supplied, `intake/assets/art/bg_level3.png`             | resized to 720 x 1280, WebP 76      |
| `hero` sheet | generated, references `hero_front.png`, `hero_side.png` | job id                              |
| `robot_pink` | derived from `intake/assets/art/robot_green.png`        | hue shift                           |
| `music`      | supplied, `intake/assets/audio/theme.wav`               | cut to 24 s on a bar line, 64k mono |

Then the inventory's unusable files and why, and the rights answer.

## Mistakes

- **Editing a supplied file in place.** Copy it to `assets/raw/` first.
- **Generating a slot the user supplied,** or redrawing their logo.
- **A generated piece next to production art without references:** two art styles in one ad.
- **Inlining a 4K PNG or a 3 MB WAV as it is,** then missing the cap.
- **Trusting file names:** `final_v2.png` may be an old version. Check it against the recording and
  ask.
- **Using marketing key art as level art** when the user said to use the game's art (it is drawn for
  a poster, not a play field), or the reverse.
- **A music track licensed for the game only,** used in the ad.
