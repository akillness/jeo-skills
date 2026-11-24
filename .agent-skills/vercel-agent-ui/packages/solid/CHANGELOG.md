# @ui-sdk/solid

## 0.1.0-beta.16

### Patch Changes

- Updated @ui-sdk/core to 0.1.0-beta.16

## 0.1.0-beta.15

### Patch Changes

- Updated @ui-sdk/core to 0.1.0-beta.15

## 0.1.0-beta.14

### Patch Changes

- Updated @ui-sdk/core to 0.1.0-beta.14

## 0.1.0-beta.13

### Patch Changes

- Updated @ui-sdk/core to 0.1.0-beta.13

## 0.1.0-beta.12

### Patch Changes

- ab55044: A Solid root whose controlled option is still loading, like `<Switch checked={checked()}>` over an async memo, now waits under your `<Loading>` and renders once the value arrives. Before, the component that rendered the root was made again each time, so its source never finished loading.
- Updated @ui-sdk/core to 0.1.0-beta.12

## 0.1.0-beta.11

### Patch Changes

- 8b452a3: `@ui-sdk/solid` now needs the stable Solid 2: `solid-js` and `@solidjs/web` 2.0.0 or newer. If your app is on a Solid 2 release candidate, move both to `^2.0.0`.
- Updated @ui-sdk/core to 0.1.0-beta.11

## 0.1.0-beta.10

### Patch Changes

- 81943ed: Give each `FieldDescription` an id of its own, so a control with two descriptions is described by both.
- Updated @ui-sdk/core to 0.1.0-beta.10

## 0.1.0-beta.9

### Patch Changes

