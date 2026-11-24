import {
  NumberInput,
  NumberInputControl,
  NumberInputDecrement,
  NumberInputGroup,
  NumberInputIncrement,
} from "@ui-sdk/solid/number-input"
import { Toolbar, ToolbarInput, ToolbarSeparator } from "@ui-sdk/solid/toolbar"

function Example() {
  return (
    <Toolbar aria-label="Text">
      <NumberInput defaultValue={14} min={8} max={72}>
        <NumberInputGroup>
          <NumberInputDecrement aria-label="Decrease font size">
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
            </svg>
          </NumberInputDecrement>
          <ToolbarInput
            render={(props) => (
              <NumberInputControl {...props} aria-label="Font size" />
            )}
          />
          <NumberInputIncrement aria-label="Increase font size">
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
              <path d="M12 5v14" />
            </svg>
          </NumberInputIncrement>
        </NumberInputGroup>
      </NumberInput>
      <ToolbarSeparator />
      <ToolbarInput aria-label="Find" placeholder="Find…" />
    </Toolbar>
  )
}

export { Example }
