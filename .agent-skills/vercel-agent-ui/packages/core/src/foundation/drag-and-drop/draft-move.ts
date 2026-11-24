// What every move through a draft shares, in a list, a tree or between lists:
// the draft in state, which renders as the item moves, a drop that commits it
// through the primitive's change and says where it landed, and a cancel that
// puts it back. Focus follows a keyboard move, since the framework moving the
// focused element drops its focus.
import { keepFocus } from "../focus/keep-focus"
import { focusables } from "../focus/tabbable"
import { deriveState } from "../kernel/derive"
import { settleDraft } from "../kernel/draft"
import type { Store } from "../kernel/store"

// What ended a move: a pointer letting go, or a key.
type DropReason = "drag" | "move-key"

function createDraftMove<
  State extends object,
  Draft extends { key: string; pointer: boolean },
  Value,
>({
  store,
  draft: draftKey,
  value: valueKey,
  shown,
  same,
  rebase,
  commit,
  say,
  element,
}: {
  store: Store<State>
  // The state keys of the draft and of the value it commits.
  draft: keyof State & string
  value: keyof State & string
  // The value as the draft shows it.
  shown: (draft: Draft) => Value
  // Whether two values are the same, so a drop that moved nothing commits nothing.
  same: (a: Value, b: Value) => boolean
  // The draft over a value the owner changed mid-move: picked up from it again,
  // put where the user moved it if they did, or null when the item is gone.
  rebase: (draft: Draft, value: Value, moved: boolean) => Draft | null
  // Commits a moved draft. Returns false when the change was canceled.
  commit: (
    draft: Draft,
    details: { reason: DropReason; event?: Event }
  ) => boolean
  // Tells screen readers the item dropped or went back, in the value it's shown in.
  say: (type: "drop" | "cancel", draft: Draft, shownValue: Value) => void
  element: (key: string) => HTMLElement | undefined
}) {
  const draft = () => store.get()[draftKey] as Draft | null
  const value = () => store.get()[valueKey] as Value
  // A dropped draft waits for its value without being held.
  let held = false
  let moved = false
  // Where focus is in an item: on it (-1), or on which of the elements
  // inside it that take focus, like its drag handle.
  const focusIn = (key: string) => {
    const item = element(key)
    const active = item?.ownerDocument.activeElement
    return item && active && item.contains(active)
      ? [...item.querySelectorAll(focusables)].indexOf(active)
      : undefined
  }
  // Read when the item is picked up, since a drag can render it as a new element before it ends.
  let grabbedAt: number | undefined
  const setDraft = (next: Draft | null) => {
    if (next && !draft()) {
      grabbedAt = focusIn(next.key)
    }
    moved = !!next && !!draft()
    held = !!next
    store.set({ [draftKey]: next } as Partial<State>)
  }
  // A framework that renders the item as a new element gets focus in the same place.
  const focusLater = (key: string) => {
    const at = focusIn(key) ?? grabbedAt ?? -1
    keepFocus(() => {
      const item = element(key)
      return item?.querySelectorAll<HTMLElement>(focusables)[at] ?? item
    })
  }

  deriveState({ store }, [draftKey], (state) => {
    const current = state[draftKey] as Draft | null
    if (!current || !held) {
      return
    }
    const next = rebase(current, state[valueKey] as Value, moved)
    if (next && same(shown(next), shown(current))) {
      return
    }
    return { [draftKey]: next } as Partial<State>
  })

  function drop(reason: DropReason, event?: Event) {
    const current = draft()
    if (!current) {
      return
    }
    held = false
    const before = value()
    const changed = !same(shown(current), before)
    if (changed && !commit(current, { reason, event })) {
      setDraft(null)
      say("cancel", current, value())
    } else {
      say("drop", current, shown(current))
      // Keeps the draft until a controlled value's new value arrives.
      if (!changed) {
        setDraft(null)
      } else {
        settleDraft(store, value, before, () => {
          if (draft()?.key === current.key) {
            setDraft(null)
          }
        })
      }
    }
    if (!current.pointer) {
      focusLater(current.key)
    }
  }

  function cancel(refocus = true) {
    const current = draft()
    if (!current) {
      return
    }
    setDraft(null)
    say("cancel", current, value())
    if (!current.pointer && refocus) {
      focusLater(current.key)
    }
  }

  return { draft, value, setDraft, focusLater, drop, cancel }
}

export { createDraftMove }
