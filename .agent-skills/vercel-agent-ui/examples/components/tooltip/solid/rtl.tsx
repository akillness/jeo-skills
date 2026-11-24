import {
  Tooltip,
  TooltipArrow,
  TooltipContent,
  TooltipTrigger,
} from "@ui-sdk/solid/tooltip"
import { For } from "solid-js"

const sides = [
  { side: "right", label: "يمين" },
  { side: "top", label: "أعلى" },
  { side: "bottom", label: "أسفل" },
  { side: "left", label: "يسار" },
] as const

function Example() {
  return (
    <div dir="rtl" data-slot="row">
      <For each={sides}>
        {({ side, label }) => (
          <Tooltip>
            <TooltipTrigger>{label}</TooltipTrigger>
            <TooltipContent side={side} align="start" sideOffset={8}>
              <TooltipArrow />
              أضف إلى المكتبة
            </TooltipContent>
          </Tooltip>
        )}
      </For>
    </div>
  )
}

export { Example }
