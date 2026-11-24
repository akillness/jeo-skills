import type { ChangeDetails } from "@ui-sdk/core"
import {
  tokenInput as tokenInputPrimitive,
  type UndoStackOptions,
  type Token,
  type TokenCodec,
  type TokenDeletion,
  type TokenInputController,
  type TokenInputSubmitDetails,
  type TokenInputValue,
  type TokenInputValueChangeReason,
} from "@ui-sdk/core/token-input"
import { renderStaticHtml, renderVersion } from "@ui-sdk/core/renderer"
import {
  defineComponent,
  h,
  inject,
  provide,
  shallowRef,
  onBeforeUpdate,
  onScopeDispose,
  Teleport,
  toRaw,
  type InjectionKey,
  type PropType,
  type SlotsType,
  type VNode,
} from "vue"
import { withElement } from "./create-parts"
import { EditorKey } from "./editor-context"
import { useFieldControl } from "./field-context"
import {
  optionalBoolean,
  orModel,
  useHandle,
  usePart,
  usePrimitive,
  type PartSlots,
} from "./use-primitive"
import { renderless } from "./renderless"
import { readOnlyOf } from "./text-control"

type ValueDetails = ChangeDetails<TokenInputValueChangeReason> & {
  inputType?: string
  removed: Token[]
}

const TokenKey: InjectionKey<string> = Symbol("token-input-token")

const useTokenInput = () => useHandle(tokenInputPrimitive)

// The array as given, not Vue's reactive copy, so a value passed back is the
// one it sent. Its items are read first, so a push into a reactive array
// hands the value over again.
function given(list: TokenInputValue | undefined) {
  list?.forEach(() => {})
  return list && toRaw(list)
}

function useTokenId(part: string) {
  const id = inject(TokenKey, null)
  if (!id) {
    throw new Error(`<${part}> must be used inside the token slot.`)
  }
  return id
}

/**
 * A text field with atomic tokens. A TriggerMenu inside it suggests into it. The `token` slot renders each token's content.
 * @stable
 */
const TokenInput = /* @__PURE__ */ renderless(
  defineComponent({
    name: "TokenInput",
    props: {
      value: Array as PropType<TokenInputValue>,
      modelValue: Array as PropType<TokenInputValue>,
      defaultValue: Array as PropType<TokenInputValue>,
      submitShortcut: String as PropType<"enter" | "mod+enter">,
      tokenDeletion: String as PropType<TokenDeletion>,
      copy: String as PropType<"codec" | "label">,
      codec: Object as PropType<TokenCodec>,
      getTokenDescription: Function as PropType<(token: Token) => string>,
      history: Object as PropType<UndoStackOptions>,
      disabled: optionalBoolean,
      readOnly: optionalBoolean,
      required: optionalBoolean,
      name: String,
      form: String,
      controller: Object as PropType<TokenInputController>,
      debug: optionalBoolean,
      // A function prop, so `@submit` binds to it, and without one the shortcut submits the form.
      onSubmit: Function as PropType<
        (value: TokenInputValue, details: TokenInputSubmitDetails) => void
      >,
    },
    emits: {
      "update:value": (_value: TokenInputValue) => true,
      "update:modelValue": (_value: TokenInputValue) => true,
      valueChange: (_value: TokenInputValue, _details: ValueDetails) => true,
    },
    slots: Object as SlotsType<{
      default?: () => VNode[]
      /** Renders each token's content: `#token="{ token }"`. */
      token?: (scope: { token: Token }) => VNode[]
    }>,
    setup(props, { slots, attrs, emit }) {
      const field = useFieldControl()
      const input = usePrimitive(tokenInputPrimitive, () => ({
        ...props,
        value: given(orModel(props.value, props.modelValue)),
        defaultValue: props.defaultValue && toRaw(props.defaultValue),
        name: props.name ?? field?.name(),
        disabled: props.disabled || field?.disabled(),
        readOnly: readOnlyOf(props, attrs),
        onValueChange: (value: TokenInputValue, details: ValueDetails) => {
          emit("valueChange", value, details)
          if (details.canceled) {
            return
          }
          emit("update:value", value)
          emit("update:modelValue", value)
        },
      }))
      provide(EditorKey, () => input.api.editor)
      // Re-renders tokens when hosts come and go, and when tokens change.
      const version = shallowRef(renderVersion(input.instance))
      onScopeDispose(
        input.instance.subscribe(
          () => (version.value = renderVersion(input.instance))
        )
      )
      // Slots aren't reactive: a `token` slot added or removed later is seen
      // before the render it causes.
      input.api.internal.setCustom(!!slots.token)
      onBeforeUpdate(() => input.api.internal.setCustom(!!slots.token))
      return () => {
        version.value
        return [
          slots.default?.(),
          slots.token &&
            input.api.internal
              .hosts()
              .map(({ id, token, host }) =>
                h(Teleport, { key: id, to: host }, [
                  h(TokenScope, { id }, () => slots.token!({ token })),
                ])
              ),
          h(FormInput),
        ]
      }
    },
  })
)

