<!--
@component
A line between items or groups, hidden from screen readers.
@stable
-->
<script lang="ts">
  import { triggerMenu } from "@ui-sdk/core/trigger-menu"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let props: PartProps<"div"> = $props()

  const separator = usePart(triggerMenu, "separator")
</script>

<Part tag="div" part={separator} {props} />
