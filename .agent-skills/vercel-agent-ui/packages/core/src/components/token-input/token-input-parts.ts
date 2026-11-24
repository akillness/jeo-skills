// TokenInput's parts and the attributes they carry.
import { measured } from "#dev"
import {
  bindInternals,
  bindValueInput,
  hiddenInputStyle,
  valueMissingMessage,
} from "../../foundation/forms/form"
import { pressKeepsFocus } from "../../foundation/focus/press-keeps-focus"
import { isDisabled } from "../../foundation/lists/listbox-parts"
import type { SlotFactory } from "../../foundation/kernel/primitive-types"
import type {
  TokenInputEditorProps,
  TokenInputEditorState,
  TokenInputTokenProps,
  TokenInputTokenState,
} from "./token-input"
import { bindTokenEditing } from "./token-input-editing"
import { tokensOf, valueLength } from "./token-input-model"
import type { TokenInputApi, TokenInputState } from "./token-input-api"
import { createTokenView } from "./token-input-view"
import { live } from "../../foundation/kernel/live"
import { writeStyle } from "../../foundation/platform/style"

function editorState(state: TokenInputState) {
  return {
    empty: valueLength(state.value) === 0,
    disabled: isDisabled(state),
    readOnly: state.readOnly,
  }
}

function tokenState(state: TokenInputState, props: TokenInputTokenProps) {
  const token = tokensOf(state.value).find(
    (candidate) => candidate.id === props.token
  ) ?? {
    type: "",
    value: "",
    label: "",
  }
  return {
    token,
    selected: isSelected(state, props.token),
    pending: token.status === "pending",
    unresolved: token.status === "unresolved",
    disabled: isDisabled(state),
    readOnly: state.readOnly,
  }
}

const isSelected = (state: TokenInputState, id: string) =>
  !!id && ` ${state.selected} `.includes(` ${id} `)

// The editor keeps white space and new lines as typed. In the lowest cascade
// layer, so any class wins.
function editorStyles(doc: Document) {
  writeStyle(
    doc,
    "ui-sdk-token-input",
    '@layer ui-sdk { :where([data-slot="token-input-editor"]) { white-space: pre-wrap; overflow-wrap: anywhere } :where([data-slot="token-input-host"]) { user-select: all } }'
  )
}

