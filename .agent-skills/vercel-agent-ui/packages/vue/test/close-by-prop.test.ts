// @vitest-environment jsdom
// A popup its parent closes through `open` leaves the page and reports the
// close complete, like one closed from inside.
import { afterEach, expect, test } from "vitest"
import { createApp, h, nextTick, ref, type App, type VNode } from "vue"
import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteInput,
  AutocompleteItem,
} from "../src/autocomplete"
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
} from "../src/combobox"
import { Menu, MenuContent, MenuItem, MenuTrigger } from "../src/menu"
import { Popover, PopoverContent, PopoverTrigger } from "../src/popover"
import { Select, SelectContent, SelectItem, SelectTrigger } from "../src/select"

// jsdom has no Web Animations API, which closing a popup asks for, and no top layer.
Element.prototype.getAnimations ??= () => []
HTMLElement.prototype.showPopover ??= function () {}
HTMLElement.prototype.hidePopover ??= function () {}

let app: App | undefined

afterEach(() => {
  app?.unmount()
  app = undefined
  document.body.replaceChildren()
})

type Props = { open: boolean; onOpenChangeComplete: (open: boolean) => void }

const popups: Record<string, (props: Props) => VNode> = {
  autocomplete: (props) =>
    h(Autocomplete, props, () => [
      h(AutocompleteInput, { "aria-label": "Fruit" }),
      h(AutocompleteContent, null, () =>
        h(AutocompleteItem, { value: "apple" }, () => "Apple")
      ),
    ]),
  combobox: (props) =>
    h(Combobox, props, () => [
      h(ComboboxInput, { "aria-label": "Fruit" }),
      h(ComboboxContent, null, () =>
        h(ComboboxItem, { value: "apple" }, () => "Apple")
      ),
    ]),
  menu: (props) =>
    h(Menu, props, () => [
      h(MenuTrigger, null, () => "Actions"),
      h(MenuContent, null, () => h(MenuItem, { value: "copy" }, () => "Copy")),
    ]),
  popover: (props) =>
    h(Popover, props, () => [
      h(PopoverTrigger, null, () => "Details"),
      h(PopoverContent, { "aria-label": "Details" }, () => "Text"),
    ]),
  select: (props) =>
    h(Select, props, () => [
      h(SelectTrigger, null, () => "Fruit"),
      h(SelectContent, null, () =>
        h(SelectItem, { value: "apple" }, () => "Apple")
      ),
    ]),
}

// A select keeps its list in the page hidden once it closes, so typing on the trigger finds its items.
const shownContent = () =>
  document.querySelectorAll('[data-slot$="-content"]:not([hidden])').length
// Renders until `done` holds, like an open that completes a frame and a task after it shows.
async function until(done: () => boolean) {
  for (let i = 0; i < 50 && !done(); i++) {
    await new Promise((resolve) => setTimeout(resolve, 10))
    await nextTick()
  }
}

test.each(Object.keys(popups))(
  "%s closed by its parent leaves the page and reports it",
  async (kind) => {
    const completed: boolean[] = []
    const onOpenChangeComplete = (next: boolean) => completed.push(next)
    const open = ref(false)
    app = createApp({
      render: () => popups[kind]({ open: open.value, onOpenChangeComplete }),
    })
    app.mount(document.body.appendChild(document.createElement("div")))
    await nextTick()
    open.value = true
    await until(() => completed.length === 1)
    const opened = shownContent()
    open.value = false
    await until(() => completed.length === 2)
    expect({ opened, closed: shownContent(), completed }).toEqual({
      opened: 1,
      closed: 0,
      completed: [true, false],
    })
  }
)
