import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@ui-sdk/react/collapsible"
import { ChevronDownIcon } from "lucide-react"

function Example() {
  return (
    <Collapsible data-variant="card">
      <CollapsibleTrigger>
        <span data-slot="stack">
          <span>Ingredients</span>
          <span data-slot="hint">Morning buns, makes 12</span>
        </span>
        <ChevronDownIcon />
      </CollapsibleTrigger>
      <CollapsiblePanel hiddenUntilFound>
        <p>
          Flour, butter, brown sugar, eggs, a pinch of cardamom and sea salt.
        </p>
      </CollapsiblePanel>
    </Collapsible>
  )
}

export { Example }
