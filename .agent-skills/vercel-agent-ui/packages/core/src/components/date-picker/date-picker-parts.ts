// Date Picker's parts and the attributes they carry: the inputs, the trigger,
// the popup, the hint, clear and presets, and Calendar's parts inside it.
import {
  calendarSlots,
  isDisabled,
  isPickable,
  localeOf,
} from "../calendar/calendar-api"
import { normalizeValue } from "../calendar/calendar-model"
import { formatDate } from "../../foundation/date/format"
import { datePattern } from "../../foundation/date/parse"
import { type ISODate } from "../../foundation/date/plain-date"
import {
  bindInternals,
  bindValueInput,
  setComponentValidity,
  takeTypedText,
} from "../../foundation/forms/form"
import { pageLocale } from "../../foundation/text/locale"
import {
  openerOf,
  popupContentAttrs,
  popupTriggerAttrs,
} from "../../foundation/popups/popup"
import {
  ownsEvent,
  registerPopupElement,
} from "../../foundation/popups/popup-elements"
import {
  contentAnchor,
  placementOptions,
} from "../../foundation/popups/popup-features"
import { openAttrs } from "../../foundation/kernel/attrs"
import { flagWhileBound } from "../../foundation/kernel/bound-keys"
import { onProps } from "../../foundation/kernel/part"
import type { SlotFactory } from "../../foundation/kernel/primitive-types"
import type {
  DatePickerClearState,
  DatePickerContentProps,
  DatePickerContentState,
  DatePickerHintState,
  DatePickerInputProps,
  DatePickerInputState,
  DatePickerMode,
  DatePickerPresetProps,
  DatePickerPresetState,
  DatePickerState,
  DatePickerTriggerState,
  DatePickerValue,
} from "./date-picker"
import {
  dateAt,
  invalidAt,
  nameAt,
  textOf,
  valueKey,
  type DatePickerApi,
  type State,
} from "./date-picker-api"

const indexOf = (props: DatePickerInputProps) => (props.end ? 1 : 0)

// The message the browser and a Field show for an input whose text isn't a
// date that can be picked. English, like the trigger's label.
const invalidDateMessage = "Enter a valid date."

function triggerLabel(state: State) {
  const label = state.mode === "range" ? "Choose dates" : "Choose date"
  const locale = localeOf(state)
  if (state.value === null) {
    return label
  }
  if (state.mode === "range") {
    const [start, end] = state.value as [ISODate, ISODate]
    return `${label}, ${formatDate(start, locale)} to ${formatDate(end, locale)}`
  }
  return `${label}, ${formatDate(state.value as ISODate, locale)}`
}

const presetDisabled = (state: State, value: DatePickerValue) =>
  !isPickable(state, value)

