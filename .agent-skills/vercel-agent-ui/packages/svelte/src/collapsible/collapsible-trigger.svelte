<!--
@component
The button that opens and closes the panel. It says whether the panel is open with `aria-expanded`.
@stable
-->
<script lang="ts">
  import {
    collapsible,
    type CollapsibleTriggerState,
  } from "@ui-sdk/core/collapsible"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let props: PartProps<"button", CollapsibleTriggerState> = $props()

  const trigger = usePart(collapsible, "trigger")
</script>

<Part tag="button" part={trigger} {props} />
