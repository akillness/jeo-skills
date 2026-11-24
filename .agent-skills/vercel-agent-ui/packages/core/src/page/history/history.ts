// Hears changes through `observe` and puts values back through the agent
// bridge, so it wires to no control. A change made after seeking back drops
// the entries after it, like undo in an editor.
import { sameValue } from "../../foundation/kernel/store"
import type { createAgent } from "../agent/agent"
import { guardedActions } from "../agent/guard"
import { observe, type ObservedChange } from "../observe/observe"
import { entries as registered, setterOf } from "../observe/registry"

/**
 * One change in the history.
 * @experimental
 */
type HistoryEntry = {
  id: string
  ref: string
  label: string
  key: string
  value: unknown
  /** The value before the change, which stepping back over it restores. */
  previous: unknown
  /** Who made it: `agent`, or how a person did, like `pointer` or `keyboard`. */
  source: string
  reason: string
  /** Reverted by `undoSource`, and left out of the page's state. */
  reverted?: boolean
  /**
   * A password, card or one-time-code field's change, or one inside
   * `data-agent-secret`, whose `value` and `previous` read `"[redacted]"`.
   * Seeking and undoing never put it back, and report it as not put back.
   */
  redacted?: boolean
}

/**
 * What `createHistory` records.
 * @experimental
 */
type HistoryOptions = {
  /** Hears only components inside this element, like one panel. Defaults to the whole page. */
  within?: Element | (() => Element | null | undefined)
  /** Keys worth an entry. @defaultValue ["value", "checked", "pressed"] */
  keys?: string[]
  /**
   * Folds a drag, or a run of key presses, on one control into one entry.
   * False records every step, even of a drag that commits once. @defaultValue true
   */
  coalesce?: boolean
}

const idOf = (change: { ref: string; key: string }) =>
  `${change.ref}:${change.key}`

// A component's value for a key now, like a checkbox's `checked`.
const current = ({ ref, key }: { ref: string; key: string }) =>
  (
    registered.get(ref)?.instance.deref()?.get() as
      Record<string, unknown> | undefined
  )?.[key]
// check-code: allow return-type recursive, so TypeScript cannot infer it.
const round = (value: unknown): unknown =>
  typeof value === "number"
    ? Math.round(value * 100) / 100
    : value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value).map(([key, inner]) => [key, round(inner)])
        )
      : value
// Whether two values are the same, like a date range a setter copied.
const same = (a: unknown, b: unknown) =>
  sameValue(a, b) || JSON.stringify(a) === JSON.stringify(b)
