import "@ui-sdk/web/toast"
import { createToaster } from "@ui-sdk/web"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  const toast = createToaster()
  root.innerHTML = `
    <button>Create Event</button>
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
  root.querySelector("button")!.addEventListener("click", () =>
    toast("Event created", {
      description: "Friday, June 12 at 10:00 AM",
      action: { label: "Undo", onAction: () => log(root, "Event removed") },
    })
  )
  return () => {
    toast.dismiss()
  }
}

export { mount }
