import {
  Listbox,
  ListboxItem,
  ListboxItemIndicator,
} from "@ui-sdk/solid/listbox"
import { For } from "solid-js"
import { useLog } from "../../../shared/solid/log"

const timezones = Array.from({ length: 27 }, (_, index) => {
  const offset = index - 12
  const label = `UTC${offset < 0 ? "−" : "+"}${String(Math.abs(offset)).padStart(2, "0")}:00`
  return { value: `utc${offset}`, label }
})

function Example() {
  const log = useLog()

  return (
    <Listbox
      defaultValue="utc9"
      onHighlight={(value, details) =>
        value &&
        log(
          `Focused ${timezones[details.index].label} (${details.index + 1} of ${timezones.length})`
        )
      }
      aria-label="Time zone"
    >
      <For each={timezones}>
        {(zone, index) => (
          <ListboxItem value={zone.value} index={index()}>
            {zone.label}
            <ListboxItemIndicator>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </ListboxItemIndicator>
          </ListboxItem>
        )}
      </For>
    </Listbox>
  )
}

export { Example }
