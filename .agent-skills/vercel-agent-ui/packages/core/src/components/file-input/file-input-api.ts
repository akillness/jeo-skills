// A file input's state and what it does: the value, the picker, form
// participation and the attachments list. Drops and pastes are in
// file-input-dropzone.ts, and the parts and their attributes in file-input.ts.
import { dev } from "#dev"
import { announce } from "../../foundation/platform/announce"
import { isRTL } from "../../foundation/platform/env"
import { moveIndex, radioStep } from "../../foundation/focus/collection"
import {
  parseAccept,
  validateFiles,
  type FileLike,
  type FileRejection,
} from "../../foundation/forms/files"
import {
  keepsValueOnReset,
  writingFromScript,
} from "../../foundation/forms/value"
import {
  associate,
  bindInternals,
  formInternals,
  isDisabled,
  valueMissingMessage,
} from "../../foundation/forms/form"
import type {
  FileInputDropzoneProps,
  FileInputChangeOptions,
  FileInputItemProps,
  FileInputOptions,
  FileInputValueChangeReason,
} from "./file-input"
import { on } from "../../foundation/kernel/events"
import type { PrimitiveContext } from "../../foundation/kernel/primitive-types"
import { sameValue } from "../../foundation/kernel/store"
import { createDetails } from "../../foundation/kernel/details"
import {
  changeSource,
  createChange,
} from "../../foundation/kernel/input-source"
import { elements } from "../../foundation/kernel/elements"

type DragStatus = "accept" | "reject"

type State = {
  value: readonly File[]
  // Where a form reset returns.
  initial: readonly File[]
  disabled: boolean
  formDisabled: boolean
  required: boolean
  name: string | undefined
  form: string | undefined
  accept: string | undefined
  multiple: boolean
  directory: boolean
  capture: true | "user" | "environment" | undefined
  // A custom element that submits through ElementInternals, so the input stays out of the form.
  associated: boolean
  // The drop zones files are over, by key, with how the dragged files look.
  drags: Readonly<Record<string, DragStatus>>
  // The item that takes Tab into the list, by key. The first one until another is focused.
  activeItem: string | null
}

const noFiles: readonly File[] = []
const noRejections: readonly FileRejection[] = []

function settings(options: FileInputOptions) {
  const accept = parseAccept(options.accept).join(",")
  return {
    disabled: !!options.disabled,
    required: !!options.required,
    name: options.name,
    form: options.form,
    accept: accept || undefined,
    multiple: !!options.multiple || !!options.directory,
    directory: !!options.directory,
    capture: options.capture || undefined,
  }
}

// Files have no natural key, so each gets one the first time it's seen, kept
// for as long as the file lives.
const fileKeys = new WeakMap<object, string>()
let fileCount = 0

/** A key for a file that stays the same while the file lives, for lists keyed by file. */
function fileKey(file: object) {
  let key = fileKeys.get(file)
  if (!key) {
    fileKeys.set(file, (key = `file-${++fileCount}`))
  }
  return key
}

// Puts files in a file input, so its form submits exactly those.
function setInputFiles(input: HTMLInputElement, files: readonly File[]) {
  const current = Array.from(input.files ?? [])
  if (
    current.length === files.length &&
    current.every((file, index) => file === files[index])
  ) {
    return
  }
  if (typeof DataTransfer !== "function") {
    return
  }
  const transfer = new DataTransfer()
  for (const file of files) {
    transfer.items.add(file)
  }
  input.files = transfer.files
}

// Browsers submit a named file input with no files as one empty file.
const noFile = () => new File([], "", { type: "application/octet-stream" })

const plural = (count: number) => `${count} ${count === 1 ? "file" : "files"}`

/**
 * What a file input announces after a change, like "2 files accepted. 1 file
 * rejected." or "photo.png removed." Null when there's nothing to say.
 */
function describeChange(details: {
  reason: string
  added: readonly FileLike[]
  removed: readonly FileLike[]
  rejected: readonly FileRejection<FileLike>[]
}) {
  if (details.reason === "reset") {
    return null
  }
  const parts = []
  if (details.added.length) {
    parts.push(`${plural(details.added.length)} accepted.`)
  }
  if (details.rejected.length) {
    parts.push(`${plural(details.rejected.length)} rejected.`)
  }
  if (details.removed.length && !details.added.length) {
    parts.push(
      details.removed.length === 1
        ? `${details.removed[0].name} removed.`
        : `${plural(details.removed.length)} removed.`
    )
  }
  return parts.length ? parts.join(" ") : null
}

