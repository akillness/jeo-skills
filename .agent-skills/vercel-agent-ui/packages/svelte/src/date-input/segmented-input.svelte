<!--
@component
What Date Input and Time Input render alike: a group the field's label
names, its segments, and the hidden input the value submits with.
-->
<script lang="ts">
  import type { ChangeDetails } from "@ui-sdk/core"
  import type {
    dateInput,
    DateInputOptions,
    DateInputSegmentData,
    DateInputState,
    DateInputValueChangeReason,
  } from "@ui-sdk/core/date-input"
  import { untrack, type Component } from "svelte"
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

  // Time Input's primitive has the same slots and state.
  let {
    primitive,
    Segment,
    value = $bindable(),
    defaultValue,
    granularity,
    hourCycle,
    min,
    max,
    unavailable,
    locale,
    disabled,
    readOnly,
    required,
    name,
    form,
    controller,
    debug,
    onValueChange,
    children,
    ...rest
  }: PartProps<"div", DateInputState> &
    Omit<DateInputOptions, "value"> & {
      primitive: typeof dateInput
      Segment: Component<{ segment: DateInputSegmentData }>
      value?: string | null
    } = $props()

  const id = $props.id()
  const field = useFieldControl()
  const own = untrack(() => primitive)
  const handle = usePrimitive(own, () => ({
    id,
    get value() {
      return value
    },
    defaultValue,
    granularity,
    hourCycle,
    min,
    max,
    unavailable,
    locale,
    disabled: disabled || field?.disabled(),
    readOnly: readOnlyOf(readOnly, rest),
    required,
    name: name ?? field?.name(),
    form,
    controller,
    debug,
    onValueChange: (
      next: string | null,
      details: ChangeDetails<DateInputValueChangeReason>
    ) => {
      // The callback runs first, so canceling there also keeps a bound `value` as it was.
      onValueChange?.(next, details)
      if (!details.canceled) {
        value = next
      }
    },
  }))
  provideInstance(own, handle)
  const root = useHandlePart(handle, "root")
  const hidden = useHandlePart(handle, "hidden-input")
  const group = field?.control(
    () => rest.id as string | undefined,
    () => rest["aria-describedby"] as string | undefined
  )
</script>

{#snippet content(state: DateInputState)}
  {#if children}
    {@render children(state)}
  {:else}
    {#each state.segments as segment (segment.key)}
      <Segment {segment} />
    {/each}
  {/if}
  <input {...hidden.slot()} />
{/snippet}

<Part
  tag="div"
  part={wrapPart(root, group)}
  props={{ ...rest, children: content }}
/>
