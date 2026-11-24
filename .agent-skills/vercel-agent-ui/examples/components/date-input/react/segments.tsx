"use client"

import { DateInput, DateInputSegment } from "@ui-sdk/react/date-input"
import { Field, FieldLabel } from "@ui-sdk/react/field"

function Example() {
  return (
    <Field>
      <FieldLabel>Start date</FieldLabel>
      <DateInput defaultValue="2026-11-02">
        {({ segments }) =>
          segments.map((segment) =>
            segment.editable ? (
              <DateInputSegment key={segment.key} segment={segment} />
            ) : (
              <DateInputSegment key={segment.key} segment={segment}>
                –
              </DateInputSegment>
            )
          )
        }
      </DateInput>
    </Field>
  )
}

export { Example }
