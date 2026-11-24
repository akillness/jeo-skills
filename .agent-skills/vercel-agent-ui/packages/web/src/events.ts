import type { PreferenceLike } from "@ui-sdk/core"
import type {
  TreeAnnouncement,
  TreeCheckedChangeReason,
  TreeController,
  TreeExpandedChangeReason,
  TreeItemData,
  TreeValueChangeReason,
} from "@ui-sdk/core/tree"
import type {
  AccordionController,
  AccordionValueChangeReason,
} from "@ui-sdk/core/accordion"
import type {
  CheckboxCheckedChangeReason,
  CheckboxController,
  CheckboxGroupController,
  CheckboxGroupValueChangeReason,
} from "@ui-sdk/core/checkbox"
import type {
  SwitchCheckedChangeReason,
  SwitchController,
} from "@ui-sdk/core/switch"
import type {
  CollapsibleController,
  CollapsibleOpenChangeReason,
} from "@ui-sdk/core/collapsible"
import type {
  FileInputController,
  FileInputOptions,
  FileInputValueChangeDetails,
  FileInputValueChangeReason,
  FileRejection,
} from "@ui-sdk/core/file-input"
import type {
  AlertDialogController,
  AlertDialogOpenChangeReason,
  AlertDialogPayloadChangeReason,
  DialogController,
  DialogDismissAttemptDetails,
  DialogOpenChangeDetails,
  DialogPayloadChangeReason,
} from "@ui-sdk/core/dialog"
import type {
  DrawerController,
  DrawerDismissReason,
  DrawerOpenChangeReason,
  DrawerOptions,
  DrawerPayloadChangeReason,
  DrawerSnapPointChangeReason,
  SnapPoint,
} from "@ui-sdk/core/drawer"
import type {
  MenuCheckedChangeDetails,
  MenuData,
  MenuController,
  MenuDismissReason,
  MenuOpenChangeReason,
  MenuPayloadChangeReason,
  MenuValueChangeDetails,
} from "@ui-sdk/core/menu"
import type {
  HoverCardController,
  HoverCardOpenChangeReason,
  HoverCardPayloadChangeReason,
} from "@ui-sdk/core/hover-card"
import type {
  ImageCrop,
  ImageCropperController,
  ImageCropperCropChangeDetails,
  ImageCropperCropCommitDetails,
} from "@ui-sdk/core/image-cropper"
import type {
  NavigationMenuController,
  NavigationMenuValueChangeReason,
} from "@ui-sdk/core/navigation-menu"
import type {
  InputController,
  InputValueChangeReason,
} from "@ui-sdk/core/input"
import type {
  NumberInputController,
  NumberInputOptions,
  NumberInputValueChangeReason,
} from "@ui-sdk/core/number-input"
import type {
  OTPInputController,
  OTPInputValueChangeReason,
} from "@ui-sdk/core/otp-input"
import type {
  SliderController,
  SliderOptions,
  SliderValueChangeDetails,
  SliderValueCommitDetails,
} from "@ui-sdk/core/slider"
import type {
  PaginationController,
  PaginationPageChangeReason,
} from "@ui-sdk/core/pagination"
import type {
  CalendarAnchorChangeReason,
  CalendarController,
  CalendarFocusedChangeReason,
  CalendarMonthChangeReason,
  CalendarValue,
  CalendarValueChangeReason,
  DateMatchers,
  ISOMonth,
} from "@ui-sdk/core/calendar"
import type { ISODate } from "@ui-sdk/core/date"
import type {
  DatePickerController,
  DatePickerDismissReason,
  DatePickerMonthChangeReason,
  DatePickerOpenChangeReason,
  DatePickerValue,
  DatePickerValueChangeReason,
} from "@ui-sdk/core/date-picker"
import type {
  DateInputController,
  DateInputValueChangeReason,
} from "@ui-sdk/core/date-input"
import type {
  TimeInputController,
  TimeInputValueChangeReason,
} from "@ui-sdk/core/time-input"
import type {
  CarouselController,
  CarouselPageChangeReason,
  CarouselPlayingChangeReason,
} from "@ui-sdk/core/carousel"
import type {
  PasswordInputController,
  PasswordInputVisibleChangeReason,
} from "@ui-sdk/core/password-input"
import type {
  ListboxController,
  ListboxOptions,
  ListboxValueChangeReason,
} from "@ui-sdk/core/listbox"
import type {
  AvatarLoadingStatus,
  AvatarLoadingStatusChangeReason,
} from "@ui-sdk/core/avatar"
import type { GaugeOptions } from "@ui-sdk/core/renderer"
import type { MeterOptions } from "@ui-sdk/core/meter"
import type {
  PopoverController,
  PopoverDismissReason,
  PopoverOpenChangeReason,
  PopoverPayloadChangeReason,
} from "@ui-sdk/core/popover"
import type {
  RadioGroupController,
  RadioGroupValueChangeReason,
} from "@ui-sdk/core/radio"
import type {
  RatingController,
  RatingOptions,
  RatingValueChangeReason,
} from "@ui-sdk/core/rating"
import type { ScrollAreaController } from "@ui-sdk/core/scroll-area"
import type {
  SegmentedControlController,
  SegmentedControlValueChangeReason,
} from "@ui-sdk/core/segmented-control"
import type { SeparatorOptions } from "@ui-sdk/core/separator"
import type { label } from "@ui-sdk/core/label"
import type {
  SelectController,
  SelectDismissReason,
  SelectOpenChangeReason,
  SelectOptions,
  SelectQueryChangeReason,
  SelectValueChangeReason,
} from "@ui-sdk/core/select"
import type {
  ColorPickerController,
  ColorPickerValueChangeDetails,
  ColorPickerValueCommitDetails,
} from "@ui-sdk/core/color-picker"
import type {
  ComboboxController,
  ComboboxDismissReason,
  ComboboxOpenChangeReason,
  ComboboxOptions,
  ComboboxQueryChangeReason,
  ComboboxValueChangeReason,
} from "@ui-sdk/core/combobox"
import type { ListData, ListHighlightDetails } from "@ui-sdk/core/select"
import type {
  AutocompleteController,
  AutocompleteDismissReason,
  AutocompleteOpenChangeReason,
  AutocompleteOptions,
  AutocompleteValueChangeDetails,
} from "@ui-sdk/core/autocomplete"
import type {
  CommandController,
  CommandData,
  CommandOptions,
  CommandPagesChangeReason,
  CommandQueryChangeReason,
  CommandValueChangeReason,
} from "@ui-sdk/core/command"
import type {
  UndoStackOptions,
  Token,
  TokenCodec,
  TokenInputController,
  TokenInputValue,
  TokenInputValueChangeDetails,
} from "@ui-sdk/core/token-input"
import type {
  TextEditorAdapter,
  TriggerDefinition,
  TriggerMenuController,
  TriggerMenuDismissReason,
  TriggerMenuOpenChangeReason,
  TriggerMenuQueryChangeReason,
  TriggerMenuSelectDetails,
} from "@ui-sdk/core/trigger-menu"
import type {
  ResizableController,
  ResizableLayoutChangeReason,
  ResizableStorage,
} from "@ui-sdk/core/resizable"
import type { TabsController, TabsValueChangeReason } from "@ui-sdk/core/tabs"
import type {
  ToggleController,
  ToggleGroupController,
  ToggleGroupValueChangeReason,
  TogglePressedChangeReason,
} from "@ui-sdk/core/toggle"
import type { Toast, Toaster } from "@ui-sdk/core/toast"
import type { Overlays } from "@ui-sdk/core/overlays"
import type { OverlayHostToastOptions } from "./overlays"
import type { ToolbarController } from "@ui-sdk/core/toolbar"
import type { TimelineController } from "@ui-sdk/core/timeline"
import type { MenubarController } from "@ui-sdk/core/menubar"
import type {
  TooltipController,
  TooltipOpenChangeReason,
  TooltipPayloadChangeReason,
} from "@ui-sdk/core/tooltip"
import type { accordion } from "@ui-sdk/core/accordion"
import type { alertDialog } from "@ui-sdk/core/alert-dialog"
import type { autocomplete } from "@ui-sdk/core/autocomplete"
import type { avatar } from "@ui-sdk/core/avatar"
import type { button } from "@ui-sdk/core/button"
import type { calendar } from "@ui-sdk/core/calendar"
import type { carousel } from "@ui-sdk/core/carousel"
import type { checkbox, checkboxGroup } from "@ui-sdk/core/checkbox"
import type { timeline } from "@ui-sdk/core/timeline"
import type { collapsible } from "@ui-sdk/core/collapsible"
import type { colorPicker } from "@ui-sdk/core/color-picker"
import type { combobox } from "@ui-sdk/core/combobox"
import type { command } from "@ui-sdk/core/command"
import type { dateInput } from "@ui-sdk/core/date-input"
import type { datePicker } from "@ui-sdk/core/date-picker"
import type { timeInput } from "@ui-sdk/core/time-input"
import type { dialog } from "@ui-sdk/core/dialog"
import type { drawer } from "@ui-sdk/core/drawer"
import type { field, fieldGroup, fieldSet } from "@ui-sdk/core/field"
import type { fileInput } from "@ui-sdk/core/file-input"
import type { hoverCard } from "@ui-sdk/core/hover-card"
import type { imageCropper } from "@ui-sdk/core/image-cropper"
import type { input, inputGroup, textarea } from "@ui-sdk/core/input"
import type { listbox } from "@ui-sdk/core/listbox"
import type { menu } from "@ui-sdk/core/menu"
import type { menubar } from "@ui-sdk/core/menubar"
import type { meter } from "@ui-sdk/core/meter"
import type { navigationMenu } from "@ui-sdk/core/navigation-menu"
import type { numberInput } from "@ui-sdk/core/number-input"
import type { otpInput } from "@ui-sdk/core/otp-input"
import type { pagination } from "@ui-sdk/core/pagination"
import type { passwordInput } from "@ui-sdk/core/password-input"
import type { popover } from "@ui-sdk/core/popover"
import type { progress } from "@ui-sdk/core/progress"
import type { radioGroup } from "@ui-sdk/core/radio"
import type { rating } from "@ui-sdk/core/rating"
import type { resizable } from "@ui-sdk/core/resizable"
import type { scrollArea } from "@ui-sdk/core/scroll-area"
import type { segmentedControl } from "@ui-sdk/core/segmented-control"
import type { select } from "@ui-sdk/core/select"
import type { slider } from "@ui-sdk/core/slider"
import type { switchPrimitive } from "@ui-sdk/core/switch"
import type { tabs } from "@ui-sdk/core/tabs"
import type { toastRegion } from "@ui-sdk/core/toast"
import type { toggle, toggleGroup } from "@ui-sdk/core/toggle"
import type { tokenInput } from "@ui-sdk/core/token-input"
import type { toolbar } from "@ui-sdk/core/toolbar"
import type { tooltip } from "@ui-sdk/core/tooltip"
import type { tree } from "@ui-sdk/core/tree"
import type {
  waterfall,
  WaterfallController,
  WaterfallDataItem,
  WaterfallExpandedChangeReason,
  WaterfallValueChangeReason,
} from "@ui-sdk/core/waterfall"
import type { triggerMenu } from "@ui-sdk/core/trigger-menu"
import type { UiActionDetail } from "./action"
import type { ToastContent } from "./toast"
import type {
  ChangeDetails,
  CommitDetails,
  DismissAttemptDetails,
  DismissAttemptReason,
  OptionsOf,
  Primitive,
  PropsOf,
  SlotName,
  TypesOf,
} from "@ui-sdk/core"

// Omit for each member of a union, so a reason still narrows its event.
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never

/**
 * What a change event carries in `detail`: the new `value`, and the change
 * details without `cancel`. Call `preventDefault()` to cancel the change.
 * Checking `detail.reason` narrows `detail.event`, like in the other frameworks.
 * @stable
 */
type UiChangeDetail<
  Value,
  Details extends { reason: string },
> = DistributiveOmit<Details, "cancel" | "canceled"> & { value: Value }

/**
 * A change event, like `openchange` or `valuechange`.
 * @stable
 */
type UiChangeEvent<Value, Reason extends string = string> = CustomEvent<
  UiChangeDetail<Value, ChangeDetails<Reason>>
>

/**
 * A change event whose details carry more than the shared fields, like a menu's `checkedchange`.
 * @stable
 */
type UiDetailedChangeEvent<
  Value,
  Details extends { reason: string },
> = CustomEvent<UiChangeDetail<Value, Details>>

/**
 * An `openchangecomplete` event: whether it opened or closed, once any animation finished.
 * @stable
 */
type UiOpenChangeCompleteEvent = CustomEvent<{ value: boolean }>

/**
 * A `dismissattempt` event: `dismissible` refused a dismissal, with its `reason` and `event` in `detail`.
 * @stable
 */
type UiDismissAttemptEvent<Reason extends DismissAttemptReason> = CustomEvent<
  DismissAttemptDetails<Reason>
