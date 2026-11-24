<!--
@component
The group's heading, which names the group.
@stable
-->
<script lang="ts">
  import { select as selectPrimitive } from "@ui-sdk/core/select"
  import { getContext } from "svelte"
  import Part from "../part.svelte"
  import { useHandle } from "../instance"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { GroupKey } from "./context"

  let props: PartProps<"div"> = $props()

  const select = useHandle(selectPrimitive)
  const group = getContext<string | undefined>(GroupKey)
  if (!group) {
    throw new Error("<SelectGroupLabel> must be used inside <SelectGroup>.")
  }
  const label = useHandlePart(select, "group-label", () => ({
    id: group,
    group,
  }))
</script>

<Part tag="div" part={label} {props} />
