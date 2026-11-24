import * as React from "react"
import {
  Toast,
  ToastAction,
  ToastClose,
  ToastDescription,
  ToastRegion,
  ToastTitle,
  createToaster,
} from "@ui-sdk/react/toast"
import { XIcon } from "lucide-react"
import { useLog } from "../../../shared/react/log"

function Example() {
  const log = useLog()
  const [toast] = React.useState(() => createToaster())
  React.useEffect(
    () => () => {
      toast.dismiss()
    },
    [toast]
  )

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
              <XIcon aria-hidden="true" />
            </ToastClose>
          </Toast>
        )}
      </ToastRegion>
    </>
  )
}

export { Example }
