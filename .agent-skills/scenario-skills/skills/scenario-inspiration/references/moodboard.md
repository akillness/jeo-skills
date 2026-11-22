# The board: building it, storing it, spending it

## Name the artifact first

Users say "moodboard" for five different things. Ask, or state which one you are making.

| Artifact     | What it is                                                             | Size                |
| ------------ | ---------------------------------------------------------------------- | ------------------- |
| Moodboard    | Tone and direction, interpretable, early                               | 15 to 20 images     |
| Style frame  | One fully rendered frame of the real deliverable, final quality        | 1 or 2 rival        |
| Lookbook     | Sequenced pages narrating one production's look                        | 8 to 20 pages       |
| Vis dev pack | Exploratory art solving a world: characters, environments, key moments | Varies              |
| Style guide  | Enforceable rules with numeric bounds and a named owner                | Read in one sitting |

Only the style guide binds. A board sets direction, and the output interprets it; work rejected for
not matching a board one to one is a misuse of the board, so state which axes are locked and which
stay open.

## Anatomy

Every reference carries three fields. Write them as you add it, not afterwards.

- **Role**: light, color, composition, material and texture, shape and silhouette, subject and
  styling, or environment. An image that fits no role is decoration and goes.
- **Why**: one line tying it to a decision on this project, not a description of the picture.
- **Take**: the single attribute to extract. "The falloff, not the palette." One mechanic per
  reference, named, and no more than two references carrying the same mechanic into one output.

Counts that hold up: under 10 images is underspecified, over 25 means you are still collecting
instead of deciding. Budget 2 to 3 anti-references per 4 to 8 positives. Spend more effort tagging
and cutting than gathering; removal is the cure for a board that is pretty but not directive,
including for images you like.

**One world per axis.** One lighting quality, one key level, one palette temperature, one
stylization level, one detail density. A hard-flash reference and a soft-window reference on the
same board cancel at generation time. If both are genuinely wanted, that is two boards and two
directions, not an average.

**No single source dominates.** If one artist, film, or property supplies most of the board, the
output reads as a knockoff of it.

The strongest anti-reference is a matched pair: the same subject rendered on-style and off-style.
For a generation pipeline, produce that pair yourself. The undirected half is the brief's own prompt
with its mood adjectives and quality tags struck (they preserve nothing, so the default comes back
unchanged) and its anti-goals rewritten as positive states, or sent to `negative_prompt` where the
schema has one. The directed half feeds that result back as a subject reference and keeps the same
text, adding every staging axis named (framing, moment, lens, time of day, light) plus the grade
written from the board's look axes, so the named axes are the only thing that changed between the
two. The pair is an anti-reference for the board, so it runs prompt-only; when the directed half is
also the deliverable, it carries the board's reduced references as well (the hero as style
reference, the undirected output as subject reference), the prompt keeps the staging axes, and the
written grade shrinks to what a style reference cannot carry. Either way, confirm in
`model_schema_get` that the reference field is optional, since the undirected half runs without one,
and hold `seed` fixed across the pair where the schema exposes it. A side by side states a rule that
a paragraph cannot.

## The collection is the board

| Need                   | Tool                                        | Fact that bites                                                              |
| ---------------------- | ------------------------------------------- | ---------------------------------------------------------------------------- |
| Create                 | `collection_create` (write)                 | Takes `name` only, no description field                                      |
| Add references         | `collection_add_assets` (write)             | Any number of ids; an already-filed id is skipped, not an error              |
| Annotate one reference | `asset_update` (write)                      | `metadata.tags` replaces the whole set; `metadata.description` holds the why |
| Tag a role             | `asset_add_tags` (write)                    | Additive, and the tag namespace is shared with models                        |
| Set the hero           | `collection_update` (write)                 | `thumbnail` is how the board reads at a glance                               |
| Read it back           | `collections_list`, `collection_get` (read) | `collection_get` returns the record, not the assets                          |
| List its assets        | `search` with `filters.collection_ids`      | This is the retrieval path, not `collection_get`                             |

