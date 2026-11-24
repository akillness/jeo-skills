# @ui-sdk/core

## 0.1.0-beta.16

### Patch Changes

- 0e2349b: Escape closes an open layer like a tooltip before it runs a page shortcut for Escape, whichever started listening first.

## 0.1.0-beta.15

### Patch Changes

- 8060d16: A trapping popup like a modal Dialog brings focus back when a Tab leaves it, as Safari's default Tab does from a last text field followed by buttons.
- a34bd86: A swipe that starts on a drawer's handle moves a drawer using the scroll-snap driver.
- 79d05d1: A field finds a control that takes its role after it arrives, like the button inside a `<ui-select-trigger>` added one element at a time, so its label names and focuses it.
- 358d845: Escape closes a submenu the pointer opened while focus is still on its trigger, and leaves the menu around it open, as it does with focus inside the submenu. A second Escape closes the menu.
- a2dfb9e: OTP Input reads another script's digits, like Arabic-Indic "٤٨٢" or Persian "۴۸۲", as plain ones when its pattern doesn't take them as they are, so a code typed or pasted in them goes in.
- 145936f: A quick click on a Menu or Select trigger no longer counts as a press held to drag when the page is busy rendering what it opened. The hold is timed by when the press and release happened, not by when their handlers ran, so the menu no longer closes and the select no longer chooses the option under the pointer.
- c321356: A sheet no longer scrolls a popup opened from inside it when focus moves into that popup, so a nested sheet's long list opens at its top.
- 13e84a2: A toast whose title already ends a sentence, like "Saved.", is announced without a second period before its description.

## 0.1.0-beta.14

### Patch Changes

- 8573f8f: `agent.act` takes an optional `{ signal }`. When it aborts, a step waiting on `allow` fails as cancelled and later steps don't run, so a chat's stop button can end a confirm nobody will answer.
- 1869178: Agent: a table's header row adds no row text to the controls in it. A sort button in a header used to carry the other column titles as its row, so a step naming one header was refused as ambiguous.
- 4be6e4a: Names read from content put a space around a child that isn't plain inline, like a flex item or an inline-block, as Chromium does. An agent's label for `<button style="display: flex"><span>Read</span><span>Swedish orders</span></button>` is "Read Swedish orders", not "ReadSwedish orders".
- b8abeb6: An `act` step that names a component by its label no longer lands on an open component whose label only holds the same words, like an open Collapsible "Read live-system.png" for a step naming the Button "System". The step is refused with both refs, as it is while nothing is open.
- 855bc7f: The agent bridge leaves out a component inside a popup that's animating out (`data-ending-style`), so a step right after a person's choice in a menu isn't ambiguous with the field the menu belongs to.
- b4dbe88: Inside a `Field`, `ComboboxChips` takes the name the field's label gives the input, so screen readers no longer announce an unnamed toolbar.
- 1086598: A composed Command group renders shown on the server while there's no query, instead of `hidden` until its items bind, so the list doesn't jump on hydration. This also covers Trigger Menu groups.
- 2930633: Dialog and Alert Dialog: while one Close part's action runs, the other Close parts get `aria-disabled` and `data-disabled`, since presses on them are refused until it settles.
- fb6945a: `formatShortcut("")` and `ariaKeyshortcuts("")` return an empty string instead of throwing, so `useShortcutHint` renders nothing for a shortcut with no keys.
- f5d0ab3: A popup's exit no longer waits on scroll-driven animations inside it, which kept it mounted for 100 seconds after closing in Firefox.
- 99d761e: The visible value of Progress and Meter is hidden from screen readers, as the docs say, so the value is read once through `aria-valuetext`. Chromium used to expose its text under the bar too.
- ddee2a4: Keyboard focus moving to another trigger of an open shared Hover Card or Tooltip moves the popup to it at once, as the pointer does, instead of closing it and opening again after the delay.
- 08b86f2: A popup whose `initialFocus` points at something that can't take focus, like a disabled button, focuses its content instead of leaving focus on the trigger behind it.
- 7053edd: `createMove`'s Alt and arrow nudges land on `step`'s grid, as drops do, so a `step` below 1 nudges by that step instead of rounding to whole units.
- bb8ae12: Arrow keys in a Navigation Menu's list skip a top-level item that's hidden, like one a responsive bar hides when it doesn't fit, instead of stopping on it.
- 349836b: Enter in a Command search with nothing highlighted no longer submits a form around the Command, like a popover's in-place content inside a page form. A Popover whose content holds a form and renders inside another form warns in development, as Dialog and Drawer do.
- 0f8f075: Two copies of core on one page, like an app and an embedded widget, no longer give two anchors the same name, so an open popup stays at its own trigger. Labels without an id get ids apart too.
- f1f87a3: Select's search field no longer writes the old query over text its own `onChange` flushed, so the highlight moves to the first match.
- 4c9967d: A `keydown` with no `key`, like the one Chrome's autofill sends, no longer throws in the shortcut listener on pages with a `ToastRegion` or any registered shortcut.
- 41ade18: A side popup that shrinks to fit beside an anchor at least its width settles in one place. Once it moves inside the anchor, it stays there while the anchor and the viewport don't change, instead of swapping sides every frame as its width changed.
- 911474e: The `ui-sdk` skill's agent checklist no longer says to put `data-agent-hidden` on a toast region, which hid every toast from agents. The region is already left out while it's empty.
- 1d3cd49: Enter and Space press a Button or Toggle rendered as an SVG element, which has no `click()`, instead of throwing.
- 69078df: A tab selected by a click or an arrow key scrolls fully into view inside a scrolling list. Browsers don't scroll a half-hidden element they focus, so a tab cut off at the list's edge used to stay cut off.
- ef6d8ce: A `ToastRegion` without `toaster` no longer throws "Expected a toaster from createToaster()" when a second copy of `@ui-sdk/core` runs in the page, such as after upgrading during `next dev`.
- e9cf7aa: Trigger Menu: a field whose value React controls through `onChange` keeps the typed trigger and opens the list. The menu now reads an edit once the input event has reached the window, after the owner's own listeners.
- 279e7e1: A Trigger Menu closes when its Empty part or its last row unmounts, so an Empty shown for one trigger no longer keeps an empty menu open, and swallows Enter, for the next one.

