import {
  createCheckboxController,
  type CheckedState,
} from "@ui-sdk/core/checkbox"
import { Checkbox, CheckboxIndicator } from "@ui-sdk/solid/checkbox"
import { createSignal } from "solid-js"
import { useLog } from "../../../shared/solid/log"

function Example() {
  const log = useLog()
  const updates = createCheckboxController()
  const [checked, setChecked] = createSignal<CheckedState>(false)

  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button" onClick={() => updates.toggle()}>
          Toggle
        </button>
      </div>
      <label data-slot="label">
        <Checkbox
          checked={checked()}
          onCheckedChange={(next, details) => {
            setChecked(next)
            log(
              `${next === "indeterminate" ? "Mixed" : next ? "Checked" : "Unchecked"} (${details.reason})`
            )
          }}
          controller={updates}
        >
          <CheckboxIndicator>
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
          </CheckboxIndicator>
        </Checkbox>
        Email me about product updates
      </label>
    </div>
  )
}

export { Example }
