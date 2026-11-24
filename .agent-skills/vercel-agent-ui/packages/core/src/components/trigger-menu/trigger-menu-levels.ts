// TriggerMenu's match and its levels: the trigger's own, the arguments of a
// chosen item, and a level that continues after an inserted item. It follows
// the editor's edits and caret, remembers dismissed matches, and decides when
// a match starts, changes or ends. Opening, items and announcements belong to
// the state module, which it calls back.
import type {
  EditorChange,
  TextEditorAdapter,
} from "../../foundation/text/text-editor"
import type {
  TriggerArgument,
  TriggerMenuDataItem,
  TriggerMenuOpenChangeReason,
  TriggerMenuQueryChangeReason,
} from "./trigger-menu"
import {
  findTriggerMatch,
  isValidQuery,
  lookBehind,
  mapDismissed,
  type DismissedMatch,
  type TriggerMatch,
  type TriggerRule,
} from "./trigger-match"

/** One level of a match. */
type TriggerLevel = {
  // Which trigger matched.
  rule: number
  match: TriggerMatch
  // Where the current level's query starts.
  queryStart: number
  // The item whose arguments are being typed, and where each one started.
  item?: TriggerMenuDataItem<unknown>
  starts: number[]
  values: Record<string, string>
  // A level after `after: "continue"`, which has no trigger text of its own.
  continued?: boolean
}

// The argument a level asks for, if it's an argument level.
const argumentOf = (level: TriggerLevel | null) =>
  level?.item?.arguments?.[level.starts.length - 1] as
    TriggerArgument | undefined

// The level for a match the trigger itself makes.
// check-code: allow return-type the empty array and object would infer as never[] and {}.
const triggerLevel = (found: {
  rule: number
  match: TriggerMatch
}): TriggerLevel => ({
  rule: found.rule,
  match: found.match,
  queryStart: found.match.start + found.match.trigger.length,
  starts: [],
  values: {},
})

