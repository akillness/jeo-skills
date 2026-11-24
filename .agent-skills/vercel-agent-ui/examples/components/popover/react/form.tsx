"use client"

import * as React from "react"
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
import { useLog } from "../../../shared/react/log"

function Example() {
  const log = useLog()
  const [open, setOpen] = React.useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger>Edit Profile</PopoverTrigger>
      <PopoverContent>
        <PopoverTitle>Edit profile</PopoverTitle>
        <PopoverDescription>Your name shows on your posts.</PopoverDescription>
        <form
          data-slot="stack"
          onSubmit={(event) => {
            event.preventDefault()
            log(`Saved ${new FormData(event.currentTarget).get("name")}`)
            setOpen(false)
          }}
        >
          <Field>
            <FieldLabel>Name</FieldLabel>
            <Input name="name" required defaultValue="Hollis Grant" />
          </Field>
          <div data-slot="row">
            <PopoverClose>Cancel</PopoverClose>
            <button type="submit" data-variant="solid">
              Save
            </button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}

export { Example }
