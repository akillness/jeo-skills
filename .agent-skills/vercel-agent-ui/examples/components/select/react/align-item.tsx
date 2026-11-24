"use client"

import { Checkbox, CheckboxIndicator } from "@ui-sdk/react/checkbox"
import { Field, FieldLabel } from "@ui-sdk/react/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/react/select"
import { CheckIcon, ChevronDownIcon } from "lucide-react"
import * as React from "react"

const priorities = [
  { value: "urgent", label: "Urgent" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
  { value: "none", label: "No priority" },
]

function Example() {
  const [aligned, setAligned] = React.useState(true)

  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <label data-slot="label">
          <Checkbox
            checked={aligned}
            onCheckedChange={(next) => setAligned(next === true)}
          >
            <CheckboxIndicator>
              <CheckIcon />
            </CheckboxIndicator>
          </Checkbox>
          Align item with trigger
        </label>
      </div>
      <Field>
        <FieldLabel>Priority</FieldLabel>
        <Select defaultValue="medium">
          <SelectTrigger>
            <SelectValue />
            <ChevronDownIcon />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={aligned}>
            {priorities.map((priority) => (
              <SelectItem key={priority.value} value={priority.value}>
                {priority.label}
                <SelectItemIndicator>
                  <CheckIcon />
                </SelectItemIndicator>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </div>
  )
}

export { Example }