const show = (value: unknown) =>
  Array.isArray(value)
    ? value.join(", ") || "none"
    : typeof value === "object" && value
      ? JSON.stringify(round(value)).replace(/"/g, "")
      : String(round(value))

/**
 * A change in words, like "Agent set Region to Frankfurt".
 * @experimental
 */
function describeEntry(entry: HistoryEntry) {
  return `${entry.source === "agent" ? "Agent" : "You"} set ${entry.label} to ${show(entry.value)}`
}

// A key's value after the first `position` entries, skipping reverted ones.
function valueAt(
  entries: readonly HistoryEntry[],
  position: number,
  id: string
) {
  let value: unknown
  let seen = false
  for (const [index, entry] of entries.entries()) {
    if (idOf(entry) !== id) {
      continue
    }
    if (!seen) {
      value = entry.previous
    }
    seen = true
    if (index >= position) {
      break
    }
    if (!entry.reverted) {
      value = entry.value
    }
  }
  return value
}

/**
 * Starts recording changes, and returns the history. `entries()` and
 * `position()` read it, `subscribe` hears it change, `seek(n)` puts the page
 * back to how it was after `n` entries, and `destroy()` stops recording.
 * Pass an agent with its original `act` method so restoration checks run after permission resolves.
 *
 * ```ts
 * const history = createHistory(agent, { within: () => panel })
 * history.subscribe(() => render(history.entries(), history.position()))
 * await history.seek(0) // the page as it was when recording started
 * await history.undoSource("agent") // only what the agent did
 * ```
 * @experimental
 */
function createHistory(
  agent: ReturnType<typeof createAgent>,
  options: HistoryOptions = {}
) {
  const act = guardedActions.get(agent.act)
  if (!act) {
    throw new Error(
      "createHistory requires an agent with the original act method returned by createAgent."
    )
  }
  const keys = options.keys ?? ["value", "checked", "pressed"]
  let entries: HistoryEntry[] = []
  let position = 0
  let count = 0
  // The keys the running seek or undo is putting back, less any someone else changed meanwhile.
  let restoring = new Set<string>()
  const listeners = new Set<() => void>()
  const emit = () => listeners.forEach((listener) => listener())
  const update = (next: HistoryEntry[], at: number) => {
    entries = next
    position = at
    emit()
  }

  const heard = (observed: ObservedChange) => {
    if (!keys.includes(observed.key)) {
      return
    }
    const id = idOf(observed)
    // The agent changing a key being put back is the history's own write.
    if (observed.source === "agent" && restoring.has(id)) {
      return
    }
    // Anyone else's change is later than the restore, so it stays and the restore leaves that key.
    restoring.delete(id)
    const entry: HistoryEntry = {
      id: `e${++count}`,
      ref: observed.ref,
      label: observed.label ?? observed.component,
      key: observed.key,
      value: observed.value,
      previous: observed.previous,
      source: observed.source,
      reason: observed.reason,
    }
    if (registered.get(observed.ref)?.secret) {
      entry.redacted = true
    }
    // A change made from the past drops the future it replaces.
    const kept = entries.slice(0, position)
    const last = kept[kept.length - 1]
    if (
      options.coalesce !== false &&
      last &&
      !last.reverted &&
      last.ref === entry.ref &&
      last.key === entry.key &&
      last.source === entry.source &&
      last.reason === entry.reason &&
      entry.reason !== "item-press" &&
      entry.reason !== "imperative"
    ) {
      return update(
        [...kept.slice(0, -1), { ...last, value: entry.value }],
        kept.length
      )
    }
    update([...kept, entry], kept.length + 1)
  }
  // A drag that commits arrives settled, as one change, unless every step is wanted.
  const stop = observe(heard, {
    within: options.within,
    live: options.coalesce === false,
  })

  // One act per key, so one that's refused or left the page doesn't stop the
  // rest. Resolves with the ones that didn't go back. A redacted key never
  // does: its values read "[redacted]", which would land in the field.
  const restore = async (
    steps: { ref: string; key: string; value: unknown }[]
  ) => {
    restoring = new Set(steps.map(idOf))
    // An in-progress edit must supersede restoration before its coalesced history entry commits.
    const stopGuard = observe(
      (change) => {
        if (change.source !== "agent") {
          restoring.delete(idOf(change))
        }
      },
      { within: options.within, live: true }
    )
    const redacted = new Set(
      entries.filter((entry) => entry.redacted).map(idOf)
    )
    const failed: typeof steps = []
    try {
      for (const step of steps) {
        const done =
          step.value !== undefined &&
          !redacted.has(idOf(step)) &&
          restoring.has(idOf(step)) &&
          (
            await act(
              [
                {
                  ref: step.ref,
                  action: setterOf(step.key),
                  args: [step.value],
                },
              ],
              () => restoring.has(idOf(step))
            )
          ).ok &&
          // A change callback or a controlled owner can refuse a write the agent still calls done.
          same(current(step), step.value)
        if (!done) {
          failed.push(step)
        }
      }
    } finally {
      stopGuard()
      restoring = new Set()
    }
    return failed
  }

  // One seek or undo at a time, each planned from where the last left the page.
  let turn: Promise<unknown> = Promise.resolve()
  const inTurn = <T>(run: () => Promise<T>) => {
    const next = turn.then(run)
    turn = next.catch(() => {})
    return next
  }

  return {
    /** Every entry, oldest first. */
    entries: () => entries as readonly HistoryEntry[],
    /** How many entries are applied: `entries().length` is now, 0 is the start. */
    position: () => position,
    /** Calls `listener` whenever the entries or the position change, until the returned function runs. */
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    /**
     * Puts the page back to how it was after `to` entries, or forward again,
     * and resolves with the changes it couldn't put back. When none went
     * back, the position stays where it was.
     */
    seek: (to: number) =>
      inTurn(async () => {
        const target = Math.max(0, Math.min(entries.length, to))
        if (target === position) {
          return []
        }
        const from = position
        const before = entries
        // Every key the skipped stretch touched goes to its value at the target.
        const touched = new Map<string, { ref: string; key: string }>()
        for (const entry of entries.slice(
          Math.min(target, from),
          Math.max(target, from)
        )) {
          touched.set(idOf(entry), { ref: entry.ref, key: entry.key })
        }
        // At the target while it writes, so a change made meanwhile drops the future it replaces.
        update(entries, target)
        const failed = await restore(
          [...touched].map(([id, step]) => ({
            ...step,
            value: valueAt(entries, target, id),
          }))
        )
        // Nothing went back and nothing new was recorded, so the page is still where it was.
        if (failed.length === touched.size && entries === before) {
          update(entries, from)
        }
        return failed
      }),
    /**
     * Reverts every applied change one source made, like `"agent"`, keeps the
     * rest, and resolves with the changes it couldn't put back, whose entries
     * stay applied.
     */
    undoSource: (source: string) =>
      inTurn(async () => {
        const undone = new Set<HistoryEntry>()
        const values = new Map<string, unknown>()
        entries.slice(0, position).forEach((entry) => {
          const id = idOf(entry)
          if (!values.has(id)) {
            values.set(id, entry.previous)
          }
          if (entry.reverted) {
            return
          }
          if (entry.source === source) {
            undone.add(entry)
          } else {
            values.set(id, entry.value)
          }
        })
        const touched = new Set([...undone].map(idOf))
        if (!touched.size) {
          return []
        }
        const failed = await restore(
          [...touched].map((id) => {
            const [ref, key] = id.split(":")
            return { ref, key, value: values.get(id) }
          })
        )
        const stayed = new Set(failed.map(idOf))
        update(
          entries.map((entry) =>
            undone.has(entry) && !stayed.has(idOf(entry))
              ? { ...entry, reverted: true }
              : entry
          ),
          position
        )
        return failed
      }),
    /** Forgets every entry, keeping the page as it is. */
    clear() {
      update([], 0)
    },
    /** Stops recording. */
    destroy() {
      stop()
      listeners.clear()
    },
  }
}

export { stageChanges, type StagedChange } from "./stage"

export { createHistory, describeEntry, type HistoryEntry, type HistoryOptions }
