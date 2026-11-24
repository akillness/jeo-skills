<script lang="ts">
  import {
    Progress,
    ProgressIndicator,
    ProgressLabel,
    ProgressTrack,
    ProgressValue,
  } from "@ui-sdk/svelte/progress"
</script>

<Progress value={18}>
  <ProgressLabel>Battery</ProgressLabel>
  <ProgressValue>
    {#snippet children(state)}
      {state.status === "complete" ? "Charged" : `${state.text} charged`}
    {/snippet}
  </ProgressValue>
  <ProgressTrack>
    {#snippet render({ props })}
      <span {...props}>
        <ProgressIndicator>
          {#snippet render({ props, state })}
            <div
              {...props}
              data-variant={(state.percent ?? 0) < 20
                ? "destructive"
                : undefined}
            ></div>
          {/snippet}
        </ProgressIndicator>
      </span>
    {/snippet}
  </ProgressTrack>
</Progress>
