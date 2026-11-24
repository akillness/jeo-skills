<!--
@component
A group of items, named by its `TriggerMenuGroupLabel`.
@stable
-->
<script lang="ts">
  import { triggerMenu } from "@ui-sdk/core/trigger-menu"
  import { setContext } from "svelte"
  import Part from "../part.svelte"
  import { useHandle } from "../instance"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { GroupKey } from "./context"

  let props: PartProps<"div"> = $props()

  const menu = useHandle(triggerMenu)
  const id = $props.id()
  setContext(GroupKey, id)
  const group = useHandlePart(menu, "group", () => ({ id }))
</script>

<Part tag="div" part={group} {props} />
