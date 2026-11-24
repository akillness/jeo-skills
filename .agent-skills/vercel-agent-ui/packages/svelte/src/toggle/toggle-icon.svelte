<!--
@component
An icon inside a toggle. A toggle with only an icon needs an `aria-label`.
Screen readers skip it, and `mirror` flips it in right-to-left text.
@stable
-->
<script lang="ts">
  import type { ToggleIconProps, ToggleIconState } from "@ui-sdk/core/toggle"
  import ItemIcon from "../item-icon.svelte"
  import type { PartProps } from "../use-primitive.svelte"
  import { useToggle } from "./context"

  let { ...rest }: PartProps<"span", ToggleIconState> & ToggleIconProps =
    $props()

  const toggle = useToggle()
</script>

<ItemIcon owner={toggle} partName="icon" {...rest} />
