<!--
@component
A polite live region for loading and result counts. Its content is yours, from its children's state.
@stable
-->
<script lang="ts">
  import { combobox, type ComboboxStatusState } from "@ui-sdk/core/combobox"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let props: PartProps<"div", ComboboxStatusState> = $props()

  const status = usePart(combobox, "status")
</script>

<Part tag="div" part={status} {props} />
