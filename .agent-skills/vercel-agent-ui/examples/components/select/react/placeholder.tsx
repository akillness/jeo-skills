"use client"

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

const sizes = ["Extra small", "Small", "Medium", "Large", "Extra large"]

const wraps = ["Paper", "Ribbon", "Box"]

function Example() {
  return (
    <div data-slot="stack">
      <Field>
        <FieldLabel>Size</FieldLabel>
        <Select placeholder="Select a size">
          <SelectTrigger>
            <SelectValue />
            <ChevronDownIcon />
          </SelectTrigger>
          <SelectContent>
            {sizes.map((size) => (
              <SelectItem key={size} value={size}>
                {size}
                <SelectItemIndicator>
                  <CheckIcon />
                </SelectItemIndicator>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel>Gift wrap</FieldLabel>
        <Select>
          <SelectTrigger>
            <SelectValue placeholder="None" />
            <ChevronDownIcon />
          </SelectTrigger>
          <SelectContent>
            {wraps.map((wrap) => (
              <SelectItem key={wrap} value={wrap}>
                {wrap}
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
