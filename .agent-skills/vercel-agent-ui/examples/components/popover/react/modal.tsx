"use client"

import * as React from "react"
import { Field, FieldLabel } from "@ui-sdk/react/field"
import { Textarea } from "@ui-sdk/react/textarea"
import {
  Popover,
  PopoverClose,
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

const modes = [
  { value: "false", label: "Non-modal" },
  { value: "trap-focus", label: "Trap focus" },
  { value: "true", label: "Modal" },
]

type Mode = "false" | "trap-focus" | "true"

const notes = {
  false: "Tab can leave, and focus leaving closes it.",
  "trap-focus": "Tab stays inside. The page still scrolls and takes clicks.",
  true: "Tab stays inside. The page is inert and doesn't scroll.",
}

function Example() {
  const [mode, setMode] = React.useState<Mode>("false")
  const modal = mode === "true" ? true : mode === "false" ? false : "trap-focus"

  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <Select
          items={modes}
          value={mode}
          onValueChange={(next) => next && setMode(next as Mode)}
        >
          <SelectLabel>Modal</SelectLabel>
          <SelectTrigger>
            <SelectValue />
            <ChevronDownIcon aria-hidden="true" />
          </SelectTrigger>
          <SelectContent>
            {modes.map((option) => (
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
      <Popover modal={modal}>
        <PopoverTrigger>Add Comment</PopoverTrigger>
        <PopoverContent>
          <PopoverTitle>Add a comment</PopoverTitle>
          <PopoverDescription>{notes[mode]}</PopoverDescription>
          <Field>
            <FieldLabel>Comment</FieldLabel>
            <Textarea defaultValue="Looks good to me." />
          </Field>
          <div data-slot="row">
            <PopoverClose>Cancel</PopoverClose>
            <PopoverClose data-variant="solid">Comment</PopoverClose>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

export { Example }
