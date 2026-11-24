import "@ui-sdk/web/toast"
import { createToaster } from "@ui-sdk/web"
import { createElement, X } from "lucide"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  const toast = createToaster()
  root.innerHTML = `
    <button>New Message</button>
    <ui-toast-region aria-label="Messages">
      <template>
        <ui-toast>
          <span data-slot="media"></span>
          <div data-slot="stack">
            <ui-toast-title></ui-toast-title>
            <ui-toast-description></ui-toast-description>
          </div>
          <ui-toast-action><button data-variant="solid"></button></ui-toast-action>
          <ui-toast-close>
            <button aria-label="Close">${createElement(X, { "aria-hidden": "true" }).outerHTML}</button>
          </ui-toast-close>
        </ui-toast>
      </template>
    </ui-toast-region>
  `
  const region = root.querySelector("ui-toast-region")!
  region.toaster = toast
  region.renderToast = (item, el) => {
    el.querySelector("[data-slot='media']")!.textContent = (
      item.data as { initials: string }
    ).initials
  }
  root.querySelector("button")!.addEventListener("click", () =>
    toast({
      title: "Hollis Grant",
      description: "Can you review the draft?",
      data: { initials: "HG" },
      action: {
        label: "Reply",
        onAction: () => log(root, "Replying to Hollis Grant"),
      },
    })
  )
  return () => {
    toast.dismiss()
  }
}

export { mount }
