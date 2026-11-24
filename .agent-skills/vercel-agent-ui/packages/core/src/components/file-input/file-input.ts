// A file input: the files a user chose, dropped or pasted, as its value. Every
// part is optional. A trigger alone is an upload button; add a drop zone for
// drops and pastes, and a list for the attachments, each removable. A hidden
// <input type="file"> opens the picker and is what a form submits, before
// hydration too. Custom elements are form-associated instead, and submit
// through ElementInternals. This module is the public API and the parts; the
// behavior is in file-input-api.ts and file-input-dropzone.ts.
import {
  fileInputApi,
  fileKey,
  isDisabled,
  settings,
  type State,
} from "./file-input-api"
import { bindDropzone } from "./file-input-dropzone"
import type { FileRejection, FileRules } from "../../foundation/forms/files"
import { hiddenInputStyle } from "../../foundation/forms/form"
import { createController } from "../../foundation/kernel/controller"
import type {
  ChangeDetails,
  ChangeOptions,
  CommitDetails,
} from "../../foundation/kernel/details"
import { definePrimitive } from "../../foundation/kernel/primitive"
import type {
  Named,
  PrimitiveOptions,
} from "../../foundation/kernel/primitive-types"

/**
 * Why a file input's value wants to change.
 * @stable
 */
type FileInputValueChangeReason =
  "picker" | "drop" | "paste" | "remove-press" | "reset" | "imperative"

/**
 * What a change did, beside the new value.
 * @stable
 */
type FileInputChange = {
  /** Why it changed. */
  reason: FileInputValueChangeReason
  /** The files that joined the value. Files that failed the checks are in `rejected` instead. */
  added: File[]
  /** The files that left the value, including the one a new file replaces without `multiple`. */
  removed: File[]
  /** The files that didn't pass the checks, each with its reasons. They never join the value. */
  rejected: FileRejection[]
}

/**
 * What `onValueChange` receives after the files: the reason, and what the change added, removed and rejected.
 * @stable
 */
type FileInputValueChangeDetails = ChangeDetails<FileInputValueChangeReason> &
  Omit<FileInputChange, "reason">

/**
 * Options for every write method on a controller.
 * @stable
 */
type FileInputChangeOptions = ChangeOptions<FileInputValueChangeReason>

/**
 * Adds, removes and reads files, and opens the picker, from outside the file input. Pass it as the `controller` option.
 * @stable
 */
function createFileInputController() {
  return createController<{
    /** The files it holds. */
    getValue: () => readonly File[]
    /** Replaces the files, without checking them. Returns false when canceled. */
    setValue: (
      files: readonly File[],
      options?: FileInputChangeOptions
    ) => boolean
    /** Runs files through the checks and adds the accepted ones, like a drop. Returns false when disabled or canceled. */
    addFiles: (
      files: readonly File[] | FileList,
      options?: FileInputChangeOptions
    ) => boolean
    /** Removes one file. Returns false when it isn't there, or the change is canceled. */
    removeFile: (file: File, options?: FileInputChangeOptions) => boolean
    /** Removes every file. */
    clear: (options?: FileInputChangeOptions) => boolean
    /** Opens the file picker. Browsers only allow it during a user action, like a click. Returns false when disabled. */
    open: () => boolean
    /** Moves focus to the trigger. */
    focus: () => void
    /** Whether files are being dragged over a drop zone. */
    isDragging: () => boolean
  }>()
}

/**
 * A controller from `createFileInputController()`. Pass it as the `controller`
 * option.
 * @stable
 */
type FileInputController = ReturnType<typeof createFileInputController>

// Reads a `capture` attribute: present or "true" is the default camera, and
// "user" and "environment" pick one.
function captureAttribute(attribute: string | null) {
  if (attribute === null) {
    return undefined
  }
  if (attribute === "" || attribute === "true") {
    return true
  }
  return attribute === "false" ? false : (attribute as "user" | "environment")
}

/**
 * The options `fileInput` takes. A component takes them as props on its root.
 * @stable
 */
