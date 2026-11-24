<script setup lang="ts">
import {
  Progress,
  ProgressIndicator,
  ProgressLabel,
  ProgressTrack,
} from "@ui-sdk/vue/progress"
</script>

<template>
  <Progress :value="null">
    <ProgressLabel>Connecting to server</ProgressLabel>
    <ProgressTrack>
      <ProgressIndicator />
    </ProgressTrack>
  </Progress>
</template>
