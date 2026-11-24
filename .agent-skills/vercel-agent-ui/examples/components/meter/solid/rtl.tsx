import {
  Meter,
  MeterIndicator,
  MeterLabel,
  MeterTrack,
  MeterValue,
} from "@ui-sdk/solid/meter"

function Example() {
  return (
    <div dir="rtl">
      <Meter value={68} locale="ar-EG">
        <MeterLabel>مساحة التخزين</MeterLabel>
        <MeterValue />
        <MeterTrack>
          <MeterIndicator />
        </MeterTrack>
      </Meter>
    </div>
  )
}

export { Example }
