import {
  Toast,
  ToastAction,
  ToastClose,
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
          toast("Message archived", {
            action: { label: "Undo", onAction: () => log("Message restored") },
            cancel: { label: "Dismiss", onCancel: () => log("Kept archived") },
            onDismiss: ({ reason }) => log(`Closed (${reason})`),
          })
        }
      >
        Archive Message
      </button>
      <ToastRegion toaster={toast}>
        {(item) => (
          <Toast>
            <ToastTitle />
            {item.cancel && (
              <ToastClose action={item.cancel.onCancel}>
                {item.cancel.label}
              </ToastClose>
            )}
            <ToastAction data-variant="solid" />
          </Toast>
        )}
      </ToastRegion>
    </>
  )
}

export { Example }
