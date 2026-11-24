import {
  Command,
  CommandInput,
  CommandItem,
  CommandList,
} from "@ui-sdk/solid/command"
import { createSignal, For } from "solid-js"

const commands = Array.from({ length: 10_000 }, (_, index) => ({
  value: `command-${index + 1}`,
  label: `Command ${index + 1}`,
}))

const row = 32
const height = 256

function Example() {
  let scroller: HTMLDivElement | undefined
  const [scrollTop, setScrollTop] = createSignal(0)
  return (
    <Command
      items={commands}
      onValueChange={(value, { index }) => {
        const el = scroller
        if (!el || index < 0) {
          return
        }
        const top = index * row
        if (top < el.scrollTop) {
          el.scrollTop = top
        } else if (top + row > el.scrollTop + el.clientHeight) {
          el.scrollTop = top + row - el.clientHeight
        }
      }}
    >
      <CommandInput
        aria-label="Search 10,000 commands"
        placeholder="Search 10,000 commands…"
      />
      <div
        ref={scroller}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      >
        <CommandList>
          {(state) => {
            const start = Math.max(0, Math.floor(scrollTop() / row) - 4)
            const end = Math.min(
              state.items.length,
              Math.ceil((scrollTop() + height) / row) + 4
            )
            return (
              <div style={{ height: `${state.items.length * row}px` }}>
                <For each={(state.items as typeof commands).slice(start, end)}>
                  {(item, offset) => (
                    <CommandItem
                      value={item.value}
                      label={item.label}
                      index={start + offset()}
                      style={{ top: `${(start + offset()) * row}px` }}
                    >
                      {item.label}
                    </CommandItem>
                  )}
                </For>
              </div>
            )
          }}
        </CommandList>
      </div>
    </Command>
  )
}

export { Example }
