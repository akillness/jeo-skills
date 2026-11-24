import * as React from "react"
import {
  Toast,
  ToastAction,
  ToastRegion,
  ToastTitle,
  createToaster,
} from "@ui-sdk/react/toast"
import { useLog } from "../../../shared/react/log"

function Example() {
  const log = useLog()
  const [toast] = React.useState(() => createToaster({ duration: 10000 }))
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
          toast("Message sent", {
            action: { label: "Undo", onAction: () => log("Message unsent") },
          })
        }
      >
        Send Message
      </button>
      <ToastRegion toaster={toast} shortcut="alt+t" aria-label="Alerts">
        {() => (
          <Toast>
            <ToastTitle />
            <ToastAction data-variant="solid" />
          </Toast>
        )}
      </ToastRegion>
    </>
  )
}

export { Example }
