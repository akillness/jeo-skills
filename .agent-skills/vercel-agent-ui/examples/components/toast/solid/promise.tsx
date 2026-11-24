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
  let attempts = 0
  onCleanup(() => {
    toast.dismiss()
  })

  function save() {
    const succeeds = ++attempts % 2 === 1
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
