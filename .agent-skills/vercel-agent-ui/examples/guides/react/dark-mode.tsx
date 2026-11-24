"use client"

import { Preferences, usePreference } from "@ui-sdk/react/preferences"
import {
  SegmentedControl,
  SegmentedControlIndicator,
  SegmentedControlItem,
} from "@ui-sdk/react/segmented-control"
import { colorScheme } from "../color-scheme"

function ColorSchemeSwitcher() {
  const { value } = usePreference(colorScheme)

  return (
    <SegmentedControl
      aria-label="Color scheme"
      value={value}
      onValueChange={(next) => next && colorScheme.set(next)}
    >
      <SegmentedControlIndicator />
      <SegmentedControlItem value="light">Light</SegmentedControlItem>
      <SegmentedControlItem value="dark">Dark</SegmentedControlItem>
      <SegmentedControlItem value="system">System</SegmentedControlItem>
    </SegmentedControl>
  )
}

function Example() {
  return (
    <Preferences preferences={[colorScheme]}>
      <div data-slot="appearance">
        <div data-slot="appearance-text">
          <p data-slot="appearance-title">Appearance</p>
          <p data-slot="appearance-description">
            Pick a color scheme, or follow your system.
          </p>
        </div>
        <ColorSchemeSwitcher />
      </div>
    </Preferences>
  )
}

export { Example }
