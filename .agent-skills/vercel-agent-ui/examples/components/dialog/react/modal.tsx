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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/react/select"
import { Checkbox, CheckboxIndicator } from "@ui-sdk/react/checkbox"
import { CheckIcon, ChevronDownIcon } from "lucide-react"

const modes = [
  { value: "true", label: "Modal" },
  { value: "trap-focus", label: "Trap focus" },
  { value: "false", label: "Non-modal" },
]

type Mode = "true" | "trap-focus" | "false"

const notes = {
  true: "The rest of the page is inert and doesn't scroll.",
  "trap-focus":
    "Tab stays inside, and the page still scrolls and takes clicks.",
  false:
    "The page stays usable. Tab leaves the notes, and Escape closes them while focus is inside.",
}

function Example() {
  const [mode, setMode] = React.useState<Mode>("false")
  const [outside, setOutside] = React.useState(false)
  const modal = mode === "true" ? true : mode === "false" ? false : "trap-focus"
  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <Select
          items={modes}
          value={mode}
          onValueChange={(next) => next && setMode(next as Mode)}
        >
          <SelectLabel>Modal</SelectLabel>
          <SelectTrigger>
            <SelectValue />
            <ChevronDownIcon />
          </SelectTrigger>
          <SelectContent>
            {modes.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
                <SelectItemIndicator>
                  <CheckIcon />
                </SelectItemIndicator>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label data-slot="label">
          <Checkbox
            checked={outside}
            onCheckedChange={(next) => setOutside(next === true)}
          >
            <CheckboxIndicator>
              <CheckIcon aria-hidden="true" />
            </CheckboxIndicator>
          </Checkbox>
          Close on outside press
        </label>
      </div>
      <Dialog modal={modal} closeOnOutsidePress={outside}>
        <DialogTrigger>Open Notes</DialogTrigger>
        {modal === true && <DialogBackdrop />}
        <DialogContent>
          <div data-slot="stack">
            <DialogTitle>Notes</DialogTitle>
            <DialogDescription>{notes[mode]}</DialogDescription>
          </div>
          <textarea
            aria-label="Notes"
            defaultValue="Call the printer about the proofs."
          />
          <div data-slot="row">
            <DialogClose data-variant="solid">Done</DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export { Example }
