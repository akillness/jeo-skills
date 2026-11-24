<script setup lang="ts">
import {
  Progress,
  ProgressIndicator,
  ProgressLabel,
  ProgressTrack,
  ProgressValue,
  type GaugeLabelDetails,
} from "@ui-sdk/vue/progress"

const valueLabel = (value: number | null, details: GaugeLabelDetails) =>
  `${value} of ${details.max} files, ${details.formatted}`
</script>

<template>
  <Progress :value="3" :max="12" :get-value-label="valueLabel">
    <ProgressLabel>Copying files</ProgressLabel>
    <ProgressValue>3 of 12</ProgressValue>
    <ProgressTrack>
      <ProgressIndicator />
    </ProgressTrack>
  </Progress>
</template>