type FileInputOptions = Omit<FileRules, "multiple"> & {
  /** The files, to control the file input. */
  value?: File[]
  /**
   * The files at first, when uncontrolled. A form reset returns to them.
   * @defaultValue []
   */
  defaultValue?: File[]
  /** Runs when files are added or removed, with what changed in the details. `details.cancel()` stops it. */
  onValueChange?: (value: File[], details: FileInputValueChangeDetails) => void
  /** Runs when files fail the checks, after `onValueChange`, with every reason each failed, even when none were accepted. */
  onReject?: (
    rejected: FileRejection[],
    details: CommitDetails<FileInputValueChangeReason>
  ) => void
  /**
   * Holds more than one file. New files join the ones it has, up to
   * `maxFiles` in all. Without it, a new file replaces the one it has.
   * @defaultValue false
   */
  multiple?: boolean
  /** Picks a whole folder, with every file inside it. Turns on `multiple`. */
  directory?: boolean
  /** Opens the camera on phones instead of the files: `"user"` for the front camera, `"environment"` for the back one, or `true` for the default one. */
  capture?: boolean | "user" | "environment"
  /** The name the files submit under. Without one, nothing is submitted. */
  name?: string
  /** The id of a form to belong to, when it isn't inside that form. */
  form?: string
  /** Blocks form submission until it holds a file, with the browser's own message. */
  required?: boolean
  /** Disables it like a native control: the trigger can't be focused or used, drops and pastes are ignored, and nothing is submitted. */
  disabled?: boolean
  /**
   * What screen readers hear after a change. Return null for nothing.
   * @defaultValue "2 files accepted. 1 file rejected.", or "photo.png removed."
   */
  announcement?: (change: FileInputChange) => string | null | undefined
  /** Adds and removes files from anywhere. Create one with `createFileInputController()`. */
  controller?: FileInputController
} & PrimitiveOptions

/**
 * Where a drop zone takes drops.
 * @stable
 */
type FileInputDropzoneTarget = "element" | "document"

/**
 * Where a drop zone takes pasted files: the page, an element, a CSS selector, or a function that returns an element.
 * @stable
 */
type FileInputPasteTarget =
  "document" | string | Element | null | (() => Element | null | undefined)

/**
 * The props of the trigger, in every framework.
 * @stable
 */
type FileInputTriggerProps = {
  /** Connects a trigger outside the file input, like one in a toolbar, to the file input with this controller. */
  controller?: FileInputController
}

/**
 * The props the `dropzone` slot of `fileInput` takes.
 * @stable
 */
type FileInputDropzoneProps = {
  /**
   * Where it takes drops. `"document"` takes files dropped anywhere on the
   * page, and the zone shows `data-dragging` while files are over the window,
   * so it can be a full-page overlay.
   * @defaultValue "element"
   */
  target?: FileInputDropzoneTarget
  /**
   * Somewhere else to take pasted files from, on top of pastes while focus is
   * inside the zone: `"document"`, an element, a CSS selector, or a function
   * that returns an element, like a prompt's text area. Text pastes are left alone.
   */
  pasteTarget?: FileInputPasteTarget
}

/**
 * The props the `item` slot of `fileInput` takes.
 * @stable
 */
type FileInputItemProps = {
  /** The file this item shows. The list passes it to the items it renders. */
  file: File
}

/**
 * What `render` functions and state-based class names receive.
 * @stable
 */
type FileInputState = {
  /** The files it holds. */
  value: readonly File[]
  /** Whether it's disabled, by itself or by a `<fieldset>`. */
  disabled: boolean
  /** Whether a form won't submit while it holds no files. */
  required: boolean
  /** Whether files are being dragged over one of its drop zones. */
  dragging: boolean
}

/**
 * The state the `dropzone` slot of `fileInput` hands `render` functions and
 * state-based class names.
 * @stable
 */
type FileInputDropzoneState = {
  /** Whether files are being dragged over it, or over the page for a page-wide zone. */
  dragging: boolean
  /** Whether the dragged files look acceptable, from their types and count. */
  dragAccept: boolean
  /** Whether a dragged file has a type `accept` rules out, or there are too many. */
  dragReject: boolean
  /** Whether the file input is disabled, by itself or by a `<fieldset>`, so drops and pastes are ignored. */
  disabled: boolean
}

/**
 * The state the `item` slot of `fileInput` hands `render` functions and
 * state-based class names.
 * @stable
 */
