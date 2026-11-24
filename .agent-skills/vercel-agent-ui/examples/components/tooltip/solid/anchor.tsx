import { Field, FieldLabel } from "@ui-sdk/solid/field"
import { Input } from "@ui-sdk/solid/input"
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui-sdk/solid/tooltip"
import { createSignal } from "solid-js"

function Example() {
  const [field, setField] = createSignal<HTMLDivElement | null>(null)

  return (
    <Field>
      <FieldLabel>Webhook URL</FieldLabel>
      <div data-slot="row" ref={setField}>
        <Input placeholder="https://" />
        <Tooltip>
          <TooltipTrigger aria-label="About webhooks">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
          </TooltipTrigger>
          <TooltipContent anchor={field()} side="bottom" align="start">
            We send a POST request here for every new order.
          </TooltipContent>
        </Tooltip>
      </div>
    </Field>
  )
}

export { Example }
