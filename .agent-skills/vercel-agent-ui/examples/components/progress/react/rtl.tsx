import {
  Progress,
  ProgressIndicator,
  ProgressLabel,
  ProgressTrack,
  ProgressValue,
} from "@ui-sdk/react/progress"

function Example() {
  return (
    <div dir="rtl">
      <Progress value={56} locale="ar-EG">
        <ProgressLabel>تقدم الرفع</ProgressLabel>
        <ProgressValue />
        <ProgressTrack>
          <ProgressIndicator />
        </ProgressTrack>
      </Progress>
    </div>
  )
}

export { Example }
