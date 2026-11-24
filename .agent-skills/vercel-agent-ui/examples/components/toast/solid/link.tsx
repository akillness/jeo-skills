import {
  Toast,
  ToastAction,
  ToastDescription,
  ToastRegion,
  ToastTitle,
  createToaster,
} from "@ui-sdk/solid/toast"
import { onCleanup } from "solid-js"

function Example() {
  const toast = createToaster()
  onCleanup(() => {
    toast.dismiss()
  })

  return (
    <>
      <button
        onClick={() =>
          toast("Invoice sent", {
            description: "Hollis Grant · $240.00",
            action: { label: "View", href: "#" },
          })
        }
      >
        Send Invoice
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