## 0.1.0-beta.13

### Patch Changes

- fc65a63: An agent takes no action on a component in an inert region, like the page behind a modal dialog, and leaves out one hidden with `visibility: hidden`. A File Input refuses text as a file, and a step named after an inherited method, like `constructor`, is refused cleanly.
- 553401b: Keep focus on the item the pointer reaches right after the press that opens a menu. The menu's own focus, a frame after the press, used to take it back.
- d17bb74: A carousel behind a modal dialog or drawer is now inert, like the rest of the page. Its slides and viewport stayed usable, because the slides are a live region and live regions stay live over a modal.
- 702c30f: `Preferences` accepts a preference from `createPreference` or `createColorScheme` under `exactOptionalPropertyTypes`, whose `storage` can be `undefined`.
- e741e64: Mounting a Field, Select, Combobox or Autocomplete inside a synchronous `act()`, like Testing Library's `render`, no longer logs "An update was not wrapped in act(...)". The store writes their parts make as they bind now land in the same commit.
- e7f240f: `stageChanges` finds a control by its ref on a page longer than an agent snapshot, where it used to skip the change. `parseNumber` and `isPartialNumber` refuse a group separator after the decimal one, like "1,234.98,7654". A Date Input or Time Input outside `min` or `max` matches a Field Error's `rangeUnderflow` or `rangeOverflow` in every framework, as it already did in web components.
- e0252d3: `createStickToBottom` keeps the rows in view still when rows above them go, also when the rows sit in a wrapper, like a Scroll Area's content. Before, only rows that were the scroller's own children stayed put.
- d757d5c: Text typed into a Combobox, Autocomplete, Command, Number Input, Date Picker or Color Picker before a Vue or Svelte page hydrates now stays, as it already did in React. Vue and Svelte write a field's value while they hydrate, so the text is read as the first component is made and goes in once hydration is done.

## 0.1.0-beta.12

### Patch Changes

- 1cae2d1: With `autoHighlight` and a controlled `query`, Combobox now highlights the first match of the query you typed, not the one before it.
- bc93b25: A Command whose `query` and `value` are both controlled now calls `onValueChange` in the same event as `onQueryChange` when the text changes from typing, Escape or `setQuery`, so an app renders the new text and the new highlight together. Before, the highlight was asked for a render later, which Solid's diagnostics reported as `EFFECT_WRITES_OWN_SOURCE` and `EFFECT_RELAY_TEAR`.
- 4217a40: A drawer now styles and lays out its content once as it opens, instead of twice, or three times on a phone. Opening a drawer with long content is faster. A top drawer in a right-to-left layout now opens at the top instead of the bottom.
- d2f3fa0: Importing Pagination no longer logs a development warning about its `link` part, or throws when strict mode is on.
- 337bfaf: `web.css` now styles Input Group and its clear button, Select's label, Number Input's scrub area, the item icons in lists, menus, tabs and toggles, `data-slot="visually-hidden"` text, and a wrapper that adds an icon beside Command's search field.
- 1e6aef9: In web components, an agent now names Tabs by their list's `aria-label`, as it does in React.

