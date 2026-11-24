import { Field, FieldLabel } from "@ui-sdk/solid/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/solid/select"
import { createSignal, For } from "solid-js"
import { useLog } from "../../../shared/solid/log"

const statuses = [
  { value: "backlog", label: "Backlog" },
  { value: "todo", label: "Todo" },
  { value: "in-progress", label: "In Progress" },
  { value: "done", label: "Done" },
]

const modes = [
  { value: "pointer", label: "Pointer" },
  { value: true, label: "Modal" },
  { value: false, label: "Non-modal" },
] as const

function Example() {
  const [modal, setModal] = createSignal<boolean | "pointer">("pointer")
  const log = useLog()

  return (
    <div data-slot="stack">
      <div data-slot="controls" role="group" aria-label="Modal">
        <For each={modes}>
          {(mode) => (
            <button
              type="button"
              aria-pressed={modal() === mode.value ? "true" : "false"}
              onClick={() => setModal(mode.value)}
            >
              {mode.label}
            </button>
          )}
        </For>
      </div>
      <Field>
        <FieldLabel>Status</FieldLabel>
        <Select modal={modal()} defaultValue="todo">
          <SelectTrigger>
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
          <SelectContent>
            <For each={statuses}>
              {(status) => (
                <SelectItem value={status.value}>
                  {status.label}
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
      </Field>
      <button type="button" onClick={() => log("Pressed Save Draft")}>
        Save Draft
      </button>
    </div>
  )
}

export { Example }
