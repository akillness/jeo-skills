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

const choices = {
  sideOffset: { label: "Side offset", values: ["4", "8", "16", "24"] },
  alignOffset: { label: "Align offset", values: ["-16", "0", "16"] },
  collisionPadding: { label: "Collision padding", values: ["8", "24", "48"] },
}
type Name = keyof typeof choices

function Example() {
  const [offsets, setOffsets] = React.useState<Record<Name, string>>({
    sideOffset: "8",
    alignOffset: "0",
    collisionPadding: "8",
  })

  return (
    <div data-slot="stack">
      <div data-slot="controls">
        {(Object.keys(choices) as Name[]).map((name) => (
          <Select
            key={name}
            items={choices[name].values}
            value={offsets[name]}
            onValueChange={(next) =>
              next && setOffsets({ ...offsets, [name]: next })
            }
          >
            <SelectLabel>{choices[name].label}</SelectLabel>
            <SelectTrigger>
              <SelectValue />
              <ChevronDownIcon aria-hidden="true" />
            </SelectTrigger>
            <SelectContent>
              {choices[name].values.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}px
                  <SelectItemIndicator>
                    <CheckIcon aria-hidden="true" />
                  </SelectItemIndicator>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}
      </div>
      <Popover>
        <PopoverTrigger>Delivery</PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={Number(offsets.sideOffset)}
          alignOffset={Number(offsets.alignOffset)}
          collisionPadding={Number(offsets.collisionPadding)}
        >
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
