import { Checkbox, CheckboxIndicator } from "@ui-sdk/solid/checkbox"
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui-sdk/solid/tooltip"
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
      <Tooltip
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
        <TooltipTrigger>Export</TooltipTrigger>
        <TooltipContent>Download as CSV</TooltipContent>
      </Tooltip>
    </div>
  )
}

export { Example }
