import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@ui-sdk/solid/collapsible"
import { For } from "solid-js"

const items = [
  { name: "Linen shirt", price: "$48.00" },
  { name: "Canvas tote", price: "$18.00" },
  { name: "Wool socks", price: "$18.00" },
]

function Example() {
  return (
    <Collapsible data-variant="card">
      <CollapsibleTrigger>
        <span data-slot="stack">
          <span>Order #4189</span>
          <span data-slot="hint">3 items, $84.00</span>
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
      <CollapsiblePanel>
        <For each={items}>
          {(item) => (
            <div data-slot="row">
              <span>{item.name}</span>
              <span>{item.price}</span>
            </div>
          )}
        </For>
      </CollapsiblePanel>
    </Collapsible>
  )
}

export { Example }
