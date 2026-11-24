<!--
@component
An arrow on the popup's edge that points at the input.
@stable
-->
<script lang="ts">
  import { combobox, type ComboboxArrowState } from "@ui-sdk/core/combobox"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let props: PartProps<"div", ComboboxArrowState> = $props()

  const arrow = usePart(combobox, "arrow")
</script>

<Part tag="div" part={arrow} {props} />
