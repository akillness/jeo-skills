"use client"

import {
  NumberInput,
  NumberInputControl,
  NumberInputDecrement,
  NumberInputGroup,
  NumberInputIncrement,
} from "@ui-sdk/react/number-input"
import { Toolbar, ToolbarInput, ToolbarSeparator } from "@ui-sdk/react/toolbar"
import { MinusIcon, PlusIcon } from "lucide-react"

function Example() {
  return (
    <Toolbar aria-label="Text">
      <NumberInput defaultValue={14} min={8} max={72}>
        <NumberInputGroup>
          <NumberInputDecrement aria-label="Decrease font size">
            <MinusIcon aria-hidden="true" />
          </NumberInputDecrement>
          <ToolbarInput
            render={<NumberInputControl aria-label="Font size" />}
          />
          <NumberInputIncrement aria-label="Increase font size">
            <PlusIcon aria-hidden="true" />
          </NumberInputIncrement>
        </NumberInputGroup>
      </NumberInput>
      <ToolbarSeparator />
      <ToolbarInput aria-label="Find" placeholder="Find…" />
    </Toolbar>
  )
}

export { Example }
