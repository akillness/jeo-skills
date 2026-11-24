import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxTrigger,
} from "@ui-sdk/solid/combobox"
import { createSignal, For } from "solid-js"

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
  let scroller: HTMLDivElement | undefined
  const [scrollTop, setScrollTop] = createSignal(0)

  return (
    <Combobox
      items={manyItems}
      onHighlight={(value, { index }) => {
        const el = scroller
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
              const items = () =>
                state.items as { value: string; label: string }[]
              const rows = () =>
                visibleRows(scrollTop(), height, items().length, row)
              return (
                <div style={{ height: `${items().length * row}px` }}>
                  <For each={items().slice(rows().start, rows().end)}>
                    {(item, offset) => (
                      <ComboboxItem
                        value={item.value}
                        label={item.label}
                        index={rows().start + offset()}
                        style={{
                          top: `${(rows().start + offset()) * row}px`,
                          height: `${row}px`,
                        }}
                      >
                        {item.label}
                      </ComboboxItem>
                    )}
                  </For>
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
