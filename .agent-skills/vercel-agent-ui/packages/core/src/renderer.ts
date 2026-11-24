/**
 * For framework renderers only: the pieces `@ui-sdk/react`, `@ui-sdk/vue`,
 * `@ui-sdk/solid`, `@ui-sdk/svelte` and `@ui-sdk/web` build their parts on,
 * and the types their emitted declarations name, which a package's
 * declarations can only reach through an entry. It isn't documented, it may
 * change with any release, and nothing here is public API.
 *
 * @module
 */
export { warn } from "#dev"
export type { AutocompleteItemMeta } from "./components/autocomplete/autocomplete-api"
export { pageItems } from "./components/command/command-data"
export {
  comboboxChips,
  comboboxCreate,
  comboboxItemIcons,
  comboboxSelectAll,
} from "./components/combobox/combobox-parts"
export {
  menuCheckable,
  menuContextTrigger,
  menuItemIcons,
} from "./components/menu/menu-parts"
export type { NavigationMenuInternalOptions } from "./components/navigation-menu/navigation-menu-api"
export type { GaugeOptions } from "./foundation/gauge/gauge"
export type { ToastRegionInternalOptions } from "./components/toast/toast-api"
export {
  selectItemIcons,
  selectSelectAll,
} from "./components/select/select-parts"
export { toasterInternals, type Toaster } from "./components/toast/toaster"
export {
  checkFieldOutside,
  fieldOutsideAttrs,
  fieldOutsideErrorShown,
  type FieldOutsideSlot,
  fieldOutsideState,
} from "./components/field/field-outside"
export { fileKey } from "./components/file-input/file-input-api"
export { renderStaticHtml } from "./components/token-input/token-input-view"
export type { AccordionGeneric } from "./components/accordion/accordion-generic"
export type { CheckboxGroupGeneric } from "./components/checkbox/checkbox-group"
export type { ComboboxGeneric } from "./components/combobox/combobox-generic"
export type { ListboxGeneric } from "./components/listbox/listbox-root-generic"
export type { MenuGeneric } from "./components/menu/menu-generic"
export type { NavigationMenuGeneric } from "./components/navigation-menu/navigation-menu-generic"
export type { RadioGroupGeneric } from "./components/radio/radio-generic"
export type { SegmentedControlGeneric } from "./components/segmented-control/segmented-control-generic"
export type { SelectGeneric } from "./components/select/select-generic"
export type { SliderGeneric } from "./components/slider/slider-generic"
export type { TabsGeneric } from "./components/tabs/tabs-generic"
export type { ToggleGroupGeneric } from "./components/toggle/toggle-group"
export type { TreeGeneric } from "./components/tree/tree-generic"
export type { TriggerMenuGeneric } from "./components/trigger-menu/trigger-menu-generic"
export type { RovingScope } from "./foundation/focus/roving-scope"
export {
  attachFormInternals,
  elementMoved,
  fieldControlId,
  validityChanged,
} from "./foundation/forms/form"
export {
  bindElementInternals,
  formCallback,
} from "./foundation/forms/form-internals"
export { writeFromScript } from "./foundation/forms/value"
export { canceledAction } from "./foundation/kernel/action"
export { createListSnapshots } from "./foundation/kernel/controlled-lists"
export { on } from "./foundation/kernel/events"
export {
  applyAttrs,
  markAuthored,
  releaseAttrs,
} from "./foundation/kernel/live"
export { inDocumentOrder } from "./foundation/kernel/order"
export {
  attrs,
  bind,
  commit,
  conditional,
  connect,
  directNames,
  followed,
  handlers,
  partState,
  present,
  press,
  ref,
  selectedKeys,
  subscribe,
  takeOwnId,
  madeLabel,
  touched,
  yieldToAuthor,
} from "./foundation/kernel/part"
export { runBindWrites } from "./foundation/kernel/after-bind"
export { noteEarlyText } from "./foundation/kernel/early-text"
export { keep, release, unwatched } from "./foundation/kernel/keep"
export { renderVersion, schemaOf } from "./foundation/kernel/primitive"
export type {
  BaseSlotProps,
  Feature,
  PrimitiveGeneric,
  PrimitiveSchema,
  WithFeatures,
  WithGeneric,
} from "./foundation/kernel/primitive-types"
export {
  type Listener,
  sameSlotState,
  sameValue,
  writes,
} from "./foundation/kernel/store"
export type { ItemIconProps, ItemIconState } from "./foundation/lists/item-icon"
export {
  flattenData,
  itemKey,
  type ListEmptyState,
  type ListStatusState,
} from "./foundation/lists/listbox-engine"
export type { ListItemTextState } from "./foundation/lists/listbox-search"
export { selectAllKey } from "./foundation/lists/listbox-keys"
export { type ListSelectAllState } from "./foundation/lists/listbox-select-all"
export {
  initialApple,
  isApple,
  portalTarget,
} from "./foundation/platform/platform"
export { writeStyle } from "./foundation/platform/style"
export { parseRange } from "./foundation/number/parse"
