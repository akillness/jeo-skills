# scenario-playable-ads: maintainer notes

How this skill was built and why it makes its choices. Not linked from `SKILL.md`; a runtime agent
does not need it.

## Origin

This skill extends the original playable-ads skill built at Scenario: the canvas runtime
(`window.PA`), the asset preparation, the template game, the 19-check Playwright QA, the genre
picker and the eleven archetype guides come from it. Each archetype guide was written from one test
build that passed those checks. The test builds themselves are not published, and the guides were
rewritten to name no game.

## What this version adds

- **Nine network targets.** `PA.net` in the runtime adapts the CTA and the container lifecycle per
  target, and `build.py` writes each network's package plus a bundle ZIP. The game code never names
  a network.
- **Viewable gate.** On MRAID targets and Mintegral, nothing runs (no clock, no audio, no hook
  tween) until the container says the ad is viewable; the loop pauses on hide events.
- **Fake-container QA.** `qa.py` loads every built target inside a stand-in for its container and
  checks the exact CTA call, the lifecycle signals, the gate, the size cap and the package layout.
- **First-tap guard.** AppLovin and Unity document that the first tap must not open the store. The
  runtime holds `PA.net.cta()` until the second touch on `applovin`, `unity` and the generic `mraid`
  file, and `qa.py` checks it.
- **Pangle SDK placement.** TikTok documents the playable SDK at the bottom of `<body>`, before the
  developer's own JS. `build.py` inserts it right before the first script in `<body>`.
- **Optional hand image.** The hint hand is drawn as a vector unless a project supplies
  `assets/web/hand.webp`.
- **The studio's own files.** Studios often have the art, 3D, sound and music already, so the skill
  does not only start from a recording. `references/existing-assets.md` covers the intake (files in
  `intake/assets/`, never edited there), three modes per kind of asset (as supplied, complement,
  derive), style matching with the supplied art as references, the size budget, rights and the
  report. `scripts/asset_inventory.py` catalogs the files (sizes, transparency, sprite count,
  colors, audio levels and loop seam, GLB skin and clips, font embedding), flags what needs a fix
  and estimates the inlined size against the cap. The script runs on synthetic files in its tests;
  no playable was built end to end from a studio's files with this version.

- **Starting from an idea or a genre name.** The skill's public guide
  (scenario.com/explorations/playable-ads/guide.html, step 2) tells a user with only an idea to
  write one paragraph: the world, what the finger does, the big moment, how a round ends. They then
  make two concept screens on Scenario to hand over as the screenshots. The guide says most games in
  the exploration started that way. Earlier versions stopped without a recording or screenshots. The
  brief now plays the recording's role, so the "never invent a mechanic" rule still binds: nothing
  the brief and the genre guide do not state. A real game's recording still wins over any
  description.
- **Genre names in the description.** Genre-named playable requests ("a crowd runner playable")
  carried no word that matched this skill, while `scenario-game-ua-ads` lists genres for video ads.
  The description now names the most common built genres and points video ads at that sibling.

## Design choices

- **One runtime adapter instead of a per-network shim in each file.** The alternative is a small
  shim per network in the HTML head that maps a common call to that network's API. An adapter in the
  runtime keeps one code path that `qa.py` can test per target, and keeps the game free of network
  names.
- **Meta stays at 2 MB for the HTML** even inside the 5 MB ZIP, because Meta's page caps the ZIP's
  `index.html` at 2 MB.
- **No `mraid.js` script tag.** Unity documents that its webview injects MRAID. AppLovin's pages do
  not say either way; `networks.md` marks it unconfirmed.
- **Liftoff `complete`.** Two Liftoff pages disagree. The build sends it at the end card and
  `networks.md` says to settle it in Liftoff's verifier.

## Verification

- The nine-network packaging was tested against fake containers in headless Chromium: 64 of 64
  checks on a copy of one game.
- After the first-tap guard and the Pangle SDK placement, the template's placeholder game passed 67
  of 67 checks in the same fake containers (`tests/scenario-playable-ads/test_qa.py`, run locally
  with Playwright 1.64.1).
- On 2 November 2026 the template's placeholder game (built with these scripts) was run in two
  networks' own tools: AppLovin's playable preview (portrait; played to the end card, the CTA click
  registered) and Google's HTML5 validator on the App Campaigns profile (all checks passed, the CTA
  opened the validator's "using the ExitApi" dialog). Google's Campaign Manager and Display & Video
  360 policies reject the `google` ZIP (they require a `clickTag`). Meta's playable preview also
  took the `meta` ZIP, passed its six spec checks and reported `FbPlayableAd.onCTAClick()` activated
  after a CTA tap. No other network's tool was run. `references/networks.md` has the details and
  what was not covered.
- Network facts were read from each network's public pages in November 2026.
  `references/networks.md` cites the page for each confirmed fact and marks the rest unconfirmed.

## Tests

`tests/scenario-playable-ads/` builds the template's placeholder game (no real game art) and checks
`prep_assets.py`, `build.py` (every target, every refusal), `pack_glb.py` (a synthetic GLB) and
`asset_inventory.py` (a synthetic folder of images, sounds, GLBs, a font and an unknown file).
`test_qa.py` runs the full Playwright QA and skips when Playwright or a Chromium build is missing,
as in CI.

## Left out

- Internal QA reports and frames from the test builds.
- The bundled glove image for the hint hand: its provenance could not be confirmed, so the runtime
  draws a vector hand by default.
- Per-build Scenario costs and model names: model choice goes through `recommend`.
