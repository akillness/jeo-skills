<!--
@component
The group's heading, which names the group.
@stable
-->
<script lang="ts">
  import { listbox as listboxPrimitive } from "@ui-sdk/core/listbox"
  import { getContext } from "svelte"
  import Part from "../part.svelte"
  import { useHandle } from "../instance"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { GroupKey } from "./context"

  let props: PartProps<"div"> = $props()

  const listbox = useHandle(listboxPrimitive)
  const group = getContext<string | undefined>(GroupKey)
  if (!group) {
    throw new Error("<ListboxGroupLabel> must be used inside <ListboxGroup>.")
  }
  const label = useHandlePart(listbox, "group-label", () => ({
    id: group,
    group,
  }))
</script>

<Part tag="div" part={label} {props} />
