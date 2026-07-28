# Bone Halls Steam Title Design Contract

Use this profile only for the future `#title` shell. It is additive to the existing six-screen meta UI
contract. The artifact must not redesign, proxy, or replace `#home` or any current meta surface.

## Player Job

Within three seconds the player must:

1. recognize the product as `Bone Halls` / `冥骨魂殿`;
2. understand whether progress is local, checking cloud safety, offline, or in conflict;
3. enter the existing `#home` through `Enter Hall` / `进入骨殿`.

The top-level commands are exactly Enter Hall, Settings, Credits, and capability-gated Quit Desktop. There is
no New Game and no Continue Run because the runtime has neither save slots nor resumable run checkpoints.

## Artifact Profile

The self-contained artifact is `bone-halls-steam-title-concept.html`. Capture it with
`--contract-profile=steam-title`. It exposes one screen, `title`, in `zh` and `en` at:

```text
852x393  1180x820  1280x800  1440x900  1920x1080
```

Required states:

```text
title-first-run       title-returning       title-cloud-checking
title-offline         title-route-loading   title-settings
title-credits         title-reset-confirm   title-cloud-conflict
title-quit-confirm
```

The full title capture is the complete state x locale x viewport matrix plus reduced-motion rows. The default
six-screen profile, artifact name, viewports, states, and capture behavior remain unchanged.

## Review API

```js
window.DARKBONE_DESIGN_REVIEW = {
  ready: true,
  screens: ['title'],
  locales: ['zh', 'en'],
  states: [/* every required state above */],
  setScreen(id) {},
  setLocale(id) {},
  setState(id) {},
  setCapabilities({ desktopQuit }) {},
  hideToolbar() {},
  snapshot() {},
};
```

**Every setter (`setScreen`, `setLocale`, `setState`, `setCapabilities`, `hideToolbar`) must `return true` on
success** — the capture gate calls each one and fails the whole matrix on any falsy/undefined return.
**The artifact must also set `document.body.dataset.reviewReady = 'true'` once the initial render has settled**
(fonts loaded and the entry orchestration reached its settled frame, or immediately when reduced-motion skips
it) and keep it `'true'` after every state/locale/screen/viewport change — the gate waits on
`body[data-review-ready="true"]` together with the snapshot echo and times out the scenario without it.

**`snapshot().responsiveMode` must echo EXACTLY the active layout id from this enum** (chosen by viewport
dimensions, updated on resize): `phone-landscape` (852x393), `ipad-landscape` (1180x820), `steam-deck`
(1280x800), `desktop-1440` (1440x900), `steam-1920` (1920x1080). Any other naming (`tablet-landscape`,
`desktop`, `steam-wide`, …) times out the whole matrix.

**The root `[data-od-id="title-screen"]` must carry `data-local-first-frame="true"`** once the first frame is
composed locally (no remote wait).

**Per-state sentinel + exact marker copy.** Every state must render a VISIBLE element matching its selector,
containing the exact marker text for the active locale:

| state | selector | zh marker | en marker |
|---|---|---|---|
| title-first-run | `[data-od-state="title-first-run"]` | 进度将先保存在此设备 | Progress will be saved on this device |
| title-returning | `[data-od-state="title-returning"]` | 本机进度 | Progress on this device |
| title-cloud-checking | `[data-od-state="title-cloud-checking"]` | 正在检查云端安全 | Checking cloud safety |
| title-offline | `[data-od-state="title-offline"]` | 离线 · 本机进度仍安全 | Offline · device progress remains safe |
| title-route-loading | `[data-od-state="title-route-loading"]` | 正在开启魂殿 | Opening the hall |
| title-settings | `[data-od-id="title-settings-panel"]` | 设置 | Settings |
| title-credits | `[data-od-id="title-credits-panel"]` | 制作人员 | Credits |
| title-reset-confirm | `[data-od-id="title-reset-confirm"]` | 重置本机进度？ | Reset device progression? |
| title-cloud-conflict | `[data-od-id="title-cloud-conflict"]` | 选择要保留的进度 | Choose the progress to keep |
| title-quit-confirm | `[data-od-id="title-quit-confirm"]` | 退出冥骨魂殿？ | Quit Bone Halls? |

**Locale + root + command DOM contract** (gate-enforced, per render):

- `document.documentElement.lang` must be exactly `zh-CN` (zh) / `en` (en), updated by `setLocale` and honored
  on `od-lang` query boots.
- The en render must contain **zero visible CJK text glyphs** (`[㐀-鿿]` scan of visible body text) —
  including the brand lockup: en shows `BONE HALLS` only, with no 冥骨魂殿 text node (decorative Chinese may
  only appear as pure vector/image artwork, not text). The zh render must contain Chinese text (trivially true).
- The root `[data-od-id="title-screen"]` must be the ONLY element with that id and must carry
  `aria-label="冥骨魂殿"` (zh) / `aria-label="Bone Halls"` (en), switching with locale.
