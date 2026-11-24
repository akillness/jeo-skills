<script lang="ts">
  import {
    Meter,
    MeterIndicator,
    MeterLabel,
    MeterTrack,
    MeterValue,
  } from "@ui-sdk/svelte/meter"
</script>

<Meter value={68}>
  <MeterLabel>Storage used</MeterLabel>
  <MeterValue />
  <MeterTrack>
    <MeterIndicator />
  </MeterTrack>
</Meter>
