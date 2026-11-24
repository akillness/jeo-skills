import "@ui-sdk/web/toast"
import { createToaster } from "@ui-sdk/web"

function mount(root: HTMLElement) {
  const toast = createToaster()
  root.innerHTML = `
    <div data-slot="row">
      <button>1 Second</button>
      <button>5 Seconds</button>
      <button>Until Dismissed</button>
    </div>
    <ui-toast-region>
      <template>
        <ui-toast>
          <ui-toast-title></ui-toast-title>
          <ui-toast-close><button data-variant="solid"></button></ui-toast-close>
        </ui-toast>
      </template>
    </ui-toast-region>
  `
  root.querySelector("ui-toast-region")!.toaster = toast
  const [second, seconds, untilDismissed] = root.querySelectorAll("button")
  second.addEventListener("click", () =>
    toast("Link copied", { duration: 1000 })
  )
  seconds.addEventListener("click", () => toast("Changes saved"))
  untilDismissed.addEventListener("click", () =>
    toast("Your session expires in 5 minutes", {
      duration: Infinity,
      dismissible: false,
      cancel: { label: "Got It" },
    })
  )
  return () => {
    toast.dismiss()
  }
}

export { mount }
