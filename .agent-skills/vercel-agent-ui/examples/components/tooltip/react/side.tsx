"use client"

import { Tooltip, TooltipContent, TooltipTrigger } from "@ui-sdk/react/tooltip"

const sides = [
  { side: "top", label: "Top" },
  { side: "left", label: "Left" },
  { side: "right", label: "Right" },
  { side: "bottom", label: "Bottom" },
] as const

function Example() {
  return (
    <div data-slot="grid">
      {sides.map(({ side, label }) => (
        <Tooltip key={side}>
          <TooltipTrigger>{label}</TooltipTrigger>
          <TooltipContent side={side}>Add to library</TooltipContent>
        </Tooltip>
      ))}
    </div>
  )
}

export { Example }
