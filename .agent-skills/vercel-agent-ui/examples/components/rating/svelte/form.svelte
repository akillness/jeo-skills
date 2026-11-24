<script lang="ts">
  import { StarIcon } from "@lucide/svelte"
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import { Rating, RatingItem } from "@ui-sdk/svelte/rating"
  import { useLog } from "../../../shared/svelte/log"

  const log = useLog()

  function onsubmit(event: SubmitEvent & { currentTarget: HTMLFormElement }) {
    event.preventDefault()
    log(`Submitted stay=${new FormData(event.currentTarget).get("stay")}`)
  }
</script>

<form data-slot="stack" {onsubmit}>
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
