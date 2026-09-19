# scroll-scrub — the animated website (`--type website` only)

This is the **animated website** — the DEFAULT Tier-1 experience for every
`--type website` build. The visitor's scroll plays a generated film while the
page's semantic chapters read over it. By default that is ONE continuous film
(`single-shot`); a multi-scene seam-locked chain is opt-in. Follow this
reference for every website unless the user EXPLICITLY asked for a different
treatment (in which case pick a technique from `references/wow-catalog.md`
instead). It is also the reference for any brief that asks for a scrollable
world, continuous camera journey, diorama fly-through, or browse-through-the-
industry site. In catalog terms this is **A4 — Seam-locked scroll scrub**.

This is a specialized website build, not a Higgsfield app. Generate the scene
media with Higgsfield during the build, download it into the site, and ship a
standalone branded website that performs no runtime generation, uses no fnf
SDK, and mentions no Higgsfield branding.

The bundled Markdown assets provide an SSR-safe React/TanStack implementation,
layout contract, and deterministic video helper. Keep them in `references/`;
materialize only the fenced code needed by the generated site.

## Fit it into the existing website pipeline

Keep the single intake call and every normal website phase. Do not add a second
interview. Resolve missing details in the existing intake or choose defaults in
the design brief.

### Phase 0 — lock the journey

This is the journey block that `Animation mode: animated-website` obligates (see
`references/website-flow.md` Phase 0). The brief is INCOMPLETE — a hard stop —
until these decisions are written into `app/design-brief.md`; the Phase 5 gate
(item 9f) checks that the Journey shape and Journey are present. Write:

#### Journey shape — pick ONE (this is the big cost lever)

- **`single-shot` — the DEFAULT.** ONE continuous ~15s film, generated in ONE
  call, scrubbed end to end. No seams, because there is only one clip. The
  chapters are HTML that read over it. Choose this for a brand, a product, a
  service, a portfolio, a launch — anything whose story is one subject seen
  ever more closely. **When in doubt, single-shot.**
