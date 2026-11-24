<!--
@component
A line between groups. Composed separators hide while the list is filtered.
@stable
-->
<script lang="ts">
  import { command } from "@ui-sdk/core/command"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let props: PartProps<"div"> = $props()

  const separator = usePart(command, "separator")
</script>

<Part tag="div" part={separator} {props} />
