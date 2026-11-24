import {
  Progress,
  ProgressIndicator,
  ProgressLabel,
  ProgressTrack,
  ProgressValue,
} from "@ui-sdk/react/progress"

function Example() {
  return (
    <Progress
      value={3}
      max={12}
      getValueLabel={(value, details) =>
        `${value} of ${details.max} files, ${details.formatted}`
      }
    >
      <ProgressLabel>Copying files</ProgressLabel>
      <ProgressValue>3 of 12</ProgressValue>
      <ProgressTrack>
        <ProgressIndicator />
      </ProgressTrack>
    </Progress>
  )
}

export { Example }
