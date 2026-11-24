<script lang="ts">
  import {
    Progress,
    ProgressIndicator,
    ProgressLabel,
    ProgressTrack,
    ProgressValue,
    type GaugeLabelDetails,
  } from "@ui-sdk/svelte/progress"

  const valueLabel = (value: number | null, details: GaugeLabelDetails) =>
    `${value} of ${details.max} files, ${details.formatted}`
</script>

<Progress value={3} max={12} getValueLabel={valueLabel}>
  <ProgressLabel>Copying files</ProgressLabel>
  <ProgressValue>3 of 12</ProgressValue>
  <ProgressTrack>
    <ProgressIndicator />
  </ProgressTrack>
</Progress>
