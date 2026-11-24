"use client"

import { Field, FieldLabel } from "@ui-sdk/react/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectList,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/react/select"
import * as React from "react"
import { ChevronDownIcon } from "lucide-react"

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
    <Field>
      <FieldLabel>Item</FieldLabel>
      <Select
        items={manyItems}
        placeholder="Select an item"
        onHighlight={(value, { index }) => {
          const el = scroller.current
          if (el && index >= 0) {
            el.scrollTop = scrollForRow(
              index,
              el.scrollTop,
              el.clientHeight,
              row
            )
          }
        }}
      >
        <SelectTrigger>
          <SelectValue />
          <ChevronDownIcon />
        </SelectTrigger>
        <SelectContent>
          <div
            ref={scroller}
            style={{ height }}
            onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
          >
            <SelectList>
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
                      <SelectItem
                        key={item.value}
                        value={item.value}
                        label={item.label}
                        index={start + offset}
                        style={{ top: (start + offset) * row, height: row }}
                      >
                        {item.label}
                      </SelectItem>
                    ))}
                  </div>
                )
              }}
            </SelectList>
          </div>
        </SelectContent>
      </Select>
    </Field>
  )
}

export { Example }
