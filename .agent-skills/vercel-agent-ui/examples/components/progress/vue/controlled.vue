<script setup lang="ts">
import {
  Progress,
  ProgressIndicator,
  ProgressLabel,
  ProgressTrack,
  ProgressValue,
} from "@ui-sdk/vue/progress"
import { ref } from "vue"
import { useLog } from "../../../shared/vue/log"

const total = 5

const log = useLog()
const uploaded = ref(1)

function uploadNext() {
  if (uploaded.value >= total) {
    return
  }
  uploaded.value++
  log(`Uploaded ${uploaded.value} of ${total} photos`)
}

function reset() {
  uploaded.value = 0
  log("Reset to 0 photos")
}
</script>

<template>
  <div data-slot="stack">
    <div data-slot="controls">
      <button
        type="button"
        :aria-disabled="uploaded >= total"
        @click="uploadNext"
      >
        Upload Next
      </button>
      <button type="button" @click="reset">Reset</button>
    </div>
    <Progress :value="(uploaded / total) * 100">
      <ProgressLabel>Uploading photos</ProgressLabel>
      <ProgressValue />
      <ProgressTrack>
        <ProgressIndicator />
      </ProgressTrack>
    </Progress>
  </div>
</template>
