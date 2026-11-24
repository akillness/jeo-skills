import "@ui-sdk/web/toast"
import { createToaster } from "@ui-sdk/web"
import {
  CircleCheck,
  createElement,
  Info,
  LoaderCircle,
  OctagonX,
  TriangleAlert,
} from "lucide"

const upload = () => new Promise((resolve) => setTimeout(resolve, 2000))

function mount(root: HTMLElement) {
  const toast = createToaster()
  root.innerHTML = `
    <div data-slot="row">
      <button>Default</button>
      <button>Success</button>
      <button>Info</button>
      <button>Warning</button>
      <button>Error</button>
      <button>Loading</button>
    </div>
    <ui-toast-region>
      <template>
        <ui-toast>
          ${createElement(CircleCheck, { "data-show": "success", "aria-hidden": "true" }).outerHTML}
          ${createElement(Info, { "data-show": "info", "aria-hidden": "true" }).outerHTML}
          ${createElement(TriangleAlert, { "data-show": "warning", "aria-hidden": "true" }).outerHTML}
          ${createElement(OctagonX, { "data-show": "error", "aria-hidden": "true" }).outerHTML}
          ${createElement(LoaderCircle, { "data-show": "loading", "aria-hidden": "true" }).outerHTML}
          <ui-toast-title></ui-toast-title>
        </ui-toast>
      </template>
    </ui-toast-region>
  `
  root.querySelector("ui-toast-region")!.toaster = toast
  const [plain, success, info, warning, error, loading] =
    root.querySelectorAll("button")
  plain.addEventListener("click", () => toast("Event created"))
  success.addEventListener("click", () => toast.success("Changes saved"))
  info.addEventListener("click", () => toast.info("A new version is available"))
  warning.addEventListener("click", () =>
    toast.warning("Storage is almost full")
  )
  error.addEventListener("click", () => toast.error("Couldn't save changes"))
  loading.addEventListener("click", () =>
    toast.promise(upload, {
      loading: "Uploading photos…",
      success: "Photos uploaded",
      error: "Upload failed",
    })
  )
  return () => {
    toast.dismiss()
  }
}

export { mount }
