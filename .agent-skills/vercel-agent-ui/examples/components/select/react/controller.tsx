"use client"

import { Field, FieldLabel } from "@ui-sdk/react/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectTrigger,
  SelectValue,
  createSelectController,
} from "@ui-sdk/react/select"
import { CheckIcon, ChevronDownIcon } from "lucide-react"
import { useLog } from "../../../shared/react/log"

const statuses = [
  { value: "backlog", label: "Backlog" },
  { value: "todo", label: "Todo" },
  { value: "in-progress", label: "In Progress" },
  { value: "done", label: "Done" },
]

const status = createSelectController<string>()

function Example() {
  const log = useLog()

  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <button
          type="button"
          onClick={async () => {
            const { reason } = await status.open()
            log(`Closed by ${reason}, with ${status.getValue() ?? "nothing"}`)
          }}
        >
          Open and Wait
        </button>
        <button type="button" onClick={() => status.setValue("done")}>
          Mark Done
        </button>
        <button type="button" onClick={() => status.clear()}>
          Clear
        </button>
        <button type="button" onClick={() => status.focus()}>
          Focus
        </button>
      </div>
      <Field>
        <FieldLabel>Status</FieldLabel>
        <SelectTrigger controller={status}>
          <SelectValue />
          <ChevronDownIcon />
        </SelectTrigger>
      </Field>
      <Select
        controller={status}
        items={statuses}
        placeholder="Select a status"
      >
        <SelectContent>
          {statuses.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
              <SelectItemIndicator>
                <CheckIcon />
              </SelectItemIndicator>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export { Example }
