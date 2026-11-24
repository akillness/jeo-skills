<script setup lang="ts">
import { StarIcon } from "@lucide/vue"
import { Field, FieldLabel } from "@ui-sdk/vue/field"
import { Rating, RatingItem } from "@ui-sdk/vue/rating"
import { useLog } from "../../../shared/vue/log"

const log = useLog()

function onSubmit(event: SubmitEvent) {
  log(
    `Submitted stay=${new FormData(event.currentTarget as HTMLFormElement).get("stay")}`
  )
}
</script>

<template>
  <form data-slot="stack" @submit.prevent="onSubmit">
    <Field>
      <FieldLabel>Rate your stay</FieldLabel>
      <Rating name="stay" required>
        <RatingItem>
          <StarIcon aria-hidden="true" />
        </RatingItem>
      </Rating>
    </Field>
    <div data-slot="row">
      <button type="submit" data-variant="solid">Send Review</button>
      <button type="reset">Reset</button>
    </div>
  </form>
</template>
