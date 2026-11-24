import {
  createTooltipController,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@ui-sdk/solid/tooltip"
import { For } from "solid-js"

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
const Underline = icon(
  '<path d="M6 4v6a6 6 0 0 0 12 0V4" /><line x1="4" x2="20" y1="20" y2="20" />'
)

const formats = [
  { icon: Bold, label: "Bold" },
  { icon: Italic, label: "Italic" },
  { icon: Underline, label: "Underline" },
]

function Example() {
  const tooltip = createTooltipController<string>()

  return (
    <div data-slot="row" role="group" aria-label="Formatting">
      <For each={formats}>
        {(format) => (
          <TooltipTrigger
            controller={tooltip}
            payload={format.label}
            aria-label={format.label}
          >
            <format.icon />
          </TooltipTrigger>
        )}
      </For>
      <Tooltip controller={tooltip}>
        <TooltipContent<string>>{(state) => state.payload}</TooltipContent>
      </Tooltip>
    </div>
  )
}

export { Example }
