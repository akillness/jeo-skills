import * as React from "react"
import { CircleHelpIcon } from "lucide-react"
import {
  createPopup,
  definePrimitive,
  popupClose,
  popupContent,
  popupState,
  popupTitle,
  popupTrigger,
  type ChangeDetails,
  type PopupPreset,
} from "@ui-sdk/core"
import { dialogPreset } from "@ui-sdk/core/dialog"
import { popoverPreset } from "@ui-sdk/core/popover"
import { tooltipPreset } from "@ui-sdk/core/tooltip"
import { createParts } from "@ui-sdk/react/primitive"

type PanelOptions = {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean, details: ChangeDetails<string>) => void
}

const popupWith = (name: string, preset: PopupPreset) =>
  definePrimitive({
    name,
    options: {
      open: "boolean",
      defaultOpen: "boolean",
      onOpenChange: "callback",
    },
    state: (options: PanelOptions) => popupState(options),
    sync: (options) =>
      options.open === undefined ? {} : { open: options.open },
    api: (context) => createPopup(context, { preset }),
    slots: (slot) => ({
      trigger: popupTrigger(slot),
      content: popupContent(slot),
      title: popupTitle(slot),
      close: popupClose(slot),
    }),
  })

const tags = {
  trigger: "button",
  content: "div",
  title: "h2",
  close: "button",
} as const

const filters = createParts(popupWith("filters", popoverPreset), tags)
const rename = createParts(popupWith("rename", dialogPreset), tags)
const help = createParts(popupWith("help", tooltipPreset), tags)

function Example() {
  return (
    <div data-slot="row">
      <filters.Root>
        <filters.Trigger>Filters</filters.Trigger>
        <filters.Content sideOffset={6}>
          <filters.Title>Filters</filters.Title>
          <label data-slot="label">
            <input type="checkbox" defaultChecked /> Unread only
          </label>
          <filters.Close data-size="sm">Done</filters.Close>
        </filters.Content>
      </filters.Root>
      <rename.Root>
        <rename.Trigger>Rename</rename.Trigger>
        <rename.Content>
          <rename.Title>Rename file</rename.Title>
          <input aria-label="Name" defaultValue="notes.md" />
          <rename.Close data-variant="solid" data-size="sm">
            Save
          </rename.Close>
        </rename.Content>
      </rename.Root>
      <help.Root>
        <help.Trigger aria-label="Help">
          <CircleHelpIcon aria-hidden="true" />
        </help.Trigger>
        <help.Content sideOffset={6}>
          Filters narrow the list, and Rename changes the file's name.
        </help.Content>
      </help.Root>
    </div>
  )
}

export { Example, filters, help, rename }
