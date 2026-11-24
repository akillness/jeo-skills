<script setup lang="ts">
import {
  Progress,
  ProgressIndicator,
  ProgressLabel,
  ProgressTrack,
  ProgressValue,
} from "@ui-sdk/vue/progress"
</script>

<template>
  <Progress :value="60">
    <ProgressLabel>Exporting video</ProgressLabel>
    <ProgressValue />
    <ProgressTrack>
      <ProgressIndicator />
    </ProgressTrack>
  </Progress>
</template>
