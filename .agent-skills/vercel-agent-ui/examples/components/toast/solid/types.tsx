import {
  Toast,
  ToastRegion,
  ToastTitle,
  createToaster,
} from "@ui-sdk/solid/toast"
import { onCleanup } from "solid-js"

function upload() {
  return new Promise((resolve) => setTimeout(resolve, 2000))
}

function Example() {
  const toast = createToaster()
  onCleanup(() => {
    toast.dismiss()
  })

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
              data-show="info"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              data-show="warning"
              aria-hidden="true"
            >
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
            </svg>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              data-show="error"
              aria-hidden="true"
            >
              <path d="m15 9-6 6" />
              <path d="M2.586 16.726A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2h6.624a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586z" />
              <path d="m9 9 6 6" />
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
