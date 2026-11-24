import { createChange, definePrimitive, type ChangeDetails } from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"
import { useLog } from "../../shared/react/log"

type ConfirmButtonOptions = {
  onConfirm?: () => void
  onArmedChange?: (
    armed: boolean,
    details: ChangeDetails<"press" | "timeout">
  ) => void
  timeout?: number
}

type ConfirmButtonState = { armed: boolean }

const confirmButton = definePrimitive({
  name: "confirm-button",
  options: {
    onConfirm: "callback",
    onArmedChange: "callback",
    timeout: "number",
  },
  state: (_options: ConfirmButtonOptions): ConfirmButtonState => ({
    armed: false,
  }),
  api: (context) => {
    const { store, options, onDestroy } = context
    const change = createChange(context)
    let timer: ReturnType<typeof setTimeout> | undefined
    onDestroy(() => clearTimeout(timer))
    return {
      press(event?: Event) {
        clearTimeout(timer)
        if (store.get().armed) {
          change("armed", false, { reason: "press", event })
          options().onConfirm?.()
        } else if (change("armed", true, { reason: "press", event })) {
          timer = setTimeout(
            () => change("armed", false, { reason: "timeout" }),
            options().timeout ?? 3000
          )
        }
      },
    }
  },
  slots: (slot) => ({
    root: slot<{}, ConfirmButtonState>({
      state: (state) => ({ armed: state.armed }),
      attrs: (state) => ({
        type: "button",
        "data-armed": state.armed ? "" : undefined,
      }),
      press: ({ api }, event) => api.press(event),
    }),
  }),
})

const parts = createParts(confirmButton, { root: "button" })

const ConfirmButton = parts.Root

function Example() {
  const log = useLog()
  return (
    <ConfirmButton onConfirm={() => log("Deleted")}>
      {({ armed }) => (armed ? "Press Again to Delete" : "Delete")}
    </ConfirmButton>
  )
}

export {
  confirmButton,
  ConfirmButton,
  Example,
  type ConfirmButtonOptions,
  type ConfirmButtonState,
}
