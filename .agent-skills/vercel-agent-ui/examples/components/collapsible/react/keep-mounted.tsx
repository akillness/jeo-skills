import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@ui-sdk/react/collapsible"
import { Field, FieldLabel } from "@ui-sdk/react/field"
import { Textarea } from "@ui-sdk/react/textarea"
import { ChevronDownIcon } from "lucide-react"

function Example() {
  return (
    <Collapsible data-variant="card">
      <CollapsibleTrigger>
        <span data-slot="stack">
          <span>Add a delivery note</span>
          <span data-slot="hint">Optional, for the courier</span>
        </span>
        <ChevronDownIcon />
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
