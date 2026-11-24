<!--
@component
A line between items or groups, hidden from screen readers.
@stable
-->
<script lang="ts">
  import { listbox } from "@ui-sdk/core/listbox"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let props: PartProps<"div"> = $props()

  const separator = usePart(listbox, "separator")
</script>

<Part tag="div" part={separator} {props} />
