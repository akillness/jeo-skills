import "@ui-sdk/web/toast"
import { createToaster } from "@ui-sdk/web"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  const toast = createToaster()
  root.innerHTML = `
    <button>Archive Message</button>
    <ui-toast-region>
      <template>
        <ui-toast>
          <ui-toast-title></ui-toast-title>
          <ui-toast-close><button></button></ui-toast-close>
          <ui-toast-action><button data-variant="solid"></button></ui-toast-action>
        </ui-toast>
      </template>
    </ui-toast-region>
  `
  root.querySelector("ui-toast-region")!.toaster = toast
  root.querySelector("button")!.addEventListener("click", () =>
    toast("Message archived", {
      action: { label: "Undo", onAction: () => log(root, "Message restored") },
      cancel: { label: "Dismiss", onCancel: () => log(root, "Kept archived") },
      onDismiss: ({ reason }) => log(root, `Closed (${reason})`),
    })
  )
  return () => {
    toast.dismiss()
  }
}

export { mount }
