// Autocomplete's state and API, on the shared core: the text, the popup,
// inline completion, choosing, submitting, and form resets.
import type {
  AutocompleteChangeOptions,
  AutocompleteContentProps,
  AutocompleteItemProps,
  AutocompleteOptions,
  AutocompleteValueChangeReason,
} from "./autocomplete"
import {
  createAutocompleteCore,
  type AutocompleteCoreState,
  type HighlightCause,
  type SearchFilter,
} from "../../foundation/lists/autocomplete-core"
import {
  modalityOf,
  restoreFocus,
  trackModality,
} from "../../foundation/kernel/modality"
import { deriveOpen, type PopupOpener } from "../../foundation/popups/popup"
import {
  createPopup,
  popupState,
  type PopupState,
} from "../../foundation/popups/create-popup"
import { comboboxPreset } from "../../foundation/popups/popup-presets"
import { normalize } from "../../foundation/text/typeahead"
import { submitImplicitly } from "../../foundation/forms/form"
import { afterReset, keepsValueOnReset } from "../../foundation/forms/value"
import {
  highlightedValue,
  highlightFromCode,
  type Listbox,
} from "../../foundation/lists/listbox"
import { noListing } from "../../foundation/lists/listbox-listing"
import { isDisabled } from "../../foundation/lists/listbox-parts"
import { listKeyDown } from "../../foundation/lists/listbox-keyboard"
import { opensIntoList } from "../../foundation/lists/listbox-search"
import { deriveFromOptions } from "../../foundation/kernel/derive"
import { on } from "../../foundation/kernel/events"
import type { PrimitiveContext } from "../../foundation/kernel/primitive-types"
import { createChange } from "../../foundation/kernel/input-source"
import { elements } from "../../foundation/kernel/elements"

type AutocompleteState = PopupState &
  AutocompleteCoreState & {
    // The text, with an inline completion if one shows.
    value: string
    // What the user typed, which filters the list. It differs from the value
    // while an inline completion or a highlighted suggestion fills the field.
    query: string
    // The value a form reset returns to.
    initial: string
    listed: boolean
    labeled: boolean
    // Whether typing completes inline, which the field announces.
    inline: boolean
    disabled: boolean
    formDisabled: boolean
    readOnly: boolean
    required: boolean
    name: string | undefined
    form: string | undefined
    // How the suggestions present while open, decided as they open.
    presentation: "popover" | "sheet"
  }

// The parts around the list. Presses on them don't dismiss it, and focus moving among them doesn't close it.
const controlSlots = ["input", "trigger", "clear", "label"]

function initialAutocompleteState(
  options: AutocompleteOptions
): AutocompleteState {
  const value = options.value ?? options.defaultValue ?? ""
  return {
    ...popupState(options),
    value,
    query: value,
    initial: options.defaultValue ?? "",
    highlighted: null,
    items: options.items,
    status: options.status ?? "idle",
    listed: false,
    labeled: false,
    fieldName: null,
    inline: !!options.inlineComplete,
    disabled: !!options.disabled,
    formDisabled: false,
    readOnly: !!options.readOnly,
    required: !!options.required,
    name: options.name,
    form: options.form,
    mounts: 0,
    settled: false,
    focusInList: false,
    groupLabels: [],
    presentation: "popover",
    listing: noListing,
  }
}

function syncAutocompleteState(options: AutocompleteOptions) {
  return {
    items: options.items,
    status: options.status ?? "idle",
    inline: !!options.inlineComplete,
    disabled: !!options.disabled,
    readOnly: !!options.readOnly,
    required: !!options.required,
    name: options.name,
    form: options.form,
    ...(options.defaultValue === undefined
      ? {}
      : { initial: options.defaultValue }),
    ...(options.open === undefined ? {} : { open: options.open }),
    ...(options.value === undefined ? {} : { value: options.value }),
  }
}

