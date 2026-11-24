<script lang="ts">
  import {
    Progress,
    ProgressIndicator,
    ProgressLabel,
    ProgressTrack,
    ProgressValue,
  } from "@ui-sdk/svelte/progress"
</script>

<Progress value={60}>
  <ProgressLabel>Exporting video</ProgressLabel>
  <ProgressValue />
  <ProgressTrack>
    <ProgressIndicator />
  </ProgressTrack>
</Progress>
