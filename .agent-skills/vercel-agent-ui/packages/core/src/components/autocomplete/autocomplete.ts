// Autocomplete: a text field that suggests as you type. The text is the
// value, free as any input's, and choosing a suggestion only fills it in. It
// can complete inline, with the rest of the first match selected after the
// caret, and it takes part in forms as the text field it is. It's built on
// the listbox engine Combobox uses. This module is the public API and
// assembles the primitive; state and the API live in autocomplete-api.ts,
// and parts and attributes in autocomplete-parts.ts.
import { type AsyncOptionsStatus } from "../../foundation/lists/async-options"
import { autocompleteSlots } from "./autocomplete-parts"
import {
  autocompleteApi,
  initialAutocompleteState,
  syncAutocompleteState,
} from "./autocomplete-api"
import { type Modal, type PopupResult } from "../../foundation/popups/popup"
import { pointerModalAttribute } from "../../foundation/popups/modal-attribute"
import {
  type PortalProps,
  type PositionProps,
} from "../../foundation/platform/position"
import type { PresentationSetting } from "../../foundation/popups/presentation"
import { type SearchFilter } from "../../foundation/lists/autocomplete-core"
import {
  filterAttribute,
  type ListData,
  type ListEmptyState,
  type ListHighlightDetails,
  type ListStatusState,
} from "../../foundation/lists/listbox"
import {
  type ItemIconProps,
  type ItemIconState,
} from "../../foundation/lists/item-icon"
import {
  type ListAnnouncement,
  type ListItemTextState,
} from "../../foundation/lists/listbox-search"
import { createController } from "../../foundation/kernel/controller"
import type {
  ChangeDetails,
  ChangeOptions,
  DismissAttemptReason,
} from "../../foundation/kernel/details"
import { definePrimitive } from "../../foundation/kernel/primitive"
import type {
  Named,
  PrimitiveOptions,
} from "../../foundation/kernel/primitive-types"
import { type DismissOptions } from "../../foundation/popups/dismissal"

/**
 * Why the text changed. Arrow keys fill in the highlighted suggestion with
 * `inlineComplete`, and Escape takes an inline completion back out.
 * @stable
 */
type AutocompleteValueChangeReason =
  | "input-change"
  | "item-press"
  | "list-navigation"
  | "escape-key"
  | "clear-press"
  | "reset"
  | "imperative"

/**
 * Why the suggestions opened or closed.
 * @stable
 */
type AutocompleteOpenChangeReason =
  | "trigger-press"
  | "trigger-focus"
  | "input-change"
  | "input-commit"
  | "item-press"
  | "outside-press"
  | "escape-key"
  | "close-press"
  | "focus-out"
  | "window-blur"
  | "back"
  | "swipe"
  | "imperative"

/**
 * The dismissals `dismissible` refuses that `onDismissAttempt` hears about.
 * @stable
 */
type AutocompleteDismissReason = Extract<
  AutocompleteOpenChangeReason,
  DismissAttemptReason
>

/**
 * What `onValueChange` receives after the text.
 * @stable
 */
type AutocompleteValueChangeDetails =
  ChangeDetails<AutocompleteValueChangeReason> & {
    /** The suggestion chosen, for `"item-press"`, so two with the same label can be told apart. */
    item?: { value: string; label: string }
  }

/**
 * What `onSubmit` receives besides the text.
 * @stable
 */
type AutocompleteSubmitDetails = {
  /** The key press or click that submitted. Call `event.preventDefault()` to keep the form from submitting. */
  event?: Event
}

/**
 * Options for every write method on an autocomplete controller.
 * @stable
 */
type AutocompleteChangeOptions<Reason extends string> = ChangeOptions<Reason>

/**
 * Opens, closes, reads and sets an autocomplete from outside it. Pass it as the `controller` option.
 * @stable
 */
