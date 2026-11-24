<script setup lang="ts">
import type { ColorSchemeValue } from "@ui-sdk/core"
import { Preferences, usePreference } from "@ui-sdk/vue/preferences"
import {
  SegmentedControl,
  SegmentedControlIndicator,
  SegmentedControlItem,
} from "@ui-sdk/vue/segmented-control"
import { colorScheme } from "../color-scheme"

const scheme = usePreference(colorScheme)
const choose = (next: string | null) =>
  colorScheme.set(next as ColorSchemeValue)
</script>

<template>
  <Preferences :preferences="[colorScheme]">
    <div data-slot="appearance">
      <div data-slot="appearance-text">
        <p data-slot="appearance-title">Appearance</p>
        <p data-slot="appearance-description">
          Pick a color scheme, or follow your system.
        </p>
      </div>
      <SegmentedControl
        aria-label="Color scheme"
        :value="scheme.value"
        @value-change="choose"
      >
        <SegmentedControlIndicator />
        <SegmentedControlItem value="light">Light</SegmentedControlItem>
        <SegmentedControlItem value="dark">Dark</SegmentedControlItem>
        <SegmentedControlItem value="system">System</SegmentedControlItem>
      </SegmentedControl>
    </div>
  </Preferences>
</template>
