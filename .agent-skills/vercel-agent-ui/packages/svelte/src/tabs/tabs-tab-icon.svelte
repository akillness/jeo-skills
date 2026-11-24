<!--
@component
An icon inside a tab. A tab with only an icon needs an `aria-label`.
Screen readers skip it, and `mirror` flips it in right-to-left text.
@stable
-->
<script lang="ts">
  import {
    tabs,
    type TabsTabIconProps,
    type TabsTabIconState,
  } from "@ui-sdk/core/tabs"
  import ItemIcon from "../item-icon.svelte"
  import { useHandle } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let props: PartProps<"span", TabsTabIconState> & TabsTabIconProps = $props()

  const owner = useHandle(tabs)
</script>

<ItemIcon {owner} partName="tab-icon" {...props} />
