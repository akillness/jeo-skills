// Importing this defines <ui-resizable> and its parts. On the server it does nothing.
import { defineResizableElements } from "../resizable"

defineResizableElements()

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
export type { ResizableEvents, UiResizableElement } from "../events"
export {
  createResizableController,
  resizableStorageKey,
} from "@ui-sdk/core/resizable"
