// What the rest of core may import from disclosure's files. import-layers checks every
// import from another folder against this list. Nothing imports this file, so bundles
// don't pay for it.
export {
  bindFindable,
  bindPanel,
  bindTriggerElement,
  createPendingReason,
  focusPressedTrigger,
  hiddenAttrs,
  openAttrs,
  type PanelBinding,
  supportsHiddenUntilFound,
  triggerKeydown,
} from "./disclosure"
