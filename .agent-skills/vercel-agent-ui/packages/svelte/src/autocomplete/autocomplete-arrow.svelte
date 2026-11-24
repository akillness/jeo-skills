<!--
@component
An arrow on the popup's edge that points at the field.
@stable
-->
<script lang="ts">
  import {
    autocomplete,
    type AutocompleteArrowState,
  } from "@ui-sdk/core/autocomplete"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let props: PartProps<"div", AutocompleteArrowState> = $props()

  const arrow = usePart(autocomplete, "arrow")
</script>

<Part tag="div" part={arrow} {props} />
