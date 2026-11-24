"use client"

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxTrigger,
} from "@ui-sdk/react/combobox"
import { ChevronDownIcon } from "lucide-react"
import * as React from "react"

const manyItems = Array.from({ length: 10_000 }, (_, index) => ({
  value: `item-${index + 1}`,
  label: `Item ${index + 1}`,
}))

function visibleRows(
  scrollTop: number,
  height: number,
  count: number,
  row: number
) {
  const start = Math.max(0, Math.floor(scrollTop / row) - 4)
  const end = Math.min(count, Math.ceil((scrollTop + height) / row) + 4)
  return { start, end }
}

function scrollForRow(
  index: number,
  scrollTop: number,
  height: number,
  row: number
) {
  const top = index * row
  if (top < scrollTop) {
    return top
  }
  if (top + row > scrollTop + height) {
    return top + row - height
  }
  return scrollTop
}

const row = 32
const height = 288

function Example() {
  const scroller = React.useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = React.useState(0)

  return (
    <Combobox
      items={manyItems}
      onHighlight={(value, { index }) => {
        const el = scroller.current
        if (el && index >= 0) {
          el.scrollTop = scrollForRow(index, el.scrollTop, el.clientHeight, row)
        }
      }}
    >
      <div data-slot="stack">
        <ComboboxLabel>Item</ComboboxLabel>
        <div data-slot="row">
          <ComboboxInput placeholder="Search 10,000 items…" />
          <ComboboxTrigger aria-label="Show items">
            <ChevronDownIcon aria-hidden="true" />
          </ComboboxTrigger>
        </div>
      </div>
      <ComboboxContent>
        <ComboboxEmpty>No items found.</ComboboxEmpty>
        <div
          ref={scroller}
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        >
          <ComboboxList>
            {(state) => {
              const items = state.items as { value: string; label: string }[]
              const { start, end } = visibleRows(
                scrollTop,
                height,
                items.length,
                row
              )
              return (
                <div style={{ height: items.length * row }}>
                  {items.slice(start, end).map((item, offset) => (
                    <ComboboxItem
                      key={item.value}
                      value={item.value}
                      label={item.label}
                      index={start + offset}
                      style={{ top: (start + offset) * row, height: row }}
                    >
                      {item.label}
                    </ComboboxItem>
                  ))}
                </div>
              )
            }}
          </ComboboxList>
        </div>
      </ComboboxContent>
    </Combobox>
  )
}

export { Example }
