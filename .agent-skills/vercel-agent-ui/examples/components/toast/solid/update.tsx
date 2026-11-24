import {
  Toast,
  ToastRegion,
  ToastTitle,
  createToaster,
} from "@ui-sdk/solid/toast"
import { onCleanup } from "solid-js"
import { useLog } from "../../../shared/solid/log"

function Example() {
  const log = useLog()
  const toast = createToaster()
  let timer: ReturnType<typeof setInterval> | undefined
  onCleanup(() => {
    clearInterval(timer)
    toast.dismiss()
  })

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
        log("Upload canceled")
      }
      if (done || !open) {
        clearInterval(timer)
      }
    }, 700)
  }

  return (
    <>
      <div data-slot="row">
        <button onClick={upload}>Upload Report</button>
        <button onClick={() => toast.dismiss("upload")}>Cancel Upload</button>
        <button onClick={() => toast.dismiss()}>Dismiss All</button>
      </div>
      <ToastRegion toaster={toast}>
        {() => (
          <Toast>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              data-show="success"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="m16 9-5.5 5.5L8 12" />
            </svg>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              data-show="loading"
              aria-hidden="true"
            >
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            <ToastTitle />
          </Toast>
        )}
      </ToastRegion>
    </>
  )
}

export { Example }
