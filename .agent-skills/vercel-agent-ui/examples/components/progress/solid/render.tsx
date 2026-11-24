import {
  Progress,
  ProgressIndicator,
  ProgressLabel,
  ProgressTrack,
  ProgressValue,
} from "@ui-sdk/solid/progress"

function Example() {
  return (
    <Progress value={18}>
      <ProgressLabel>Battery</ProgressLabel>
      <ProgressValue>
        {(state) =>
          state.status === "complete" ? "Charged" : `${state.text} charged`
        }
      </ProgressValue>
      <ProgressTrack render={(props) => <span {...props} />}>
        <ProgressIndicator
          render={(props, state) => (
            <div
              {...props}
              data-variant={
                (state.percent ?? 0) < 20 ? "destructive" : undefined
              }
            />
          )}
        />
      </ProgressTrack>
    </Progress>
  )
}

export { Example }
