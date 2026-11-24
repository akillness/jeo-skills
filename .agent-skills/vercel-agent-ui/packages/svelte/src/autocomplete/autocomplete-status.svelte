<!--
@component
A polite live region for loading and result counts. Its content is yours, from its children's state.
@stable
-->
<script lang="ts">
  import {
    autocomplete,
    type AutocompleteStatusState,
  } from "@ui-sdk/core/autocomplete"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let props: PartProps<"div", AutocompleteStatusState> = $props()

  const status = usePart(autocomplete, "status")
</script>

<Part tag="div" part={status} {props} />
