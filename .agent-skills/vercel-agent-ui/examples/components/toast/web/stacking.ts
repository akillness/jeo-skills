import "@ui-sdk/web/checkbox"
import "@ui-sdk/web/toast"
import { createToaster } from "@ui-sdk/web"
import { Check, createElement } from "lucide"

const notifications = [
  { title: "Event created", description: "Friday, June 12 at 10:00 AM" },
  { title: "Message sent" },
  {
    title: "Hollis Grant joined",
    description: "They can now edit the Launch plan and see its comments.",
  },
  { title: "Changes saved" },
  { title: "Invoice sent", description: "Inès Moreau · $240.00" },
  { title: "Photos uploaded", description: "12 photos added to Summer trip" },
]

function mount(root: HTMLElement) {
  const toast = createToaster()
  let count = 0
  root.innerHTML = `
    <div data-slot="stack">
      <div data-slot="controls">
        <label data-slot="label">
          <ui-checkbox>
            <ui-checkbox-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-checkbox-indicator>
          </ui-checkbox>
          Always expanded
        </label>
      </div>
      <button>Add Toast</button>
      <ui-toast-region max-visible="4">
        <template>
          <ui-toast>
            <div data-slot="stack">
              <ui-toast-title></ui-toast-title>
              <ui-toast-description></ui-toast-description>
            </div>
          </ui-toast>
        </template>
      </ui-toast-region>
    </div>
  `
  const region = root.querySelector("ui-toast-region")!
  region.toaster = toast
  root
    .querySelector("ui-checkbox")!
    .addEventListener("checkedchange", (event) => {
      region.expanded = event.detail.value === true
    })
  root
    .querySelector("button")!
    .addEventListener("click", () =>
      toast(notifications[count++ % notifications.length])
    )
  return () => {
    toast.dismiss()
  }
}

export { mount }
