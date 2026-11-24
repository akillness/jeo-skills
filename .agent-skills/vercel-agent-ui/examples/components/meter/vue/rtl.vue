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
  <div dir="rtl">
    <Meter :value="68" locale="ar-EG">
      <MeterLabel>مساحة التخزين</MeterLabel>
      <MeterValue />
      <MeterTrack>
        <MeterIndicator />
      </MeterTrack>
    </Meter>
  </div>
</template>
