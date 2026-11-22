# Critique rubric: UI and input

Use it on your own output before calling a UI task done. Blockers first: any blocker means the work
is not done. Then score each line 0 to 2 and fix every 0. Measurable lines name the check that
proves them; visual lines are judged on a contact sheet of at most 1,600 px, never on single PNGs
one by one.

## Blockers

- A UIAudit or lead `Audit.ui` finding at warn or error outside test fixtures.
- A `UILayout.check` warn on any target preset: offscreen, under the top bar, outside the safe area,
  over a core touch control, overlapping, clipped text.
- A persistent HUD that resets on respawn, or two HUD copies after a respawn.
- An action with no gamepad binding, or a touch-only action with no on-screen button.
- A menu that leaves gameplay input live (Q, E or the jump fire behind it) or leaves the touch
  controls hidden after it closes.
- A modal with no close path on one input type (no ButtonB, M or Escape equivalent, no close
  button).
- Prices, coins or ownership decided on the client.
- Text that carries state by color alone (rarity, team, hazard).
- A StyleRule with a non-empty `SelectorError`.
- A claim of "tested on phone" or "works with a gamepad" with no `results.json` entry or capture
  behind it, or a claim that hides what needs a real device.

## Scored items (0, 1, 2)

**Structure**

- One tree for every device; no per-device ScreenGui copies.
- Shell in Scale with `UISizeConstraint` caps; touch targets and text in Offset.
- Constraints on outer containers only; no `UIScale` on a ScreenGui.
- Layout objects own positions; no hand-set Position under a `UIListLayout` or `UIGridLayout`.
- Each screen is its own ScreenGui or page, toggled by `Enabled` or a page attribute, not by moving
  it offscreen.

**Style**

- Tokens for colors, radii, text sizes and bar heights; themes define the same token names.
- Display-size and input adaptation through query selectors, not through code reading the device.
- Code sets no property that a rule owns; tests read styled values with `GetStyled`.
- Contrast at least 4.5:1, or 3:1 for text of 24 px and up, in every theme (`low-contrast` 0).

**Input**

- InputContexts per state: gameplay below, menu above with Sink, enabled only while open.
- Every action: key and gamepad button; a touch `UIButton` where nothing on screen does the job.
  Shortcuts for a control the player taps anyway (tabs, Buy) need none (`ias-no-touch`, info
  severity).
- Rebinding offered, with Roblox-reserved keys refused and conflicts swapped inside a context
  (`UISettings.rebind`).
- No equal-priority contexts sharing a key; no chords; no F keys.
- Glyphs follow `PreferredBinding`; touch hides key glyphs.
- Gamepad: opening a menu selects a sensible first object; every button `Selectable`; selection
  scrolls the grid.

**Mobile**

- Ability or action buttons above the `JumpButton` on touch, clear of the left 40% thumbstick zone.
- Status display top left, under the top bar; menu button top right; no buttons in the chat area
  (top left, under the bar).
- Ability buttons re-placed after a rotation or an input switch.
- Chat window disabled at `ViewportDisplaySize` Large (console guidelines).
- At least one full row of shop cells on the smallest landscape phone.
- Targets at least 44 px on touch; text at least 11 px.

**Player preferences and localization**

- Decorative transparency multiplied by `PreferredTransparency`; fades skipped under
  `ReducedMotionEnabled`.
- Settings page with volume per `SoundGroup` and a camera shake level, both stepped.
- Body text grows with `PreferredTextSize`: no `TextScaled` or capped body text
  (`UISettings.lockedText`), layout rules under `@PreferredTextSize*`.
- Dynamic labels `AutoLocalize = false`; static labels localizable.
- German and +40% pseudo-localization: 0 `text-clipped` on the smallest phones.

**Screen budget and discovery**

- Permanent HUD elements listed; a fourth has a reason.
- The shop is reachable in a few inputs from the HUD (count them), and a first-open event is planned
  for the published game.
- Every purchase shows and sounds; a refusal says why in text.

**Evidence**

- `run_live.py` and `run_offline.sh` pass; `results.json` holds every procedure.
- Contact sheets for the HUD and the shop across all presets, opened and judged.
- Not-run items listed with the reason (controller hardware, real device, publishing, the Largest
  text size, a naive-player test).

## Visual pass (on the contact sheets)

- Can you read every label at thumbnail size on the phone tiles?
- Does anything sit under the jump button, the thumbstick zone or the top bar buttons?
- Is the intended action the largest, highest-contrast button on each screen?
- In grayscale, can you still tell Common, Rare, Epic and Legendary apart (badge letters)?
- On the Xbox tile, are cells and abilities larger, and is the focus ring visible?
- In portrait, does the panel still show the tabs, a row of cells and the Buy bar, and do the
  abilities still sit above the jump button?
- Do the Light and Dark captures both keep text readable on every surface?
