"use client"

import * as React from "react"
import { Button } from "@ui-sdk/react/button"
import { Field, FieldLabel } from "@ui-sdk/react/field"
import { Input } from "@ui-sdk/react/input"
import { useLog } from "../../../shared/react/log"

function Example() {
  const log = useLog()
  const [title, setTitle] = React.useState("")
  const hint = React.useId()
  const ready = title.trim() !== ""

  return (
    <div data-slot="stack">
      <Field>
        <FieldLabel>Title</FieldLabel>
        <Input value={title} onValueChange={(value) => setTitle(value)} />
      </Field>
      <div data-slot="row">
        <Button
          disabled={!ready}
          focusableWhenDisabled
          aria-describedby={hint}
          onClick={() => log(`Published “${title}”`)}
        >
          Publish
        </Button>
        <p id={hint} data-slot="hint">
          {ready ? "Ready to publish." : "Add a title to publish."}
        </p>
      </div>
    </div>
  )
}

export { Example }
