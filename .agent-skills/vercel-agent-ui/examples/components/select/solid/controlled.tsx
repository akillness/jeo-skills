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

const roles = [
  { value: "viewer", label: "Viewer" },
  { value: "commenter", label: "Commenter" },
  { value: "editor", label: "Editor" },
  { value: "admin", label: "Admin" },
  { value: "owner", label: "Owner" },
]

function Example() {
  const [value, setValue] = createSignal<string | null>("viewer")
  const [open, setOpen] = createSignal(false)
  const log = useLog()

  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button" onClick={() => setValue("editor")}>
          Make Editor
        </button>
        <button type="button" onClick={() => setOpen(true)}>
          Open
        </button>
      </div>
      <Field>
        <FieldLabel>Role</FieldLabel>
        <Select
          value={value()}
          onValueChange={(next, details) => {
            if (next === "owner") {
              details.cancel()
              log("Only the owner can transfer ownership")
              return
            }
            setValue(next)
            log(`value: ${next} (${details.reason})`)
          }}
          open={open()}
          onOpenChange={(next, details) => {
            setOpen(next)
            log(`open: ${next} (${details.reason})`)
          }}
        >
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
            <For each={roles}>
              {(role) => (
                <SelectItem value={role.value}>
                  {role.label}
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
    </div>
  )
}

export { Example }
