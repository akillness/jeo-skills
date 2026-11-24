<!--
@component
A score picked from a row of stars, a radio per star or half star, with a
preview while a pointer moves over them. Its content renders once per star.
@experimental
-->
<script lang="ts">
  import type { ChangeDetails } from "@ui-sdk/core"
  import {
    rating,
    type RatingController,
    type RatingState,
    type RatingValueChangeReason,
  } from "@ui-sdk/core/rating"
  import { useFieldControl } from "../field/context"
  import { provideInstance } from "../instance"
  import Part from "../part.svelte"
  import { readOnlyOf } from "../text-control"
  import {
    useHandlePart,
    usePrimitive,
    wrapPart,
    type PartProps,
  } from "../use-primitive.svelte"
  import RatingItem from "./rating-item.svelte"
  import ItemScope from "./rating-item-scope.svelte"

  type Details = ChangeDetails<RatingValueChangeReason>

  let {
    value = $bindable(),
    defaultValue,
    max = 5,
    step = 1,
    deselectable,
    disabled,
    readOnly,
    required,
    name,
    form,
    loop,
    getValueLabel,
    controller,
    debug,
    onValueChange,
    children,
    ...rest
  }: PartProps<"div", RatingState> & {
    /** The score. Bind it with `bind:value` to control the rating. `null` means no score yet. */
    value?: number | null
    /** The score at first, when uncontrolled. A form reset returns to it. */
    defaultValue?: number | null
    /** How many stars there are. */
    max?: number
    /** The smallest change, as a fraction of a star: `0.5` makes half stars. */
    step?: number
    /** Lets a press on the checked star clear the score. */
    deselectable?: boolean
    /** Disables every star: they can't be focused or changed, and the score isn't submitted. */
    disabled?: boolean
    /** Shows the score as an image, named by `getValueLabel`, that can't be changed. */
    readOnly?: boolean
    /** Blocks form submission until there's a score. */
    required?: boolean
    /** The name the score submits under. */
    name?: string
    /** The id of a form to belong to, when it isn't inside that form. */
    form?: string
    /** Whether arrow keys wrap from the last star to the first. */
    loop?: boolean
    /** Names a score, for each star's radio and for a read-only rating. */
    getValueLabel?: (value: number, max: number) => string
    /** Sets the score from anywhere. Create one with `createRatingController()`. */
    controller?: RatingController
    /** Logs every state change with its reason. */
    debug?: boolean
    /** Runs when a star or a form reset wants to change the score. `details.cancel()` stops it. */
    onValueChange?: (value: number | null, details: Details) => void
  } = $props()

  const id = $props.id()
  const field = useFieldControl()
  const control = usePrimitive(rating, () => ({
    id,
    get value() {
      return value
    },
    defaultValue,
    max,
    step,
    deselectable,
    disabled: disabled || field?.disabled(),
    readOnly: readOnlyOf(readOnly, rest),
    required,
    name: name ?? field?.name(),
    form,
    loop,
    getValueLabel,
    controller,
    debug,
    onValueChange: (next: number | null, details: Details) => {
      // The callback runs first, so canceling there also keeps a bound `value` as it was.
      onValueChange?.(next, details)
      if (!details.canceled) {
        value = next
      }
    },
  }))
  provideInstance(rating, control)
  const root = useHandlePart(control, "root")
  const fieldControl = field?.control(
    () => rest.id,
    () => rest["aria-describedby"]
  )
  const stars = $derived(Array.from({ length: max }, (_, at) => at + 1))
</script>

{#snippet content(state: RatingState)}
  {#each stars as index (index)}
    <ItemScope {index} step={() => step}>
      {#if children}{@render children(state)}{:else}<RatingItem />{/if}
    </ItemScope>
  {/each}
{/snippet}

<Part
  tag="div"
  part={wrapPart(root, fieldControl)}
  props={{ ...rest, children: content }}
/>
