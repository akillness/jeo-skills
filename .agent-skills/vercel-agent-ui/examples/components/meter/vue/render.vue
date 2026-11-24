<script setup lang="ts">
import {
  Meter,
  MeterIndicator,
  MeterLabel,
  MeterTrack,
  MeterValue,
} from "@ui-sdk/vue/meter"
</script>

<template>
  <Meter :value="91">
    <MeterLabel>Disk</MeterLabel>
    <MeterValue v-slot="{ state }"> {{ state.text }} used </MeterValue>
    <MeterTrack>
      <template #render="{ props }">
        <span v-bind="props">
          <MeterIndicator>
            <template #render="{ props, state }">
              <div
                v-bind="props"
                :data-variant="state.percent >= 90 ? 'destructive' : undefined"
              />
            </template>
          </MeterIndicator>
        </span>
      </template>
    </MeterTrack>
  </Meter>
</template>
