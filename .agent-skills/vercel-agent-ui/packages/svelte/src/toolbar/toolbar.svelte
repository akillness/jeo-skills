<!--
@component
A row of controls with one tab stop and arrow keys between them. Toggles
and toggle groups inside join it. Render menu and select triggers through
`ToolbarButton`, and fields through `ToolbarInput`, with `render`.
@stable
-->
<script lang="ts">
  import {
    toolbar as toolbarPrimitive,
    type ToolbarController,
    type ToolbarOrientation,
    type ToolbarState,
  } from "@ui-sdk/core/toolbar"
  import { setContext } from "svelte"
  import Part from "../part.svelte"
  import { ToolbarKey } from "../toolbar-context"
  import {
    useHandlePart,
    usePrimitive,
    type PartProps,
  } from "../use-primitive.svelte"

  let {
    orientation,
    loop,
    disabled,
    controller,
    debug,
    ...rest
  }: PartProps<"div", ToolbarState> & {
    /** Which arrow keys move between items: left and right, or up and down. */
    orientation?: ToolbarOrientation
    /** Whether arrow keys wrap from the last item to the first. */
    loop?: boolean
    /** Stops every item from being used. Items stay focusable with `aria-disabled`, so the toolbar keeps its tab stop and stays discoverable. */
    disabled?: boolean
    /** Focuses the toolbar from anywhere. Create one with `createToolbarController()`. */
    controller?: ToolbarController
    /** Logs every state change. */
    debug?: boolean
  } = $props()

  const id = $props.id()
  const toolbar = usePrimitive(toolbarPrimitive, () => ({
    id,
    orientation,
    loop,
    disabled,
    controller,
    debug,
  }))
  setContext(ToolbarKey, toolbar)
  const root = useHandlePart(toolbar, "root")
</script>

<Part tag="div" part={root} props={rest} />
