// Helpers and types, without side effects. Importing a component defines its
// elements, like `import "@ui-sdk/web/accordion"`.
export {
  createParts,
  wrappedButton,
  wrappedChild,
  type AttributeType,
  type Kinds,
  type PartOptions,
  type Parts,
  type RootOptions,
} from "./define-element"
export { createDrawerController, sheetPhysics } from "@ui-sdk/core/drawer"
export type {
  DrawerApi,
  DrawerBackdropState,
  DrawerContentProps,
  DrawerContentState,
  DrawerController,
  DrawerDismissAttemptDetails,
  DrawerDismissReason,
  DrawerDriver,
  DrawerHandleState,
  DrawerKeyframes,
  DrawerOpenChangeReason,
  DrawerOptions,
  DrawerOutletProps,
  DrawerOutletState,
  DrawerPayloadChangeReason,
  DrawerPrimitive,
  DrawerSide,
  DrawerSnapPointChangeReason,
  SheetPhysics,
  SnapPoint,
} from "@ui-sdk/core/drawer"
export {
  createOverlays,
  overlays,
  type OverlayHostToastOptions,
} from "./overlays"
export { createToaster, toast, type ToastContent } from "./toast"
export {
  confirm,
  createConfirm,
  createDialogController,
} from "@ui-sdk/core/dialog"
export type {
  AlertDialogBackdropState,
  AlertDialogCloseActionDetails,
  AlertDialogCloseProps,
  AlertDialogCloseState,
  AlertDialogContentProps,
  AlertDialogContentState,
  AlertDialogController,
  AlertDialogOpenChangeReason,
  AlertDialogOptions,
  AlertDialogPayloadChangeReason,
  AlertDialogPrimitive,
  AlertDialogShortcutProps,
  AlertDialogShortcutState,
  AlertDialogTriggerProps,
  AlertDialogTriggerState,
  ConfirmEntry,
  ConfirmOptions,
  DialogApi,
  DialogBackdropState,
  DialogCloseActionDetails,
  DialogCloseProps,
  DialogCloseState,
  DialogContentProps,
  DialogContentState,
  DialogController,
  DialogDismissAttemptDetails,
  DialogDismissReason,
  DialogFinalFocus,
  DialogInitialFocus,
  DialogOpenChangeDetails,
  DialogOpenChangeReason,
  DialogOptions,
  DialogPayloadChangeReason,
  DialogPrimitive,
  DialogSharedOptions,
  DialogShortcutProps,
  DialogShortcutState,
  DialogTriggerProps,
  DialogTriggerState,
} from "@ui-sdk/core/dialog"
export type {
  Toast,
  ToastAction,
  ToastActionDetails,
  ToastActionProps,
  ToastButtonState,
  ToastCancel,
  ToastCloseProps,
  ToastDismissDetails,
  ToastDismissReason,
  ToastItem,
  ToastOptions,
  ToastPauseReason,
  ToastRegionOptions,
  ToastRegionPrimitive,
  ToastRegionState,
  ToastState,
  ToastType,
  Toaster,
} from "@ui-sdk/core/toast"
export { createMenuController, type MenuData } from "@ui-sdk/core/menu"
export type { UiActionDetail } from "./action"
export {
  createTriggerMenuController,
  textFieldAdapter,
  type TriggerDefinition,
} from "@ui-sdk/core/trigger-menu"
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
export {
  createFileInputController,
  formatFileSize,
  relativePath,
} from "@ui-sdk/core/file-input"
export {
  createPaginationController,
  paginationRange,
  type PaginationRangeItem,
} from "@ui-sdk/core/pagination"
export { createCarouselController } from "@ui-sdk/core/carousel"
export { createCalendarController } from "@ui-sdk/core/calendar"
export { createDatePickerController } from "@ui-sdk/core/date-picker"
export { createDateInputController } from "@ui-sdk/core/date-input"
export { createTimeInputController } from "@ui-sdk/core/time-input"
// Every component's controller, like in the other frameworks' packages.
export { createAccordionController } from "@ui-sdk/core/accordion"
export { createAlertDialogController } from "@ui-sdk/core/alert-dialog"
export { createAutocompleteController } from "@ui-sdk/core/autocomplete"
export {
  createCheckboxController,
  createCheckboxGroupController,
} from "@ui-sdk/core/checkbox"
export { createTimelineController } from "@ui-sdk/core/timeline"
export { createCollapsibleController } from "@ui-sdk/core/collapsible"
export { createColorPickerController } from "@ui-sdk/core/color-picker"
export { createComboboxController } from "@ui-sdk/core/combobox"
export { createCommandController } from "@ui-sdk/core/command"
export { createHoverCardController } from "@ui-sdk/core/hover-card"
export { createImageCropperController } from "@ui-sdk/core/image-cropper"
export { createInputController } from "@ui-sdk/core/input"
export { createListboxController } from "@ui-sdk/core/listbox"
export { createMenubarController } from "@ui-sdk/core/menubar"
export { createNavigationMenuController } from "@ui-sdk/core/navigation-menu"
export { createNumberInputController } from "@ui-sdk/core/number-input"
export { createOTPInputController } from "@ui-sdk/core/otp-input"
export { createPasswordInputController } from "@ui-sdk/core/password-input"
export { createPopoverController } from "@ui-sdk/core/popover"
export { createRadioGroupController } from "@ui-sdk/core/radio"
export { createRatingController } from "@ui-sdk/core/rating"
export { createScrollAreaController } from "@ui-sdk/core/scroll-area"
export { createSegmentedControlController } from "@ui-sdk/core/segmented-control"
export { createSelectController } from "@ui-sdk/core/select"
export { createSliderController } from "@ui-sdk/core/slider"
export { createSwitchController } from "@ui-sdk/core/switch"
export { createTabsController } from "@ui-sdk/core/tabs"
export {
  createToggleController,
  createToggleGroupController,
} from "@ui-sdk/core/toggle"
export { createTokenInputController } from "@ui-sdk/core/token-input"
export { createToolbarController } from "@ui-sdk/core/toolbar"
export { createTooltipController } from "@ui-sdk/core/tooltip"
export { createTreeController } from "@ui-sdk/core/tree"
export { createWaterfallController } from "@ui-sdk/core/waterfall"
// Text matching the way the search components match, for your own filters and highlights.
export { fuzzyScore, matchRanges, matchSegments } from "@ui-sdk/core/text-match"
export type { MatchRange, MatchSegment } from "@ui-sdk/core/text-match"

