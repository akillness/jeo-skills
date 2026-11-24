"use client"

import { Field, FieldLabel } from "@ui-sdk/react/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectGroupLabel,
  SelectItem,
  SelectItemIndicator,
  SelectTrigger,
  SelectValue,
  type ListData,
} from "@ui-sdk/react/select"
import { CheckIcon, ChevronDownIcon } from "lucide-react"

const sizeGroups = [
  { type: "group", label: "Common", items: ["Small", "Medium", "Large"] },
  { type: "group", label: "Extended", items: ["Extra small", "Extra large"] },
] satisfies ListData

function Example() {
  return (
    <Field>
      <FieldLabel>Size</FieldLabel>
      <Select items={sizeGroups} name="size" defaultValue="Medium">
        <SelectTrigger>
          <SelectValue />
          <ChevronDownIcon />
        </SelectTrigger>
        <SelectContent>
          {sizeGroups.map((group) => (
            <SelectGroup key={group.label}>
              <SelectGroupLabel>{group.label}</SelectGroupLabel>
              {group.items.map((size) => (
                <SelectItem key={size} value={size}>
                  {size}
                  <SelectItemIndicator>
                    <CheckIcon />
                  </SelectItemIndicator>
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}

export { Example }
