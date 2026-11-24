<script lang="ts">
  import type { ColorSchemeValue } from "@ui-sdk/core"
  import { Preferences, usePreference } from "@ui-sdk/svelte/preferences"
  import {
    SegmentedControl,
    SegmentedControlIndicator,
    SegmentedControlItem,
  } from "@ui-sdk/svelte/segmented-control"
  import { colorScheme } from "../color-scheme"

  const scheme = usePreference(colorScheme)
</script>

<Preferences preferences={[colorScheme]}>
  <div data-slot="appearance">
    <div data-slot="appearance-text">
      <p data-slot="appearance-title">Appearance</p>
      <p data-slot="appearance-description">
        Pick a color scheme, or follow your system.
      </p>
    </div>
    <SegmentedControl
      aria-label="Color scheme"
      value={scheme.current.value}
      onValueChange={(next) => colorScheme.set(next as ColorSchemeValue)}
    >
      <SegmentedControlIndicator />
      <SegmentedControlItem value="light">Light</SegmentedControlItem>
      <SegmentedControlItem value="dark">Dark</SegmentedControlItem>
      <SegmentedControlItem value="system">System</SegmentedControlItem>
    </SegmentedControl>
  </div>
</Preferences>
