// What the rest of core may import from popups's files. import-layers checks every
// import from another folder against this list. Nothing imports this file, so bundles
// don't pay for it.
export { createPopup, type PopupState, popupState } from "./create-popup"
export { type DismissOptions } from "./dismissal"
export { createHoverIntent } from "./hover"
export { measureScrollerEarly } from "./modal"
export { createSafeArea } from "./safe-area"
export { modalAttribute, pointerModalAttribute } from "./modal-attribute"
export {
  createPopupController,
  deriveOpen,
  disabledTriggerAttrs,
  type Modal,
  modalTriple,
  openerOf,
  type PopupCloseReason,
  popupContentAttrs,
  type PopupController,
  type PopupFocusTarget,
  type PopupOpener,
  type PopupOpenOptions,
  type PopupResult,
  popupTriggerAttrs,
  prepareReset,
  resetPopoverStyles,
} from "./popup"
export { createOpenSteps, createSteppedPopup, unopened } from "./popup-steps"
export {
  inPopupElement,
  ownsEvent,
  registerPopupElement,
} from "./popup-elements"
export { contentAnchor, placementOptions } from "./popup-features"
export { hoverCardPreset, tooltipPreset } from "./popup-hover-presets"
export {
  alertDialogPreset,
  comboboxPreset,
  datePickerPreset,
  dialogPreset,
  drawerPreset,
  menuPreset,
  popoverPreset,
  type PopupPreset,
  selectPreset,
  triggerMenuPreset,
} from "./popup-presets"
export {
  bindPopupContent,
  bindTrigger,
  popupArrow,
  popupBackdrop,
  popupClose,
  popupContent,
  type PopupContentProps,
  type PopupContentState,
  popupDescription,
  type PopupPartState,
  popupSlots,
  popupTitle,
  popupTrigger,
  type PopupTriggerProps,
  type PopupTriggerState,
  popupViewport,
} from "./popup-slots"
export {
  bindSheetInput,
  type PresentationSetting,
  type SheetConfig,
  sheetModal,
  sheetSnapPoints,
} from "./presentation"
export {
  attachSheet,
  isDragSurface,
  parentSheet,
  prepareSheet,
  type Sheet,
  type SheetDriverName,
  type SheetKeyframes,
  sheetLayers,
  type SheetOutlet,
  type SheetSide,
} from "./sheet"