## 0.1.0-beta.11

### Patch Changes

- 56a7c93: When a name fits more than one component, the agent's error now also says how a page tells them apart: a word in one label the other lacks, like a verb or the row's name.
- b30d156: Let an agent call a component's own `run` action with the arguments it takes. Only Command's `run` names one of its commands, so only Command checks that the command is shown and reads its marks.

## 0.1.0-beta.10

### Patch Changes

- 0410825: Keep focus where it was when a Calendar or Date Picker day before `min` or after `max` is pressed. Those days no longer get a `tabindex`, so no browser can focus them, as the docs say.
- 8760bba: Report the last pointer event, not the Escape key, when Escape puts an Image Cropper's crop back after a pan, as every other drag does.
- ef33d41: Open a Date Picker on the selected date, else today, each time, as the docs say, instead of the day browsing stopped on last time. Each open turns the calendar back to the selected date's month, or with nothing selected to the month it started on, like `defaultMonth`, which `onMonthChange` hears with reason `"imperative"`. A roving focus group whose key is set back to `null` now forgets the item focused last.
- 211b82a: Return focus to the next control when a dialog's action removes the element that opened it, like a confirm dialog that deletes its row. A dialog opened without a trigger now remembers where the element focused before it sat, a return target removed as the close renders hands focus on, and `finalFocus` applies to a dialog unmounted while open.
- 81943ed: Give each `FieldDescription` an id of its own, so a control with two descriptions is described by both.
- 65406ef: A form reset returns a controlled Input with a `defaultValue` to that default, through `onValueChange` with reason `"reset"`, as Textarea and the other form controls already did. The reset used to read the element's own default, which React moves with a controlled input's value.
- fc97b27: Leave a `value` wrapper another layer added after a text control bound, like a testing library's, in place when the control unbinds, so it keeps hearing writes under React StrictMode.

## 0.1.0-beta.9

### Patch Changes

