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

const roles = [
  { value: "viewer", label: "Viewer" },
  { value: "commenter", label: "Commenter" },
  { value: "editor", label: "Editor" },
  { value: "admin", label: "Admin" },
]

function Example() {
  return (
    <Field>
      <FieldLabel>Role</FieldLabel>
      <Select placeholder="Select a role">
        <SelectTrigger>
          <SelectValue />
          <ChevronDownIcon />
        </SelectTrigger>
        <SelectContent>
          {roles.map((role) => (
            <SelectItem key={role.value} value={role.value}>
              {role.label}
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
