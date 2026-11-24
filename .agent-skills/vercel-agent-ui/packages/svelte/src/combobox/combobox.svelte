<!--
@component
A text input that filters a list as you type.
The combobox renders no element of its own: the input, the chips and the
list are its parts.
@stable
-->
<script
  lang="ts"
  generics="T = string, Multiple extends boolean | undefined = false"
>
  import type { ChangeDetails, DismissAttemptDetails } from "@ui-sdk/core"
  import type { AsyncOptionsStatus } from "@ui-sdk/core/async-options"
  import {
    combobox as comboboxPrimitive,
    type ComboboxController,
    type ComboboxDismissReason,
    type ComboboxOpenChangeReason,
    type ComboboxQueryChangeReason,
    type ComboboxValueChangeReason,
    type ListAnnouncement,
    type ListData,
    type ListFilter,
    type ListHighlightDetails,
  } from "@ui-sdk/core/combobox"
  import { setContext, type Snippet } from "svelte"
  import { useFieldControl } from "../field/context"
  import { provideInstance } from "../instance"
  import { useOwnPart } from "../own-part.svelte"
  import { useControllerEntry, type PopupContainer } from "../popup.svelte"
  import { provideSheetHeader } from "../sheet-header.svelte"
  import { useHandlePart, usePrimitive } from "../use-primitive.svelte"
  import ValueInput from "../value-input.svelte"
  import { ContainerKey, OwnContentKey } from "./context"
  import ComboboxContent from "./combobox-content.svelte"

  type ValueDetails = ChangeDetails<ComboboxValueChangeReason>
  type QueryDetails = ChangeDetails<ComboboxQueryChangeReason>
  // The value's shape follows `multiple`. The multiple side comes first, so a
  // list in a variable infers `T` as its items.
  type ComboboxValueProps<T, Multiple> =
    | ({
        /** Whether several items can be selected. The value is then a list, the list stays open as items toggle, and the input empties after each choice. */
        multiple: Multiple
        /** The selected values. Bind it with `bind:value` to control the combobox. */
        value?: T[]
        /** The values selected at first, when uncontrolled. A form reset returns to them. */
        defaultValue?: T[]
        /** Runs when a user, a form reset or a controller wants to change the value. `details.cancel()` stops it. */
        onValueChange?: (value: T[], details: ValueDetails) => void
      } & ([Multiple] extends [true] ? unknown : never))
    | ({
        /** Whether several items can be selected. */
        multiple?: Multiple
        /** The selected value. Bind it with `bind:value` to control the combobox. `null` selects nothing. */
        value?: T | null
        /** The value selected at first, when uncontrolled. A form reset returns to it. */
        defaultValue?: T | null
        /** Runs when a user, a form reset or a controller wants to change the value. `details.cancel()` stops it. */
        onValueChange?: (
          value: NoInfer<T> | null,
          details: ValueDetails
        ) => void
      } & ([Multiple] extends [false | undefined] ? unknown : never))
    | ({
        /** Whether several items can be selected. */
        multiple?: Multiple
        /** The selected value, or values with `multiple`. Bind it with `bind:value` to control the combobox. */
        value?: T | T[] | null
        /** The value or values selected at first, when uncontrolled. A form reset returns to it. */
        defaultValue?: T | T[] | null
        /** Runs when a user, a form reset or a controller wants to change the value. `details.cancel()` stops it. */
        onValueChange?: (
          value: NoInfer<T> | NoInfer<T>[] | null,
          details: ValueDetails
        ) => void
      } & (boolean extends Multiple ? unknown : never))
  type OpenDetails = ChangeDetails<ComboboxOpenChangeReason>

  let {
    value = $bindable(),
    defaultValue,
    query = $bindable(),
    defaultQuery,
    open = $bindable(),
    defaultOpen,
    multiple,
    maxSelected,
    items,
    emptyItems,
    filter,
    announcement,
    itemToValue,
    itemToLabel,
    isItemEqualToValue,
    autoHighlight,
    keepQuery,
    pendingAnnouncement,
    allowCustomValue,
    status,
    loop,
    modal,
    presentation,
    disabled,
    readOnly,
    required,
    name,
    form,
    controller,
    dismissible,
    debug,
    container,
    onValueChange,
    onQueryChange,
    onOpenChange,
    onOpenChangeComplete,
    onHighlight,
    onLoadMore,
    onDismissAttempt,
    children,
  }: {
    /** The input's text, which filters the list. Bind it with `bind:query` to control it. Choosing an item sets it to the item's label, or empties it with `multiple`. */
    query?: string
    /** The input's text at first, when uncontrolled. Defaults to the selected item's label. */
    defaultQuery?: string
    /** Whether the list is open. Bind it with `bind:open` to control it. */
    open?: boolean
    /** Whether the list starts open, when uncontrolled. */
    defaultOpen?: boolean
    /** With `multiple`, how many items can be selected. Once reached, the other items are disabled. */
    maxSelected?: number
    /** The items as data. Renders the list for you, and filters it without rendering every item. */
    items?: ListData<T>
    /** Items shown instead of `items` while the input is empty, like recent choices. Needs `items`. */
    emptyItems?: ListData<T>
    /** How typing narrows the list: `"contains"`, `"startsWith"`, a function of the item and the text, whose numeric result also sorts data items, or `false` to keep every item, for results a server already filtered. */
    filter?: ListFilter<T>
    /** What screen readers hear after typing pauses, when no `ComboboxStatus` is rendered, and when a chip is removed. Return null for nothing. */
    announcement?: (change: ListAnnouncement) => string | null | undefined
    /** The string an item's value submits as and is identified by, for object values. */
    itemToValue?: (value: T) => string
    /** The text a value shows, for values whose item isn't rendered, like async results. */
    itemToLabel?: (value: T) => string
    /** Whether an item's value is the selected value, for object values that aren't the same object. */
    isItemEqualToValue?: (itemValue: T, value: T) => boolean
    /** Whether the first matching item is highlighted while typing, so Enter chooses it. `"always"` also highlights the selected item, or the first, when the list opens. */
    autoHighlight?: boolean | "always" | "selected"
    /** With `multiple`, whether the input keeps its text after an item is chosen. */
    keepQuery?: boolean
    /** What screen readers hear once the Create part's action has been pending for a second. An empty string says nothing. */
    pendingAnnouncement?: string
    /** Whether text that matches no item becomes the value, when Enter is pressed with nothing highlighted, or, without `multiple`, when the list closes. */
    allowCustomValue?: boolean
    /** Whether results are loading or failed, for the status and empty parts. */
    status?: AsyncOptionsStatus
    /** Whether arrow keys wrap from the last item to the first. */
    loop?: boolean
    /** `false`: the page stays usable while the list is open. `"pointer"`: an outside press only closes the list. `true`: also locks scroll and makes the rest of the page inert. */
    modal?: boolean | "pointer"
    /** How the list presents: a popover, a sheet with the input in its header, or `"auto"` for a sheet on small touch screens. */
    presentation?: "auto" | "popover" | "sheet"
    /** Disables the combobox like a native input. */
    disabled?: boolean
    /** Keeps the combobox focusable and its value submitted, but stops changes. */
    readOnly?: boolean
    /** Blocks form submission until a value is selected. */
    required?: boolean
    /** The name the value submits under. Without one, the combobox submits nothing. */
    name?: string
    /** The id of a form to belong to, when the combobox isn't inside that form. */
    form?: string
    /** Opens, closes, reads and sets the combobox from anywhere. Create one with `createComboboxController()`. */
    controller?: ComboboxController<any, any>
    /** Whether Escape, an outside press, focus or the window leaving, Android's back gesture, the screen reader's escape gesture and a swipe on a sheet can close the list. Typing, the trigger, items and the controller always can. */
    dismissible?: boolean
    /** Logs every state change with its reason. */
    debug?: boolean
    /** Renders the list into this element instead of in place. */
    container?: PopupContainer
    /** Runs when the input's text wants to change: typing, choosing an item, or closing with text that wasn't chosen. `details.cancel()` stops it. */
    onQueryChange?: (query: string, details: QueryDetails) => void
    /** Runs when the list wants to open or close. `details.cancel()` stops it. */
    onOpenChange?: (open: boolean, details: OpenDetails) => void
    /** Runs once the list has finished opening or closing, after any animation. */
    onOpenChangeComplete?: (open: boolean) => void
    /** Runs when the highlight moves, with the item's index among the visible items. */
    onHighlight?: (value: T | null, details: ListHighlightDetails) => void
    /** Runs when the highlight or scrolling reaches the last item, so the next page can load. */
    onLoadMore?: () => void
    /** Runs when `dismissible` refused a dismissal made on purpose: Escape, an outside press, back, the screen reader's escape or a swipe. Focus or the window leaving is refused without it. */
    onDismissAttempt?: (
      details: DismissAttemptDetails<ComboboxDismissReason>
    ) => void
    children?: Snippet
  } & ComboboxValueProps<T, Multiple> = $props()

  const id = $props.id()
  const field = useFieldControl()
  setContext(ContainerKey, () => container)
  const combobox = usePrimitive(comboboxPrimitive, () => ({
    id,
    get value() {
      return value
    },
    defaultValue,
    get query() {
      return query
    },
    defaultQuery,
    get open() {
      return open
    },
    defaultOpen,
    multiple,
    maxSelected,
    items,
    emptyItems,
    filter,
    announcement,
    itemToValue,
    itemToLabel,
    isItemEqualToValue,
    autoHighlight,
    keepQuery,
    pendingAnnouncement,
    allowCustomValue,
    status,
    loop,
    modal,
    presentation,
    disabled: disabled || field?.disabled(),
    readOnly,
    required,
    name: name ?? field?.name(),
    form,
    controller,
    dismissible,
    debug,
    onValueChange: (next: unknown, details: ValueDetails) => {
      // The callback runs first, so canceling there also keeps a bound `value` as it was.
      onValueChange?.(next as never, details)
      if (!details.canceled) {
        value = next as never
      }
    },
    onQueryChange: (next: string, details: QueryDetails) => {
      onQueryChange?.(next, details)
      if (!details.canceled) {
        query = next
      }
    },
    onOpenChange: (next: boolean, details: OpenDetails) => {
      onOpenChange?.(next, details)
      if (!details.canceled) {
        open = next
      }
    },
    onOpenChangeComplete,
    onHighlight,
    onLoadMore,
    onDismissAttempt,
  }))
  useControllerEntry(() => controller, combobox)
  provideInstance(comboboxPrimitive, combobox)
  provideSheetHeader()
  // A data combobox renders its list, unless a ComboboxContent is among the children.
  const own = useOwnPart(OwnContentKey)
  // The hidden inputs that take part in a form: one for the value, or one
  // more per value with `multiple`. The input's attributes change with the
  // value, so reading them keeps the list of values current.
  const formInput = useHandlePart(combobox, "form-input")
  // A textarea's value is its text, which the server renders too.
  const { value: formValue, ...formAttrs } = $derived(formInput.slot())
  const values = $derived(
    (formInput.attrs,
    combobox.state.multiple ? combobox.api.internal.serialized() : [])
  )
</script>

{@render children?.()}
{#if items && !own()}
  <ComboboxContent fromRoot />
{/if}
<textarea {...formAttrs}>{formValue}</textarea>
{#each values as key (key)}
  <ValueInput owner={combobox} value={key} />
{/each}
