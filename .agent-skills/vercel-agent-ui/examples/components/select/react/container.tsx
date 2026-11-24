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
import * as React from "react"

const fonts = [
  { value: "inter", label: "Inter" },
  { value: "geist", label: "Geist" },
  { value: "source-serif", label: "Source Serif" },
  { value: "geist-mono", label: "Geist Mono" },
]

function Example() {
  const [container, setContainer] = React.useState<HTMLDivElement | null>(null)

  return (
    <div data-slot="stack">
      <Field>
        <FieldLabel>Font</FieldLabel>
        <Select container={container} defaultValue="inter">
          <SelectTrigger>
            <SelectValue />
            <ChevronDownIcon />
          </SelectTrigger>
          <SelectContent>
            {fonts.map((font) => (
              <SelectItem key={font.value} value={font.value}>
                {font.label}
                <SelectItemIndicator>
                  <CheckIcon />
                </SelectItemIndicator>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <div ref={setContainer} data-slot="card" />
    </div>
  )
}

export { Example }
