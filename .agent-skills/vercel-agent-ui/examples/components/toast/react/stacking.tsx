import * as React from "react"
import { Checkbox, CheckboxIndicator } from "@ui-sdk/react/checkbox"
import {
  Toast,
  ToastDescription,
  ToastRegion,
  ToastTitle,
  createToaster,
} from "@ui-sdk/react/toast"
import { CheckIcon } from "lucide-react"

const notifications = [
  { title: "Event created", description: "Friday, June 12 at 10:00 AM" },
  { title: "Message sent" },
  {
    title: "Hollis Grant joined",
    description: "They can now edit the Launch plan and see its comments.",
  },
  { title: "Changes saved" },
  { title: "Invoice sent", description: "Inès Moreau · $240.00" },
  { title: "Photos uploaded", description: "12 photos added to Summer trip" },
]

function Example() {
  const [toast] = React.useState(() => createToaster())
  const [expanded, setExpanded] = React.useState(false)
  const count = React.useRef(0)
  React.useEffect(
    () => () => {
      toast.dismiss()
    },
    [toast]
  )

  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <label data-slot="label">
          <Checkbox
            checked={expanded}
            onCheckedChange={(next) => setExpanded(next === true)}
          >
            <CheckboxIndicator>
              <CheckIcon aria-hidden="true" />
            </CheckboxIndicator>
          </Checkbox>
          Always expanded
        </label>
      </div>
      <button
        onClick={() =>
          toast(notifications[count.current++ % notifications.length])
        }
      >
        Add Toast
      </button>
      <ToastRegion toaster={toast} maxVisible={4} expanded={expanded}>
        {() => (
          <Toast>
            <div data-slot="stack">
              <ToastTitle />
              <ToastDescription />
            </div>
          </Toast>
        )}
      </ToastRegion>
    </div>
  )
}

export { Example }
