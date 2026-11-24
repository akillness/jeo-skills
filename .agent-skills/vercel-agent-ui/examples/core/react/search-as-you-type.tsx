import * as React from "react"
import { isComposing } from "@ui-sdk/core"
import { Field, FieldControl, FieldLabel } from "@ui-sdk/react/field"
import { useLog } from "../../shared/react/log"

function Example() {
  const log = useLog()
  const [handled, setHandled] = React.useState(true)
  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <label data-slot="label">
          <input
            type="checkbox"
            checked={handled}
            onChange={(event) => setHandled(event.target.checked)}
          />
          Wait for the input method
        </label>
      </div>
      <Field>
        <FieldLabel>Search</FieldLabel>
        <FieldControl
          type="search"
          placeholder="Type a city…"
          onChange={(event) => {
            if (!handled || !isComposing(event)) {
              log(`Search “${event.target.value}”`)
            }
          }}
          onCompositionEnd={(event) =>
            handled && log(`Search “${event.currentTarget.value}”`)
          }
        />
      </Field>
    </div>
  )
}

export { Example }
