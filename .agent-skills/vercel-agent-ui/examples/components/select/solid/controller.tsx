import { Field, FieldLabel } from "@ui-sdk/solid/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectTrigger,
  SelectValue,
  createSelectController,
} from "@ui-sdk/solid/select"
import { For } from "solid-js"
import { useLog } from "../../../shared/solid/log"

const statuses = [
  { value: "backlog", label: "Backlog" },
  { value: "todo", label: "Todo" },
  { value: "in-progress", label: "In Progress" },
  { value: "done", label: "Done" },
]

const status = createSelectController<string>()

function Example() {
  const log = useLog()

  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <button
          type="button"
          onClick={async () => {
            const { reason } = await status.open()
            log(`Closed by ${reason}, with ${status.getValue() ?? "nothing"}`)
          }}
        >
          Open and Wait
        </button>
        <button type="button" onClick={() => status.setValue("done")}>
          Mark Done
        </button>
        <button type="button" onClick={() => status.clear()}>
          Clear
        </button>
        <button type="button" onClick={() => status.focus()}>
          Focus
        </button>
      </div>
      <Field>
        <FieldLabel>Status</FieldLabel>
        <SelectTrigger controller={status}>
          <SelectValue />
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
        </SelectTrigger>
      </Field>
      <Select
        controller={status}
        items={statuses}
        placeholder="Select a status"
      >
        <SelectContent>
          <For each={statuses}>
            {(item) => (
              <SelectItem value={item.value}>
                {item.label}
                <SelectItemIndicator>
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
                </SelectItemIndicator>
              </SelectItem>
            )}
          </For>
        </SelectContent>
      </Select>
    </div>
  )
}

export { Example }
