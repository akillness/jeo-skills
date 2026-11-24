<!--
@component
The group's heading, which names the group.
@stable
-->
<script lang="ts">
  import { triggerMenu } from "@ui-sdk/core/trigger-menu"
  import { getContext } from "svelte"
  import Part from "../part.svelte"
  import { useHandle } from "../instance"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { GroupKey } from "./context"

  let props: PartProps<"div"> = $props()

  const menu = useHandle(triggerMenu)
  const group = getContext<string | undefined>(GroupKey)
  if (!group) {
    throw new Error(
      "<TriggerMenuGroupLabel> must be used inside <TriggerMenuGroup>."
    )
  }
  const label = useHandlePart(menu, "group-label", () => ({ id: group, group }))
</script>

<Part tag="div" part={label} {props} />
