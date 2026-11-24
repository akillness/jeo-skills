# API guide

Rules every component follows, current and future. "Must" is a rule, and "prefer" is a default you can argue with. Before you add a prop, a part, a reason or a name, check it here, then search core for an existing one.

## 1. Naming

- **Props** are camelCase nouns or adjectives, without an `is` or `should` prefix: `open`, `disabled`, `multiple`, `keepMounted`.
- **Callbacks:**
  - `on<Key>Change` for state.
  - `on<Event>` for things that happen: `onAction`, `onSelect`.
  - `on<Key>Commit` when the user finishes changing a value: Slider's `onValueCommit` when the thumb is let go, Resizable's `onLayoutCommit` when the drag or key press ends.
  - `on<Key>ChangeComplete` for animations that finish. Never for an interaction that ends: that's `…Commit`.
- **Same idea, same name:**

| Idea                                            | Name                                                                                                                                                 |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arrow keys wrap                                 | `loop` (default `true`)                                                                                                                              |
| Keys follow focus or wait for Enter             | `activation: "automatic" \| "manual"`                                                                                                                |
| Several open or selected                        | `multiple`                                                                                                                                           |
| Stay in the DOM while hidden                    | `keepMounted`                                                                                                                                        |
| Findable while hidden                           | `hiddenUntilFound`                                                                                                                                   |
| Pointer rest before opening, and before closing | `delay`, `closeDelay` (ms)                                                                                                                           |
| Close after choosing                            | `closeOnSelect`                                                                                                                                      |
| Drive from outside                              | `controller`                                                                                                                                         |
| Data a trigger or `open()` hands the content    | `payload`                                                                                                                                            |
| What a popup is positioned against              | `anchor` (an element, a point or a rectangle)                                                                                                        |
| Log changes                                     | `debug`                                                                                                                                              |
| Render elsewhere                                | `container`                                                                                                                                          |
| Axis                                            | `orientation: "horizontal" \| "vertical"`                                                                                                            |
| Keyboard shortcut, as `"mod+k"`                 | `shortcut` (§12)                                                                                                                                     |
| How a layer presents                            | `presentation: "auto" \| "<default>" \| "sheet"`. `"auto"` picks the sheet on small touch screens. A sheet is modal unless `modal` is set to `false` |
| A value with three or more shapes               | `mode`, like `"single" \| "multiple" \| "range"`                                                                                                     |
| Placement against an anchor or a viewport edge  | `side` and `align`. Never `position`                                                                                                                 |
| Whether a toggle is on                          | `pressed`, `defaultPressed`, `onPressedChange` (`aria-pressed`), never `checked` or `active`                                                         |
| Pressing the chosen item again clears it        | `deselectable` (ToggleGroup, Listbox). Not Accordion's `collapsible`, which lets every panel close                                                   |
| Disabled but still in the tab order             | `focusableWhenDisabled`                                                                                                                              |
| A line or mark that's only visual               | `decorative` (Separator): hidden from assistive technology                                                                                           |
| Keep a layer open while it holds unsaved work   | `dismissible` and `onDismissAttempt`                                                                                                                 |
| Stay scrolled to the end as content grows       | `stickToEnd` (Scroll Area). Not `anchor`, which is what a popup is positioned against                                                                |
| The item for the current page                   | `current`, with `data-current` and `aria-current="page"` (Tree, PaginationLink, NavigationMenuLink). Never `active`                                  |
| The pointer is over a part                      | `hovering` and `data-hovering`, like `dragging` and `scrolling`. Never `hovered`                                                                     |
| A bound, and a count                            | `min` and `max` for bounds; `max<Noun>` for counts: `maxFiles`, `maxDays`, `maxSelected`, `maxVisible` (Toast), `maxLabels` (SelectValue)            |
| A function that returns text                    | `get<Noun>`: `getHref`, `getValueLabel`, `getMoreLabel`, `getTokenDescription`. `announcement` and `itemToValue` / `itemToLabel` keep their names    |
| Alignment along a line of text                  | `"start" \| "center" \| "end"`, which follow the reading direction. Never `"left"` or `"right"` (OTPInput's `textAlign`)                             |
| The highlight moved                             | `onHighlight(value, { index, event })` on every list: Select, Combobox, Listbox, Autocomplete, Tree                                                  |
| Text announced while an action is pending       | `pendingAnnouncement` (§2)                                                                                                                           |

- **Component names:**
  - Controls you type or pick values into are `<Kind>Input`: `Input`, `NumberInput`, `FileInput`, `TokenInput`, `OTPInput`. Never `Input<Kind>`, and never `<Kind>Field`: `Field` is the label, description and error wrapper.
  - Native element names stay: `Textarea`.
  - Widgets with their own names stay: `Select`, `Combobox`, `Autocomplete`, `Slider`, `Checkbox`, `Switch`, `Radio`.
  - Acronyms are all caps in components (`OTPInput`) and lowercase in files and tags (`otp-input`, `<ui-otp-input>`).
  - The editable element inside an `…Input` composite is `<Root>Control` (`NumberInputControl`, `OTPInputControl`), like `FieldControl`. Composites not named Input keep `<Root>Input` for their text input (`ComboboxInput`, `TriggerMenuInput`). An editor that isn't a native input is `<Root>Editor` (`TokenInputEditor`).
  - A part that opens something is a `…Trigger`; a component that holds a value is never named Trigger.
  - Roots carry the component name: `Resizable`, not `ResizablePanelGroup`.
  - A part that works from anywhere connects inside its root on its own and outside through `controller` (web: `for="id"`), like triggers (§8). Example: `NumberInputScrubArea`.
- **Groups are parts, not components.** A group is a part of the component it groups: `Checkbox` with `CheckboxGroup`, `Toggle` with `ToggleGroup`, `Radio` with `RadioGroup`, `Field` with `FieldSet`, `FieldLegend` and `FieldGroup`. One entry, one docs page per component. A pattern with its own keyboard model or role stays its own component (Accordion, Alert Dialog). Every component with its own docs page has its own entry, so `switch`, `alert-dialog` and `textarea` are entries even though core serves them from `checkbox`, `dialog` and `input`.
- **No `dir` prop.** Direction is read from the DOM with `isRTL(el)`.
- **A boolean that turns behavior on or off names what it covers,** so it can't be taken for a value of the same word: Menu's `itemShortcuts`, beside an item's `shortcut`.
- **No boolean traps.** A boolean says one thing. When there are three or more modes, use a string union (`activation`, `presentation`), never two booleans that conflict.
- **Core's public functions say their kind.** `define*` makes a primitive, `create*` something stateful, `bind*` takes an element and returns a cleanup, a bare verb is an action, a noun, `*Of`, `*Attrs` or `*Message` is a pure helper, `is*`, `has*`, `supports*` and `matches*` answer yes or no, and `register*` is only for page-wide registries. A behavior is one job an interface does, like `createRovingFocus`, and is listed under Behaviors. The kernel's own `create*` functions (`createChange`, `createCommit`, `createController`, `createUndoStack`) make the pieces a primitive is built from, and aren't behaviors. `pnpm lint` checks what a script can (`public-names`).

## 2. State props and callbacks

Every piece of state a user can control gets three props, and `change()` wires them from the state key:

```ts
open?: boolean                   // Controlled.
defaultOpen?: boolean            // Uncontrolled start. A form reset returns here.
onOpenChange?: (open: boolean, details: ChangeDetails<PopoverOpenChangeReason>) => void
```

- **Keys are `open`, `value` or `checked`.** Use another key only for genuinely new state, like Drawer's `snapPoint`.
- **`value` is `string`** for one and `string[]` for many. Nothing selected is `null`, never `undefined`, because `undefined` means uncontrolled.
- **Formatted values use their standard string:** dates `YYYY-MM-DD`, times `HH:mm`, colors as CSS color strings, phone numbers as E.164. Bounds also take `"today"` and `"now"`. Parsers live in core. A date range is `[start, end]`.
- **When a value has three or more shapes, a `mode` union picks one** instead of `multiple`, like Calendar's `mode="single" | "multiple" | "range"` and Tree's `mode="none" | "single" | "multiple"`. Tree's `checkable` doesn't make `mode` ambiguous: checkboxes have their own `checked` value, and `mode` decides only the shape of `value`.
- **The new value comes first, then the details.** Extra context, like which item, goes in the details: `(checked, details & { value })`, never `(value, checked)`. Every callback that hears about a value gets a details object, even one with only `event`, and it's a named, exported type: `MenuActionDetails`, `TokenInputSubmitDetails`, `AutocompleteSubmitDetails`. Never an inline `{ event?: Event }`.
- **Finishing a value is `on<Key>Commit`, through `createCommit`:** Slider and NumberInput when the drag or key press ends, OTPInput when every slot is filled.
- **Never fire on mount.** A default the component picks is not a change.
- **Controlled and uncontrolled:** no type-level unions. `definePrimitive` warns in development when both `x` and `defaultX` are passed, or when `x` switches between defined and `undefined`.
- **Change callbacks are synchronous,** because `cancel()` must be decided at once. For async confirmation, cancel, then call the controller later. Only action handlers (below) may return a Promise.
- **Use `change()` only for keys that have a public `on<Key>Change`.** Internal state uses `store.set`.

**Action handlers may return a Promise.** `onAction`, `onSelect`, `onCreate`, a Close part's `action` and Button's `onClick` run an action, and a returned Promise means pending. Type them as returning `unknown`, like `(value: string, details: MenuActionDetails) => unknown`, never `void | Promise<unknown>`, so one-line handlers that return a value, like Vue's `(v) => (last = v)` or a Solid setter, still type-check. Every component that runs one takes `pendingAnnouncement` and announces through `announcePending` (`kernel/action.ts`): Button, Dialog, Alert Dialog, Drawer, Toast, Menu, Command, Tree, Trigger Menu and Combobox:

- The part gets `data-pending` and `aria-busy`, stays focusable, and has `pending` in its state. Repeat activations are ignored. After about a second, core announces a short localizable "Loading", and a pending part sets `aria-disabled` until it settles.
- A Promise a popup controller's `open()` returned isn't a wait: `onSelect={() => dialog.open()}` opens the dialog and the menu closes at once (`popupResult` in `kernel/action.ts`).
- A layer that closes on select closes when the Promise resolves. A Close `action` closes with the reason `action`.
- A rejection keeps the layer open, clears `pending`, and puts the reason in the state's `error` until the next activation.
- React and Solid return the Promise. Vue declares the handler as a function prop beside the emit, so `@action="save"` binds to the prop and the part gets the return value. Web components call `event.detail.waitUntil(promise)`, like `ExtendableEvent`.

```tsx
<MenuItem onSelect={() => save()}>Save</MenuItem> // Stays open with data-pending until saved.
<AlertDialogClose action={() => deleteProject(id)}>Delete</AlertDialogClose>
```

## 3. Change details and reasons

```ts
type ChangeDetails<Reason extends string = string> = Reason extends unknown // One member per reason.
  ? {
      reason: Reason // Why.
      event?: EventOf<Reason> // The DOM event, typed by reason. Undefined for imperative changes.
      source: ChangeSource // How: "mouse", "touch", "pen", "keyboard", "virtual" or "programmatic".
      cancel: () => void // Stops it. Controlled components ignore it.
      readonly canceled: boolean
    }
  : never
```

- **`source` says how the user caused the change.** Core derives it from the event, or for cascades (`parent-close`, `submenu-switch`) and hover timers from the change or pointer event that started them. Never pass it by hand, except from a timer, which passes its starting event's source. No event (`imperative`, `timeout`, `item-removed`) and an untrusted `el.click()` are `programmatic`. `"virtual"` means a click with no pointer or key behind it, which may be assistive technology. Never change behavior for `"virtual"`: use it for analytics and focus heuristics only.
- **Each `ReasonVocabulary` entry declares its event type:** `"escape-key": KeyboardEvent`, `"trigger-press": MouseEvent | KeyboardEvent | TouchEvent`, `imperative: undefined`. Add the event type with the reason, and `<ReasonTable>` shows it. Checking `reason` narrows `event` with no cast, in React props, Vue emits and web events. Development builds warn once for any change whose event isn't the type its reason lists (`checkEvent` in `dev.ts`).
- **Group reasons with `isDismissal(reason)`,** never with a hand-written list. Core exports it with the `DismissReason` union: `escape-key`, `outside-press`, `focus-out`, `window-blur`, `back`, `swipe`.
- **Change details cancel with `cancel()`, real events with `preventDefault()`.** Details aren't events: they carry one in `details.event`, whose `preventDefault()` stops the browser's default, not the change. Development builds warn once per callback when that runs without `cancel()` (`checkPrevented` in `dev.ts`).
- **Every dismissable layer takes `dismissible` and `onDismissAttempt`:** Dialog, Alert Dialog, Drawer, Popover, Menu, Select, Combobox, Autocomplete and Trigger Menu. `false` refuses Escape, outside presses, focus and the window leaving, back, and a sheet's swipe; triggers, Close parts and controllers still close it. `onDismissAttempt({ reason, event })` hears the deliberate ones, never focus or the window leaving. Tooltip and Hover Card never take it (WCAG 1.4.13).

```tsx
<Menu onOpenChange={(open, { reason, source }) => track("menu", { open, reason, source })} />
<Popover dismissible={!dirty} onDismissAttempt={({ reason }) => askToDiscard(reason)} />
```

- **Export a reason union per callback** (`MenuOpenChangeReason`, `TabsValueChangeReason`), and list it in the docs with `<ReasonTable>`. The vocabulary is `ReasonVocabulary` in `details.ts`, one JSDoc line per reason, which `<ReasonTable>` reads. Add a reason there before a component reports it.
- **`on<Event>` handlers** get the DOM event, or a new cancelable Event when there's none, like Menu's and Command's `select` for a shortcut or a controller's call. They cancel with `preventDefault()`.
- **Callbacks on a collection's root** that report for any item put the item in the details: Menu's `onCheckedChange(checked, details & { value })` and `onValueChange(value, details & { group })`. The item's own callback hears first, and either can cancel.
- **Reason names:** use the shared vocabulary below. Add a reason only for a cause none of them covers, named `<part or source>-<input>` in kebab case. Never emit `none`: every change has a cause.

| Reason                    | Meaning                                                                                                                |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `trigger-press`           | Click, tap, Enter or Space on the part that opens, closes or toggles. Arrow keys that open a menu or submenu count too |
| `trigger-hover`           | The pointer rested on a trigger, or left it with `openOnHover`                                                         |
| `item-press`              | A member of a collection was chosen: menu item, tab, radio, checkbox item                                              |
| `close-press`             | A Close part                                                                                                           |
| `press`                   | A single-element control: Checkbox, Switch, Toggle                                                                     |
| `list-navigation`         | Arrow, Home or End keys moved a selection                                                                              |
| `outside-press`           | A press outside the layer                                                                                              |
| `escape-key`              | Escape, or a submenu's close key (ArrowLeft in LTR)                                                                    |
| `focus-out`               | Focus left the layer                                                                                                   |
| `window-blur`             | The window lost focus                                                                                                  |
| `submenu-switch`          | Another submenu in the same menu, or another menu in the same menubar, took over                                       |
| `parent-close`            | The parent layer closed                                                                                                |
| `trigger-release`         | A press-and-hold open was released outside                                                                             |
| `find-in-page`            | The browser's find matched hidden content                                                                              |
| `item-removed`            | The selected item left the page, and the component picked another (Tabs)                                               |
| `reset`, `restore`        | Form reset, and the browser restoring state                                                                            |
| `swipe`, `back`           | Drawer and Dialog gestures and Android back, never `escape-key`                                                        |
| `imperative`              | A controller or `api` call                                                                                             |
| `shortcut`                | A keyboard shortcut (§12)                                                                                              |
| `trigger-focus`           | Focus on a trigger opened it (Tooltip)                                                                                 |
| `clear-press`             | A Clear part (Select, Combobox, Date Picker)                                                                           |
| `remove-press`            | A chip's remove part, or Backspace or Delete on a chip (Combobox)                                                      |
| `input-change`            | Typing in a combobox input opened, closed or changed the value                                                         |
| `action`                  | A Close part's `action` resolved                                                                                       |
| `timeout`                 | A duration ran out (Toast)                                                                                             |
| `unmount`                 | The component left the page while open. Only a controller's `open()` reports it                                        |
| `drop`, `paste`, `picker` | Files were dropped, pasted, or chosen in the system's file picker (FileInput)                                          |
| `scroll`                  | The user scrolled a carousel some other way than a swipe: a wheel, a trackpad, a scrollbar, focus or find in page      |
| `focus-in`                | Keyboard focus moved into a rotating carousel, which stops it (Carousel)                                               |
| `move-key`                | A keyboard move of a picked-up item (`createReorder`)                                                                  |

`details.ts` is the full list; this table holds the ones you'll reach for.

## 4. Parts

- **Root:** the component name (`Menu`, `Tabs`). It renders an element only if it carries semantics or state. Popup roots render none.
- **Layers over the page** use `Content`: Menu, Popover, Dialog, Drawer, Select. **Regions in the flow** use `Panel`: Tabs, Accordion, Collapsible.
- **Opening parts** use `Trigger`. A part whose ARIA role has a name keeps that name (`TabsTab`, `Radio`). Other collection members use `<Component>Item`, with `<Component>CheckboxItem` and `<Component>RadioItem` for variants.
- **Fixed names:** `Indicator` shows a part's state (`ItemIndicator` inside items); `Arrow`, on every positioned `Content`; `Title` and `Description` for dialog-like content; `Label` and `Description` for form fields; `GroupLabel`; `Separator`; `Close`; `Header`, the heading around a trigger; `Thumb`, `Control` and `Error`.
- **Prefer the platform to a part for the common case.** Popup `Content` is in the top layer, so its native `::backdrop` is the backdrop. Positioned `Content` writes `--arrow-offset` (where the anchor's center falls along the edge, clamped by `arrowPadding`) beside `data-side`, so a `::before` is the arrow. `presence` waits for the `::backdrop`'s transitions too, and `overflow: hidden` clips a `::before` arrow. Keep `Backdrop` and `Arrow` for full control: custom markup, browsers without the top layer (`supportsTopLayer()`), and SVG arrows with borders. Never add a `backdrop` or `arrow` prop.

  ```tsx
  <DialogContent className="backdrop:bg-black/50 backdrop:transition-opacity data-starting-style:backdrop:opacity-0 data-ending-style:backdrop:opacity-0" />
  ```

- **Accessible names come from content or forwarded `aria-*`, never a `label` prop.** Every part forwards `aria-*`. A part without a name warns through the shared `checkName(el, part)`, never a message of its own.
- **The author's value wins for what no behavior reads:** `id`, and what names an element or hints how to type in it: `aria-label`, `aria-labelledby`, `aria-description`, `title`, `autocomplete`, `autocapitalize`, `autocorrect`, `spellcheck` and `inputmode` (`yieldToAuthor` in `kernel/part.ts`, which every adapter and `applyAttrs` use). A field's label replaces a control's own label reference, like a `ComboboxLabel`'s, but not one the author passes. Everything else a part writes stays its own: `role`, `tabindex`, references like `aria-controls`, `aria-activedescendant` and `aria-describedby`, which a field combines with the control's own, state attributes, and `data-slot`, which core and its styles find parts by. Classes combine; styles combine, with the part's properties winning.
- **React:** flat exports (`MenuTrigger`), not namespaces. **Web components:** `<ui-` plus the kebab-case React name (`<ui-menu-sub-trigger>`).
- **Inferable props:** a part never takes what it can infer from context, like the item's `value` inside an `AccordionItem`, and its exported props type omits it too. When an inference reads content and can be wrong (typeahead text, the current page, whether a tooltip names or describes its trigger), take an explicit prop that wins.
- **Identity is optional when nothing refers to it.** An item's `value` is required only when something must name it: a paired panel, a form, `defaultValue` or controlled state. Otherwise the item generates one, stable across renders and SSR, and reports it like any other. `<AccordionItem>` alone is fine.
- **A feature that needs its own element is a part, not a boolean.** Rendering `SelectSearch`, `SelectClear`, `ComboboxCreate`, `ComboboxEmpty` or a `*Shortcut` part turns the feature on. No `searchable`, `clearable` or `creatable`.
- **One component per ARIA pattern.** A behavior that changes the pattern or the set of parts is a separate component (`Combobox`, not a Select variant). One that keeps the parts and changes how they present is a string option (`presentation`, `mode`). A look is a class.
- **Parts render default children from state** when they have none: `FieldError` the message, `SelectTrigger` a `SelectValue`, `SelectValue` the selected label or the placeholder, `*Shortcut` the formatted keys. Children always replace the default.
- **Data APIs are only for collections.** Menu, Select, Combobox, Command and Toast's queue may take `items` and render their own parts, bare and unstyled. People style them by rendering the parts themselves, and on the web by writing them in a `<template>` inside the element. One shared definition is a plain typed array (`const plans: ListData = [...]`), never a helper. Shorthands on anything else (`label` on a control, `content` on a tooltip) belong in a styled layer, not here.

## 5. Shared option types

Declare these once, in core, with JSDoc, and spread them into component types. Components document only their defaults. `PositionProps`, `PortalProps`, `Side`, `Align` and `Anchor` live in `platform/position.ts`, and `Modal` in `popups/popup.ts`; all are exported from `@ui-sdk/core`.

- **`PositionProps`** on every positioned `Content`, never re-declared by a component except to document its own default: `side` (`"top" | "bottom" | "left" | "right"`, plus logical `"start" | "end"`), `align` (`"start" | "center" | "end"`), `sideOffset`, `alignOffset`, `collisionPadding`, `arrowPadding`, and `anchor`: an element, a CSS selector, a point `{ x, y }`, or anything with `getBoundingClientRect()`. It's read on every check, so it can move. A controller's `open({ anchor })` overrides it for that open.
- **Viewport placement uses `side` and `align` too:** `<ToastRegion side="bottom" align="end" />`. No `position` prop.
- **`PortalProps`:** `container?: Element | DocumentFragment | null`. Web takes a CSS selector. A popup without `container` inherits the nearest enclosing popup's, and an explicit `container` wins.
- **`keepMounted`** on every popup `Content` that leaves the page while closed. Not on Tooltip's: it's always in the page, so its trigger is named or described before focus reaches it.
- **`presentation`** on Menu, Popover, Dialog (`"auto" | "dialog" | "sheet"`), Select, Combobox and Autocomplete, default the component's own. Not on Alert Dialog, Trigger Menu, Tooltip, Hover Card, Navigation Menu or Menubar, and a context menu stays a popover. A sheet keeps the popup's role and keys; it adds motion, a swipe to dismiss (reason `"swipe"`) and a dim, the viewport's `::backdrop` colored by `--sheet-backdrop`. A sheet is modal, even for popups that aren't by default, unless `modal={false}` is passed. The sheet code preloads in idle time, once per page, only for a popup created with `"sheet"`, or `"auto"` on a coarse pointer. No public `snapPoints` yet.
- **In a Combobox or Autocomplete sheet,** the input renders in the sheet's header while it's open; a touch open focuses the sheet, not the input, so the keyboard doesn't open; focusing the input grows the sheet to its largest snap point; choosing an option closes it, and `multiple` stays open.
- **`FocusProps`:** `initialFocus` (`"auto" | "content" | "none" | selector | element | () => element`) and `finalFocus` (`"trigger" | "none" | …`).
- **`modal`** (`Modal`): `true` makes the page inert, locks scroll, traps focus and consumes outside presses. `false` does none of these. A string keeps exactly one effect: `"trap-focus"` keeps the focus trap, and `"pointer"` keeps outside-press consumption. Each component accepts a documented subset of `boolean | "pointer" | "trap-focus"`.
- **Form props**, matching HTML: `name`, `value` (the submitted value), `form`, `required`, `readOnly`, `disabled`. Every form control takes the whole set, with `data-readonly` and `data-required`, even where its native element ignores one: a slider's range input ignores `readonly`, so Slider says it with `aria-readonly` and stops drags, keys and screen reader adjustments; it always has a value, so `required` never blocks a form. A group's `readOnly` (CheckboxGroup) reaches every control in it, like `disabled`.
- **`disabled` means what the pattern says,** and the JSDoc says which: composite items (menu items, tabs, accordion triggers) stay focusable; radio items and list options (Select, Combobox, Listbox, Autocomplete, Command) are skipped, like in a native select; form controls are natively disabled, not focusable and not submitted.

## 6. Data attributes and CSS variables

- **Every part has `data-slot="<component>-<slot>"`.**
- **State is boolean presence attributes.** No `data-state`. Pairs exist only where both sides are styled:

| State     | Attributes                                                                                                                                                                 |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Open      | `data-open`, `data-closed` (trigger, content, item, panel). With several triggers, only the one that opened the popup has `data-open`                                      |
| Checked   | `data-checked`, `data-unchecked`, `data-indeterminate`                                                                                                                     |
| Pressed   | `data-pressed` (a pressed Toggle). No `data-unpressed`: style the off state as the default                                                                                 |
| Single    | `data-selected` (a tab and its panel), `data-highlighted`, `data-disabled`, `data-readonly`, `data-required`, `data-invalid`, `data-valid`, `data-focused`, `data-pending` |
| Animation | `data-starting-style`, `data-ending-style` (from `presence`)                                                                                                               |
| Layout    | `data-orientation`, `data-side`, `data-align`, `data-arrow-clamped`, `data-nested`, `data-modality` (valued, below)                                                        |

- **Attribute values are strings, with `""` for booleans.** Write them from `attrs()`, or with `setAttribute("data-…")` in core, so the `DataAttributes` docs component finds them. Use `openAttrs(open)` and `checkedAttrs(checked)` for the pairs, so every part spells them the same.
- **The same state gets the same attribute on every part that has it.** A menu checkbox item and a `Checkbox` both get `data-checked`.
- **The docs build generates the attribute list** from `attrs()` and `setAttribute("data-…")`. It drives the `DataAttributes` tables and a test that every written attribute is documented.
- **`data-modality` on every popup `Content`:** `"keyboard"` or `"pointer"`, for how the user is working in it now. It starts from the opening `source` (`virtual` counts as `keyboard`), then follows a keydown, a `pointerdown` or a `pointermove` of more than 2px inside. It's written on the live channel, on the content only, so a mode switch is one write and no re-render. Style highlighted items through it (`[data-modality="keyboard"] [data-highlighted]`), not `:focus-visible`, which virtual focus never matches.
- **No Tailwind variants package.** Presence attributes use Tailwind's own `data-open:`, and valued ones use `data-[side=top]:`.
- **CSS variables:** shared layer variables are unprefixed (`--anchor-width`, `--anchor-height`, `--available-width`, `--available-height`, `--transform-origin`). Component variables are named after what they measure, with the component in the name (`--accordion-panel-height`, `--active-tab-width`, `--drawer-stack`). Write them with `setProperty("--…")` so `CssVariables` finds them.

## 7. Render state

- **Export `<Component><Part>State` for every part with state**, with JSDoc on each field, declared through `slot<Props, State>`. The root's is `<Component>State`, never `<Component>RootState`.
- **A primitive's store type stays internal.** Name it `<Component>Store` or `State` in the component's `*-api.ts`, and never export it from the component's entry.
- **Use the same field names as the attributes:** `open`, `checked`, `indeterminate`, `selected`, `highlighted`, `disabled`, `readOnly`, `required`, `pending`, `orientation`, `side`, `align`. An action's rejection is `error`.
- **Never a field that is always one value for some parts.** Make it real, or leave it out.
- **Settings in state are the setting's type,** like `modal: boolean | "trap-focus"`, not a lossy boolean.

## 8. Controllers

```ts
const tabs = createTabsController()
tabs.select("billing", { reason: "imperative" }) // Verbs for actions.
tabs.getValue() // get<Key>(), or is<Key>() for booleans.
tabs.setValue("billing") // set<Key>() for every controllable key.
tabs.focus()
```

- **Every component with state exports `create<Name>Controller()`,** re-exported from every framework package. Read and write methods follow the rule above.
- **Every write method takes an optional `ChangeOptions<Reason>`, `{ reason, event }`,** which reaches the change callback's details, and every method has JSDoc.
- **Every write method returns `boolean`:** false when the change was canceled, refused (disabled, read-only) or changed nothing. A controlled component returns true once it asked, before the new value comes back. A popup's `open()` returns its result Promise instead.
- **Every component offers the verbs its parts do:** a popup has `open`, `close`, `toggle`, `setOpen` and `focus`; a component with a Clear part has `clear()`.
- **The same surface is the web component's API.** `isOpen()` becomes the `open` property, and `getValue()` and `setValue()` become `value`. The attribute of the same name sets where the state starts, and changing it later changes the state like setting the property. Removing a boolean one clears it, like `open` on `<details>`. Verbs are methods of the element's `api` property (`menu.api.open()`, `tabs.api.select("billing")`). A popup's `open()` can't be an element method, since `open` is the property.
- **Never expose `api.internal`.** The controller's attach hook hides behind a symbol (`attachController()`, for adapters and tests only).
- **Popups:** `create<Name>Controller<Payload, Result = string>()` adds `open({ payload, anchor, reason, signal })`, `close({ returnValue })` and `getPayload()`. The payload stays until the next open, so content doesn't blank while it animates out. A Close part's `value` becomes the `returnValue`, which `onOpenChange`'s details carry too.
- **`open()` resolves exactly once and never rejects.** Its `PopupResult<Reason, Result>` is `{ reason, source, returnValue? }`: `reason` is the component's union plus `"unmount"`. It settles on the next close from any source, on abort (reason `imperative`; an already aborted signal never opens), or when the component unmounts (reason `unmount`, with no `onOpenChange`, since a callback during unmount is unsafe).

  ```ts
  const pick = createDialogController<Row, { id: string }>()
  const { reason, returnValue } = await pick.open({
    payload: row,
    signal: AbortSignal.timeout(30_000),
  })
  pick.close({ returnValue: { id: "42" } }) // Web components: await el.api.open({ signal }).
  ```

- **Adapters must tear down.** `PrimitiveInstance.destroy()` settles open promises and detaches the controller, unless another instance attached since.
- **`open({ payload })` on an open popup replaces the payload,** like a trigger handover: `onPayloadChange` fires with reason `imperative` and can cancel it, the same promise is returned, the trigger that opened it stays expanded, and an `anchor` passed with the new payload moves it. An `open()` without a `payload` key, or with the same payload, changes nothing.
- **Every Trigger works outside its root** through `controller`, declared in core on `<Name>TriggerProps` (and `MenuContextTriggerProps`, `DrawerOutletProps`, `CarouselControlProps`), never re-declared by an adapter, (`for="<root id>"` on web, like `popovertarget`), and passes `payload`. Several triggers can share one root. Only the one that opened it is expanded, anchors it and gets focus back. Every popup ships this in its first version.
- **Component contexts stay internal.** No public `use<Component>()` hooks; custom parts go through `render` and the framework's rendering docs.

## 9. Generics

- **Value-carrying roots take `T extends string = string`:** Tabs, RadioGroup, Accordion, CheckboxGroup, MenuRadioGroup, ToggleGroup. `T` is inferred from `value`, `defaultValue` or `onValueChange`.
- **Don't promise that children are checked against `T`.**
- **Object values** (Select, Combobox) take an arbitrary `T`, with `itemToValue` (string, for ids and forms) and `isItemEqualToValue`.

## 10. Framework mappings

| Core                    | React                                                                                 | Vue                                                       | Web components                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `open` + `onOpenChange` | Same props                                                                            | `v-model:open`, and `@open-change` with `(open, details)` | `default-open` attribute, `open` property, `openchange` event with `detail: { value, reason, event, source }` |
| `onAction`              | `onAction`                                                                            | `@action`                                                 | `action` event                                                                                                |
| `on<Event>` handler     | Prop                                                                                  | Emit                                                      | Cancelable event. `preventDefault()` cancels                                                                  |
| Pending action (§2)     | Return a Promise                                                                      | Function prop beside the emit, returning a Promise        | `event.detail.waitUntil(promise)`                                                                             |
| `shortcut` (§12)        | Prop, plus `useShortcut`                                                              | Prop, plus `useShortcut`                                  | `shortcut` attribute, plus `registerShortcut`                                                                 |
| Custom rendering        | `render` (element or `(props, state)`), `className`, `style` and `children` functions | `#render="{ props, state }"`, default slot `{ state }`    | `as-child` on a part. Triggers wrap a real `<button>`                                                         |
| Styling by state        | `className={(state) => …}`                                                            | `:class` from slot state                                  | `data-*`                                                                                                      |
| Styling data items      | Map the data into parts, or `state.items` in the list part's children function        | `v-for` in the list part, or its slot's `state.items`     | Parts written in a `<template>` inside the element, which it copies                                           |

Solid follows React's column and Svelte follows Vue's, with `bind:` for two-way values and a `render` snippet.

- **React:** parts type their props as `PartProps<Tag, State> & <Core>Props`, never inline re-declarations, so JSDoc reaches editors. Omit the element props that clash: `value`, `defaultValue`, `onChange`, `onSelect`.
- **Vue:** declare `emits` as an object with typed validators. Action handlers are also function props (§2), the one exception. Emit `<key>Change` first, then `update:<key>` only if the change wasn't canceled, so `cancel()` keeps `v-model` as it was. Optional booleans default to `undefined`. Keep named `v-model`s.
- **Web components:** attributes are the kebab-case option and prop names, read from the primitive's schema: string, number, boolean and list kinds are attributes, `value` is a property, a parser function reads an attribute no kind fits (`modal`). Every attribute option also reflects as a property, like a native element's; booleans that start on are named in the define call's `defaults`, so their property reads `true` without the attribute and `false` writes `"false"`. Rich values (`items`, `payload`) are properties only. Every callback becomes a cancelable, lowercase, composed event that doesn't bubble, with `detail: { value, reason, event, source }`, and `preventDefault()` calls `details.cancel()`. An event never takes the name of a native event that bubbles into the element: Trigger Menu's `onSelect` fires `itemselect`, since its text field fires `select` for selected text. Callbacks a part element already reports, like a menu checkbox item's, are `silent` on the owner so they don't fire twice. Action events add `detail.waitUntil(promise)`.

## 11. Docs and JSDoc

- **JSDoc goes on every exported field:** options, part props, state, controller methods, `ChangeDetails` fields and reason unions. That includes adapter-only props like `container`, which belong in core types.
- **Write each comment as one or two plain sentences that say what it does, not how.** Add `@defaultValue` for every default.
- **Mark internal fields `@internal`, and keep them out of public types.** Put them in `<Name>InternalOptions`, which adapters use.
- **Each component page's API reference has** `TypeTable` for the options and each part's props, `<StateTable path name>` for each part's state, `<ReasonTable path name>` for each callback's reason union, `<ControllerTable path name>` for the controller type (all read the exported types with the TypeScript compiler, `apps/docs/components/type-tables.tsx`), `DataAttributes` and `CssVariables`, and one short table for events and `v-model` where the framework has them.
- **Add the component to the props spec** (`tests/docs/props.spec.ts`, one entry in its `components` map), so every public prop appears in an example.
- **Before you ship, check names against this guide.** A new name needs a reason.

## 12. Keyboard shortcuts

`shortcut` uses one syntax everywhere, like `"mod+k"`, where `mod` is ⌘ on Apple platforms and Ctrl elsewhere.

- **Where it goes:** every Trigger, where it opens or toggles what the trigger controls, with the reason `shortcut`; Menu and Command items, where it runs the item, and data APIs run it while the layer is closed; Tooltip, as a hint only.
- **It sets `aria-keyshortcuts`,** and a `<Component>Shortcut` part (`MenuShortcut`, `TooltipShortcut`) shows the formatted keys. `formatShortcut()` from core formats them anywhere else.
- **Bind through the core shortcut manager,** never a keydown listener of your own. `registerShortcut(shortcut, handler, { scope?, layer?, allowInInput?, when?, description? })` in `@ui-sdk/core/shortcuts` returns `unregister`. It's layer-scoped (a handler fires only when its scope isn't under an open modal layer, and the topmost layer wins), ignores editable fields unless the shortcut has a modifier or `allowInInput` is set, ignores IME composition, and warns in development when two live handlers claim the same keys.
- **Parts bind only while mounted.** For anything else, the framework packages export `useShortcut(shortcut, handler, options)`, and web components call `registerShortcut`.

```tsx
<DialogTrigger shortcut="mod+k">Search</DialogTrigger>
<Tooltip shortcut="mod+,">
  <TooltipTrigger>Settings</TooltipTrigger>
  <TooltipContent>Settings <TooltipShortcut /></TooltipContent>
</Tooltip>
useShortcut("mod+shift+p", () => palette.open())
```

## 13. Development tools

- **Development-only code is imported from `#dev`** and never reached from production builds: warnings, the devtools hook and `__UI_SDK_DEV__`. It's a conditional subpath import (`"development"` resolves `dev.ts`, `"default"` resolves `dev-stub.ts`), so a production bundle has no hook code by construction, not by minifier luck. `debug` stays in production.
- **The hook:** in development, core reports `DevEvent`s to `globalThis[Symbol.for("ui-sdk.devtools@1")]` when present, and exposes `window.__UI_SDK__` for the console. `definePrimitive` emits `instance` and `change`, `createCommit` emits `commit`, and `pushLayer` emits `layers`; component code emits nothing itself. Each event has `component` and `id` (optional on `warn`).
- **Every dev warning goes through `warn()` and names its component and id,** like "`Popover#p3` asked to open (`trigger-press`, `mouse`), and `open` stayed `false`. Update it in `onOpenChange`."

## 14. Settled choices

Choices that come up often, with the reason for each.

- **Field stays small, and there's no Form component.** A native `<form>` with Fields does that job, and form libraries bring the rest. Field keeps the browser's own validation and a three-way `invalid` (`true`, `false`, or left out for the browser to decide), with `match` `true`, `false` or a validity flag. No `validate`, controller, dirty, touched or validating state, and Field never calls `setCustomValidity`. Every `FieldError` is a part of its own, and an error counts only while something holds it and its bound element is in the page.
- **Accordion has no arrow, Home or End navigation.** The APG removed it from the pattern, and heading navigation already reaches each trigger.
- **`presentation` stays built in,** not an opt-in import: one prop that always works is worth its bytes, and generated code can't forget an import. Shrink the loader instead.
- **A partly typed OTP code reports `tooShort`.**
- **Calendar and Date Picker:** no date library; values are ISO strings (`"2026-10-16"`), a range is `[start, end]`; one Calendar with `mode`, no Range Calendar; typing is one text input with a locale parser; Gregorian arithmetic only for now; the date code is public as `@ui-sdk/core/date`; each day cell takes focus itself, with no button inside.
- **Reordering:** `createReorder`, a public `bindDrag` and the reason `move-key`. Space or Enter picks up and drops, Escape cancels, Tab cancels and moves on, since no APG pattern exists; the recommended roles are a `listbox` of `option`s with `aria-roledescription`. A drag reports its last `pointermove`, since a `pointerup` has zero pressure and reads as `virtual`.
- **`createRovingFocus().remember(key)`** moves the tab stop to an item whose focus went elsewhere, like a menubar trigger whose menu took it.
- **Core owns behavior, not look.** A helper that only decides how something looks, with no state, focus, ARIA or announcements, belongs in the demo that uses it. Core's motion tells your CSS when, keeps elements in the page until they finish, and gives the end at once to reduced motion.
- **Keep the public API small.** Anything only our components or adapters use, or that's a second way to do something, goes to `@ui-sdk/core/renderer` or stays unexported. It can be exposed later; it can't be taken back. Public is what three or more components use and an agent would otherwise write.
- **Web components register by import**, use the `ui-` prefix, and no component event bubbles.
- **Web components keep every optional part** in their entry, with no per-part imports.
- **Agent refs.** A step names a component by ref, or by its label or whole words of its label and row text together, compared without case or accents; more than one match fails and lists each one's ref, unless exactly one is an open popup. Secret fields (password, OTP, card, `data-agent-secret`) read `[redacted]` everywhere an agent looks. `registerTools` requires an `allow`.
- **FileInput:** `multiple` is off by default like a native input, `onReject` hears all-rejected batches, and `formatFileSize()` formats sizes.
- **Prompt input:** `TokenInputEditor`, one Backspace deletes a chip, copying writes `[@label](type:value)`, Tab accepts a suggestion, and a Trigger Menu nested in a Token Input takes its editor from context.
