import {
  Meter,
  MeterIndicator,
  MeterLabel,
  MeterTrack,
  MeterValue,
} from "@ui-sdk/react/meter"

export function Example() {
  return (
    <Meter value={720} min={300} max={850} format={{ style: "decimal" }}>
      <MeterLabel>Credit score</MeterLabel>
      <MeterValue />
      <MeterTrack>
        <MeterIndicator />
      </MeterTrack>
    </Meter>
  )
}
