<!--
@component
The selected item's icon, copied from its `ComboboxItemIcon`, like next to
the input. Rendered while one item is selected and it has an icon.
@stable
-->
<script lang="ts">
  import { combobox as comboboxPrimitive } from "@ui-sdk/core/combobox"
  import { comboboxItemIcons } from "@ui-sdk/core/renderer"
  import { getContext } from "svelte"
  import type { PartProps } from "../use-primitive.svelte"
  import ValueIcon from "../value-icon.svelte"
  import type { ComboboxContext } from "./context"

  let { ...rest }: PartProps<"span"> = $props()

  const combobox = getContext<ComboboxContext | undefined>(comboboxPrimitive)
  combobox?.instance.use(comboboxItemIcons)
</script>

{#if combobox}
  <ValueIcon owner={combobox} {...rest} />
{/if}
