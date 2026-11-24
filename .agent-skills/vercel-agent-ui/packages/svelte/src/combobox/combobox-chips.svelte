<!--
@component
The selected values as chips, around the input.
@stable
-->
<script lang="ts">
  import { combobox as comboboxPrimitive } from "@ui-sdk/core/combobox"
  import { comboboxChips } from "@ui-sdk/core/renderer"
  import Part from "../part.svelte"
  import { useHandle } from "../instance"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"

  let props: PartProps<"div"> = $props()

  const combobox = useHandle(comboboxPrimitive)
  combobox.instance.use(comboboxChips)
  const chips = useHandlePart(combobox, "chips")
</script>

<Part tag="div" part={chips} {props} />
