import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@ui-sdk/solid/collapsible"
import { Field, FieldLabel } from "@ui-sdk/solid/field"
import { Textarea } from "@ui-sdk/solid/textarea"

function Example() {
  return (
    <Collapsible data-variant="card">
      <CollapsibleTrigger>
        <span data-slot="stack">
          <span>Add a delivery note</span>
          <span data-slot="hint">Optional, for the courier</span>
        </span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </CollapsibleTrigger>
      <CollapsiblePanel keepMounted>
        <Field>
          <FieldLabel>Delivery note</FieldLabel>
          <Textarea placeholder="Leave it with the front desk…" />
        </Field>
      </CollapsiblePanel>
    </Collapsible>
  )
}

export { Example }
