import * as React from "react"
import {
  Toast,
  ToastRegion,
  ToastTitle,
  createToaster,
} from "@ui-sdk/react/toast"
import { CircleCheckIcon, LoaderCircleIcon } from "lucide-react"
import { useLog } from "../../../shared/react/log"

function Example() {
  const log = useLog()
  const [toast] = React.useState(() => createToaster())
  const timer = React.useRef<ReturnType<typeof setInterval> | undefined>(
    undefined
  )
  React.useEffect(
    () => () => {
      clearInterval(timer.current)
      toast.dismiss()
    },
    [toast]
  )

  function upload() {
    clearInterval(timer.current)
    const id = toast.loading("Uploading report.pdf… 0%", { id: "upload" })
    let progress = 0
    timer.current = setInterval(() => {
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
        clearInterval(timer.current)
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
            <CircleCheckIcon data-show="success" aria-hidden="true" />
            <LoaderCircleIcon data-show="loading" aria-hidden="true" />
            <ToastTitle />
          </Toast>
        )}
      </ToastRegion>
    </>
  )
}

export { Example }