type FileInputItemState = {
  /** The file this item shows: the one its `FileInputList` renders it for, or its `file` prop. */
  file: File
  /** Where it is in the value, from 0. */
  index: number
  /** Whether the file input is disabled, so the item can't be removed. */
  disabled: boolean
}

/**
 * The state the `item-remove` slot of `fileInput` hands `render` functions and
 * state-based class names.
 * @stable
 */
type FileInputItemRemoveState = {
  /** Whether the file input is disabled, so the button can't remove its file. */
  disabled: boolean
}

function rootState(state: State) {
  return {
    value: state.value,
    disabled: isDisabled(state),
    required: state.required,
    dragging: Object.keys(state.drags).length > 0,
  }
}

function dropzoneState(state: State, key: string) {
  const status = state.drags[key]
  return {
    dragging: !!status,
    dragAccept: status === "accept",
    dragReject: status === "reject",
    disabled: isDisabled(state),
  }
}

const formAttrs = (state: State) => ({
  "data-disabled": isDisabled(state) ? "" : undefined,
  "data-required": state.required ? "" : undefined,
})

// The item that takes Tab into the list: the last one focused, else the first.
function isActiveItem(state: State, key: string) {
  const active = state.activeItem
  if (active && state.value.some((file) => fileKey(file) === active)) {
    return active === key
  }
  return state.value.length > 0 && fileKey(state.value[0]) === key
}