const tokenInputSlots = (
  slot: SlotFactory<TokenInputState, TokenInputApi>
) => ({
  // Web components only: the element takes part in forms with the codec text.
  // A field can disable it without the `disabled` attribute the browser leaves
  // a control out of the form by, so disabled it submits and validates nothing.
  root: slot({
    bind: (el, { api, store }) =>
      bindInternals(el, {
        value: () =>
          store.get().name && !isDisabled(store.get())
            ? api.internal.text()
            : null,
        state: api.internal.text,
        restore: api.internal.restore,
        valueMissing: () =>
          store.get().required &&
          !isDisabled(store.get()) &&
          valueLength(store.get().value) === 0,
        message: () => valueMissingMessage("text"),
        anchor: () => api.editor.element,
        focus: () => api.focus(),
        reset: api.internal.reset,
        disabled: api.internal.setFormDisabled,
        subscribe: store.subscribe,
      }),
  }),

  // The editable text. The core owns what's inside it.
  editor: slot<TokenInputEditorProps, TokenInputEditorState>({
    role: "textbox",
    focus: "native",
    props: { placeholder: "string" },
    state: editorState,
    attrs: (state, { id, props }) => {
      const { empty, disabled, readOnly } = editorState(state)
      return {
        id: `${id}-editor`,
        "aria-multiline": "true",
        contenteditable: disabled ? "false" : "true",
        "aria-placeholder": props.placeholder,
        "aria-disabled": disabled ? "true" : undefined,
        "aria-readonly": readOnly ? "true" : undefined,
        "aria-required": state.required ? "true" : undefined,
        "data-empty": empty ? "" : undefined,
        "data-disabled": disabled ? "" : undefined,
        "data-readonly": readOnly ? "" : undefined,
      }
    },
    bind(el, { api, store }) {
      editorStyles(el.ownerDocument)
      const view = createTokenView(el, {
        describe: api.internal.describe,
        customContent: () => store.get().custom,
        // The hosts count what the editor holds now, which the page decides.
        onHosts: () =>
          measured(() => store.set({ hosts: store.get().hosts + 1 })),
      })
      const typed = view.typedBeforeBind(store.get().value)
      api.internal.setView(view)
      // After the framework finishes hydrating, which checks the form's text
      // against the value it rendered.
      let bound = true
      if (typed) {
        queueMicrotask(
          () =>
            bound &&
            api.internal.commit(typed, {
              reason: "input-change",
              selection: api.internal.caretAt(valueLength(typed)),
            })
        )
      }
      const unbind = bindTokenEditing(el, view, api)
      // Hosts say when their token is selected, for styling chips without a framework part.
      let selected = ""
      const writeSelected = () => {
        const state = store.get()
        if (state.selected === selected) {
          return
        }
        selected = state.selected
        for (const token of tokensOf(state.value)) {
          view
            .hostElement(token.id!)
            ?.toggleAttribute("data-selected", isSelected(state, token.id!))
        }
      }
      // A framework can turn custom content on after the hosts exist, or off.
      let custom = store.get().custom
      const writeLabels = () => {
        if (store.get().custom === custom) {
          return
        }
        custom = store.get().custom
        view.showLabels()
      }
      const unsubscribe = store.subscribe(() => {
        writeSelected()
        writeLabels()
      })
      return () => {
        bound = false
        unsubscribe()
        unbind()
        api.internal.setView(undefined)
        view.destroy()
      }
    },
  }),

  // A token's content, rendered by a framework inside its host.
  token: slot<TokenInputTokenProps, TokenInputTokenState>({
    // Internal: passed by renderers, from the host the core renders the token in.
    props: { token: "string" },
    state: (state, { props }) => tokenState(state, props),
    attrs: (state, { props }) => {
      const { token, pending, unresolved, disabled, readOnly } = tokenState(
        state,
        props
      )
      return {
        "data-token-type": token.type,
        "data-pending": pending ? "" : undefined,
        "data-unresolved": unresolved ? "" : undefined,
        "data-disabled": disabled ? "" : undefined,
        "data-readonly": readOnly ? "" : undefined,
      }
    },
    live: live((state, { props }) => ({
      "data-selected": isSelected(state, props.token) ? "" : undefined,
    })),
  }),

  // Removes its token. For pointers only: the keyboard's way is Backspace.
  // Disabled and read-only inputs mark it, so it can hide or dim.
  "token-remove": slot<TokenInputTokenProps>({
    // Internal: passed by renderers, from the host the core renders the token in.
    props: { token: "string" },
    attrs: (state) => ({
      "aria-hidden": "true",
      "data-disabled": isDisabled(state) ? "" : undefined,
      "data-readonly": state.readOnly ? "" : undefined,
    }),
    // Pressing it keeps focus and the caret in the editor.
    on: pressKeepsFocus,
    press: ({ api, props }, event) => {
      if (api.internal.editable()) {
        api.internal.removeToken(props.token, { reason: "remove-press", event })
      }
    },
  }),

  // React and Vue: a visually hidden textarea with the codec text, so forms
  // submit, reset and validate it, even before hydration. A textarea, since
  // a text input drops new lines.
  "form-input": slot({
    attrs: (state, { id, api }) => ({
      id: `${id}-form-input`,
      name: state.name,
      value: api.internal.text(),
      form: state.form,
      required: state.required ? "" : undefined,
      disabled: state.disabled ? "" : undefined,
      "aria-hidden": "true",
      tabindex: "-1",
      style: hiddenInputStyle,
    }),
    bind: (el, { api, store }) =>
      bindValueInput(el as HTMLInputElement, {
        value: api.internal.text,
        subscribe: store.subscribe,
        focus: () => api.focus(),
        reset: api.internal.reset,
        disabled: api.internal.setFormDisabled,
      }),
  }),
})

export { tokenInputSlots }
