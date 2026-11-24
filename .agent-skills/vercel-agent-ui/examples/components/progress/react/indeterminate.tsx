import {
  Progress,
  ProgressIndicator,
  ProgressLabel,
  ProgressTrack,
} from "@ui-sdk/react/progress"

function Example() {
  return (
    <Progress value={null}>
      <ProgressLabel>Connecting to server</ProgressLabel>
      <ProgressTrack>
        <ProgressIndicator />
      </ProgressTrack>
    </Progress>
  )
}

export { Example }
