import "@ui-sdk/web/toast"
import { createToaster } from "@ui-sdk/web"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  const toast = createToaster({ duration: 10000 })
  root.innerHTML = `
    <button>Send Message</button>
    <ui-toast-region shortcut="alt+t" aria-label="Alerts">
      <template>
        <ui-toast>
          <ui-toast-title></ui-toast-title>
          <ui-toast-action><button data-variant="solid"></button></ui-toast-action>
        </ui-toast>
      </template>
    </ui-toast-region>
  `
  root.querySelector("ui-toast-region")!.toaster = toast
  root.querySelector("button")!.addEventListener("click", () =>
    toast("Message sent", {
      action: { label: "Undo", onAction: () => log(root, "Message unsent") },
    })
  )
  return () => {
    toast.dismiss()
  }
}

export { mount }