- fcb4382: Dialog and Popover content take `inline`, which renders the content (and a dialog's backdrop) where it is in the page instead of the top layer, so it can stay inside a frame. An inline popover is placed by your CSS.
- da25ba4: Combobox, Autocomplete and Listbox controllers take `highlight(value)` and `getHighlighted()`, so code can put the highlight on a particular item, like the row a cascading picker came back from. `onHighlight` fires for it, and the item scrolls into view. While focus is outside a Listbox, `highlight` gives the option the tab stop instead.
- 7a18902: An image cropper's handles go beside its selection, not inside it, so assistive technology reaches them: a slider's children are hidden from it. Each handle gets its place on the selection's edge or corner as an inline style. Move `ImageCropperHandle` out of `ImageCropperSelection` into the viewport, and drop any CSS that placed handles by `data-position`.
- c1a9a86: Page Up and Page Down move a Listbox's focus ten options and stop at its ends. A Listbox with `bindScrollPicker` still pages by what fits in view.
- bf17e93: Listbox takes `virtualFocus` to keep focus on the list itself. Arrow keys, Home, End and typing move a highlight, the list points at it with `aria-activedescendant`, and a press chooses an option without moving focus.
- 91bea17: An exit animation reads an empty duration as none, and async options read a loader that resolves to nothing as no items, instead of staying `loading`.
- 1a04e0d: Select takes `virtualFocus` to keep focus on the trigger while the list is open, as on a native select. Arrow keys, Home, End and typing move the highlight, the trigger points at it with `aria-activedescendant`, and Tab closes the list and moves on.
- 610e965: Token Input keeps text typed into a server-rendered editor before the page's script runs, and React no longer reports a hydration mismatch for it.

## 0.1.0-beta.8

### Patch Changes

- 6d7fcf1: An agent's `setValue` or `clear` that takes a `data-agent-confirm` item out of a value now needs a person, as adding that item does. Before, dropping a marked selection went through without asking. A step that touches several marks, like replacing one marked option with another, shows `allow` every mark's text, joined by semicolons, instead of only the first.
- 87f4ece: An agent can't choose a combobox's empty-query suggestion that the open list doesn't show, like one a query hides, since its marks can't be read. A marked option that mounts a moment after the list opens is waited for, so its confirm is still asked.
- 90a50f2: An agent can remove one file from a file input by its name or its item's value, like `removeFile("a.pdf")`. A name that matches no file fails the step and lists the files, and the file input lists its files to agents by name.
- f8a1e01: An agent's `run` on a Command takes one command, by its value or label. A list or an object is refused, so it can't reach a command other than the one whose marks were read.
- 2aabc99: A File Input inside `data-agent-secret` no longer shows its file names to an agent, in `snapshot`, `query` or a step's errors.
- 005c6eb: The agent snapshot leaves out a closed Tooltip whose trigger is a listed component, since its text is already that component's label. In web components, a dialog or menu trigger around a `<ui-button>` binds the button inside it, so a press by its label reaches it.
- dd4c683: An element that animates out keeps an `inert` its owner writes during the exit, and gets back one it had before, so a closed panel kept mounted with `inert` stays out of the Tab order.
- b7a82a2: Async options take `minLength`: text shorter than it, trimmed, loads nothing, cancels a load in flight and clears the items, so a server search waits for a few characters.
- 43ee542: An Autocomplete's `onValueChange` details carry `item`, the chosen suggestion's `value` and `label`, when a suggestion is chosen, so two suggestions with the same label can be told apart. The new `AutocompleteValueChangeDetails` type describes them.
- 3ecb591: `checkPattern` passes a native range input as a slider and native radios as a radio group: the testing kit's keys now move them the way a browser does, right to left too.
- a93c6e6: Combobox's `autoHighlight` takes `"selected"`: opening the list highlights the selected item, so the arrow keys move on from it, and highlights nothing when none is selected. While typing, it highlights the first match, like `true`.
- cf6c86f: Agents can run a Command's command with the `run` action, by its label or value, as Enter would. With no command it runs the highlighted one, whose marks it reads first. A disabled command is refused, and so is one the query or page hides, since its `data-agent-confirm` isn't in the page to read.
- 02938b8: A form reset leaves a controlled control with no default value alone, instead of returning it to the value it mounted with.
- 4c25b93: Enter submits a form with no submit button from a Date Input or Time Input segment, or from the form's one text field beside them, like it does next to a native date input.
- 1685a50: After a press on a modal popup's backdrop closes it, Space or Enter on the trigger opens it again the first time. The press's own click is still kept from the page.
- 22db74d: File Input's `validate` gets a second argument, `{ accepted }`, with the files of the same choice, drop or paste accepted before this one, so it can catch a duplicate within one batch.
- 1db765a: Tab and Shift+Tab from inside an iframe that is the last or first control of a modal Dialog, or another focus-trapping popup, now wrap around the popup. Before, focus left the page, or moved to the page behind a dialog that traps focus without making the page inert.
- e07158c: A Dialog, or another popup that keeps focus inside, now wraps Tab around a first or last control inside an open shadow root, and focuses such a control first when it comes first.
- e6604c8: `createGridFocus` finds a cell by the row and column its part last rendered with, not the ones it had when it bound. A keyed cell that a sort or a filter moves to another row, keeping its element, is now reached there by the arrow keys in every adapter. A drag selection from `createCellRange` finds the cell under the pointer the same way.
- 01de054: `onHighlight` runs with `null` when the highlighted item leaves the list, like when it's filtered out or the items are replaced, so it matches what the list shows.
- 28f70b2: A Popover or Hover Card the pointer opened closes when another one opens on hover, unless the new one is inside it, so hover popups no longer pile up when a trigger sits between another trigger and its popup.
- 433b696: `createInputHistory` takes `getEntryKey`, so entries made again from the same messages, and a new message arriving mid-recall, keep the entry brought back in place instead of starting over.
- 47c82a0: A popup that isn't measured yet no longer counts as fitting inside its anchor, so it keeps the browser's own anchor placement when its options change.
- 22e84b7: A Combobox, Autocomplete or Command list with no label part is named the way its input is (its `aria-label`, its own `aria-labelledby` or a `<label>`), not by the text typed in the input.
- 08027a8: PageDown and PageUp stop at the ends of a Combobox, Autocomplete or Command list instead of wrapping around.
- fafaeef: A Select or Combobox `maxLabels` text with the default "N more" joins its labels in English, so a page in another language no longer shows "Apple, Banana y 2 more".
- 5724068: A nested dialog or popup shown in the same commit as the one around it, like two nested dialogs mounted open or shown again by `<Activity>`, now opens above it and nests under it, so one Escape closes only the nested one.
- b67d81d: A Number Input reads back long unit and currency names in every plural form, like Russian "50 километров", and values some locales write as a word alone, like Arabic "يومان" for 2 days, which now show their minus sign when negative. It reads its text with the decimals it shows, and `formatNumberRange` writes both ends whole when both are negative.
- 616434e: A controlled OTP Input keeps the caret where a character was deleted or typed mid-code. Before, it jumped to the end once the owner passed the value back.
- 7e2ebe9: Pagination takes `disabled`: every page and step then does what a step at its end does (`aria-disabled`, `data-disabled`, no `href`, presses ignored), and the root gets `data-disabled`. A controller still changes the page.
- 2651c03: A Collapsible or Accordion panel that mounts open finishes its keyframes in the frame before the first paint, instead of reading its animations while the framework commits, which forced style for everything the commit changed.
- a434feb: `parseDate`, and so a Date Picker and Date Input, reads dates typed with a month name in more locales: in the long date's order (Swedish "16 oktober 2026"), with combining marks (Thai, Hindi), and with names that hold a space, an apostrophe, a number or a prefix (Irish, Catalan, Vietnamese, Hebrew), and a weekday's words (Danish "fredag den"). A locale whose numeric dates go year, day, month reads "2026-05-01" in its own order, and a date typed with the short date's separator reads in the short date's order.
- 839b44f: A popup with room on neither side of an anchor at least its own size, like a context menu opened with Shift+F10 on an area that fills the viewport, now opens on screen inside the anchor instead of past the viewport's edge.
- f29cbc4: Popover, Dialog, Drawer, Select and Date Picker handle Escape on their content, before it bubbles, so an ancestor's keydown listener sees `defaultPrevented` instead of acting on the same Escape. A field inside the popup can still handle Escape first and keep it open.
- 07fc806: A popup leaves the text unselected in a field whose own popup is open, like a combobox's input in its sheet, so typing there goes on where it was.
- af0d846: A popup that opens with focus on a text field that already holds a value selects its text, the way Tab does, so typing replaces it.
- 48f0310: Popups placed against an anchor now sit on the device's pixel grid, so text inside them renders the same each time, even when the anchor sits between pixels.
- 33c3c52: A primitive is assignable to `Primitive` under `exactOptionalPropertyTypes`: its `options` metadata may be `undefined`.
- 583c445: Escape during a resizable drag puts the panels back where they started, with no `onLayoutCommit`.
- 2e33e6f: Scroll Area takes its first measurement in its resize observer's first call, once the frame has laid it out, instead of in a microtask that forced style and layout of the new content, and registers its frame variables ahead of time instead of as the root binds.
- c8bb0c5: A modal popup no longer writes `--scrollbar-width` on `<html>` when the page has no scrollbar gutter, as with overlay scrollbars or a page that doesn't scroll. Closing one no longer restyles the whole page a second time for a value that was `0px`. Read it as `var(--scrollbar-width, 0px)`.
- 13a1ae4: Segmented Control's indicator gets `data-activation-direction`, like Tabs' indicator: `"none"` on its first placement, so a transition can skip it, then which way the checked item moved.
- 0295516: A closed React or Vue Select shows its selected item's current label when that label changes, instead of the one it first learned.
- 7e5834f: The hidden field a Select, Combobox or Listbox renders for its form is now a `<textarea>`, so Enter in the form's one text field submits a form without a submit button, like it does next to a native `<select>`.
- a1acd16: Select, Combobox and Listbox with `multiple` infer an inline list of objects as a list of that object, not of the object or a list. A single select whose one value is an inline list now needs its type, like `Select<Item[]>`.
- 1d21bee: `createSelection` returns `setAnchor(key)`, which starts the next Shift range at `key` without changing the selection, for lists where arrow keys move focus without selecting. `null` clears the anchor.
- f9c6473: Shortcuts take `repeat: true` to keep running while the keys are held, like `j` moving down a list. Without it, a shortcut still runs once per press.
- 901e49d: Uncontrolled Tabs keep their `defaultValue` selected while that tab's server markup waits for its boundary to hydrate, instead of selecting the first tab beside it, so streaming no longer shows two selected tabs or a hydration warning.
- b013fba: `@ui-sdk/core/testing` exports `settle`, which waits for what a component schedules after a render or an event, like a tooltip's name or focus moving into a menu. Framework tests can now wait the way `mount`'s `view.settle()` does.
- a979579: A Select or Combobox value with `maxLabels` and `getMoreLabel` joins its labels in English until the trigger or input binds, then in the page's language, so the server's markup matches the first client render.
- fce61f5: In `web.css`, a File Input drop zone's trigger has the same space above it in Web Components as in the other frameworks.
- 7259be5: `web.css` control edges and focused edges reach 3:1 against the page in light and dark: `--ui-input` and `--ui-ring-border` are darker in light and lighter in dark.

## 0.1.0-beta.7

### Patch Changes

- b6db62a: An agent's choice in a closed Select or Combobox now reads the option it chooses even when the option renders only while the list is open: the list opens for a moment, so a `data-agent-confirm` mark on that option asks a person first. With `items` or `emptyItems` data, the option was chosen without asking.
- c52e8ad: The Calendar and Date Picker year select labels a year below 100 as that year, not as 19xx.
- dec3e40: A click on a native label for a Combobox input, like a Field label, focuses the input and leaves the list closed, as a Select's label does. It opened the list.
- 54b7c8d: A Control-click on macOS opens a context menu at the pointer, like a right-click. It used to open as if from the keyboard, anchored to the whole area with its first item focused.
- 938e5e2: A Drawer on a touch screen puts a scroll area's own inline `overflow-y` back at its largest snap point and when it closes. It used to remove it, so a list scrolled by an inline style couldn't scroll.
- e154ead: In server-rendered HTML, the control of a Field marked `invalid` now names its first shown error in `aria-describedby`, including a `FieldError` with `match`. Every error shown at once keeps an id of its own.
- 3fbd191: With a `NavigationMenuViewport`, Tab from the last item past an open panel leaves the navigation, and the panel closes. It used to go back into the panel, so Tab could never leave.
- 5a356dc: Number Input's default small step (a tenth of `step`) no longer carries floating point noise, so Alt+ArrowUp with `step: 0.7` from 1 gives 1.05, not 1.0499999999999998.
- 76f3585: A touch drag that starts in a Resizable handle's touch hit area but beside the handle resizes and no longer scrolls the page. It used to scroll and stop after a few pixels.
- a14961e: Server-rendered HTML now names and links the parts that render after the one pointing at them: an open Collapsible's trigger has `aria-controls`, a Progress or Meter with a label has `aria-labelledby`, and a Timeline item is named by its title. Once the component binds, a part that isn't in the page is dropped again.
- 25ac95a: Tabs select the `defaultValue` tab when it binds after the others, like a tab inside Suspense or `React.lazy`. The first tab stands in until it does, unless someone picks another tab first.
- 250c9bb: A Tree builds its collection once for each new `items` or `paths` array. While a new array rendered, it rebuilt the collection several times, which slowed a reorder in a large tree.
- 217fc40: Text committed through an input method after a trigger character, like Japanese after `@`, filters a Trigger Menu. It used to leave the list unfiltered, so Enter inserted the highlighted item.
- a36290a: In React, Combobox, Autocomplete, Command, Number Input, Date Picker and Color Picker inputs keep text typed before hydration, and take it as typing when they hydrate. A field that already lost focus settles the text as a blur would.

## 0.1.0-beta.6

### Patch Changes

- 7cfedda: An agent's `setValue` is now refused on a Combobox or Select that renders its own items and shows none once open, as it already was for one whose `items` data is empty. A Combobox with `allowCustomValue` still takes the text.
- 2087c1e: The agent's `snapshot()` leaves out a toast region that holds no toasts. It lists the region once a toast is in it.
- 6531579: An Input inside an InputGroup is one component in the agent snapshot. The group was listed as a second input with only `clear`, so a step that named the field by its label was refused as ambiguous.
- 6776fc2: The agent names a component by a part of its own before its one item, as it already did with more than one. Tabs with a single tab took that tab's text as their label, where they're named by their list.
- b003f2a: The agent lists `press` for a Button rendered as a link.
- 85ff859: An agent's `press` by label works on a Button that opens a tooltip, a menu or a dialog. The press is on the Button, and a press with the text of a button inside the one popup it opens is on that popup.
- 0e80ddb: The agent now lists a toast's action and close as buttons, and presses them by their text.
- 83c1863: `checkPattern(el, "listbox")` passes the open list of a select: a list a combobox opens is reached from the combobox, so it needs no tab stop of its own, and the check no longer chooses an option there.
- 203f75c: `checkPattern` now leaves out elements hidden from screen readers, like the hidden native inputs a Radio Group or a Checkbox Group renders for forms, so those groups pass their patterns.
- 0406bb1: `checkPattern` passes read-only controls: a switch or checkbox with `aria-readonly="true"` is checked to keep its state on Space, and a read-only slider or radio group is no longer asked to change.
- a63834d: `checkPattern(el, "dialog")` passes a dialog that only traps focus, like a popover with `modal="trap-focus"`: it asks for `aria-modal="true"` when the page behind the dialog is inert, and no longer when Tab stays inside while the page stays usable.
- 4a4cfb0: Typing inside the label a Combobox shows for its value keeps the caret where it is. The first edit after a choice moved it to the end.

  A text field whose value core writes, like the Combobox input and the Password Input, is written only when its value changes. So an edit the owner of a controlled value ignores, without changing the value, stays in the field instead of being replaced by the same value.

- 9525c67: A combobox with `multiple` and `allowCustomValue` now adds the typed text on Enter while its list is kept closed.
- 7709e0c: A Date Picker with a controlled `value` now turns its calendar to a date set with `controller.setValue()`, as an uncontrolled one does.
- dfc8eae: A Drawer or Dialog opened through a controlled `open` on a phone no longer gets a `--keyboard-inset` with no keyboard open. A read taken before it rendered that shows a covered strip is measured again.
- 9fa96f9: An enter transition on something inside a part, like the path of a Checkbox indicator's icon, now starts from its `data-starting-style` pose. It used to run backwards first.
- 1a703c3: `formatFileSize` now writes sizes under 1 kB with the unit in full, like "70 bytes", where it read "70 byte".
- f64c466: `createInputHistory` leaves ArrowUp and ArrowDown to a Trigger Menu open on a textarea. It only looked for `aria-expanded`, which a textarea can't carry, so the keys brought back an earlier message while the menu was open.
- e844918: Date Input and Time Input take digits committed through an input method, and Number Input, Date Input, Time Input and Date Picker read full-width digits.
- fc6ced5: `keepFocus` moves focus to its element when focus sits on an element that was disabled or made inert, which Chrome leaves focused for a frame, or on an ancestor of the element, where Safari puts a clicked button's focus.
- c0373e4: TokenInput writes a value with a long run of backslashes without stalling the page, and `toLocale` reads a long tag in linear time.
- 2a961bc: A menu trigger rendered as something other than a button, like a badge, is now a button people can tab to.
- c705ecf: A number input with `wheel` leaves its value alone when the page canceled the wheel event, as it does for a canceled key or press.
- 0e71042: A NumberInput with a controlled `value` now commits the value that Enter or blur clamped or snapped it to. `onValueCommit` got the value from before, or didn't run.
- 33ce1e0: A NumberInput step now keeps its value when `onValueChange` moves focus out of the field. The blur asked for the old value again, which dropped the step.
- 7695b23: A Password Input removed from the page or hidden while its field has focus no longer throws from the blur that follows.
- e1ccd55: A popup whose exit has nothing to animate, like one under reduced motion, no longer keeps its closed content in memory until it opens again.
- 81488c4: A popup that mounted open, like a dialog a menu item opens, returns focus to what had it when it closes. One removed from the page while open, like a dialog rendered only while it's open, returns focus to what opened it, where focus used to fall to the page.
- 79d482c: A popup opened from a contenteditable, like a link popover in an editor, returns focus with the caret where it was. Focus alone put it back at the start.
- aa4b725: A form reset returns a disabled Select, Combobox or Listbox to its default value, like a native control.
- 6efa592: A `bindScrollPicker` wheel whose value is set from outside, like a controlled Listbox or an agent's `setValue`, moves focus from the old option to the new one when focus was on the wheel. A Drawer settling around the wheel no longer scrolls it back to the old option.
- 1885f8c: `bindScrollPicker` now centers and picks the right option when a transform scales the list, like a popup that scales in as it opens, and when it was bound while the list was hidden.
- 6f4f9cf: Select's open list takes its trigger's name when the trigger is named by `aria-label`, a label element or a Field, where it was named after the selected value.
- 605d49f: `createSelection` keeps its Shift anchor when a controlled value comes back with the same keys in another order.
- 740fe4c: A select that opens as a sheet keeps its content hidden until the sheet has loaded, so it no longer shows in the page for a moment on a slow connection.
- 11edd0a: A sheet no longer throws as it settles in a browser without `linear()` easing, like Safari before 17.2. It plays the same spring as a keyframe per frame there.
- a108b05: A drag on a Slider, a ColorPicker area or another part with its own drag inside a Drawer or a sheet no longer moves the sheet.
- 243bdbf: A sheet whose content resizes while it is still opening keeps moving to its new size. In Chrome and Safari, a resize during the opening frames threw a `TypeError` from the sheet's effects.
- f6bb2a7: A popup opened by a key pressed away from its trigger returns focus to where it was opened from when it closes, not to the trigger. A Dialog trigger's `shortcut` pressed in a field returns focus to the field, and a Date Picker opened with Alt+ArrowDown in its input returns focus to the input.
- ab22cc4: Slider's `onValueChange` and `onValueCommit` type their value as the slider's own value type, `number` or `number[]`, where it was `number | (number[] & number)`.
- 57e3d0b: `createStickToBottom` keeps the rows in view still while not following when rows above them are removed, added or resized, like a log that drops its oldest lines. Content that arrives below while rows go above now counts as unseen.
- ee3d64a: Tabs' indicator animates its first move after mount when styles skip its transitions while `data-activation-direction="none"`.
- 7d93609: A toast with no layout, like one in a region under a hidden ancestor, has no height to measure. `--toast-height`, `--toast-offset`, `--toast-front-height` and `--toast-stack-height` now stay unset for it rather than reading `NaNpx`, and they're set once the toast is laid out.
- 94d414e: `web.css` keeps the Date Picker's trigger and clear button inside the end of the input. They sat on a row of their own below it.
- c8999f6: `web.css` no longer draws the default focus ring on parts that turn it off. A focused Tree branch outlined everything inside it, and the Command input showed a ring around its field.
- 9f2eb57: A window blur that closes a popup no longer logs a development warning in Chrome, or throws in strict mode. Chrome sends it as a plain `Event`.

## 0.1.0-beta.5

### Patch Changes

- 75c3588: An agent's `setValue` on a Combobox now refuses a value that isn't one of its items, as a Select does, unless the Combobox has `allowCustomValue`.
- 452f851: An agent can no longer change a read-only `Input` or `Textarea`. Its snapshot shows `disabled: true` with no actions, and `required: true` for a required one.
- 2b4ed26: An agent's `setValue` now refuses numeric text with grouped digits, like `"1,499.5"`, which used to set `1`. One value or label for a component that holds a list, like a multiple Select or a Checkbox Group, now sets a list of one.
- 8228013: A Calendar or Date Picker's `setValue` given text that isn't a date, or a range with one end, now returns `false` and keeps the value. It no longer clears the selection.
- 7bb89c2: A drag with a `threshold`, like `createReorder`'s and `createTransfer`'s, now captures the pointer once the pointer passes it. A press that lifts first clicks what was pressed, like a handle or a button inside the item, and no longer the item. Focus on an element inside a moved item, like its drag handle, now follows the item when a framework renders it as a new element in another list.

## 0.1.0-beta.4

### Patch Changes

- 4e529d2: An agent's `press` takes a button's own text, like `press "Save"` on a Save button.

## 0.1.0-beta.3

### Patch Changes

- a6dc4e0: A step marked `data-agent-confirm` that `registerTools`' `allow` refuses now fails with `The app refused …`. It no longer reports that the person said no.
- 220c1a0: A Select, Combobox or Listbox no longer throws when the browser restores a value that isn't the list of keys it saved, like a number. It selects nothing.
- adc59ce: `registerTools` marks `act` with `consequentialHint` and ends a step that is waiting on `allow` when the browser cancels its call. The bridge no longer keeps a hidden input's value after the input leaves the page.

## 0.1.0-beta.2

### Patch Changes

- d699609: A modal opened while another modal is open, like `confirm()` from a button inside a dialog, is no longer made inert by the one underneath, wherever its markup sits, wherever focus was and however soon after the other one it opened.
- c53df2f: When two cookies share a name, the preferences script now reads the same one as the server and the client, the first, so the value no longer changes after hydration.

## 0.1.0-beta.1

### Minor Changes

- Initial release
