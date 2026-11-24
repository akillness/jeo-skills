import {
  fileInput as fileInputPrimitive,
  type FileInputDropzoneTarget,
  type FileInputController,
  type FileInputOptions,
  type FileInputState,
  type FileInputValueChangeDetails,
  type FileInputValueChangeReason,
  type FileRejection,
  type FileInputPasteTarget,
} from "@ui-sdk/core/file-input"
import { fileKey } from "@ui-sdk/core/renderer"
import type { CommitDetails } from "@ui-sdk/core"
import {
  defineComponent,
  h,
  inject,
  provide,
  useId,
  type FunctionalComponent,
  type InjectionKey,
  type PropType,
  type SlotsType,
  type VNode,
} from "vue"
import {
  renderUnbound,
  useConnectedPart,
  useControllerEntry,
  useControllerTarget,
} from "./controller-target"
import { withElement } from "./create-parts"
import { useFieldControl } from "./field-context"
import {
  optionalBoolean,
  orModel,
  usePart,
  usePrimitive,
  useScope,
  type PartSlots,
} from "./use-primitive"

// The file of the item a part sits in, or of the list row it's rendered in,
// read when needed, so it follows a standalone item's new `file`.
const FileKey: InjectionKey<() => File> = Symbol("file-input-file")

function useFileInput(part: string) {
  const context = useScope(fileInputPrimitive)?.handle
  if (!context) {
    throw new Error(`${part} must be used inside <FileInput>.`)
  }
  return context
}

