import { Checkbox, CheckboxIndicator } from "@ui-sdk/solid/checkbox"
import {
  Toast,
  ToastDescription,
  ToastRegion,
  ToastTitle,
  createToaster,
} from "@ui-sdk/solid/toast"
import { createSignal, onCleanup } from "solid-js"

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
  const toast = createToaster()
  const [expanded, setExpanded] = createSignal(false)
  let count = 0
  onCleanup(() => {
    toast.dismiss()
  })

  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <label data-slot="label">
          <Checkbox
            checked={expanded()}
            onCheckedChange={(next) => setExpanded(next === true)}
          >
            <CheckboxIndicator>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </CheckboxIndicator>
          </Checkbox>
          Always expanded
        </label>
      </div>
      <button
        onClick={() => toast(notifications[count++ % notifications.length])}
      >
        Add Toast
      </button>
      <ToastRegion toaster={toast} maxVisible={4} expanded={expanded()}>
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
