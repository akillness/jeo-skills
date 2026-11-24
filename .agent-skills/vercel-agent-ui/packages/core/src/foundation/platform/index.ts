// What the rest of core may import from platform's files. import-layers checks every
// import from another folder against this list. Nothing imports this file, so bundles
// don't pay for it.
export { announce, prepareAnnouncements, setAnnouncer } from "./announce"
export {
  buttonElement,
  buttonElementAttrs,
  type ButtonElement,
  buttonKeydown,
  buttonKeyup,
  buttonRole,
  opensElsewhere,
} from "./button"
export { isBrowser, isIOS, isRTL } from "./env"
export { measureViewportEarly, trackKeyboard } from "./keyboard"
export {
  activeLayers,
  bindPersistentLayer,
  escapeLayer,
  findLayer,
  inPersistentLayer,
  lastClosed,
  lastEscape,
  type Layer,
  layerContains,
  layerCount,
  markClosed,
  openedSince,
  persistentLayers,
  pushLayer,
} from "./layers"
export { layoutBox, layoutOrigin, layoutSize } from "./layout"
export {
  activeElement,
  ariaKeyshortcuts,
  composedClosest,
  composedContains,
  formatShortcut,
  hasCommandModifier,
  initialApple,
  isApple,
  matchesShortcut,
  prefersReducedMotion,
  supportsTopLayer,
} from "./platform"
export {
  type Anchor,
  type PortalProps,
  position,
  type PositionOptions,
  type PositionProps,
  preparePosition,
} from "./position"
export { pressedScrollbar } from "./scrollbar"
export { physicalSide, type PhysicalSide, type Side } from "./sides"
export {
  afterPaint,
  ahead,
  enforceHidden,
  registerUninherited,
  setStyle,
  writeStyle,
} from "./style"
