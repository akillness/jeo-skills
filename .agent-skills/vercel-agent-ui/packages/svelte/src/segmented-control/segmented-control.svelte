<!--
@component
A row of options where exactly one is on, like a radio group drawn as
buttons, with an indicator that slides to the checked item.
@experimental
-->
<script lang="ts">
  import type { ChangeDetails } from "@ui-sdk/core"
  import {
    segmentedControl,
    type SegmentedControlController,
    type SegmentedControlOrientation,
    type SegmentedControlState,
    type SegmentedControlValueChangeReason,
  } from "@ui-sdk/core/segmented-control"
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

  type Details = ChangeDetails<SegmentedControlValueChangeReason>

  let {
    value = $bindable(),
    defaultValue,
    disabled,
    readOnly,
    required,
    name,
    form,
    loop,
    orientation,
    controller,
    debug,
    onValueChange,
    ...rest
  }: PartProps<"div", SegmentedControlState> & {
    /** The checked item's value. Bind it with `bind:value` to control it. `null` checks nothing. */
    value?: string | null
    /** The item checked at first, when uncontrolled. A form reset returns to it. */
    defaultValue?: string | null
    /** Disables every item: they can't be focused or changed, and the value isn't submitted. */
    disabled?: boolean
    /** Keeps the items focusable and the value submitted, but stops changes. */
    readOnly?: boolean
    /** Blocks form submission until an item is checked. */
    required?: boolean
    /** The name the value submits under. */
    name?: string
    /** The id of a form to belong to, when it isn't inside that form. */
    form?: string
    /** Whether arrow keys wrap from the last item to the first. */
    loop?: boolean
    /** Which way the items run, for styling and for screen readers. */
    orientation?: SegmentedControlOrientation
    /** Checks items from anywhere. Create one with `createSegmentedControlController()`. */
    controller?: SegmentedControlController
    /** Logs every state change with its reason. */
    debug?: boolean
    /** Runs when an item or a form reset wants to change the value. `details.cancel()` stops it. */
    onValueChange?: (value: string | null, details: Details) => void
  } = $props()

  const id = $props.id()
  const field = useFieldControl()
  const control = usePrimitive(segmentedControl, () => ({
    id,
    get value() {
      return value
    },
    defaultValue,
    disabled: disabled || field?.disabled(),
    readOnly: readOnlyOf(readOnly, rest),
    required,
    name: name ?? field?.name(),
    form,
    loop,
    orientation,
    controller,
    debug,
    onValueChange: (next: string | null, details: Details) => {
      // The callback runs first, so canceling there also keeps a bound `value` as it was.
      onValueChange?.(next, details)
      if (!details.canceled) {
        value = next
      }
    },
  }))
  provideInstance(segmentedControl, control)
  const root = useHandlePart(control, "root")
  const fieldControl = field?.control(
    () => rest.id,
    () => rest["aria-describedby"]
  )
</script>

<Part tag="div" part={wrapPart(root, fieldControl)} props={rest} />
