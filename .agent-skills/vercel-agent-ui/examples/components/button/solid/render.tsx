import { Button } from "@ui-sdk/solid/button"
import { useLog } from "../../../shared/solid/log"

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function Example() {
  const log = useLog()

  return (
    <div data-slot="stack">
      <Button
        onClick={async () => {
          await wait(1000)
          log("Couldn't save. Check your connection and try again.")
          throw new Error("Couldn't save")
        }}
        render={(props, state) => (
          <button {...props}>
            {state.pending
              ? "Saving…"
              : state.error
                ? "Try Again"
                : "Save Changes"}
          </button>
        )}
      />
    </div>
  )
}

export { Example }
