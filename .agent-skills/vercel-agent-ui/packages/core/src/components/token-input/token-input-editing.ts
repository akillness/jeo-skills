// TokenInput's editing: what the browser is about to do, and what it did,
// turned into edits of the value. Typing at a caret goes through natively, so
// spelling, autocorrect and input methods keep working, and the input event
// reads it back. Everything that would touch a token, every deletion, new
// lines, paste, drop, cut and undo are cancelled and applied to the value, so
// one keystroke removes one token in every engine and the history is ours.
import { isComposing } from "../../foundation/kernel/events"
import { isRTL } from "../../foundation/platform/env"
import { isApple } from "../../foundation/platform/platform"
import type { TextRange, Token } from "../../foundation/text/text-editor"
import {
  fromText,
  lineBoundary,
  offsetText,
  replaceRange,
  sliceValue,
  toLabel,
  toText,
  tokenAt,
  valueLength,
  wordBoundary,
  type TokenInputValue,
} from "./token-input-model"
import type { TokenInputApi } from "./token-input-api"
import type { TokenView } from "./token-input-view"

const escapeHtml = (text: string) =>
  text.replace(/[&<>"]/g, (char) => `&#${char.charCodeAt(0)};`)
const unescapeHtml = (text: string) =>
  text.replace(/&(#\d+|quot|amp|lt|gt);/g, (_, code: string) =>
    code[0] === "#"
      ? String.fromCharCode(Number(code.slice(1)))
      : { quot: '"', amp: "&", lt: "<", gt: ">" }[code]!
  )

// How many offsets a character before or after `offset` spans: two for a surrogate pair.
function charLength(text: string, offset: number, direction: -1 | 1) {
  const code = text.charCodeAt(direction < 0 ? offset - 1 : offset)
  const surrogate =
    direction < 0
      ? code >= 0xdc00 && code <= 0xdfff
      : code >= 0xd800 && code <= 0xdbff
  return surrogate ? 2 : 1
}

// Where a deletion from `at` ends: a character, a word or a line away.
function deletionTarget(
  type: string,
  value: TokenInputValue,
  at: number,
  direction: -1 | 1
) {
  if (type.includes("Word")) {
    return wordBoundary(value, at, direction)
  }
  if (type.includes("Line")) {
    return lineBoundary(value, at, direction)
  }
  return at + direction * charLength(offsetText(value), at, direction)
}

function bindTokenEditing(
  el: HTMLElement,
  view: TokenView,
  api: TokenInputApi
) {
  const { internal } = api
  const doc = el.ownerDocument
  // Where the last typing or deletion left the caret. An edit anywhere else starts a new undo step.
  let lastEnd = -1
  let afterSpace = false
  // The selection a drag started from inside the editor.
  let dragged: TextRange | null = null
  // A token the first Backspace selected, for `tokenDeletion: "select"`.
  let armed: string | null = null

  const value = () => internal.latest()

  function edit(
    next: TokenInputValue,
    selection: TextRange,
    details: {
      reason: "input-change" | "paste" | "drop" | "cut"
      event?: Event
      inputType?: string
      group?: string
      at?: number
    }
  ) {
    if (details.group && details.at !== undefined && details.at !== lastEnd) {
      internal.seal()
    }
    internal.commit(next, { ...details, selection })
    lastEnd = details.group ? selection.end : -1
  }

  // Backspace, Delete and their word and line forms, applied to the value.
  function remove(type: string, range: TextRange, event: InputEvent) {
    const current = value()
    if (range.start !== range.end) {
      armed = null
      return edit(
        replaceRange(current, range, []),
        internal.caretAt(range.start),
        {
          reason: type === "deleteByCut" ? "cut" : "input-change",
          event,
          inputType: type,
        }
      )
    }
    const direction = type.includes("Backward") ? -1 : 1
    const at = range.start
    const neighbour = direction < 0 ? at - 1 : at
    const token = tokenAt(current, neighbour)
    if (token && /^delete(Content|Word)/.test(type)) {
      return removeToken(token, neighbour, event, type)
    }
    armed = null
    const target = Math.max(
      0,
      Math.min(
        deletionTarget(type, current, at, direction),
        valueLength(current)
      )
    )
    if (target === at) {
      return
    }
    const start = Math.min(at, target)
    edit(
      replaceRange(current, { start, end: Math.max(at, target) }, []),
      internal.caretAt(start),
      {
        reason: "input-change",
        event,
        inputType: type,
        group: "delete",
        at,
      }
    )
  }

  // One keystroke on a token: removes it, selects it first, or turns it back into its text.
  function removeToken(
    token: Token,
    offset: number,
    event: InputEvent,
    inputType: string
  ) {
    const current = value()
    const tokenId = token.id!
    const policy = internal.options().tokenDeletion ?? "whole"
    const range = { start: offset, end: offset + 1 }
    if (policy === "select" && armed !== tokenId) {
      armed = tokenId
      view.select(range)
      internal.say(
        `${token.label}, ${internal.describe(token)}, selected. Press Backspace again to remove it`
      )
      return
    }
    armed = null
    // Reverted, a token is its trigger and label again, so a trigger menu opens on it.
    const text =
      policy === "revert"
        ? `${(token.data?.trigger as string | undefined) ?? ""}${token.label}`
        : ""
    const replacement = text ? [text] : []
    const end = offset + text.length
    edit(replaceRange(current, range, replacement), internal.caretAt(end), {
      reason: "input-change",
      event,
      inputType,
    })
  }

  function onBeforeInput(event: InputEvent) {
    const type = event.inputType
    if (!internal.editable()) {
      return event.preventDefault()
    }
    if (type === "historyUndo" || type === "historyRedo") {
      event.preventDefault()
      return type === "historyUndo"
        ? internal.undo(event)
        : internal.redo(event)
    }
    // Composition is never cancelled: the input method owns it until it ends.
    if (type === "insertCompositionText" || internal.composing()) {
      return
    }
    const range = view.selection()
    if (!range) {
      return
    }
    const anchor = doc.getSelection()?.anchorNode ?? null
    if (type === "insertText" || type === "insertReplacementText") {
      const text = event.data ?? event.dataTransfer?.getData("text/plain") ?? ""
      const target = targetRange(event) ?? range
      // Typing at a caret in text goes through, so the input event reads it.
      if (
        type === "insertText" &&
        target.start === target.end &&
        !view.inHost(anchor)
      ) {
        return
      }
      event.preventDefault()
      return insertText(text, target, event)
    }
    event.preventDefault()
    if (type === "insertParagraph" || type === "insertLineBreak") {
      return insertText("\n", range, event)
    }
    if (type.startsWith("delete")) {
      return remove(type, range, event)
    }
    // Paste, drop and cut have events of their own. Formatting and anything else stays out.
    if (type === "insertFromYank") {
      insertText(event.data ?? "", range, event)
    }
  }

  // The range an input event replaces, like an autocorrected word, when it isn't the selection.
  function targetRange(event: InputEvent) {
    const [target] = event.getTargetRanges?.() ?? []
    if (!target) {
      return null
    }
    return {
      start: view.offsetAt(target.startContainer, target.startOffset),
      end: view.offsetAt(target.endContainer, target.endOffset),
    }
  }

  function insertText(text: string, range: TextRange, event: InputEvent) {
    // A new word starts a new undo step.
    if (afterSpace && /\S/.test(text)) {
      internal.seal()
    }
    afterSpace = /\s$/.test(text)
    edit(
      replaceRange(value(), range, [text]),
      internal.caretAt(range.start + text.length),
      {
        reason: "input-change",
        event,
        inputType: event.inputType,
        group: "insert",
        at: range.start,
      }
    )
  }

  // Typing the browser applied: read it back.
  function onInput(event: Event) {
    if (internal.composing() || (event as InputEvent).isComposing) {
      return
    }
    reconcile(event as InputEvent)
  }

  function reconcile(event?: InputEvent) {
    // What an input method committed into a read-only input comes back out.
    if (!internal.editable()) {
      return view.render(value())
    }
    const next = view.read()
    const selection = view.selection() ?? internal.caretAt(valueLength(next))
    const text = event?.data ?? ""
    if (afterSpace && /\S/.test(text)) {
      internal.seal()
    }
    if (text) {
      afterSpace = /\s$/.test(text)
    }
    edit(next, selection, {
      reason: "input-change",
      event,
      inputType: event?.inputType,
      group: event ? "insert" : undefined,
      at: selection.end - text.length,
    })
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.defaultPrevented || isComposing(event)) {
      return
    }
    const mod = isApple() ? event.metaKey : event.ctrlKey
    const key = event.key.toLowerCase()
    if (mod && !event.altKey && key === "z") {
      event.preventDefault()
      if (!internal.editable()) {
        return
      }
      return event.shiftKey ? internal.redo(event) : internal.undo(event)
    }
    if (!isApple() && event.ctrlKey && key === "y") {
      event.preventDefault()
      if (internal.editable()) {
        internal.redo(event)
      }
      return
    }
    if (
      (event.key === "ArrowLeft" || event.key === "ArrowRight") &&
      !event.shiftKey &&
      !mod &&
      !event.altKey
    ) {
      return crossToken(event)
    }
    // Formatting has no place in plain text, and WebKit and Firefox send no beforeinput for it.
    if (mod && (key === "b" || key === "i" || key === "u")) {
      return event.preventDefault()
    }
    if (event.key === "Enter") {
      const shortcut = internal.options().submitShortcut ?? "enter"
      const submits =
        shortcut === "enter"
          ? !event.shiftKey && !mod && !event.altKey
          : mod && !event.shiftKey
      // With nothing to submit, Enter is left to start a new line.
      if (!submits || !internal.canSubmit()) {
        return
      }
      event.preventDefault()
      internal.submit(event)
    }
  }

  // An arrow next to a token moves past it in one press. The anchors around a
  // host are caret stops of their own to the browser, which would cost one more.
  function crossToken(event: KeyboardEvent) {
    const range = view.selection()
    if (!range || range.start !== range.end) {
      return
    }
    const forward = (event.key === "ArrowRight") !== isRTL(el)
    const target = forward ? range.end : range.start - 1
    if (!tokenAt(value(), target)) {
      return
    }
    event.preventDefault()
    view.select(internal.caretAt(forward ? target + 1 : target))
  }

  function writeClipboard(data: DataTransfer | null, range: TextRange) {
    if (!data) {
      return
    }
    const part = sliceValue(value(), range.start, range.end)
    const text = toText(part, internal.codec())
    data.setData(
      "text/plain",
      internal.options().copy === "label" ? toLabel(part) : text
    )
    // The codec text rides in an attribute, so a paste into a token input gets the tokens back.
    data.setData(
      "text/html",
      `<span data-ui-tokens="${escapeHtml(text)}">${escapeHtml(toLabel(part))}</span>`
    )
  }

  function readClipboard(data: DataTransfer | null) {
    if (!data) {
      return []
    }
    const tokens = /data-ui-tokens="([^"]*)"/.exec(data.getData("text/html"))
    return fromText(
      tokens ? unescapeHtml(tokens[1]) : data.getData("text/plain"),
      internal.codec()
    )
  }

  function onCopy(event: ClipboardEvent) {
    const range = view.selection()
    if (!range || range.start === range.end) {
      return
    }
    event.preventDefault()
    writeClipboard(event.clipboardData, range)
  }

  function onCut(event: ClipboardEvent) {
    const range = view.selection()
    if (!range || range.start === range.end) {
      return
    }
    event.preventDefault()
    if (!internal.editable()) {
      return
    }
    writeClipboard(event.clipboardData, range)
    edit(replaceRange(value(), range, []), internal.caretAt(range.start), {
      reason: "cut",
      event,
    })
  }

  function onPaste(event: ClipboardEvent) {
    event.preventDefault()
    const range = view.selection()
    if (!range || !internal.editable()) {
      return
    }
    const content = readClipboard(event.clipboardData)
    // An image or a file has no text, and leaves the selection alone.
    if (!content.length) {
      return
    }
    edit(
      replaceRange(value(), range, content),
      internal.caretAt(range.start + valueLength(content)),
      {
        reason: "paste",
        event,
      }
    )
  }

  function onDragStart(event: DragEvent) {
    const range = view.selection()
    if (!range || range.start === range.end) {
      return
    }
    dragged = range
    writeClipboard(event.dataTransfer, range)
  }

  // A drag that ends outside the editor, or is cancelled, moves nothing here.
  function onDragEnd() {
    dragged = null
  }

  function onDrop(event: DragEvent) {
    event.preventDefault()
    const source = dragged
    dragged = null
    if (!internal.editable()) {
      return
    }
    const point = pointFrom(event)
    let at = point ? view.offsetAt(point[0], point[1]) : valueLength(value())
    const content = readClipboard(event.dataTransfer)
    let current = value()
    // A drag inside the editor moves the text, unless it's dropped onto itself.
    if (source && !(event.ctrlKey || event.altKey)) {
      if (at > source.start && at < source.end) {
        return
      }
      current = replaceRange(current, source, [])
      if (at >= source.end) {
        at -= source.end - source.start
      }
    }
    edit(
      replaceRange(current, internal.caretAt(at), content),
      internal.caretAt(at + valueLength(content)),
      {
        reason: "drop",
        event,
      }
    )
  }

  // The DOM point under the pointer, in whichever form the engine offers.
  // check-code: allow return-type TypeScript would infer an array instead of a tuple.
  function pointFrom(event: DragEvent): [Node, number] | null {
    const position = (
      doc as Document & {
        caretPositionFromPoint?: (
          x: number,
          y: number
        ) => { offsetNode: Node; offset: number } | null
      }
    ).caretPositionFromPoint?.(event.clientX, event.clientY)
    if (position) {
      return [position.offsetNode, position.offset]
    }
    const range = doc.caretRangeFromPoint?.(event.clientX, event.clientY)
    return range ? [range.startContainer, range.startOffset] : null
  }

  function onCompositionStart() {
    internal.setComposing(true)
  }

  // The committed text is read back as one step of its own.
  function onCompositionEnd() {
    internal.setComposing(false)
    internal.seal()
    reconcile()
    internal.seal()
  }

  // A caret inside a token's host moves to its edge, and a selection that
  // touches a token covers all of it.
  function onSelectionChange() {
    const selected = doc.getSelection()
    if (!selected?.rangeCount || !el.contains(selected.anchorNode)) {
      return
    }
    const range = view.selection()
    if (!range) {
      return
    }
    if (view.inHost(selected.anchorNode) || view.inHost(selected.focusNode)) {
      view.select(range)
    }
    if (
      armed &&
      !(
        range.end - range.start === 1 &&
        tokenAt(value(), range.start)?.id === armed
      )
    ) {
      armed = null
    }
    internal.setSelection(range)
  }

  function onFocus() {
    internal.setFocused(true)
    internal.setSelection(view.selection())
  }

  // A dropped compositionend can't leave the editor stuck composing.
  function onBlur() {
    if (internal.composing()) {
      internal.setComposing(false)
    }
    internal.setFocused(false)
  }

  const listeners: [EventTarget, string, EventListener][] = [
    [el, "beforeinput", onBeforeInput as EventListener],
    [el, "input", onInput],
    [el, "keydown", onKeyDown as EventListener],
    [el, "copy", onCopy as EventListener],
    [el, "cut", onCut as EventListener],
    [el, "paste", onPaste as EventListener],
    [el, "dragstart", onDragStart as EventListener],
    [el, "dragend", onDragEnd],
    [el, "drop", onDrop as EventListener],
    [el, "compositionstart", onCompositionStart],
    [el, "compositionend", onCompositionEnd],
    [el, "focus", onFocus],
    [el, "blur", onBlur],
    [doc, "selectionchange", onSelectionChange],
  ]
  for (const [target, type, listener] of listeners) {
    target.addEventListener(type, listener)
  }
  if (doc.activeElement === el) {
    onFocus()
  }
  return () => {
    for (const [target, type, listener] of listeners) {
      target.removeEventListener(type, listener)
    }
  }
}

export { bindTokenEditing }
