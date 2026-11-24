<!--
@component
An always-visible list to choose one option from, or several with `multiple`.
@stable
-->
<script lang="ts">
  import type { ChangeDetails } from "@ui-sdk/core"
  import {
    listbox as listboxPrimitive,
    type ListData,
    type ListHighlightDetails,
    type ListboxController,
    type ListboxState,
    type ListboxValueChangeReason,
  } from "@ui-sdk/core/listbox"
  import { useFieldControl } from "../field/context"
  import Part from "../part.svelte"
  import { provideInstance } from "../instance"
  import { readOnlyOf } from "../text-control"
  import {
    useHandlePart,
    usePrimitive,
    wrapPart,
    type PartProps,
  } from "../use-primitive.svelte"
  import ValueInput from "../value-input.svelte"
  import ListboxItems from "./listbox-items.svelte"

  type Details = ChangeDetails<ListboxValueChangeReason>

  let {
    value = $bindable(),
    defaultValue,
    multiple,
    activation,
    deselectable,
    orientation,
    loop,
    virtualFocus,
    keepInView,
    items,
    itemToValue,
    isItemEqualToValue,
    disabled,
    readOnly,
    required,
    name,
    form,
    controller,
    debug,
    onValueChange,
    onHighlight,
    children,
    ...rest
  }: PartProps<"div", ListboxState> & {
    /** The selected value. Bind it with `bind:value` to control the listbox. `null` selects nothing, and with `multiple` it's a list. */
    value?: unknown
    /** The value selected at first, when uncontrolled. A form reset returns to it. */
    defaultValue?: unknown
    /** Whether several items can be selected. */
    multiple?: boolean
    /** Whether the selection follows focus. */
    activation?: "automatic" | "manual"
    /** Whether pressing the selected item of a single listbox unselects it. */
    deselectable?: boolean
    /** Which arrow keys move between items. */
    orientation?: "horizontal" | "vertical"
    /** Whether arrow keys wrap from the last item to the first. */
    loop?: boolean
    /** Keeps focus on the list, which points at the highlighted option with `aria-activedescendant`. */
    virtualFocus?: boolean
    /** Whether the list scrolls the option keys move to into view, and the selected option when it first shows. */
    keepInView?: boolean
    /** The items as data. Renders them for you. */
    items?: ListData<any>
    /** The string an item's value submits as and is identified by, for object values. */
    itemToValue?: (value: any) => string
    /** Whether an item's value is the selected value, for object values that aren't the same object. */
    isItemEqualToValue?: (itemValue: any, value: any) => boolean
    /** Disables the listbox like a native control. */
    disabled?: boolean
    /** Keeps the listbox focusable and its value submitted, but stops changes. */
    readOnly?: boolean
    /** Blocks form submission until a value is selected. */
    required?: boolean
    /** The name the value submits under. */
    name?: string
    /** The id of a form to belong to, when the listbox isn't inside that form. */
    form?: string
    /** Reads and sets the listbox from anywhere. Create one with `createListboxController()`. */
    controller?: ListboxController<any, any>
    /** Logs every state change with its reason. */
    debug?: boolean
    /** Runs when a user, a form reset or a controller wants to change the value. `details.cancel()` stops it. */
    onValueChange?: (value: any, details: Details) => void
    /** Runs when focus moves to another item. */
    onHighlight?: (value: any, details: ListHighlightDetails) => void
  } = $props()

  const id = $props.id()
  const field = useFieldControl()
  const listbox = usePrimitive(listboxPrimitive, () => ({
    id,
    get value() {
      return value
    },
    defaultValue,
    multiple,
    activation,
    deselectable,
    orientation,
    loop,
    virtualFocus,
    keepInView,
    items,
    itemToValue,
    isItemEqualToValue,
    disabled: disabled || field?.disabled(),
    readOnly: readOnlyOf(readOnly, rest),
    required,
    name: name ?? field?.name(),
    form,
    controller,
    debug,
    onValueChange: (next: unknown, details: Details) => {
      // The callback runs first, so canceling there also keeps a bound `value` as it was.
      onValueChange?.(next, details)
      if (!details.canceled) {
        value = next
      }
    },
    onHighlight,
  }))
  provideInstance(listboxPrimitive, listbox)
  const root = useHandlePart(listbox, "root")
  const control = field?.control(
    () => rest.id as string | undefined,
    () => rest["aria-describedby"]
  )
  // The hidden inputs that take part in a form: one for the value, or one
  // more per value with `multiple`. The input's attributes change with the
  // value, so reading them keeps the list of values current.
  const formInput = useHandlePart(listbox, "form-input")
  // A textarea's value is its text, which the server renders too.
  const { value: formValue, ...formAttrs } = $derived(formInput.slot())
  const values = $derived(
    (formInput.attrs,
    listbox.state.multiple ? listbox.api.internal.serialized() : [])
  )
</script>

<!-- Without content, a data listbox renders its items. -->
{#snippet data(state: ListboxState)}
  {#if items}<ListboxItems items={state.items} />{/if}
{/snippet}

<Part
  tag="div"
  part={wrapPart(root, control)}
  props={{ ...rest, children: children ?? data }}
/>
<textarea {...formAttrs}>{formValue}</textarea>
{#each values as key (key)}
  <ValueInput owner={listbox} value={key} />
{/each}
