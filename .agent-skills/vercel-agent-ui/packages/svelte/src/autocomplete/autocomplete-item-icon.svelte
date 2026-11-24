<!--
@component
An icon inside a suggestion. Screen readers, typeahead and filtering skip
it, and `mirror` flips it in right-to-left text.
@stable
-->
<script lang="ts">
  import {
    autocomplete as autocompletePrimitive,
    type AutocompleteItemIconProps,
    type AutocompleteItemIconState,
  } from "@ui-sdk/core/autocomplete"
  import { useHandle } from "../instance"
  import ItemIcon from "../item-icon.svelte"
  import type { PartProps } from "../use-primitive.svelte"

  let {
    ...rest
  }: PartProps<"span", AutocompleteItemIconState> & AutocompleteItemIconProps =
    $props()

  const autocomplete = useHandle(autocompletePrimitive)
</script>

<ItemIcon owner={autocomplete} partName="item-icon" {...rest} />
