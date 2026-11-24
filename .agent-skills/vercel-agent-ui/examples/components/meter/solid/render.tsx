import {
  Meter,
  MeterIndicator,
  MeterLabel,
  MeterTrack,
  MeterValue,
} from "@ui-sdk/solid/meter"

function Example() {
  return (
    <Meter value={91}>
      <MeterLabel>Disk</MeterLabel>
      <MeterValue>{(state) => `${state.text} used`}</MeterValue>
      <MeterTrack render={(props) => <span {...props} />}>
        <MeterIndicator
          render={(props, state) => (
            <div
              {...props}
              data-variant={state.percent >= 90 ? "destructive" : undefined}
            />
          )}
        />
      </MeterTrack>
    </Meter>
  )
}

export { Example }
