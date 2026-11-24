import { Checkbox, CheckboxIndicator } from "@ui-sdk/solid/checkbox"
import { Field, FieldLabel } from "@ui-sdk/solid/field"
import { Input } from "@ui-sdk/solid/input"
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@ui-sdk/solid/popover"
import { createSignal } from "solid-js"
import { useLog } from "../../../shared/solid/log"

function Example() {
  const log = useLog()
  const [open, setOpen] = createSignal(false)
  let controls: HTMLDivElement | undefined

  return (
    <div data-slot="stack">
      <div data-slot="controls" ref={controls}>
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
      <Popover
        open={open()}
        onOpenChange={(next, details) => {
          const target = details.event?.target
          const inControls =
            target instanceof Node && controls?.contains(target)
          if (inControls && details.reason !== "escape-key") {
            return details.cancel()
          }
          setOpen(next)
          log(`${next ? "Opened" : "Closed"} (${details.reason})`)
        }}
      >
        <PopoverTrigger>Set Status</PopoverTrigger>
        <PopoverContent>
          <PopoverTitle>Set a status</PopoverTitle>
          <PopoverDescription>
            Your team sees it next to your name.
          </PopoverDescription>
          <Field>
            <FieldLabel>Status</FieldLabel>
            <Input defaultValue="In a meeting" />
          </Field>
          <div data-slot="row">
            <PopoverClose>Cancel</PopoverClose>
            <PopoverClose data-variant="solid">Save</PopoverClose>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

export { Example }
