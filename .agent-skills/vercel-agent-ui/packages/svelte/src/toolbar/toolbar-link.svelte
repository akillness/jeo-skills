<!--
@component
A link in the toolbar. Arrow keys move between it and the toolbar's other items.
@stable
-->
<script lang="ts">
  import type { ToolbarLinkState } from "@ui-sdk/core/toolbar"
  import { getContext } from "svelte"
  import Part from "../part.svelte"
  import { ToolbarGroupKey } from "../toolbar-context"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { useToolbar } from "./context"

  let props: PartProps<"a", ToolbarLinkState> = $props()

  const id = $props.id()
  const groupDisabled =
    getContext<(() => boolean) | undefined>(ToolbarGroupKey) ?? (() => false)
  const link = useHandlePart(useToolbar(), "link", () => ({
    id,
    groupDisabled: groupDisabled(),
  }))
</script>

<Part tag="a" part={link} {props} />
