<script lang="ts">
  import {
    Meter,
    MeterIndicator,
    MeterTrack,
    MeterValue,
  } from "../../src/meter"
</script>

<Meter value={3} min={1} max={5}>
  <MeterValue />
  <MeterTrack><MeterIndicator /></MeterTrack>
</Meter>