>

/**
 * An element's attribute options as properties, like `loop` on `<ui-tabs>`:
 * each option an attribute can hold, besides the ones the element types
 * itself (`Own`) and the ones every element already has, like `dir`.
 * Booleans read true or false; the rest read undefined without the attribute.
 * @stable
 */
type AttributeProperties<P extends Primitive, Own extends string = never> = {
  -readonly [
    K in keyof OptionsOf<P> & string as K extends
      Own | keyof HTMLElement | "id" | `on${string}`
      ? never
      : NonNullable<OptionsOf<P>[K]> extends
            string | number | boolean | readonly string[]
        ? K
        : never
  ]-?: NonNullable<OptionsOf<P>[K]> extends boolean
    ? boolean
    : OptionsOf<P>[K] | undefined
}

// What an attribute of a part holds: the prop's text, number or list, the
// boolean of a three-way one, like a field error's `match`, or the selector
// that stands in for an element, like a popup's `container`.
type AttributeValue<T> = [
  Extract<T, string | number | boolean | readonly string[]>,
] extends [never]
  ? string
  : Extract<T, string | number | boolean | readonly string[]>

/**
 * A part element's props as properties, like `disabled` on `<ui-tabs-tab>`:
 * the props its attributes hold (`Attributes`), each reflected like a root's
 * options, and the values only a property can hold (`Properties`), like a
 * trigger's `payload`. Booleans read true or false; the rest read undefined until set.
 * @experimental
 */
type PartProperties<
  P extends Primitive,
  S extends SlotName<P>,
  Attributes extends keyof PropsOf<P, S> & string,
  Properties extends keyof PropsOf<P, S> & string,
> = {
  -readonly [K in Attributes]-?: NonNullable<PropsOf<P, S>[K]> extends boolean
    ? boolean
    : AttributeValue<PropsOf<P, S>[K]> | undefined
} & { -readonly [K in Properties]-?: PropsOf<P, S>[K] | undefined }

// The `detail` of a callback's event, as `withEvents` in define-element.ts
// builds it from the arguments: the details without `cancel` and the value,
// or the details alone when they're the only argument.
type ArgumentsDetail<Value, Rest extends unknown[]> = Rest extends []
  ? [Value] extends [{ reason: string }]
    ? DistributiveOmit<Value, "cancel" | "canceled">
    : { value: Value }
  : Rest[0] extends infer Details extends { reason: string }
    ? UiChangeDetail<Value, Details>
    : DistributiveOmit<NonNullable<Rest[0]>, "cancel" | "canceled"> & {
        value: Value
      }

// An action, a callback that returns `unknown` or may return a Promise, hands listeners `waitUntil()` too.
type CallbackDetail<Callback> = Callback extends (
  value: infer Value,
  ...rest: infer Rest
) => infer Result
  ? unknown extends Result
    ? ArgumentsDetail<Value, Rest> & Pick<UiActionDetail, "waitUntil">
    : [Extract<Result, PromiseLike<unknown>>] extends [never]
      ? ArgumentsDetail<Value, Rest>
      : ArgumentsDetail<Value, Rest> & Pick<UiActionDetail, "waitUntil">
  : never

/**
 * The events a part fires, one for each of its slot's callbacks, named like
 * a root's: `onOpenChange` fires `openchange`, like an accordion item's.
 * @experimental
 */
type PartEvents<P extends Primitive, S extends SlotName<P>> = {
  [
    K in keyof PropsOf<P, S> &
      string as K extends `on${infer Name extends Capitalize<string>}`
      ? Lowercase<Name>
      : never
  ]-?: CustomEvent<CallbackDetail<NonNullable<PropsOf<P, S>[K]>>>
}

// The events of a part that runs an action, like a dialog's close with an
// `action` attribute, which fires `action` itself (see `action.ts`).
type ActionEvents = { action: CustomEvent<UiActionDetail> }

/**
 * The element of a primitive's part, like `<ui-tabs-tab>` for the tabs'
 * `tab` slot, with its props as properties (see `PartProperties`) and typed
 * events (`PartEvents`, unless the element fires others itself).
 * @experimental
 */
type UiPartElement<
  P extends Primitive,
  S extends SlotName<P>,
  Attributes extends keyof PropsOf<P, S> & string = never,
  Properties extends keyof PropsOf<P, S> & string = never,
  Events = PartEvents<P, S>,
> = UiElement<Events> & PartProperties<P, S, Attributes, Properties>

// What a form-associated element has beside its options, like a native
// input: `formAssociated` in define-element.ts adds these through
// ElementInternals. `form` is the form itself, though the attribute names
// one by id, as on an <input>.
interface FormAssociatedMembers {
  /** The form it belongs to, like a native input's. */
  readonly form: HTMLFormElement | null
  /** The labels that name it, like a native input's. */
  readonly labels: NodeList
  // Described by each component's `name` option.
  name: string
  /** Whether its value is valid, and why not, like a native input's. */
  readonly validity: ValidityState
  /** The message the browser shows while its value isn't valid, else an empty string. */
  readonly validationMessage: string
  /** Whether its value is checked when its form submits: false while it's disabled or read-only. */
  readonly willValidate: boolean
  /** Whether its value is valid. When it isn't, fires `invalid` on it. */
  checkValidity(): boolean
  /** Whether its value is valid. When it isn't, fires `invalid` on it and shows the browser's message. */
  reportValidity(): boolean
  /** Makes its value invalid with this message, or valid again with an empty string. */
  setCustomValidity(message: string): void
}

// A form-associated element's attribute options as properties, beside the
// members a native control has.
type FormControlProperties<
  P extends Primitive,
  Own extends string = never,
> = FormAssociatedMembers &
  AttributeProperties<P, Own | keyof FormAssociatedMembers>

/**
 * An element with typed listeners for its own events, like `openchange`, on
 * top of the usual DOM events.
 * @stable
 */
interface UiElement<Events> extends HTMLElement {
  addEventListener<K extends keyof Events>(
    type: K,
    listener: (this: this, event: Events[K]) => unknown,
    options?: boolean | AddEventListenerOptions
  ): void
  addEventListener<K extends keyof HTMLElementEventMap>(
    type: K,
    listener: (this: this, event: HTMLElementEventMap[K]) => unknown,
    options?: boolean | AddEventListenerOptions
  ): void
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ): void
  removeEventListener<K extends keyof Events>(
    type: K,
    listener: (this: this, event: Events[K]) => unknown,
    options?: boolean | EventListenerOptions
  ): void
  removeEventListener<K extends keyof HTMLElementEventMap>(
    type: K,
    listener: (this: this, event: HTMLElementEventMap[K]) => unknown,
    options?: boolean | EventListenerOptions
  ): void
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions
  ): void
}

type OpenEvents<Reason extends string> = {
  openchange: UiChangeEvent<boolean, Reason>
  openchangecomplete: UiOpenChangeCompleteEvent
}

/**
 * The events of `<ui-popover>`. `payloadchange` fires when another trigger's payload reaches the content.
 * @stable
 */
type PopoverEvents<Payload = unknown> = OpenEvents<PopoverOpenChangeReason> & {
  payloadchange: UiChangeEvent<Payload | undefined, PopoverPayloadChangeReason>
  dismissattempt: UiDismissAttemptEvent<PopoverDismissReason>
}
/**
 * `<ui-popover>`: `open`, the controller's methods on `api`, and typed events. `Payload` types its payload.
 * @stable
 */
interface UiPopoverElement<Payload = unknown>
  extends
    UiElement<PopoverEvents<Payload>>,
    AttributeProperties<typeof popover, "api" | "controller" | "open"> {
  open: boolean
  api: PopoverController<Payload>
  controller?: PopoverController<any>
}

/**
 * The events of `<ui-tooltip>`. `payloadchange` fires when another trigger's payload reaches the content.
 * @stable
 */
type TooltipEvents<Payload = unknown> = OpenEvents<TooltipOpenChangeReason> & {
  payloadchange: UiChangeEvent<Payload | undefined, TooltipPayloadChangeReason>
}
/**
 * `<ui-tooltip>`: `open`, the controller's methods on `api`, and typed events. `Payload` types its payload.
 * @stable
 */
interface UiTooltipElement<Payload = unknown>
  extends
    UiElement<TooltipEvents<Payload>>,
    AttributeProperties<typeof tooltip, "api" | "controller" | "open"> {
  open: boolean
  api: TooltipController<Payload>
  controller?: TooltipController<any>
}

/**
 * The events of `<ui-hover-card>`. `payloadchange` fires when another trigger's payload reaches the content.
 * @stable
 */
type HoverCardEvents<Payload = unknown> =
  OpenEvents<HoverCardOpenChangeReason> & {
    payloadchange: UiChangeEvent<
      Payload | undefined,
      HoverCardPayloadChangeReason
    >
  }
/**
 * `<ui-hover-card>`: `open`, the controller's methods on `api`, and typed events. `Payload` types its payload.
 * @stable
 */
interface UiHoverCardElement<Payload = unknown>
  extends
    UiElement<HoverCardEvents<Payload>>,
    AttributeProperties<typeof hoverCard, "api" | "controller" | "open"> {
  open: boolean
  api: HoverCardController<Payload>
  controller?: HoverCardController<any>
}

/**
 * The events of `<ui-menu>`. Checkbox and radio items report through it too. `payloadchange` fires
 * when another trigger's payload reaches the content.
 * @stable
 */
type MenuEvents<Payload = unknown> = OpenEvents<MenuOpenChangeReason> & {
  payloadchange: UiChangeEvent<Payload | undefined, MenuPayloadChangeReason>
  /** An item ran, with its value. Pass a Promise to `waitUntil()` to keep it pending, and the menu open, until it settles. */
  action: CustomEvent<{
    value: string
    event?: Event
    waitUntil: (promise: Promise<unknown>) => void
  }>
  checkedchange: UiDetailedChangeEvent<boolean, MenuCheckedChangeDetails>
  valuechange: UiDetailedChangeEvent<string, MenuValueChangeDetails>
  dismissattempt: UiDismissAttemptEvent<MenuDismissReason>
}
/**
 * `<ui-menu>`: `open`, the controller's methods on `api`, and typed events. `Payload` types its payload.
 * @stable
 */
interface UiMenuElement<Payload = unknown>
  extends
    UiElement<MenuEvents<Payload>>,
    AttributeProperties<typeof menu, "api" | "controller" | "items" | "open"> {
  open: boolean
  /** The menu as data. Renders the content for you. */
  items?: MenuData
  api: MenuController<Payload>
  controller?: MenuController<any>
}

/**
 * `<ui-menu-sub>`: `open`, the controller's methods on `api`, and typed events. It takes none of the root menu's popup options.
 * @stable
 */
interface UiMenuSubElement
  extends
    UiElement<MenuEvents>,
    AttributeProperties<
      typeof menu,
      | "container"
      | "dismissible"
      | "modal"
      | "open"
      | "presentation"
      | "shortcuts"
    > {
  open: boolean
  api: MenuController
}

/**
 * The events of `<ui-dialog>`. `openchange` carries the `returnValue` of what closed it, and
 * `payloadchange` fires when another trigger's payload reaches the content.
 * @stable
 */
type DialogEvents<Payload = unknown> = {
  openchange: UiDetailedChangeEvent<boolean, DialogOpenChangeDetails>
  openchangecomplete: UiOpenChangeCompleteEvent
  payloadchange: UiChangeEvent<Payload | undefined, DialogPayloadChangeReason>
  dismissattempt: CustomEvent<DialogDismissAttemptDetails>
}
/**
 * `<ui-dialog>`: `open`, the controller's methods on `api`, and typed events. `Payload` types its payload.
 * @stable
 */
interface UiDialogElement<Payload = unknown>
  extends
    UiElement<DialogEvents<Payload>>,
    AttributeProperties<typeof dialog, "api" | "controller" | "open"> {
  open: boolean
  api: DialogController<Payload>
  controller?: DialogController<any, any>
}

/**
 * The events of `<ui-alert-dialog>`. `payloadchange` fires when it opens with another payload.
 * @stable
 */
type AlertDialogEvents<Payload = unknown> = {
  openchange: UiDetailedChangeEvent<
    boolean,
    DialogOpenChangeDetails<AlertDialogOpenChangeReason>
  >
  openchangecomplete: UiOpenChangeCompleteEvent
  payloadchange: UiChangeEvent<
    Payload | undefined,
    AlertDialogPayloadChangeReason
  >
  dismissattempt: CustomEvent<DialogDismissAttemptDetails>
}
/**
 * `<ui-alert-dialog>`: `open`, the controller's methods on `api`, and typed events. `Payload` types its payload.
 * @stable
 */
interface UiAlertDialogElement<Payload = unknown>
  extends
    UiElement<AlertDialogEvents<Payload>>,
    AttributeProperties<typeof alertDialog, "api" | "controller" | "open"> {
  open: boolean
  api: AlertDialogController<Payload>
  controller?: AlertDialogController<any, any>
}

