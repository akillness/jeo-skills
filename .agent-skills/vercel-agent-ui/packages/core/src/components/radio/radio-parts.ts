import {
  bindHiddenInput,
  bindInternals,
  hiddenInputStyle,
  isDisabled,
  nameFromLabels,
  valueMissingMessage,
} from "../../foundation/forms/form"
import type { SlotFactory } from "../../foundation/kernel/primitive-types"
import type { Store } from "../../foundation/kernel/store"
import { selects } from "../../foundation/kernel/selects"
import type { RadioProps, RadioState } from "./radio"
import {
  isNativeButton,
  itemData,
  itemState,
  type radioGroupApi,
  type RadioGroupStore,
} from "./radio-api"

type ItemProps = RadioProps

type RadioSlotsApi = Pick<
  ReturnType<typeof radioGroupApi>,
  "focus" | "internal"
>

// The group's form value, and a label pointing at it, for Radio, Segmented
// Control and Rating.
function bindRadioGroup(
  el: HTMLElement,
  api: RadioSlotsApi,
  store: Store<RadioGroupStore>
) {
  const unbind = bindInternals(el, {
    value: () => store.get().value,
    state: () => store.get().value ?? "",
    restore: api.internal.restore,
    valueMissing: () => store.get().required && store.get().value === null,
    message: () => valueMissingMessage("radio"),
    anchor: api.internal.anchor,
    focus: api.focus,
    reset: api.internal.reset,
    disabled: api.internal.setFormDisabled,
    subscribe: store.subscribe,
  })
  // A label pointing at the group moves focus into it.
  const onClick = (event: MouseEvent) => {
    if (event.target === el) {
      api.focus()
    }
  }
  // Like a disabled native radio, one the group disables doesn't take focus
  // from a label press. Browsers send no mouse events into a disabled form
  // element, like a web component group, so this listens for focus.
  let pressedLabel: HTMLLabelElement | null = null
  const onPointerDown = (event: PointerEvent) => {
    pressedLabel = isDisabled(store.get())
      ? ((event.target as Element | null)?.closest?.("label") ?? null)
      : null
  }
  const onFocusIn = (event: FocusEvent) => {
    const label = pressedLabel
    pressedLabel = null
    const target = event.target as HTMLElement
    if (label?.control === target && target !== el) {
      target.blur()
    }
  }
  const doc = el.ownerDocument
  el.addEventListener("click", onClick)
  el.addEventListener("focusin", onFocusIn)
  doc.addEventListener("pointerdown", onPointerDown, true)
  return () => {
    unbind()
    el.removeEventListener("click", onClick)
    el.removeEventListener("focusin", onFocusIn)
    doc.removeEventListener("pointerdown", onPointerDown, true)
  }
}

const radioGroupAttrs = (state: RadioGroupStore) => ({
  "aria-orientation": state.orientation,
  "data-orientation": state.orientation,
  "aria-required": state.required ? "true" : undefined,
  "aria-readonly": state.readOnly ? "true" : undefined,
  "aria-disabled": isDisabled(state) ? "true" : undefined,
  "data-disabled": isDisabled(state) ? "" : undefined,
  "data-readonly": state.readOnly ? "" : undefined,
  "data-required": state.required ? "" : undefined,
})

function radioSlots<Api extends RadioSlotsApi, Public extends object>(
  slot: SlotFactory<RadioGroupStore, Api>,
  groupState: (state: RadioGroupStore) => Public,
  // What a component adds to each radio, like Rating's names and hit areas.
  radioAttrs: (
    state: RadioGroupStore,
    key: string,
    api: Api
  ) => Record<string, string | undefined> = () => ({})
) {
  return {
    group: slot<{}, Public>({
      role: "radiogroup",
      keys: { none: "Focus stays on a radio, whose keydown handles them." },
      state: groupState,
      attrs: radioGroupAttrs,
      bind: (el, { api, store }) => bindRadioGroup(el, api, store),
    }),

    item: slot<ItemProps, RadioState>({
      role: "radio",
      focus: "roving",
      keys: ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", " "],
      props: { value: "string", disabled: "boolean" },
      // Until there's a stop, the checked item holds it, or with nothing
      // checked, the first enabled one claims it: those hear a change to null.
      // Radios never read which indicators are exiting.
      selects: selects({
        value: ({ key }) => [key, null],
        stop: ({ key }) => [key, null],
        exiting: [],
      }),
      state: (state, { key, props }) => itemState(state, key, props),
      attrs: (state, { key, props, api }) => {
        const { checked, disabled } = itemState(state, key, props)
        return {
          type: "button",
          "aria-checked": String(checked),
          // Disabled items are skipped, like native radios.
          disabled: props.disabled ? "" : undefined,
          "aria-disabled": disabled ? "true" : undefined,
          tabindex: disabled
            ? props.disabled
              ? undefined
              : "-1"
            : api.internal.roving.tabIndex(state, { key, props }),
          ...itemData(state, key, props),
          ...radioAttrs(state, key, api),
        }
      },
      press({ api, key, props }, event) {
        // A click inside the radio would make a <label> around it click it again
        // in Firefox and Safari.
        event?.preventDefault()
        if (props.disabled) {
          return
        }
        api.internal.check(key, { reason: "item-press", event })
      },
      on: {
        // A group's disabled leaves the item focusable to scripts, so a press
        // mustn't focus it either, like a disabled native radio.
        mousedown: (event, { store, key, props }) => {
          if (itemState(store.get(), key, props).disabled) {
            event.preventDefault()
          }
        },
        keydown: (event, { api, el }) => api.internal.onKeyDown(event, el!),
        keyup: (event, { api, el, key, props }) => {
          if (event.key === " " && !isNativeButton(el) && !props.disabled) {
            api.internal.check(key, { reason: "item-press", event })
          }
        },
      },
      bind(el, part) {
        const unregister = part.api.internal.roving.bind(el, part)
        const unname = nameFromLabels(el)
        return () => {
          unname()
          unregister()
        }
      },
    }),

    // React and Vue: a native radio per item, so the form submits, resets and validates them.
    input: slot<ItemProps>({
      props: { value: "string", disabled: "boolean" },
      attrs: (state, { id, key, props }) => ({
        type: "radio",
        // Required radios need a group to validate as one.
        name: state.name ?? (state.required ? id : undefined),
        value: key,
        form: state.form,
        checked: state.initial === key ? "" : undefined,
        required: state.required ? "" : undefined,
        disabled: state.disabled || props.disabled ? "" : undefined,
        "aria-hidden": "true",
        tabindex: "-1",
        style: hiddenInputStyle,
      }),
      bind: (el, { api, store, key }) =>
        bindHiddenInput(el as HTMLInputElement, {
          checked: () => store.get().value === key,
          subscribe: store.subscribe,
          // The browser focuses an invalid radio on submit. Focus goes to the group's tab stop.
          focus: api.focus,
          control: () => api.internal.radio(key),
          activate: (event) => {
            if (!api.internal.itemProps(key).disabled) {
              api.internal.check(key, { reason: "item-press", event })
            }
          },
          reset: api.internal.reset,
          disabled: api.internal.setFormDisabled,
        }),
    }),
  }
}

export { bindRadioGroup, radioGroupAttrs, radioSlots, type RadioSlotsApi }
