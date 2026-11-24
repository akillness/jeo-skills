import { dragThreshold, swallowNextClick } from "../drag-and-drop/pointer"
import { on } from "../kernel/events"
import { projectDistance } from "../motion/projection"
import { createVelocityTracker } from "../motion/velocity"
import { clamp } from "../number/steps"
import { isRTL } from "../platform/env"
import { pagedElsewhere } from "./listbox-keyboard"
import { activeElement, prefersReducedMotion } from "../platform/platform"

// No scroll for this long, with no finger down, counts as rest where
// `scrollend` isn't supported.
const restTimeout = 120

// UIScrollView's normal deceleration, for where a flick coasts to.
const decelerationRate = 0.998

/**
 * What `onSelect` hears with the option it brought to the center.
 * @experimental
 */
type ScrollPickerSelectDetails = {
  /** The option at the center. */
  element: HTMLElement
  /** What moved it there: a scroll, a drag's pointer, or a Page Up or Page Down key. */
  event?: Event
}

/**
 * How `bindScrollPicker` scrolls and what it reports.
 * @experimental
 */
type ScrollPickerOptions = {
  /**
   * Which way the list scrolls. A horizontal list runs from the right in right-to-left text.
   * @defaultValue the list's `aria-orientation`, or "vertical"
   */
  orientation?: "horizontal" | "vertical"
  /**
   * Runs when someone's scroll, drag, or Page Up or Page Down brings another
   * enabled option to the center, with its index among all the options.
   * Select it here. Clicks and arrow keys select through the list itself.
   */
  onSelect?: (index: number, details: ScrollPickerSelectDetails) => void
}

/**
 * Where `at` falls among the option `centers`, ascending, as a fractional
 * index: 2 at the third option's center, 2.5 halfway to the fourth. Past
 * either end it carries on at the spacing of the last two.
 */
function pickerPosition(centers: readonly number[], at: number) {
  const last = centers.length - 1
  if (last < 1) {
    return 0
  }
  let low = 0
  let high = last - 1
  while (low < high) {
    const middle = (low + high + 1) >> 1
    if (centers[middle] <= at) {
      low = middle
    } else {
      high = middle - 1
    }
  }
  const span = centers[low + 1] - centers[low]
  return span > 0 ? low + (at - centers[low]) / span : low
}

/**
 * The enabled index nearest `position`, a fractional index from
 * `pickerPosition`, or -1 when every option is disabled.
 */
function nearestEnabled(
  position: number,
  count: number,
  isDisabled: (index: number) => boolean
) {
  const start = clamp(Math.round(position), 0, count - 1)
  const lean = position >= start ? 1 : -1
  for (let distance = 0; distance < count; distance++) {
    const near = start + distance * lean
    if (near >= 0 && near < count && !isDisabled(near)) {
      return near
    }
    const far = start - distance * lean
    if (far >= 0 && far < count && !isDisabled(far)) {
      return far
    }
  }
  return -1
}

const isDisabledOption = (el: HTMLElement) =>
  el.getAttribute("aria-disabled") === "true"

/**
 * Makes a scrolling list of options pick by scrolling, like a wheel of hours
 * or a thumbwheel of pages: the option at the center is the value. Scrolling,
 * a drag with the mouse or a flick selects the option at the center as it
 * passes, and settles on the nearest enabled one when it stops. When the list
 * selects an option itself, from a click, an arrow key or code, it scrolls
 * there smoothly without selecting the ones it passes. Each option gets
 * `--picker-offset`, its distance from the center in options, so a wheel can
 * be drawn in CSS. Give the list `scroll-snap-type` and its options
 * `scroll-snap-align: center`. Returns a cleanup.
 *
 * ```ts
 * const unbind = bindScrollPicker(listboxElement, {
 *   onSelect: (index) => controller.setValue(hours[index]),
 * })
 * ```
 * @experimental
 */
