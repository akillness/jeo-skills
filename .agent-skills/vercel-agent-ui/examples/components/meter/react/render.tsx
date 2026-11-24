import {
  Meter,
  MeterIndicator,
  MeterLabel,
  MeterTrack,
  MeterValue,
} from "@ui-sdk/react/meter"

export function Example() {
  return (
    <Meter value={91}>
      <MeterLabel>Disk</MeterLabel>
      <MeterValue>{(state) => `${state.text} used`}</MeterValue>
      <MeterTrack render={<span />}>
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