function createTriggerLevels({
  editor,
  rules,
  isWriting,
  apply,
  close,
}: {
  editor: () => TextEditorAdapter | undefined
  rules: () => readonly TriggerRule[]
  // The menu is writing to the editor, so the edits it reports are its own.
  isWriting: () => boolean
  // Shows a level and its query: state, items and whether the list opens.
  apply: (
    level: TriggerLevel,
    query: string,
    reason: TriggerMenuQueryChangeReason,
    open: TriggerMenuOpenChangeReason,
    event?: Event
  ) => void
  // Ends the match and closes the list.
  close: (reason: TriggerMenuOpenChangeReason, event?: Event) => void
}) {
  let current: TriggerLevel | null = null
  let dismissed: DismissedMatch[] = []

  // The caret, or null while the editor is unfocused or has a selection.
  function caret() {
    const selection = editor()?.selection()
    return selection && selection.start === selection.end ? selection.end : null
  }

  // The text between `start` and the caret.
  function textFrom(start: number) {
    const at = caret()
    if (at === null || at < start) {
      return null
    }
    const before = editor()?.textBefore(at - start)
    return before && before.offset === start ? before.text : null
  }

  function matchAtCaret() {
    if (caret() === null) {
      return null
    }
    const before = editor()?.textBefore(lookBehind(rules()))
    return before ? findTriggerMatch(before.text, before.offset, rules()) : null
  }

  function enter(
    level: TriggerLevel,
    query: string,
    reason: TriggerMenuQueryChangeReason,
    open: TriggerMenuOpenChangeReason,
    event?: Event
  ) {
    current = level
    apply(level, query, reason, open, event)
  }

  // Ends the match. Escape also remembers it as dismissed, so it stays closed
  // until its trigger is deleted or retyped.
  function end(
    reason: TriggerMenuOpenChangeReason,
    event?: Event,
    { dismiss = false } = {}
  ) {
    const level = current
    if (dismiss && level && !level.continued) {
      const at = caret() ?? level.match.end
      dismissed.push({
        trigger: level.match.trigger,
        start: level.match.start,
        end: Math.max(at, level.match.end),
      })
    }
    current = null
    close(reason, event)
  }

  // Opens the match at the caret, even a dismissed one, like for a shortcut or a controller.
  function reopen(reason: TriggerMenuOpenChangeReason, event?: Event) {
    const found = matchAtCaret()
    if (!found) {
      return false
    }
    dismissed = dismissed.filter((entry) => entry.start !== found.match.start)
    enter(
      triggerLevel(found),
      found.match.query,
      reason === "shortcut" ? "input-change" : "imperative",
      reason,
      event
    )
    return true
  }

  // An edit moves dismissed matches, then finds the match at the caret. A
  // match opens only when a person's edit touched it: never on focus, a caret
  // move, a program's edit or a collaborator's.
  function onInput(change: Extract<EditorChange, { type: "input" }>) {
    dismissed = dismissed.flatMap(
      (entry) => mapDismissed(entry, change.range, change.inserted.length) ?? []
    )
    if (isWriting() || editor()?.composing()) {
      return
    }
    if (current?.item || current?.continued) {
      return followLevel(change.user)
    }
    const found = matchAtCaret()
    const isDismissed =
      !!found &&
      dismissed.some(
        (entry) =>
          entry.start === found.match.start &&
          entry.trigger === found.match.trigger
      )
    const editEnd = change.range.start + change.inserted.length
    const touched =
      !!found &&
      change.range.start <= found.match.end &&
      editEnd >= found.match.start
    const same =
      !!found &&
      current?.match.start === found.match.start &&
      current.match.trigger === found.match.trigger
    if (!found || isDismissed || (!same && !(change.user && touched))) {
      if (current) {
        end("input-change")
      }
      return
    }
    enter(
      triggerLevel(found),
      found.match.query,
      "input-change",
      "input-change"
    )
  }

  // An argument level or a continued level follows the caret from where it started.
  function followLevel(user: boolean) {
    const level = current!
    const at = caret()
    if (at === null) {
      return end("input-change")
    }
    if (at < level.queryStart) {
      return user ? stepBack() : end("input-change")
    }
    const query = textFrom(level.queryStart) ?? ""
    if (
      query.includes("\n") ||
      (level.continued && !isValidQuery(query, rules()[level.rule]))
    ) {
      return end("input-change")
    }
    enter(
      { ...level, match: { ...level.match, end: at } },
      query,
      "input-change",
      "input-change"
    )
  }

  // Backspace past an argument's start goes back to the previous argument, or to the item.
  function stepBack() {
    const level = current!
    if (level.continued) {
      return end("input-change")
    }
    if (level.starts.length > 1) {
      const starts = level.starts.slice(0, -1)
      const values = { ...level.values }
      delete values[level.item!.arguments![starts.length - 1].name]
      const queryStart = starts.at(-1)!
      return enter(
        { ...level, starts, values, queryStart },
        textFrom(queryStart) ?? "",
        "input-change",
        "input-change"
      )
    }
    current = null
    const found = matchAtCaret()
    if (!found) {
      return end("input-change")
    }
    enter(
      triggerLevel(found),
      found.match.query,
      "input-change",
      "input-change"
    )
  }

  // The caret left the match: closes with `caret-move`. A caret still in the
  // same match stays, which also covers a caret reported before the text.
  function onSelection() {
    if (!current || isWriting()) {
      return
    }
    const at = caret()
    if (at === null || at < current.queryStart) {
      return end("caret-move")
    }
    if (current.item || current.continued) {
      return
    }
    if (matchAtCaret()?.match.start !== current.match.start) {
      end("caret-move")
    }
  }

  return {
    current: () => current,
    caret,
    textFrom,
    matchAtCaret,
    enter,
    end,
    reopen,
    onEditorChange(change: EditorChange) {
      if (change.type === "input") {
        onInput(change)
      } else if (change.type === "selection") {
        onSelection()
      }
    },
  }
}

type TriggerLevels = ReturnType<typeof createTriggerLevels>

export {
  argumentOf,
  createTriggerLevels,
  type TriggerLevel,
  type TriggerLevels,
}
