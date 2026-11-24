<!--
@component
A line between items or groups.
@stable
-->
<script lang="ts">
  import { menu } from "@ui-sdk/core/menu"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let props: PartProps<"div"> = $props()

  const separator = usePart(menu, "separator")
</script>

<Part tag="div" part={separator} {props} />