- fcb4382: Dialog and Popover content take `inline`, which renders the content (and a dialog's backdrop) where it is in the page instead of the top layer, so it can stay inside a frame. An inline popover is placed by your CSS.
- da25ba4: Combobox, Autocomplete and Listbox controllers take `highlight(value)` and `getHighlighted()`, so code can put the highlight on a particular item, like the row a cascading picker came back from. `onHighlight` fires for it, and the item scrolls into view. While focus is outside a Listbox, `highlight` gives the option the tab stop instead.
- bf17e93: Listbox takes `virtualFocus` to keep focus on the list itself. Arrow keys, Home, End and typing move a highlight, the list points at it with `aria-activedescendant`, and a press chooses an option without moving focus.
- 1a04e0d: Select takes `virtualFocus` to keep focus on the trigger while the list is open, as on a native select. Arrow keys, Home, End and typing move the highlight, the trigger points at it with `aria-activedescendant`, and Tab closes the list and moves on.
- Updated @ui-sdk/core to 0.1.0-beta.9

## 0.1.0-beta.8

### Patch Changes

- 43ee542: An Autocomplete's `onValueChange` details carry `item`, the chosen suggestion's `value` and `label`, when a suggestion is chosen, so two suggestions with the same label can be told apart. The new `AutocompleteValueChangeDetails` type describes them.
- 7e2ebe9: Pagination takes `disabled`: every page and step then does what a step at its end does (`aria-disabled`, `data-disabled`, no `href`, presses ignored), and the root gets `data-disabled`. A controller still changes the page.
- 13a1ae4: Segmented Control's indicator gets `data-activation-direction`, like Tabs' indicator: `"none"` on its first placement, so a transition can skip it, then which way the checked item moved.
- 7e5834f: The hidden field a Select, Combobox or Listbox renders for its form is now a `<textarea>`, so Enter in the form's one text field submits a form without a submit button, like it does next to a native `<select>`.
- 649df7f: A Solid `Input` or `Textarea` whose `value` the parent doesn't update now keeps showing that value as you type, like in React. Before, the typed text stayed and the form submitted it.
- Updated @ui-sdk/core to 0.1.0-beta.8

## 0.1.0-beta.7

### Patch Changes

- e154ead: In server-rendered HTML, the control of a Field marked `invalid` now names its first shown error in `aria-describedby`, including a `FieldError` with `match`. Every error shown at once keeps an id of its own.
- 7f35e97: A part's event handler that runs while another component renders, like a focus change that component makes, no longer logs Solid's `STRICT_READ_UNTRACKED` warning for each reactive prop it reads.
- f3fe140: Items that keep their component but change value in place, like `<For keyed={false}>` reversed, stay reachable with the arrow keys in Select, Tabs and other lists.
- Updated @ui-sdk/core to 0.1.0-beta.7

## 0.1.0-beta.6

### Patch Changes

- 6a42eae: In Solid, a `FileInputItem` given spread props no longer logs a `STRICT_READ_UNTRACKED` warning in development for each file, and a `FileInputItemRemove` inside an item follows that item's `file` when it changes.
- 5400266: In Solid, `CommandItem`, `SelectSelectAll` and `ComboboxSelectAll` follow their group's props: a group given spread props no longer logs a `STRICT_READ_UNTRACKED` warning in development, and an item keeps up with a group whose `id` changes.
- 5132798: Select, Combobox, Autocomplete, Menu, Command and the trigger menu write no signal while the server renders them, and an open Select, Combobox or Autocomplete with `items` and its own content renders one list on the server, the one hydration keeps.
- 12431a4: In Solid, a `TreeItemLabel`, `TreeItemIndicator` and `TreeItemCheckbox` now follow their item. One whose item has a `TreeGroup` carries `data-branch` and `data-expanded`, so an indicator styled with them shows and turns, and a change to the item's `disabled` or `branch` reaches them.
- Updated dependencies [7cfedda]
- Updated dependencies [2087c1e]
- Updated dependencies [6531579]
- Updated dependencies [6776fc2]
- Updated dependencies [b003f2a]
- Updated dependencies [85ff859]
- Updated dependencies [0e80ddb]
- Updated dependencies [83c1863]
- Updated dependencies [203f75c]
- Updated dependencies [0406bb1]
- Updated dependencies [a63834d]
- Updated dependencies [4a4cfb0]
- Updated dependencies [9525c67]
- Updated dependencies [7709e0c]
- Updated dependencies [dfc8eae]
- Updated dependencies [9fa96f9]
- Updated dependencies [1a703c3]
- Updated dependencies [f64c466]
- Updated dependencies [e844918]
- Updated dependencies [fc6ced5]
- Updated dependencies [c0373e4]
- Updated dependencies [2a961bc]
- Updated dependencies [c705ecf]
- Updated dependencies [0e71042]
- Updated dependencies [33ce1e0]
- Updated dependencies [7695b23]
- Updated dependencies [e1ccd55]
- Updated dependencies [81488c4]
- Updated dependencies [79d482c]
- Updated dependencies [aa4b725]
- Updated dependencies [6efa592]
- Updated dependencies [1885f8c]
- Updated dependencies [6f4f9cf]
- Updated dependencies [605d49f]
- Updated dependencies [740fe4c]
- Updated dependencies [11edd0a]
- Updated dependencies [a108b05]
- Updated dependencies [243bdbf]
- Updated dependencies [f6bb2a7]
- Updated dependencies [ab22cc4]
- Updated dependencies [57e3d0b]
- Updated dependencies [ee3d64a]
- Updated dependencies [7d93609]
- Updated dependencies [94d414e]
- Updated dependencies [c8999f6]
- Updated dependencies [9f2eb57]
  - @ui-sdk/core@0.1.0-beta.6

## 0.1.0-beta.5

### Patch Changes

- Updated dependencies [75c3588]
- Updated dependencies [452f851]
- Updated dependencies [2b4ed26]
- Updated dependencies [8228013]
- Updated dependencies [7bb89c2]
  - @ui-sdk/core@0.1.0-beta.5

## 0.1.0-beta.4

### Patch Changes

- Updated dependencies [4e529d2]
  - @ui-sdk/core@0.1.0-beta.4

## 0.1.0-beta.3

### Patch Changes

- Updated dependencies [a6dc4e0]
- Updated dependencies [220c1a0]
- Updated dependencies [adc59ce]
  - @ui-sdk/core@0.1.0-beta.3

## 0.1.0-beta.2

### Patch Changes

- 3aa0973: A `SelectTrigger` connected through `controller` outside its `Select`, inside a `Field`, takes the field's control id and label in the server HTML, so the `FieldLabel` points at it before the page hydrates.
- Updated dependencies [d699609]
- Updated dependencies [c53df2f]
  - @ui-sdk/core@0.1.0-beta.2

## 0.1.0-beta.1

### Minor Changes

- Initial release
