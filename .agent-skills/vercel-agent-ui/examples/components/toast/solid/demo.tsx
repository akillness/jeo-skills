import {
  Toast,
  ToastAction,
  ToastDescription,
  ToastRegion,
  ToastTitle,
  createToaster,
} from "@ui-sdk/solid/toast"
import { onCleanup } from "solid-js"
import { useLog } from "../../../shared/solid/log"

function Example() {
  const log = useLog()
  const toast = createToaster()
  onCleanup(() => {
    toast.dismiss()
  })

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
