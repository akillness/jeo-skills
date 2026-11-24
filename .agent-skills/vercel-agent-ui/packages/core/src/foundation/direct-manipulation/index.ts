// What the rest of core may import from direct-manipulation's files.
// import-layers checks every import from another folder against this list.
// Nothing imports this file, so bundles don't pay for it.
export { createArea, type Area } from "./area"
export { bindHold } from "./hold"
export { bindRepeatPresses } from "./repeat"
export {
  resizeBox,
  type ResizeBox,
  resizeCursors,
  type ResizeHandle,
  type ResizeLimits,
} from "./resize"
