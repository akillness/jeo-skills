import {
  Meter,
  MeterIndicator,
  MeterLabel,
  MeterTrack,
  MeterValue,
} from "@ui-sdk/solid/meter"

function Example() {
  return (
    <Meter
      value={750}
      max={1000}
      getValueLabel={(value, details) =>
        `${value} of ${details.max} requests, ${details.formatted}`
      }
    >
      <MeterLabel>API requests</MeterLabel>
      <MeterValue>750 / 1,000</MeterValue>
      <MeterTrack>
        <MeterIndicator />
      </MeterTrack>
    </Meter>
  )
}

export { Example }
