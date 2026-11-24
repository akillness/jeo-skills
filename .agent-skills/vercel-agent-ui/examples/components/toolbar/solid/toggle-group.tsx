import { Toggle, ToggleGroup, ToggleIcon } from "@ui-sdk/solid/toggle"
import { Toolbar, ToolbarSeparator } from "@ui-sdk/solid/toolbar"
import { For } from "solid-js"
import { useLog } from "../../../shared/solid/log"

const icon = (markup: string) => () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    innerHTML={markup}
  />
)
const AlignLeft = icon(
  '<path d="M21 5H3" /><path d="M15 12H3" /><path d="M17 19H3" />'
)
const AlignCenter = icon(
  '<path d="M21 5H3" /><path d="M17 12H7" /><path d="M19 19H5" />'
)
const AlignRight = icon(
  '<path d="M21 5H3" /><path d="M21 12H9" /><path d="M21 19H7" />'
)
const List = icon(
  '<path d="M3 5h.01" /><path d="M3 12h.01" /><path d="M3 19h.01" /><path d="M8 5h13" /><path d="M8 12h13" /><path d="M8 19h13" />'
)
const ListOrdered = icon(
  '<path d="M11 5h10" /><path d="M11 12h10" /><path d="M11 19h10" /><path d="M4 4h1v5" /><path d="M4 9h2" /><path d="M6.5 20H3.4c0-1 2.6-1.925 2.6-3.5a1.5 1.5 0 0 0-2.6-1.02" />'
)

const alignments = [
  { value: "left", label: "Align left", icon: AlignLeft },
  { value: "center", label: "Align center", icon: AlignCenter },
  { value: "right", label: "Align right", icon: AlignRight },
]

const lists = [
  { value: "bulleted", label: "Bulleted list", icon: List },
  { value: "numbered", label: "Numbered list", icon: ListOrdered },
]

function Example() {
  const log = useLog()
  return (
    <Toolbar aria-label="Paragraph">
      <ToggleGroup
        defaultValue={["left"]}
        deselectable={false}
        aria-label="Alignment"
        onValueChange={([value]) => log(`Align ${value}`)}
      >
        <For each={alignments}>
          {(alignment) => (
            <Toggle value={alignment.value} aria-label={alignment.label}>
              <ToggleIcon>
                <alignment.icon />
              </ToggleIcon>
            </Toggle>
          )}
        </For>
      </ToggleGroup>
      <ToolbarSeparator />
      <ToggleGroup
        aria-label="List"
        onValueChange={([value]) =>
          log(lists.find((list) => list.value === value)?.label ?? "No list")
        }
      >
        <For each={lists}>
          {(list) => (
            <Toggle value={list.value} aria-label={list.label}>
              <ToggleIcon>
                <list.icon />
              </ToggleIcon>
            </Toggle>
          )}
        </For>
      </ToggleGroup>
    </Toolbar>
  )
}

export { Example }
