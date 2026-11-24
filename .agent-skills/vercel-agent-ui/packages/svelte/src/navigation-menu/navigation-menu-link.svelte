<!--
@component
A link. Pressing it closes the menu, and `current` marks the current page with `aria-current="page"`.
@stable
-->
<script lang="ts">
  import {
    navigationMenu,
    type NavigationMenuLinkProps,
    type NavigationMenuLinkState,
  } from "@ui-sdk/core/navigation-menu"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let {
    current,
    closeOnSelect,
    ...rest
  }: PartProps<"a", NavigationMenuLinkState> & NavigationMenuLinkProps =
    $props()

  const id = $props.id()
  const link = usePart(navigationMenu, "link", () => ({
    id,
    current,
    closeOnSelect,
  }))
</script>

<Part tag="a" part={link} props={rest} />
