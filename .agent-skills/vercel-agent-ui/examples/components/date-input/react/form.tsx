"use client"

import { DateInput } from "@ui-sdk/react/date-input"
import { Field, FieldError, FieldLabel } from "@ui-sdk/react/field"
import { TimeInput } from "@ui-sdk/react/time-input"
import { useLog } from "../../../shared/react/log"

function Example() {
  const log = useLog()

  return (
    <form
      data-slot="stack"
      onSubmit={(event) => {
        event.preventDefault()
        const data = [...new FormData(event.currentTarget)].map(
          ([name, value]) => `${name}=${value}`
        )
        log(`Submitted ${data.join(", ")}`)
      }}
    >
      <Field>
        <FieldLabel>Date</FieldLabel>
        <DateInput name="date" defaultValue="2026-11-02" required />
        <FieldError />
      </Field>
      <Field>
        <FieldLabel>Time</FieldLabel>
        <TimeInput name="time" defaultValue="09:30" required />
        <FieldError />
      </Field>
      <div data-slot="row">
        <button type="reset">Reset</button>
        <button type="submit" data-variant="solid">
          Book
        </button>
      </div>
    </form>
  )
}

export { Example }