const datePickerSlots = (slot: SlotFactory<State, DatePickerApi>) => ({
  root: slot<{}, DatePickerState>({
    state: (state) => ({
      value: state.value as DatePickerValue,
      mode: state.mode as DatePickerMode,
      open: state.open,
      disabled: isDisabled(state),
      readOnly: state.readOnly,
      invalid: invalidAt(state, 0) || invalidAt(state, 1),
    }),
    attrs: (state) => ({
      "data-mode": state.mode,
      ...openAttrs(state.open),
      "data-disabled": isDisabled(state) ? "" : undefined,
      "data-readonly": state.readOnly ? "" : undefined,
      "data-invalid":
        invalidAt(state, 0) || invalidAt(state, 1) ? "" : undefined,
    }),
    // A field can disable it without the `disabled` attribute the browser
    // leaves a control out of the form by, so disabled it submits and
    // validates nothing.
    bind(el, { api, store }) {
      const cleanups = [
        api.internal.bindRoot(el),
        bindInternals(el, {
          value: () =>
            isDisabled(store.get()) ? null : api.internal.submitted(),
          state: () => valueKey(store.get().value),
          restore: api.internal.restore,
          valueMissing: () => false,
          message: () => "",
          // Text that isn't a date is a bad input, like a native date input's.
          invalid: () => {
            const state = store.get()
            if (
              isDisabled(state) ||
              (!invalidAt(state, 0) && !invalidAt(state, 1))
            ) {
              return undefined
            }
            return {
              flags: { badInput: true },
              message: invalidDateMessage,
              anchor: api.internal.invalidInput(),
            }
          },
          focus: api.internal.focusInput,
          reset: api.internal.reset,
          disabled: api.internal.setFormDisabled,
          subscribe: store.subscribe,
        }),
      ]
      return () => cleanups.forEach((cleanup) => cleanup?.())
    },
  }),

  // A text input that reads a date typed in the locale's order, with any
  // separator, month names or digits alone, on Enter or blur.
  input: slot<DatePickerInputProps, DatePickerInputState>({
    props: { end: "boolean" },
    state: (state, { props }) => ({
      invalid: invalidAt(state, indexOf(props)),
      disabled: isDisabled(state),
      readOnly: state.readOnly,
    }),
    attrs: (state, { id, props }) => {
      const index = indexOf(props)
      const invalid = invalidAt(state, index)
      return {
        type: "text",
        value: textOf(state, index),
        autocomplete: "off",
        autocorrect: "off",
        spellcheck: "false",
        required: state.required ? "" : undefined,
        disabled: isDisabled(state) ? "" : undefined,
        readonly: state.readOnly ? "" : undefined,
        "aria-invalid": invalid ? "true" : undefined,
        "aria-describedby": state.hinted ? `${id}-hint` : undefined,
        "data-invalid": invalid ? "" : undefined,
        "data-disabled": isDisabled(state) ? "" : undefined,
      }
    },
    on: {
      input: (event, { api, el, props }) =>
        el &&
        api.internal.setText(indexOf(props), (el as HTMLInputElement).value),
      keydown: (event, { api, props }) =>
        api.internal.inputKeydown(event, indexOf(props)),
      focusout: (event, { api, props }) =>
        api.internal.commit(indexOf(props), event),
    },
    bind(el, { api, store, props }) {
      const input = el as HTMLInputElement
      // The text is written here, so the framework never fights the caret.
      const write = () => {
        const state = store.get()
        const text = textOf(state, indexOf(props))
        if (input.value !== text) {
          input.value = text
        }
        // Text that isn't a date blocks its form, until it's a date or empty.
        // A root that validates reports it instead.
        if (api.internal.rootValidates()) {
          return
        }
        setComponentValidity(
          input,
          invalidAt(state, indexOf(props)) ? invalidDateMessage : ""
        )
      }
      takeTypedText(
        input,
        () => {
          const state = store.get()
          return [
            textOf(state, indexOf(props)),
            textOf({ ...state, pageLocale: null }, indexOf(props)),
          ]
        },
        () => {
          // The root reads the page's language after its parts bind, and the text parses in it.
          if (store.get().pageLocale === null) {
            store.set({ pageLocale: pageLocale(input) ?? null })
          }
          api.internal.setText(indexOf(props), input.value)
          if (!input.matches(":focus")) {
            api.internal.commit(indexOf(props))
          }
        }
      )
      write()
      const unsubscribe = store.subscribe(write)
      return () => {
        unsubscribe()
        // React's hidden <Activity> keeps the input and its text in the page,
        // so the text still blocks its form.
        if (!input.isConnected) {
          setComponentValidity(input, "")
        }
      }
    },
  }),

  // React and Vue: the hidden input a date, or a range's end, submits with.
  "hidden-input": slot<DatePickerInputProps>({
    props: { end: "boolean" },
    attrs: (state, { props }) => ({
      type: "hidden",
      name: nameAt(state, indexOf(props)),
      value: dateAt(state, indexOf(props)) ?? "",
      form: state.form,
      disabled: isDisabled(state) ? "" : undefined,
    }),
    bind: (el, { api, store, props }) =>
      bindValueInput(el as HTMLInputElement, {
        value: () => {
          const state = store.get()
          return state.mode === "range"
            ? ((state.value as [ISODate, ISODate] | null)?.[indexOf(props)] ??
                "")
            : ((state.value as ISODate | null) ?? "")
        },
        subscribe: store.subscribe,
        focus: api.internal.focusInput,
        reset: api.internal.reset,
        disabled: api.internal.setFormDisabled,
      }),
  }),

  trigger: slot<{}, DatePickerTriggerState>({
    state: (state) => ({ open: state.open, disabled: isDisabled(state) }),
    attrs: (state, { id }) => ({
      ...popupTriggerAttrs(state, id, "dialog"),
      type: "button",
      // English by default, like Calendar's Previous and Next. Pass `aria-label` in another language.
      "aria-label": triggerLabel(state),
      disabled: isDisabled(state) ? "" : undefined,
      "data-disabled": isDisabled(state) ? "" : undefined,
    }),
    on: {
      keydown: (event, { api }) => api.internal.popup.triggerKeydown(event),
    },
    press({ api, store }, event) {
      if (isDisabled(store.get())) {
        return
      }
      if (api.isOpen()) {
        return api.internal.hide({ reason: "trigger-press", event })
      }
      api.internal.show({ event, by: openerOf(event), reason: "trigger-press" })
    },
  }),

  content: slot<DatePickerContentProps, DatePickerContentState>({
    role: "dialog",
    props: {
      side: "string",
      align: "string",
      sideOffset: "number",
      alignOffset: "number",
      collisionPadding: "number",
      arrowPadding: "number",
      container: "value",
      anchor: "string",
      finalFocus: "string",
      keepMounted: "boolean",
    },
    connect: registerPopupElement,
    state: (state) => ({ open: state.open, presentation: state.presentation }),
    present: (state, { props }) => state.mounted || !!props.keepMounted,
    attrs: (state, { id }) => ({
      ...popupContentAttrs(state, id),
      // English by default. Pass `aria-label` in another language.
      "aria-label": state.mode === "range" ? "Choose dates" : "Choose date",
      "data-presentation": state.presentation,
    }),
    on: {
      keydown(event, { api, el }) {
        // Keys from a popup inside this one bubble through it. Only the owner handles them.
        if (ownsEvent(el!, event)) {
          api.internal.popup.keydown(event)
        }
      },
    },
    bind(el, part) {
      const { internal } = part.api
      return internal.presentation.bind(el, {
        anchor: () =>
          contentAnchor(
            el,
            internal.contentProps().anchor,
            internal.anchorElement
          ),
        position: () =>
          placementOptions(internal.contentProps(), { align: "start" }),
        rendered: (listener) => onProps(part, listener),
        initialFocus: internal.initialFocus,
      })
    },
  }),

  // The full-screen element a popup presented as a sheet sits in.
  viewport: slot({ present: (state) => state.presentation === "sheet" }),

  // The format to type, like "MM/DD/YYYY". Inputs are described by it.
  hint: slot<{}, DatePickerHintState>({
    state: (state) => {
      const { placeholder, example } = datePattern(localeOf(state))
      return { placeholder, example }
    },
    attrs: (state, { id }) => ({ id: `${id}-hint` }),
    bind: (el, { store }) => flagWhileBound(store, "hinted"),
  }),

  clear: slot<{}, DatePickerClearState>({
    state: (state) => ({
      empty: state.value === null && state.anchor === null,
      disabled: isDisabled(state) || state.readOnly,
    }),
    attrs: (state) => ({
      type: "button",
      disabled: isDisabled(state) || state.readOnly ? "" : undefined,
      "data-empty":
        state.value === null && state.anchor === null ? "" : undefined,
    }),
    press({ api }, event) {
      api.internal.pickValue(null, "clear-press", event)
      api.internal.focusInput()
    },
  }),

  // Selects a value it holds, like "Last 7 days". Relative dates are the app's to work out.
  preset: slot<DatePickerPresetProps, DatePickerPresetState>({
    props: { value: "list" },
    state: (state, { props }) => ({
      selected:
        valueKey(state.value) ===
        valueKey(normalizeValue(state.mode, props.value)),
      disabled: presetDisabled(state, props.value),
    }),
    attrs: (state, { props }) => {
      const selected =
        valueKey(state.value) ===
        valueKey(normalizeValue(state.mode, props.value))
      return {
        type: "button",
        disabled: presetDisabled(state, props.value) ? "" : undefined,
        "aria-pressed": String(selected),
        "data-selected": selected ? "" : undefined,
      }
    },
    press({ api, props, store }, event) {
      if (presetDisabled(store.get(), props.value)) {
        return
      }
      api.internal.pickValue(props.value, "preset-press", event)
      if (store.get().closeOnSelect) {
        api.internal.hide({ reason: "preset-press", event })
      }
    },
  }),

  ...asCalendar(calendarSlots(slot)),
})

// Calendar's parts keep Calendar's `data-slot`, so one stylesheet styles a
// calendar on its own and in a date picker.
function asCalendar<
  T extends Record<string, { attrs?: (...args: any[]) => object }>,
>(slots: T) {
  for (const key in slots) {
    const attrs = slots[key].attrs
    slots[key] = {
      ...slots[key],
      attrs: (...args: any[]) => ({
        "data-slot": `calendar-${key}`,
        ...attrs?.(...args),
      }),
    }
  }
  return slots
}

export { datePickerSlots }
