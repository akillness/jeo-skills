<!--
@component
The item that opens its submenu.
@stable
-->
<script lang="ts">
  import {
    menu,
    type MenuSubTriggerProps,
    type MenuTriggerState,
  } from "@ui-sdk/core/menu"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let {
    disabled,
    ...rest
  }: PartProps<"div", MenuTriggerState> & MenuSubTriggerProps = $props()

  const trigger = usePart(menu, "trigger", () => ({ disabled }))
</script>

<Part tag="div" part={trigger} props={rest} />
