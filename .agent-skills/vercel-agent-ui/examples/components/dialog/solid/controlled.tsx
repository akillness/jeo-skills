import { Checkbox, CheckboxIndicator } from "@ui-sdk/solid/checkbox"
import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@ui-sdk/solid/dialog"
import { createSignal, For } from "solid-js"
import { useLog } from "../../../shared/solid/log"

const topics = [
  { label: "Product updates", checked: true },
  { label: "Security alerts", checked: true },
  { label: "Weekly digest", checked: false },
]

function Example() {
  const log = useLog()
  const [open, setOpen] = createSignal(false)
  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <label data-slot="label">
          <Checkbox
            checked={open()}
            onCheckedChange={(next) => setOpen(next === true)}
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
          Open
        </label>
      </div>
      <Dialog
        open={open()}
        onOpenChange={(next, details) => {
          setOpen(next)
          log(`${next ? "Opened" : "Closed"} (${details.reason})`)
        }}
        onOpenChangeComplete={(next) =>
          log(next ? "Finished opening" : "Finished closing")
        }
      >
        <DialogTrigger>Notification Settings</DialogTrigger>
        <DialogBackdrop />
        <DialogContent>
          <div data-slot="stack">
            <DialogTitle>Notification settings</DialogTitle>
            <DialogDescription>
              Choose what we email you about.
            </DialogDescription>
          </div>
          <div data-slot="stack">
            <For each={topics}>
              {(topic) => (
                <label data-slot="label">
                  <Checkbox defaultChecked={topic.checked}>
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
                  {topic.label}
                </label>
              )}
            </For>
          </div>
          <div data-slot="row">
            <DialogClose data-variant="solid">Done</DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export { Example }