function createAutocompleteController() {
  return createController<{
    /** Whether the suggestions are open. */
    isOpen: () => boolean
    /**
     * Opens or closes the suggestions.
     * Returns false when the change was canceled or it was already open or closed.
     */
    setOpen: (
      open: boolean,
      options?: AutocompleteChangeOptions<AutocompleteOpenChangeReason>
    ) => boolean
    /**
     * Opens the suggestions, and resolves once they close, with why and how. Resolves exactly once
     * and never rejects: on the next close, when `signal` aborts, or with reason `"unmount"`.
     */
    open: (
      options?: AutocompleteChangeOptions<AutocompleteOpenChangeReason> & {
        /** Closes the suggestions, with reason `"imperative"`, when it aborts. An already aborted signal never opens them. */
        signal?: AbortSignal
      }
    ) => Promise<PopupResult<AutocompleteOpenChangeReason, never>>
    /** Closes the suggestions. Returns false when the close was canceled or it was already closed. */
    close: (
      options?: AutocompleteChangeOptions<AutocompleteOpenChangeReason>
    ) => boolean
    /**
     * Opens the suggestions when they're closed, and closes them when they're open.
     * Returns false when the change was canceled.
     */
    toggle: (
      options?: AutocompleteChangeOptions<AutocompleteOpenChangeReason>
    ) => boolean
    /** The text. */
    getValue: () => string
    /**
     * Changes the text, which filters the suggestions.
     * Returns false when the change was canceled or nothing changed.
     */
    setValue: (
      value: string,
      options?: AutocompleteChangeOptions<AutocompleteValueChangeReason>
    ) => boolean
    /** Empties the field. Returns false when the change was canceled or nothing changed. */
    clear: (
      options?: AutocompleteChangeOptions<AutocompleteValueChangeReason>
    ) => boolean
    /** The value of the highlighted suggestion, or null when none is. */
    getHighlighted: () => string | null
    /**
     * Highlights the suggestion with this value in the open list, scrolled into view, or none with null.
     * Returns false when the suggestions are closed, or no enabled suggestion has the value.
     */
    highlight: (value: string | null) => boolean
    /** Moves focus to the field. */
    focus: () => void
  }>()
}

/**
 * A controller from `createAutocompleteController()`. Pass it as the
 * `controller` option.
 * @stable
 */
type AutocompleteController = ReturnType<typeof createAutocompleteController>

/**
 * The options `autocomplete` takes. A component takes them as props on its
 * root.
 * @stable
 */
type AutocompleteOptions = PortalProps & {
  /** The text. Pass it to control it. */
  value?: string
  /** The text at first, when uncontrolled. A form reset returns to it. */
  defaultValue?: string
  /** Runs when the text wants to change: typing, choosing a suggestion, a Clear part, a form reset or a controller. `details.cancel()` keeps it as it was. */
  onValueChange?: (
    value: string,
    details: AutocompleteValueChangeDetails
  ) => void
  /** Whether the suggestions are open. Pass it to control them. */
  open?: boolean
  /**
   * Whether the suggestions start open, when uncontrolled.
   * @defaultValue false
   */
  defaultOpen?: boolean
  /** Runs when the suggestions want to open or close. `details.reason` says why, and `details.cancel()` stops it. */
  onOpenChange?: (
    open: boolean,
    details: ChangeDetails<AutocompleteOpenChangeReason>
  ) => void
  /** Runs once the suggestions have finished opening or closing, after any animation. */
  onOpenChangeComplete?: (open: boolean) => void
  /**
   * Runs with the text when Enter is pressed with no suggestion highlighted, or after choosing one
   * with `submitOnSelect`. The surrounding form submits next, unless the event's `preventDefault()` is called.
   */
  onSubmit?: (value: string, details: AutocompleteSubmitDetails) => void
  /** The suggestions as data. Renders them for you, and filters them without rendering every one. */
  items?: ListData<string>
  /** Suggestions shown instead of `items` while the field is empty, like recent searches, with `openOnFocus`. Groups work, like `{ type: "group", label: "Recent", items }`. Needs `items`. */
  emptyItems?: ListData<string>
  /**
   * How typing narrows the suggestions: `"contains"`, `"startsWith"`, `"fuzzy"`, a function of the
   * item and the text, or `false` to keep every one, for results a server already filtered.
   * @defaultValue "contains"
   */
  filter?: SearchFilter<string>
  /**
   * Whether typing completes the text with the first suggestion that starts with it, with the rest
   * selected after the caret: ArrowRight or End accepts it, Backspace and Escape take it back out,
   * and arrow keys fill in the suggestion they highlight.
   * @defaultValue false
   */
  inlineComplete?: boolean
  /**
   * Whether the first suggestion is highlighted while typing, so Enter chooses it.
   * @defaultValue false
   */
  autoHighlight?: boolean
  /**
   * Whether the suggestions open when the field gets focus, like recent searches, even before anything is typed.
   * @defaultValue false
   */
  openOnFocus?: boolean
  /**
   * Whether choosing a suggestion submits, like a search box: `onSubmit` runs, then the form submits.
   * @defaultValue false
   */
  submitOnSelect?: boolean
  /**
   * Whether results are loading or failed, for the empty and status parts. Sets `aria-busy` on the list while loading.
   * @defaultValue "idle"
   */
  status?: AsyncOptionsStatus
  /** Runs when the highlight moves, with the suggestion's index among the visible ones, so a virtualized list can scroll to it. */
  onHighlight?: (value: string | null, details: ListHighlightDetails) => void
  /** Runs when the highlight or scrolling reaches the last suggestion, so the next page can load, like `createAsyncOptions`'s `loadMore`. Not again for the same suggestions, unless the last load failed. */
  onLoadMore?: () => void
  /**
   * What screen readers hear after typing pauses, when no `AutocompleteStatus` is rendered. Return null for nothing.
   * @defaultValue "3 results", "No results" or "Loading"
   */
  announcement?: (change: ListAnnouncement) => string | null | undefined
  /**
   * Whether arrow keys wrap from the last suggestion to the first.
   * @defaultValue true
   */
  loop?: boolean
  /**
   * `false`: the page stays usable while the suggestions are open. `"pointer"`: an outside press only closes them. `true`: also locks scroll and makes the rest of the page inert.
   * @defaultValue false, or true while it presents as a sheet
   */
  modal?: Extract<Modal, boolean | "pointer">
  /**
   * How the suggestions present. `"sheet"` slides them up from the bottom of the screen with the field in its header, where they can be swiped away, and `"auto"` does that on small touch screens. A tap that opens a sheet leaves the keyboard closed until the field in the header is tapped. Decided each time they open; the server renders `"popover"` for `"auto"`.
   * @defaultValue "popover"
   */
  presentation?: PresentationSetting<"popover">
  /** Disables the field like a native input: it can't be focused or changed, and its text isn't submitted. */
  disabled?: boolean
  /** Keeps the field focusable and its text submitted, but stops changes. */
  readOnly?: boolean
  /** Blocks form submission while the field is empty, with the browser's own message. */
  required?: boolean
  /** The name the text submits under. */
  name?: string
  /** The id of a form to belong to, when the field isn't inside that form. */
  form?: string
  /** Opens, closes, reads and sets the autocomplete from anywhere. Create one with `createAutocompleteController()`. */
  controller?: AutocompleteController
} & DismissOptions<AutocompleteOpenChangeReason> &
  PrimitiveOptions

