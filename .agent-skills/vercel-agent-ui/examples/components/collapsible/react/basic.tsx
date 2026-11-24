"use client"

import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@ui-sdk/react/collapsible"
import { ChevronDownIcon } from "lucide-react"

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
        <ChevronDownIcon />
      </CollapsibleTrigger>
      <CollapsiblePanel>
        {items.map((item) => (
          <div data-slot="row" key={item.name}>
            <span>{item.name}</span>
            <span>{item.price}</span>
          </div>
        ))}
      </CollapsiblePanel>
    </Collapsible>
  )
}

export { Example }
