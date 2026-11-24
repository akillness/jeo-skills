import * as React from "react"
import {
  Toast,
  ToastAction,
  ToastDescription,
  ToastRegion,
  ToastTitle,
  createToaster,
} from "@ui-sdk/react/toast"
import { useLog } from "../../../shared/react/log"

function restore() {
  return new Promise((resolve) => setTimeout(resolve, 1500))
}

function Example() {
  const log = useLog()
  const [toast] = React.useState(() => createToaster({ duration: 6000 }))
  React.useEffect(
    () => () => {
      toast.dismiss()
    },
    [toast]
  )

  return (
    <>
      <button
        onClick={() =>
          toast("File deleted", {
            description: "Q3 report.pdf",
            action: {
              label: "Undo",
              onAction: async () => {
                await restore()
                log("Q3 report.pdf restored")
              },
            },
          })
        }
      >
        Delete File
      </button>
      <ToastRegion toaster={toast}>
        {() => (
          <Toast>
            <div data-slot="stack">
              <ToastTitle />
              <ToastDescription />
            </div>
            <ToastAction data-variant="solid">
              {(state) =>
                state.pending ? "Restoring…" : state.error ? "Retry" : "Undo"
              }
            </ToastAction>
          </Toast>
        )}
      </ToastRegion>
    </>
  )
}

export { Example }
