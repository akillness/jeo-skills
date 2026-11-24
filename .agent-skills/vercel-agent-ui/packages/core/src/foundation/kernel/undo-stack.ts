// An undo stack whose entries group: typing runs into one entry until a pause,
// a new word, or an edit of another kind. Framework-free and pure apart from
// the clock, which callers can pass in.

/**
 * How an undo stack keeps entries.
 * @experimental
 */
type UndoStackOptions = {
  /**
   * How many entries are kept.
   * @defaultValue 100
   */
  limit?: number
  /**
   * Milliseconds of pause after which typing starts a new entry.
   * @defaultValue 500
   */
  groupDelay?: number
}

const defaults: UndoStackOptions = {}

/**
 * An undo stack for any state: a board's columns, a drawing, a form. Record
 * the state after each edit; `undo` and `redo` return the state to show.
 * Edits of one `group` within `groupDelay` join one entry, like a run of
 * typing or a drag's steps.
 *
 * ```ts
 * const stack = createUndoStack(lists)
 * stack.record(next) // after each change
 * if (matchesShortcut(event, "mod+z")) show(stack.undo())
 * ```
 *
 * `options` can be a getter, read on every edit, so a limit or delay set
 * after creation, like a web component's `history` property, applies.
 * @experimental
 */
function createUndoStack<State>(
  initial: State,
  options: UndoStackOptions | (() => UndoStackOptions | undefined) = defaults
) {
  const settings = () =>
    (typeof options === "function" ? options() : options) ?? defaults
  let entries = [initial]
  let index = 0
  // The kind and time of the last edit that can take more into its entry.
  let open: { group: string; time: number } | null = null

  return {
    /**
     * Records the state after an edit. Edits of the same `group`, like
     * "insert" or "delete", join the last entry while they come within
     * `groupDelay` of each other. Without a group, the edit is its own entry.
     */
    record(
      state: State,
      { group, time = Date.now() }: { group?: string; time?: number } = {}
    ) {
      const { limit = 100, groupDelay = 500 } = settings()
      entries = entries.slice(0, index + 1)
      const joins =
        !!group && open?.group === group && time - open.time < groupDelay
      if (joins) {
        entries[index] = state
      } else {
        entries.push(state)
        if (entries.length > limit + 1) {
          entries.shift()
        }
        index = entries.length - 1
      }
      open = group ? { group, time } : null
    },
    /** Ends the open group, so the next edit starts an entry, like after a caret jump. */
    seal() {
      open = null
    },
    /** Steps back, and returns the state to show, or `undefined` at the first entry. */
    undo() {
      open = null
      if (index === 0) {
        return undefined
      }
      return entries[--index]
    },
    /** Steps forward again, and returns the state to show, or `undefined` at the last entry. */
    redo() {
      open = null
      if (index === entries.length - 1) {
        return undefined
      }
      return entries[++index]
    },
    /** Whether there's an entry to step back to. */
    canUndo: () => index > 0,
    /** Whether there's an entry to step forward to. */
    canRedo: () => index < entries.length - 1,
    /** Rewrites every entry, like a token's status changing everywhere without an entry of its own. */
    map(update: (state: State) => State) {
      entries = entries.map(update)
    },
    /** Starts over from `state`, like after a controlled value from outside. */
    reset(state: State) {
      entries = [state]
      index = 0
      open = null
    },
  }
}

export { createUndoStack, type UndoStackOptions }