- **`multi-leg` — opt in only when the brief genuinely needs several WORLDS.**
  4–7 distinct places the visitor travels between, where each destination is a
  different environment rather than a closer look at the same one. Costs one
  generation per leg, strictly sequential (each leg starts from the previous
  leg's real last frame), plus a per-leg encode and inspection. Budget several
  extra minutes PER LEG and say so before choosing it.

"It would look cooler with more scenes" is NOT a reason for `multi-leg`. A
tighter single-shot film beats a loosely-seamed chain, and it reaches the user
far sooner.

- **Journey:** for `single-shot`, 3–6 chapters mapped to moments of the one
  film; for `multi-leg`, 4–7 scenes as a real narrative or value chain. Give
  each a physical subject, one focal point, one short headline, one sentence,
  and at most 0–3 proof tags. Keep the existing eyebrow ration; do not turn
  every scene label into an eyebrow.
- **World grammar:** lock one byte-identical style preamble, perspective,
  palette, light direction, surface finish, and background behavior across all
  scene prompts. Change only the scene subject and focal action.
- **Camera architecture** (`multi-leg` only): choose A or B below. Default to A for grounded,
  realistic, architectural, product, and first-person work. Use B only when
  the world is explicitly miniature, isometric, map-like, or toy-like.
- **Mobile framing:** include mobile by default, without another question.
  Keep every focal point inside the center-safe area and plan lighter mobile
  encodes. Use a separately generated portrait source only when center-safe
  composition cannot preserve a critical scene.
- **Cost shape:** for `single-shot`, one storyboard image plus ONE film. For
  `multi-leg`, record one entry image plus `N` sequential video legs for A,
  or `N` scene images plus `N` dives and `N-1` connectors for B. The per-scene
  Phase 1 boards already art-direct A's destinations; do not buy unused
  destination stills that cannot participate in its exact-frame handoff. This
  is a deliberate media-heavy cinema build.
- **Delivery budget:** record an aggregate byte budget in the brief. Start at
  ≤32 MiB for all desktop clips and ≤16 MiB for all mobile clips; shorten or
  re-encode before relaxing it.

## The footage contract — what makes a scrub look expensive

The page plays the film forward AND backward at the speed of the user's scroll,
and holds any single frame as a still whenever they pause. That dictates the
footage. Direct it like a high-end product film, and obey these or the scrub
looks broken regardless of how good the render is:

- **One continuous move — no hard cuts.** A cut becomes a jarring jump
  mid-scrub. Stage it as a single unbroken camera move (slow orbit, push-in,
  rise, fly-through) or one continuous transformation of the subject.
- **One hero subject, kept centered, with clean negative space** around it —
  that space is where the chapter copy sits. The video fills the viewport and
  crops the edges (`cover`), so keep the subject center-safe.
- **A background the copy can survive.** Dark, seamless, low-detail (studio
  black/charcoal, a soft gradient, the subject emerging from darkness) is the
  reliable choice. A bright, busy, full-frame environment behind body copy is
  the single most common reason a beautiful film reads as unusable.
- **Slow, steady motion** — constant speed, gentle ease only at the very start
  and end. The scroll supplies the pacing.
- **Locked exposure and white balance, no flicker; minimal motion blur.** Every
  frame is shown as a still, so exposure pumping shimmers and heavy blur smears.
- **Resolves at both ends:** the first frame reads as the establishing shot, the
  last as the closing beauty state. START state ≠ END state, or the scrub has no
  payoff.
- **No on-screen text, logos, or watermarks** — all type is HTML over the video.

Subjects that scrub beautifully: a product slowly orbiting on black; an
exploded-view assembly; a macro detail traveling along a surface; a
transformation or morph; a hero object emerging from darkness. Avoid: cuts,
fast pans, handheld shake, busy bright backgrounds, and colour/exposure flicker.

### Phase 1 — make each board a world chapter

Generate one board per scene as usual. Make the boards prove that the chapters
belong to one world: keep camera height, vanishing logic, material language,
palette, and light coherent while varying the subject. Annotate the intended
entry direction, focal point, and exit direction in the written brief, not as
text inside the generated image.

Compose boards and generation-source stills center-safe. Keep essential subjects
away from the far left/right edges because the full-viewport video deliberately
uses `cover` on portrait screens. Generate a separate portrait source only for a
scene whose story cannot survive that crop.

**`single-shot` uses ONE storyboard instead of per-scene boards.** Generate a
single 16:9 image laying the film out as **6 keyframes of one continuous move,
in a 6-panel grid** — it pins palette, look, lens, and camera progression for
the price of one image, before you spend on video. Prompt it explicitly as one
continuous move ("NOT six different scenes") and with no text anywhere in the
image. Show it to the user (its result URL) as you keep working; do NOT block
the build waiting for a reply — and do NOT download it or vision-inspect it
yourself: you just generated it from your own prompt, and re-viewing your own
render tells you nothing the prompt didn't. The user is the reviewer. Budget 2
re-rolls.

### Phase 2 — generate the film

Use the Higgsfield CLI already used by the website flow.

#### `single-shot` (the default) — ONE film, no chain

1. Run `higgsfield model list` / `higgsfield model get <job_type>` for the
   current video schema and its media roles.
2. Submit ONE `higgsfield generate create <video_job_type> ...` job. Drive the
   model at its highest quality with the approved storyboard as a **style/look
   reference**, and put the continuous move in the PROMPT:
   - Pass the storyboard with the model's GENERIC image/reference role — **not
     a start-frame role**. As a start frame it becomes the literal first frame,
     so the page opens on a static storyboard for a second or two before motion
     begins.
   - Ask for the longest single take the model supports (~15s), 16:9, highest
     resolution, and audio off — the page scrubs frames, not sound.
   - Name the grade and the hexes; restate "no cuts, no camera shake, slow
     steady motion only, locked exposure, no on-screen text".
3. **In the SAME beat as submitting the film, start the launch cover/OG —
   exactly ONCE** (`references/app-cover.md`) — it renders concurrently with the
   film instead of serializing a second wait at the end. This is its single
   start point: starting it any earlier, before the look is locked, is what
   makes a build render the cover twice and abandon the first one. Never restart
   it just because `app-meta.json` still looks empty — finish the run you have. Build the
   page (scenes data, chapters, copy, styles) WHILE both render, then
   `higgsfield generate wait <job_id>` ONCE per job, at the moment its output
   is the next input. Download, encode (below), and wire the files in. Do NOT
   vision-inspect the film, its frames, or its posters — single-shot has no
   seams to verify, and the footage contract was enforced by the prompt. That
   is the whole media chain — there are no seams to lock.

#### `multi-leg` — the seam-locked chain

1. Run `higgsfield model list` and `higgsfield model get <job_type>` for the
   current image/video schemas. Require the exact media roles the chosen
   architecture needs; do not rely on a remembered model roster or invent
   `--start-image`/`--end-image` support.
2. For A, submit only the entry-still candidates as async
   `higgsfield generate create <image_job_type> ...` jobs. For B, submit all
   independent scene stills up front. Reuse the locked style preamble verbatim,
   name concrete scene props, request no text/logos/watermarks, and keep the
   focal point centered.
3. Poll with `higgsfield generate wait <job_id>` / `higgsfield generate get
   <job_id>` because their outputs are downstream inputs. Keep the approved
   full-size source stills in scratch space. They are generation inputs/art
   direction, not runtime posters; deployed posters come from the exact encoded
   clips below.
4. Generate the video chain with one qualifying model and one visual grade.
   Never mix models mid-chain merely to save time: their grain, color, and
   motion signatures create a visible seam even when position matches.
5. Poll and download every source MP4. Read
   `references/scroll-scrub-asset-video.md`, copy its fenced Bash into
   `/tmp/scroll-scrub-video.sh`, then use that deterministic helper for
   boundary frames and scrub encodes:

   ```bash
   bash /tmp/scroll-scrub-video.sh bounds source.mp4 /tmp/scene-a
   bash /tmp/scroll-scrub-video.sh desktop source.mp4 app/public/assets/world/scene-a.mp4
   bash /tmp/scroll-scrub-video.sh mobile source.mp4 app/public/assets/world/scene-a-mobile.mp4
   bash /tmp/scroll-scrub-video.sh poster app/public/assets/world/scene-a.mp4 app/public/assets/world/scene-a-poster.png
   bash /tmp/scroll-scrub-video.sh poster app/public/assets/world/scene-a-mobile.mp4 app/public/assets/world/scene-a-mobile-poster.png
   ```

   `bounds` writes `<prefix>-first.png` and `<prefix>-last.png`. Pass a boundary
   frame's local path directly to the next `higgsfield generate create`
   `--start-image`/`--end-image` flag; the CLI auto-uploads it. The public
   poster commands run AFTER encoding, so each `poster`/`mobilePoster` matches
   the first frame of the exact clip the browser will decode.

#### Architecture A — continuous forward flight (default)

Generate the legs sequentially:

1. Start leg 1 from the approved scene-1 still using the selected model's
   documented start-frame role.
2. Extract the completed leg's ACTUAL last rendered frame, upload it, and use
   that exact frame as the next leg's start. Never use a Phase 1 board or an
   independently imagined destination still as the seam handoff or runtime
   poster.
3. Do not constrain the next leg with a wide end frame. Prompt it to continue
   the same gentle forward velocity into the next scene. Allow an orbit,
   lateral track, crane, or detail push inside a leg, but make the final second
   settle into the same slow forward drift that the following leg begins with.
4. Inspect the last frame before spending on the next leg. Re-roll a leg that
   ends mid-orbit, with sideways blur, or facing the wrong exit direction.

Position continuity comes from the exact-frame handoff; velocity continuity
comes from matching the direction and speed on both sides. Both are required.
Wire the legs directly as scene segments; no connector clips exist in A.

#### Architecture B — diorama dives plus aerial connectors

Use this only when pulling back to a world map is part of the concept:

1. Generate all scene dives independently from their approved stills. A dive
   begins outside/above the miniature and moves into its focal point.
2. Extract the ACTUAL last frame of dive `i` and ACTUAL first frame of dive
   `i+1`.
3. Generate connector `i` from those two uploaded boundary frames using the
   exact start/end roles reported by the current model schema. Batch all
   connectors once their boundaries exist.
4. Make the connector pull out of scene `i`, cross the connected miniature
   world, and begin descending into scene `i+1`.

Require both equalities at every join:

```text
dive[i].last pixels == connector[i].start pixels
connector[i].end pixels == dive[i+1].first pixels
```

Use a very short crossfade only as insurance against encoder/model drift. A
crossfade cannot repair a wrong endpoint or the grounded-world rewind created
by a forward dive followed by a backward pull-out; switch that concept to A.

### Encode direct MP4s for scrubbing

Scrub the optimized MP4 chain directly. Do not export thousands of frame images
for A4.

- Desktop: preserve native resolution, H.264/yuv420p, CRF about 20, GOP 8,
  scene-cut keyframes disabled, audio removed, `faststart` enabled.
- Mobile: cap height at 720px, CRF about 23, GOP 4, audio removed, `faststart`
  enabled. A tighter GOP reduces decoder work during repeated seeks.
- Extract a mandatory poster from the first frame of every final desktop clip,
  including connectors. Extract `mobilePoster` from every mobile clip. Never
  substitute the next scene's still or show a black video box while a clip
  downloads or before iOS paints its first decoded frame.
- Store only selected, encoded assets in `app/public/`; keep raw clips,
  boundary frames, and rejects outside public assets.
- Measure both encoded chains against the brief's aggregate byte budget. The
  controller retains visited Blob assets to keep reverse scroll smooth, so
  oversized clips become memory cost as well as transfer cost.

The A4 entry still, exact deployed-segment posters, and chained MP4s replace the
ordinary cinema hero scrub and cover the hero/content imagery for these
chapters. Continue generating the normal logo, icons, section UI assets, head
kit, and OG assets, but do not spend on a redundant second hero film.

### Phase 3 — assemble the SSR-safe React page

Read both bundled code assets and adapt them:

- `references/scroll-scrub-asset-react.md` — semantic React chapters plus the
  scrub controller (lazy nearby clip loading, Blob seekability, seek
  coalescing, iOS priming, mobile sources, active-section navigation, full
  teardown).
- `references/scroll-scrub-asset-css.md` — layout contract only. Replace its
  composition values through the design brief; do not add generic shared CTA
  chrome.

Extract the fenced sources into
`app/src/components/scroll-scrub/scroll-scrub.tsx` and
`app/src/components/scroll-scrub/scroll-scrub.css`, then provide real scene
data. Render each scene's CTA as its own `actions` node/component from the
brief's CTA inventory. Keep all chapter copy server-rendered in ordinary
semantic `<article>` flow; the client controller owns media time only. Never
drive per-frame values through React state. Keep the `scenes`/`connectors`
arrays as module constants or memoize them in the parent; changing their
identity intentionally rebuilds the controller.

The React asset intentionally does not build a header, generic button system,
scroll hint, or one eyebrow per scene. Compose the site's own nav and bespoke
CTAs around it. Keep the media controller inside `useEffect`; no browser global
may run during SSR.

### Phase 4 — motion and interaction

Let the A4 controller own scroll-to-video time for the scrub stage. Keep the
normal Lenis-to-GSAP ticker bridge for other cinema motion, but do not attach a
second scrub timeline to the same video elements. Use transform-only entrance
motion for surrounding chrome, keep chapter copy fully rendered, and preserve
the initial poster before client initialization.

Support reverse scroll as a first-class path. Every seam that works only in the
forward direction is still broken.

## Runtime requirements

- Fetch same-origin clips to Blob URLs before scrubbing so `currentTime` remains
  seekable even when byte-range behavior differs. Fall back to the poster if a
  clip fails.
- Add `blob:` to the site's CSP `media-src` because the controller assigns Blob
  URLs to `<video src>`. Keep clip fetches same-origin, with `connect-src 'self'`.
  A CSP that allows only `media-src 'self' https:` is incomplete here.
- Load only the active/nearby segment, keep its poster until `loadeddata` plus a
  real painted/seeked frame, and coalesce seeks while `video.seeking` is true. A
  failed source settles on its poster without a retry loop.
- Prime muted inline videos on the first pointer/touch gesture for iOS, then
  pause them; scrolling controls time, never autoplay.
- Ignore touch-browser height-only resize events caused by URL chrome; relayout
  on width/orientation changes and replace an already loaded desktop/mobile
  Blob when the selected source changes.
- Respect safe areas and use `dvh`. Keep focal media center-safe on mobile.
- Under `prefers-reduced-motion`, skip all video fetch/decode and present the
  same semantic chapters over static posters.
- On unmount, abort pending fetches, remove listeners, cancel animation frames,
  remove created video nodes, and revoke every Blob URL.

## A4 pre-delivery QA

Complete all normal Phase 5 checks, then verify:

Verify by READING the code and the encoded assets. There is no browsing step:
the sandbox browser cannot reach a local preview, and this flow does no
post-deploy visual review.

- Every seam uses an actual rendered boundary frame; inspect just before and
  after the seam in both scroll directions.
- Camera velocity does not reverse unintentionally across an A seam. B's
  pull-out is visibly intentional and used only for a miniature/map world.
- `currentTime` follows scroll across every segment; a fast flick does not
  build a seek backlog or freeze playback.
- First paint and every unloaded/failed clip show the exact deployed clip's
  first-frame poster, never a destination still, black box, or blank media.
- Desktop loads desktop encodes; a 375px/coarse-pointer viewport loads mobile
  encodes. Test portrait crop, safe areas, rotation, and a 4–6× CPU-throttled
  fast scroll.
- Reduced motion performs zero video fetches and keeps the full story usable.
- Route buttons are keyboard accessible, active state is not hover-only, and
  chapter headings remain in DOM/reading order.
- React unmount/remount produces no duplicate listeners, live RAF loop, stale
  video node, or unreleased Blob URL.
- The measured desktop/mobile clip totals stay inside the brief's byte budgets;
  verify requests and decoder behavior under network throttling as well as CPU
  throttling.
