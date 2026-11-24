import {
  type Direction,
  moveIndex,
  radioStep,
} from "../../foundation/focus/collection"
import { createRovingFocus } from "../../foundation/focus/roving-focus"
import {
  dispatchChange,
  formInternals,
  isDisabled,
  submitImplicitly,
} from "../../foundation/forms/form"
import { deriveFromOptions } from "../../foundation/kernel/derive"
import type { PrimitiveContext } from "../../foundation/kernel/primitive-types"
import { createChange } from "../../foundation/kernel/input-source"
import { elements } from "../../foundation/kernel/elements"
import type {
  RadioGroupChangeOptions,
  RadioGroupOptions,
  RadioProps,
} from "./radio"
import { keepsValueOnReset } from "../../foundation/forms/value"

type ItemProps = RadioProps

type Details = RadioGroupChangeOptions

type RadioGroupStore = {
  value: string | null
  // What a form reset returns to: the first value.
  initial: string | null
  disabled: boolean
  readOnly: boolean
  required: boolean
  name: string | undefined
  form: string | undefined
  formDisabled: boolean
  // The item Tab lands on: the checked one, or the first enabled one when that
  // can't take focus. Null until items bind.
  stop: string | null
  // Indicators animating out.
  exiting: string[]
  // Only a segmented control has these.
  orientation?: "horizontal" | "vertical"
  direction?: Direction
  // The radio a pointer previews, which only a rating shows.
  highlighted?: string | null
}

function radioGroupState(
  options: RadioGroupOptions,
  extra: Pick<RadioGroupStore, "orientation" | "direction" | "highlighted"> = {}
): RadioGroupStore {
  const value =
    options.value !== undefined ? options.value : (options.defaultValue ?? null)
  return {
    value,
    initial: value,
    disabled: !!options.disabled,
    readOnly: !!options.readOnly,
    required: !!options.required,
    name: options.name,
    form: options.form,
    formDisabled: false,
    stop: null,
    exiting: [],
    ...extra,
  }
}

function syncRadioGroup(options: RadioGroupOptions) {
  return {
    disabled: !!options.disabled,
    readOnly: !!options.readOnly,
    required: !!options.required,
    name: options.name,
    form: options.form,
    // Like a native radio's `defaultChecked`, changing it changes what a reset returns to.
    ...(options.defaultValue === undefined
      ? {}
      : { initial: options.defaultValue }),
    ...(options.value === undefined ? {} : { value: options.value }),
  }
}

const isNativeButton = (el: HTMLElement | undefined) =>
  el instanceof HTMLButtonElement

type RadioSlotNames = { group: string; item: string }

/**
 * `radioGroup`'s api, which its slots and controller call.
 * Adapters expose it as `api`.
 * @stable
 */
interface RadioGroupApi extends ReturnType<typeof radioGroupApiBody> {}

