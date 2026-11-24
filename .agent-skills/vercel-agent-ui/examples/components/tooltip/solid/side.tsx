import { Tooltip, TooltipContent, TooltipTrigger } from "@ui-sdk/solid/tooltip"
import { For } from "solid-js"

const sides = [
  { side: "top", label: "Top" },
  { side: "left", label: "Left" },
  { side: "right", label: "Right" },
  { side: "bottom", label: "Bottom" },
] as const

function Example() {
  return (
    <div data-slot="grid">
      <For each={sides}>
        {({ side, label }) => (
          <Tooltip>
            <TooltipTrigger>{label}</TooltipTrigger>
            <TooltipContent side={side}>Add to library</TooltipContent>
          </Tooltip>
        )}
      </For>
    </div>
  )
}

export { Example }
