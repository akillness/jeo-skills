import * as React from "react"
import { useLog } from "../../shared/react/log"
import { ConfirmButton } from "./confirm-button"

function Example() {
  const log = useLog()
  const [locked, setLocked] = React.useState(false)
  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <label data-slot="label">
          <input
            type="checkbox"
            checked={locked}
            onChange={(event) => setLocked(event.target.checked)}
          />
          Lock
        </label>
      </div>
      <ConfirmButton
        timeout={2000}
        onArmedChange={(armed, details) => {
          if (locked) {
            details.cancel()
          }
          log(
            `${armed ? "Arm" : "Disarm"}: ${details.reason}, from ${details.source}${details.canceled ? ", canceled" : ""}`
          )
        }}
      >
        {({ armed }) => (armed ? "Press Again to Delete" : "Delete")}
      </ConfirmButton>
    </div>
  )
}

export { Example }
