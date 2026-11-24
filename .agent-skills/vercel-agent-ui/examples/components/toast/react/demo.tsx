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

function Example() {
  const log = useLog()
  const [toast] = React.useState(() => createToaster())
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
          toast("Event created", {
            description: "Friday, June 12 at 10:00 AM",
            action: { label: "Undo", onAction: () => log("Event removed") },
          })
        }
      >
        Create Event
      </button>
      <ToastRegion toaster={toast}>
        {() => (
          <Toast>
            <div data-slot="stack">
              <ToastTitle />
              <ToastDescription />
            </div>
            <ToastAction data-variant="solid" />
          </Toast>
        )}
      </ToastRegion>
    </>
  )
}

export { Example }
