<!--
@component
The text input that filters the list and holds the chosen item's label.
While the list presents as a sheet, it moves into the sheet's header.
@stable
-->
<script lang="ts">
  import {
    combobox as comboboxPrimitive,
    type ComboboxInputState,
  } from "@ui-sdk/core/combobox"
  import { useFieldControl } from "../field/context"
  import Part from "../part.svelte"
  import { useHandle } from "../instance"
  import { portalTo } from "../popup.svelte"
  import { useInSheetHeader } from "../sheet-header.svelte"
  import {
    useHandlePart,
    wrapPart,
    type PartProps,
  } from "../use-primitive.svelte"

  let props: PartProps<"input", ComboboxInputState> = $props()

  const combobox = useHandle(comboboxPrimitive)
  const field = useFieldControl()
  const input = useHandlePart(
    combobox,
    "input",
    () => ({}),
    portalTo(useInSheetHeader())
  )
  const control = field?.control(
    () => props.id as string | undefined,
    () => props["aria-describedby"]
  )
</script>

<Part
  tag="input"
  part={wrapPart(input, control)}
  props={{ ...props, children: undefined }}
/>
