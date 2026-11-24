import * as React from "react"
import {
  Toast,
  ToastRegion,
  ToastTitle,
  createToaster,
} from "@ui-sdk/react/toast"
import {
  CircleCheckIcon,
  InfoIcon,
  LoaderCircleIcon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"

function upload() {
  return new Promise((resolve) => setTimeout(resolve, 2000))
}

function Example() {
  const [toast] = React.useState(() => createToaster())
  React.useEffect(
    () => () => {
      toast.dismiss()
    },
    [toast]
  )

  return (
    <>
      <div data-slot="row">
        <button onClick={() => toast("Event created")}>Default</button>
        <button onClick={() => toast.success("Changes saved")}>Success</button>
        <button onClick={() => toast.info("A new version is available")}>
          Info
        </button>
        <button onClick={() => toast.warning("Storage is almost full")}>
          Warning
        </button>
        <button onClick={() => toast.error("Couldn't save changes")}>
          Error
        </button>
        <button
          onClick={() =>
            toast.promise(upload, {
              loading: "Uploading photos…",
              success: "Photos uploaded",
              error: "Upload failed",
            })
          }
        >
          Loading
        </button>
      </div>
      <ToastRegion toaster={toast}>
        {() => (
          <Toast>
            <CircleCheckIcon data-show="success" aria-hidden="true" />
            <InfoIcon data-show="info" aria-hidden="true" />
            <TriangleAlertIcon data-show="warning" aria-hidden="true" />
            <OctagonXIcon data-show="error" aria-hidden="true" />
            <LoaderCircleIcon data-show="loading" aria-hidden="true" />
            <ToastTitle />
          </Toast>
        )}
      </ToastRegion>
    </>
  )
}

export { Example }
