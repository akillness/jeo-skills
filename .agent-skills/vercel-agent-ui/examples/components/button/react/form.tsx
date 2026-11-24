"use client"

import { Field, FieldLabel } from "@ui-sdk/react/field"
import { Input } from "@ui-sdk/react/input"
import { Button } from "@ui-sdk/react/button"
import { useLog } from "../../../shared/react/log"

function Example() {
  const log = useLog()

  return (
    <form
      data-slot="stack"
      onSubmit={(event) => {
        event.preventDefault()
        const email = String(new FormData(event.currentTarget).get("email"))
        log(`Subscribed ${email}`)
      }}
    >
      <Field>
        <FieldLabel>Email</FieldLabel>
        <Input name="email" type="email" defaultValue="ada@example.com" />
      </Field>
      <div data-slot="row">
        <Button type="submit">Subscribe</Button>
        <Button type="reset">Reset</Button>
      </div>
    </form>
  )
}

export { Example }
