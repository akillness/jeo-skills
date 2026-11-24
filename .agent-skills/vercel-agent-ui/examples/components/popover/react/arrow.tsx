"use client"

import * as React from "react"
import {
  Popover,
  PopoverArrow,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@ui-sdk/react/popover"
import { CircleQuestionMarkIcon } from "lucide-react"

const sides = [
  { value: "top", label: "Top" },
  { value: "right", label: "Right" },
  { value: "bottom", label: "Bottom" },
  { value: "left", label: "Left" },
] as const
type Side = (typeof sides)[number]["value"]

function Example() {
  const [open, setOpen] = React.useState(false)
  const [side, setSide] = React.useState<Side>("bottom")
  const controls = React.useRef<HTMLDivElement>(null)

  return (
    <div data-slot="stack">
      <div data-slot="controls" role="group" aria-label="Side" ref={controls}>
        {sides.map((option) => (
          <button
            key={option.value}
            type="button"
            data-size="sm"
            aria-pressed={side === option.value}
            onClick={() => setSide(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <Popover
        open={open}
        onOpenChange={(next, details) => {
          const target = details.event?.target
          const inControls =
            target instanceof Node && controls.current?.contains(target)
          if (inControls && details.reason !== "escape-key") {
            return details.cancel()
          }
          setOpen(next)
        }}
      >
        <PopoverTrigger aria-label="Help">
          <CircleQuestionMarkIcon aria-hidden="true" />
        </PopoverTrigger>
        <PopoverContent side={side} sideOffset={10} arrowPadding={12}>
          <PopoverArrow />
          <PopoverTitle>Keyboard shortcuts</PopoverTitle>
          <PopoverDescription>
            Press ? anywhere to see them all.
          </PopoverDescription>
        </PopoverContent>
      </Popover>
    </div>
  )
}

export { Example }
