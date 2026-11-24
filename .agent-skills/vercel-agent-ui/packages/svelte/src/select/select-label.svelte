<!--
@component
A visible label for the select. Pressing it focuses the trigger, like a native select's label.
@stable
-->
<script lang="ts">
  import { select } from "@ui-sdk/core/select"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let props: PartProps<"div"> = $props()

  const label = usePart(select, "label")
</script>

<Part tag="div" part={label} {props} />
