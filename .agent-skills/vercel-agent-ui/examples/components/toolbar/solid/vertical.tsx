import { Toggle, ToggleGroup, ToggleIcon } from "@ui-sdk/solid/toggle"
import { Toolbar, ToolbarButton, ToolbarSeparator } from "@ui-sdk/solid/toolbar"
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
const MousePointer2 = icon(
  '<path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z" />'
)
const Pencil = icon(
  '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" /><path d="m15 5 4 4" />'
)
const Square = icon('<rect width="18" height="18" x="3" y="3" rx="2" />')
const Type = icon(
  '<path d="M12 4v16" /><path d="M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2" /><path d="M9 20h6" />'
)

const tools = [
  { value: "select", label: "Select", icon: MousePointer2 },
  { value: "draw", label: "Draw", icon: Pencil },
  { value: "shape", label: "Shape", icon: Square },
  { value: "text", label: "Text", icon: Type },
]

function Example() {
  const log = useLog()
  return (
    <Toolbar orientation="vertical" aria-label="Canvas">
      <ToggleGroup
        defaultValue={["select"]}
        deselectable={false}
        orientation="vertical"
        aria-label="Tool"
        onValueChange={([value]) =>
          log(`${tools.find((tool) => tool.value === value)?.label} tool`)
        }
      >
        <For each={tools}>
          {(tool) => (
            <Toggle value={tool.value} aria-label={tool.label}>
              <ToggleIcon>
                <tool.icon />
              </ToggleIcon>
            </Toggle>
          )}
        </For>
      </ToggleGroup>
      <ToolbarSeparator />
      <ToolbarButton
        aria-label="Delete"
        onClick={() => log("Deleted selection")}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M10 11v6" />
          <path d="M14 11v6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
          <path d="M3 6h18" />
          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      </ToolbarButton>
    </Toolbar>
  )
}

export { Example }
