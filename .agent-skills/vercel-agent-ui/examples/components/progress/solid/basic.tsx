import {
  Progress,
  ProgressIndicator,
  ProgressLabel,
  ProgressTrack,
  ProgressValue,
} from "@ui-sdk/solid/progress"

function Example() {
  return (
    <Progress value={60}>
      <ProgressLabel>Exporting video</ProgressLabel>
      <ProgressValue />
      <ProgressTrack>
        <ProgressIndicator />
      </ProgressTrack>
    </Progress>
  )
}

export { Example }
