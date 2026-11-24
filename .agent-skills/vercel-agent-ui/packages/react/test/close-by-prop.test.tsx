// @vitest-environment jsdom
// A popup its parent closes through `open` leaves the page and reports the
// close complete, like one closed from inside.
import * as React from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, expect, test } from "vitest"
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

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
// jsdom has no Web Animations API, which closing a popup asks for, and no top layer.
Element.prototype.getAnimations ??= () => []
HTMLElement.prototype.showPopover ??= function () {}
HTMLElement.prototype.hidePopover ??= function () {}

let root: Root | undefined

afterEach(async () => {
  await React.act(async () => root?.unmount())
  root = undefined
  document.body.replaceChildren()
})

type Props = { open: boolean; onOpenChangeComplete: (open: boolean) => void }

const popups: Record<string, (props: Props) => React.ReactNode> = {
  autocomplete: (props) => (
    <Autocomplete {...props}>
      <AutocompleteInput aria-label="Fruit" />
      <AutocompleteContent>
        <AutocompleteItem value="apple">Apple</AutocompleteItem>
      </AutocompleteContent>
    </Autocomplete>
  ),
  combobox: (props) => (
    <Combobox {...props}>
      <ComboboxInput aria-label="Fruit" />
      <ComboboxContent>
        <ComboboxItem value="apple">Apple</ComboboxItem>
      </ComboboxContent>
    </Combobox>
  ),
  menu: (props) => (
    <Menu {...props}>
      <MenuTrigger>Actions</MenuTrigger>
      <MenuContent>
        <MenuItem value="copy">Copy</MenuItem>
      </MenuContent>
    </Menu>
  ),
  popover: (props) => (
    <Popover {...props}>
      <PopoverTrigger>Details</PopoverTrigger>
      <PopoverContent aria-label="Details">Text</PopoverContent>
    </Popover>
  ),
  select: (props) => (
    <Select {...props}>
      <SelectTrigger>Fruit</SelectTrigger>
      <SelectContent>
        <SelectItem value="apple">Apple</SelectItem>
      </SelectContent>
    </Select>
  ),
}

// A select keeps its list in the page hidden once it closes, so typing on the trigger finds its items.
const shownContent = () =>
  document.querySelectorAll('[data-slot$="-content"]:not([hidden])').length
// Renders until `done` holds, like an open that completes a frame and a task after it shows.
async function until(done: () => boolean) {
  for (let i = 0; i < 50 && !done(); i++) {
    await React.act(() => new Promise((resolve) => setTimeout(resolve, 10)))
  }
}

test.each(Object.keys(popups))(
  "%s closed by its parent leaves the page and reports it",
  async (kind) => {
    const completed: boolean[] = []
    const onOpenChangeComplete = (open: boolean) => completed.push(open)
    const render = (open: boolean) =>
      root!.render(popups[kind]({ open, onOpenChangeComplete }))
    root = createRoot(document.body.appendChild(document.createElement("div")))
    await React.act(async () => render(false))
    await React.act(async () => render(true))
    await until(() => completed.length === 1)
    const opened = shownContent()
    await React.act(async () => render(false))
    await until(() => completed.length === 2)
    expect({ opened, closed: shownContent(), completed }).toEqual({
      opened: 1,
      closed: 0,
      completed: [true, false],
    })
  }
)
