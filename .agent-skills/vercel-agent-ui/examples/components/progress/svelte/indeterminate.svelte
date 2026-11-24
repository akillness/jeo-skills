<script lang="ts">
  import {
    Progress,
    ProgressIndicator,
    ProgressLabel,
    ProgressTrack,
  } from "@ui-sdk/svelte/progress"
</script>

<Progress value={null}>
  <ProgressLabel>Connecting to server</ProgressLabel>
  <ProgressTrack>
    <ProgressIndicator />
  </ProgressTrack>
</Progress>
