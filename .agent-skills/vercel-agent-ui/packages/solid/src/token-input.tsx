import {
  tokenInput as tokenInputPrimitive,
  type Token,
  type TokenInputEditorProps,
  type TokenInputEditorState,
  type TokenInputOptions,
  type TokenInputTokenState,
} from "@ui-sdk/core/token-input"
import { renderStaticHtml } from "@ui-sdk/core/renderer"
import { Portal, type JSX } from "@solidjs/web"
import {
  createContext,
  createEffect,
  createMemo,
  createSignal,
  For,
  merge,
  omit,
  Show,
  untrack,
  useContext,
} from "solid-js"
import { EditorContext } from "./editor-context"
import { joinField, useFieldControl } from "./field-context"
import {
  providePrimitive,
  rootScope,
  usePart,
  usePrimitive,
  type PartProps,
  type PrimitiveHandle,
} from "./use-primitive"

type TokenInputContextValue = PrimitiveHandle<typeof tokenInputPrimitive>

const TokenInputContext = createContext<TokenInputContextValue | null>(null)
const TokenContext = createContext<string | null>(null)

function useTokenInput() {
  const context = useContext(TokenInputContext)
  if (!context) {
    throw new Error("TokenInput parts must be used inside <TokenInput>.")
  }
  return context
}

function useTokenId(part: string) {
  const id = useContext(TokenContext)
  if (!id) {
    throw new Error(`<${part}> must be used inside renderToken.`)
  }
  return id
}

/**
 * The props of `TokenInput`.
 * @stable
 */
type TokenInputProps = TokenInputOptions & {
  children?: JSX.Element
  /** Renders a token's content, usually a TokenInputToken. Without it, tokens show their label. */
  renderToken?: (token: Token) => JSX.Element
}

/**
 * A text field with atomic tokens. A TriggerMenu inside it suggests into it.
 * @stable
 */
const TokenInput = /* @__PURE__ */ rootScope(function TokenInput(
  props: TokenInputProps
) {
  const field = useFieldControl()
  const options = omit(props, "children", "renderToken")
  const input = usePrimitive(tokenInputPrimitive, () => ({
    ...options,
    name: props.name ?? field?.name(),
    disabled: props.disabled || field?.disabled(),
  }))
  // Known before the editor binds: the view fills the hosts it owns with the
  // label, and leaves custom ones to `renderToken`.
  input.api.internal.setCustom(!!untrack(() => props.renderToken))
  createEffect(
    () => !!props.renderToken,
    (custom) => {
      input.api.internal.setCustom(custom)
    }
  )
  return (
    <TokenInputContext value={input}>
      <EditorContext value={() => input.api.editor}>
        {providePrimitive(input, () => (
          <>
            {props.children}
            {formInput(input)}
            <Show when={props.renderToken} keyed>
              {(renderToken) => tokens(input, renderToken)}
            </Show>
          </>
        ))}
      </EditorContext>
    </TokenInputContext>
  )
})

// Each token's content, rendered into its host in the editor. The hosts are
// read after mount, from an effect: the server has none, and reading them
// while hydrating would render content the server never did.
function tokens(
  input: TokenInputContextValue,
  renderToken: (token: Token) => JSX.Element
) {
  // Written from core's listeners, which can fire inside a disposal.
  const [hosts, setHosts] = createSignal<
    ReturnType<typeof input.api.internal.hosts>
  >([], {
    ownedWrite: true,
  })
  createEffect(
    () => 0,
    () => {
      const read = () => setHosts(input.api.internal.hosts())
      read()
      return input.instance.subscribe(read)
    }
  )
  return (
    <For each={hosts()} keyed={(entry) => entry.id}>
      {(entry) => {
        // A host keeps its identity for its token's life; the token changes only when it's updated.
        const host = untrack(() => entry().host)
        const id = untrack(() => entry().id)
        const token = createMemo(() => entry().token)
        return (
          <Portal mount={host}>
            <TokenContext value={id}>{renderToken(token())}</TokenContext>
          </Portal>
        )
      }}
    </For>
  )
}

// A visually hidden textarea with the codec text, so forms submit, reset and
// validate it, even before hydration. Rendered while the input has a name.
function formInput(input: TokenInputContextValue) {
  const part = input.slot("form-input")
  return (
    <Show when={part.name}>
      <textarea {...part} />
    </Show>
  )
}

/**
 * The editable text. The core owns its content; style it, and show the placeholder with `data-empty`.
 * @stable
 */
function TokenInputEditor(
  props: Omit<PartProps<"div", TokenInputEditorState>, "children"> &
    TokenInputEditorProps
) {
  const input = useTokenInput()
  const field = useFieldControl(props)
  const part = () => ({ placeholder: props.placeholder })
  // The first value as markup, so a server render shows it. Solid never
  // touches it again: it skips `innerHTML` while hydrating, and the core
  // renders the value itself once the editor binds.
  const html = renderStaticHtml(input.state.value, input.api.internal.describe)
  const own = merge(omit(props, "placeholder"), { innerHTML: html })
  return usePart(input, "editor", part, joinField(field, own, "div"), "div")
}

/**
 * A token's content, inside `renderToken`, with its state for styling.
 * @stable
 */
function TokenInputToken(props: PartProps<"span", TokenInputTokenState>) {
  const input = useTokenInput()
  const id = useTokenId("TokenInputToken")
  return usePart(input, "token", () => ({ id, token: id }), props, "span")
}

/**
 * Removes its token when pressed. Hidden from assistive technology: the keyboard's way is Backspace.
 * @stable
 */
function TokenInputTokenRemove(props: PartProps<"span">) {
  const input = useTokenInput()
  const id = useTokenId("TokenInputTokenRemove")
  return usePart(
    input,
    "token-remove",
    () => ({ id, token: id }),
    props,
    "span"
  )
}

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

export {
  TokenInput,
  TokenInputEditor,
  type TokenInputProps,
  TokenInputToken,
  TokenInputTokenRemove,
}
