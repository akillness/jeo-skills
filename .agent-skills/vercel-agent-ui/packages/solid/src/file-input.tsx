import {
  fileInput as fileInputPrimitive,
  type FileInputItemProps,
  type FileInputItemRemoveState,
  type FileInputItemState,
  type FileInputOptions,
  type FileInputState,
  type FileInputTriggerProps,
} from "@ui-sdk/core/file-input"
import { fileKey } from "@ui-sdk/core/renderer"
import type { JSX } from "@solidjs/web"
import { createContext, For, merge, omit, Show, useContext } from "solid-js"
import { useControllerEntry, useControllerTarget } from "./controller-target"
import { joinField, useFieldControl } from "./field-context"
import {
  createParts,
  renderStatic,
  rootScope,
  usePart,
  usePrimitive,
  type PartProps,
  type PrimitiveHandle,
} from "./use-primitive"

const parts = createParts(fileInputPrimitive, { dropzone: "div" })

type FileInputContextValue = PrimitiveHandle<typeof fileInputPrimitive>

const FileInputContext = createContext<FileInputContextValue | null>(null)
// The file each repetition of a list's children shows.
const FileContext = createContext<(() => File) | null>(null)

function useFileInput(part: string) {
  const context = useContext(FileInputContext)
  if (!context) {
    throw new Error(`${part} must be used inside <FileInput>.`)
  }
  return context
}

function useItemFile(part: string, own: () => File | undefined) {
  const listed = useContext(FileContext)
  return () => {
    const file = own() ?? listed?.()
    if (!file) {
      throw new Error(
        `${part} must be used inside <FileInputList>, or be given a file.`
      )
    }
    return file
  }
}

type DivProps<State> = Omit<
  PartProps<"div", State>,
  "defaultValue" | "onChange" | "onSelect" | "onDrop"
>
type ButtonProps<State> = Omit<
  PartProps<"button", State>,
  "name" | "form" | "value" | "onSelect"
>

// Children that take the part's state are called with it. A function that
// takes nothing is a child component's accessor, and goes through as it is.
const resolve = (value: unknown, state: unknown) =>
  typeof value === "function" && value.length > 0 ? value(state) : value

/**
 * The root: it holds the files, and renders the hidden file input that opens
 * the picker and that a form submits.
 * @stable
 */
const FileInput = /* @__PURE__ */ rootScope(function FileInput(
  props: FileInputOptions & DivProps<FileInputState>
) {
  const field = useFieldControl()
  const fileInput = usePrimitive(fileInputPrimitive, () => ({
    value: props.value,
    defaultValue: props.defaultValue,
    onValueChange: props.onValueChange,
    onReject: props.onReject,
    accept: props.accept,
    multiple: props.multiple,
    directory: props.directory,
    capture: props.capture,
    maxFiles: props.maxFiles,
    maxSize: props.maxSize,
    minSize: props.minSize,
    validate: props.validate,
    name: props.name ?? field?.name(),
    form: props.form,
    required: props.required,
    disabled: props.disabled || field?.disabled(),
    announcement: props.announcement,
    controller: props.controller,
    debug: props.debug,
  }))
  useControllerEntry(() => props.controller, fileInput)
  const rest = omit(
    props,
    "value",
    "defaultValue",
    "onValueChange",
    "onReject",
    "accept",
    "multiple",
    "directory",
    "capture",
    "maxFiles",
    "maxSize",
    "minSize",
    "validate",
    "name",
    "form",
    "required",
    "disabled",
    "announcement",
    "controller",
    "debug"
  )
  const input = fileInput.slot("input")
  const hidden = <input {...input} />
  // Content, then the hidden input, with function children resolved.
  const content = (current: FileInputState) =>
    [resolve(rest.children, current), hidden] as JSX.Element
  const root = merge(rest, {
    get children() {
      return content
    },
  })
  return (
    <FileInputContext value={fileInput}>
      {usePart(fileInput, "root", undefined, root, "div")}
    </FileInputContext>
  )
})

const unconnected: FileInputState = {
  value: [],
  disabled: false,
  required: false,
  dragging: false,
}

/**
 * Opens the file picker. Inside a Field, the field's label names it with the
 * button's own text. Outside the file input, it connects through `controller`.
 * @stable
 */
function FileInputTrigger(
  props: ButtonProps<FileInputState> & FileInputTriggerProps
) {
  const fileInput = useControllerTarget(
    () => props.controller,
    useContext(FileInputContext)
  )
  const rest = omit(props, "controller")
  const field = useFieldControl()
  return (
    <Show
      when={fileInput()}
      keyed
      // Until the file input it names mounts, a trigger outside it is a plain button.
      fallback={renderStatic(
        "button",
        () => ({ attrs: {}, state: unconnected }),
        merge({ type: "button" }, rest)
      )}
    >
      {(fileInput) =>
        usePart(
          fileInput,
          "trigger",
          undefined,
          joinField(field, rest, "button"),
          "button"
        )
      }
    </Show>
  )
}

/**
 * Takes dropped and pasted files. Put the trigger inside it, which is how
 * keyboard and screen reader users choose files.
 * @stable
 */
const FileInputDropzone = parts.Dropzone

/**
 * The files, as a list. Its children render once for each file, so put a
 * FileInputItem in it.
 * @stable
 */
function FileInputList(
  props: Omit<DivProps<FileInputState>, "children"> & { children?: JSX.Element }
) {
  const fileInput = useFileInput("FileInputList")
  // Files keep their identity between changes, so each keeps its item.
  const items = (state: FileInputState) => (
    <For each={state.value as readonly File[]}>
      {(file) => <FileContext value={() => file}>{props.children}</FileContext>}
    </For>
  )
  return usePart(
    fileInput,
    "list",
    undefined,
    merge(props, { children: items }),
    "div"
  )
}

/**
 * One file. Its render state has the file, for its name, size and preview.
 * Arrow keys move between items, and Backspace or Delete removes the focused one.
 * @stable
 */
function FileInputItem(
  props: DivProps<FileInputItemState> & Partial<FileInputItemProps>
) {
  const fileInput = useFileInput("FileInputItem")
  const file = useItemFile("FileInputItem", () => props.file)
  const item = () => ({ file: file(), value: fileKey(file()) })
  const rest = omit(props, "file")
  return (
    <FileContext value={file}>
      {usePart(fileInput, "item", item, rest, "div")}
    </FileContext>
  )
}

/**
 * Removes its item's file, or the `file` it's given. It's named "Remove <file
 * name>" unless you name it.
 * @stable
 */
function FileInputItemRemove(
  props: ButtonProps<FileInputItemRemoveState> & Partial<FileInputItemProps>
) {
  const fileInput = useFileInput("FileInputItemRemove")
  const file = useItemFile("FileInputItemRemove", () => props.file)
  const item = () => ({ file: file(), value: fileKey(file()) })
  return usePart(fileInput, "item-remove", item, omit(props, "file"), "button")
}

export {
  createFileInputController,
  formatFileSize,
  relativePath,
} from "@ui-sdk/core/file-input"
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

export {
  FileInput,
  FileInputDropzone,
  FileInputItem,
  FileInputItemRemove,
  FileInputList,
  FileInputTrigger,
}
