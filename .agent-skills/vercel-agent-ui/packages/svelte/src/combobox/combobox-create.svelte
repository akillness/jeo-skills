<!--
@component
An option that creates an item from the input's text. Shown while the
text matches no item's label exactly. Without content, `Create “text”`.
@stable
-->
<script lang="ts">
  import {
    combobox as comboboxPrimitive,
    type ComboboxCreateProps,
    type ComboboxCreateState,
  } from "@ui-sdk/core/combobox"
  import { comboboxCreate } from "@ui-sdk/core/renderer"
  import Part from "../part.svelte"
  import { useHandle } from "../instance"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"

  let {
    onCreate,
    minLength,
    children,
    ...rest
  }: PartProps<"div", ComboboxCreateState> & ComboboxCreateProps = $props()

  const combobox = useHandle(comboboxPrimitive)
  combobox.instance.use(comboboxCreate)
  const create = useHandlePart(combobox, "create", () => ({
    onCreate,
    minLength,
  }))
</script>

{#snippet text(state: ComboboxCreateState)}Create “{state.query}”{/snippet}

{#if create.present}
  <Part
    tag="div"
    part={create}
    props={{ ...rest, children: children ?? text }}
  />
{/if}