function radioGroupApiBody(
  context: PrimitiveContext<RadioGroupOptions, RadioGroupStore, string>,
  slots: RadioSlotNames = { group: "group", item: "root" }
) {
  const { id, store, options, element, props } = context
  const change = createChange(context)
  let changed = false

  const enabled = (item: { props: ItemProps | undefined }) =>
    !item.props?.disabled && !isDisabled(store.get())
  // Like native radios: both axes move, disabled items are skipped, and Tab
  // lands on the checked item, or with nothing checked, the first enabled one.
  // Disabling the group is a change of state, which moves the stop on its own.
  const roving = createRovingFocus<RadioGroupStore, ItemProps>(context, {
    slot: slots.item,
    key: "stop",
    remember: false,
    disabled: (item) => !enabled(item),
    focusable: enabled,
    preferred: (item) => store.get().value === item.key,
    claims: (state, item) => (state.value ?? item.key) === item.key,
    move(event, { from, items, rtl }) {
      if (event.shiftKey) {
        return
      }
      const step = radioStep(event.key, rtl)
      if (step === undefined) {
        return
      }
      return items[
        moveIndex(
          items.indexOf(from),
          step,
          items.length,
          options().loop ?? true
        )
      ].key
    },
  })
  // The indicators animating out once `value` replaces `from`.
  const exitingAfter = (
    from: string | null,
    value: string | null,
    exiting: string[]
  ) => [
    ...exiting.filter((key) => key !== value),
    ...(from !== null && hasIndicator(from) && !exiting.includes(from)
      ? [from]
      : []),
  ]

  // A controlled `value` moves the indicator and the tab stop in the same pass.
  deriveFromOptions(context, ["exiting", "stop"], (synced, state) => {
    if (!("value" in synced) || synced.value === state.value) {
      return
    }
    const value = (synced.value ?? null) as string | null
    const stop = roving.stopFor((item) => item.key === value)
    return {
      exiting: exitingAfter(state.value, value, state.exiting),
      ...(stop !== undefined && { stop }),
    }
  })

  let previous = store.get().value
  store.subscribe(() => {
    const { value, exiting } = store.get()
    if (value === previous) {
      return
    }
    const from = previous
    previous = value
    changed = true
    store.set({ exiting: exitingAfter(from, value, exiting) })
    roving.check()
  })

  // Indicators are keyed by their item's value, so this is a lookup, not a sort.
  const hasIndicator = (value: string) =>
    !!element("indicator", value)?.isConnected

  const formElement = () => {
    const root = element(slots.group)
    if (formInternals(root)) {
      return root
    }
    const { value } = store.get()
    return value === null ? undefined : element("input", value)
  }

  const api = {
    id,
    getValue: () => store.get().value,
    isChanged: () => changed,
    // Checks a radio, as a user would. Disabled radios and read-only groups ignore it.
    setValue(
      value: string | null,
      { reason = "imperative", event }: Details = {}
    ) {
      const details = { reason, event }
      const state = store.get()
      if (isDisabled(state) || state.readOnly) {
        return false
      }
      if (
        value !== null &&
        (props(slots.item, value) as ItemProps | undefined)?.disabled
      ) {
        return false
      }
      const done = change("value", value, details)
      if (done && reason !== "restore") {
        dispatchChange(formElement())
      }
      return done
    },
    // Moves focus to the item that holds the tab stop, the checked one if it is enabled.
    focus: () => roving.focus(),
    form: () =>
      formInternals(element(slots.group))?.form ??
      (elements(context, "input")[0]?.el as HTMLInputElement | undefined)
        ?.form ??
      null,
    internal: {
      // Checks the radio a press landed on. Rating unchecks a checked one.
      check: (key: string, details?: Details) => api.setValue(key, details),
      reset() {
        if (keepsValueOnReset(options().value, options().defaultValue)) {
          return
        }
        change("value", store.get().initial, { reason: "reset" })
      },
      // The browser restores a disabled or read-only group too, as a native one.
      restore(saved: string) {
        change("value", saved || null, { reason: "restore" })
      },
      setFormDisabled(formDisabled: boolean) {
        store.set({ formDisabled })
      },
      finishExit(key: string) {
        store.set({
          exiting: store.get().exiting.filter((value) => value !== key),
        })
      },
      roving,
      group: () => element(slots.group),
      radio: (key: string) => element(slots.item, key),
      // The props its item rendered with, for parts inside an item.
      itemProps: (key: string) =>
        (props(slots.item, key) ?? {}) as { disabled?: boolean },
      anchor: () => (roving.items()[0] ?? elements(context, slots.item)[0])?.el,
      onKeyDown(event: KeyboardEvent, el: HTMLElement) {
        if (event.altKey || event.ctrlKey || event.metaKey) {
          return
        }
        if (event.key === "Enter") {
          // Enter submits the form, like on a native radio.
          event.preventDefault()
          if (!event.repeat) {
            submitImplicitly(api.form())
          }
          return
        }
        if (event.key === " ") {
          if (!isNativeButton(el)) {
            event.preventDefault()
          }
          return
        }
        const moved = roving.keydown(event, el)
        // Like native radios, moving checks the item.
        if (moved && moved.key !== moved.from && !store.get().readOnly) {
          api.setValue(moved.key, { reason: "list-navigation", event })
        }
      },
    },
  }
  return api
}

const radioGroupApi: (
  ...args: Parameters<typeof radioGroupApiBody>
) => RadioGroupApi = radioGroupApiBody

function itemState(
  state: RadioGroupStore,
  key: string,
  props: { disabled?: boolean }
) {
  return {
    checked: state.value === key,
    disabled: !!props.disabled || isDisabled(state),
    readOnly: state.readOnly,
    required: state.required,
  }
}

function itemData(
  state: RadioGroupStore,
  key: string,
  props: { disabled?: boolean }
) {
  const { checked, disabled } = itemState(state, key, props)
  return {
    "data-checked": checked ? "" : undefined,
    "data-unchecked": checked ? undefined : "",
    "data-disabled": disabled ? "" : undefined,
    "data-readonly": state.readOnly ? "" : undefined,
    "data-required": state.required ? "" : undefined,
  }
}

export {
  isNativeButton,
  itemData,
  itemState,
  radioGroupApi,
  type RadioGroupApi,
  radioGroupState,
  type RadioGroupStore,
  syncRadioGroup,
}
