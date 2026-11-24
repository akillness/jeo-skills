import * as React from "react"
import { bindHold } from "@ui-sdk/core"
import { useLog } from "../../shared/react/log"

export function Example() {
  const button = React.useRef<HTMLButtonElement>(null)
  const hint = React.useId()
  const [deleted, setDeleted] = React.useState(false)
  const log = useLog()

  React.useEffect(() => {
    if (deleted) {
      return
    }
    return bindHold(button.current!, {
      delay: 1500,
      onHold: () => setDeleted(true),
      onEnd: ({ held, canceled }) => {
        if (!held) {
          log(canceled ? "Canceled" : "Released before it filled")
        }
      },
    })
  }, [deleted, log])

  if (deleted) {
    return (
      <div data-slot="row">
        <span>Launch site deleted.</span>
        <button
          type="button"
          data-variant="ghost"
          onClick={() => setDeleted(false)}
        >
          Restore
        </button>
      </div>
    )
  }

  return (
    <div data-slot="stack">
      <button
        ref={button}
        type="button"
        data-slot="hold-button"
        data-variant="destructive"
        aria-describedby={hint}
      >
        <span data-slot="hold-fill" aria-hidden />
        Delete Project
      </button>
      <span id={hint} data-slot="hint">
        Press and hold to delete
      </span>
    </div>
  )
}
