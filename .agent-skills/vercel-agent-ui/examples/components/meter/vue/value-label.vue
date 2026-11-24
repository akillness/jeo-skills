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
  <Meter
    :value="750"
    :max="1000"
    :get-value-label="
      (value, details) =>
        `${value} of ${details.max} requests, ${details.formatted}`
    "
  >
    <MeterLabel>API requests</MeterLabel>
    <MeterValue>750 / 1,000</MeterValue>
    <MeterTrack>
      <MeterIndicator />
    </MeterTrack>
  </Meter>
</template>