function bindScrollPicker(
  list: HTMLElement,
  options: ScrollPickerOptions = {}
) {
  const doc = list.ownerDocument
  const view = doc.defaultView ?? window
  const supportsScrollEnd = "onscrollend" in list
  const tracker = createVelocityTracker()
  let vertical = true
  let rtl = false
  let items: HTMLElement[] = []
  let centers: number[] = []
  let sized = false
  let painted: string[] = []
  let position = 0
  // The option selected last, by the picker or the list.
  let selected = -1
  // The scroll position the picker is moving to itself, so its own scroll
  // doesn't select what it passes.
  let target: number | null = null
  let scrolling = false
  let touching = false
  let restMissed = false
  let lastEvent: Event | undefined
  let frame = 0
  let restTimer = 0
  let drag: {
    id: number
    from: number
    scroll: number
    moved: boolean
  } | null = null
  let offDrag: (() => void)[] = []
  const observed = new Set<HTMLElement>()
  // The list's own inline values, put back after a drag, since a framework
  // won't rewrite a style prop that didn't change.
  const overridden = new Map<string, [value: string, priority: string]>()

  function override(name: string, value: string) {
    if (!overridden.has(name)) {
      overridden.set(name, [
        list.style.getPropertyValue(name),
        list.style.getPropertyPriority(name),
      ])
    }
    list.style.setProperty(name, value)
  }

  function restore(name: string) {
    const previous = overridden.get(name)
    if (previous) {
      overridden.delete(name)
      list.style.setProperty(name, ...previous)
    }
  }

  const scroll = () => {
    if (vertical) {
      return list.scrollTop
    }
    return rtl ? -list.scrollLeft : list.scrollLeft
  }
  const viewSize = () => (vertical ? list.clientHeight : list.clientWidth)
  const maxScroll = () =>
    vertical
      ? list.scrollHeight - list.clientHeight
      : list.scrollWidth - list.clientWidth
  const along = (event: PointerEvent) =>
    vertical ? event.clientY : rtl ? -event.clientX : event.clientX
  const isBusy = () => scrolling || touching || !!drag?.moved

  function writeScroll(to: number, behavior: ScrollBehavior = "instant") {
    if (vertical) {
      list.scrollTo({ top: to, behavior })
    } else {
      list.scrollTo({ left: rtl ? -to : to, behavior })
    }
  }

  function measure() {
    // Read each time, since a custom element writes its ARIA once it connects.
    const orientation =
      options.orientation ?? list.getAttribute("aria-orientation")
    vertical = orientation !== "horizontal"
    rtl = !vertical && isRTL(list)
    items = [...list.querySelectorAll<HTMLElement>('[role="option"]')]
    painted = []
    const box = list.getBoundingClientRect()
    const size = vertical ? box.height : box.width
    sized = size > 0
    // A transform around the list, like a popup's scale as it opens, scales
    // these boxes and not the scroll position, so the centers are scaled back.
    // The layout size is rounded, so a size within its rounding isn't scaled.
    const layout = vertical ? list.offsetHeight : list.offsetWidth
    const scale = sized && Math.abs(layout - size) > 0.5 ? layout / size : 1
    const at = scroll()
    centers = items.map((item) => {
      const rect = item.getBoundingClientRect()
      const offset = vertical
        ? (rect.top + rect.height / 2 - box.top) * scale - list.clientTop
        : (rect.left + rect.width / 2 - box.left) * scale - list.clientLeft
      return (rtl ? list.clientWidth - offset : offset) + at
    })
    for (const item of items) {
      if (!observed.has(item)) {
        observed.add(item)
        resizes?.observe(item)
      }
    }
    for (const item of observed) {
      if (!item.isConnected) {
        observed.delete(item)
        resizes?.unobserve(item)
      }
    }
  }

  function paint() {
    frame = 0
    const at = scroll() + viewSize() / 2
    position = pickerPosition(centers, at)
    // Scroll positions round to whole pixels, so an option within one counts as centered.
    const nearest = Math.round(position)
    if (Math.abs((centers[nearest] ?? Infinity) - at) < 1) {
      position = nearest
    }
    for (let index = 0; index < items.length; index++) {
      const offset = String(Math.round((index - position) * 1000) / 1000)
      if (painted[index] !== offset) {
        painted[index] = offset
        items[index].style.setProperty("--picker-offset", offset)
      }
    }
  }

  // A roving list moves its focus along, so the next key starts here, and
  // nothing that reveals the focused option scrolls back to the old one.
  function focusAlong(element: HTMLElement) {
    const active = activeElement(doc)
    if (
      active &&
      active !== element &&
      items.includes(active) &&
      element.hasAttribute("tabindex")
    ) {
      element.focus({ preventScroll: true })
    }
  }

  function select(index: number, event?: Event) {
    selected = index
    const element = items[index]
    options.onSelect?.(index, { element, event })
    focusAlong(element)
  }

  function centerOn(index: number, animate = true) {
    const to = clamp(centers[index] - viewSize() / 2, 0, maxScroll())
    if (Math.abs(to - scroll()) < 1) {
      return arrive()
    }
    target = to
    writeScroll(to, animate && !prefersReducedMotion() ? "smooth" : "instant")
    waitForRest()
  }

  function arrive() {
    target = null
    restore("scroll-snap-type")
  }

  function waitForRest() {
    view.clearTimeout(restTimer)
    if (!supportsScrollEnd || target !== null) {
      restTimer = view.setTimeout(onRest, restTimeout)
    }
  }

  function selectedIndex() {
    return items.findIndex(
      (item) => item.getAttribute("aria-selected") === "true"
    )
  }

  function follow() {
    paint()
    if (target !== null || !scrolling || !items.length) {
      return
    }
    const index = clamp(Math.round(position), 0, items.length - 1)
    if (index !== selected && !isDisabledOption(items[index])) {
      select(index, lastEvent)
    }
  }

  function settleAt(at: number, event?: Event) {
    const index = nearestEnabled(at, items.length, (each) =>
      isDisabledOption(items[each])
    )
    if (index === -1) {
      return arrive()
    }
    if (index !== selected) {
      select(index, event)
    }
    centerOn(index)
  }

  function onScroll(event: Event) {
    // Bound while hidden, it has measured nothing, and the list can scroll as
    // it shows, before its new size is observed.
    if (!sized) {
      return onResize()
    }
    if (target !== null) {
      if (Math.abs(scroll() - target) < 1) {
        arrive()
      } else {
        waitForRest()
      }
    } else if (!drag?.moved) {
      scrolling = true
      lastEvent = event
      waitForRest()
    }
    frame ||= view.requestAnimationFrame(follow)
  }

  function onRest() {
    view.clearTimeout(restTimer)
    if (target !== null) {
      return arrive()
    }
    if (!scrolling || drag?.moved) {
      return
    }
    // The browser's scroll can end before the page hears the finger lift.
    if (touching) {
      restMissed = true
      return
    }
    scrolling = false
    paint()
    settleAt(position, lastEvent)
  }

  // A smooth scroll the picker replaced ends on its way, so only one that
  // arrived counts. The timer catches one that never does.
  function onScrollEnd() {
    if (target === null || Math.abs(scroll() - target) < 1) {
      onRest()
    }
  }

  // Someone took over from the picker's own scroll.
  function interrupt() {
    target = null
  }

  function onTouchStart() {
    touching = true
    restMissed = false
    interrupt()
  }

  function onTouchEnd() {
    touching = false
    if (restMissed) {
      restMissed = false
      onRest()
    }
  }

  function onPointerDown(event: PointerEvent) {
    if (event.pointerType === "touch" || event.button !== 0 || drag) {
      return
    }
    // A press on the list's own scrollbar drags the scrollbar.
    if (
      event.target === list &&
      (event.offsetX > list.clientWidth || event.offsetY > list.clientHeight)
    ) {
      return
    }
    interrupt()
    drag = {
      id: event.pointerId,
      from: along(event),
      scroll: scroll(),
      moved: false,
    }
    tracker.reset()
    tracker.add(event.timeStamp, drag.from)
    offDrag = [
      on(doc, "pointermove", onPointerMove, { capture: true }),
      on(doc, "pointerup", onPointerUp, { capture: true }),
      on(doc, "pointercancel", onPointerUp, { capture: true }),
    ]
  }

  function onPointerMove(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.id) {
      return
    }
    const at = along(event)
    if (!drag.moved) {
      if (Math.abs(at - drag.from) < dragThreshold) {
        return
      }
      drag.moved = true
      scrolling = true
      // Snapping would pull each write back to an option.
      override("scroll-snap-type", "none")
      override("user-select", "none")
      doc.getSelection()?.removeAllRanges()
      try {
        list.setPointerCapture(event.pointerId)
      } catch {
        // Synthetic events have no active pointer to capture.
      }
    }
    tracker.add(event.timeStamp, at)
    lastEvent = event
    writeScroll(drag.scroll - (at - drag.from))
  }

  function onPointerUp(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.id) {
      return
    }
    const { moved } = drag
    drag = null
    offDrag.forEach((off) => off())
    offDrag = []
    if (!moved) {
      return
    }
    restore("user-select")
    // WebKit sends the click to the option the drag started on.
    swallowNextClick(doc)
    scrolling = false
    const velocity =
      event.type === "pointercancel" ? 0 : tracker.velocity(event.timeStamp)
    const coast = clamp(
      scroll() - projectDistance(velocity, decelerationRate),
      0,
      maxScroll()
    )
    settleAt(pickerPosition(centers, coast + viewSize() / 2), event)
  }

  // Pressing an option would focus it, and the browser would scroll it into view at once.
  function onMouseDown(event: MouseEvent) {
    if ((event.target as Element).closest('[role="option"]')) {
      event.preventDefault()
    }
  }

  function onKeyDown(event: KeyboardEvent) {
    const direction =
      event.key === "PageDown" ? 1 : event.key === "PageUp" ? -1 : 0
    if (
      !direction ||
      event.defaultPrevented ||
      items.length < 2 ||
      !list.contains(event.target as Node)
    ) {
      return
    }
    event.preventDefault()
    const spacing =
      (centers[items.length - 1] - centers[0]) / (items.length - 1)
    const page =
      spacing > 0 ? Math.max(1, Math.round(viewSize() / spacing) - 1) : 1
    const from = selected === -1 ? Math.round(position) : selected
    settleAt(clamp(from + direction * page, 0, items.length - 1), event)
  }

  function onMutations(mutations: MutationRecord[]) {
    if (
      mutations.some(
        (mutation) =>
          mutation.type === "childList" ||
          mutation.attributeName !== "aria-selected"
      )
    ) {
      measure()
      paint()
    }
    const index = selectedIndex()
    if (index !== -1 && index !== selected && !isBusy()) {
      // A list whose options bind after it, like custom elements, starts there at once.
      const animate = selected !== -1
      selected = index
      focusAlong(items[index])
      centerOn(index, animate)
    }
  }

  function onResize() {
    measure()
    if (selected !== -1 && !isBusy() && target === null) {
      centerOn(selected, false)
    }
    paint()
  }

  const resizes = view.ResizeObserver
    ? new view.ResizeObserver(onResize)
    : undefined
  const mutations = view.MutationObserver
    ? new view.MutationObserver(onMutations)
    : undefined

  measure()
  resizes?.observe(list)
  mutations?.observe(list, {
    subtree: true,
    childList: true,
    attributeFilter: ["aria-selected", "aria-orientation", "role"],
  })
  selected = selectedIndex()
  if (selected !== -1) {
    centerOn(selected, false)
  }
  paint()

  pagedElsewhere.add(list)
  const offs = [
    on(list, "scroll", onScroll, { passive: true }),
    ...(supportsScrollEnd
      ? [on(list, "scrollend" as "scroll", onScrollEnd)]
      : []),
    on(list, "wheel", interrupt, { passive: true }),
    on(list, "touchstart", onTouchStart, { passive: true }),
    on(list, "touchend", onTouchEnd, { passive: true }),
    on(list, "touchcancel", onTouchEnd, { passive: true }),
    on(list, "pointerdown", onPointerDown),
    on(list, "mousedown", onMouseDown),
    // On the document, so handlers React and Svelte delegate to their root run first and can cancel it.
    on(doc, "keydown", onKeyDown),
  ]

  return () => {
    pagedElsewhere.delete(list)
    offs.forEach((off) => off())
    offDrag.forEach((off) => off())
    resizes?.disconnect()
    mutations?.disconnect()
    view.cancelAnimationFrame(frame)
    view.clearTimeout(restTimer)
    restore("user-select")
    arrive()
    for (const item of items) {
      item.style.removeProperty("--picker-offset")
    }
  }
}

export {
  bindScrollPicker,
  nearestEnabled,
  pickerPosition,
  type ScrollPickerOptions,
  type ScrollPickerSelectDetails,
}
