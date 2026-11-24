<script lang="ts">
  import {
    Meter,
    MeterIndicator,
    MeterLabel,
    MeterTrack,
    MeterValue,
  } from "@ui-sdk/svelte/meter"
</script>

<Meter value={91}>
  <MeterLabel>Disk</MeterLabel>
  <MeterValue>
    {#snippet children(state)}
      {state.text} used
    {/snippet}
  </MeterValue>
  <MeterTrack>
    {#snippet render({ props })}
      <span {...props}>
        <MeterIndicator>
          {#snippet render({ props, state })}
            <div
              {...props}
              data-variant={state.percent >= 90 ? "destructive" : undefined}
            ></div>
          {/snippet}
        </MeterIndicator>
      </span>
    {/snippet}
  </MeterTrack>
</Meter>
