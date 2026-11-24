<!--
@component
The group's heading, which names the group.
@stable
-->
<script lang="ts">
  import { combobox as comboboxPrimitive } from "@ui-sdk/core/combobox"
  import { getContext } from "svelte"
  import Part from "../part.svelte"
  import { useHandle } from "../instance"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { GroupKey } from "./context"

  let props: PartProps<"div"> = $props()

  const combobox = useHandle(comboboxPrimitive)
  const group = getContext<string | undefined>(GroupKey)
  if (!group) {
    throw new Error("<ComboboxGroupLabel> must be used inside <ComboboxGroup>.")
  }
  const label = useHandlePart(combobox, "group-label", () => ({
    id: group,
    group,
  }))
</script>

<Part tag="div" part={label} {props} />
