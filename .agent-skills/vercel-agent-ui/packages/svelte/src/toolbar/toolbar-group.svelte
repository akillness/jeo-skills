<!--
@component
A group of related items in the toolbar. `disabled` disables every item in it.
@stable
-->
<script lang="ts">
  import type {
    ToolbarGroupProps,
    ToolbarGroupState,
  } from "@ui-sdk/core/toolbar"
  import { setContext } from "svelte"
  import Part from "../part.svelte"
  import { ToolbarGroupKey } from "../toolbar-context"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { useToolbar } from "./context"

  let {
    disabled,
    ...rest
  }: PartProps<"div", ToolbarGroupState> & ToolbarGroupProps = $props()

  const id = $props.id()
  const group = useHandlePart(useToolbar(), "group", () => ({ id, disabled }))
  // Items inside read it when their options run, so a change reaches them.
  setContext(ToolbarGroupKey, () => group.state.disabled)
</script>

<Part tag="div" part={group} props={rest} />
