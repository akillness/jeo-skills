import * as React from "react"
import {
  Toast,
  ToastClose,
  ToastRegion,
  ToastTitle,
  createToaster,
} from "@ui-sdk/react/toast"

function Example() {
  const [toast] = React.useState(() => createToaster())
  React.useEffect(
    () => () => {
      toast.dismiss()
    },
    [toast]
  )

  return (
    <>
      <div data-slot="row">
        <button onClick={() => toast("Link copied", { duration: 1000 })}>
          1 Second
        </button>
        <button onClick={() => toast("Changes saved")}>5 Seconds</button>
        <button
          onClick={() =>
            toast("Your session expires in 5 minutes", {
              duration: Infinity,
              dismissible: false,
              cancel: { label: "Got It" },
            })
          }
        >
          Until Dismissed
        </button>
      </div>
      <ToastRegion toaster={toast}>
        {(item) => (
          <Toast>
            <ToastTitle />
            {item.cancel && (
              <ToastClose data-variant="solid" action={item.cancel.onCancel}>
                {item.cancel.label}
              </ToastClose>
            )}
          </Toast>
        )}
      </ToastRegion>
    </>
  )
}

export { Example }
