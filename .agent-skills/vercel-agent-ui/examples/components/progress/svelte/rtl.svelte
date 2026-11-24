<script lang="ts">
  import {
    Progress,
    ProgressIndicator,
    ProgressLabel,
    ProgressTrack,
    ProgressValue,
  } from "@ui-sdk/svelte/progress"
</script>

<div dir="rtl">
  <Progress value={56} locale="ar-EG">
    <ProgressLabel>تقدم الرفع</ProgressLabel>
    <ProgressValue />
    <ProgressTrack>
      <ProgressIndicator />
    </ProgressTrack>
  </Progress>
</div>
