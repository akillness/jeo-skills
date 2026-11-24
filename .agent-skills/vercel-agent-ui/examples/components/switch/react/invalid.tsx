"use client"

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@ui-sdk/react/field"
import { Switch, SwitchThumb } from "@ui-sdk/react/switch"
import { useLog } from "../../../shared/react/log"

function Example() {
  const log = useLog()

  return (
    <form
      data-slot="stack"
      onSubmit={(event) => {
        event.preventDefault()
        log(
          `Submitted two-factor=${new FormData(event.currentTarget).get("two-factor")}`
        )
      }}
    >
      <Field>
        <div data-slot="row">
          <div data-slot="stack">
            <FieldLabel>Two-factor authentication</FieldLabel>
            <FieldDescription>
              Required for admins of this workspace.
            </FieldDescription>
          </div>
          <Switch name="two-factor" required>
            <SwitchThumb />
          </Switch>
        </div>
        <FieldError match="valueMissing">Turn this on to continue.</FieldError>
      </Field>
      <div data-slot="row">
        <button type="submit" data-variant="solid">
          Continue
        </button>
      </div>
    </form>
  )
}

export { Example }