const fileInputPrimitive = /* @__PURE__ */ definePrimitive({
  name: "file-input",
  options: {
    accept: "string",
    maxFiles: "number",
    maxSize: "number",
    minSize: "number",
    validate: "value",
    value: "value",
    defaultValue: "value",
    onValueChange: "callback",
    onReject: "callback",
    multiple: "boolean",
    directory: "boolean",
    capture: captureAttribute,
    name: "string",
    form: "string",
    required: "boolean",
    disabled: "boolean",
    announcement: "value",
    controller: "value",
  },
  state: (options: FileInputOptions): State => {
    const value = options.value ?? options.defaultValue ?? []
    return {
      ...settings(options),
      value,
      initial: options.defaultValue ?? value,
      formDisabled: false,
      associated: false,
      drags: {},
      activeItem: null,
    }
  },
  sync: (options) => ({
    ...settings(options),
    ...(options.defaultValue === undefined
      ? {}
      : { initial: options.defaultValue }),
    ...(options.value === undefined ? {} : { value: options.value }),
  }),
  api: fileInputApi,
  slots: (slot) => ({
    root: slot<{}, FileInputState>({
      state: rootState,
      attrs: (state) => ({
        ...formAttrs(state),
        "data-dragging": Object.keys(state.drags).length ? "" : undefined,
      }),
      bind: (el, { api }) => api.internal.bindRoot(el),
    }),

    // The hidden input that opens the picker and, in React and Vue, holds the files the form submits.
    input: slot({
      attrs: (state) => ({
        type: "file",
        accept: state.accept,
        multiple: state.multiple ? "" : undefined,
        webkitdirectory: state.directory ? "" : undefined,
        capture: state.capture === true ? "" : state.capture,
        name: state.associated ? undefined : state.name,
        form: state.associated ? undefined : state.form,
        required: state.required && !state.associated ? "" : undefined,
        disabled: state.disabled ? "" : undefined,
        "aria-hidden": "true",
        tabindex: "-1",
        style: hiddenInputStyle,
      }),
      bind: (el, { api }) => api.internal.bindInput(el as HTMLInputElement),
    }),

    // Opens the picker. React and Vue render a button, and web components bind the button inside.
    trigger: slot<{}, FileInputState>({
      state: rootState,
      attrs: (state) => ({
        type: "button",
        // A trigger connected from outside a disabled <fieldset> isn't disabled by it natively.
        disabled: isDisabled(state) ? "" : undefined,
        ...formAttrs(state),
      }),
      press: ({ api }) => {
        api.open()
      },
    }),

    // Takes dropped and pasted files. It has no role and no tab stop.
    dropzone: slot<FileInputDropzoneProps, FileInputDropzoneState>({
      // Each zone is its own part, so it needs an id. `pasteTarget` is a
      // selector or "document" as an attribute, and may be an element too.
      props: {
        target: "string",
        pasteTarget: (attribute) => attribute,
        id: "id",
      },
      state: (state, { key }) => dropzoneState(state, key),
      attrs: (state, { key }) => {
        const { dragging, dragAccept, dragReject, disabled } = dropzoneState(
          state,
          key
        )
        return {
          "data-dragging": dragging ? "" : undefined,
          "data-drag-accept": dragAccept ? "" : undefined,
          "data-drag-reject": dragReject ? "" : undefined,
          "data-disabled": disabled ? "" : undefined,
        }
      },
      bind: (el, { key, store, api }) =>
        bindDropzone(el, {
          key,
          store,
          api,
          props: () => api.internal.dropzoneProps(key),
        }),
    }),

    // The files, as a list. Adapters render its items, one per file.
    list: slot<{}, FileInputState>({
      role: "list",
      state: rootState,
      attrs: formAttrs,
    }),

    // One file. It's focusable, with one tab stop for the list: arrow keys move
    // between items, and Backspace or Delete removes the focused one.
    item: slot<FileInputItemProps & { value: string }, FileInputItemState>({
      role: "listitem",
      focus: "roving",
      keys: [
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "Home",
        "End",
        "Backspace",
        "Delete",
      ],
      props: { file: "value", value: "string" },
      state: (state, { props }) => ({
        file: props.file,
        index: state.value.indexOf(props.file),
        disabled: isDisabled(state),
      }),
      attrs: (state, { key }) => ({
        tabindex: isActiveItem(state, key) ? "0" : "-1",
        "data-disabled": isDisabled(state) ? "" : undefined,
      }),
      on: {
        keydown: (event, { api, el, props }) =>
          el && api.internal.itemKeydown(event, el, props.file),
        focusin: (_, { api, key }) => api.internal.setActiveItem(key),
      },
    }),

    // Removes its item's file. Out of the tab order, since Backspace on the item does the same.
    // Renderers fill `file` from the item around it, so it's set by now.
    "item-remove": slot<
      Partial<FileInputItemProps> & { value?: string },
      FileInputItemRemoveState
    >({
      props: {
        file: { kind: "value", from: "item" },
        value: { kind: "string", from: "item" },
      },
      state: (state) => ({ disabled: isDisabled(state) }),
      attrs: (state, { props }) => ({
        type: "button",
        tabindex: "-1",
        "aria-label": `Remove ${props.file!.name}`,
        disabled: isDisabled(state) ? "" : undefined,
        "data-disabled": isDisabled(state) ? "" : undefined,
      }),
      press: ({ api, props }, event) =>
        api.internal.removeItem(props.file!, event as MouseEvent | undefined),
    }),
  }),
  agent: {
    actions: ["setValue", "addFiles", "removeFile", "clear", "open"],
    items: (api) =>
      api
        .getValue()
        .map((file) => ({ value: fileKey(file), label: file.name })),
  },
})

/**
 * The type of `fileInput`.
 * @stable
 */
interface FileInputPrimitive extends Named<typeof fileInputPrimitive> {}

/**
 * The file input primitive, with the slots `root`, `input`, `trigger`,
 * `dropzone`, `list`, `item`, `item-remove`.
 * Render it with an adapter's `usePrimitive`, or compose it inside your own
 * primitive.
 * @stable
 */
const fileInput: FileInputPrimitive = fileInputPrimitive
export { formatFileSize, relativePath } from "../../foundation/forms/files"
export type {
  FileLike,
  FileRejection,
  FileRejectionReason,
  FileRules,
} from "../../foundation/forms/files"

export {
  createFileInputController,
  fileInput,
  type FileInputChange,
  type FileInputChangeOptions,
  type FileInputController,
  type FileInputDropzoneProps,
  type FileInputDropzoneState,
  type FileInputDropzoneTarget,
  type FileInputItemProps,
  type FileInputItemRemoveState,
  type FileInputItemState,
  type FileInputOptions,
  type FileInputPasteTarget,
  type FileInputPrimitive,
  type FileInputState,
  type FileInputTriggerProps,
  type FileInputValueChangeDetails,
  type FileInputValueChangeReason,
}
export type { FileInputApi } from "./file-input-api"
