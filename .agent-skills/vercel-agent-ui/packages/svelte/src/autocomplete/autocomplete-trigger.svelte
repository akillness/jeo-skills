<!--
@component
A button that opens and closes the suggestions, out of the tab order.
@stable
-->
<script lang="ts">
  import {
    autocomplete,
    type AutocompleteTriggerState,
  } from "@ui-sdk/core/autocomplete"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let props: PartProps<"button", AutocompleteTriggerState> = $props()

  const trigger = usePart(autocomplete, "trigger")
</script>

<Part tag="button" part={trigger} {props} />
