"use client"

import {
  Progress,
  ProgressIndicator,
  ProgressLabel,
  ProgressTrack,
  ProgressValue,
} from "@ui-sdk/react/progress"
import * as React from "react"
import { useLog } from "../../../shared/react/log"

const total = 5

function Example() {
  const log = useLog()
  const [uploaded, setUploaded] = React.useState(1)

  function uploadNext() {
    if (uploaded >= total) {
      return
    }
    setUploaded(uploaded + 1)
    log(`Uploaded ${uploaded + 1} of ${total} photos`)
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
          aria-disabled={uploaded >= total}
          onClick={uploadNext}
        >
          Upload Next
        </button>
        <button type="button" onClick={reset}>
          Reset
        </button>
      </div>
      <Progress value={(uploaded / total) * 100}>
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
