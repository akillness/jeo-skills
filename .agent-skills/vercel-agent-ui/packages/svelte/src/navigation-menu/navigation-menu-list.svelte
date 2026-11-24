<!--
@component
The list of top-level items.
@stable
-->
<script lang="ts">
  import {
    navigationMenu,
    type NavigationMenuListState,
  } from "@ui-sdk/core/navigation-menu"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let props: PartProps<"ul", NavigationMenuListState> = $props()

  const list = usePart(navigationMenu, "list")
</script>

<Part tag="ul" part={list} {props} />
