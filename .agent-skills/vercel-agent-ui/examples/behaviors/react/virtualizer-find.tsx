"use client"

import * as React from "react"
import { createVirtualizer } from "@ui-sdk/core"

const customers = [
  "Acme",
  "Globex",
  "Initech",
  "Umbrella",
  "Hooli",
  "Stark",
  "Wayne",
  "Tyrell",
]

const invoices = Array.from({ length: 10_000 }, (_, index) => ({
  id: `INV-${String(index + 1).padStart(5, "0")}`,
  customer: customers[index % customers.length],
}))

const virtual = createVirtualizer({
  count: () => invoices.length,
  estimate: () => 36,
  findable: (index) => [invoices[index].id, invoices[index].customer],
})

function Example() {
  const items = React.useSyncExternalStore(
    virtual.subscribe,
    virtual.items,
    virtual.items
  )
  const scroller = React.useRef<HTMLDivElement>(null)
  React.useEffect(
    () => virtual.connect(scroller.current!, { findable: true }),
    []
  )

  return (
    <div
      ref={scroller}
      role="list"
      aria-label="Invoices"
      data-slot="virtualizer-scroller"
    >
      <div data-slot="virtualizer-body" style={{ height: virtual.size() }}>
        {items.map((item) => (
          <div
            key={item.key}
            ref={(el) => virtual.measure(item.index, el)}
            role="listitem"
            aria-setsize={invoices.length}
            aria-posinset={item.index + 1}
            data-slot="virtualizer-row"
            style={{ transform: `translateY(${item.start}px)` }}
          >
            <span
              ref={(el) => virtual.findableText(item.index, el, 0)}
              data-slot="virtualizer-id"
            />{" "}
            <span
              ref={(el) => virtual.findableText(item.index, el, 1)}
              data-slot="hint"
            />
          </div>
        ))}
      </div>
    </div>
  )
}

export { Example }
