import { trusted } from "../kernel/trusted"
import type { EditorChange, TextEditorAdapter, TextRange } from "./text-editor"

type TextField = HTMLInputElement | HTMLTextAreaElement

const mirrored = [
  "direction",
  "boxSizing",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "fontStyle",
  "fontVariant",
  "fontWeight",
  "fontStretch",
  "fontSize",
  "fontSizeAdjust",
  "lineHeight",
  "fontFamily",
  "fontFeatureSettings",
  "textAlign",
  "textTransform",
  "textIndent",
  "letterSpacing",
  "wordSpacing",
  "tabSize",
  "wordBreak",
  "overflowWrap",
] as const

// Where an offset's caret sits inside a field, relative to its border box at
// scroll 0: a hidden copy of the field lays the text out, and a marker at the
// offset is measured. The field's scrollbar narrows its text, so the copy takes
// the client width, which excludes it.
function measureInMirror(field: TextField, offset: number) {
  const doc = field.ownerDocument
  const style = getComputedStyle(field)
  const mirror = doc.createElement("div")
  const target = mirror.style
  for (const name of mirrored) {
    target[name] = style[name]
  }
  const multiline = field.localName === "textarea"
  target.position = "absolute"
  target.visibility = "hidden"
  target.top = "0"
  target.left = "-9999px"
  target.overflow = "hidden"
  target.boxSizing = "content-box"
  target.borderStyle = "solid"
  target.whiteSpace = multiline ? "pre-wrap" : "pre"
  target.width = `${field.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)}px`
  const marker = doc.createElement("span")
  marker.textContent = "\u200b"
  const value = field.value
  mirror.append(value.slice(0, offset), marker, value.slice(offset))
  doc.body.append(mirror)
  const result = {
    x: marker.offsetLeft,
    y: marker.offsetTop,
    height: marker.offsetHeight,
  }
  mirror.remove()
  return result
}

// Chromium's live value ranges, where they exist, measure a field's text without a mirror.
type ValueRangeField = TextField & {
  createValueRange?: (
    start: number,
    end: number
  ) => { getBoundingClientRect: () => DOMRect }
}

function nativeRect(field: ValueRangeField, offset: number) {
  if (typeof field.createValueRange !== "function") {
    return null
  }
  try {
    const rect = field.createValueRange(offset, offset).getBoundingClientRect()
    if (rect.height === 0 && rect.width === 0 && rect.x === 0 && rect.y === 0) {
      return null
    }
    return { x: rect.x, y: rect.y, width: 0, height: rect.height }
  } catch {
    return null
  }
}

// The rectangle of the caret at `offset`, in viewport coordinates. The mirror's
// measurement is cached by value, offset and width, so reading it every frame
// while a menu is open costs one layout read.
function createCaretRects(field: TextField) {
  let cache: {
    value: string
    offset: number
    width: number
    rect: ReturnType<typeof measureInMirror>
  } | null = null
  return (offset: number) => {
    if (!field.isConnected) {
      return null
    }
    const native = nativeRect(field, offset)
    if (native) {
      return native
    }
    const width = field.clientWidth
    if (
      !cache ||
      cache.value !== field.value ||
      cache.offset !== offset ||
      cache.width !== width
    ) {
      cache = {
        value: field.value,
        offset,
        width,
        rect: measureInMirror(field, offset),
      }
    }
    const box = field.getBoundingClientRect()
    return {
      x: box.left + cache.rect.x - field.scrollLeft,
      y: box.top + cache.rect.y - field.scrollTop,
      width: 0,
      height: cache.rect.height,
    }
  }
}

// Where two texts differ: the range of `before` that was replaced, and what replaced it.
function textDiff(before: string, after: string) {
  let start = 0
  const shortest = Math.min(before.length, after.length)
  while (start < shortest && before[start] === after[start]) {
    start++
  }
  let end = 0
  while (
    end < shortest - start &&
    before[before.length - 1 - end] === after[after.length - 1 - end]
  ) {
    end++
  }
  return {
    range: { start, end: before.length - end },
    inserted: after.slice(start, after.length - end),
  }
}

// Replaces a range as one native edit, so Cmd+Z reverts it. Writing `value` or
// calling setRangeText would empty the browser's undo stack, earlier typing
// included. `execCommand` is the only path all three engines can undo; where
// it's refused, setRangeText is the fallback.
function insertText(field: TextField, range: TextRange, text: string) {
  if (field.ownerDocument.activeElement !== field) {
    field.focus({ preventScroll: true })
  }
  field.setSelectionRange(range.start, range.end)
  let inserted = false
  try {
    inserted =
      text === "" && range.start !== range.end
        ? field.ownerDocument.execCommand("delete", false)
        : field.ownerDocument.execCommand("insertText", false, text)
  } catch {}
  if (inserted) {
    return
  }
  field.setRangeText(text, range.start, range.end, "end")
  field.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      inputType: "insertText",
      data: text,
    })
  )
}