function autocompleteApiBody(
  context: PrimitiveContext<AutocompleteOptions, AutocompleteState, string>
) {
  const { id, store, options, element } = context
  // A controlled close clears the highlight in the same pass.
  deriveOpen(context, ["highlighted", "focusInList"], (open) =>
    open ? undefined : { highlighted: null, focusInList: false }
  )
  const change = createChange(context)
  // The text this autocomplete asked for last. Any other that arrives, like
  // from a controlled prop, also becomes what filters.
  let requested = store.get().value
  let openedBy: PopupOpener = "imperative"
  // The highlight to place once the list has mounted, after an arrow key opened it.
  let pendingHighlight: "first" | "last" | null = null

  const inputElement = () => element("input") as HTMLInputElement | undefined
  const contentElement = () => popup.element() ?? element("content")
  const editable = () => {
    const state = store.get()
    return !isDisabled(state) && !state.readOnly
  }
  const completes = () => !!options().inlineComplete

  // The first suggestion whose label starts with the text, for inline completion.
  function completionFor(text: string, listbox: Listbox) {
    const needle = normalize(text)
    if (!needle) {
      return undefined
    }
    return listbox
      .entries()
      .find(
        (entry) =>
          !listbox.disabled(entry) && normalize(entry.label).startsWith(needle)
      )
  }

  const core = createAutocompleteCore(context, {
    query: () => store.get().query,
    items: () => store.get().items,
    emptyItems: () => options().emptyItems,
    // Suggestions are strings, so a filter for them reads every item the engine passes.
    filter: () => (options().filter ?? "contains") as SearchFilter<unknown>,
    autoHighlight: () =>
      options().autoHighlight || completes() ? "typing" : false,
    preferred: (listbox) =>
      completes() ? completionFor(store.get().query, listbox)?.key : undefined,
    highlight(key: string | null, why: HighlightCause | null) {
      core.listbox.highlight(key, { event: why?.event })
      // Arrow keys fill in what they highlight, with inline completion.
      if (key !== null && completes() && why?.reason === "list-navigation") {
        fillIn(key, why.event)
      }
    },
    open(event, edge) {
      if (!event.altKey) {
        pendingHighlight = edge
      }
      show({ event, by: "keyboard" })
    },
    onHighlight: (key, index, event) =>
      options().onHighlight?.(key, { index, event }),
    container: () => element("list") ?? contentElement(),
    scrollRoot: contentElement,
  })
  // Data that drops the highlighted suggestion settles the highlight in the
  // same pass, so it never points at a suggestion that left.
  deriveFromOptions(context, ["highlighted"], (synced, state) => {
    if (synced.items === state.items) {
      return
    }
    return {
      highlighted: store.view({ ...state, ...synced }, () =>
        core.settledHighlight(false)
      ),
    }
  })

  const ownsElement = (target: Node) =>
    controlSlots.some((slot) =>
      elements(context, slot).some(({ el }) => el.contains(target))
    )

  const kit = createPopup(context, {
    preset: comboboxPreset,
    rules: () => ({
      trigger: inputElement,
      // Focus stays in the field, whatever closes the list.
      returnFocus: false,
      dismiss: (reason, { event }) => hide({ reason, event }),
      contains: ownsElement,
      onOpenChange(open) {
        if (open) {
          return
        }
        pendingHighlight = null
        store.set({ highlighted: null, focusInList: false })
      },
      onShow() {
        const el = element("content")
        if (el) {
          return trackModality(el, modalityOf(openedBy), () => [inputElement()])
        }
      },
      open({ event, by }, open) {
        if (!editable()) {
          return
        }
        // A touch open never focuses the popup, so the on-screen keyboard stays,
        // unless it opens a sheet, which takes focus so the keyboard stays closed.
        openedBy =
          by === "touch" && presentation.resolve() !== "sheet"
            ? "pointer"
            : (by ?? "imperative")
        // A touch screen reader's tap on a trigger moves real focus into the list,
        // since it ignores aria-activedescendant. A tap on the field is for typing.
        store.set({
          focusInList: opensIntoList(event) && event?.target !== inputElement(),
        })
        open(openedBy)
      },
      // Focus is in the field already, unless it left or a screen reader moved it into the list.
      close(_, close) {
        const inList =
          store.get().focusInList &&
          !!contentElement()?.contains(document.activeElement)
        close()
        const input = inputElement()
        if (inList && input && !store.get().open) {
          restoreFocus(input)
        }
      },
    }),
  })
  const { control, popup } = kit.internal
  const presentation = kit.internal.presentation
  const { show, hide } = control

  // A change to the text. `query` is what filters, which is the text unless
  // a suggestion fills the field in. Returns whether it went through.
  function setValue(
    value: string,
    reason: AutocompleteValueChangeReason,
    {
      event,
      query = value,
      item,
    }: {
      event?: Event
      query?: string
      item?: { value: string; label: string }
    } = {}
  ) {
    const state = store.get()
    if ((isDisabled(state) || state.readOnly) && reason !== "reset") {
      return false
    }
    requested = value
    core.cause(reason, event)
    if (
      value === state.value ||
      change("value", value, { reason, event, ...(item && { item }) })
    ) {
      // A value that `onValueChange` set in its place stored its own query.
      if (requested === value) {
        store.set({ query })
      }
      return true
    }
    // Canceled: the field shows the value it had.
    const input = inputElement()
    if (input && input.value !== state.value) {
      input.value = state.value
    }
    return false
  }

  // The user typed. The text filters, the suggestions open, and with
  // `inlineComplete` an insertion at the end completes the first match,
  // keeping the case the user typed, with the rest selected.
  function typed(input: HTMLInputElement, event?: Event) {
    if (!editable()) {
      return
    }
    const text = input.value
    const insertion = event as InputEvent | undefined
    const completing =
      completes() &&
      !insertion?.isComposing &&
      !!insertion?.inputType?.startsWith("insert") &&
      insertion.inputType !== "insertReplacementText" &&
      input.selectionEnd === text.length
    const match = completing ? completionFor(text, core.listbox) : undefined
    const completed = match ? text + match.label.slice(text.length) : text
    if (!setValue(completed, "input-change", { event, query: text })) {
      return
    }
    if (match && completed !== text) {
      input.value = completed
      input.setSelectionRange(text.length, completed.length)
    }
    // Text typed before the script ran opens the list only while it has focus.
    if (!store.get().open && (event || input.matches(":focus"))) {
      if (text) {
        pendingHighlight = "first"
      }
      show({ event, by: "keyboard", reason: "input-change" })
    }
  }

  // Fills the field with a suggestion, as arrow keys do with `inlineComplete`.
  // The typed part stays what filters, and the rest is selected.
  function fillIn(key: string, event?: Event) {
    const label = core.listbox.find(key)?.label
    const input = inputElement()
    const { query } = store.get()
    if (
      label === undefined ||
      !setValue(label, "list-navigation", { event, query })
    ) {
      return
    }
    if (!input) {
      return
    }
    input.value = label
    const start = normalize(label).startsWith(normalize(query))
      ? query.length
      : label.length
    input.setSelectionRange(start, label.length)
  }

  function submit(event?: Event) {
    options().onSubmit?.(store.get().value, { event })
    return !event?.defaultPrevented
  }

  // Choosing fills the field with the suggestion's label and closes the list.
  function choose(key: string, event?: Event) {
    const entry = core.listbox.find(key)
    if (!entry || core.listbox.disabled(entry) || !editable()) {
      return false
    }
    setValue(entry.label, "item-press", {
      event,
      item: { value: entry.key, label: entry.label },
    })
    const input = inputElement()
    if (input && input.value !== store.get().value) {
      input.value = store.get().value
    }
    hide({ reason: "item-press", event })
    return true
  }

  // A press on a suggestion. With `submitOnSelect`, the form submits, as Enter would.
  function press(key: string, event?: Event) {
    if (!choose(key, event) || !options().submitOnSelect) {
      return
    }
    if (submit(event)) {
      submitImplicitly(inputElement()?.form)
    }
  }

  function onEnter(event: KeyboardEvent) {
    const { open, highlighted } = store.get()
    if (open && highlighted !== null) {
      const el = core.listbox.element(highlighted)
      // Links follow themselves, so routers and modifier keys work.
      if (el?.matches("a[href]")) {
        event.preventDefault()
        return el.click()
      }
      if (!choose(highlighted, event)) {
        return event.preventDefault()
      }
      // A chosen suggestion submits only with `submitOnSelect`. Otherwise Enter only fills it in.
      if (!options().submitOnSelect || !submit(event)) {
        event.preventDefault()
      }
      return
    }
    if (open) {
      hide({ reason: "input-commit", event })
    }
    // The browser submits the form next, unless `onSubmit` stops it.
    if (!submit(event)) {
      event.preventDefault()
    }
  }

  function onInputKeyDown(event: KeyboardEvent) {
    if (core.navigate(event)) {
      return
    }
    const { open, value, query } = store.get()
    switch (event.key) {
      case "ArrowUp":
        // Alt+ArrowUp closes, as the APG asks.
        if (event.altKey && open) {
          event.preventDefault()
          hide({ reason: "escape-key", event })
        }
        return
      case "ArrowDown":
        // Alt+ArrowDown opens without moving the highlight.
        if (event.altKey && !open) {
          event.preventDefault()
          show({ event, by: "keyboard" })
        }
        return
      case "Enter":
        return onEnter(event)
      case "ArrowRight":
      case "End":
        // Moving the caret to the end accepts an inline completion, so Escape keeps it.
        if (completes() && value !== query && !event.shiftKey) {
          core.cause("input-change", event)
          store.set({ query: value })
        }
        return
      case "Escape":
        // An inline completion or a filled-in suggestion comes back out
        // before the list's layer closes it.
        if (
          open &&
          value !== query &&
          setValue(query, "escape-key", { event })
        ) {
          const input = inputElement()
          if (input) {
            input.value = query
          }
        }
        return
      case "Tab":
        if (open) {
          hide({ reason: "focus-out", event })
        }
    }
  }

  // A form reset puts the default text back.
  function bindReset(el: HTMLInputElement) {
    return on(
      el.ownerDocument,
      "reset",
      (event) => {
        if (
          event.target !== el.form ||
          keepsValueOnReset(options().value, options().defaultValue)
        ) {
          return
        }
        afterReset(event, () => {
          const { initial } = store.get()
          setValue(initial, "reset")
          if (el.value !== store.get().value) {
            el.value = store.get().value
          }
        })
      },
      { capture: true }
    )
  }

  const api = {
    id,
    isOpen: kit.isOpen,
    setOpen: kit.setOpen,
    open: kit.open,
    close: kit.close,
    toggle: kit.toggle,
    getValue: () => store.get().value,
    setValue: (
      value: string,
      {
        reason = "imperative",
        event,
      }: AutocompleteChangeOptions<AutocompleteValueChangeReason> = {}
    ) => value !== store.get().value && setValue(value, reason, { event }),
    clear: ({
      reason = "imperative",
      event,
    }: AutocompleteChangeOptions<AutocompleteValueChangeReason> = {}) =>
      store.get().value !== "" && setValue("", reason, { event }),
    getHighlighted: () =>
      highlightedValue(core.listbox, store.get().highlighted) as string | null,
    highlight: (value: string | null) =>
      store.get().open &&
      highlightFromCode(
        core.listbox,
        value === null ? null : String(value),
        store.get().highlighted
      ),
    focus: () => inputElement()?.focus(),
    // Internal. Used by slots and adapters.
    internal: {
      ...core,
      options,
      popup,
      presentation,
      show,
      hide,
      press,
      typed,
      onInputKeyDown,
      ownsElement,
      bindReset,
      inputElement,
      anchorElement: inputElement,
      contentElement,
      arrowElement: () => element("arrow"),
      text: (state: AutocompleteState) => state.value,
      itemProps: (key: string) =>
        context.props<AutocompleteItemMeta>("item", key),
      setFormDisabled: (formDisabled: boolean) => store.set({ formDisabled }),
      // Where focus goes once the list opens: it stays in the field, unless a
      // screen reader's tap moved it into the list, to the first suggestion.
      initialFocus() {
        const target = pendingHighlight
        pendingHighlight = null
        if (store.get().focusInList) {
          const first = core.listbox.firstEnabled()
          if (first === undefined) {
            return contentElement()
          }
          core.listbox.highlight(first, { focus: false })
          return core.listbox.element(first) ?? contentElement()
        }
        // Typing that opened the list highlights its best match, arrow keys the first or last.
        if (target === "first" && store.get().query) {
          core.settle(true, null)
        } else if (target) {
          core.listbox.highlight(core.listbox.stepKey(target) ?? null)
        }
        // In a sheet the field moved into its header, and loses focus on the
        // way if the sheet showed later. It takes focus back here.
        return store.get().presentation === "sheet" ? inputElement() : undefined
      },
      // Keys in the list, when a screen reader's tap moved real focus there.
      onListKeyDown(event: KeyboardEvent) {
        if (!store.get().focusInList || event.target === inputElement()) {
          return
        }
        listKeyDown(event, {
          listbox: core.listbox,
          highlighted: store.get().highlighted,
          choose: press,
          focusInput() {
            store.set({ focusInList: false })
            inputElement()?.focus({ preventScroll: true })
          },
        })
      },
      contentProps: (key?: string) =>
        kit.internal.contentProps(key) as AutocompleteContentProps,
    },
  }

  // A value from outside, like a controlled prop or a controller, also becomes what filters.
  deriveFromOptions(context, ["query"], (synced, state) =>
    "value" in synced &&
    synced.value !== state.value &&
    synced.value !== requested
      ? { query: synced.value }
      : undefined
  )
  let previousValue = store.get().value
  store.subscribe(() => {
    const { value } = store.get()
    if (value === previousValue) {
      return
    }
    previousValue = value
    if (value === requested) {
      return
    }
    requested = value
    store.set({ query: value })
  })

  return api
}

const autocompleteApi: (
  ...args: Parameters<typeof autocompleteApiBody>
) => AutocompleteApi = autocompleteApiBody

// What a suggestion registers with: its props, and the group it's in.
type AutocompleteItemMeta = AutocompleteItemProps & { group?: string }

/**
 * `autocomplete`'s api, which its slots and controller call.
 * Adapters expose it as `api`.
 * @stable
 */
interface AutocompleteApi extends ReturnType<typeof autocompleteApiBody> {}

export {
  type AutocompleteApi,
  type AutocompleteItemMeta,
  autocompleteApi,
  type AutocompleteState,
  initialAutocompleteState,
  syncAutocompleteState,
}
