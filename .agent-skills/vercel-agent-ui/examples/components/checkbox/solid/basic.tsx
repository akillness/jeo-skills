import { Checkbox, CheckboxIndicator } from "@ui-sdk/solid/checkbox"

function Example() {
  return (
    <label data-slot="label">
      <Checkbox>
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
      Accept terms and conditions
    </label>
  )
}

export { Example }
