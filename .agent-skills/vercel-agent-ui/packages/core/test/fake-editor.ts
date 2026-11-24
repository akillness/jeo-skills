import type {
  EditorChange,
  TextEditorAdapter,
  TokenInsert,
} from "../src/foundation/text/text-editor"

// A plain-text editor with a caret, driven by the test like a user would type.
function fakeEditor() {
  let text = ""
  let caret = 0
  const listeners = new Set<(change: EditorChange) => void>()
  const emit = (change: EditorChange) =>
    listeners.forEach((listener) => listener(change))
  const replaced: (string | TokenInsert)[] = []
  const editor: TextEditorAdapter & {
    type: (chars: string, options?: { user?: boolean }) => void
    backspace: () => void
    moveCaret: (to: number) => void
    readonly text: string
    replaced: (string | TokenInsert)[]
  } = {
    element: undefined,
    textBefore: (length) => {
      const offset = Math.max(0, caret - length)
      return { text: text.slice(offset, caret), offset }
    },
    selection: () => ({ start: caret, end: caret }),
    rectAt: () => null,
    replace(range, content) {
      replaced.push(content)
      const inserted = typeof content === "string" ? content : content.label
      text = text.slice(0, range.start) + inserted + text.slice(range.end)
      caret = range.start + inserted.length
      emit({ type: "input", range, inserted, user: false })
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    composing: () => false,
    type(chars, { user = true } = {}) {
      const range = { start: caret, end: caret }
      text = text.slice(0, caret) + chars + text.slice(caret)
      caret += chars.length
      emit({ type: "input", range, inserted: chars, user })
    },
    backspace() {
      const range = { start: caret - 1, end: caret }
      text = text.slice(0, caret - 1) + text.slice(caret)
      caret--
      emit({ type: "input", range, inserted: "", user: true })
    },
    moveCaret(to) {
      caret = to
      emit({ type: "selection" })
    },
    get text() {
      return text
    },
    replaced,
  }
  return editor
}

export { fakeEditor }
