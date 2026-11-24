// The scroll-snap driver: the host is a full-screen scroller with one snap
// marker per snap point, and the sheet sits in it, so dragging is native
// scrolling: the browser's momentum, bounce and 120Hz, and the sheet keeps
// moving while the main thread is busy. Scroll position s shows extent
// s + extentAtTop. Bottom sheets only; other sides use the pointer driver.
//
// How it moves:
// - Programmatic moves (open, close, the handle) set the scroll position at
//   once and play the difference back as a spring on the sheet's `translate`,
//   since `scrollTo({ behavior: "smooth" })` has a fixed curve. The sheet
//   moves, never the markers: WebKit snaps to transformed boxes as drawn.
// - A sheet that can't be dismissed starts the scroll at its smallest snap
//   point, so the native bounce past it is the resistance.
// - The scroller reaches past the layout viewport's bottom, under iOS 26
//   Safari's floating toolbar, and closes from there.
// - While the sheet isn't at its largest snap point, its scroll areas are
//   locked, so a swipe on them moves the sheet; at the largest they scroll,
//   and a new swipe down from their top chains into the sheet.
// - An IntersectionObserver dismisses the sheet once it's scrolled out of view.
// - Effects follow a ScrollTimeline of the scroller where there is one.
import {
  initialState,
  next,
  type SheetSnapReason,
  type SheetState,
} from "../motion/machine"
import { nearestIndex } from "../motion/projection"
import { settleTime, solveSpring, springLinearEasing } from "../motion/spring"
import { on } from "../kernel/events"
import { isIOS } from "../platform/env"
import {
  afterFirstFrame,
  openHold,
  sampleTranslate,
  setStyles,
  toolbarBleed,
  type SheetDriver,
  type SheetDriverOptions,
} from "./sheet-driver"
import { supportsLinear } from "./sheet-effects"

// No scroll for this long, with no finger down, counts as rest where
// `scrollend` isn't supported.
const restTimeout = 120

// Room past the largest snap point, so browsers without a native bounce still
// show a stretch before snapping back.
const overscrollRoom = 24

