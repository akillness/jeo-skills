# scenario-multi-reference: maintainer notes

How this skill was built and why it makes its choices. Not linked from SKILL.md and not read at
runtime.

## Origin

Distilled from the _Give each picture a job_ exploration on scenario.com/explorations: one agent
session working through the Scenario MCP server generated reference cards, then composed one picture
and one six-second film per set. Eight sets were kept, from a 3D animated film still to a risograph
poster. The kept picture prompts are in `references/prompt-patterns.md`, with the first set inlined
in SKILL.md as the worked example.

The exploration used GPT Image 2.5 Sunburst for the cards and pictures and Seedance 2.5 for the
films. SKILL.md names neither: discovery goes through `recommend`, and a live call on 2026-10-06
(`capability="img2img"`, `features=["referenceImages"]`, a four-role brief) ranked that same editor
first among 51 matching members, so the route reaches it without naming it.

## Why this route

- **A separate skill, not a section of `scenario-image` or `scenario-consistency`.**
  `scenario-image` covers the reference field's contract (name, cap, array) and says to name each
  reference's role in one sentence; `scenario-consistency` holds one look across many images.
  Neither teaches composing one image from several roles, nor the leak failure that is the
  technique's whole point.
- **One output type.** The exploration also filmed each picture. The film step is a short handoff to
  `scenario-video` with the one rule the record supports (the film prompt carries no jobs), not a
  second workflow.
- **`features=["referenceImages"]` on `recommend`.** It filters on an exact input name. Some
  families call the slot something else (`imageRef`), which is why the body says to drop the filter
  to see them.
- **WHO and WHERE kept as run.** The exploration page calls those jobs Main subject and Stage, but
  the kept prompts were written with WHO and WHERE, and relabeling them would ship prompts nobody
  ran.

## What changed from the exploration's downloadable skill

- Discovery moved from a capability-worded `search` to `recommend`, per the authoring contract.
- The two helper scripts (a JSON-to-prompt formatter and a Pillow contact sheet) were dropped: an
  agent writes a six-line prompt directly, and contact sheets are generic. Their example configs
  went with them; `references/prompt-patterns.md` holds the same prompts.
- The job vocabulary and leak checks were folded into the body, since every run needs them.
- Spelling moved to American English, prompts included.
- Added the `asset_get` consumed-reference check, so a silently dropped reference is not misread as
  an ignored job.

## What the record does not cover

- The user's own photos: every card in the exploration was generated, so noisy photos, faces, and
  text-bearing references are untested.
- More than five references in one call, and any editor other than the one used.
- Films longer than six seconds.
