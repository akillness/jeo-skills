<!--
@component
The group: lays its panels out along its orientation. `bind:layout` controls it.
@stable
-->
<script lang="ts">
  import {
    resizable as resizablePrimitive,
    type ResizableController,
    type ResizableLayoutCommitDetails,
    type ResizableLayoutChangeDetails,
    type ResizableState,
    type ResizableStorage,
  } from "@ui-sdk/core/resizable"
  import Part from "../part.svelte"
  import { provideInstance } from "../instance"
  import {
    useHandlePart,
    usePrimitive,
    type PartProps,
  } from "../use-primitive.svelte"

  let {
    layout = $bindable(),
    defaultLayout,
    orientation,
    disabled,
    step,
    largeStep,
    autoSaveId,
    storage,
    controller,
    debug,
    onLayoutChange,
    onLayoutCommit,
    ...rest
  }: PartProps<"div", ResizableState> & {
    /** Each panel's size in percent, in panel order, like `[25, 75]`. Bind it with `bind:layout` to control the group. */
    layout?: number[]
    /** The layout at first, when uncontrolled. Panels' own `defaultSize` is what a server renders, so prefer that with server rendering. */
    defaultLayout?: number[]
    /** The direction panels are laid out in. Horizontal panels sit side by side, vertical ones stack. */
    orientation?: "horizontal" | "vertical"
    /** Stops every handle: no drags, no keys, and handles leave the tab order. */
    disabled?: boolean
    /** How far an arrow key moves a handle, in percent. */
    step?: number
    /** How far Shift with an arrow key moves a handle, in percent. */
    largeStep?: number
    /** Saves the layout when an interaction completes and restores it on the next visit, under this key. */
    autoSaveId?: string
    /** Where `autoSaveId` saves: anything with `getItem` and `setItem`, like a cookie store a server can read. */
    storage?: ResizableStorage
    /** Resizes the group from anywhere. Create one with `createResizableController()`. */
    controller?: ResizableController
    /** Logs every layout change with its reason. */
    debug?: boolean
    /** Runs while the layout changes: on every frame of a drag and every key. `details.cancel()` keeps the layout. */
    onLayoutChange?: (
      layout: number[],
      details: ResizableLayoutChangeDetails
    ) => void
    /** Runs once an interaction that changed the layout ends: the pointer lifts, the key comes up, or a panel collapses. For saving. */
    onLayoutCommit?: (
      layout: number[],
      details: ResizableLayoutCommitDetails
    ) => void
  } = $props()

  const id = $props.id()
  const resizable = usePrimitive(resizablePrimitive, () => ({
    id,
    get layout() {
      return layout
    },
    defaultLayout,
    orientation,
    disabled,
    step,
    largeStep,
    autoSaveId,
    storage,
    controller,
    debug,
    onLayoutChange: (next: number[], details: ResizableLayoutChangeDetails) => {
      // The callback runs first, so canceling there also keeps a bound `layout` as it was.
      onLayoutChange?.(next, details)
      if (!details.canceled) {
        layout = next
      }
    },
    onLayoutCommit,
  }))
  provideInstance(resizablePrimitive, resizable)
  const root = useHandlePart(resizable, "root")
</script>

<Part tag="div" part={root} props={rest} />
