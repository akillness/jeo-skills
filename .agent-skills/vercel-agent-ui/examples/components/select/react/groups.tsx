"use client"

import { Field, FieldLabel } from "@ui-sdk/react/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectGroupLabel,
  SelectItem,
  SelectItemIndicator,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/react/select"
import { CheckIcon, ChevronDownIcon } from "lucide-react"
import * as React from "react"

const fonts = [
  {
    label: "Sans serif",
    items: [
      { value: "inter", label: "Inter" },
      { value: "geist", label: "Geist" },
    ],
  },
  {
    label: "Serif",
    items: [
      { value: "source-serif", label: "Source Serif" },
      { value: "lora", label: "Lora" },
    ],
  },
  {
    label: "Monospace",
    items: [
      { value: "geist-mono", label: "Geist Mono" },
      { value: "jetbrains-mono", label: "JetBrains Mono" },
    ],
  },
]

function Example() {
  return (
    <Field>
      <FieldLabel>Font</FieldLabel>
      <Select placeholder="Select a font">
        <SelectTrigger>
          <SelectValue />
          <ChevronDownIcon />
        </SelectTrigger>
        <SelectContent>
          {fonts.map((group, index) => (
            <React.Fragment key={group.label}>
              {index > 0 && <SelectSeparator />}
              <SelectGroup>
                <SelectGroupLabel>{group.label}</SelectGroupLabel>
                {group.items.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                    <SelectItemIndicator>
                      <CheckIcon />
                    </SelectItemIndicator>
                  </SelectItem>
                ))}
              </SelectGroup>
            </React.Fragment>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}

export { Example }
