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
import { useLog } from "../../../shared/react/log"

const roles = [
  { value: "viewer", label: "Viewer" },
  { value: "commenter", label: "Commenter" },
  { value: "editor", label: "Editor" },
  { value: "admin", label: "Admin" },
]

function Example() {
  const log = useLog()

  return (
    <Field>
      <FieldLabel>Role</FieldLabel>
      <Select
        defaultValue="editor"
        onOpenChangeComplete={(open) =>
          log(open ? "Finished opening" : "Finished closing")
        }
      >
        <SelectTrigger>
          <SelectValue />
          <ChevronDownIcon />
        </SelectTrigger>
        <SelectContent>
          {roles.map((role) => (
            <SelectItem key={role.value} value={role.value}>
              {role.label}
              <SelectItemIndicator keepMounted>
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
