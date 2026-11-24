// Importing this defines <ui-token-input> and its parts. On the server it does nothing.
import { defineTokenInputElements } from "../token-input"

defineTokenInputElements()

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
export type { TokenInputEvents, UiTokenInputElement } from "../events"
export {
  createTokenInputController,
  defaultCodec,
  fromText,
  toLabel,
  toText,
} from "@ui-sdk/core/token-input"
