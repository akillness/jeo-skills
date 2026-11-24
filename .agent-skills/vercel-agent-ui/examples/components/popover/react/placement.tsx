"use client"

import * as React from "react"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@ui-sdk/react/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/react/select"
import { CheckIcon, ChevronDownIcon } from "lucide-react"

const sides = [
  { value: "top", label: "Top" },
  { value: "right", label: "Right" },
  { value: "bottom", label: "Bottom" },
  { value: "left", label: "Left" },
]
const aligns = [
  { value: "start", label: "Start" },
  { value: "center", label: "Center" },
  { value: "end", label: "End" },
]
type Side = "top" | "right" | "bottom" | "left"
type Align = "start" | "center" | "end"

function Example() {
  const [side, setSide] = React.useState<Side>("bottom")
  const [align, setAlign] = React.useState<Align>("center")

  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <Select
          items={sides}
          value={side}
          onValueChange={(next) => next && setSide(next as Side)}
        >
          <SelectLabel>Side</SelectLabel>
          <SelectTrigger>
            <SelectValue />
            <ChevronDownIcon aria-hidden="true" />
          </SelectTrigger>
          <SelectContent>
            {sides.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
                <SelectItemIndicator>
                  <CheckIcon aria-hidden="true" />
                </SelectItemIndicator>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          items={aligns}
          value={align}
          onValueChange={(next) => next && setAlign(next as Align)}
        >
          <SelectLabel>Align</SelectLabel>
          <SelectTrigger>
            <SelectValue />
            <ChevronDownIcon aria-hidden="true" />
          </SelectTrigger>
          <SelectContent>
            {aligns.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
                <SelectItemIndicator>
                  <CheckIcon aria-hidden="true" />
                </SelectItemIndicator>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Popover>
        <PopoverTrigger>Delivery</PopoverTrigger>
        <PopoverContent side={side} align={align} sideOffset={8}>
          <PopoverTitle>Delivery window</PopoverTitle>
          <PopoverDescription>
            Arrives Tuesday between 9 AM and noon.
          </PopoverDescription>
        </PopoverContent>
      </Popover>
    </div>
  )
}

export { Example }
