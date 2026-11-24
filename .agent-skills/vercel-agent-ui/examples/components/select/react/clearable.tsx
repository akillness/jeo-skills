"use client"

import { Field, FieldLabel } from "@ui-sdk/react/field"
import {
  Select,
  SelectClear,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/react/select"
import { CheckIcon, ChevronDownIcon, XIcon } from "lucide-react"
import { useLog } from "../../../shared/react/log"

const people = [
  { value: "hollis", label: "Hollis Grant" },
  { value: "ines", label: "Inès Moreau" },
  { value: "kofi", label: "Kofi Mensah" },
  { value: "wren", label: "Wren Takahashi" },
  { value: "tomasz", label: "Tomasz Wójcik" },
]

function Example() {
  const log = useLog()

  return (
    <Field>
      <FieldLabel>Assignee</FieldLabel>
      <Select
        defaultValue="ines"
        placeholder="Unassigned"
        onValueChange={(value, details) =>
          log(`value: ${JSON.stringify(value)} (${details.reason})`)
        }
      >
        <div data-slot="row">
          <SelectTrigger>
            <SelectValue />
            <ChevronDownIcon />
          </SelectTrigger>
          <SelectClear aria-label="Clear assignee">
            <XIcon />
          </SelectClear>
        </div>
        <SelectContent>
          {people.map((person) => (
            <SelectItem key={person.value} value={person.value}>
              {person.label}
              <SelectItemIndicator>
                <CheckIcon />
              </SelectItemIndicator>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}

export { Example }