All of these are catalog tools: get schemas with `scenario_tools_search` and run them through the
executor matching each `permission`, or reconnect with `?toolsets=full`.

Because a collection has no description field, the board's thesis lives in its name. Name it for the
direction and the subject, not "moodboard 2".

**A public asset from another team cannot join your collection.** `collection_add_assets` on one
returned 403 Forbidden at authoring time. It is still a valid `search` seed and `asset_display`
renders it, but to board it you need your own copy: `asset_download`, `curl -L` the returned URL,
then `upload_asset` (multipart: `file_name`, `content_type`, `kind`, `file_size`) and
`upload_asset_complete`. Two things about that copy. `asset_download` returns a png re-encode unless
you ask for another `format`, so the file can land larger than the original and the upload is sized
off the copy, not the source. And `upload_asset` answers with `part_size`, `total_parts`, per-part
`content_length`, and an `instructions` string: follow those rather than assuming one PUT, because
anything past `part_size` comes back as several parts. Same path for anything arriving from outside
Scenario.

## Spending the board

A model cannot read 18 images. Reduce to three to six, each tagged with the job it does at
generation time: style reference (aesthetic and rendering), structure reference (composition and
layout), subject reference (identity). A style reference carries look. It cannot enforce an exact
hex color, typography, object placement, or a subject's identity: route brand colors through a color
parameter where the schema has one, and type and logos through a compositing step. Check the model's
own schema for what it accepts and how many, and remember file fields take asset ids even when named
`...Url`.

Build the prompt from the board's named axes, never from mood adjectives or quality tags.
"Cinematic", "beautiful", "stylized", and "epic" preserve nothing, and neither do "ultra sharp",
"hyper detailed", "crisp", "8K", or "HDR". Shape family, value range, material behavior, detail
density and where the rest areas sit, lighting direction and quality, palette as dominant plus
secondary plus accent: those survive the trip into a prompt.

Rewrite every anti-goal as a positive state before it reaches a prompt. "Not cluttered" becomes
"generous negative space, one subject centered". Send a negation to a `negative_prompt` field only
when `model_schema_get` shows the model has one, and never paste "no X" into the prompt itself.

When a style reference is attached, drop the style adjectives from the prompt and let it carry
subject and content only, because the two fight. When a structure reference is attached, the prompt
carries style and palette and never restates the layout. With no reference, the prompt carries every
axis explicitly: the look axes above (shape family, value range, material behavior, detail density,
lighting direction and quality, palette) and the five staging axes (framing, moment, lens, time of
day, light).

`asset_describe` on the hero returns a promptable synthesis of its look; that line plus the axes is
a stronger opening prompt than either alone (see `scenario-asset-analysis`).

## Reusing a board later

- Load it: `search` with `filters.collection_ids: ["col_..."]`. Hits carried their own `description`
  at authoring time, so annotations written with `asset_update` come back alongside the images.
- Steer by it: `search` with `images: {like: [ids from the board], unlike: [the anti-references]}`.
  This is the only place a stored anti-reference does work rather than sit in a note.
- Extend it: run the widen loop again with the board as the near end of the distance ladder, so
  round two moves rather than restating round one.
- Hand it off: the collection id plus the three to six reduced references is the whole brief for
  `scenario-image`, `scenario-consistency`, `scenario-game-assets`, or `scenario-video-ads`.

## Scoring output against the board

Grade every batch on four axes against the hero and the anti-references: silhouette, palette,
materials, detail density. Then three readability tests borrowed from game production: it must read
in grayscale, at distance, and in motion. Generate in small batches varying one variable at a time,
so a failure names its cause.

When a look is finally right, write the recipe down beside the board: the seed, the prompt with its
slot values, the parameter set, and the reference asset ids. A direction that only exists as a habit
gets re-derived by the next person, slightly differently.