/**
 * The editor adapter for an `<input>` or a `<textarea>`. TriggerMenuInput
 * builds it; use it for a field you render yourself.
 * @stable
 */
function textFieldAdapter(field: TextField) {
  const listeners = new Set<(change: EditorChange) => void>()
  const rectAt = createCaretRects(field)
  let previous = field.value
  let composing = false
  // Our own insertion fires input events, and in WebKit a cancelable
  // beforeinput too. It's reported as a program's edit, never the user's.
  let programmatic = false
  let lastSelection = ""

  const emit = (change: EditorChange) =>
    listeners.forEach((listener) => listener(change))
  const focused = () => field.ownerDocument.activeElement === field

  // During a composition the text from before it stays, so compositionend
  // reports the whole commit: Chrome fires no input after it.
  function onBeforeInput() {
    if (!composing) {
      previous = field.value
    }
  }

  // React reads a controlled field in its own listener at the root, after this one, and
  // microtasks run between a real event's listeners: a render the menu set off first would put
  // the old value back. So the change waits until the event reaches the window.
  function onInput(event: Event) {
    const user = !programmatic && trusted(event)
    const view = field.ownerDocument.defaultView
    if (
      !view ||
      !event.bubbles ||
      !field.isConnected ||
      (!event.composed && field.getRootNode() !== field.ownerDocument)
    ) {
      return readInput(event, user)
    }
    let done = false
    const run = (seen?: Event) => {
      if (done || (seen && seen !== event)) {
        return
      }
      done = true
      view.removeEventListener("input", run)
      readInput(event, user)
    }
    view.addEventListener("input", run)
    // A listener that stopped the event keeps it from the window.
    setTimeout(run)
  }

  function readInput(event: Event, user: boolean) {
    // An input event outside a composition means any composition is over,
    // even when the browser dropped its compositionend.
    if (!(event as InputEvent).isComposing) {
      composing = false
    }
    if (composing) {
      return
    }
    const value = field.value
    const { range, inserted } = textDiff(previous, value)
    previous = value
    emit({
      type: "input",
      range,
      inserted,
      user,
    })
    noteSelection()
  }

  function noteSelection() {
    const key = `${field.selectionStart}:${field.selectionEnd}`
    if (key === lastSelection) {
      return
    }
    lastSelection = key
    emit({ type: "selection" })
  }

  function onCompositionStart() {
    composing = true
    previous = field.value
    emit({ type: "compositionstart" })
  }

  function onCompositionEnd() {
    composing = false
    const value = field.value
    const { range, inserted } = textDiff(previous, value)
    previous = value
    emit({ type: "compositionend" })
    if (range.start !== range.end || inserted) {
      emit({ type: "input", range, inserted, user: true })
    }
  }

  // Selection changes fire on the field itself in current engines. Key and
  // pointer releases catch older ones.
  const selectionEvents = [
    "selectionchange",
    "keyup",
    "pointerup",
    "focus",
  ] as const
  const onBlur = () => {
    composing = false
    lastSelection = ""
    emit({ type: "selection" })
  }

  function attach() {
    field.addEventListener("beforeinput", onBeforeInput)
    field.addEventListener("input", onInput)
    field.addEventListener("compositionstart", onCompositionStart)
    field.addEventListener("compositionend", onCompositionEnd)
    field.addEventListener("blur", onBlur)
    for (const type of selectionEvents) {
      field.addEventListener(type, noteSelection)
    }
  }

  function detach() {
    field.removeEventListener("beforeinput", onBeforeInput)
    field.removeEventListener("input", onInput)
    field.removeEventListener("compositionstart", onCompositionStart)
    field.removeEventListener("compositionend", onCompositionEnd)
    field.removeEventListener("blur", onBlur)
    for (const type of selectionEvents) {
      field.removeEventListener(type, noteSelection)
    }
  }

  return {
    element: field,
    textBefore(length) {
      if (!focused()) {
        return null
      }
      const caret = field.selectionEnd ?? 0
      const offset = Math.max(0, caret - length)
      return { text: field.value.slice(offset, caret), offset }
    },
    selection: () =>
      focused() && field.selectionStart !== null
        ? {
            start: field.selectionStart,
            end: field.selectionEnd ?? field.selectionStart,
          }
        : null,
    rectAt,
    replace(range, content) {
      const text = typeof content === "string" ? content : content.label
      programmatic = true
      try {
        insertText(field, range, text)
      } finally {
        programmatic = false
      }
      previous = field.value
    },
    subscribe(listener) {
      if (!listeners.size) {
        attach()
      }
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
        if (!listeners.size) {
          detach()
        }
      }
    },
    composing: () => composing,
    submit: () => field.form?.requestSubmit(),
  } satisfies TextEditorAdapter
}

export { createCaretRects, insertText, textDiff, textFieldAdapter }