// Calendar dates as ISO strings, with no date library. `addDays("2026-10-16", 7)` is "2026-10-23".
export {
  addDays,
  addMonths,
  addYears,
  clampDate,
  dateFormatter,
  dateParts,
  datePattern,
  daysBetween,
  daysInMonth,
  endOfMonth,
  endOfWeek,
  firstDayOfWeek,
  formatDate,
  formatDateRange,
  formatDateToParts,
  isISODate,
  isSameMonth,
  isoDate,
  monthGrid,
  monthNames,
  parseDate,
  startOfMonth,
  startOfWeek,
  toISODate,
  todayDate,
  weekday,
  weekdayNames,
} from "@ui-sdk/core/date"
export type {
  DateField,
  DateParts,
  DatePattern,
  ISODate,
} from "@ui-sdk/core/date"

// Steps, scales, formatting and reading numbers, and the keys numeric controls share. `formatNumber(1234.5, "de-DE")` is "1.234,5".
export {
  clamp,
  decimalsOf,
  formatNumber,
  formatNumberRange,
  formatNumberToParts,
  fractionOf,
  isPartialNumber,
  maxOnGrid,
  numberFormatter,
  parseNumber,
  roundTo,
  scrubTo,
  stepBy,
  stepFromKey,
  stepValue,
  valueAt,
  wrap,
} from "@ui-sdk/core/number"
export type {
  NumberFormat,
  NumberKeyOptions,
  NumberMove,
  NumberRange,
  NumberScale,
  NumberScrub,
  NumberSnap,
  StepRange,
} from "@ui-sdk/core/number"

// CSS colors as plain data: read, convert, write, fit to a gamut, mix and compare. `formatColor(parseColor("red")!, "oklch")` is "oklch(0.628 0.2577 29.23)".
export {
  colorDistance,
  contrastRatio,
  convertColor,
  formatColor,
  isInGamut,
  mixColor,
  parseColor,
  toGamut,
} from "@ui-sdk/core/color"
export type {
  Color,
  ColorFormat,
  ColorFormatOptions,
  ColorGamut,
  ColorHueInterpolation,
  ColorMixOptions,
  ColorSpace,
} from "@ui-sdk/core/color"

