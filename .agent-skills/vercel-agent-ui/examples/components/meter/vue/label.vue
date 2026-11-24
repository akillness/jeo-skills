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
  <Meter :value="42">
    <MeterLabel>Battery</MeterLabel>
    <MeterValue />
    <MeterTrack>
      <MeterIndicator />
    </MeterTrack>
  </Meter>
</template>
