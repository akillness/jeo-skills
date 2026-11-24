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
import { useLog } from "../../../shared/react/log"

const roles = [
  { value: "viewer", label: "Viewer" },
  { value: "commenter", label: "Commenter" },
  { value: "editor", label: "Editor" },
  { value: "admin", label: "Admin" },
  { value: "owner", label: "Owner" },
]

function Example() {
  const [value, setValue] = React.useState<string | null>("viewer")
  const [open, setOpen] = React.useState(false)
  const log = useLog()

  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button" onClick={() => setValue("editor")}>
          Make Editor
        </button>
        <button type="button" onClick={() => setOpen(true)}>
          Open
        </button>
      </div>
      <Field>
        <FieldLabel>Role</FieldLabel>
        <Select
          value={value}
          onValueChange={(next, details) => {
            if (next === "owner") {
              details.cancel()
              log("Only the owner can transfer ownership")
              return
            }
            setValue(next)
            log(`value: ${next} (${details.reason})`)
          }}
          open={open}
          onOpenChange={(next, details) => {
            setOpen(next)
            log(`open: ${next} (${details.reason})`)
          }}
        >
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
    </div>
  )
}

export { Example }
