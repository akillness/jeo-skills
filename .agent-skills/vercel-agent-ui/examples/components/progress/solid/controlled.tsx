import {
  Progress,
  ProgressIndicator,
  ProgressLabel,
  ProgressTrack,
  ProgressValue,
} from "@ui-sdk/solid/progress"
import { createSignal } from "solid-js"
import { useLog } from "../../../shared/solid/log"

const total = 5

function Example() {
  const log = useLog()
  const [uploaded, setUploaded] = createSignal(1)

  function uploadNext() {
    if (uploaded() >= total) {
      return
    }
    const next = uploaded() + 1
    setUploaded(next)
    log(`Uploaded ${next} of ${total} photos`)
  }

  function reset() {
    setUploaded(0)
    log("Reset to 0 photos")
  }

  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <button
          type="button"
          aria-disabled={uploaded() >= total ? "true" : "false"}
          onClick={uploadNext}
        >
          Upload Next
        </button>
        <button type="button" onClick={reset}>
          Reset
        </button>
      </div>
      <Progress value={(uploaded() / total) * 100}>
        <ProgressLabel>Uploading photos</ProgressLabel>
        <ProgressValue />
        <ProgressTrack>
          <ProgressIndicator />
        </ProgressTrack>
      </Progress>
    </div>
  )
}

export { Example }
