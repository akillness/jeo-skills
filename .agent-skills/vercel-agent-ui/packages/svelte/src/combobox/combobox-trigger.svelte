<!--
@component
A button that opens and closes the list, out of the tab order.
@stable
-->
<script lang="ts">
  import { combobox, type ComboboxTriggerState } from "@ui-sdk/core/combobox"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let props: PartProps<"button", ComboboxTriggerState> = $props()

  const trigger = usePart(combobox, "trigger")
</script>

<Part tag="button" part={trigger} {props} />
