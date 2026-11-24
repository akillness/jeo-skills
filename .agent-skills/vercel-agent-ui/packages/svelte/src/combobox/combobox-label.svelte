<!--
@component
A visible label for the input.
@stable
-->
<script lang="ts">
  import { combobox } from "@ui-sdk/core/combobox"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let props: PartProps<"label"> = $props()

  const label = usePart(combobox, "label")
</script>

<Part tag="label" part={label} {props} />
