import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@ui-sdk/solid/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/solid/select"
import { For } from "solid-js"
import { useLog } from "../../../shared/solid/log"

const methods = [
  { value: "standard", label: "Standard" },
  { value: "express", label: "Express" },
  { value: "overnight", label: "Overnight" },
]

function Example() {
  const log = useLog()

  return (
    <form
      data-slot="stack"
      onSubmit={(event) => {
        event.preventDefault()
        log(
          `Submitted shipping=${new FormData(event.currentTarget).get("shipping")}`
        )
      }}
    >
      <Field name="shipping">
        <FieldLabel>Shipping method</FieldLabel>
        <Select required placeholder="Select a shipping method">
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
            <For each={methods}>
              {(method) => (
                <SelectItem value={method.value}>
                  {method.label}
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
        <FieldDescription>
          Express arrives in two business days.
        </FieldDescription>
        <FieldError match="valueMissing">Choose a shipping method.</FieldError>
      </Field>
      <button type="submit" data-variant="solid">
        Continue
      </button>
    </form>
  )
}

export { Example }
