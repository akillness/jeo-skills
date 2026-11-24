import {
  Meter,
  MeterIndicator,
  MeterLabel,
  MeterTrack,
  MeterValue,
} from "@ui-sdk/solid/meter"

function Example() {
  return (
    <Meter value={42}>
      <MeterLabel>Battery</MeterLabel>
      <MeterValue />
      <MeterTrack>
        <MeterIndicator />
      </MeterTrack>
    </Meter>
  )
}

export { Example }