function fileInputApiBody(
  context: PrimitiveContext<
    FileInputOptions,
    State,
    "root" | "input" | "trigger" | "dropzone" | "item"
  >
) {
  const { id, store, options, element } = context
  const change = createChange(context)

  // The rules for the next files. With `multiple`, `maxFiles` counts the files
  // it holds, so a full list rejects new ones, and its drags show it.
  const rules = () => {
    const { accept, maxFiles, maxSize, minSize, validate } = options()
    const { multiple, value } = store.get()
    const room =
      maxFiles !== undefined && multiple
        ? Math.max(0, maxFiles - value.length)
        : maxFiles
    return { accept, multiple, maxFiles: room, maxSize, minSize, validate }
  }

  // The input keeps its files only when a form needs them. Otherwise it's
  // emptied after each choice, so choosing the same file again reports it again.
  const keepsFiles = () => {
    const { associated, name, required } = store.get()
    return !associated && (!!name || required)
  }
  const input = () => element("input") as HTMLInputElement | undefined
  // The element that takes part in the form: the custom element itself, or the input.
  const formElement = () => {
    const root = element("root")
    return formInternals(root) ? root : input()
  }

  // Our own input and change events, after a drop or a removal, aren't choices.
  let echoing = false
  function echoChange() {
    const el = formElement()
    if (el && writingFromScript(el)) {
      return
    }
    queueMicrotask(() => {
      if (!el?.isConnected) {
        return
      }
      echoing = true
      el.dispatchEvent(new Event("input", { bubbles: true, composed: true }))
      el.dispatchEvent(new Event("change", { bubbles: true }))
      echoing = false
    })
  }

  function writeInput() {
    const el = input()
    if (!el) {
      return
    }
    if (keepsFiles()) {
      setInputFiles(el, store.get().value)
    } else {
      el.value = ""
    }
  }

  // Reports a change with what it added, removed and rejected, then
  // announces it, unless it was canceled. A batch that changes nothing
  // because every file was rejected still reaches `onReject` and the announcement.
  function commit(
    next: readonly File[],
    reason: FileInputValueChangeReason,
    event: Event | undefined,
    {
      added = noFiles,
      removed = noFiles,
      rejected = noRejections,
    }: {
      added?: readonly File[]
      removed?: readonly File[]
      rejected?: readonly FileRejection[]
    } = {}
  ) {
    const summary = {
      reason,
      added: [...added],
      removed: [...removed],
      rejected: [...rejected],
    }
    if (dev && options().debug) {
      console.debug(
        `[ui-sdk] file-input#${id} ${added.length} added, ${removed.length} removed, ${rejected.length} rejected (${reason})`
      )
    }
    const differs = !sameValue(store.get().value, next)
    const changed = differs && change("value", [...next], { event, ...summary })
    // After the change, so a handler that clears messages on a change doesn't
    // clear the ones for this batch's rejections.
    if (rejected.length) {
      options().onReject?.(
        summary.rejected,
        createDetails({ reason, event }, changeSource(reason, event), false)
      )
    }
    // A canceled change leaves the input as it was, and says nothing.
    writeInput()
    if (differs && !changed) {
      return false
    }
    if (changed && reason !== "picker" && reason !== "reset") {
      echoChange()
    }
    const { announcement } = options()
    const message = announcement
      ? announcement(summary)
      : describeChange(summary)
    if (message) {
      announce(message)
    }
    return changed
  }

  // Runs files through the rules. With `multiple` they join the value, up to
  // `maxFiles` in all; without it, the first one replaces it, and a batch with
  // nothing accepted keeps the file it has.
  function receive(
    files: readonly File[],
    reason: FileInputValueChangeReason,
    event?: Event
  ) {
    const state = store.get()
    if (isDisabled(state)) {
      return false
    }
    const { accepted, rejected } = validateFiles(files, rules())
    if (!state.multiple && !accepted.length) {
      return commit(state.value, reason, event, { rejected })
    }
    const current = state.multiple ? state.value : noFiles
    const added = accepted.filter((file) => !current.includes(file))
    const removed = state.multiple
      ? noFiles
      : state.value.filter((file) => !added.includes(file))
    return commit([...current, ...added], reason, event, {
      added,
      removed,
      rejected,
    })
  }

  function remove(
    file: File,
    reason: FileInputValueChangeReason = "imperative",
    event?: Event
  ) {
    const state = store.get()
    if (isDisabled(state) || !state.value.includes(file)) {
      return false
    }
    return commit(
      state.value.filter((item) => item !== file),
      reason,
      event,
      { removed: [file] }
    )
  }

  // Replaces the files as they are, without the checks.
  function replace(
    files: readonly File[],
    reason: FileInputValueChangeReason,
    event?: Event
  ) {
    const { value } = store.get()
    return commit(files, reason, event, {
      added: files.filter((file) => !value.includes(file)),
      removed: value.filter((file) => !files.includes(file)),
    })
  }

  const items = () => elements<FileInputItemProps>(context, "item")

  // A removed item's focus goes to the next one, else the one before, else
  // the trigger, once the file has gone. A controlled value comes back by the
  // next microtask, after a press, and one its owner ignored keeps the item and its focus.
  function removeItem(file: File, event?: MouseEvent | KeyboardEvent) {
    const list = items()
    const index = list.findIndex(({ props }) => props.file === file)
    const hadFocus = list[index]?.el.contains(
      list[index].el.ownerDocument.activeElement
    )
    const neighbour = list[index + 1] ?? list[index - 1]
    if (!remove(file, "remove-press", event) || !hadFocus) {
      return
    }
    const moveFocus = () => {
      if (store.get().value.includes(file)) {
        return
      }
      if (neighbour?.el.isConnected) {
        neighbour.el.focus()
      } else {
        element("trigger")?.focus()
      }
    }
    if (options().value === undefined) {
      moveFocus()
    } else {
      queueMicrotask(moveFocus)
    }
  }

  // Arrow keys move between items, and Backspace and Delete remove the focused one.
  function itemKeydown(event: KeyboardEvent, el: HTMLElement, file: File) {
    if (event.target !== el || event.altKey || event.ctrlKey || event.metaKey) {
      return
    }
    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault()
      return removeItem(file, event)
    }
    const list = items().map((item) => item.el)
    const step =
      radioStep(event.key, isRTL(el)) ??
      (event.key === "Home"
        ? "first"
        : event.key === "End"
          ? "last"
          : undefined)
    if (step === undefined) {
      return
    }
    const target = list[moveIndex(list.indexOf(el), step, list.length, false)]
    if (!target) {
      return
    }
    event.preventDefault()
    target.focus()
  }

  const api = {
    getValue: () => store.get().value,
    setValue: (
      files: readonly File[],
      { reason = "imperative", event }: FileInputChangeOptions = {}
    ) => replace(files, reason, event),
    addFiles(
      files: readonly File[] | FileList,
      { reason = "imperative", event }: FileInputChangeOptions = {}
    ) {
      return receive(Array.from(files), reason, event)
    },
    removeFile: (
      file: File,
      { reason = "imperative", event }: FileInputChangeOptions = {}
    ) => remove(file, reason, event),
    clear: ({ reason = "imperative", event }: FileInputChangeOptions = {}) =>
      api.setValue([], { reason, event }),
    open() {
      const state = store.get()
      if (isDisabled(state)) {
        return false
      }
      const el = input()
      if (!el) {
        return false
      }
      el.click()
      return true
    },
    focus: () => element("trigger")?.focus(),
    isDragging: () => Object.keys(store.get().drags).length > 0,
    internal: {
      keyOf: (value: unknown) =>
        value && typeof value === "object" ? fileKey(value) : String(value),
      receive,
      removeItem,
      itemKeydown,
      setActiveItem(key: string) {
        if (store.get().activeItem !== key) {
          store.set({ activeItem: key })
        }
      },
      setDrag(key: string, status: DragStatus | null) {
        const { [key]: current, ...rest } = store.get().drags
        if (current === (status ?? undefined)) {
          return
        }
        store.set({ drags: status ? { ...rest, [key]: status } : rest })
      },
      rules,
      dropzoneProps(key: string) {
        const props: FileInputDropzoneProps =
          context.props("dropzone", key) ?? {}
        return props
      },
      reset() {
        if (!keepsValueOnReset(options().value, options().defaultValue)) {
          replace(store.get().initial, "reset")
        }
      },
      setFormDisabled(formDisabled: boolean) {
        store.set({ formDisabled })
      },
      bindInput(el: HTMLInputElement) {
        writeInput()
        let written = store.get()
        const cleanups = [
          on(el, "change", (event) => {
            if (!echoing) {
              receive(Array.from(el.files ?? []), "picker", event)
            }
          }),
          // A controlled value, a new name or a removal changes what the input holds.
          store.subscribe(() => {
            const state = store.get()
            if (
              state.value === written.value &&
              state.name === written.name &&
              state.required === written.required
            ) {
              return
            }
            written = state
            writeInput()
          }),
          // The form already emptied the input, so there's nothing to write back.
          associate(el, {
            reset: api.internal.reset,
            disabled: api.internal.setFormDisabled,
            focus: api.focus,
            write: () => {},
          }),
        ]
        return () => cleanups.forEach((cleanup) => cleanup())
      },
      // Custom elements submit their files through ElementInternals.
      bindRoot(el: HTMLElement) {
        if (!formInternals(el)) {
          return () => {}
        }
        store.set({ associated: true })
        return bindInternals(el, {
          value: () => {
            const { name, value } = store.get()
            if (!name) {
              return null
            }
            const data = new FormData()
            for (const file of value.length ? value : [noFile()]) {
              data.append(name, file)
            }
            return data
          },
          state: () => "",
          // Files can't be restored after going back.
          restore: () => {},
          valueMissing: () => store.get().required && !store.get().value.length,
          message: () => valueMissingMessage("file"),
          anchor: () => element("trigger"),
          focus: api.focus,
          reset: api.internal.reset,
          disabled: api.internal.setFormDisabled,
          subscribe: store.subscribe,
        })
      },
    },
  }
  return api
}

const fileInputApi: (
  ...args: Parameters<typeof fileInputApiBody>
) => FileInputApi = fileInputApiBody

/**
 * `fileInput`'s api, which its slots and controller call.
 * Adapters expose it as `api`.
 * @stable
 */
interface FileInputApi extends ReturnType<typeof fileInputApiBody> {}

export {
  describeChange,
  type DragStatus,
  type FileInputApi,
  fileInputApi,
  fileKey,
  isDisabled,
  settings,
  type State,
}
