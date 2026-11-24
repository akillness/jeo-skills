// A popup its parent closes through `open` leaves the page and reports the
// close complete, like one closed from inside.
import { render } from "@solidjs/web"
import { createSignal, flush, type JSX } from "solid-js"
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

// jsdom has no top layer.
HTMLElement.prototype.showPopover ??= function () {}
HTMLElement.prototype.hidePopover ??= function () {}

let dispose = () => {}
afterEach(() => {
  dispose()
  document.body.replaceChildren()
})

type Props = {
  open: () => boolean
  onOpenChangeComplete: (open: boolean) => void
}

const popups: Record<string, (props: Props) => JSX.Element> = {
  autocomplete: (props) => (
    <Autocomplete
      open={props.open()}
      onOpenChangeComplete={props.onOpenChangeComplete}
    >
      <AutocompleteInput aria-label="Fruit" />
      <AutocompleteContent>
        <AutocompleteItem value="apple">Apple</AutocompleteItem>
      </AutocompleteContent>
    </Autocomplete>
  ),
  combobox: (props) => (
    <Combobox
      open={props.open()}
      onOpenChangeComplete={props.onOpenChangeComplete}
    >
      <ComboboxInput aria-label="Fruit" />
      <ComboboxContent>
        <ComboboxItem value="apple">Apple</ComboboxItem>
      </ComboboxContent>
    </Combobox>
  ),
  menu: (props) => (
    <Menu open={props.open()} onOpenChangeComplete={props.onOpenChangeComplete}>
      <MenuTrigger>Actions</MenuTrigger>
      <MenuContent>
        <MenuItem value="copy">Copy</MenuItem>
      </MenuContent>
    </Menu>
  ),
  popover: (props) => (
    <Popover
      open={props.open()}
      onOpenChangeComplete={props.onOpenChangeComplete}
    >
      <PopoverTrigger>Details</PopoverTrigger>
      <PopoverContent aria-label="Details">Text</PopoverContent>
    </Popover>
  ),
  select: (props) => (
    <Select
      open={props.open()}
      onOpenChangeComplete={props.onOpenChangeComplete}
    >
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
    await new Promise((resolve) => setTimeout(resolve, 10))
    flush()
  }
}

test.each(Object.keys(popups))(
  "%s closed by its parent leaves the page and reports it",
  async (kind) => {
    const completed: boolean[] = []
    const onOpenChangeComplete = (open: boolean) => completed.push(open)
    const [open, setOpen] = createSignal(false)
    const Popup = popups[kind]
    dispose = render(
      () => <Popup open={open} onOpenChangeComplete={onOpenChangeComplete} />,
      document.body.appendChild(document.createElement("div"))
    )
    flush()
    setOpen(true)
    await until(() => completed.length === 1)
    const opened = shownContent()
    setOpen(false)
    await until(() => completed.length === 2)
    expect({ opened, closed: shownContent(), completed }).toEqual({
      opened: 1,
      closed: 0,
      completed: [true, false],
    })
  }
)
