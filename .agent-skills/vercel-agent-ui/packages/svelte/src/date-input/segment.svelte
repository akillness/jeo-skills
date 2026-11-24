<!--
@component
A segment: an input you type in, or a span for the text between segments.
-->
<script lang="ts">
  import type {
    dateInput,
    DateInputSegmentData,
    DateInputSegmentState,
  } from "@ui-sdk/core/date-input"
  import { untrack } from "svelte"
  import { usePart } from "../instance"
  import Part from "../part.svelte"
  import type { PartProps } from "../use-primitive.svelte"

  let {
    primitive,
    segment,
    children,
    ...rest
  }: PartProps<"input", DateInputSegmentState> & {
    primitive: typeof dateInput
    segment: DateInputSegmentData
  } = $props()

  // A segment's primitive and key, and so whether it's typed in, never change.
  const part = usePart(
    untrack(() => primitive),
    "segment",
    () => ({ segment, id: segment.key })
  )
  const editable = untrack(() => segment.editable)
</script>

{#snippet text(state: DateInputSegmentState)}{state.text}{/snippet}

{#if editable}
  <Part tag="input" {part} props={rest} />
{:else}
  <Part tag="span" {part} props={{ ...rest, children: children ?? text }} />
{/if}
