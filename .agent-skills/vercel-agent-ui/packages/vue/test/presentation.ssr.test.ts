// @vitest-environment node
import { renderToString } from "@vue/server-renderer"
import { describe, expect, test } from "vitest"
import { createSSRApp, h, type Component } from "vue"
import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "../src"

// Runs with no DOM. `presentation="auto"` is decided at open on the client, so
// the server renders an open popup as its default presentation, the same
// markup as without the option, and the client's first render matches it.
type Setting = { presentation?: "auto" | "sheet" }

// A root, a part before the content, the content, and an item inside it.
const parts: Record<
  string,
  [Component, Component, Component, Component, Component?]
> = {
  popover: [Popover, PopoverTrigger, PopoverContent, PopoverTitle],
  dialog: [Dialog, DialogTrigger, DialogContent, DialogTitle],
  menu: [Menu, MenuTrigger, MenuContent, MenuItem],
  select: [Select, SelectTrigger, SelectContent, SelectItem],
  combobox: [
    Combobox,
    ComboboxInput,
    ComboboxContent,
    ComboboxItem,
    ComboboxList,
  ],
  autocomplete: [
    Autocomplete,
    AutocompleteInput,
    AutocompleteContent,
    AutocompleteItem,
    AutocompleteList,
  ],
}

function app(name: string, setting: Setting) {
  const [Root, Before, Content, Item, List] = parts[name]
  const item = () => h(Item, { value: "one" }, () => "One")
  return createSSRApp(() =>
    h(Root, { defaultOpen: true, ...setting }, () => [
      h(Before, { "aria-label": "Open" }, () => "Open"),
      h(Content, null, () => (List ? h(List, null, () => item()) : item())),
    ])
  )
}

describe("presentation server rendering", () => {
  for (const name of Object.keys(parts)) {
    test(`${name}: "auto" renders the same markup as the default`, async () => {
      const html = await renderToString(app(name, { presentation: "auto" }))
      expect(html).toBe(await renderToString(app(name, {})))
      expect(html).not.toContain("-viewport")
    })

    test(`${name}: "sheet" renders the content in its viewport`, async () => {
      const html = await renderToString(app(name, { presentation: "sheet" }))
      expect(html).toContain(`data-slot="${name}-viewport"`)
      expect(html).toContain('data-presentation="sheet"')
    })
  }
})
