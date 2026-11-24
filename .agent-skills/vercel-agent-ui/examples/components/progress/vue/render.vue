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
  <Progress :value="18">
    <ProgressLabel>Battery</ProgressLabel>
    <ProgressValue v-slot="{ state }">
      {{ state.status === "complete" ? "Charged" : `${state.text} charged` }}
    </ProgressValue>
    <ProgressTrack>
      <template #render="{ props }">
        <span v-bind="props">
          <ProgressIndicator>
            <template #render="{ props, state }">
              <div
                v-bind="props"
                :data-variant="
                  (state.percent ?? 0) < 20 ? 'destructive' : undefined
                "
              />
            </template>
          </ProgressIndicator>
        </span>
      </template>
    </ProgressTrack>
  </Progress>
</template>
