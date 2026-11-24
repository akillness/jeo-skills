import "@ui-sdk/web/toast"
import { createToaster } from "@ui-sdk/web"
import { log } from "../../../shared/web/log"

const restore = () => new Promise((resolve) => setTimeout(resolve, 1500))

function mount(root: HTMLElement) {
  const toast = createToaster({ duration: 6000 })
  root.innerHTML = `
    <button>Delete File</button>
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
    toast("File deleted", {
      description: "Q3 report.pdf",
      action: {
        label: "Undo",
        onAction: async (event) => {
          const button = (event?.target as Element | undefined)?.closest(
            "button"
          )
          if (button) {
            button.textContent = "Restoring…"
          }
          try {
            await restore()
          } catch (error) {
            if (button) {
              button.textContent = "Retry"
            }
            throw error
          }
          log(root, "Q3 report.pdf restored")
        },
      },
    })
  )
  return () => {
    toast.dismiss()
  }
}

export { mount }