// Gives a token's parts their token.
const TokenScope = defineComponent({
  name: "TokenInputTokenScope",
  props: { id: { type: String, required: true } },
  setup(props, { slots }) {
    provide(TokenKey, props.id)
    return () => slots.default?.()
  },
})

const FormInput = defineComponent({
  name: "TokenInputFormInput",
  setup() {
    const input = useTokenInput()
    return () =>
      input.state.name ? h("textarea", input.slot("form-input")) : null
  },
})

/**
 * The editable text. The core owns its content; style it, and show the placeholder with `data-empty`.
 * @stable
 */
const TokenInputEditor = withElement(
  "div",
  defineComponent({
    name: "TokenInputEditor",
    inheritAttrs: false,
    props: { placeholder: String },
    slots: Object as PartSlots<typeof tokenInputPrimitive, "editor">,
    setup(props, { attrs }) {
      const input = useTokenInput()
      const field = useFieldControl(attrs)
      // The first value as markup, so a server render shows it. Vue never touches it again.
      const html = renderStaticHtml(
        input.api.getValue(),
        input.api.internal.describe
      )
      return usePart(
        input,
        "editor",
        () => ({ placeholder: props.placeholder }),
        undefined,
        {
          tag: "div",
          // The core owns the content.
          children: () => undefined,
          extend: (editor) => {
            const own = { ...editor, innerHTML: html }
            return field ? field.props(own) : own
          },
        }
      )
    },
  })
)

/**
 * A token's content, inside the `token` slot, with its state for styling.
 * @stable
 */
const TokenInputToken = withElement(
  "span",
  defineComponent({
    name: "TokenInputToken",
    inheritAttrs: false,
    slots: Object as PartSlots<typeof tokenInputPrimitive, "token">,
    setup() {
      const id = useTokenId("TokenInputToken")
      return usePart(
        useTokenInput(),
        "token",
        () => ({ id, token: id }),
        undefined,
        "span"
      )
    },
  })
)

/**
 * Removes its token when pressed. Hidden from assistive technology: the keyboard's way is Backspace.
 * @stable
 */
const TokenInputTokenRemove = withElement(
  "span",
  defineComponent({
    name: "TokenInputTokenRemove",
    inheritAttrs: false,
    slots: Object as PartSlots<typeof tokenInputPrimitive, "token-remove">,
    setup() {
      const id = useTokenId("TokenInputTokenRemove")
      return usePart(
        useTokenInput(),
        "token-remove",
        () => ({ id, token: id }),
        undefined,
        "span"
      )
    },
  })
)

export {
  createTokenInputController,
  defaultCodec,
  fromText,
  toLabel,
  toText,
} from "@ui-sdk/core/token-input"
export type {
  UndoStackOptions,
  TextEditorAdapter,
  TextRange,
  Token,
  TokenCodec,
  TokenDeletion,
  TokenInputApi,
  TokenInputChangeOptions,
  TokenInputController,
  TokenInputEditorProps,
  TokenInputEditorState,
  TokenInputOptions,
  TokenInputPrimitive,
  TokenInputTokenProps,
  TokenInputTokenState,
  TokenInputValue,
  TokenInputSubmitDetails,
  TokenInputValueChangeDetails,
  TokenInputValueChangeReason,
  TokenInsert,
} from "@ui-sdk/core/token-input"

export { TokenInput, TokenInputEditor, TokenInputToken, TokenInputTokenRemove }
