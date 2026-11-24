<!--
@component
A text field that suggests as you type. The text is the value. Renders no element of its own.
@stable
-->
<script lang="ts">
  import type { ChangeDetails, DismissAttemptDetails } from "@ui-sdk/core"
  import type { AsyncOptionsStatus } from "@ui-sdk/core/async-options"
  import {
    autocomplete as autocompletePrimitive,
    type AutocompleteController,
    type AutocompleteDismissReason,
    type AutocompleteOpenChangeReason,
    type AutocompleteSubmitDetails,
    type AutocompleteValueChangeDetails,
    type ListAnnouncement,
    type ListData,
    type ListHighlightDetails,
    type SearchFilter,
  } from "@ui-sdk/core/autocomplete"
  import { setContext, type Snippet } from "svelte"
  import { useFieldControl } from "../field/context"
  import { provideInstance } from "../instance"
  import { useOwnPart } from "../own-part.svelte"
  import { useControllerEntry, type PopupContainer } from "../popup.svelte"
  import { provideSheetHeader } from "../sheet-header.svelte"
  import { usePrimitive } from "../use-primitive.svelte"
  import { ContainerKey, OwnContentKey } from "./context"
  import AutocompleteContent from "./autocomplete-content.svelte"

  type ValueDetails = AutocompleteValueChangeDetails
  type OpenDetails = ChangeDetails<AutocompleteOpenChangeReason>

  let {
    value = $bindable(),
    defaultValue,
    open = $bindable(),
    defaultOpen,
    items,
    emptyItems,
    announcement,
    filter,
    inlineComplete,
    autoHighlight,
    openOnFocus,
    submitOnSelect,
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
    onOpenChange,
    onOpenChangeComplete,
    onSubmit,
    onHighlight,
    onLoadMore,
    onDismissAttempt,
    children,
  }: {
    /** The text. Bind it with `bind:value` to control it. */
    value?: string
    /** The text at first, when uncontrolled. A form reset returns to it. */
    defaultValue?: string
    /** Whether the suggestions are open. Bind it with `bind:open` to control them. */
    open?: boolean
    /** Whether the suggestions start open, when uncontrolled. */
    defaultOpen?: boolean
    /** The suggestions as data. Renders them for you, and filters them without rendering every one. */
    items?: ListData<string>
    /** Suggestions shown instead of `items` while the field is empty, like recent searches, with `openOnFocus`. Needs `items`. */
    emptyItems?: ListData<string>
    /** What screen readers hear after typing pauses, when no `AutocompleteStatus` is rendered. Return null for nothing. */
    announcement?: (change: ListAnnouncement) => string | null | undefined
    /** How typing narrows the suggestions: `"contains"`, `"startsWith"`, `"fuzzy"`, a function of the item and the text, or `false` to keep every one, for results a server already filtered. */
    filter?: SearchFilter<string>
    /** Whether typing completes the text with the first suggestion that starts with it, with the rest selected after the caret. */
    inlineComplete?: boolean
    /** Whether the first suggestion is highlighted while typing, so Enter chooses it. */
    autoHighlight?: boolean
    /** Whether the suggestions open when the field gets focus, even before anything is typed. */
    openOnFocus?: boolean
    /** Whether choosing a suggestion submits, like a search box: `onSubmit` runs, then the form submits. */
    submitOnSelect?: boolean
    /** Whether results are loading or failed, for the empty and status parts. */
    status?: AsyncOptionsStatus
    /** Whether arrow keys wrap from the last suggestion to the first. */
    loop?: boolean
    /** `false`: the page stays usable while the suggestions are open. `"pointer"`: an outside press only closes them. `true`: also locks scroll and makes the rest of the page inert. */
    modal?: boolean | "pointer"
    /** How the suggestions present: a popover, a sheet with the field in its header, or `"auto"` for a sheet on small touch screens. */
    presentation?: "auto" | "popover" | "sheet"
    /** Disables the field like a native input. */
    disabled?: boolean
    /** Keeps the field focusable and its text submitted, but stops changes. */
    readOnly?: boolean
    /** Blocks form submission until there's text. */
    required?: boolean
    /** The name the text submits under. */
    name?: string
    /** The id of a form to belong to, when the field isn't inside that form. */
    form?: string
    /** Opens, closes, reads and sets the autocomplete from anywhere. Create one with `createAutocompleteController()`. */
    controller?: AutocompleteController
    /** Whether Escape, an outside press, focus or the window leaving, Android's back gesture, the screen reader's escape gesture and a swipe on a sheet can close the suggestions. Typing, the trigger, suggestions and the controller always can. */
    dismissible?: boolean
    /** Logs every state change with its reason. */
    debug?: boolean
    /** Renders the suggestions into this element instead of in place. */
    container?: PopupContainer
    /** Runs when the text wants to change: typing, choosing a suggestion, a Clear part, a form reset or a controller. `details.cancel()` keeps it as it was. */
    onValueChange?: (value: string, details: ValueDetails) => void
    /** Runs when the suggestions want to open or close. `details.cancel()` stops it. */
    onOpenChange?: (open: boolean, details: OpenDetails) => void
    /** Runs once the suggestions have finished opening or closing, after any animation. */
    onOpenChangeComplete?: (open: boolean) => void
    /** Runs with the text when Enter is pressed with no suggestion highlighted, or after choosing one with `submitOnSelect`. The surrounding form submits next, unless the event's `preventDefault()` is called. */
    onSubmit?: (value: string, details: AutocompleteSubmitDetails) => void
    /** Runs when the highlight moves, with the suggestion's index among the visible ones. */
    onHighlight?: (value: string | null, details: ListHighlightDetails) => void
    /** Runs when the highlight or scrolling reaches the last suggestion, so the next page can load. */
    onLoadMore?: () => void
    /** Runs when `dismissible` refused a dismissal made on purpose: Escape, an outside press, back, the screen reader's escape or a swipe. Focus or the window leaving is refused without it. */
    onDismissAttempt?: (
      details: DismissAttemptDetails<AutocompleteDismissReason>
    ) => void
    children?: Snippet
  } = $props()

  const id = $props.id()
  const field = useFieldControl()
  setContext(ContainerKey, () => container)
  const autocomplete = usePrimitive(autocompletePrimitive, () => ({
    id,
    get value() {
      return value
    },
    defaultValue,
    get open() {
      return open
    },
    defaultOpen,
    items,
    emptyItems,
    announcement,
    filter,
    inlineComplete,
    autoHighlight,
    openOnFocus,
    submitOnSelect,
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
    onValueChange: (next: string, details: ValueDetails) => {
      // The callback runs first, so canceling there also keeps a bound `value` as it was.
      onValueChange?.(next, details)
      if (!details.canceled) {
        value = next
      }
    },
    onOpenChange: (next: boolean, details: OpenDetails) => {
      onOpenChange?.(next, details)
      if (!details.canceled) {
        open = next
      }
    },
    onOpenChangeComplete,
    onSubmit,
    onHighlight,
    onLoadMore,
    onDismissAttempt,
  }))
  useControllerEntry(() => controller, autocomplete)
  provideInstance(autocompletePrimitive, autocomplete)
  provideSheetHeader()
  // A data autocomplete renders its list, unless an AutocompleteContent is among the children.
  const own = useOwnPart(OwnContentKey)
</script>

{@render children?.()}
{#if items && !own()}
  <AutocompleteContent fromRoot />
{/if}