- `[data-od-id="title-enter-hall-command"]` must be visible, its text content must contain the exact string
  `进入骨殿` (zh) / `Enter Hall` (en) — the match is case-sensitive on text content, so style uppercase via CSS
  `text-transform`, never author `ENTER HALL` as literal text — and the element must expose the route as
  `href="#home"` or `data-route-target="#home"`.
- The same text-casing rule applies to the brand: the en product name must be authored as the text
  `Bone Halls` (uppercase display via CSS only) or the product-name check fails.
- **Casing check methods differ by element.** The brand/product-name check reads `textContent` (CSS
  `text-transform: uppercase` display is fine there), but the primary-command check reads **`innerText`**,
  which is CSS-aware — the RENDERED command label must contain title-case `Enter Hall`, so the en primary
  command may NOT be displayed uppercase at all (no `text-transform: uppercase` on command labels; style
  with serifs/letter-spacing instead).
- **Confirm-dialog safe default is a literal Cancel.** In `title-reset-confirm`, `title-cloud-conflict`, and
  `title-quit-confirm`, the primary-action check switches to the `[data-od-safe-default="cancel"]` element and
  requires its RENDERED text (innerText) to contain exactly `取消` (zh) / `Cancel` (en) — flavored safe labels
  (`暂不处理`, `留在殿前`, `Decide Later`, `Stay at the Gate`) fail; keep flavor as a subtitle if desired. The
  same element must receive initial focus when the dialog opens. The innerText casing rule applies to every
  dialog button too (`Cancel`, `Keep Local`, … rendered title-case, no uppercase display).
- **Controller support must poll the real Gamepad API.** The gate simulates a controller by shimming
  `navigator.getGamepads()` (D-pad Down = button 13, D-pad Up = button 12) with NO keyboard events — the
  artifact needs a polling loop (e.g. requestAnimationFrame) that edge-detects those buttons and moves the
  same roving focus (with the visible ring) as keyboard arrows, working from a cold unfocused page.
  Keyboard-only handlers do not satisfy the controller probe.
- `[data-od-id="title-character-scene"]` and `[data-od-id="title-command-area"]` are required container
  sentinels (in addition to `title-hall-scene`) — the composition check requires all three visible.
- **`reviewReady` latches only at the settled frame.** The gate samples visibility ~180ms after
  `body[data-review-ready="true"]`; if the staged entry still has command plates at opacity 0 at that
  moment, "visible actionable controls exist" and the primary-action check fail. Flip `reviewReady`
  after the entry orchestration completes (and after every setter re-run), with reduced-motion latching
  immediately on its settled frame.
`snapshot()` returns `screen`, `locale`, `state`, `responsiveMode`, `toolbarVisible`, `reducedMotion`, and
`capabilities.desktopQuit`. Query support includes:

```text
?od-screen=title&od-lang=<zh|en>&od-state=<state>&od-review=0&od-desktop-quit=<0|1>
```

The review DOM includes these independent sentinels:

```text
title-screen                 title-brand-lockup
title-hall-scene             title-character-scene
title-command-area           title-enter-hall-command -> #home
title-settings-command       title-credits-command
title-quit-command           hidden unless desktopQuit=true
```

Safety dialogs use `data-od-modal-open="true"`. Reset, cloud conflict, and Quit default focus to
`data-od-safe-default="cancel"`; destructive or irreversible choices use `data-od-destructive="true"` and
never receive default focus.

## Visual Direction

Use a full-screen pharaonic hall with a clear character presence and a restrained carved command area. It must
read as a game title scene, not a landing page, dashboard, card grid, generic gradient, or marketing hero.
Keep the product name and first local frame visible while cloud checking or `#home` route loading continues.
Remote state must never gate the first frame.

## Runtime Boundaries

- `#home` and every current meta surface remain runtime-owned and frozen.
- `Enter Hall` targets the existing `#home`; the standalone does not reproduce Home.
- `cloudMeta.js` currently supports local-first hydration and debounced cloud mirroring. It has no conflict or
  reset API. Conflict and reset states are design contracts, not permission to invent persistence calls.
- Quit Desktop is a capability presentation contract. No desktop bridge exists in the current runtime, so the
  command is hidden when `desktopQuit` is false.
- Audio controls reference the current SFX/BGM/mute capabilities. Do not invent extra audio channels.
- Every render is single-locale. Player copy never exposes `H5 Lab`.

## Acceptance

The immutable preview gate verifies product copy, complete states/viewports/locales, local first-frame
sentinels, self-contained resources, `#home` routing, forbidden save-slot copy, touch geometry, keyboard and
controller focus movement, Escape/B behavior, modal focus trap, safe Cancel defaults, Quit capability gating,
and reduced motion. A green technical capture still requires visual owner review.
