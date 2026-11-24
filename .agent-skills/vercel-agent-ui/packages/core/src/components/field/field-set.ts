import { watchFieldsets } from "../../foundation/forms/form"
import { definePrimitive } from "../../foundation/kernel/primitive"
import { descriptionId } from "./field-attrs"
import type {
  Named,
  PrimitiveOptions,
} from "../../foundation/kernel/primitive-types"

// A field set groups related fields under a legend. It renders a native
// <fieldset>, so `disabled` disables every control inside it the way the
// browser does: native inputs, the hidden inputs of our controls, and
// form-associated elements. Fields inside it mark their parts disabled too.

/**
 * The options `fieldSet` takes. A component takes them as props on its root.
 * @stable
 */
type FieldSetOptions = {
  /**
   * Disables every control inside it, except those in its legend, and leaves
   * them out of the form.
   */
  disabled?: boolean
} & PrimitiveOptions

/**
 * What `render` functions and state-based class names receive.
 * @stable
 */
type FieldSetState = {
  /** Whether the field set is disabled, by itself or by a field set around it. */
  disabled: boolean
}

type State = {
  disabled: boolean
  // A disabled field set around this one.
  inherited: boolean
  // Parts in the page, by id. The field set points at these.
  legends: string[]
  descriptions: string[]
}

// A part takes its element's id as it changes, like one its author sets later,
// so the parts pointing at it point at the id in the page.
function registerById(el: HTMLElement, register: (id: string) => () => void) {
  let id = el.id
  let unregister = register(id)
  if (typeof MutationObserver === "undefined") {
    return () => unregister()
  }
  const observer = new MutationObserver(() => {
    if (el.id === id) {
      return
    }
    id = el.id
    unregister()
    unregister = register(id)
  })
  observer.observe(el, { attributeFilter: ["id"] })
  return () => {
    observer.disconnect()
    unregister()
  }
}

const fieldSetState = (state: State) => ({
  disabled: state.disabled || state.inherited,
})

const disabledAttrs = (state: State) => ({
  "data-disabled": state.disabled || state.inherited ? "" : undefined,
})

const fieldSetPrimitive = /* @__PURE__ */ definePrimitive({
  name: "field",
  options: { disabled: "boolean" },
  state: (options: FieldSetOptions): State => ({
    disabled: !!options.disabled,
    inherited: false,
    legends: [],
    descriptions: [],
  }),
  sync: (options) => ({ disabled: !!options.disabled }),
  api: ({ id, store, parts }) => ({
    descriptionId: (key: string) => descriptionId(parts(), id, key),
    // Parts register a microtask after they bind, since Vue binds them while hydrating.
    register(list: "legends" | "descriptions", partId: string) {
      let active = true
      queueMicrotask(() => {
        if (active) {
          store.set({
            [list]: [
              ...store.get()[list].filter((item) => item !== partId),
              partId,
            ],
          })
        }
      })
      return () => {
        active = false
        queueMicrotask(() =>
          store.set({
            [list]: store.get()[list].filter((item) => item !== partId),
          })
        )
      }
    },
  }),
  slots: (slot) => ({
    set: slot<{}, FieldSetState>({
      state: fieldSetState,
      attrs: (state) => ({
        disabled: state.disabled ? "" : undefined,
        // A <legend> that's the first child names it natively, before scripts
        // run. This also covers a legend rendered as another element.
        "aria-labelledby": state.legends.length
          ? state.legends.join(" ")
          : undefined,
        "aria-describedby": state.descriptions.length
          ? state.descriptions.join(" ")
          : undefined,
        ...disabledAttrs(state),
      }),
      bind: (el, { store }) =>
        watchFieldsets(el, (inherited) => store.set({ inherited })),
    }),
    legend: slot<{}, FieldSetState>({
      props: { id: "string" },
      state: fieldSetState,
      attrs: (state, { id, props }) => ({
        id: props.id ?? `${id}-legend`,
        ...disabledAttrs(state),
      }),
      bind: (el, { api }) =>
        registerById(el, (id) => api.register("legends", id)),
    }),
    // A FieldDescription right inside a FieldSet, outside any Field, describes the group.
    description: slot<{ value?: string }, FieldSetState>({
      props: { id: "string", value: { kind: "string", from: "field" } },
      state: fieldSetState,
      attrs: (state, { key, props, api }) => ({
        id: props.id ?? api.descriptionId(key),
        ...disabledAttrs(state),
      }),
      bind: (el, { api }) =>
        registerById(el, (id) => api.register("descriptions", id)),
    }),
  }),
  agent: { shown: () => false },
})

/**
 * The type of `fieldSet`.
 * @stable
 */
interface FieldSetPrimitive extends Named<typeof fieldSetPrimitive> {}

/**
 * The field set primitive, with the slots `set`, `legend`, `description`.
 * Its parts are Field parts, so its slots read `field-set`, `field-legend`,
 * and `field-description` for a description of the whole group.
 * @stable
 */
const fieldSet: FieldSetPrimitive = fieldSetPrimitive

const fieldGroupPrimitive = /* @__PURE__ */ definePrimitive({
  name: "field",
  state: (_options: {}) => ({}),
  // Nothing to set up. The parameter keeps TypeScript inferring the slots.
  api: (_context) => ({}),
  slots: (slot) => ({
    group: slot({ attrs: () => ({}) }),
  }),
  agent: { shown: () => false },
})

/**
 * The type of `fieldGroup`.
 * @stable
 */
interface FieldGroupPrimitive extends Named<typeof fieldGroupPrimitive> {}

/**
 * The field group primitive, with the slots `group`.
 * A FieldGroup only lays fields out, so it has no role and no state. A
 * FieldSet is what names a group of controls and disables it.
 * @stable
 */
const fieldGroup: FieldGroupPrimitive = fieldGroupPrimitive

export {
  fieldGroup,
  type FieldGroupPrimitive,
  fieldSet,
  type FieldSetOptions,
  type FieldSetPrimitive,
  type FieldSetState,
  registerById,
}
