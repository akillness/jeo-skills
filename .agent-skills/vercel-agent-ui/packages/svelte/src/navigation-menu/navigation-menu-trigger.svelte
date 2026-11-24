<!--
@component
The button that opens its item's content. Resting the pointer on it opens the content too.
@stable
-->
<script lang="ts">
  import {
    navigationMenu,
    type NavigationMenuTriggerProps,
    type NavigationMenuTriggerState,
  } from "@ui-sdk/core/navigation-menu"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"
  import { useItem } from "./context"

  let {
    disabled,
    ...rest
  }: PartProps<"button", NavigationMenuTriggerState> &
    NavigationMenuTriggerProps = $props()

  const value = useItem("Trigger")
  const trigger = usePart(navigationMenu, "trigger", () => ({
    value: value(),
    disabled,
  }))
</script>

<Part tag="button" part={trigger} props={rest} />
