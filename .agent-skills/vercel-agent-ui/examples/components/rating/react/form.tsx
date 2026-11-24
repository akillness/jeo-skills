"use client"

import { Field, FieldLabel } from "@ui-sdk/react/field"
import { Rating, RatingItem } from "@ui-sdk/react/rating"
import { StarIcon } from "lucide-react"
import { useLog } from "../../../shared/react/log"

function Example() {
  const log = useLog()

  return (
    <form
      data-slot="stack"
      onSubmit={(event) => {
        event.preventDefault()
        log(`Submitted stay=${new FormData(event.currentTarget).get("stay")}`)
      }}
    >
      <Field>
        <FieldLabel>Rate your stay</FieldLabel>
        <Rating name="stay" required>
          <RatingItem>
            <StarIcon aria-hidden="true" />
          </RatingItem>
        </Rating>
      </Field>
      <div data-slot="row">
        <button type="submit" data-variant="solid">
          Send Review
        </button>
        <button type="reset">Reset</button>
      </div>
    </form>
  )
}

export { Example }
