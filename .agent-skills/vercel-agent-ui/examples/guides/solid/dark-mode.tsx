import { Preferences, usePreference } from "@ui-sdk/solid/preferences"
import {
  SegmentedControl,
  SegmentedControlIndicator,
  SegmentedControlItem,
} from "@ui-sdk/solid/segmented-control"
import { colorScheme } from "../color-scheme"

function ColorSchemeSwitcher() {
  const scheme = usePreference(colorScheme)

  return (
    <SegmentedControl
      aria-label="Color scheme"
      value={scheme().value}
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
