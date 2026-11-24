"use client"

import * as React from "react"
import { Checkbox, CheckboxIndicator } from "@ui-sdk/react/checkbox"
import { Field, FieldLabel } from "@ui-sdk/react/field"
import { Input } from "@ui-sdk/react/input"
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@ui-sdk/react/popover"
import { CheckIcon } from "lucide-react"
import { useLog } from "../../../shared/react/log"

function Example() {
  const log = useLog()
  const [open, setOpen] = React.useState(false)
  const controls = React.useRef<HTMLDivElement>(null)

  return (
    <div data-slot="stack">
      <div data-slot="controls" ref={controls}>
        <label data-slot="label">
          <Checkbox
            checked={open}
            onCheckedChange={(next) => setOpen(next === true)}
          >
            <CheckboxIndicator>
              <CheckIcon aria-hidden="true" />
            </CheckboxIndicator>
          </Checkbox>
          Open
        </label>
      </div>
      <Popover
        open={open}
        onOpenChange={(next, details) => {
          const target = details.event?.target
          const inControls =
            target instanceof Node && controls.current?.contains(target)
          if (inControls && details.reason !== "escape-key") {
            return details.cancel()
          }
          setOpen(next)
          log(`${next ? "Opened" : "Closed"} (${details.reason})`)
        }}
      >
        <PopoverTrigger>Set Status</PopoverTrigger>
        <PopoverContent>
          <PopoverTitle>Set a status</PopoverTitle>
          <PopoverDescription>
            Your team sees it next to your name.
          </PopoverDescription>
          <Field>
            <FieldLabel>Status</FieldLabel>
            <Input defaultValue="In a meeting" />
          </Field>
          <div data-slot="row">
            <PopoverClose>Cancel</PopoverClose>
            <PopoverClose data-variant="solid">Save</PopoverClose>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

export { Example }
