import "@ui-sdk/web/toast"
import { createToaster } from "@ui-sdk/web"

function mount(root: HTMLElement) {
  const toast = createToaster()
  root.innerHTML = `
    <button>Send Invoice</button>
    <ui-toast-region>
      <template>
        <ui-toast>
          <div data-slot="stack">
            <ui-toast-title></ui-toast-title>
            <ui-toast-description></ui-toast-description>
          </div>
          <ui-toast-action><a data-variant="solid"></a></ui-toast-action>
        </ui-toast>
      </template>
    </ui-toast-region>
  `
  const region = root.querySelector("ui-toast-region")!
  region.toaster = toast
  region.renderToast = (item, el) => {
    if (item.action?.href) {
      el.querySelector("a")!.href = item.action.href
    }
  }
  root.querySelector("button")!.addEventListener("click", () =>
    toast("Invoice sent", {
      description: "Hollis Grant · $240.00",
      action: { label: "View", href: "#" },
    })
  )
  return () => {
    toast.dismiss()
  }
}

export { mount }
