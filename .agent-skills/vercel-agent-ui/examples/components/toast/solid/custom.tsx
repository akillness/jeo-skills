import {
  Toast,
  ToastAction,
  ToastClose,
  ToastDescription,
  ToastRegion,
  ToastTitle,
  createToaster,
} from "@ui-sdk/solid/toast"
import { onCleanup } from "solid-js"
import { useLog } from "../../../shared/solid/log"

function Example() {
  const log = useLog()
  const toast = createToaster()
  onCleanup(() => {
    toast.dismiss()
  })

  return (
    <>
      <button
        onClick={() =>
          toast({
            title: "Hollis Grant",
            description: "Can you review the draft?",
            data: { initials: "HG" },
            action: {
              label: "Reply",
              onAction: () => log("Replying to Hollis Grant"),
            },
          })
        }
      >
        New Message
      </button>
      <ToastRegion toaster={toast} aria-label="Messages">
        {(item) => (
          <Toast
            render={(props, state) => (
              <li
                {...props}
                inert={
                  state.leaving ||
                  (!state.expanded && state.index > 0) ||
                  undefined
                }
              />
            )}
          >
            <span data-slot="media">
              {(item.data as { initials: string }).initials}
            </span>
            <div data-slot="stack">
              <ToastTitle />
              <ToastDescription />
            </div>
            <ToastAction data-variant="solid" />
            <ToastClose aria-label="Close">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </ToastClose>
          </Toast>
        )}
      </ToastRegion>
    </>
  )
}

export { Example }
