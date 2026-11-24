<script lang="ts">
  import {
    Progress,
    ProgressIndicator,
    ProgressLabel,
    ProgressTrack,
    ProgressValue,
  } from "@ui-sdk/svelte/progress"
</script>

<Progress value={56}>
  <ProgressLabel>Upload progress</ProgressLabel>
  <ProgressValue />
  <ProgressTrack>
    <ProgressIndicator />
  </ProgressTrack>
</Progress>
