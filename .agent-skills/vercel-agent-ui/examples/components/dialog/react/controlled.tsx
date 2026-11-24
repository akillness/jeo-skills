"use client"

import * as React from "react"
import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@ui-sdk/react/dialog"
import { Checkbox, CheckboxIndicator } from "@ui-sdk/react/checkbox"
import { CheckIcon } from "lucide-react"
import { useLog } from "../../../shared/react/log"

const topics = [
  { label: "Product updates", checked: true },
  { label: "Security alerts", checked: true },
  { label: "Weekly digest", checked: false },
]

function Example() {
  const log = useLog()
  const [open, setOpen] = React.useState(false)
  return (
    <div data-slot="stack">
      <div data-slot="controls">
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
      <Dialog
        open={open}
        onOpenChange={(next, details) => {
          setOpen(next)
          log(`${next ? "Opened" : "Closed"} (${details.reason})`)
        }}
        onOpenChangeComplete={(next) =>
          log(next ? "Finished opening" : "Finished closing")
        }
      >
        <DialogTrigger>Notification Settings</DialogTrigger>
        <DialogBackdrop />
        <DialogContent>
          <div data-slot="stack">
            <DialogTitle>Notification settings</DialogTitle>
            <DialogDescription>
              Choose what we email you about.
            </DialogDescription>
          </div>
          <div data-slot="stack">
            {topics.map((topic) => (
              <label data-slot="label" key={topic.label}>
                <Checkbox defaultChecked={topic.checked}>
                  <CheckboxIndicator>
                    <CheckIcon aria-hidden="true" />
                  </CheckboxIndicator>
                </Checkbox>
                {topic.label}
              </label>
            ))}
          </div>
          <div data-slot="row">
            <DialogClose data-variant="solid">Done</DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export { Example }
