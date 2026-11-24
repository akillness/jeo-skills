<!--
@component
The text field. It's the form control, so the text submits under the
autocomplete's `name`. While the suggestions present as a sheet, it moves
into the sheet's header.
@stable
-->
<script lang="ts">
  import {
    autocomplete as autocompletePrimitive,
    type AutocompleteInputState,
  } from "@ui-sdk/core/autocomplete"
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

  let props: PartProps<"input", AutocompleteInputState> = $props()

  const autocomplete = useHandle(autocompletePrimitive)
  const field = useFieldControl()
  const input = useHandlePart(
    autocomplete,
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