/**
 * The events of `<ui-drawer>`. `snappointchange` fires when it moves to another snap point.
 * @stable
 */
type DrawerEvents<Payload = unknown> = {
  openchange: UiDetailedChangeEvent<
    boolean,
    DialogOpenChangeDetails<DrawerOpenChangeReason>
  >
  openchangecomplete: UiOpenChangeCompleteEvent
  payloadchange: UiChangeEvent<Payload | undefined, DrawerPayloadChangeReason>
  snappointchange: UiChangeEvent<SnapPoint, DrawerSnapPointChangeReason>
  dismissattempt: UiDismissAttemptEvent<DrawerDismissReason>
}
/**
 * `<ui-drawer>`: `open` and `snapPoint`, the controller's methods on `api`, and typed events. `Payload` types its payload.
 * @stable
 */
interface UiDrawerElement<Payload = unknown>
  extends
    UiElement<DrawerEvents<Payload>>,
    Pick<DrawerOptions, "physics" | "snapPoints">,
    AttributeProperties<
      typeof drawer,
      "api" | "controller" | "open" | "snapPoint"
    > {
  open: boolean
  snapPoint: SnapPoint | null
  api: DrawerController<Payload>
  controller?: DrawerController<any, any>
}

/**
 * The events of `<ui-collapsible>`.
 * @stable
 */
type CollapsibleEvents = OpenEvents<CollapsibleOpenChangeReason>
/**
 * `<ui-collapsible>`: `open` and typed events.
 * @stable
 */
interface UiCollapsibleElement
  extends
    UiElement<CollapsibleEvents>,
    AttributeProperties<typeof collapsible, "api" | "open"> {
  open: boolean
  api: CollapsibleController
}

/**
 * The events of `<ui-accordion>`. Items report `openchange` and `openchangecomplete` on themselves, which the accordion hears with `{ capture: true }`.
 * @stable
 */
type AccordionEvents = OpenEvents<AccordionValueChangeReason> & {
  valuechange: UiChangeEvent<string[], AccordionValueChangeReason>
}
/**
 * `<ui-accordion>`: `value` and typed events.
 * @stable
 */
interface UiAccordionElement
  extends
    UiElement<AccordionEvents>,
    AttributeProperties<typeof accordion, "api" | "value"> {
  value: string[]
  api: AccordionController
}

/**
 * The events of `<ui-tabs>`.
 * @stable
 */
type TabsEvents = {
  valuechange: UiChangeEvent<string | null, TabsValueChangeReason>
}
/**
 * `<ui-tabs>`: `value` and typed events.
 * @stable
 */
interface UiTabsElement
  extends
    UiElement<TabsEvents>,
    AttributeProperties<typeof tabs, "api" | "value"> {
  value: string | null
  api: TabsController
}

/**
 * The events of `<ui-navigation-menu>`.
 * @stable
 */
type NavigationMenuEvents = {
  valuechange: UiChangeEvent<string | null, NavigationMenuValueChangeReason>
  openchangecomplete: UiOpenChangeCompleteEvent
}
/**
 * `<ui-navigation-menu>`: `value`, the controller's methods on `api`, and typed events.
 * @stable
 */
interface UiNavigationMenuElement
  extends
    UiElement<NavigationMenuEvents>,
    AttributeProperties<typeof navigationMenu, "api" | "controller" | "value"> {
  value: string | null
  api: NavigationMenuController
  controller?: NavigationMenuController
}

/**
 * The events of `<ui-resizable>`.
 * @stable
 */
type ResizableEvents = {
  layoutchange: UiChangeEvent<number[], ResizableLayoutChangeReason>
  layoutcommit: UiDetailedChangeEvent<
    number[],
    CommitDetails<ResizableLayoutChangeReason>
  >
}
/**
 * `<ui-resizable>`: `layout`, the controller's methods on `api`, and typed events.
 * @stable
 */
interface UiResizableElement
  extends
    UiElement<ResizableEvents>,
    AttributeProperties<
      typeof resizable,
      "api" | "controller" | "layout" | "storage"
    > {
  layout: number[]
  /** Where `auto-save-id` saves, instead of `localStorage`. */
  storage?: ResizableStorage
  api: ResizableController
  controller?: ResizableController
}

/**
 * The events of `<ui-checkbox>`.
 * @stable
 */
type CheckboxEvents = {
  checkedchange: UiChangeEvent<
    boolean | "indeterminate",
    CheckboxCheckedChangeReason
  >
}
/**
 * `<ui-checkbox>`: `checked`, the controller's methods on `api`, form members like a native input, and typed events.
 * @stable
 */
interface UiCheckboxElement
  extends
    UiElement<CheckboxEvents>,
    FormControlProperties<typeof checkbox, "api" | "checked"> {
  checked: boolean | "indeterminate"
  api: CheckboxController
}

/**
 * The events of `<ui-switch>`. A switch is never indeterminate.
 * @stable
 */
type SwitchEvents = {
  checkedchange: UiChangeEvent<boolean, SwitchCheckedChangeReason>
}
/**
 * `<ui-switch>`: `checked`, the controller's methods on `api`, form members like a native input, and typed events.
 * @stable
 */
interface UiSwitchElement
  extends
    UiElement<SwitchEvents>,
    FormControlProperties<typeof switchPrimitive, "api" | "checked"> {
  checked: boolean
  api: SwitchController
}

/**
 * The events of `<ui-checkbox-group>`.
 * @stable
 */
type CheckboxGroupEvents = {
  valuechange: UiChangeEvent<string[], CheckboxGroupValueChangeReason>
}
/**
 * `<ui-checkbox-group>`: `value`, form members like a native input, and typed events.
 * @stable
 */
interface UiCheckboxGroupElement
  extends
    UiElement<CheckboxGroupEvents>,
    FormControlProperties<typeof checkboxGroup, "api" | "value"> {
  value: string[]
  api: CheckboxGroupController
}

/**
 * The events of `<ui-radio-group>`.
 * @stable
 */
type RadioGroupEvents = {
  valuechange: UiChangeEvent<string | null, RadioGroupValueChangeReason>
}
/**
 * `<ui-radio-group>`: `value`, form members like a native input, and typed events.
 * @stable
 */
interface UiRadioGroupElement
  extends
    UiElement<RadioGroupEvents>,
    FormControlProperties<typeof radioGroup, "api" | "value"> {
  value: string | null
  api: RadioGroupController
}

/**
 * `<ui-radio>`: `value` and `disabled`, and form members like a native radio. Its group's `name` names the value.
 * @stable
 */
interface UiRadioElement
  extends
    UiPartElement<typeof radioGroup, "root", "value" | "disabled">,
    Omit<FormAssociatedMembers, "name"> {}

/**
 * The events of `<ui-rating>`.
 * @experimental
 */
type RatingEvents = {
  valuechange: UiChangeEvent<number | null, RatingValueChangeReason>
}
/**
 * `<ui-rating>`: `value`, `getValueLabel`, form members like a native input, and typed events.
 * @experimental
 */
interface UiRatingElement
  extends
    UiElement<RatingEvents>,
    FormControlProperties<typeof rating, "api" | "value">,
    Pick<RatingOptions, "getValueLabel"> {
  value: number | null
  api: RatingController
}

/**
 * The events of `<ui-segmented-control>`.
 * @experimental
 */
type SegmentedControlEvents = {
  valuechange: UiChangeEvent<string | null, SegmentedControlValueChangeReason>
}
/**
 * `<ui-segmented-control>`: `value`, form members like a native input, and typed events.
 * @experimental
 */
interface UiSegmentedControlElement
  extends
    UiElement<SegmentedControlEvents>,
    FormControlProperties<typeof segmentedControl, "api" | "value"> {
  value: string | null
  api: SegmentedControlController
}

/**
 * `<ui-segmented-control-item>`: `value` and `disabled`, and form members like a native radio.
 * Its control's `name` names the value.
 * @experimental
 */
interface UiSegmentedControlItemElement
  extends
    UiPartElement<typeof segmentedControl, "item", "value" | "disabled">,
    Omit<FormAssociatedMembers, "name"> {}

/**
 * The events of `<ui-input>` and `<ui-textarea>`.
 * @stable
 */
type InputEvents = {
  valuechange: UiChangeEvent<string, InputValueChangeReason>
}
/**
 * `<ui-input>`: `value`, the controller's methods on `api`, and typed events.
 * @stable
 */
interface UiInputElement
  extends
    UiElement<InputEvents>,
    AttributeProperties<typeof input, "api" | "value"> {
  value: string
  api: InputController
}

/**
 * `<ui-textarea>`: `value`, `autoResize`, `submitShortcut`, the controller's methods on `api`, and typed events.
 * @stable
 */
interface UiTextareaElement
  extends
    UiElement<InputEvents>,
    AttributeProperties<typeof textarea, "api" | "value"> {
  value: string
  api: InputController
}

/**
 * The events of `<ui-password-input>`.
 * @stable
 */
type PasswordInputEvents = {
  valuechange: UiChangeEvent<string, InputValueChangeReason>
  visiblechange: UiChangeEvent<boolean, PasswordInputVisibleChangeReason>
}
/**
 * `<ui-password-input>`: `value` and `visible`, the controller's methods on `api`, and typed events.
 * @stable
 */
interface UiPasswordInputElement
  extends
    UiElement<PasswordInputEvents>,
    AttributeProperties<
      typeof passwordInput,
      "api" | "controller" | "value" | "visible"
    > {
  value: string
  visible: boolean
  api: PasswordInputController
  controller?: PasswordInputController
}

/**
 * The events of `<ui-listbox>`.
 * @stable
 */
type ListboxEvents = {
  valuechange: UiChangeEvent<unknown, ListboxValueChangeReason>
  highlight: UiHighlightEvent
}
/**
 * `<ui-listbox>`: `value`, rich options, the controller's methods on `api`, form members like a native input, and typed events.
 * @stable
 */
interface UiListboxElement
  extends
    UiElement<ListboxEvents>,
    Pick<ListboxOptions<unknown>, "itemToValue" | "isItemEqualToValue">,
    FormControlProperties<
      typeof listbox,
      "api" | "controller" | "items" | "value"
    > {
  /** The selected value. A string names an item by its key, comma-separated with `multiple`. */
  value: unknown
  /** The items as data. Renders them for you. */
  items?: ListData<unknown>
  api: ListboxController<unknown, boolean>
  controller?: ListboxController<any, any>
}

/**
 * The events of `<ui-carousel>`.
 * @stable
 */
type CarouselEvents = {
  pagechange: UiChangeEvent<number, CarouselPageChangeReason>
  /** The slides came to rest on a page: `detail.value`. */
  pagechangecomplete: CustomEvent<{ value: number }>
  playingchange: UiChangeEvent<boolean, CarouselPlayingChangeReason>
}
/**
 * `<ui-carousel>`: `page` and `playing`, the controller's methods on `api`, and typed events.
 * @stable
 */
interface UiCarouselElement
  extends
    UiElement<CarouselEvents>,
    AttributeProperties<
      typeof carousel,
      "api" | "controller" | "page" | "playing"
    > {
  page: number
  playing: boolean
  api: CarouselController
  controller?: CarouselController
}

/**
 * The events of `<ui-pagination>`.
 * @stable
 */
type PaginationEvents = {
  pagechange: UiChangeEvent<number, PaginationPageChangeReason>
}
/**
 * `<ui-pagination>`: `page`, the controller's methods on `api`, and typed events.
 * @stable
 */
interface UiPaginationElement
  extends
    UiElement<PaginationEvents>,
    AttributeProperties<
      typeof pagination,
      "api" | "controller" | "getHref" | "page"
    > {
  page: number
  api: PaginationController
  controller?: PaginationController
  /** The URL of a page. With it, wrap links instead of buttons. */
  getHref?: (page: number) => string
}

/**
 * The events of `<ui-calendar>`.
 * @stable
 */
type CalendarEvents = {
  valuechange: UiChangeEvent<CalendarValue, CalendarValueChangeReason>
  monthchange: UiChangeEvent<ISOMonth, CalendarMonthChangeReason>
  focusedchange: UiChangeEvent<ISODate, CalendarFocusedChangeReason>
  anchorchange: UiChangeEvent<ISODate | null, CalendarAnchorChangeReason>
}
/**
 * `<ui-calendar>`: `value` and `month`, the controller's methods on `api`, and typed events.
 * @stable
 */
interface UiCalendarElement
  extends
    UiElement<CalendarEvents>,
    AttributeProperties<
      typeof calendar,
      "api" | "controller" | "month" | "unavailable" | "value"
    > {
  value: CalendarValue
  month: ISOMonth
  api: CalendarController
  controller?: CalendarController
  /** Dates that can't be picked, as any matcher, like `{ weekday: [0, 6] }`. The attribute takes a list of dates. */
  unavailable?: DateMatchers
}