/**
 * Props of the content, in every framework.
 * @stable
 */
type AutocompleteContentProps = PositionProps &
  PortalProps & {
    /**
     * Which side of the field the suggestions open on.
     * @defaultValue "bottom"
     */
    side?: PositionProps["side"]
    /**
     * How the suggestions line up with the field along that side.
     * @defaultValue "start"
     */
    align?: PositionProps["align"]
    /**
     * Gap between the field and the suggestions, in pixels.
     * @defaultValue 4
     */
    sideOffset?: number
    /**
     * Shift along the field, in pixels.
     * @defaultValue 0
     */
    alignOffset?: number
    /**
     * Whether the suggestions stay in the page, hidden, while closed.
     * @defaultValue false
     */
    keepMounted?: boolean
  }

/**
 * Props of a suggestion, in every framework.
 * @stable
 */
type AutocompleteItemProps = {
  /** Identifies the suggestion. Choosing it fills the field with its `label`, or with this when there's none. */
  value: string
  /** The text the field gets and filtering matches, when the content isn't plain text. Not the accessible name: use `aria-label` for that. */
  label?: string
  /** More words filtering matches. */
  keywords?: string[]
  /** Keeps the suggestion from being chosen. Sets `data-disabled` and `aria-disabled`. */
  disabled?: boolean
  /** The suggestion's position among all visible ones, for virtualized lists that render only some. Sets `aria-posinset` and `aria-setsize`. */
  index?: number
}

/**
 * Props of the clear button, in every framework.
 * @stable
 */
type AutocompleteClearProps = {
  /**
   * Whether the clear button stays in the page while the field is empty.
   * @defaultValue false
   */
  keepMounted?: boolean
}

/**
 * The state the `input` slot of `autocomplete` hands `render` functions and
 * state-based class names.
 * @stable
 */
type AutocompleteInputState = {
  /** Whether the suggestions are open. */
  open: boolean
  /** Whether the field is disabled, by itself or by a `<fieldset>`. */
  disabled: boolean
  /** Whether the field is read-only. */
  readOnly: boolean
  /** Whether the field is required. */
  required: boolean
}
/**
 * The state the `trigger` slot of `autocomplete` hands `render` functions and
 * state-based class names.
 * @stable
 */
type AutocompleteTriggerState = AutocompleteInputState
/**
 * The state the `content` slot of `autocomplete` hands `render` functions and
 * state-based class names.
 * @stable
 */
type AutocompleteContentState = {
  /** Whether the suggestions are open. False while they animate out. */
  open: boolean
  /** How they present this time they're open. */
  presentation: "popover" | "sheet"
  /** Whether results are loading or failed. */
  status: AsyncOptionsStatus
  /** The visible suggestions, for rendering a virtualized list yourself. */
  items: ListData<string>
}
/**
 * The state the `item` slot of `autocomplete` hands `render` functions and
 * state-based class names.
 * @stable
 */
