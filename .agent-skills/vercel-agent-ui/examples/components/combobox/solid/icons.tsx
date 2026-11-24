import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIcon,
  ComboboxItemIndicator,
  ComboboxItemText,
  ComboboxLabel,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValueIcon,
} from "@ui-sdk/solid/combobox"
import { createSignal } from "solid-js"

function Example() {
  const [field, setField] = createSignal<HTMLDivElement | null>(null)

  return (
    <Combobox>
      <div data-slot="stack">
        <ComboboxLabel>Status</ComboboxLabel>
        <div ref={setField} data-slot="row">
          <ComboboxValueIcon />
          <ComboboxInput placeholder="Select a status" />
          <ComboboxTrigger aria-label="Show statuses">
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
      <ComboboxContent anchor={field()}>
        <ComboboxEmpty>No statuses found.</ComboboxEmpty>
        <ComboboxList>
          <ComboboxItem value="backlog" label="Backlog">
            <ComboboxItemIcon>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
              </svg>
            </ComboboxItemIcon>
            <ComboboxItemText />
            <ComboboxItemIndicator>
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
            </ComboboxItemIndicator>
          </ComboboxItem>
          <ComboboxItem value="in-progress" label="In progress">
            <ComboboxItemIcon mirror>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </ComboboxItemIcon>
            <ComboboxItemText />
            <ComboboxItemIndicator>
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
            </ComboboxItemIndicator>
          </ComboboxItem>
          <ComboboxItem value="done" label="Done">
            <ComboboxItemIcon>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="m16 9-5.5 5.5L8 12" />
              </svg>
            </ComboboxItemIcon>
            <ComboboxItemText />
            <ComboboxItemIndicator>
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
            </ComboboxItemIndicator>
          </ComboboxItem>
          <ComboboxItem value="canceled" label="Canceled">
            <ComboboxItemIcon>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="m15 9-6 6" />
                <path d="m9 9 6 6" />
              </svg>
            </ComboboxItemIcon>
            <ComboboxItemText />
            <ComboboxItemIndicator>
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
            </ComboboxItemIndicator>
          </ComboboxItem>
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

export { Example }