/**
 * The events of `<ui-date-picker>`.
 * @stable
 */
type DatePickerEvents = OpenEvents<DatePickerOpenChangeReason> & {
  valuechange: UiChangeEvent<DatePickerValue, DatePickerValueChangeReason>
  monthchange: UiChangeEvent<ISOMonth, DatePickerMonthChangeReason>
  dismissattempt: UiDismissAttemptEvent<DatePickerDismissReason>
}
/**
 * `<ui-date-picker>`: `value`, `month` and `open`, the controller's methods on `api`, form members like a native input, and typed events.
 * @stable
 */
interface UiDatePickerElement
  extends
    UiElement<DatePickerEvents>,
    FormControlProperties<
      typeof datePicker,
      "api" | "controller" | "month" | "open" | "unavailable" | "value"
    > {
  value: DatePickerValue
  month: ISOMonth
  open: boolean
  api: DatePickerController
  controller?: DatePickerController
  /** Dates that can't be picked, as any matcher, like `{ weekday: [0, 6] }`. The attribute takes a list of dates. */
  unavailable?: DateMatchers
}

/**
 * The events of `<ui-date-input>`. `valuechange` fires as a whole value forms, and with `null` as one empties.
 * @stable
 */
type DateInputEvents = {
  valuechange: UiChangeEvent<string | null, DateInputValueChangeReason>
}
/**
 * `<ui-date-input>`: `value`, the controller's methods on `api`, form members like a native input, and typed events.
 * @stable
 */
interface UiDateInputElement
  extends
    UiElement<DateInputEvents>,
    FormControlProperties<
      typeof dateInput,
      "api" | "controller" | "unavailable" | "value"
    > {
  value: string | null
  api: DateInputController
  controller?: DateInputController
  /** Dates that can't be chosen, as any matcher, like `{ weekday: [0, 6] }`. The attribute takes a list of dates. */
  unavailable?: DateMatchers
}

/**
 * The events of `<ui-time-input>`. `valuechange` fires as a whole time forms, and with `null` as one empties.
 * @stable
 */
type TimeInputEvents = {
  valuechange: UiChangeEvent<string | null, TimeInputValueChangeReason>
}
/**
 * `<ui-time-input>`: `value`, the controller's methods on `api`, form members like a native input, and typed events.
 * @stable
 */
interface UiTimeInputElement
  extends
    UiElement<TimeInputEvents>,
    FormControlProperties<typeof timeInput, "api" | "controller" | "value"> {
  value: string | null
  api: TimeInputController
  controller?: TimeInputController
}

/**
 * The events of `<ui-otp-input>`. `valuecommit` fires when a change fills every slot.
 * @stable
 */
type OTPInputEvents = {
  valuechange: UiChangeEvent<string, OTPInputValueChangeReason>
  valuecommit: UiDetailedChangeEvent<
    string,
    CommitDetails<OTPInputValueChangeReason>
  >
}
/**
 * `<ui-otp-input>`: `value`, the controller's methods on `api`, and typed events.
 * @stable
 */
interface UiOTPInputElement
  extends
    UiElement<OTPInputEvents>,
    AttributeProperties<typeof otpInput, "api" | "value"> {
  value: string
  api: OTPInputController
}

/**
 * The events of `<ui-slider>`. `valuechange` fires on every step of a drag, and `valuecommit` once the interaction ends.
 * @stable
 */
type SliderEvents = {
  valuechange: UiDetailedChangeEvent<
    number | number[],
    SliderValueChangeDetails
  >
  valuecommit: UiDetailedChangeEvent<
    number | number[],
    SliderValueCommitDetails
  >
}
/**
 * `<ui-slider>`: `value`, the controller's methods on `api`, form members like a native input, and typed events.
 * @stable
 */
interface UiSliderElement
  extends
    UiElement<SliderEvents>,
    Pick<SliderOptions, "format">,
    FormControlProperties<typeof slider, "api" | "controller" | "value"> {
  value: number | number[]
  api: SliderController
  controller?: SliderController
}

/**
 * The events of `<ui-color-picker>`. `valuechange` fires on every step of a drag, and `valuecommit` once the interaction ends.
 * @experimental
 */
type ColorPickerEvents = {
  valuechange: UiDetailedChangeEvent<string, ColorPickerValueChangeDetails>
  valuecommit: UiDetailedChangeEvent<string, ColorPickerValueCommitDetails>
}
/**
 * `<ui-color-picker>`: `value`, the controller's methods on `api`, form members like a native input, and typed events.
 * @experimental
 */
interface UiColorPickerElement
  extends
    UiElement<ColorPickerEvents>,
    FormControlProperties<typeof colorPicker, "api" | "controller" | "value"> {
  value: string
  api: ColorPickerController
  controller?: ColorPickerController
}

/**
 * The events of `<ui-number-input>`. `valuechange` fires on every change, and `valuecommit` once the interaction ends.
 * @stable
 */
type NumberInputEvents = {
  valuechange: UiChangeEvent<number | null, NumberInputValueChangeReason>
  valuecommit: UiDetailedChangeEvent<
    number | null,
    CommitDetails<NumberInputValueChangeReason>
  >
}
/**
 * `<ui-number-input>`: `value`, the controller's methods on `api`, form members like a native input, and typed events.
 * @stable
 */
interface UiNumberInputElement
  extends
    UiElement<NumberInputEvents>,
    Pick<NumberInputOptions, "format">,
    FormControlProperties<typeof numberInput, "api" | "controller" | "value"> {
  value: number | null
  api: NumberInputController
  controller?: NumberInputController
}

/**
 * `<ui-progress>`: the options attributes can't hold, as properties.
 * @stable
 */
interface UiGaugeElement
  extends
    HTMLElement,
    AttributeProperties<typeof progress>,
    Pick<GaugeOptions, "format" | "getValueLabel"> {}

/**
 * `<ui-meter>`: the options attributes can't hold, as properties.
 * @stable
 */
interface UiMeterElement
  extends
    HTMLElement,
    AttributeProperties<typeof meter>,
    Pick<MeterOptions, "format" | "getValueLabel"> {}

/**
 * `<ui-separator>`: `orientation` and `decorative` as properties.
 * @stable
 */
interface UiSeparatorElement
  extends
    HTMLElement,
    Pick<SeparatorOptions, "orientation">,
    Required<Pick<SeparatorOptions, "decorative">> {}

/**
 * `<ui-label>`: its options as properties.
 * @experimental
 */
interface UiLabelElement
  extends HTMLElement, AttributeProperties<typeof label> {}

/**
 * `<ui-field>`: `invalid` as a property, three-way like the attribute.
 * @stable
 */
interface UiFieldElement
  extends HTMLElement, AttributeProperties<typeof field, "invalid"> {
  /**
   * `true` shows the field invalid, `false` shows no errors whatever the
   * browser thinks, and `undefined` hands it back to the browser's own
   * validation. It reflects the `invalid` attribute: `""`, `"false"` or none.
   */
  invalid: boolean | undefined
}

/**
 * `<ui-field-set>`: `disabled` as a property.
 * @stable
 */
interface UiFieldSetElement
  extends HTMLElement, AttributeProperties<typeof fieldSet> {}

/**
 * `<ui-field-group>`: its options as properties.
 * @stable
 */
interface UiFieldGroupElement
  extends HTMLElement, AttributeProperties<typeof fieldGroup> {}

/**
 * `<ui-input-group>`: its options as properties.
 * @stable
 */
interface UiInputGroupElement
  extends HTMLElement, AttributeProperties<typeof inputGroup> {}

/**
 * `<ui-scroll-area>`: the controller's methods on `api`, like `el.api.scrollToEnd()`.
 * @stable
 */
interface UiScrollAreaElement
  extends
    HTMLElement,
    AttributeProperties<typeof scrollArea, "api" | "controller"> {
  api: ScrollAreaController
  controller?: ScrollAreaController
}

/**
 * The events of `<ui-avatar>`.
 * @stable
 */
type AvatarEvents = {
  loadingstatuschange: UiChangeEvent<
    AvatarLoadingStatus,
    AvatarLoadingStatusChangeReason
  >
}
/**
 * `<ui-avatar>`: typed events.
 * @stable
 */
interface UiAvatarElement
  extends
    UiElement<AvatarEvents>,
    AttributeProperties<typeof avatar, "api" | "pressed"> {}

/**
 * The events of `<ui-image-cropper>`. `cropchange` fires on every step of a drag, and `cropcommit` once the interaction ends.
 * @experimental
 */
type ImageCropperEvents = {
  cropchange: UiDetailedChangeEvent<
    Required<ImageCrop>,
    ImageCropperCropChangeDetails
  >
  cropcommit: UiDetailedChangeEvent<
    Required<ImageCrop>,
    ImageCropperCropCommitDetails
  >
}
/**
 * `<ui-image-cropper>`: `crop`, the controller's methods on `api`, and typed events.
 * @experimental
 */
interface UiImageCropperElement
  extends
    UiElement<ImageCropperEvents>,
    AttributeProperties<typeof imageCropper, "api" | "controller" | "crop"> {
  crop: Required<ImageCrop> | null
  api: ImageCropperController
  controller?: ImageCropperController
}

/**
 * The events of `<ui-button>`.
 * @stable
 */
type ButtonEvents = ActionEvents
/**
 * `<ui-button>`: typed events.
 * @stable
 */
interface UiButtonElement
  extends
    UiElement<ButtonEvents>,
    AttributeProperties<typeof button, "api" | "pressed"> {}

/**
 * The events of `<ui-toggle>`.
 * @stable
 */
type ToggleEvents = {
  pressedchange: UiChangeEvent<boolean, TogglePressedChangeReason>
}
/**
 * `<ui-toggle>`: `pressed`, the controller's methods on `api`, and typed events.
 * @stable
 */
interface UiToggleElement
  extends
    UiElement<ToggleEvents>,
    AttributeProperties<typeof toggle, "api" | "pressed"> {
  pressed: boolean
  api: ToggleController
}

/**
 * The events of `<ui-toggle-group>`. Its toggles' `pressedchange` events reach it with `{ capture: true }`.
 * @stable
 */
type ToggleGroupEvents = ToggleEvents & {
  valuechange: UiChangeEvent<string[], ToggleGroupValueChangeReason>
}
/**
 * `<ui-toggle-group>`: `value`, the controller's methods on `api`, and typed events.
 * @stable
 */
interface UiToggleGroupElement
  extends
    UiElement<ToggleGroupEvents>,
    AttributeProperties<typeof toggleGroup, "api" | "value"> {
  value: string[]
  api: ToggleGroupController
}

/**
 * `<ui-toolbar>`: the controller's methods on `api`.
 * @stable
 */
interface UiToolbarElement
  extends UiElement<{}>, AttributeProperties<typeof toolbar> {
  api: ToolbarController
}

/**
 * `<ui-timeline>`: the controller's methods on `api`, and the `controller` it follows.
 * @experimental
 */
interface UiTimelineElement
  extends UiElement<{}>, AttributeProperties<typeof timeline> {
  api: TimelineController
  controller?: TimelineController
}

/**
 * `<ui-toast-region>`: the toaster it shows, how toasts rendered from data look, and `api` to focus or pause it.
 * @stable
 */
interface UiToastRegionElement
  extends UiElement<{}>, AttributeProperties<typeof toastRegion> {
  /** Moves focus to the region, and pauses or resumes its toasts' timers for a reason. */
  api: Pick<TypesOf<typeof toastRegion>["api"], "focus" | "pause" | "resume">
  toaster?: Toaster<ToastContent>
  /**
   * Runs for each toast element when it shows and after every update, with the toast, to fill a
   * template from the toast's `data`.
   */
  renderToast?: (toast: Toast<ToastContent>, el: HTMLElement) => void
}

/**
 * `<ui-preferences>`: the preferences it shows on their attributes.
 * @experimental
 */
interface UiPreferencesElement extends HTMLElement {
  /** The preferences to show, from `createPreference` or `createColorScheme`. */
  preferences: readonly PreferenceLike[]
}

/**
 * `<ui-overlay-host>`: the registry it renders, and how its toast regions look.
 * @stable
 */
interface UiOverlayHostElement extends HTMLElement {
  /** The registry whose toasts and confirms it renders. The shared one by default. */
  overlays?: Overlays
  /** What it sets on the toast regions it renders. */
  toast?: OverlayHostToastOptions
}

/**
 * `<ui-menubar>`: the controller's methods on `api`. Its menus fire their own events.
 * @stable
 */
interface UiMenubarElement
  extends UiElement<{}>, AttributeProperties<typeof menubar> {
  api: MenubarController
}

/**
 * A `highlight` event: the highlighted item's value, or `null`, with its index among the visible items.
 * @stable
 */
type UiHighlightEvent = CustomEvent<ListHighlightDetails & { value: unknown }>

/**
 * A `loadmore` event: the highlight or scrolling reached the last item, so the next page can load.
 * @stable
 */
