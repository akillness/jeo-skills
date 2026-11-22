# Style and cast

Settle the style on sample pages first. Sheets come second, page art third. A late style change
reaches every sheet and page.

## Style round

1. Pick two pages from the script: one dialogue page and one establishing or action page.
2. Write a prompt for each page and each direction. The style paragraph changes, and so does the
   staging of the same beat: a different layout, camera height and dominant panel, each chosen for
   that direction. One shared skeleton comes back as one composition in four surfaces. Draw the hero
   from a written description, not from the user's photo.
3. Quick lane: draw three directions (two in clear-first mode) on the page with the most words, all
   at once, one image each. Album and Book: three to five directions on both pages. They come from
   [style-library.md](style-library.md) or the same formula, each with two named influences, hard
   rules and a FORBIDDEN list. Add a plain-prompt stock twin of the same page and run the taste
   review in [art-direction.md](art-direction.md). Run them on the model the book will use, the
   top-ranked one at its highest quality. A different model changes the look, so add a second model
   to the round only when the user asks or the first fails the stock twin twice.
4. Show every direction side by side on a contact sheet and let the user pick. Unattended, pick and
   log two reasons in the brief card.
5. Record the winning pages' asset IDs. That page set is the style anchor, and it is reference 1 on
   every later page. Each page prompt says it sets line, color, paper and lettering only, never its
   characters, poses or compositions. An anchor page that is also a story page repeats its staging
   only on purpose: the page script says whether to keep it or restage, and the prompt says the
   same.
6. Never reference a page from a rejected direction.

A direction is written in concrete terms, never as a genre name:

- Line: weight, continuity, ink or pencil or none.
- Tone: flat color, painted, screentone, watercolor, grain.
- Palette: named colors, or "black and white with purposeful blacks".
- Light: soft, hard, time of day.
- Lettering: capitals or mixed case, hand-lettered feel, balloon shape.

## Character sheets

One sheet per recurring character. Each shows:

- A calm face.
- Full body, front and back.
- One expressive pose.
- Signature props, and costume layers named.

Procedure:

1. Settle the outfit details first: hood, gloves, mask, hair, glasses, and every costume state (day
   clothes, disguise). Give each state its own row. Then generate the sheet in the approved style,
   from the brief or from the photo.
2. Inspect it beside the style anchor and beside the other sheets. Drop a sheet that changes the
   style. Run the taste review on the sheet: the face on it is the face on every page, so a generic
   face is redrawn before the book locks it.
3. When two characters look alike, check they stay distinguishable on one page.
4. File each sheet with its asset ID and a name.

Rules:

- A reference pose is not an instruction. Acting is assigned per panel.
- State age with a build cue on the sheet, such as head height against body. A child drawn too young
  reads as a younger character on every page.
- A lasting change (aging, a new outfit) gets a second sheet beside the original, never a
  replacement.
- Count unnamed recurring figures too: the guard captain, the two sailors. If the reader must
  recognize them across pages, they get a sheet.
- One-off extras stay generic and unnamed.

## Cast gate

Before page 1, reconcile the script with the cast list. Every principal and every recurring figure
has an inspected sheet. A gap found after page 20 costs those pages. A sheet passes when its face is
no longer generic and its costume reads as designed. It does not need a Distinctive verdict. Draw
all the sheets at once, one try each and one redo for a sheet that fails. In clear-first mode a
sheet also passes only when the character differs from the others by silhouette and one costume
color at thumbnail size.

## Photos as identity

- Derive the stylized sheet from the photo once, check the likeness at crop size, and get the user's
  approval. Unattended, log the check and continue.
- Use the approved sheet, not the raw photo, as the identity reference on pages. A photo pulls pages
  toward photographic rendering.
- Say what the reference sets: "sets face, hair and build, never pose, clothes or background".

## Places

- Keep one plan per recurring location: named walls and doors, furniture footprints, fixed
  landmarks, scale.
- Derive each camera from the plan. A reverse shot flips screen sides and the depth order of
  landmarks. It does not move people through walls.
- Write architecture, not cast, into the shared setting text, once per location. Paste it unchanged
  into every page set there, with the TIME line, and change it only where the script changes the
  place or the hour.
- When prose keeps failing on geometry, use a plain diagram or a simple blockout as a reference, and
  name which parts to take from it.

## Props

- A handled prop needs grip and support views, and its length stated against the body: "blade about
  as long as his leg".
- Track removable items as single objects with states: worn, held, hung.
- A sheet for a prop or mechanism is justified only when text cannot carry the fact.

## State ledger

For every character, one line per page: costume layers, held objects, injuries, location. Write the
state into each panel prompt. Drop references that contradict it.

## Expression board

Useful for leads in a long book: neutral, courtesy, puzzlement, recognition, wonder, enthusiasm,
self-correction, alarm. Compare the faces side by side. Keep adult proportions on adult characters.

## Reference discipline

- About five references per page: the style anchor, the cast on the page, one place or prop.
- Each extra sheet can shift the style. Add one only where text cannot carry the fact, and note why.
- Give every reference a role in the prompt and number them in attachment order.
- Read the reference field's name, limit and array rule from `model_schema_get`. A bare value where
  `array: true` is silently dropped. A model whose schema has no image reference field cannot carry
  the sheets: pick another before the style round.
- Siblings: `scenario-multi-reference` for roles and leaks, `scenario-consistency` for identity and
  trained-model decisions, `scenario-identity-library` for filing a character as a collection.