// Cut a region out of an image into a new file. `await cropImage(file, { x: 0, y: 0, width: 512, height: 512 })` is a 512 by 512 PNG.
export { cropImage } from "@ui-sdk/core/image"
export type {
  CropImageOptions,
  ImageCrop,
  ImageRotation,
  ImageSource,
} from "@ui-sdk/core/image"

// Keyboard shortcuts scoped to open layers. `registerShortcut("mod+k", open)` returns an unregister function.
export {
  ariaKeyshortcuts,
  formatShortcut,
  registerShortcut,
  shortcuts,
} from "@ui-sdk/core/shortcuts"
export type {
  ShortcutHandler,
  ShortcutInfo,
  ShortcutKeys,
  ShortcutOptions,
  Shortcuts,
} from "@ui-sdk/core/shortcuts"
// Typed elements and change events, like `document.querySelector("ui-popover")?.addEventListener("openchange", …)`.
export type {
  AccordionEvents,
  AlertDialogEvents,
  ButtonEvents,
  CalendarEvents,
  CheckboxEvents,
  CheckboxGroupEvents,
  CollapsibleEvents,
  AutocompleteEvents,
  ColorPickerEvents,
  ComboboxEvents,
  CommandEvents,
  DateInputEvents,
  DatePickerEvents,
  DialogEvents,
  DrawerEvents,
  HoverCardEvents,
  ImageCropperEvents,
  InputEvents,
  ListboxEvents,
  OTPInputEvents,
  AvatarEvents,
  FileInputEvents,
  MenuEvents,
  NavigationMenuEvents,
  NumberInputEvents,
  PaginationEvents,
  CarouselEvents,
  PasswordInputEvents,
  PopoverEvents,
  RadioGroupEvents,
  RatingEvents,
  ResizableEvents,
  SegmentedControlEvents,
  SelectEvents,
  SliderEvents,
  SwitchEvents,
  TabsEvents,
  TimeInputEvents,
  TokenInputEvents,
  ToggleEvents,
  ToggleGroupEvents,
  TooltipEvents,
  TreeEvents,
  WaterfallEvents,
  TriggerMenuEvents,
  UiAccordionElement,
  UiAlertDialogElement,
  UiButtonElement,
  UiCalendarElement,
  UiChangeDetail,
  UiChangeEvent,
  UiCheckboxElement,
  UiCheckboxGroupElement,
  UiTimelineElement,
  UiCollapsibleElement,
  UiAutocompleteElement,
  UiColorPickerElement,
  UiComboboxElement,
  UiCommandElement,
  UiDateInputElement,
  UiDatePickerElement,
  UiDetailedChangeEvent,
  UiDialogElement,
  UiDrawerElement,
  UiFileInputElement,
  UiDismissAttemptEvent,
  UiElement,
  UiFieldElement,
  UiFieldGroupElement,
  UiFieldSetElement,
  UiHighlightEvent,
  UiHoverCardElement,
  UiImageCropperElement,
  UiInputElement,
  UiInputGroupElement,
  UiListboxElement,
  UiOTPInputElement,
  UiAvatarElement,
  UiGaugeElement,
  UiMeterElement,
  UiScrollAreaElement,
  UiMenuElement,
  UiMenuSubElement,
  UiNavigationMenuElement,
  UiNumberInputElement,
  UiOpenChangeCompleteEvent,
  UiPaginationElement,
  UiCarouselElement,
  UiPasswordInputElement,
  UiOverlayHostElement,
  UiPopoverElement,
  UiRadioElement,
  UiRadioGroupElement,
  UiRatingElement,
  UiResizableElement,
  UiSegmentedControlElement,
  UiSegmentedControlItemElement,
  UiSelectElement,
  UiSeparatorElement,
  UiSliderElement,
  UiSwitchElement,
  UiTabsElement,
  UiTextareaElement,
  UiTimeInputElement,
  UiToastRegionElement,
  UiTokenInputElement,
  UiTreeElement,
  UiWaterfallElement,
  UiToggleElement,
  UiToggleGroupElement,
  UiTooltipElement,
  UiTriggerMenuElement,
} from "./events"
