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
  <Progress :value="3" :min="1" :max="5">
    <ProgressLabel>Account setup, step 3 of 5</ProgressLabel>
    <ProgressValue />
    <ProgressTrack>
      <ProgressIndicator />
    </ProgressTrack>
  </Progress>
</template>
