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
  <Meter :value="68">
    <MeterLabel>Storage used</MeterLabel>
    <MeterValue />
    <MeterTrack>
      <MeterIndicator />
    </MeterTrack>
  </Meter>
</template>
