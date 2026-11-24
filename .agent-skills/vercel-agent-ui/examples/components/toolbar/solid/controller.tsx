import { useShortcut } from "@ui-sdk/solid/shortcuts"
import {
  createToolbarController,
  Toolbar,
  ToolbarButton,
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
const Bold = icon(
  '<path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8" />'
)
const Italic = icon(
  '<line x1="19" x2="10" y1="4" y2="4" /><line x1="14" x2="5" y1="20" y2="20" /><line x1="15" x2="9" y1="4" y2="20" />'
)
const Link = icon(
  '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />'
)

const actions = [
  { label: "Bold", icon: Bold },
  { label: "Italic", icon: Italic },
  { label: "Insert link", icon: Link },
]

function Example() {
  const log = useLog()
  const toolbar = createToolbarController()
  useShortcut("alt+f10", () => toolbar.focus(), { allowInInput: true })
  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button" onClick={() => toolbar.focus()}>
          Focus Toolbar
        </button>
      </div>
      <Toolbar controller={toolbar} aria-label="Notes formatting">
        <For each={actions}>
          {(action) => (
            <ToolbarButton
              aria-label={action.label}
              onClick={() => log(action.label)}
            >
              <action.icon />
            </ToolbarButton>
          )}
        </For>
      </Toolbar>
      <textarea aria-label="Notes" placeholder="Type, then press Alt+F10" />
    </div>
  )
}

export { Example }