type UiLoadMoreEvent = CustomEvent<{}>

/**
 * The events of `<ui-select>`.
 * @stable
 */
type SelectEvents = OpenEvents<SelectOpenChangeReason> & {
  valuechange: UiChangeEvent<unknown, SelectValueChangeReason>
  querychange: UiChangeEvent<string, SelectQueryChangeReason>
  highlight: UiHighlightEvent
  loadmore: UiLoadMoreEvent
  dismissattempt: UiDismissAttemptEvent<SelectDismissReason>
}
/**
 * `<ui-select>`: `open`, `value`, `query`, rich options, the controller's methods on `api`, form members like a native input, and typed events.
 * @stable
 */
interface UiSelectElement
  extends
    UiElement<SelectEvents>,
    Pick<
      SelectOptions<unknown>,
      | "itemToValue"
      | "itemToLabel"
      | "isItemEqualToValue"
      | "filter"
      | "emptyItems"
      | "announcement"
    >,
    FormControlProperties<
      typeof select,
      | "announcement"
      | "emptyItems"
      | "filter"
      | "api"
      | "controller"
      | "items"
      | "open"
      | "query"
      | "value"
    > {
  open: boolean
  /** The selected value. A string names an item by its key, comma-separated with `multiple`. */
  value: unknown
  /** The text in the search field. */
  query: string
  /** The items as data. Renders the content for you. */
  items?: ListData<unknown>
  api: SelectController<unknown, boolean>
  controller?: SelectController<any, any>
}

/**
 * The events of `<ui-combobox>`.
 * @stable
 */
type ComboboxEvents = OpenEvents<ComboboxOpenChangeReason> & {
  valuechange: UiChangeEvent<unknown, ComboboxValueChangeReason>
  querychange: UiChangeEvent<string, ComboboxQueryChangeReason>
  highlight: UiHighlightEvent
  loadmore: UiLoadMoreEvent
  /** The create part was chosen, with the text. Pass a Promise to `waitUntil()` to keep it pending until it settles. */
  create: CustomEvent<{
    value: string
    waitUntil: (promise: Promise<unknown>) => void
  }>
  dismissattempt: UiDismissAttemptEvent<ComboboxDismissReason>
}
/**
 * `<ui-combobox>`: `open`, `value`, `query`, rich options, the controller's methods on `api`, form members like a native input, and typed events.
 * @stable
 */
interface UiComboboxElement
  extends
    UiElement<ComboboxEvents>,
    Pick<
      ComboboxOptions<unknown>,
      | "itemToValue"
      | "itemToLabel"
      | "isItemEqualToValue"
      | "filter"
      | "emptyItems"
      | "announcement"
    >,
    FormControlProperties<
      typeof combobox,
      | "announcement"
      | "emptyItems"
      | "filter"
      | "api"
      | "controller"
      | "items"
      | "open"
      | "query"
      | "value"
    > {
  open: boolean
  /** The selected value. A string names an item by its key, comma-separated with `multiple`. */
  value: unknown
  /** The input's text. */
  query: string
  /** The items as data. Renders the list for you. */
  items?: ListData<unknown>
  api: ComboboxController<unknown, boolean>
  controller?: ComboboxController<any, any>
}

/**
 * The events of `<ui-autocomplete>`.
 * @stable
 */
type AutocompleteEvents = OpenEvents<AutocompleteOpenChangeReason> & {
  valuechange: UiDetailedChangeEvent<string, AutocompleteValueChangeDetails>
  highlight: UiHighlightEvent
  loadmore: UiLoadMoreEvent
  /** Enter with nothing highlighted, or a choice with `submit-on-select`. It doesn't bubble. Cancel it to keep the form from submitting. */
  submit: CustomEvent<{ value: string }>
  dismissattempt: UiDismissAttemptEvent<AutocompleteDismissReason>
}
/**
 * `<ui-autocomplete>`: `open`, `value`, rich options, the controller's methods on `api`, and typed events.
 * @stable
 */
interface UiAutocompleteElement
  extends
    UiElement<AutocompleteEvents>,
    Pick<AutocompleteOptions, "filter" | "emptyItems" | "announcement">,
    AttributeProperties<
      typeof autocomplete,
      | "announcement"
      | "emptyItems"
      | "filter"
      | "api"
      | "controller"
      | "items"
      | "open"
      | "value"
    > {
  open: boolean
  /** The text. */
  value: string
  /** The suggestions as data. Renders the list for you. */
  items?: ListData<string>
  api: AutocompleteController
  controller?: AutocompleteController
}

/**
 * The events of `<ui-command>`.
 * @stable
 */
type CommandEvents = {
  valuechange: UiChangeEvent<string | null, CommandValueChangeReason>
  querychange: UiChangeEvent<string, CommandQueryChangeReason>
  pageschange: UiChangeEvent<string[], CommandPagesChangeReason>
  loadmore: UiLoadMoreEvent
  /** A command ran, with its value. Pass a Promise to `waitUntil()` to keep it pending until it settles. */
  action: CustomEvent<{
    value: string
    waitUntil: (promise: Promise<unknown>) => void
  }>
}
/**
 * `<ui-command>`: `value`, `query`, `pages`, rich options, the controller's methods on `api`, and typed events.
 * @stable
 */
interface UiCommandElement
  extends
    UiElement<CommandEvents>,
    Pick<CommandOptions, "filter" | "emptyItems" | "announcement">,
    AttributeProperties<
      typeof command,
      | "announcement"
      | "emptyItems"
      | "filter"
      | "api"
      | "controller"
      | "items"
      | "pages"
      | "query"
      | "value"
    > {
  /** The highlighted command's value. */
  value: string | null
  /** The search text. */
  query: string
  /** The stack of open pages. */
  pages: string[]
  /** The commands as data. Renders the list for you. */
  items?: CommandData
  api: CommandController
  controller?: CommandController
}

/**
 * The events of `<ui-token-input>`. The submit shortcut submits its form, whose `submit` event hears it.
 * @stable
 */
type TokenInputEvents = {
  valuechange: UiDetailedChangeEvent<
    TokenInputValue,
    TokenInputValueChangeDetails
  >
}
/**
 * `<ui-token-input>`: `value`, rich options as properties, the controller's methods on `api`, form members like a native input, and typed events.
 * @stable
 */
interface UiTokenInputElement
  extends
    UiElement<TokenInputEvents>,
    FormControlProperties<
      typeof tokenInput,
      | "api"
      | "codec"
      | "controller"
      | "defaultValue"
      | "getTokenDescription"
      | "history"
      | "renderToken"
      | "value"
    > {
  /** The value: text and tokens. Setting a string parses it with the codec. */
  get value(): TokenInputValue
  set value(value: TokenInputValue | string)
  /** The value at first, which a form reset returns to. The `value` attribute sets it as codec text. */
  defaultValue?: TokenInputValue
  /** Undo history: how many steps it keeps, and how long a typing pause starts a new step. */
  history?: UndoStackOptions
  /** How tokens become text and back. */
  codec?: TokenCodec
  /** What a token says to screen readers besides its label. */
  getTokenDescription?: (token: Token) => string
  /** Renders a token's content into its host. Without it, a `<template>` child is cloned per token. */
  renderToken?: (token: Token, host: HTMLElement) => void
  api: Omit<TokenInputController, "editor">
  controller?: TokenInputController
}

/**
 * The events of `<ui-trigger-menu>`.
 * @stable
 */
type TriggerMenuEvents = {
  /** `detail.trigger` is the text that opened it, or null when it closes. */
  openchange: UiDetailedChangeEvent<
    boolean,
    ChangeDetails<TriggerMenuOpenChangeReason> & { trigger: string | null }
  >
  openchangecomplete: UiOpenChangeCompleteEvent
  querychange: UiDetailedChangeEvent<
    string,
    ChangeDetails<TriggerMenuQueryChangeReason> & {
      trigger: string
      argument?: string
    }
  >
  /**
   * An item was chosen. `preventDefault()` skips the insertion, and `detail.waitUntil(promise)` inserts a pending token.
   * Not `select`, which the field fires for selected text.
   */
  itemselect: CustomEvent<
    Omit<
      TriggerMenuSelectDetails<string>,
      "preventDefault" | "defaultPrevented"
    > & { value: string }
  >
  dismissattempt: UiDismissAttemptEvent<TriggerMenuDismissReason>
}
/**
 * `<ui-trigger-menu>`: `open`, `triggers` and `editor` properties, the controller's methods on `api`, and typed events.
 * @stable
 */
interface UiTriggerMenuElement
  extends
    UiElement<TriggerMenuEvents>,
    AttributeProperties<
      typeof triggerMenu,
      "api" | "controller" | "editor" | "open" | "triggers"
    > {
  open: boolean
  /** The texts that open the menu, and what each one lists. */
  triggers?: TriggerDefinition<string>[]
  /** The editor, for editors without a part of their own. A token input around the menu sets it. */
  editor?: TextEditorAdapter
  api: TriggerMenuController
  controller?: TriggerMenuController
}

/**
 * The events of `<ui-tree>`.
 * @stable
 */
type TreeEvents = {
  valuechange: UiChangeEvent<string | string[] | null, TreeValueChangeReason>
  expandedchange: UiChangeEvent<string[], TreeExpandedChangeReason>
  checkedchange: UiChangeEvent<string[], TreeCheckedChangeReason>
  /** The keyboard moved focus to an item, with its row among the items that show, from 0. */
  highlight: CustomEvent<{ value: string; index: number; event?: Event }>
  /** An item was pressed, or Enter was pressed on it, with its value and the event behind it. Pass a Promise to `waitUntil()` to keep it pending until it settles. */
  action: CustomEvent<{
    value: string
    event?: Event
    waitUntil: (promise: Promise<unknown>) => void
  }>
}
/**
 * `<ui-tree>`: `value`, `expanded`, `checked`, rich options, the controller's methods on `api`, and typed events.
 * @stable
 */
interface UiTreeElement
  extends
    UiElement<TreeEvents>,
    AttributeProperties<
      typeof tree,
      | "announcement"
      | "api"
      | "checked"
      | "controller"
      | "expanded"
      | "items"
      | "loadChildren"
      | "paths"
      | "value"
    > {
  /** The selected value, a list with `mode="multiple"`. */
  value: string | string[] | null
  /** The expanded branches. */
  expanded: string[]
  /** The checked items, as `check-strategy` reports them. */
  checked: string[]
  /** The items as data. Renders them for you. */
  items?: TreeItemData[]
  /** Items from file paths. Renders them for you. */
  paths?: readonly string[]
  /** Loads a branch's children the first time it expands while it has none. */
  loadChildren?: (
    value: string,
    details: { signal: AbortSignal }
  ) => void | Promise<unknown>
  /** What screen readers hear when a branch expands, collapses, starts loading or fails to load. */
  announcement?: (change: TreeAnnouncement) => string | null | undefined
  api: TreeController
  controller?: TreeController
}

/**
 * The events of `<ui-waterfall>`.
 * @experimental
 */
type WaterfallEvents = {
  valuechange: UiChangeEvent<string | null, WaterfallValueChangeReason>
  expandedchange: UiChangeEvent<string[], WaterfallExpandedChangeReason>
  /** The keyboard moved focus to a row, with its place among the rows that show, from 0. */
  highlight: CustomEvent<{ value: string; index: number; event?: Event }>
}
/**
 * `<ui-waterfall>`: `value`, `expanded`, `items` and the other rich options, the controller's methods on `api`, and typed events.
 * @experimental
 */
interface UiWaterfallElement
  extends
    UiElement<WaterfallEvents>,
    AttributeProperties<
      typeof waterfall,
      | "api"
      | "controller"
      | "expanded"
      | "format"
      | "getBarLabel"
      | "items"
      | "range"
      | "value"
    > {
  /** The selected span's value, or `null`. */
  value: string | null
  /** The expanded spans' values. */
  expanded: string[]
  /** The spans. Without rows of its own, the waterfall renders a row for each. */
  items: WaterfallDataItem[]
  /** The stretch of time the axis shows, as `[start, end]` in milliseconds. */
  range?: [number, number]
  /** How times read: `Intl.NumberFormat` options for milliseconds, or a function of them. */
  format?: Intl.NumberFormatOptions | ((value: number) => string)
  /** What screen readers hear for a span's bar. */
  getBarLabel?: (
    item: WaterfallDataItem,
    details: { start: string; duration: string }
  ) => string
  api: WaterfallController
  controller?: WaterfallController
}