type AutocompleteItemState = {
  /** Whether the suggestion is highlighted, by the keyboard or the pointer. */
  highlighted: boolean
  /** Whether the suggestion can't be chosen. */
  disabled: boolean
}
/**
 * The state the `empty` slot of `autocomplete` hands `render` functions and
 * state-based class names.
 * @stable
 */
type AutocompleteEmptyState = ListEmptyState
/**
 * The state the `item-text` slot of `autocomplete` hands `render` functions
 * and state-based class names.
 * @stable
 */
type AutocompleteItemTextState = ListItemTextState
/**
 * The props the `item-icon` slot of `autocomplete` takes.
 * @stable
 */
type AutocompleteItemIconProps = ItemIconProps
/**
 * The state the `item-icon` slot of `autocomplete` hands `render` functions
 * and state-based class names.
 * @stable
 */
type AutocompleteItemIconState = ItemIconState
/**
 * The state the `status` slot of `autocomplete` hands `render` functions and
 * state-based class names.
 * @stable
 */
type AutocompleteStatusState = ListStatusState
/**
 * The state the `clear` slot of `autocomplete` hands `render` functions and
 * state-based class names.
 * @stable
 */
type AutocompleteClearState = {
  /** Whether the field is disabled or read-only. */
  disabled: boolean
}
/**
 * The state the `arrow` slot of `autocomplete` hands `render` functions and
 * state-based class names.
 * @stable
 */
type AutocompleteArrowState = {
  /** Whether the suggestions are open. */
  open: boolean
}

const autocompletePrimitive = /* @__PURE__ */ definePrimitive({
  name: "autocomplete",
  options: {
    container: "value",
    value: "string",
    defaultValue: "string",
    onValueChange: "callback",
    open: "boolean",
    defaultOpen: "boolean",
    onOpenChange: "callback",
    onOpenChangeComplete: "callback",
    onSubmit: "callback",
    items: "value",
    emptyItems: "value",
    filter: filterAttribute(["contains", "startsWith", "fuzzy"], "contains"),
    inlineComplete: "boolean",
    autoHighlight: "boolean",
    openOnFocus: "boolean",
    submitOnSelect: "boolean",
    status: "string",
    onHighlight: "callback",
    onLoadMore: "callback",
    announcement: "value",
    loop: "boolean",
    modal: pointerModalAttribute,
    presentation: "string",
    disabled: "boolean",
    readOnly: "boolean",
    required: "boolean",
    name: "string",
    form: "string",
    controller: "value",
    dismissible: "boolean",
    onDismissAttempt: "callback",
  },
  state: initialAutocompleteState,
  live: ["highlighted"],
  controlled: ["open", "value"],
  sync: syncAutocompleteState,
  api: autocompleteApi,
  slots: (slot) => autocompleteSlots(slot),
  agent: { actions: ["setOpen", "setValue", "clear"] },
})

/**
 * The type of `autocomplete`.
 * @stable
 */
interface AutocompletePrimitive extends Named<typeof autocompletePrimitive> {}

/**
 * The autocomplete primitive, with the slots `label`, `input`, `trigger`,
 * `clear`, `content`, `viewport`, `header`, `list`, `item`, `item-text`,
 * `item-icon`, `group`, `group-label`, `separator`, `empty`, `status`,
 * `arrow`.
 * Render it with an adapter's `usePrimitive`, or compose it inside your own
 * primitive.
 * @stable
 */
const autocomplete: AutocompletePrimitive = autocompletePrimitive

export {
  autocomplete,
  type AutocompleteArrowState,
  type AutocompleteChangeOptions,
  type AutocompleteClearProps,
  type AutocompleteClearState,
  type AutocompleteContentProps,
  type AutocompleteContentState,
  type AutocompleteController,
  type AutocompleteDismissReason,
  type AutocompleteEmptyState,
  type AutocompleteInputState,
  type AutocompleteItemIconProps,
  type AutocompleteItemIconState,
  type AutocompleteItemProps,
  type AutocompleteItemState,
  type AutocompleteItemTextState,
  type AutocompleteOpenChangeReason,
  type AutocompleteOptions,
  type AutocompletePrimitive,
  type AutocompleteStatusState,
  type AutocompleteSubmitDetails,
  type AutocompleteValueChangeDetails,
  type AutocompleteTriggerState,
  type AutocompleteValueChangeReason,
  createAutocompleteController,
}
export type {
  ListData,
  ListFilter,
  ListGroup,
  ListHighlightDetails,
  ListItem,
  ListSeparator,
} from "../../foundation/lists/listbox"
export type { ListAnnouncement } from "../../foundation/lists/listbox-search"
export type { MatchSegment } from "../../foundation/text/match"
export type { AutocompleteApi } from "./autocomplete-api"
export type { SearchFilter } from "../../foundation/lists/autocomplete-core"
