import {
  Toast,
  ToastAction,
  ToastRegion,
  ToastTitle,
  createToaster,
} from "@ui-sdk/solid/toast"
import { onCleanup } from "solid-js"
import { useLog } from "../../../shared/solid/log"

function Example() {
  const log = useLog()
  const toast = createToaster({ duration: 10000 })
  onCleanup(() => {
    toast.dismiss()
  })

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
