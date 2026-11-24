"use client"

import * as React from "react"
import { Field, FieldControl, FieldLabel } from "@ui-sdk/react/field"
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@ui-sdk/react/popover"
import { useLog } from "../../../shared/react/log"

function Example() {
  const log = useLog()
  const [open, setOpen] = React.useState(false)
  const [note, setNote] = React.useState("")
  const [asking, setAsking] = React.useState(false)
  const field = React.useRef<HTMLTextAreaElement>(null)
  const close = () => {
    setOpen(false)
    setNote("")
    setAsking(false)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => (next ? setOpen(true) : close())}
      dismissible={note === ""}
      onDismissAttempt={(details) => {
        log(`Kept open (${details.reason})`)
        setAsking(true)
      }}
    >
      <PopoverTrigger>Add Note</PopoverTrigger>
      <PopoverContent>
        <PopoverTitle>Add a note</PopoverTitle>
        <PopoverDescription>Only your team can see it.</PopoverDescription>
        <Field>
          <FieldLabel>Note</FieldLabel>
          <FieldControl
            render={
              <textarea
                ref={field}
                placeholder="Call the printer about the proofs."
              />
            }
            value={note}
            onChange={(event) => setNote(event.currentTarget.value)}
          />
        </Field>
        {asking ? (
          <div data-slot="row" role="alert">
            Discard your note?
            <div data-slot="row">
              <button
                type="button"
                data-size="sm"
                onClick={() => {
                  setAsking(false)
                  field.current?.focus()
                }}
              >
                Keep Editing
              </button>
              <button
                type="button"
                data-size="sm"
                data-variant="solid"
                onClick={() => {
                  log("Discarded the note")
                  close()
                }}
              >
                Discard
              </button>
            </div>
          </div>
        ) : (
          <div data-slot="row">
            <PopoverClose>Cancel</PopoverClose>
            <button
              type="button"
              data-variant="solid"
              onClick={() => {
                log(note ? "Saved the note" : "Nothing to save")
                close()
              }}
            >
              Save
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

export { Example }
