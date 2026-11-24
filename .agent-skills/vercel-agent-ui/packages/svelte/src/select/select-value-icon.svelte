<!--
@component
The selected item's icon, copied from its `SelectItemIcon`, like before
the value in the trigger. Rendered while one item is selected and it has an icon.
@stable
-->
<script lang="ts">
  import { select as selectPrimitive } from "@ui-sdk/core/select"
  import { selectItemIcons } from "@ui-sdk/core/renderer"
  import { getContext } from "svelte"
  import type { PartProps } from "../use-primitive.svelte"
  import ValueIcon from "../value-icon.svelte"
  import type { SelectContext } from "./context"

  let { ...rest }: PartProps<"span"> = $props()

  const select = getContext<SelectContext | undefined>(selectPrimitive)
  select?.instance.use(selectItemIcons)
</script>

{#if select}
  <ValueIcon owner={select} {...rest} />
{/if}