// Every entry re-exports its elements' types from this file, so importing
// one, like `import "@ui-sdk/web/toggle"`, brings this map along.
declare global {
  interface HTMLElementTagNameMap {
    "ui-popover": UiPopoverElement
    "ui-tooltip": UiTooltipElement
    "ui-hover-card": UiHoverCardElement
    "ui-image-cropper": UiImageCropperElement
    "ui-menu": UiMenuElement
    "ui-menu-sub": UiMenuSubElement
    "ui-dialog": UiDialogElement
    "ui-alert-dialog": UiAlertDialogElement
    "ui-drawer": UiDrawerElement
    "ui-collapsible": UiCollapsibleElement
    "ui-accordion": UiAccordionElement
    "ui-tabs": UiTabsElement
    "ui-navigation-menu": UiNavigationMenuElement
    "ui-resizable": UiResizableElement
    "ui-checkbox": UiCheckboxElement
    "ui-timeline": UiTimelineElement
    "ui-switch": UiSwitchElement
    "ui-checkbox-group": UiCheckboxGroupElement
    "ui-radio-group": UiRadioGroupElement
    "ui-radio": UiRadioElement
    "ui-rating": UiRatingElement
    "ui-segmented-control": UiSegmentedControlElement
    "ui-segmented-control-item": UiSegmentedControlItemElement
    "ui-input": UiInputElement
    "ui-input-group": UiInputGroupElement
    "ui-textarea": UiTextareaElement
    "ui-password-input": UiPasswordInputElement
    "ui-pagination": UiPaginationElement
    "ui-calendar": UiCalendarElement
    "ui-calendar-weeks": HTMLElement
    "ui-date-input": UiDateInputElement
    "ui-time-input": UiTimeInputElement
    "ui-date-picker": UiDatePickerElement
    "ui-carousel": UiCarouselElement
    "ui-listbox": UiListboxElement
    "ui-button": UiButtonElement
    "ui-toggle": UiToggleElement
    "ui-toggle-group": UiToggleGroupElement
    "ui-toolbar": UiToolbarElement
    "ui-menubar": UiMenubarElement
    "ui-select": UiSelectElement
    "ui-color-picker": UiColorPickerElement
    "ui-combobox": UiComboboxElement
    "ui-command": UiCommandElement
    "ui-autocomplete": UiAutocompleteElement
    "ui-trigger-menu": UiTriggerMenuElement
    "ui-token-input": UiTokenInputElement
    "ui-file-input": UiFileInputElement
    "ui-scroll-area": UiScrollAreaElement
    "ui-tree": UiTreeElement
    "ui-waterfall": UiWaterfallElement
    "ui-toast-region": UiToastRegionElement
    "ui-overlay-host": UiOverlayHostElement
    "ui-preferences": UiPreferencesElement
    "ui-meter": UiMeterElement
    "ui-separator": UiSeparatorElement
    "ui-progress": UiGaugeElement
    "ui-field": UiFieldElement
    "ui-label": UiLabelElement
    "ui-field-set": UiFieldSetElement
    "ui-field-group": UiFieldGroupElement
    "ui-slider": UiSliderElement
    "ui-number-input": UiNumberInputElement
    "ui-otp-input": UiOTPInputElement
    "ui-avatar": UiAvatarElement
    // The parts, by the slot they fill and the props they read.
    "ui-accordion-item": UiPartElement<
      typeof accordion,
      "item",
      "value" | "disabled"
    >
    "ui-accordion-header": UiPartElement<typeof accordion, "header">
    "ui-accordion-trigger": UiPartElement<
      typeof accordion,
      "trigger",
      "disabled"
    >
    "ui-accordion-panel": UiPartElement<
      typeof accordion,
      "panel",
      "keepMounted" | "hiddenUntilFound"
    >
    "ui-alert-dialog-trigger": UiPartElement<
      typeof alertDialog,
      "trigger",
      "disabled" | "focusableWhenDisabled" | "shortcut",
      "payload"
    >
    "ui-alert-dialog-close": UiPartElement<
      typeof alertDialog,
      "close",
      "value",
      never,
      ActionEvents
    >
    "ui-alert-dialog-shortcut": UiPartElement<
      typeof alertDialog,
      "shortcut",
      "shortcut"
    >
    "ui-alert-dialog-backdrop": UiPartElement<typeof alertDialog, "backdrop">
    "ui-alert-dialog-content": UiPartElement<
      typeof alertDialog,
      "content",
      "container" | "initialFocus" | "finalFocus" | "keepMounted" | "inline"
    >
    "ui-alert-dialog-title": UiPartElement<typeof alertDialog, "title">
    "ui-alert-dialog-description": UiPartElement<
      typeof alertDialog,
      "description"
    >
    "ui-autocomplete-label": UiPartElement<typeof autocomplete, "label">
    "ui-autocomplete-input": UiPartElement<typeof autocomplete, "input">
    "ui-autocomplete-trigger": UiPartElement<typeof autocomplete, "trigger">
    "ui-autocomplete-clear": UiPartElement<
      typeof autocomplete,
      "clear",
      "keepMounted"
    >
    "ui-autocomplete-content": UiPartElement<
      typeof autocomplete,
      "content",
      | "side"
      | "align"
      | "sideOffset"
      | "alignOffset"
      | "collisionPadding"
      | "arrowPadding"
      | "container"
      | "anchor"
      | "keepMounted"
    >
    "ui-autocomplete-list": UiPartElement<typeof autocomplete, "list">
    "ui-autocomplete-item": UiPartElement<
      typeof autocomplete,
      "item",
      "value" | "label" | "keywords" | "disabled" | "index"
    >
    "ui-autocomplete-item-text": UiPartElement<typeof autocomplete, "item-text">
    "ui-autocomplete-item-icon": UiPartElement<
      typeof autocomplete,
      "item-icon",
      "mirror"
    >
    "ui-autocomplete-group": UiPartElement<typeof autocomplete, "group">
    "ui-autocomplete-group-label": UiPartElement<
      typeof autocomplete,
      "group-label"
    >
    "ui-autocomplete-separator": UiPartElement<typeof autocomplete, "separator">
    "ui-autocomplete-empty": UiPartElement<typeof autocomplete, "empty">
    "ui-autocomplete-status": UiPartElement<typeof autocomplete, "status">
    "ui-autocomplete-arrow": UiPartElement<typeof autocomplete, "arrow">
    "ui-avatar-fallback": UiPartElement<typeof avatar, "fallback", "delay">
    "ui-calendar-heading": UiPartElement<typeof calendar, "heading">
    "ui-calendar-previous": UiPartElement<typeof calendar, "previous">
    "ui-calendar-next": UiPartElement<typeof calendar, "next">
    "ui-calendar-month-select": UiPartElement<typeof calendar, "month-select">
    "ui-calendar-year-select": UiPartElement<typeof calendar, "year-select">
    "ui-calendar-grid": UiPartElement<typeof calendar, "grid", "offset">
    "ui-calendar-weekdays": UiPartElement<typeof calendar, "weekdays">
    "ui-calendar-weekday": UiPartElement<typeof calendar, "weekday", "index">
    "ui-calendar-week": UiPartElement<typeof calendar, "week">
    "ui-calendar-day": UiPartElement<typeof calendar, "day", "value">
    "ui-carousel-viewport": UiPartElement<typeof carousel, "viewport">
    "ui-carousel-content": UiPartElement<typeof carousel, "content">
    "ui-carousel-item": UiPartElement<typeof carousel, "item">
    "ui-carousel-previous": UiPartElement<typeof carousel, "previous">
    "ui-carousel-next": UiPartElement<typeof carousel, "next">
    "ui-carousel-play-toggle": UiPartElement<typeof carousel, "play-toggle">
    "ui-carousel-indicator-group": UiPartElement<
      typeof carousel,
      "indicator-group"
    >
    "ui-carousel-indicator": UiPartElement<typeof carousel, "indicator", "page">
    "ui-checkbox-indicator": UiPartElement<
      typeof checkbox,
      "indicator",
      "keepMounted"
    >
    "ui-timeline-item": UiPartElement<
      typeof timeline,
      "item",
      "value" | "status"
    >
    "ui-timeline-marker": UiPartElement<typeof timeline, "marker">
    "ui-timeline-connector": UiPartElement<typeof timeline, "connector">
    "ui-timeline-time": UiPartElement<typeof timeline, "time">
    "ui-timeline-title": UiPartElement<typeof timeline, "title">
    "ui-timeline-description": UiPartElement<typeof timeline, "description">
    "ui-collapsible-trigger": UiPartElement<typeof collapsible, "trigger">
    "ui-collapsible-panel": UiPartElement<
      typeof collapsible,
      "panel",
      "keepMounted" | "hiddenUntilFound"
    >
    "ui-combobox-label": UiPartElement<typeof combobox, "label">
    "ui-combobox-input": UiPartElement<typeof combobox, "input">
    "ui-combobox-trigger": UiPartElement<typeof combobox, "trigger">
    "ui-combobox-clear": UiPartElement<typeof combobox, "clear", "keepMounted">
    "ui-combobox-content": UiPartElement<
      typeof combobox,
      "content",
      | "side"
      | "align"
      | "sideOffset"
      | "alignOffset"
      | "collisionPadding"
      | "arrowPadding"
      | "container"
      | "anchor"
      | "keepMounted"
    >
    "ui-combobox-list": UiPartElement<typeof combobox, "list">
    "ui-combobox-item": UiPartElement<
      typeof combobox,
      "item",
      "label" | "keywords" | "disabled" | "index" | "value"
    >
    "ui-combobox-item-indicator": UiPartElement<
      typeof combobox,
      "item-indicator",
      "keepMounted"
    >
    "ui-combobox-item-icon": UiPartElement<
      typeof combobox,
      "item-icon",
      "mirror"
    >
    "ui-combobox-value-icon": UiPartElement<typeof combobox, "value-icon">
    "ui-combobox-group": UiPartElement<typeof combobox, "group">
    "ui-combobox-group-label": UiPartElement<typeof combobox, "group-label">
    "ui-combobox-separator": UiPartElement<typeof combobox, "separator">
    // Its `create` event fires on the combobox.
    "ui-combobox-create": UiPartElement<
      typeof combobox,
      "create",
      "minLength",
      never,
      {}
    >
    "ui-combobox-empty": UiPartElement<typeof combobox, "empty">
    "ui-combobox-status": UiPartElement<typeof combobox, "status">
    "ui-combobox-chips": UiPartElement<typeof combobox, "chips">
    "ui-combobox-chip": UiPartElement<typeof combobox, "chip", "value">
    "ui-combobox-chips-overflow": UiPartElement<
      typeof combobox,
      "chips-overflow"
    >
    "ui-combobox-item-text": UiPartElement<typeof combobox, "item-text">
    "ui-combobox-select-all": UiPartElement<typeof combobox, "select-all">
    "ui-combobox-chip-remove": UiPartElement<typeof combobox, "chip-remove">
    "ui-combobox-arrow": UiPartElement<typeof combobox, "arrow">
    "ui-command-input": UiPartElement<typeof command, "input">
    "ui-command-list": UiPartElement<typeof command, "list">
    "ui-command-item-text": UiPartElement<typeof command, "item-text">
    "ui-command-item": UiPartElement<
      typeof command,
      "item",
      | "value"
      | "label"
      | "keywords"
      | "disabled"
      | "shortcut"
      | "page"
      | "index"
    >
    "ui-command-shortcut": UiPartElement<typeof command, "shortcut", "shortcut">
    "ui-command-page": UiPartElement<typeof command, "page", "value">
    "ui-command-item-icon": UiPartElement<typeof command, "item-icon", "mirror">
    "ui-command-group": UiPartElement<typeof command, "group">
    "ui-command-group-label": UiPartElement<typeof command, "group-label">
    "ui-command-separator": UiPartElement<typeof command, "separator">
    "ui-command-empty": UiPartElement<typeof command, "empty">
    "ui-command-status": UiPartElement<typeof command, "status">
    "ui-date-input-segment": UiPartElement<
      typeof dateInput,
      "segment",
      "segment"
    >
    "ui-time-input-segment": UiPartElement<
      typeof timeInput,
      "segment",
      "segment"
    >
    "ui-date-picker-input": UiPartElement<typeof datePicker, "input", "end">
    "ui-date-picker-trigger": UiPartElement<typeof datePicker, "trigger">
    "ui-date-picker-content": UiPartElement<
      typeof datePicker,
      "content",
      | "side"
      | "align"
      | "sideOffset"
      | "alignOffset"
      | "collisionPadding"
      | "arrowPadding"
      | "container"
      | "anchor"
      | "finalFocus"
      | "keepMounted"
    >
    "ui-date-picker-hint": UiPartElement<typeof datePicker, "hint">
    "ui-date-picker-clear": UiPartElement<typeof datePicker, "clear">
    "ui-date-picker-preset": UiPartElement<typeof datePicker, "preset", "value">
    "ui-dialog-trigger": UiPartElement<
      typeof dialog,
      "trigger",
      "disabled" | "focusableWhenDisabled" | "shortcut",
      "payload"
    >
    "ui-dialog-close": UiPartElement<
      typeof dialog,
      "close",
      "value",
      never,
      ActionEvents
    >
    "ui-dialog-shortcut": UiPartElement<typeof dialog, "shortcut", "shortcut">
    "ui-dialog-backdrop": UiPartElement<typeof dialog, "backdrop">
    "ui-dialog-content": UiPartElement<
      typeof dialog,
      "content",
      "container" | "initialFocus" | "finalFocus" | "keepMounted" | "inline"
    >
    "ui-dialog-title": UiPartElement<typeof dialog, "title">
    "ui-dialog-description": UiPartElement<typeof dialog, "description">
    "ui-drawer-trigger": UiPartElement<
      typeof drawer,
      "trigger",
      "disabled" | "focusableWhenDisabled" | "shortcut",
      "payload"
    >
    "ui-drawer-close": UiPartElement<
      typeof drawer,
      "close",
      "value",
      never,
      ActionEvents
    >
    "ui-drawer-shortcut": UiPartElement<typeof drawer, "shortcut", "shortcut">
    "ui-drawer-backdrop": UiPartElement<typeof drawer, "backdrop">
    "ui-drawer-viewport": UiPartElement<typeof drawer, "viewport">
    "ui-drawer-content": UiPartElement<
      typeof drawer,
      "content",
      "container" | "initialFocus" | "finalFocus" | "keepMounted"
    >
    "ui-drawer-handle": UiPartElement<typeof drawer, "handle">
    "ui-drawer-outlet": UiPartElement<
      typeof drawer,
      "outlet",
      never,
      "keyframes"
    >
    "ui-drawer-title": UiPartElement<typeof drawer, "title">
    "ui-drawer-description": UiPartElement<typeof drawer, "description">
    "ui-field-label": UiPartElement<typeof field, "label">
    "ui-field-description": UiPartElement<typeof field, "description">
    "ui-field-error": UiPartElement<typeof field, "error", "match">
    "ui-field-legend": UiPartElement<typeof fieldSet, "legend">
    "ui-file-input-trigger": UiPartElement<typeof fileInput, "trigger">
    "ui-file-input-dropzone": UiPartElement<
      typeof fileInput,
      "dropzone",
      "target" | "pasteTarget"
    >
    "ui-file-input-list": UiPartElement<typeof fileInput, "list">
    "ui-file-input-item": UiPartElement<typeof fileInput, "item", never, "file">
    "ui-file-input-item-remove": UiPartElement<typeof fileInput, "item-remove">
    "ui-hover-card-trigger": UiPartElement<
      typeof hoverCard,
      "trigger",
      never,
      "payload"
    >
    "ui-image-cropper-viewport": UiPartElement<typeof imageCropper, "viewport">
    "ui-image-cropper-image": UiPartElement<typeof imageCropper, "image">
    "ui-image-cropper-selection": UiPartElement<
      typeof imageCropper,
      "selection"
    >
    "ui-image-cropper-grid": UiPartElement<typeof imageCropper, "grid">
    "ui-image-cropper-handle": UiPartElement<
      typeof imageCropper,
      "handle",
      "position"
    >
    "ui-image-cropper-zoom": UiPartElement<typeof imageCropper, "zoom">
    "ui-image-cropper-rotate": UiPartElement<typeof imageCropper, "rotate">
    "ui-image-cropper-flip": UiPartElement<
      typeof imageCropper,
      "flip",
      "direction"
    >
    "ui-hover-card-content": UiPartElement<
      typeof hoverCard,
      "content",
      | "side"
      | "align"
      | "sideOffset"
      | "alignOffset"
      | "collisionPadding"
      | "container"
      | "arrowPadding"
      | "anchor"
      | "keepMounted"
    >
    "ui-hover-card-arrow": UiPartElement<typeof hoverCard, "arrow">
    "ui-input-clear": UiPartElement<typeof inputGroup, "clear">
    "ui-listbox-item": UiPartElement<
      typeof listbox,
      "item",
      "value" | "label" | "disabled" | "index"
    >
    "ui-listbox-item-indicator": UiPartElement<
      typeof listbox,
      "item-indicator",
      "keepMounted"
    >
    "ui-listbox-item-icon": UiPartElement<typeof listbox, "item-icon", "mirror">
    "ui-listbox-group": UiPartElement<typeof listbox, "group">
    "ui-listbox-group-label": UiPartElement<typeof listbox, "group-label">
    "ui-listbox-separator": UiPartElement<typeof listbox, "separator">
    "ui-menu-trigger": UiPartElement<
      typeof menu,
      "trigger",
      "disabled" | "focusableWhenDisabled" | "shortcut",
      "payload"
    >
    "ui-menu-context-trigger": UiPartElement<
      typeof menu,
      "context-trigger",
      "disabled",
      "payload"
    >
    "ui-menu-content": UiPartElement<
      typeof menu,
      "content",
      | "side"
      | "align"
      | "sideOffset"
      | "alignOffset"
      | "collisionPadding"
      | "arrowPadding"
      | "anchor"
      | "container"
      | "finalFocus"
      | "keepMounted"
    >
    "ui-menu-sub-content": UiPartElement<
      typeof menu,
      "content",
      | "side"
      | "align"
      | "sideOffset"
      | "alignOffset"
      | "collisionPadding"
      | "arrowPadding"
      | "anchor"
      | "keepMounted"
    >
    "ui-menu-sub-trigger": UiPartElement<
      typeof menu,
      "trigger",
      "disabled" | "focusableWhenDisabled" | "shortcut",
      "payload"
    >
    "ui-menu-item": UiPartElement<
      typeof menu,
      "item",
      | "value"
      | "label"
      | "disabled"
      | "destructive"
      | "shortcut"
      | "closeOnSelect"
    >
    "ui-menu-checkbox-item": UiPartElement<
      typeof menu,
      "checkbox-item",
      | "value"
      | "label"
      | "disabled"
      | "checked"
      | "defaultChecked"
      | "closeOnSelect"
    >
    "ui-menu-radio-group": UiPartElement<
      typeof menu,
      "radio-group",
      "value" | "defaultValue"
    >
    "ui-menu-radio-item": UiPartElement<
      typeof menu,
      "radio-item",
      "value" | "label" | "disabled" | "closeOnSelect"
    >
    "ui-menu-item-indicator": UiPartElement<
      typeof menu,
      "item-indicator",
      "keepMounted"
    >
    "ui-menu-group": UiPartElement<typeof menu, "group">
    "ui-menu-group-label": UiPartElement<typeof menu, "group-label">
    "ui-menu-separator": UiPartElement<typeof menu, "separator">
    "ui-menu-shortcut": UiPartElement<typeof menu, "shortcut">
    "ui-menu-item-icon": UiPartElement<typeof menu, "item-icon", "mirror">
    "ui-meter-track": UiPartElement<typeof meter, "track">
    "ui-meter-indicator": UiPartElement<typeof meter, "indicator">
    "ui-meter-label": UiPartElement<typeof meter, "label">
    "ui-meter-value": UiPartElement<typeof meter, "value">
    "ui-navigation-menu-list": UiPartElement<typeof navigationMenu, "list">
    "ui-navigation-menu-item": UiPartElement<
      typeof navigationMenu,
      "item",
      "value"
    >
    "ui-navigation-menu-trigger": UiPartElement<
      typeof navigationMenu,
      "trigger",
      "disabled"
    >
    "ui-navigation-menu-content": UiPartElement<
      typeof navigationMenu,
      "content",
      | "side"
      | "align"
      | "sideOffset"
      | "alignOffset"
      | "collisionPadding"
      | "arrowPadding"
      | "anchor"
      | "keepMounted"
      | "hiddenUntilFound"
    >
    "ui-navigation-menu-link": UiPartElement<
      typeof navigationMenu,
      "link",
      "current" | "closeOnSelect"
    >
    "ui-navigation-menu-link-icon": UiPartElement<
      typeof navigationMenu,
      "link-icon",
      "mirror"
    >
    "ui-navigation-menu-viewport": UiPartElement<
      typeof navigationMenu,
      "viewport",
      | "side"
      | "align"
      | "sideOffset"
      | "alignOffset"
      | "collisionPadding"
      | "arrowPadding"
      | "anchor"
    >
    "ui-navigation-menu-indicator": UiPartElement<
      typeof navigationMenu,
      "indicator"
    >
    "ui-number-input-group": UiPartElement<typeof numberInput, "group">
    "ui-number-input-control": UiPartElement<typeof numberInput, "control">
    "ui-number-input-increment": UiPartElement<
      typeof numberInput,
      "increment",
      "disabled"
    >
    "ui-number-input-decrement": UiPartElement<
      typeof numberInput,
      "decrement",
      "disabled"
    >
    "ui-number-input-scrub-area": UiPartElement<
      typeof numberInput,
      "scrub-area",
      "orientation" | "pixelsPerStep"
    >
    "ui-number-input-scrub-area-cursor": UiPartElement<
      typeof numberInput,
      "scrub-area-cursor"
    >
    "ui-otp-input-control": UiPartElement<typeof otpInput, "control">
    "ui-otp-input-group": UiPartElement<typeof otpInput, "group">
    "ui-otp-input-slot": UiPartElement<typeof otpInput, "slot", "index">
    "ui-otp-input-separator": UiPartElement<typeof otpInput, "separator">
    "ui-toast": UiPartElement<typeof toastRegion, "root">
    "ui-toast-title": UiPartElement<typeof toastRegion, "title">
    "ui-toast-description": UiPartElement<typeof toastRegion, "description">
    "ui-toast-action": UiPartElement<
      typeof toastRegion,
      "action",
      "dismiss",
      never,
      ActionEvents
    >
    "ui-toast-close": UiPartElement<
      typeof toastRegion,
      "close",
      never,
      never,
      ActionEvents
    >
    "ui-pagination-list": UiPartElement<typeof pagination, "list">
    "ui-pagination-item": UiPartElement<typeof pagination, "item">
    "ui-pagination-link": UiPartElement<typeof pagination, "link", "page">
    "ui-pagination-previous": UiPartElement<typeof pagination, "previous">
    "ui-pagination-next": UiPartElement<typeof pagination, "next">
    "ui-pagination-first": UiPartElement<typeof pagination, "first">
    "ui-pagination-last": UiPartElement<typeof pagination, "last">
    "ui-pagination-ellipsis": UiPartElement<typeof pagination, "ellipsis">
    "ui-password-input-toggle": UiPartElement<typeof passwordInput, "toggle">
    "ui-popover-trigger": UiPartElement<
      typeof popover,
      "trigger",
      "disabled" | "focusableWhenDisabled" | "shortcut",
      "payload"
    >
    "ui-popover-close": UiPartElement<typeof popover, "close">
    "ui-popover-shortcut": UiPartElement<typeof popover, "shortcut", "shortcut">
    "ui-popover-content": UiPartElement<
      typeof popover,
      "content",
      | "side"
      | "align"
      | "sideOffset"
      | "alignOffset"
      | "collisionPadding"
      | "container"
      | "arrowPadding"
      | "anchor"
      | "initialFocus"
      | "finalFocus"
      | "keepMounted"
      | "inline"
    >
    "ui-popover-title": UiPartElement<typeof popover, "title">
    "ui-popover-description": UiPartElement<typeof popover, "description">
    "ui-popover-arrow": UiPartElement<typeof popover, "arrow">
    "ui-progress-track": UiPartElement<typeof progress, "track">
    "ui-progress-indicator": UiPartElement<typeof progress, "indicator">
    "ui-progress-label": UiPartElement<typeof progress, "label">
    "ui-progress-value": UiPartElement<typeof progress, "value">
    "ui-radio-indicator": UiPartElement<
      typeof radioGroup,
      "indicator",
      "keepMounted"
    >
    "ui-rating-item": UiPartElement<typeof rating, "item", "index">
    "ui-rating-radio": UiPartElement<
      typeof rating,
      "radio",
      "value" | "disabled"
    >
    "ui-resizable-panel": UiPartElement<
      typeof resizable,
      "panel",
      "defaultSize" | "minSize" | "maxSize" | "collapsible" | "collapsedSize"
    >
    "ui-resizable-handle": UiPartElement<typeof resizable, "handle", "disabled">
    "ui-scroll-area-viewport": UiPartElement<typeof scrollArea, "viewport">
    "ui-scroll-area-content": UiPartElement<typeof scrollArea, "content">
    "ui-scroll-area-scrollbar": UiPartElement<
      typeof scrollArea,
      "scrollbar",
      "orientation"
    >
    "ui-scroll-area-thumb": UiPartElement<typeof scrollArea, "thumb">
    "ui-scroll-area-corner": UiPartElement<typeof scrollArea, "corner">
    "ui-scroll-area-scroll-to-end": UiPartElement<
      typeof scrollArea,
      "scroll-to-end"
    >
    "ui-select-label": UiPartElement<typeof select, "label">
    "ui-select-trigger": UiPartElement<typeof select, "trigger", "disabled">
    "ui-select-value": UiPartElement<
      typeof select,
      "value",
      "placeholder" | "maxLabels",
      "getMoreLabel"
    >
    "ui-select-clear": UiPartElement<typeof select, "clear", "keepMounted">
    "ui-select-content": UiPartElement<
      typeof select,
      "content",
      | "side"
      | "align"
      | "sideOffset"
      | "alignOffset"
      | "collisionPadding"
      | "arrowPadding"
      | "container"
      | "anchor"
      | "alignItemWithTrigger"
      | "keepMounted"
    >
    "ui-select-list": UiPartElement<typeof select, "list">
    "ui-select-input": UiPartElement<typeof select, "input">
    "ui-select-empty": UiPartElement<typeof select, "empty">
    "ui-select-status": UiPartElement<typeof select, "status">
    "ui-select-item-text": UiPartElement<typeof select, "item-text">
    "ui-select-select-all": UiPartElement<typeof select, "select-all">
    "ui-select-item": UiPartElement<
      typeof select,
      "item",
      "label" | "disabled" | "index",
      "value"
    >
    "ui-select-item-indicator": UiPartElement<
      typeof select,
      "item-indicator",
      "keepMounted"
    >
    "ui-select-item-icon": UiPartElement<typeof select, "item-icon", "mirror">
    "ui-select-value-icon": UiPartElement<typeof select, "value-icon">
    "ui-select-group": UiPartElement<typeof select, "group">
    "ui-select-group-label": UiPartElement<typeof select, "group-label">
    "ui-select-separator": UiPartElement<typeof select, "separator">
    "ui-select-arrow": UiPartElement<typeof select, "arrow">
    "ui-color-picker-area": UiPartElement<typeof colorPicker, "area", "x" | "y">
    "ui-color-picker-area-thumb": UiPartElement<
      typeof colorPicker,
      "area-thumb"
    >
    "ui-color-picker-area-canvas": UiPartElement<
      typeof colorPicker,
      "area-canvas"
    >
    "ui-color-picker-slider": UiPartElement<
      typeof colorPicker,
      "slider",
      "channel" | "orientation"
    >
    "ui-color-picker-slider-thumb": UiPartElement<
      typeof colorPicker,
      "slider-thumb"
    >
    "ui-color-picker-input": UiPartElement<typeof colorPicker, "input">
    "ui-color-picker-channel-input": UiPartElement<
      typeof colorPicker,
      "channel-input",
      "channel"
    >
    "ui-color-picker-swatch": UiPartElement<typeof colorPicker, "swatch">
    "ui-color-picker-eye-dropper": UiPartElement<
      typeof colorPicker,
      "eye-dropper"
    >
    "ui-color-picker-swatches": UiPartElement<typeof colorPicker, "swatches">
    "ui-color-picker-swatch-item": UiPartElement<
      typeof colorPicker,
      "swatch-item",
      "value"
    >
    "ui-slider-control": UiPartElement<typeof slider, "control">
    "ui-slider-track": UiPartElement<typeof slider, "track">
    "ui-slider-indicator": UiPartElement<typeof slider, "indicator">
    "ui-slider-thumb": UiPartElement<typeof slider, "thumb", "index">
    "ui-slider-thumb-input": UiPartElement<typeof slider, "thumb-input">
    "ui-slider-value": UiPartElement<typeof slider, "value">
    "ui-switch-thumb": UiPartElement<typeof switchPrimitive, "thumb">
    "ui-segmented-control-indicator": UiPartElement<
      typeof segmentedControl,
      "indicator"
    >
    "ui-tabs-list": UiPartElement<typeof tabs, "list">
    "ui-tabs-tab": UiPartElement<typeof tabs, "tab", "value" | "disabled">
    "ui-tabs-tab-icon": UiPartElement<typeof tabs, "tab-icon", "mirror">
    "ui-tabs-indicator": UiPartElement<typeof tabs, "indicator">
    "ui-tabs-panel": UiPartElement<
      typeof tabs,
      "panel",
      "value" | "keepMounted" | "hiddenUntilFound"
    >
    "ui-toggle-icon": UiPartElement<typeof toggle, "icon", "mirror">
    "ui-token-input-editor": UiPartElement<
      typeof tokenInput,
      "editor",
      "placeholder"
    >
    "ui-token-input-token": UiPartElement<typeof tokenInput, "token", "token">
    "ui-token-input-token-remove": UiPartElement<
      typeof tokenInput,
      "token-remove",
      "token"
    >
    "ui-toolbar-button": UiPartElement<
      typeof toolbar,
      "button",
      "disabled" | "focusableWhenDisabled"
    >
    "ui-toolbar-input": UiPartElement<
      typeof toolbar,
      "input",
      "disabled" | "focusableWhenDisabled"
    >
    "ui-toolbar-link": UiPartElement<typeof toolbar, "link">
    "ui-toolbar-group": UiPartElement<typeof toolbar, "group", "disabled">
    "ui-toolbar-separator": UiPartElement<typeof toolbar, "separator">
    "ui-tooltip-trigger": UiPartElement<
      typeof tooltip,
      "trigger",
      never,
      "payload"
    >
    "ui-tooltip-content": UiPartElement<
      typeof tooltip,
      "content",
      | "side"
      | "align"
      | "sideOffset"
      | "alignOffset"
      | "collisionPadding"
      | "container"
      | "arrowPadding"
      | "anchor"
    >
    "ui-tooltip-arrow": UiPartElement<typeof tooltip, "arrow">
    "ui-tooltip-shortcut": UiPartElement<typeof tooltip, "shortcut", "shortcut">
    "ui-tree-item": UiPartElement<
      typeof tree,
      "item",
      "value" | "branch" | "disabled" | "label"
    >
    "ui-tree-item-label": UiPartElement<typeof tree, "label">
    "ui-tree-item-indicator": UiPartElement<typeof tree, "indicator">
    "ui-tree-item-checkbox": UiPartElement<typeof tree, "checkbox">
    "ui-tree-group": UiPartElement<
      typeof tree,
      "group",
      "keepMounted" | "hiddenUntilFound"
    >
    "ui-waterfall-header-row": UiPartElement<typeof waterfall, "header-row">
    "ui-waterfall-column-header": UiPartElement<
      typeof waterfall,
      "column-header"
    >
    "ui-waterfall-axis": UiPartElement<typeof waterfall, "axis", "maxTicks">
    "ui-waterfall-tick": UiPartElement<typeof waterfall, "tick", "time">
    "ui-waterfall-mark": UiPartElement<typeof waterfall, "mark", "time">
    "ui-waterfall-row": UiPartElement<typeof waterfall, "row", "value">
    "ui-waterfall-row-header": UiPartElement<typeof waterfall, "row-header">
    "ui-waterfall-indicator": UiPartElement<typeof waterfall, "indicator">
    "ui-waterfall-cell": UiPartElement<typeof waterfall, "cell">
    "ui-waterfall-bar": UiPartElement<typeof waterfall, "bar">
    "ui-trigger-menu-input": UiPartElement<typeof triggerMenu, "input">
    "ui-trigger-menu-content": UiPartElement<
      typeof triggerMenu,
      "content",
      | "side"
      | "align"
      | "sideOffset"
      | "alignOffset"
      | "collisionPadding"
      | "arrowPadding"
      | "container"
      | "anchor"
      | "keepMounted"
    >
    "ui-trigger-menu-list": UiPartElement<typeof triggerMenu, "list">
    // Its `itemselect` event fires on the trigger menu.
    "ui-trigger-menu-item": UiPartElement<
      typeof triggerMenu,
      "item",
      "value" | "label" | "keywords" | "disabled",
      never,
      {}
    >
    "ui-trigger-menu-item-icon": UiPartElement<
      typeof triggerMenu,
      "item-icon",
      "mirror"
    >
    "ui-trigger-menu-group": UiPartElement<typeof triggerMenu, "group">
    "ui-trigger-menu-group-label": UiPartElement<
      typeof triggerMenu,
      "group-label"
    >
    "ui-trigger-menu-separator": UiPartElement<typeof triggerMenu, "separator">
    "ui-trigger-menu-empty": UiPartElement<typeof triggerMenu, "empty">
    "ui-trigger-menu-status": UiPartElement<typeof triggerMenu, "status">
    "ui-trigger-menu-hint": UiPartElement<typeof triggerMenu, "hint">
  }
}

