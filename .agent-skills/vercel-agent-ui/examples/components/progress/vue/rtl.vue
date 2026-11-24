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
  <div dir="rtl">
    <Progress :value="56" locale="ar-EG">
      <ProgressLabel>تقدم الرفع</ProgressLabel>
      <ProgressValue />
      <ProgressTrack>
        <ProgressIndicator />
      </ProgressTrack>
    </Progress>
  </div>
</template>
