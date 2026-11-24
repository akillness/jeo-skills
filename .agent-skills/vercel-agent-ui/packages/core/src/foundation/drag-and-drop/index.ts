// What the rest of core may import from drag-and-drop's files. import-layers checks every
// import from another folder against this list. Nothing imports this file, so bundles
// don't pay for it.
export { type AutoScrollOptions, createAutoScroll } from "./auto-scroll"
export {
  bindDrag,
  createDragSession,
  type DragSession,
  dragThreshold,
  isDrag,
  isDragPress,
  type PointerSample,
  repeatWhileHeld,
  swallowNextClick,
} from "./pointer"