/**
 * The events of `<ui-file-input>`: `valuechange` carries the files in
 * `detail.value`, with what changed beside them, and `reject` the files that
 * failed the checks.
 * @stable
 */
type FileInputEvents = {
  valuechange: UiDetailedChangeEvent<File[], FileInputValueChangeDetails>
  reject: UiDetailedChangeEvent<
    FileRejection[],
    CommitDetails<FileInputValueChangeReason>
  >
}
/**
 * `<ui-file-input>`: the files as `value`, the controller's methods on `api`, form members like a native input, and typed events.
 * @stable
 */
interface UiFileInputElement
  extends
    UiElement<FileInputEvents>,
    FormControlProperties<
      typeof fileInput,
      | "announcement"
      | "api"
      | "controller"
      | "defaultValue"
      | "validate"
      | "value"
    > {
  value: readonly File[]
  api: FileInputController
  controller?: FileInputController
  /** A check of your own. Return a reason to reject the file. */
  validate?: FileInputOptions["validate"]
  /** What screen readers hear after a change. Return null for nothing. */
  announcement?: FileInputOptions["announcement"]
  /** The files at first, which a form reset returns to. Set it before the element connects. */
  defaultValue?: File[]
}

export {
  type AttributeProperties,
  type AccordionEvents,
  type AlertDialogEvents,
  type AutocompleteEvents,
  type AvatarEvents,
  type ButtonEvents,
  type CalendarEvents,
  type CarouselEvents,
  type CheckboxEvents,
  type CheckboxGroupEvents,
  type CollapsibleEvents,
  type ColorPickerEvents,
  type ComboboxEvents,
  type CommandEvents,
  type DateInputEvents,
  type DatePickerEvents,
  type DialogEvents,
  type DrawerEvents,
  type FileInputEvents,
  type HoverCardEvents,
  type ImageCropperEvents,
  type InputEvents,
  type ListboxEvents,
  type MenuEvents,
  type NavigationMenuEvents,
  type NumberInputEvents,
  type OTPInputEvents,
  type TimeInputEvents,
  type PaginationEvents,
  type PartEvents,
  type PartProperties,
  type PasswordInputEvents,
  type PopoverEvents,
  type RadioGroupEvents,
  type RatingEvents,
  type ResizableEvents,
  type SegmentedControlEvents,
  type SelectEvents,
  type SliderEvents,
  type SwitchEvents,
  type TabsEvents,
  type ToggleEvents,
  type ToggleGroupEvents,
  type TokenInputEvents,
  type TooltipEvents,
  type TreeEvents,
  type TriggerMenuEvents,
  type UiAccordionElement,
  type UiAlertDialogElement,
  type UiAutocompleteElement,
  type UiAvatarElement,
  type UiButtonElement,
  type UiCalendarElement,
  type UiCarouselElement,
  type UiChangeDetail,
  type UiChangeEvent,
  type UiCheckboxElement,
  type UiCheckboxGroupElement,
  type UiTimelineElement,
  type UiCollapsibleElement,
  type UiColorPickerElement,
  type UiComboboxElement,
  type UiCommandElement,
  type UiDateInputElement,
  type UiDatePickerElement,
  type UiDetailedChangeEvent,
  type UiDialogElement,
  type UiDismissAttemptEvent,
  type UiDrawerElement,
  type UiElement,
  type UiFieldElement,
  type UiFieldGroupElement,
  type UiFieldSetElement,
  type UiFileInputElement,
  type UiGaugeElement,
  type UiHighlightEvent,
  type UiHoverCardElement,
  type UiImageCropperElement,
  type UiInputElement,
  type UiInputGroupElement,
  type UiLabelElement,
  type UiListboxElement,
  type UiLoadMoreEvent,
  type UiMenubarElement,
  type UiMenuElement,
  type UiMenuSubElement,
  type UiMeterElement,
  type UiNavigationMenuElement,
  type UiNumberInputElement,
  type UiOpenChangeCompleteEvent,
  type UiOTPInputElement,
  type UiTimeInputElement,
  type UiOverlayHostElement,
  type UiPaginationElement,
  type UiPartElement,
  type UiPasswordInputElement,
  type UiPopoverElement,
  type UiPreferencesElement,
  type UiRadioElement,
  type UiRadioGroupElement,
  type UiRatingElement,
  type UiResizableElement,
  type UiScrollAreaElement,
  type UiSegmentedControlElement,
  type UiSegmentedControlItemElement,
  type UiSelectElement,
  type UiSeparatorElement,
  type UiSliderElement,
  type UiSwitchElement,
  type UiTabsElement,
  type UiTextareaElement,
  type UiToastRegionElement,
  type UiToggleElement,
  type UiToggleGroupElement,
  type UiTokenInputElement,
  type UiToolbarElement,
  type UiTooltipElement,
  type UiTreeElement,
  type UiTriggerMenuElement,
  type UiWaterfallElement,
  type WaterfallEvents,
}
