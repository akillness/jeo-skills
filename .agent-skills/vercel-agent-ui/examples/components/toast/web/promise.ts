import "@ui-sdk/web/toast"
import { createToaster } from "@ui-sdk/web"

function mount(root: HTMLElement) {
  const toast = createToaster()
  let attempts = 0

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

  root.innerHTML = `
    <button>Save Changes</button>
    <ui-toast-region>
      <template>
        <ui-toast>
          <div data-slot="stack">
            <ui-toast-title></ui-toast-title>
            <ui-toast-description></ui-toast-description>
          </div>
          <ui-toast-action><button data-variant="solid"></button></ui-toast-action>
        </ui-toast>
      </template>
    </ui-toast-region>
  `
  root.querySelector("ui-toast-region")!.toaster = toast
  root.querySelector("button")!.addEventListener("click", saveChanges)
  return () => {
    toast.dismiss()
  }
}

export { mount }
