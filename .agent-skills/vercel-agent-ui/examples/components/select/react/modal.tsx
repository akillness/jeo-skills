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

const statuses = [
  { value: "backlog", label: "Backlog" },
  { value: "todo", label: "Todo" },
  { value: "in-progress", label: "In Progress" },
  { value: "done", label: "Done" },
]

const modes = [
  { value: "pointer", label: "Pointer" },
  { value: true, label: "Modal" },
  { value: false, label: "Non-modal" },
] as const

function Example() {
  const [modal, setModal] = React.useState<boolean | "pointer">("pointer")
  const log = useLog()

  return (
    <div data-slot="stack">
      <div data-slot="controls" role="group" aria-label="Modal">
        {modes.map((mode) => (
          <button
            key={mode.label}
            type="button"
            aria-pressed={modal === mode.value}
            onClick={() => setModal(mode.value)}
          >
            {mode.label}
          </button>
        ))}
      </div>
      <Field>
        <FieldLabel>Status</FieldLabel>
        <Select modal={modal} defaultValue="todo">
          <SelectTrigger>
            <SelectValue />
            <ChevronDownIcon />
          </SelectTrigger>
          <SelectContent>
            {statuses.map((status) => (
              <SelectItem key={status.value} value={status.value}>
                {status.label}
                <SelectItemIndicator>
                  <CheckIcon />
                </SelectItemIndicator>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <button type="button" onClick={() => log("Pressed Save Draft")}>
        Save Draft
      </button>
    </div>
  )
}

export { Example }
