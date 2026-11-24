import {
  tokenInput,
  type Token,
  type TokenInputEditorProps,
  type TokenInputEditorState,
  type TokenInputOptions,
  type TokenInputTokenState,
} from "@ui-sdk/core/token-input"
import { renderStaticHtml, renderVersion } from "@ui-sdk/core/renderer"
import * as React from "react"
import { createPortal } from "react-dom"
import { EditorContext } from "./editor-context"
import { controlRender, useFieldControl } from "./field-context"
import {
  HandleScope,
  useHandle,
  usePart,
  usePrimitive,
  type PartProps,
  type PrimitiveHandle,
} from "./use-primitive"

type TokenInputHandle = PrimitiveHandle<typeof tokenInput>

const TokenContext = React.createContext<string | null>(null)

function useTokenId(part: string) {
  const id = React.useContext(TokenContext)
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
  children?: React.ReactNode
  /** Renders a token's content, usually a TokenInputToken. Without it, tokens show their label. */
  renderToken?: (token: Token) => React.ReactNode
}

/**
 * A text field with atomic tokens. A TriggerMenu inside it suggests into it.
 * @stable
 */
function TokenInput({ children, renderToken, ...options }: TokenInputProps) {
  const field = useFieldControl()
  const input = usePrimitive(tokenInput, {
    ...options,
    name: options.name ?? field?.name,
    disabled: options.disabled || field?.disabled,
  })
  const custom = !!renderToken
  React.useLayoutEffect(() => input.api.internal.setCustom(custom), [custom])
  return (
    <HandleScope handle={input}>
      <EditorContext.Provider value={input.api.editor}>
        {children}
        {renderToken && <Tokens input={input} renderToken={renderToken} />}
        <FormInput />
      </EditorContext.Provider>
    </HandleScope>
  )
}

// Each token's content, rendered into its host in the editor.
function Tokens({
  input,
  renderToken,
}: {
  input: TokenInputHandle
  renderToken: (token: Token) => React.ReactNode
}) {
  const version = () => renderVersion(input.instance)
  React.useSyncExternalStore(input.instance.subscribe, version, version)
  // The hosts are elements the editor holds, so they come from the instance, never a preview.
  return input.api.internal
    .hosts()
    .map(({ id, token, host }) =>
      createPortal(
        <TokenContext.Provider value={id}>
          {renderToken(token)}
        </TokenContext.Provider>,
        host,
        id
      )
    )
}

// The text a form submits, while the field has a name.
function FormInput() {
  const render = ({ value, ...props }: Record<string, any>) =>
    props.name ? <textarea {...props} defaultValue={value} /> : <></>
  return usePart(tokenInput, "form-input", {}, { render }, "textarea")
}

/**
 * The editable text. The core owns its content; style it, and show the placeholder with `data-empty`.
 * @stable
 */
function TokenInputEditor({
  placeholder,
  render,
  ...props
}: Omit<PartProps<"div", TokenInputEditorState>, "children"> &
  TokenInputEditorProps) {
  const input = useHandle(tokenInput)
  // The first value as markup, so a server render shows it. React never touches
  // it again, and leaves anything typed into it before hydration to the core.
  const [html] = React.useState(() => ({
    __html: renderStaticHtml(input.state.value, input.api.internal.describe),
  }))
  const element = {
    ...props,
    dangerouslySetInnerHTML: html,
    suppressHydrationWarning: true,
    render: controlRender(useFieldControl(props), "div", render),
  }
  return usePart(input, "editor", { placeholder }, element)
}

/**
 * A token's content, inside `renderToken`, with its state for styling.
 * @stable
 */
function TokenInputToken(props: PartProps<"span", TokenInputTokenState>) {
  const id = useTokenId("TokenInputToken")
  return usePart(tokenInput, "token", { id, token: id }, props, "span")
}

/**
 * Removes its token when pressed. Hidden from assistive technology: the keyboard's way is Backspace.
 * @stable
 */
function TokenInputTokenRemove(props: PartProps<"span">) {
  const id = useTokenId("TokenInputTokenRemove")
  return usePart(tokenInput, "token-remove", { id, token: id }, props, "span")
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
