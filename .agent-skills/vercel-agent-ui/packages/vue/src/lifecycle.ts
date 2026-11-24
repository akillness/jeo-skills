import {
  getCurrentInstance,
  onActivated,
  onDeactivated,
  shallowRef,
  watch,
  type ComponentInternalInstance,
  type SuspenseBoundary,
} from "vue"

// Vue marks only a cached page's root as deactivated, so a component made
// while its page is away, like a dialog a controller opens, looks up.
function inDeactivatedPage(instance: ComponentInternalInstance | null) {
  for (let current = instance; current; current = current.parent) {
    if (current.isDeactivated) {
      return true
    }
  }
  return false
}

/** Whether a `<KeepAlive>` keeps the component's page away, as a ref. Call in `setup`. */
function useKeptAway() {
  const isAway = shallowRef(inDeactivatedPage(getCurrentInstance()))
  onDeactivated(() => (isAway.value = true))
  onActivated(() => (isAway.value = false))
  return isAway
}

type PartRef = (el: HTMLElement | null) => void

/**
 * Binds an instance's parts to their elements as Vue hands them over, and
 * lets go of the page while a `<KeepAlive>` keeps the component away, so a
 * cached open dialog stops locking scroll, then binds them again, its state
 * kept. Returns the ref to give each part's element.
 */
function useBindings() {
  const bound = new Map<PartRef, HTMLElement>()
  const isAway = useKeptAway()
  // Follows `isAway` once Vue has updated the page. A popup binds only once
  // Vue has moved it back into its container, since a browser takes a popover
  // out of the top layer when it moves, so refs Vue calls before then wait.
  let isReleased = isAway.value
  watch(
    isAway,
    () => {
      isReleased = isAway.value
      bound.forEach((el, ref) => ref(isReleased ? null : el))
    },
    { flush: "post" }
  )
  // Cached, so a part's ref stays the same across renders and Vue never
  // detaches it. One per component rendering the part, since a part can move
  // to another component in one update, like a command whose group is keyed
  // by its index. Vue mounts the new one before it unmounts the old one.
  const refs = new WeakMap<object, WeakMap<PartRef, (el: unknown) => void>>()
  // Vue never calls a ref it swapped out with null, so a part keyed anew on
  // the same element, like a label given another id, lets go of the old one.
  const held = new WeakMap<HTMLElement, Map<string, PartRef>>()
  const outside = {}
  return (ref: PartRef, slot: string) => {
    const owner = getCurrentInstance() ?? outside
    let own = refs.get(owner)
    if (!own) {
      refs.set(owner, (own = new WeakMap()))
    }
    let wrapped = own.get(ref)
    if (wrapped) {
      return wrapped
    }
    // Vue's own types leave the instance's Suspense out, though it's there.
    const suspense = (owner as { suspense?: SuspenseBoundary | null }).suspense
    // The element this component handed over.
    let mine: HTMLElement | null = null
    wrapped = (value) => {
      // Components hand refs their instance. Parts need the element.
      const el = (
        value && typeof value === "object" && "$el" in value ? value.$el : value
      ) as HTMLElement | null
      if (!el) {
        const last = mine
        mine = null
        // Another component's element took the part since, so it stays bound.
        if (bound.get(ref) !== last) {
          return
        }
        bound.delete(ref)
        return ref(null)
      }
      let slots = held.get(el)
      if (!slots) {
        held.set(el, (slots = new Map()))
      }
      const previous = slots.get(slot)
      slots.set(slot, ref)
      if (previous && previous !== ref && bound.get(previous) === el) {
        bound.delete(previous)
        if (!isReleased) {
          previous(null)
        }
      }
      mine = el
      bound.set(ref, el)
      if (isReleased) {
        return
      }
      // Vue calls refs as it renders, and a Suspense renders its pending
      // branch off the page, where a popup can't open. Its elements bind with
      // the effects Vue holds back until the branch shows.
      if (suspense?.pendingBranch) {
        suspense.effects.push(() => bound.get(ref) === el && ref(el))
      } else {
        ref(el)
      }
    }
    own.set(ref, wrapped)
    return wrapped
  }
}

export { useBindings, useKeptAway }
