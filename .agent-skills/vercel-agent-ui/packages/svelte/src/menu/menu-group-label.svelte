<!--
@component
The group's heading, which names the group.
@stable
-->
<script lang="ts">
  import { menu as menuPrimitive } from "@ui-sdk/core/menu"
  import { getContext } from "svelte"
  import Part from "../part.svelte"
  import { useHandle } from "../instance"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { GroupKey, RadioGroupKey, type RadioGroupContext } from "./context"

  let props: PartProps<"div"> = $props()

  const menu = useHandle(menuPrimitive)
  const group =
    getContext<RadioGroupContext | undefined>(RadioGroupKey)?.name ??
    getContext<string | undefined>(GroupKey)
  if (!group) {
    throw new Error(
      "<MenuGroupLabel> must be used inside <MenuGroup> or <MenuRadioGroup>."
    )
  }
  const label = useHandlePart(menu, "group-label", () => ({ id: group, group }))
</script>

<Part tag="div" part={label} {props} />
