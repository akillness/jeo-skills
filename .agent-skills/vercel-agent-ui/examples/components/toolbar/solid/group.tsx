import {
  Toolbar,
  ToolbarButton,
  ToolbarGroup,
  ToolbarSeparator,
} from "@ui-sdk/solid/toolbar"
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
const Scissors = icon(
  '<circle cx="6" cy="6" r="3" /><path d="M8.12 8.12 12 12" /><path d="M20 4 8.12 15.88" /><circle cx="6" cy="18" r="3" /><path d="M14.8 14.8 20 20" />'
)
const Copy = icon(
  '<rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />'
)
const Clipboard = icon(
  '<rect width="8" height="4" x="8" y="2" rx="1" ry="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />'
)

const clipboard = [
  { label: "Cut", icon: Scissors },
  { label: "Copy", icon: Copy },
  { label: "Paste", icon: Clipboard },
]

function Example() {
  const log = useLog()
  return (
    <Toolbar aria-label="Edit">
      <ToolbarGroup aria-label="Clipboard">
        <For each={clipboard}>
          {(item) => (
            <ToolbarButton
              aria-label={item.label}
              onClick={() => log(item.label)}
            >
              <item.icon />
            </ToolbarButton>
          )}
        </For>
      </ToolbarGroup>
      <ToolbarSeparator />
      <ToolbarGroup disabled aria-label="History">
        <ToolbarButton aria-label="Undo">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M3 7v6h6" />
            <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
          </svg>
        </ToolbarButton>
        <ToolbarButton aria-label="Redo">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M21 7v6h-6" />
            <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7" />
          </svg>
        </ToolbarButton>
      </ToolbarGroup>
    </Toolbar>
  )
}

export { Example }
