import "@ui-sdk/web/toast"
import { createToaster } from "@ui-sdk/web"

const toast = createToaster()

export function mount(root: HTMLElement) {
  root.innerHTML = `
    <button>Show toast</button>
    <ui-toast-region>
      <template>
        <ui-toast>
          <div data-slot="stack">
            <ui-toast-title></ui-toast-title>
            <ui-toast-description></ui-toast-description>
          </div>
        </ui-toast>
      </template>
    </ui-toast-region>
  `
  Object.assign(root.querySelector("ui-toast-region")!, {
    toaster: toast,
  })
  root.querySelector("button")!.addEventListener("click", () =>
    toast({
      title: "Event has been created",
      description: "Monday, January 3rd at 6:00pm",
    })
  )
}