function createScrollSnapDriver(options: SheetDriverOptions) {
  const { sheet, host } = options
  const doc = sheet.ownerDocument
  const view = doc.defaultView ?? window
  let state: SheetState = initialState(0, -1)
  let extentAtTop = 0
  let markers: HTMLElement[] = []
  let flip: {
    animation: Animation
    to: number
    extentAt: (elapsed: number) => number
    startTime: number
  } | null = null
  let touching = false
  // The browser's scroll ended before the page heard the finger lift.
  let restMissed = false
  let dragging = false
  // A swipe's close holds until the popup confirms it: a refused one snaps back.
  let closing: "swipe" | "close" | null = null
  let restTimer = 0
  let frame = 0
  let targetId: string | null = null
  // Each scroll area with its own inline overflow-y, put back at the largest
  // snap point, since frameworks don't write a style again that didn't change.
  const scrollAreas = new Map<HTMLElement, [string, string]>()
  // A snap marker where a finger caught a moving sheet, so mandatory snapping
  // doesn't pull it to a snap point before the finger moves it.
  let caught: HTMLElement | null = null
  const restoreHost = setStyles(host, {
    inset: `0 0 calc(var(--keyboard-inset, 0px) - ${toolbarBleed}px) 0`,
    display: "block",
    "overflow-y": "scroll",
    "overflow-x": "hidden",
    "scroll-snap-type": "y mandatory",
    "scrollbar-width": "none",
    "overscroll-behavior": "contain",
    "pointer-events": "auto",
  })
  const restoreSheet = setStyles(sheet, {
    position: "absolute",
    left: "0",
    right: "0",
  })
  const supportsScrollEnd = "onscrollend" in host
  const Timeline = (
    view as unknown as {
      ScrollTimeline?: new (options: {
        source: Element
        axis: string
      }) => AnimationTimeline
    }
  ).ScrollTimeline

  const offs = [
    on(host, "scroll", onScroll, { passive: true }),
    ...(supportsScrollEnd ? [on(host, "scrollend" as "scroll", onRest)] : []),
    on(
      host,
      "touchstart",
      () => {
        touching = true
        restMissed = false
        if (flip && !closing) {
          catchFlip()
        }
      },
      { passive: true }
    ),
    on(host, "touchend", onTouchEnd, { passive: true }),
    on(host, "touchcancel", onTouchEnd, { passive: true }),
  ]
  // Only iOS draws the page under its toolbar, so elsewhere the sheet closes
  // at the screen's edge. A sheet touching the edge still counts as intersecting.
  const hiddenBelow = isIOS() ? 1 : toolbarBleed + 1
  const visibility = new IntersectionObserver(onVisibility, {
    root: host,
    rootMargin: `0px 0px -${hiddenBelow}px 0px`,
    threshold: 0,
  })
  visibility.observe(sheet)

  const container = () => options.config().dimension
  const largestExtent = () => options.config().snapPoints.at(-1)?.extent ?? 0
  const maxScroll = () => largestExtent() + overscrollRoom - extentAtTop
  const scrollExtent = () =>
    Math.min(host.scrollTop + extentAtTop, largestExtent())

  function layout() {
    const config = options.config()
    extentAtTop = config.dismissible
      ? -toolbarBleed
      : config.snapPoints[0].extent
    sheet.style.top = `${container() - extentAtTop}px`
    for (const marker of markers) {
      marker.remove()
    }
    const extents = config.snapPoints.map((point) => point.extent)
    const targets = config.dismissible ? [extentAtTop, ...extents] : extents
    markers = targets.map((extent) => marker(extent - extentAtTop, "start"))
    markers.push(marker(maxScroll() + host.clientHeight - 1, "none"))
    host.append(...markers)
    for (const area of scrollAreas.keys()) {
      if (!sheet.contains(area)) {
        scrollAreas.delete(area)
      }
    }
    for (const area of findScrollAreas(sheet)) {
      if (!scrollAreas.has(area)) {
        scrollAreas.set(area, [
          area.style.getPropertyValue("overflow-y"),
          area.style.getPropertyPriority("overflow-y"),
        ])
      }
    }
  }

  function marker(top: number, align: string) {
    const el = doc.createElement("div")
    el.setAttribute("aria-hidden", "true")
    el.style.cssText = `position:absolute;left:0;width:1px;height:1px;top:${top}px;scroll-snap-align:${align};pointer-events:none`
    return el
  }

  function onScroll() {
    if (flip || closing) {
      return
    }
    if (caught && touching && Math.abs(host.scrollTop - caught.offsetTop) > 1) {
      releaseCatch()
    }
    if (touching && !dragging) {
      setDragging(true)
    }
    if (!Timeline) {
      frame ||= view.requestAnimationFrame(followScroll)
    }
    view.clearTimeout(restTimer)
    if (!supportsScrollEnd && !touching) {
      restTimer = view.setTimeout(onRest, restTimeout)
    }
  }

  function followScroll() {
    frame = 0
    options.onFrame(scrollExtent())
  }

  function onTouchEnd() {
    touching = false
    setDragging(false)
    if (caught) {
      releaseCatch()
      const points = options.config().snapPoints
      const index = nearestIndex(
        points.map((point) => point.extent),
        scrollExtent()
      )
      return moveTo(points[index].id, "swipe")
    }
    // The native bounce past the smallest snap point is the only sign of a refused swipe.
    if (!options.config().dismissible && host.scrollTop < -2) {
      options.onDismissAttempt()
    }
    // A passive `touchend` can reach the page after `scrollend`, so a rest missed while the
    // finger was down is checked once the scroll stays still, like browsers without `scrollend`.
    if (restMissed || !supportsScrollEnd) {
      restTimer = view.setTimeout(onRest, restTimeout)
    }
    restMissed = false
  }

  function setDragging(value: boolean) {
    if (dragging === value) {
      return
    }
    dragging = value
    options.onDragChange(value)
  }

  function onRest() {
    if (touching) {
      restMissed = true
      return
    }
    if (flip || closing) {
      return
    }
    const config = options.config()
    const result = next(state, { type: "rest", extent: scrollExtent() }, config)
    state = result.state
    for (const effect of result.effects) {
      if (effect.type === "snap") {
        targetId = effect.id
        options.onSnap(effect.id, effect.reason)
      }
    }
    if (state.restingIndex >= 0) {
      settle(config.snapPoints[state.restingIndex].id)
    }
  }

  function onVisibility(entries: IntersectionObserverEntry[]) {
    const entry = entries[entries.length - 1]
    if (
      entry.isIntersecting ||
      flip ||
      closing ||
      targetId === null ||
      !options.config().dismissible
    ) {
      return
    }
    closing = "swipe"
    targetId = null
    options.onDismiss()
  }

  function catchFlip() {
    if (!flip) {
      return
    }
    const scroll = Math.max(
      0,
      flip.extentAt(performance.now() - flip.startTime) - extentAtTop
    )
    stopFlip()
    caught = marker(scroll, "start")
    host.append(caught)
    host.scrollTop = scroll
    followScroll()
    trackScroll()
  }

  function releaseCatch() {
    caught?.remove()
    caught = null
  }

  function animateTo(
    target: number,
    from: number,
    startTime: number,
    onFinish: () => void
  ) {
    stopFlip()
    const physics = options.config().physics
    const solver = solveSpring(
      physics.response,
      physics.dampingRatio,
      from - target,
      0
    )
    const duration = Math.max(1, settleTime(solver))
    const scrolled = Math.max(extentAtTop, target)
    host.scrollTop = scrolled - extentAtTop
    const extentAt = (elapsed: number) =>
      target + solver.position(Math.max(0, elapsed))
    const still = Math.abs(target - from) < 0.5
    const sampled = !still && !supportsLinear()
    const animation = sheet.animate(
      {
        translate: sampled
          ? sampleTranslate(
              { duration, extentAt },
              (extent) => `0 ${scrolled - extent}px`
            )
          : [`0 ${scrolled - from}px`, `0 ${scrolled - target}px`],
      },
      {
        duration,
        easing:
          still || sampled
            ? "linear"
            : springLinearEasing(solver, from, target, duration),
        fill: "both",
      }
    )
    animation.startTime = startTime
    flip = { animation, to: target, extentAt, startTime }
    options.onMotion({ type: "settle", extentAt, startTime, duration })
    animation.onfinish = () => {
      if (flip?.animation !== animation) {
        return
      }
      flip = null
      onFinish()
      animation.cancel()
    }
  }

  function stopFlip() {
    flip?.animation.cancel()
    flip = null
  }

  function settle(id: string) {
    const config = options.config()
    const index = config.snapPoints.findIndex((point) => point.id === id)
    state = initialState(config.snapPoints[index].extent, index)
    targetId = id
    host.style.pointerEvents = options.isInteractive(id) ? "none" : "auto"
    const atLargest = index === config.snapPoints.length - 1
    for (const [area, [value, priority]] of scrollAreas) {
      if (atLargest) {
        area.style.setProperty("overflow-y", value, priority)
      } else {
        area.style.overflowY = "hidden"
      }
    }
    options.onRest(id)
    trackScroll()
  }

  function trackScroll() {
    if (!Timeline) {
      return
    }
    const max = maxScroll()
    const timeline = new Timeline({ source: host, axis: "block" })
    options.onMotion({
      type: "timeline",
      timeline,
      extentAt: (progress) =>
        Math.min(largestExtent(), progress * max + extentAtTop),
    })
  }

  function moveTo(id: string, reason: SheetSnapReason) {
    const point = options.config().snapPoints.find((entry) => entry.id === id)
    if (!point || closing === "close") {
      return
    }
    closing = null
    if (id !== targetId) {
      targetId = id
      options.onSnap(id, reason)
    }
    const from = flip
      ? flip.extentAt(performance.now() - flip.startTime)
      : scrollExtent()
    animateTo(point.extent, from, performance.now(), () => settle(id))
  }

  return {
    open(id, animate) {
      closing = null
      targetId = id
      layout()
      const point = options.config().snapPoints.find((entry) => entry.id === id)
      if (!point) {
        return
      }
      if (!animate) {
        host.scrollTop = point.extent - extentAtTop
        return settle(id)
      }
      animateTo(point.extent, -toolbarBleed, performance.now() + openHold, () =>
        settle(id)
      )
      const opening = flip
      afterFirstFrame(view, (frameTime) => {
        if (!opening || flip !== opening) {
          return
        }
        opening.animation.startTime = frameTime
        opening.startTime = frameTime
        options.onMotionStart(frameTime)
      })
    },
    close() {
      const wasClosing = closing
      closing = "close"
      if (wasClosing) {
        return
      }
      targetId = null
      const from = flip
        ? flip.extentAt(performance.now() - flip.startTime)
        : scrollExtent()
      animateTo(-toolbarBleed, from, performance.now(), () =>
        options.onRest(null)
      )
    },
    snapTo: moveTo,
    nudge() {
      if (closing || options.reducedMotion() || targetId === null) {
        return
      }
      const point = options
        .config()
        .snapPoints.find((entry) => entry.id === targetId)
      if (point) {
        animateTo(point.extent, point.extent - 20, performance.now(), () =>
          settle(point.id)
        )
      }
    },
    relayout(_immediate, fallback) {
      if (closing || touching) {
        return
      }
      const points = options.config().snapPoints
      const kept = points.findIndex((point) => point.id === targetId)
      const wanted = points.findIndex((point) => point.id === fallback)
      const index =
        kept >= 0
          ? kept
          : wanted >= 0
            ? wanted
            : nearestIndex(
                points.map((point) => point.extent),
                scrollExtent()
              )
      const top = extentAtTop
      layout()
      // Safari and Firefox don't always re-snap after the markers move, so the position is set.
      const point = points[index]
      if (point.id !== targetId) {
        targetId = point.id
        options.onSnap(point.id, "content-resize")
      }
      // A sheet on its way is aimed at where it rests now. The flip stays the
      // same object, so an open waiting for its first frame still starts there.
      if (flip) {
        const moving = flip
        const now = performance.now()
        if (moving.to !== point.extent || extentAtTop !== top) {
          animateTo(
            point.extent,
            moving.extentAt(now - moving.startTime),
            Math.max(now, moving.startTime),
            () => settle(point.id)
          )
          flip = Object.assign(moving, flip)
        }
        return
      }
      host.scrollTop = point.extent - extentAtTop
      settle(point.id)
    },
    target: () => (closing ? null : targetId),
    isMoving: () => !!flip || dragging,
    destroy() {
      stopFlip()
      releaseCatch()
      view.clearTimeout(restTimer)
      if (frame) {
        view.cancelAnimationFrame(frame)
      }
      visibility.disconnect()
      offs.forEach((off) => off())
      for (const marker of markers) {
        marker.remove()
      }
      for (const [area, [value, priority]] of scrollAreas) {
        area.style.setProperty("overflow-y", value, priority)
      }
      if (dragging) {
        options.onDragChange(false)
      }
      sheet.style.removeProperty("top")
      restoreSheet()
      restoreHost()
    },
  } satisfies SheetDriver
}

function findScrollAreas(sheet: HTMLElement) {
  const view = sheet.ownerDocument.defaultView ?? window
  return Array.from(sheet.querySelectorAll<HTMLElement>("*")).filter((el) =>
    /auto|scroll/.test(view.getComputedStyle(el).overflowY)
  )
}

export { createScrollSnapDriver }