function useItemFile(part: string, own: () => File | undefined) {
  const listed = inject(FileKey, null)
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

/**
 * The root: it holds the files, and renders the hidden file input that opens
 * the picker and that a form submits.
 * @stable
 */
const FileInput = withElement(
  "div",
  defineComponent({
    name: "FileInput",
    inheritAttrs: false,
    props: {
      value: { type: Array as PropType<File[]>, default: undefined },
      modelValue: { type: Array as PropType<File[]>, default: undefined },
      defaultValue: { type: Array as PropType<File[]>, default: undefined },
      accept: [String, Array] as PropType<FileInputOptions["accept"]>,
      multiple: optionalBoolean,
      directory: optionalBoolean,
      capture: {
        type: [Boolean, String] as PropType<FileInputOptions["capture"]>,
        default: undefined,
      },
      maxFiles: Number,
      maxSize: Number,
      minSize: Number,
      validate: Function as PropType<FileInputOptions["validate"]>,
      name: String,
      form: String,
      required: optionalBoolean,
      disabled: optionalBoolean,
      announcement: Function as PropType<FileInputOptions["announcement"]>,
      controller: Object as PropType<FileInputController>,
      debug: optionalBoolean,
    },
    emits: {
      "update:value": (_value: File[]) => true,
      "update:modelValue": (_value: File[]) => true,
      valueChange: (_value: File[], _details: FileInputValueChangeDetails) =>
        true,
      reject: (
        _rejected: FileRejection[],
        _details: CommitDetails<FileInputValueChangeReason>
      ) => true,
    },
    slots: Object as PartSlots<typeof fileInputPrimitive, "root">,
    setup(props, { emit }) {
      const field = useFieldControl()
      const fileInput = usePrimitive(fileInputPrimitive, () => ({
        value: orModel(props.value, props.modelValue),
        defaultValue: props.defaultValue,
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
        onValueChange: (
          value: File[],
          details: FileInputValueChangeDetails
        ) => {
          // The change event runs first, so canceling it also keeps v-model as it was.
          emit("valueChange", value, details)
          if (details.canceled) {
            return
          }
          emit("update:value", value)
          emit("update:modelValue", value)
        },
        onReject: (
          rejected: FileRejection[],
          details: CommitDetails<FileInputValueChangeReason>
        ) => emit("reject", rejected, details),
      }))
      useControllerEntry(() => props.controller, fileInput)
      return usePart(fileInput, "root", undefined, undefined, {
        tag: "div",
        hidden: () => h("input", fileInput.slot("input")),
      })
    },
  })
)

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
const FileInputTrigger = withElement(
  "button",
  defineComponent({
    name: "FileInputTrigger",
    inheritAttrs: false,
    props: {
      controller: Object as PropType<FileInputController>,
    },
    slots: Object as PartSlots<typeof fileInputPrimitive, "trigger">,
    setup(props, { slots, attrs }) {
      const connected = useControllerTarget(
        fileInputPrimitive,
        () => props.controller
      )
      const field = useFieldControl()
      return useConnectedPart(
        connected,
        (fileInput) =>
          usePart(fileInput, "trigger", undefined, undefined, {
            tag: "button",
            extend: field?.props,
          }),
        // Until the file input it names mounts, a trigger outside it is a plain button.
        () =>
          renderUnbound(
            "button",
            { type: "button", ...attrs },
            { slots, state: unconnected }
          )
      )
    },
  })
)

/**
 * Takes dropped and pasted files. Put the trigger inside it, which is how
 * keyboard and screen reader users choose files.
 * @stable
 */
const FileInputDropzone = withElement(
  "div",
  defineComponent({
    name: "FileInputDropzone",
    inheritAttrs: false,
    props: {
      target: String as PropType<FileInputDropzoneTarget>,
      pasteTarget: [String, Object, Function] as PropType<FileInputPasteTarget>,
    },
    slots: Object as PartSlots<typeof fileInputPrimitive, "dropzone">,
    setup(props) {
      const fileInput = useFileInput("FileInputDropzone")
      const id = useId()
      const zone = () => ({
        id,
        target: props.target,
        pasteTarget: props.pasteTarget,
      })
      return usePart(fileInput, "dropzone", zone)
    },
  })
)

// Provides one file to the list's default slot, rendered once for each file.
const FileScope = defineComponent({
  name: "FileInputFileScope",
  props: { file: { type: Object as PropType<File>, required: true } },
  setup(props, { slots }) {
    provide(FileKey, () => props.file)
    return () => slots.default?.()
  },
})

/**
 * The files, as a list. Its default slot renders once for each file, so put
 * a FileInputItem in it.
 * @stable
 */
const FileInputList = withElement(
  "div",
  defineComponent({
    name: "FileInputList",
    inheritAttrs: false,
    slots: Object as SlotsType<{
      /** Renders once for each file. */
      default?: () => VNode[]
      /** Renders your own element: bind `props` to it, and render the files inside with `<component :is="children" />`. */
      render?: (scope: {
        props: Record<string, unknown>
        state: FileInputState
        children: FunctionalComponent
      }) => VNode[]
    }>,
    setup(_, { slots }) {
      const fileInput = useFileInput("FileInputList")
      return usePart(fileInput, "list", undefined, undefined, {
        tag: "div",
        children: (state) =>
          (state.value as readonly File[]).map((file) =>
            h(FileScope, { file, key: fileKey(file) }, () => slots.default?.())
          ),
      })
    },
  })
)

/**
 * One file. Its slot state has the file, for its name, size and preview.
 * Arrow keys move between items, and Backspace or Delete removes the focused one.
 * @stable
 */
const FileInputItem = withElement(
  "div",
  defineComponent({
    name: "FileInputItem",
    inheritAttrs: false,
    props: {
      file: Object as PropType<File>,
    },
    slots: Object as PartSlots<typeof fileInputPrimitive, "item">,
    setup(props) {
      const fileInput = useFileInput("FileInputItem")
      const file = useItemFile("FileInputItem", () => props.file)
      const item = () => ({ file: file(), value: fileKey(file()) })
      provide(FileKey, file)
      return usePart(fileInput, "item", item)
    },
  })
)

/**
 * Removes its item's file, or the `file` it's given. It's named "Remove <file
 * name>" unless you name it.
 * @stable
 */
const FileInputItemRemove = withElement(
  "button",
  defineComponent({
    name: "FileInputItemRemove",
    inheritAttrs: false,
    props: {
      file: Object as PropType<File>,
    },
    slots: Object as PartSlots<typeof fileInputPrimitive, "item-remove">,
    setup(props) {
      const fileInput = useFileInput("FileInputItemRemove")
      const file = useItemFile("FileInputItemRemove", () => props.file)
      const item = () => ({ file: file(), value: fileKey(file()) })
      return usePart(fileInput, "item-remove", item, undefined, "button")
    },
  })
)

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
