"use client"

import {
  createTooltipController,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@ui-sdk/react/tooltip"
import { BoldIcon, ItalicIcon, UnderlineIcon } from "lucide-react"
import * as React from "react"

const formats = [
  { icon: BoldIcon, label: "Bold" },
  { icon: ItalicIcon, label: "Italic" },
  { icon: UnderlineIcon, label: "Underline" },
]

function Example() {
  const [tooltip] = React.useState(() => createTooltipController<string>())

  return (
    <div data-slot="row" role="group" aria-label="Formatting">
      {formats.map((format) => (
        <TooltipTrigger
          key={format.label}
          controller={tooltip}
          payload={format.label}
          aria-label={format.label}
        >
          <format.icon aria-hidden="true" />
        </TooltipTrigger>
      ))}
      <Tooltip controller={tooltip}>
        <TooltipContent<string>>{(state) => state.payload}</TooltipContent>
      </Tooltip>
    </div>
  )
}

export { Example }
