// @vitest-environment node
import * as React from "react"
import { renderToString } from "react-dom/server"
import { describe, expect, test } from "vitest"
import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
} from "../src/autocomplete"
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "../src/combobox"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "../src/dialog"
import { Menu, MenuContent, MenuItem, MenuTrigger } from "../src/menu"
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "../src/popover"
import { Select, SelectContent, SelectItem, SelectTrigger } from "../src/select"

// Runs with no DOM. `presentation="auto"` is decided at open on the client, so
// the server renders an open popup as its default presentation, the same
// markup as without the option, and the client's first render matches it.
type Setting = { presentation?: "auto" | "sheet" }

const popups: Record<string, (setting: Setting) => React.ReactElement> = {
  popover: (setting) => (
    <Popover defaultOpen {...setting}>
      <PopoverTrigger>Profile</PopoverTrigger>
      <PopoverContent>
        <PopoverTitle>Edit profile</PopoverTitle>
      </PopoverContent>
    </Popover>
  ),
  dialog: (setting) => (
    <Dialog defaultOpen {...setting}>
      <DialogTrigger>Edit</DialogTrigger>
      <DialogContent>
        <DialogTitle>Edit profile</DialogTitle>
      </DialogContent>
    </Dialog>
  ),
  menu: (setting) => (
    <Menu defaultOpen {...setting}>
      <MenuTrigger>File</MenuTrigger>
      <MenuContent>
        <MenuItem>New file</MenuItem>
      </MenuContent>
    </Menu>
  ),
  select: (setting) => (
    <Select defaultOpen {...setting}>
      <SelectTrigger aria-label="Fruit" />
      <SelectContent>
        <SelectItem value="apple">Apple</SelectItem>
      </SelectContent>
    </Select>
  ),
  combobox: (setting) => (
    <Combobox defaultOpen {...setting}>
      <ComboboxInput aria-label="Country" />
      <ComboboxContent>
        <ComboboxList>
          <ComboboxItem value="ar">Argentina</ComboboxItem>
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  ),
  autocomplete: (setting) => (
    <Autocomplete defaultOpen {...setting}>
      <AutocompleteInput aria-label="Fruit" />
      <AutocompleteContent>
        <AutocompleteList>
          <AutocompleteItem value="apple">Apple</AutocompleteItem>
        </AutocompleteList>
      </AutocompleteContent>
    </Autocomplete>
  ),
}

describe("presentation server rendering", () => {
  for (const [name, popup] of Object.entries(popups)) {
    test(`${name}: "auto" renders the same markup as the default`, () => {
      const html = renderToString(popup({ presentation: "auto" }))
      expect(html).toBe(renderToString(popup({})))
      expect(html).not.toContain("-viewport")
    })

    test(`${name}: "sheet" renders the content in its viewport`, () => {
      const html = renderToString(popup({ presentation: "sheet" }))
      expect(html).toContain(`data-slot="${name}-viewport"`)
      expect(html).toContain('data-presentation="sheet"')
    })
  }
})
