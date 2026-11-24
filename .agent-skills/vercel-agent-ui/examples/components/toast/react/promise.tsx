import * as React from "react"
import {
  Toast,
  ToastAction,
  ToastDescription,
  ToastRegion,
  ToastTitle,
  createToaster,
} from "@ui-sdk/react/toast"

function Example() {
  const [toast] = React.useState(() => createToaster())
  const attempts = React.useRef(0)
  React.useEffect(
    () => () => {
      toast.dismiss()
    },
    [toast]
  )

  function save() {
    const succeeds = ++attempts.current % 2 === 1
    return new Promise<void>((resolve, reject) =>
      setTimeout(
        () => (succeeds ? resolve() : reject(new Error("Network error"))),
        1500
      )
    )
  }

  function saveChanges() {
    toast.promise(save, {
      loading: "Saving changes…",
      success: "Changes saved",
      error: {
        title: "Couldn't save changes",
        description: "Check your connection and try again.",
        action: { label: "Retry", onAction: saveChanges },
      },
    })
  }

  return (
    <>
      <button onClick={saveChanges}>Save Changes</button>
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
