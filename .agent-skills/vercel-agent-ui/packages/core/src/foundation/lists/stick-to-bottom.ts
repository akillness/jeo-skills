// Keeping a growing log scrolled to its end: a chat streaming a reply, a build
// log, a terminal. While the reader is at the bottom it follows new content;
// once they scroll up it stops, so they can read, and says how far behind
// they are; scrolling back down, or `scrollToBottom`, follows again. Older
// content loaded above keeps what's in view still, in every browser.

/**
 * Where a log stands.
 * @experimental
 */
type StickToBottomState = {
  /** Whether new content scrolls into view. */
  following: boolean
  /** Whether the end is in view now. */
  atBottom: boolean
  /** Whether content arrived below while not following. Clears at the bottom. */
  unseen: boolean
}

/**
 * How `createStickToBottom` follows.
 * @experimental
 */
type StickToBottomOptions = {
  /** How close to the end, in pixels, still counts as at the bottom. @defaultValue 24 */
  threshold?: number
  /** Whether it follows from the start. @defaultValue true */
  initial?: boolean
  /** Runs when `get()` changes. */
  onChange?: (state: StickToBottomState) => void
}

/**
 * Follows a scroller's end as its content grows. Connect it to the scroller
 * once it mounts; it watches the scroller's children grow, so content that
 * streams in, like a reply typed out a word at a time, keeps the end in view:
 *
 * ```ts
 * const log = createStickToBottom({ onChange: render })
 * const disconnect = log.connect(scroller)
 * // A "Jump to latest" button while !log.get().following:
 * button.onclick = () => log.scrollToBottom({ behavior: "smooth" })
 * // Before adding older messages above:
 * log.prepend()
 * ```
 * @experimental
 */
