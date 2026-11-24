import { resizable } from "@ui-sdk/core/resizable"
import { createParts } from "./use-primitive"

const parts = createParts(resizable, {
  root: "div",
  panel: "div",
  handle: "div",
})

/**
 * The group: lays its panels out along its orientation.
 * @stable
 */
const Resizable = parts.Root

/**
 * A panel. Its size is written to `--resizable-panel-size` on every frame of a
 * drag, so it never renders for a resize unless its render function reads `size`.
 * @stable
 */
const ResizablePanel = parts.Panel

/**
 * The handle between two panels: a focusable separator to drag or move with keys.
 * @stable
 */
const ResizableHandle = parts.Handle

export {
  createResizableController,
  resizableStorageKey,
} from "@ui-sdk/core/resizable"
export type {
  ResizableApi,
  ResizableChangeOptions,
  ResizableController,
  ResizableHandleProps,
  ResizableHandleState,
  ResizableLayoutChangeDetails,
  ResizableLayoutChangeReason,
  ResizableLayoutCommitDetails,
  ResizableOptions,
  ResizablePanelProps,
  ResizablePanelState,
  ResizablePrimitive,
  ResizableSize,
  ResizableState,
  ResizableStorage,
} from "@ui-sdk/core/resizable"

export { Resizable, ResizableHandle, ResizablePanel }
