import "@ui-sdk/web/toast"
import { createToaster } from "@ui-sdk/web"
import { CircleCheck, createElement, LoaderCircle } from "lucide"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  const toast = createToaster()
  let timer: ReturnType<typeof setInterval> | undefined

  function upload() {
    clearInterval(timer)
    const id = toast.loading("Uploading report.pdf… 0%", { id: "upload" })
    let progress = 0
    timer = setInterval(() => {
      progress += 20
      const done = progress >= 100
      const open = toast.update(
        id,
        done
          ? { title: "Report uploaded", type: "success" }
          : { title: `Uploading report.pdf… ${progress}%` }
      )
      if (!open) {
        log(root, "Upload canceled")
      }
      if (done || !open) {
        clearInterval(timer)
      }
    }, 700)
  }

  root.innerHTML = `
    <div data-slot="row">
      <button>Upload Report</button>
      <button>Cancel Upload</button>
      <button>Dismiss All</button>
    </div>
    <ui-toast-region>
      <template>
        <ui-toast>
          ${createElement(CircleCheck, { "data-show": "success", "aria-hidden": "true" }).outerHTML}
          ${createElement(LoaderCircle, { "data-show": "loading", "aria-hidden": "true" }).outerHTML}
          <ui-toast-title></ui-toast-title>
        </ui-toast>
      </template>
    </ui-toast-region>
  `
  root.querySelector("ui-toast-region")!.toaster = toast
  const [start, cancel, dismissAll] = root.querySelectorAll("button")
  start.addEventListener("click", upload)
  cancel.addEventListener("click", () => toast.dismiss("upload"))
  dismissAll.addEventListener("click", () => toast.dismiss())
  return () => {
    clearInterval(timer)
    toast.dismiss()
  }
}

export { mount }
