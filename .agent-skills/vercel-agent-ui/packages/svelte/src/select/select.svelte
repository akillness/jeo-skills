<!--
@component
Picks one value, or several with `multiple`, from a list in a popup.
@stable
-->
<script
  lang="ts"
  generics="T = string, Multiple extends boolean | undefined = false"
>
  import type { ChangeDetails, DismissAttemptDetails } from "@ui-sdk/core"
  import type { AsyncOptionsStatus } from "@ui-sdk/core/async-options"
  import {
    select as selectPrimitive,
    type ListAnnouncement,
    type ListData,
    type ListFilter,
    type ListHighlightDetails,
    type SelectController,
    type SelectDismissReason,
    type SelectOpenChangeReason,
    type SelectQueryChangeReason,
    type SelectValueChangeReason,
  } from "@ui-sdk/core/select"
  import { setContext, type Snippet } from "svelte"
  import { useFieldControl } from "../field/context"
  import { provideInstance } from "../instance"
  import { useOwnPart } from "../own-part.svelte"
  import { useControllerEntry, type PopupContainer } from "../popup.svelte"
  import { useHandlePart, usePrimitive } from "../use-primitive.svelte"
  import ValueInput from "../value-input.svelte"
  import { ContainerKey, OwnContentKey } from "./context"
  import SelectContent from "./select-content.svelte"

  type ValueDetails = ChangeDetails<SelectValueChangeReason>
  type OpenDetails = ChangeDetails<SelectOpenChangeReason>
  type QueryDetails = ChangeDetails<SelectQueryChangeReason>
  // The value's shape follows `multiple`. The multiple side comes first, so a
  // list in a variable infers `T` as its items.
  type SelectValueProps<T, Multiple> =
    | ({
        /** Whether several items can be selected. The value is then a list. */
        multiple: Multiple
        /** The selected values. Bind it with `bind:value` to control the select. */
        value?: T[]
        /** The values selected at first, when uncontrolled. A form reset returns to them. */
        defaultValue?: T[]
        /** Runs when a user, a form reset or a controller wants to change the value. `details.cancel()` stops it. */
        onValueChange?: (value: T[], details: ValueDetails) => void
      } & ([Multiple] extends [true] ? unknown : never))
    | ({
        /** Whether several items can be selected. */
        multiple?: Multiple
        /** The selected value. Bind it with `bind:value` to control the select. `null` selects nothing. */
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
        /** The selected value, or values with `multiple`. Bind it with `bind:value` to control the select. */
        value?: T | T[] | null
        /** The value or values selected at first, when uncontrolled. A form reset returns to it. */
        defaultValue?: T | T[] | null
        /** Runs when a user, a form reset or a controller wants to change the value. `details.cancel()` stops it. */
        onValueChange?: (
          value: NoInfer<T> | NoInfer<T>[] | null,
          details: ValueDetails
        ) => void
      } & (boolean extends Multiple ? unknown : never))

  let {
    value = $bindable(),
    defaultValue,
    open = $bindable(),
    defaultOpen,
    multiple,
    items,
    emptyItems,
    query = $bindable(),
    defaultQuery,
    filter,
    status,
    announcement,
    placeholder,
    itemToValue,
    itemToLabel,
    isItemEqualToValue,
    loop,
    virtualFocus,
    modal,
    presentation,
    disabled,
    readOnly,
    required,
    name,
    form,
    autoComplete,
    controller,
    dismissible,
    debug,
    container,
    onValueChange,
    onOpenChange,
    onOpenChangeComplete,
    onHighlight,
    onQueryChange,
    onLoadMore,
    onDismissAttempt,
    children,
  }: {
    /** Whether the list is open. Bind it with `bind:open` to control it. */
    open?: boolean
    /** Whether the list starts open, when uncontrolled. */
    defaultOpen?: boolean
    /** The items as data. Renders them for you. */
    items?: ListData<T>
    /** What the list shows while the search is empty, like recent choices. */
    emptyItems?: ListData<T>
    /** The search text. Bind it with `bind:query` to control it. */
    query?: string
    /** The search text at first, when uncontrolled. */
    defaultQuery?: string
    /** How the search matches items. */
    filter?: ListFilter<T>
    /** Whether items are loading, for async options. */
    status?: AsyncOptionsStatus
    /** What screen readers hear when the results change. */
    announcement?: (change: ListAnnouncement) => string | null | undefined
    /** What the trigger shows while nothing is selected. */
    placeholder?: string
    /** The string an item's value submits as and is identified by, for object values. */
    itemToValue?: (value: T) => string
    /** The label of a value whose item isn't rendered. */
    itemToLabel?: (value: T) => string
    /** Whether an item's value is the selected value, for object values that aren't the same object. */
    isItemEqualToValue?: (itemValue: T, value: T) => boolean
    /** Whether arrow keys wrap from the last item to the first. */
    loop?: boolean
    /** Keeps focus on the trigger while the list is open, which points at the highlighted item. */
    virtualFocus?: boolean
    /** Whether the page behind the list is inert, or only shielded from the pointer. */
    modal?: boolean | "pointer"
    /** How the list presents: a popover, a sheet, or `"auto"` for a sheet on small touch screens. */
    presentation?: "auto" | "popover" | "sheet"
    /** Disables the select like a native control. */
    disabled?: boolean
    /** Keeps the select focusable and its value submitted, but stops changes. */
    readOnly?: boolean
    /** Blocks form submission until a value is selected. */
    required?: boolean
    /** The name the value submits under. */
    name?: string
    /** The id of a form to belong to, when the select isn't inside that form. */
    form?: string
    /** The browser's autofill hint. */
    autoComplete?: string
    /** Reads and sets the select from anywhere, and connects triggers outside it. Create one with `createSelectController()`. */
    controller?: SelectController<any, any>
    /** Whether Escape, an outside press, focus or the window leaving, Android's back gesture, the screen reader's escape gesture and a swipe on a sheet can close the list. The trigger, items and the controller always can. */
    dismissible?: boolean
    /** Logs every state change with its reason. */
    debug?: boolean
    /** Renders the list into this element instead of in place. */
    container?: PopupContainer
    /** Runs when the list wants to open or close. `details.cancel()` stops it. */
    onOpenChange?: (open: boolean, details: OpenDetails) => void
    /** Runs once the list has finished opening or closing, after any animation. */
    onOpenChangeComplete?: (open: boolean) => void
    /** Runs when the highlight moves to another item. */
    onHighlight?: (value: T | null, details: ListHighlightDetails) => void
    /** Runs when the search text wants to change. `details.cancel()` stops it. */
    onQueryChange?: (query: string, details: QueryDetails) => void
    /** Runs when the list is scrolled near its end, for async options. */
    onLoadMore?: () => void
    /** Runs when `dismissible` refused a dismissal made on purpose: Escape, an outside press, back, the screen reader's escape or a swipe. Focus or the window leaving is refused without it. */
    onDismissAttempt?: (
      details: DismissAttemptDetails<SelectDismissReason>
    ) => void
    children?: Snippet
  } & SelectValueProps<T, Multiple> = $props()

  const id = $props.id()
  const field = useFieldControl()
  setContext(ContainerKey, () => container)
  const select = usePrimitive(selectPrimitive, () => ({
    id,
    get value() {
      return value
    },
    defaultValue,
    get open() {
      return open
    },
    defaultOpen,
    multiple,
    items,
    emptyItems,
    get query() {
      return query
    },
    defaultQuery,
    filter,
    status,
    announcement,
    placeholder,
    itemToValue,
    itemToLabel,
    isItemEqualToValue,
    loop,
    virtualFocus,
    modal,
    presentation,
    disabled: disabled || field?.disabled(),
    readOnly,
    required,
    name: name ?? field?.name(),
    form,
    autoComplete,
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
    onOpenChange: (next: boolean, details: OpenDetails) => {
      onOpenChange?.(next, details)
      if (!details.canceled) {
        open = next
      }
    },
    onOpenChangeComplete,
    onHighlight,
    onQueryChange: (next: string, details: QueryDetails) => {
      onQueryChange?.(next, details)
      if (!details.canceled) {
        query = next
      }
    },
    onLoadMore,
    onDismissAttempt,
  }))
  useControllerEntry(() => controller, select)
  provideInstance(selectPrimitive, select)
  // A data select renders its list, unless a SelectContent is among the children.
  const own = useOwnPart(OwnContentKey)
  // The hidden inputs that take part in a form: one for the value, or one
  // more per value with `multiple`. The input's attributes change with the
  // value, so reading them keeps the list of values current.
  const formInput = useHandlePart(select, "form-input")
  // A textarea's value is its text, which the server renders too.
  const { value: formValue, ...formAttrs } = $derived(formInput.slot())
  const values = $derived(
    (formInput.attrs,
    select.state.multiple ? select.api.internal.serialized() : [])
  )
</script>

{@render children?.()}
{#if items && !own()}
  <SelectContent fromRoot />
{/if}
<textarea {...formAttrs}>{formValue}</textarea>
{#each values as key (key)}
  <ValueInput owner={select} value={key} />
{/each}
