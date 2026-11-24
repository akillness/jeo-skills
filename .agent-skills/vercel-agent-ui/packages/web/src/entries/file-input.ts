// Importing this defines <ui-file-input> and its parts. On the server it does nothing.
import { defineFileInputElements } from "../file-input"

defineFileInputElements()

export type {
  FileInputApi,
  FileInputChange,
  FileInputChangeOptions,
  FileInputController,
  FileInputDropzoneProps,
  FileInputDropzoneState,
  FileInputDropzoneTarget,
  FileInputItemProps,
  FileInputItemRemoveState,
  FileInputItemState,
  FileInputOptions,
  FileInputPasteTarget,
  FileInputPrimitive,
  FileInputState,
  FileInputTriggerProps,
  FileInputValueChangeDetails,
  FileInputValueChangeReason,
  FileLike,
  FileRejection,
  FileRejectionReason,
  FileRules,
} from "@ui-sdk/core/file-input"
export type { FileInputEvents, UiFileInputElement } from "../events"
export {
  createFileInputController,
  formatFileSize,
  relativePath,
} from "@ui-sdk/core/file-input"