function createStickToBottom(options: StickToBottomOptions = {}) {
  let state: StickToBottomState = {
    following: options.initial ?? true,
    atBottom: true,
    unseen: false,
  }
  const listeners = new Set<() => void>()
  let scroller: HTMLElement | undefined
  // The scroll position this module set last, so its own scrolls don't read as the reader's.
  let ours: number | null = null
  let lastTop = 0
  let lastHeight = 0
  // The distance from the end saved by `prepend`, kept until content grows.
  let anchor: number | null = null
  // The first row in view while not following, and where it sits in the content.
  let pinned: { row: Element; top: number } | undefined

  const threshold = () => options.threshold ?? 24
  const distance = (el: HTMLElement) =>
    el.scrollHeight - el.clientHeight - el.scrollTop

  function set(next: Partial<StickToBottomState>) {
    const merged = { ...state, ...next }
    if (merged.atBottom) {
      merged.unseen = false
    }
    if (
      merged.following === state.following &&
      merged.atBottom === state.atBottom &&
      merged.unseen === state.unseen
    ) {
      return
    }
    state = merged
    options.onChange?.(state)
    for (const listener of [...listeners]) {
      listener()
    }
  }

  // Rows can sit in a wrapper of their own, like Scroll Area's content.
  const rowsOf = (el: Element) => {
    let parent = el
    while (parent.children.length === 1 && parent.children[0].children.length) {
      parent = parent.children[0]
    }
    return parent
  }

  // In content coordinates, so a scroll the page makes itself isn't a row moving.
  const offset = (el: HTMLElement, row: Element) =>
    row.getBoundingClientRect().top -
    el.getBoundingClientRect().top +
    el.scrollTop

  function pin(el: HTMLElement) {
    pinned = undefined
    if (state.following) {
      return
    }
    const rows = rowsOf(el).children
    const box = el.getBoundingClientRect()
    let found: { row: Element; rect: DOMRect } | undefined
    let low = 0
    let high = rows.length - 1
    while (low <= high) {
      const middle = (low + high) >> 1
      // A row that draws no box, like a hidden one, can't say where it is.
      let probe = middle
      while (probe <= high && !rows[probe].getClientRects().length) {
        probe++
      }
      if (probe > high) {
        high = middle - 1
        continue
      }
      const rect = rows[probe].getBoundingClientRect()
      if (rect.bottom <= box.top) {
        low = probe + 1
      } else {
        found = { row: rows[probe], rect }
        high = middle - 1
      }
    }
    if (found && found.rect.top < box.bottom) {
      pinned = {
        row: found.row,
        top: found.rect.top - box.top + el.scrollTop,
      }
    }
  }

  function toEnd(el: HTMLElement, behavior?: ScrollBehavior) {
    const top = el.scrollHeight - el.clientHeight
    ours = Math.max(0, Math.round(top))
    if (behavior === "smooth") {
      el.scrollTo({ top, behavior })
    } else {
      el.scrollTop = top
    }
  }

  function resized() {
    const el = scroller
    if (!el) {
      return
    }
    let unseen = false
    if (anchor !== null && el.scrollHeight !== lastHeight) {
      // Older content went in above: keep the same distance from the end.
      ours = Math.round(el.scrollHeight - el.clientHeight - anchor)
      el.scrollTop = ours
      anchor = null
    } else if (state.following) {
      toEnd(el)
    } else {
      // The browser's own anchoring is off, and Safari has none.
      const moved =
        pinned && el.contains(pinned.row)
          ? offset(el, pinned.row) - pinned.top
          : 0
      if (Math.abs(moved) >= 1) {
        // Content that shrank below the scroll position pulled it back already.
        const clamped = el.scrollTop < lastTop && distance(el) < 1
        ours = Math.round((clamped ? lastTop : el.scrollTop) + moved)
        el.scrollTop = ours
      }
      unseen = el.scrollHeight - moved > lastHeight
    }
    lastHeight = el.scrollHeight
    lastTop = el.scrollTop
    pin(el)
    // One change, so content that pushes the end out of view stays unseen.
    set({ atBottom: distance(el) <= threshold(), ...(unseen && { unseen }) })
  }

  function scrolled() {
    const el = scroller
    if (!el) {
      return
    }
    const top = el.scrollTop
    const atBottom = distance(el) <= threshold()
    const mine = ours !== null && Math.abs(top - ours) <= 1
    if (mine) {
      // Our own scroll, or the browser finishing it smoothly.
      if (atBottom) {
        ours = null
      }
    } else if (top < lastTop - 1 && !atBottom) {
      set({ following: false })
    } else if (atBottom) {
      set({ following: true })
    }
    lastTop = top
    set({ atBottom })
    pin(el)
  }

  const api = {
    /** Where the log stands now. Same object until something changes. */
    get: () => state,
    /** Calls `listener` whenever `get()` changes, until the returned function runs. */
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    /**
     * Follows `el`'s end, watching its children's size, until the returned
     * function runs. Turns the browser's own scroll anchoring off on it, which
     * would fight the following.
     */
    connect(el: HTMLElement) {
      scroller = el
      el.style.setProperty("overflow-anchor", "none")
      const view = el.ownerDocument.defaultView
      const sizes = view?.ResizeObserver
        ? new view.ResizeObserver(resized)
        : undefined
      const watch = () => {
        sizes?.disconnect()
        sizes?.observe(el)
        for (const child of el.children) {
          sizes?.observe(child)
        }
      }
      watch()
      // Children come and go; each new one is watched as it arrives.
      const children = view?.MutationObserver
        ? new view.MutationObserver(() => {
            watch()
            observeRows()
            resized()
          })
        : undefined
      const observeRows = () => {
        children?.disconnect()
        for (let parent: Element = el; ; parent = parent.children[0]) {
          children?.observe(parent, { childList: true })
          if (parent.children.length !== 1) {
            break
          }
        }
      }
      observeRows()
      // A wheel or touch going up stops following at once, before any frame lands.
      const intent = (event: WheelEvent | TouchEvent | KeyboardEvent) => {
        const up =
          event.type === "wheel"
            ? (event as WheelEvent).deltaY < 0
            : event.type === "keydown"
              ? ["ArrowUp", "PageUp", "Home"].includes(
                  (event as KeyboardEvent).key
                )
              : true
        if (up && el.scrollHeight > el.clientHeight) {
          ours = null
          if (event.type !== "touchmove") {
            set({ following: false })
          }
        }
      }
      el.addEventListener("scroll", scrolled, { passive: true })
      el.addEventListener("wheel", intent, { passive: true })
      el.addEventListener("touchmove", intent, { passive: true })
      el.addEventListener("keydown", intent)
      lastHeight = el.scrollHeight
      if (state.following) {
        toEnd(el)
      }
      lastTop = el.scrollTop
      return () => {
        sizes?.disconnect()
        children?.disconnect()
        el.removeEventListener("scroll", scrolled)
        el.removeEventListener("wheel", intent)
        el.removeEventListener("touchmove", intent)
        el.removeEventListener("keydown", intent)
        if (scroller === el) {
          scroller = undefined
          pinned = undefined
        }
      }
    },
    /** Scrolls to the end and follows again. */
    scrollToBottom({ behavior }: { behavior?: ScrollBehavior } = {}) {
      set({ following: true })
      if (scroller) {
        toEnd(scroller, behavior)
      }
    },
    /** Stops following, as if the reader scrolled up. */
    release() {
      set({ following: false })
      if (scroller) {
        pin(scroller)
      }
    },
    /**
     * Call right before adding content above, like older messages: the next
     * growth keeps what's in view where it is instead of pushing it down.
     */
    prepend() {
      if (scroller) {
        anchor =
          scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop
      }
    },
  }
  return api
}

/**
 * What `createStickToBottom` returns.
 * @experimental
 */
type StickToBottom = ReturnType<typeof createStickToBottom>

export {
  createStickToBottom,
  type StickToBottom,
  type StickToBottomOptions,
  type StickToBottomState,
}
