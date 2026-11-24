"use client"

import { createDateInputController, DateInput } from "@ui-sdk/react/date-input"
import { Field, FieldLabel } from "@ui-sdk/react/field"
import * as React from "react"

function Example() {
  const [publish] = React.useState(createDateInputController)

  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button" onClick={() => publish.setValue("2026-12-25")}>
          Christmas
        </button>
        <button type="button" onClick={() => publish.focus("year")}>
          Edit Year
        </button>
        <button type="button" onClick={() => publish.clear()}>
          Clear
        </button>
      </div>
      <Field>
        <FieldLabel>Publish on</FieldLabel>
        <DateInput controller={publish} />
      </Field>
    </div>
  )
}

export { Example }
