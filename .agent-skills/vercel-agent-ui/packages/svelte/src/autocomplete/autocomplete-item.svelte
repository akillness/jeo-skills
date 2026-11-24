<!--
@component
A suggestion. Choosing it fills the field in with its text.
@stable
-->
<script lang="ts">
  import {
    autocomplete as autocompletePrimitive,
    type AutocompleteItemProps,
    type AutocompleteItemState,
  } from "@ui-sdk/core/autocomplete"
  import { getContext, setContext } from "svelte"
  import Part from "../part.svelte"
  import { useHandle } from "../instance"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { GroupKey, ItemKey, type ItemContext } from "./context"

  let {
    value,
    label,
    keywords,
    disabled,
    index,
    ...rest
  }: PartProps<"div", AutocompleteItemState> & AutocompleteItemProps = $props()

  const autocomplete = useHandle(autocompletePrimitive)
  const group = getContext<string | undefined>(GroupKey)
  setContext<ItemContext>(ItemKey, () => ({
    key: value,
    label: label ?? value,
  }))
  const item = useHandlePart(autocomplete, "item", () => ({
    id: value,
    value,
    label,
    keywords,
    disabled,
    index,
    group,
  }))
</script>

<Part tag="div" part={item} props={rest} />
