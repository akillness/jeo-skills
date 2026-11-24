<script lang="ts">
  import {
    Progress,
    ProgressIndicator,
    ProgressLabel,
    ProgressTrack,
    ProgressValue,
  } from "@ui-sdk/svelte/progress"
  import { useLog } from "../../../shared/svelte/log"

  const total = 5

  const log = useLog()
  let uploaded = $state(1)

  function uploadNext() {
    if (uploaded >= total) {
      return
    }
    uploaded++
    log(`Uploaded ${uploaded} of ${total} photos`)
  }

  function reset() {
    uploaded = 0
    log("Reset to 0 photos")
  }
</script>

<div data-slot="stack">
  <div data-slot="controls">
    <button type="button" aria-disabled={uploaded >= total} onclick={uploadNext}
      >Upload Next</button
    >
    <button type="button" onclick={reset}>Reset</button>
  </div>
  <Progress value={(uploaded / total) * 100}>
    <ProgressLabel>Uploading photos</ProgressLabel>
    <ProgressValue />
    <ProgressTrack>
      <ProgressIndicator />
    </ProgressTrack>
  </Progress>
</div>
