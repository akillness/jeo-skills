"use client"

import * as React from "react"
import { Checkbox, CheckboxIndicator } from "@ui-sdk/react/checkbox"
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@ui-sdk/react/popover"
import { CheckIcon, SlidersHorizontalIcon } from "lucide-react"

const types = [
  { label: "Documents", checked: true },
  { label: "Images", checked: false },
  { label: "Shared with me", checked: true },
]

function Example() {
  const [anchor, setAnchor] = React.useState<HTMLInputElement | null>(null)

  return (
    <div data-slot="row">
      <input
        ref={setAnchor}
        type="search"
        placeholder="Search files…"
        aria-label="Search files"
      />
      <Popover>
        <PopoverTrigger aria-label="Search filters">
          <SlidersHorizontalIcon aria-hidden="true" />
        </PopoverTrigger>
        <PopoverContent anchor={anchor} align="start" sideOffset={8}>
          <PopoverTitle>Filters</PopoverTitle>
          <PopoverDescription>
            Show only these kinds of files.
          </PopoverDescription>
          <div data-slot="stack">
            {types.map((type) => (
              <label data-slot="label" key={type.label}>
                <Checkbox defaultChecked={type.checked}>
                  <CheckboxIndicator>
                    <CheckIcon aria-hidden="true" />
                  </CheckboxIndicator>
                </Checkbox>
                {type.label}
              </label>
            ))}
          </div>
          <div data-slot="row">
            <PopoverClose>Cancel</PopoverClose>
            <PopoverClose data-variant="solid">Apply</PopoverClose>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

export { Example }
