// A root with `items` renders its list itself unless its own content is among
// the children. The server finds that out without writing a signal, and
// renders one list, the one hydration expects.
import { renderToString } from "@solidjs/web"
import type { JSX } from "@solidjs/web"
import { afterEach, expect, test, vi } from "vitest"
import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteInput,
} from "../src/autocomplete"
import { Combobox, ComboboxContent, ComboboxInput } from "../src/combobox"
import { Command, CommandInput, CommandList } from "../src/command"
import { Menu, MenuContent, MenuItem, MenuTrigger } from "../src/menu"
import {
  Select,
  SelectContent,
  SelectTrigger,
  SelectValue,
} from "../src/select"

const items = ["Apple", "Banana"]

const open: [name: string, slot: string, render: () => JSX.Element][] = [
  [
    "select",
    "select-content",
    () => (
      <Select items={items} defaultOpen>
        <SelectTrigger aria-label="Fruit">
          <SelectValue />
        </SelectTrigger>
        <SelectContent />
      </Select>
    ),
  ],
  [
    "combobox",
    "combobox-content",
    () => (
      <Combobox items={items} defaultOpen>
        <ComboboxInput aria-label="Fruit" />
        <ComboboxContent />
      </Combobox>
    ),
  ],
  [
    "autocomplete",
    "autocomplete-content",
    () => (
      <Autocomplete items={items} defaultOpen>
        <AutocompleteInput aria-label="Fruit" />
        <AutocompleteContent />
      </Autocomplete>
    ),
  ],
  [
    "menu",
    "menu-content",
    () => (
      <Menu items={[{ label: "Edit" }]} defaultOpen>
        <MenuTrigger>Actions</MenuTrigger>
        <MenuContent>
          <MenuItem>Edit</MenuItem>
        </MenuContent>
      </Menu>
    ),
  ],
  [
    "command",
    "command-list",
    () => (
      <Command items={items}>
        <CommandInput aria-label="Fruit" />
        <CommandList />
      </Command>
    ),
  ],
]

afterEach(() => vi.restoreAllMocks())

test.each(open)(
  "an open %s with items and its own content renders one list on the server, and writes no signal",
  (_name, slot, render) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const html = renderToString(render)
    expect(html.split(`data-slot="${slot}"`)).toHaveLength(2)
    expect(warn).not.toHaveBeenCalled()
  }
)
