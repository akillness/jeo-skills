"use client"

import {
  Tooltip,
  TooltipArrow,
  TooltipContent,
  TooltipTrigger,
} from "@ui-sdk/react/tooltip"

const sides = [
  { side: "right", label: "يمين" },
  { side: "top", label: "أعلى" },
  { side: "bottom", label: "أسفل" },
  { side: "left", label: "يسار" },
] as const

function Example() {
  return (
    <div dir="rtl" data-slot="row">
      {sides.map(({ side, label }) => (
        <Tooltip key={side}>
          <TooltipTrigger>{label}</TooltipTrigger>
          <TooltipContent side={side} align="start" sideOffset={8}>
            <TooltipArrow />
            أضف إلى المكتبة
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  )
}

export { Example }
