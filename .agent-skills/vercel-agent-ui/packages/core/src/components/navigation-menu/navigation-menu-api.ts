// How a navigation menu opens, closes and moves focus. Every panel shows on a
// surface from the popup layer: the shared viewport when there is one, or the
// content itself, positioned against its trigger, when there isn't. Each
// surface reads the menu's one store through a lens, so dismissal, Escape,
// focus return and Tab flow come from the layer for both.
import {
  bindFindable,
  focusPressedTrigger,
} from "../../foundation/disclosure/disclosure"
import { createHoverIntent } from "../../foundation/popups/hover"
import { createSafeArea } from "../../foundation/popups/safe-area"
import { ownsEvent } from "../../foundation/popups/popup-elements"
import {
  contentAnchor,
  placementOptions,
} from "../../foundation/popups/popup-features"
import { restoreFocus } from "../../foundation/kernel/modality"
import {
  modalTriple,
  openerOf,
  prepareReset,
  resetPopoverStyles,
  type PopupOpener,
} from "../../foundation/popups/popup"
import { createSteppedPopup } from "../../foundation/popups/popup-steps"
import { position, type Anchor } from "../../foundation/platform/position"
import { type Side } from "../../foundation/platform/sides"
import {
  animateIn,
  animateOut,
  writeOpen,
} from "../../foundation/motion/presence"
import {
  bindIndicator,
  collapseWhileHidden,
  createViewportSize,
} from "./navigation-menu-dom"
import { createFocus } from "./navigation-menu-focus"
import { opensElsewhere } from "./navigation-menu-keyboard"
import { deriveFromOptions } from "../../foundation/kernel/derive"
import type { ChangeOptions } from "../../foundation/kernel/details"
import { isComposing, on } from "../../foundation/kernel/events"
import { onProps } from "../../foundation/kernel/part"
import type {
  Part,
  PrimitiveContext,
} from "../../foundation/kernel/primitive-types"
import { createChange } from "../../foundation/kernel/input-source"
import { elements } from "../../foundation/kernel/elements"
import { whenKept } from "../../foundation/kernel/keep"
import type {
  NavigationMenuContentProps,
  NavigationMenuLinkProps,
} from "./navigation-menu"

type Orientation = "horizontal" | "vertical"

type NavigationMenuStoreState = {
  value: string | null
  orientation: Orientation
  // Whether the viewport is in the page: open, or animating out.
  mounted: boolean
  // The item that opened last. Kept after it closes, so focus goes back to its
  // trigger and its content stays in the viewport while that animates out.
  active: string | null
  // The item open before the current one, and whether the current one comes
  // after it. Null when the menu opened from closed.
  previous: string | null
  forward: boolean | null
  // Contents animating out of the viewport after another item took over.
  exiting: string[]
  // Contents without a viewport that are in the page: open, or animating out.
  contents: string[]
  // Whether a viewport is bound. Contents render into it.
  viewport: boolean
  // Whether this menu sits inside another one's content.
  nested: boolean
}

// What adapters pass on top of the public options: the menu this one is
// nested in, and the item whose content holds it.
type NavigationMenuInternalOptions = {
  parent?: { api: NavigationMenuApi; item: string }
}

// What the api reads from the options. The public options' full types are in
// `navigation-menu.ts`, which imports this module.
type ApiOptions = NavigationMenuInternalOptions & {
  onOpenChangeComplete?: (open: boolean) => void
  delay?: number
  closeDelay?: number
  openOnHover?: boolean
  closeOnSelect?: boolean
}

// Placement both kinds of surface take from their part's props.
type PlacementProps = {
  side?: Side
  align?: "start" | "center" | "end"
  sideOffset?: number
  alignOffset?: number
  collisionPadding?: number
  anchor?: Anchor | string | null
}

type CloseOptions = {
  reason?: string
  event?: Event
  focus?: boolean | "later"
}
type OpenOptions = { reason?: string; event?: Event; by?: PopupOpener }

// The browser's own popover styles go from surfaces, so any class styles them.
const popupSelectors = [
  '[data-slot="navigation-menu-viewport"]',
  '[data-slot="navigation-menu-content"]',
]

// Opening again within this many milliseconds of closing skips the delay, so
// the pointer can leave and come back without waiting.
const warmFor = 300

/**
 * `navigationMenu`'s api, which its slots and controller call.
 * Adapters expose it as `api`.
 * @stable
 */
interface NavigationMenuApi extends ReturnType<typeof navigationMenuApiBody> {}

function navigationMenuApiBody(
  context: PrimitiveContext<ApiOptions, NavigationMenuStoreState, string>
) {
  const { store, options, element } = context
  const change = createChange(context)
  // Written at the first open, the reset restyles and lays out the whole page.
  whenKept(() => prepareReset(popupSelectors))
  let closedAt = -Infinity
  // The item the last open asked for, which the viewport opens for, and
  // whether the last open or close went through.
  let asked: string | null = null
  let changed = false
  // Whether `onOpenChangeComplete` last said the menu is open, and whether
  // the menu opened since it last said it closed.
  let reportedOpen = store.get().value !== null
  let openedSinceClose = reportedOpen

  const triggerOf = (key: string | null) =>
    key === null ? undefined : element("trigger", key)
  // The item the menu shows now, or the one animating out.
  const shownItem = () => store.get().value ?? store.get().active

  // Derived state, written in the same change as the value, before any
  // surface hears about it, so a surface opening finds its trigger.
  function followUp(from: string | null, state: NavigationMenuStoreState) {
    if (state.value === null) {
      return { previous: null, forward: null }
    }
    const order = elements(context, "trigger").map((entry) => entry.key)
    const switching = from !== null
    return {
      active: state.value,
      previous: switching ? from : null,
      forward: switching
        ? order.indexOf(state.value) > order.indexOf(from)
        : null,
      exiting: [
        ...state.exiting.filter((key) => key !== state.value && key !== from),
        ...(switching && state.viewport ? [from] : []),
      ],
    }
  }
  // A controlled `value` brings its derived state in the same pass.
  deriveFromOptions(
    context,
    ["active", "previous", "forward", "exiting"],
    (synced, state) =>
      "value" in synced && synced.value !== state.value
        ? followUp(state.value, {
            ...state,
            value: (synced.value ?? null) as string | null,
          })
        : undefined
  )
  let lastValue = store.get().value
  store.subscribe(() => {
    const state = store.get()
    if (state.value === lastValue) {
      return
    }
    const from = lastValue
    lastValue = state.value
    store.set(followUp(from, state))
    if (state.value === null) {
      closedAt = performance.now()
      return
    }
    if (from === null) {
      openedSinceClose = true
    }
    ensureSurface(state.value)
    writeViewportSize()
  })

  // A nested menu closes once its parent moves on to another item.
  const parent = options().parent
  if (parent) {
    context.onDestroy(
      parent.api.internal.watch((value) => {
        if (value !== parent.item && store.get().value !== null) {
          close({ reason: "parent-close", focus: false })
        }
      })
    )
  }

  // A surface: the popup layer and its open and close steps over one view of
  // the store. The viewport's is open while any item is, and a content's while its item is.
  function createSurface(key: string | null) {
    const view = (state: NavigationMenuStoreState) =>
      key === null
        ? { open: state.value !== null, mounted: state.mounted }
        : { open: state.value === key, mounted: state.contents.includes(key) }
    // Contents left over from a viewport that closed mid-switch go with it.
    function mountedPatch(mounted: boolean, state: NavigationMenuStoreState) {
      if (key === null) {
        return mounted ? { mounted } : { mounted, exiting: [] }
      }
      const others = state.contents.filter((other) => other !== key)
      return { contents: mounted ? [...others, key] : others }
    }
    const lens = {
      get: () => view(store.get()),
      set({ mounted }: { mounted?: boolean }) {
        if (mounted !== undefined) {
          store.set(mountedPatch(mounted, store.get()))
        }
      },
      subscribe: store.subscribe,
    }
    const { popup, steps } = createSteppedPopup(
      {
        preset: "navigationMenu",
        position,
        owner: { component: "navigation-menu", id: context.id },
        store: lens,
        trigger: () => triggerOf(key ?? shownItem()),
        close: (reason, { event, focus }) => close({ reason, event, focus }),
        modal: () => modalTriple(false),
        // Presses and focus anywhere in the navigation count as inside, so
        // moving between its items never dismisses the open one.
        contains: (target) => !!element("root")?.contains(target),
        onOpenChange(open) {
          if (!open) {
            stopHover()
          }
        },
        onOpenChangeComplete(open) {
          if (key === null && !open) {
            detachViewport()
          }
          // Only the surface in use reports, and only when the menu as a whole
          // opened or closed: without a viewport, a switch opens another
          // surface. A close reports even when its open never completed, like
          // Escape during the intro.
          if (
            surface() !== surfaces.get(key) ||
            open !== (store.get().value !== null)
          ) {
            return
          }
          if (open ? reportedOpen : !openedSinceClose) {
            return
          }
          reportedOpen = open
          if (!open) {
            openedSinceClose = false
          }
          options().onOpenChangeComplete?.(open)
        },
      },
      {
        change(open, { reason, event }) {
          changed = change("value", open ? (key ?? asked) : null, {
            reason,
            event,
          })
          return changed
        },
        onDestroy: context.onDestroy,
        rules: {
          // The viewport stays open while another item takes it over, which opens it anew.
          reopen(_request, open) {
            if (store.get().value !== asked) {
              open()
            }
          },
        },
      }
    )
    // A controlled value mounts the surface in the same pass. The layer
    // derives that on the lens, which the options never reach.
    deriveFromOptions(
      context,
      key === null ? ["mounted", "exiting"] : ["contents"],
      (synced, state) => {
        const next = { ...state, ...synced }
        const { open } = view(next)
        if (open === view(state).open || popup.mountedAs(open) !== open) {
          return
        }
        return mountedPatch(open, next)
      }
    )
    return { ...popup, show: steps.show, hide: steps.hide }
  }

  type Surface = ReturnType<typeof createSurface>
  const surfaces = new Map<string | null, Surface>()

  // Contents need their surface before their item first opens, so it hears
  // the opening. Every part of an item creates it when it binds.
  function ensureSurface(key: string) {
    if (surfaces.has(key)) {
      return
    }
    // Opened before anything for it bound, like from a controller: it counts as in the page.
    if (store.get().value === key && !store.get().contents.includes(key)) {
      store.set({ contents: [...store.get().contents, key] })
    }
    surfaces.set(key, createSurface(key))
  }

  surfaces.set(null, createSurface(null))
  if (store.get().value !== null) {
    ensureSurface(store.get().value!)
  }

  // The surface showing the menu now: the viewport, or the open content.
  function surface() {
    if (store.get().viewport) {
      return surfaces.get(null)!
    }
    const key = shownItem()
    return (key !== null && surfaces.get(key)) || surfaces.get(null)!
  }

  const intent = createHoverIntent({
    trigger: () => triggerOf(store.get().value),
    popup: () => surface().element(),
    closesOnLeave: () =>
      store.get().value !== null && surface().opener() === "hover",
    closeDelay: () => options().closeDelay ?? 50,
    close(event) {
      // Someone working inside the panel keeps it open.
      if (surface().element()?.contains(document.activeElement)) {
        return
      }
      close({ reason: "trigger-hover", event, focus: false })
    },
  })
  // Crossing other triggers on the way to the open panel doesn't switch to them.
  const aim = createSafeArea()
  let pointerOn: string | null = null
  context.onDestroy(stopHover)

  function stopHover() {
    intent.clear()
    aim.stop()
  }

  // Opening the open item again keeps it open, and a press on a panel the
  // pointer opened keeps it open from now on.
  function open(
    key: string,
    { reason = "imperative", event, by = "imperative" }: OpenOptions = {}
  ) {
    stopHover()
    ensureSurface(key)
    asked = key
    changed = store.get().value === key
    ;(store.get().viewport ? surfaces.get(null)! : surfaces.get(key)!).show({
      reason,
      event,
      by,
    })
    return changed
  }

  // Controlled menus close when the new value comes back, and focus returns then.
  function close({
    reason = "imperative",
    event,
    focus = true,
  }: CloseOptions = {}) {
    if (store.get().value === null) {
      return false
    }
    changed = false
    surface().hide({ reason, event, focus })
    return changed
  }

  // The pointer left the open panel. Onto its own trigger, it's still hovering.
  function leavePanel(event: PointerEvent) {
    const target = event.relatedTarget as Node | null
    if (target && triggerOf(store.get().value)?.contains(target)) {
      return
    }
    intent.leave(event)
  }

  function enterPanel(event: PointerEvent) {
    aim.stop()
    intent.enter(event)
  }

  function leaveTrigger(event: PointerEvent, key: string) {
    if (pointerOn === key) {
      pointerOn = null
    }
    const panel = surface().element()
    if (store.get().value === key && panel && event.pointerType !== "touch") {
      const along = store.get().orientation === "horizontal" ? "y" : "x"
      aim.start({ x: event.clientX, y: event.clientY }, panel, along)
    }
    intent.leave(event)
  }

  function hoverEnter(event: PointerEvent, key: string, disabled?: boolean) {
    if (options().openOnHover === false || disabled) {
      return
    }
    pointerOn = key
    if (store.get().value !== null) {
      intent.enter(event)
      if (store.get().value === key) {
        return
      }
      const switchTo = () =>
        open(key, { reason: "trigger-hover", event, by: "hover" })
      // Another trigger takes the open menu over at once, unless the pointer
      // is only crossing it on its way to the open panel.
      if (
        aim.contains(
          { x: event.clientX, y: event.clientY },
          () => pointerOn === key && switchTo()
        )
      ) {
        return
      }
      switchTo()
      return
    }
    // Still animating out, or just closed: the delay is skipped.
    const warm =
      store.get().mounted ||
      store.get().contents.length > 0 ||
      performance.now() - closedAt < warmFor
    const delay = warm ? 0 : (options().delay ?? 50)
    intent.enter(
      event,
      () =>
        !context.props<{ disabled?: boolean }>("trigger", key)?.disabled &&
        options().openOnHover !== false &&
        open(key, { reason: "trigger-hover", event, by: "hover" }),
      delay
    )
  }

  function triggerPress(
    key: string,
    el: HTMLElement | undefined,
    event?: Event
  ) {
    focusPressedTrigger(el)
    const by = openerOf(event)
    if (store.get().value !== key) {
      return open(key, { reason: "trigger-press", event, by })
    }
    // A click on a trigger the pointer opened keeps it open: the user meant to open it.
    if (
      surface().opener() === "hover" &&
      (by === "pointer" || by === "touch")
    ) {
      return open(key, { reason: "trigger-press", event, by })
    }
    close({ reason: "trigger-press", event })
  }

  const keys = createFocus({
    orientation: () => store.get().orientation,
    value: () => store.get().value,
    list: () => element("list"),
    triggers: () => elements(context, "trigger"),
    links: () => elements(context, "link").map((entry) => entry.el),
    trigger: triggerOf,
    content: (key) => element("content", key),
    panel: () => surface().element(),
    open: (key, event) =>
      open(key, { reason: "trigger-press", event, by: "keyboard" }),
  })
  const topLevel = keys.topLevel

  // A link was pressed: the menu closes, and so does every menu it's nested in.
  function linkPress(event: Event, closeOnSelect: boolean | undefined) {
    if (opensElsewhere(event)) {
      return
    }
    if (!(closeOnSelect ?? options().closeOnSelect ?? true)) {
      return
    }
    close({ reason: "link-press", event })
    parent?.api.internal.linkPress(event, true)
  }

  // Routers call `preventDefault()` on a link's click to navigate on the
  // client, which would skip a handler the framework attaches. A listener on
  // the element hears the click either way, so the menu closes on route changes.
  function bindLink(el: HTMLElement, key: string) {
    let cancelPress = () => {}
    const unlisten = on(el, "click", (event) => {
      cancelPress = afterDispatch(el, event, () =>
        linkPress(
          event,
          context.props<NavigationMenuLinkProps>("link", key)?.closeOnSelect
        )
      )
    })
    return () => {
      unlisten()
      cancelPress()
    }
  }

  // The viewport takes the open content's size.
  const viewportSize = createViewportSize({
    viewport: () => element("viewport"),
    content: () =>
      store.get().value === null
        ? undefined
        : element("content", store.get().value!),
  })
  const writeViewportSize = viewportSize.write
  context.onDestroy(viewportSize.disconnect)

  // Where a surface goes: against its anchor prop, or the trigger, on the side
  // the orientation suggests unless the props say otherwise.
  function placement(
    el: HTMLElement,
    props: () => PlacementProps,
    key: string | null,
    part: Part
  ) {
    return {
      anchor: () =>
        contentAnchor(el, props().anchor, () => triggerOf(key ?? shownItem())),
      // A new orientation moves the side it opens on, like new props.
      rendered(listener: () => void) {
        let { orientation } = store.get()
        const offState = store.subscribe(() => {
          if (store.get().orientation === orientation) {
            return
          }
          orientation = store.get().orientation
          listener()
        })
        const offProps = onProps(part, listener)
        return () => {
          offState()
          offProps()
        }
      },
      position: () =>
        placementOptions(props(), {
          side: store.get().orientation === "vertical" ? "end" : "bottom",
          align: "start",
        }),
    }
  }

  // The viewport joins the popup layer once a content renders into it, so it
  // shows for the first time with that content's size, in its final place.
  // It leaves once it has closed, so the next open waits for its content too.
  let viewportPopup:
    | {
        el: HTMLElement
        config: Parameters<Surface["bind"]>[1]
        unbind?: () => void
      }
    | undefined

  // Returns whether it joined just now.
  function attachViewport() {
    if (!viewportPopup || viewportPopup.unbind) {
      return false
    }
    viewportPopup.unbind = surfaces
      .get(null)!
      .bind(viewportPopup.el, viewportPopup.config)
    return true
  }

  // The first content to render shows the viewport. Measured at once, it's
  // placed for its real size before the browser paints it.
  function showViewport(content: HTMLElement) {
    if (!attachViewport()) {
      return
    }
    viewportSize.measure(content)
    surfaces.get(null)!.place()
  }

  function detachViewport() {
    viewportPopup?.unbind?.()
    if (viewportPopup) {
      viewportPopup.unbind = undefined
    }
  }

  // The viewport binds as soon as it renders, closed or not, so contents know
  // to render into it before any item opens.
  function bindViewport(el: HTMLElement, part: Part) {
    resetPopoverStyles(el.ownerDocument, popupSelectors)
    // Custom elements key a part without a value by a generated id, so it's found by element.
    const props = () =>
      elements<PlacementProps>(context, "viewport")[0]?.props ??
      context.props<PlacementProps>("viewport") ??
      {}
    const viewport = surfaces.get(null)!
    viewportPopup = {
      el,
      config: {
        ...placement(el, props, null, part),
        initialFocus: () => undefined,
      },
    }
    // Last: contents may move in and bind right away, and show the viewport.
    store.set({ viewport: true })
    // Bound again, like into a new container, around content still showing in it.
    const { value } = store.get()
    const shown = value === null ? undefined : element("content", value)
    if (shown && el.contains(shown)) {
      showViewport(shown)
    }
    // Listened to on the element itself, not through the framework: React
    // routes events from portaled contents through its own tree, where the
    // contents aren't inside the viewport.
    const listeners = [
      on(el, "keydown", (event) => {
        // Keys from a nested menu's viewport are its own.
        if (
          ownsEvent(el, event) &&
          !event.defaultPrevented &&
          !isComposing(event)
        ) {
          viewport.keydown(event)
        }
      }),
      on(el, "pointerenter", enterPanel),
      on(el, "pointerleave", leavePanel),
    ]
    return () => {
      listeners.forEach((stop) => stop())
      detachViewport()
      viewportPopup = undefined
      store.set({ viewport: false })
    }
  }

  // A content binds one of three ways: inside the viewport, kept in place
  // while closed next to a viewport, or as its own popup without one.
  function bindContent(
    el: HTMLElement,
    key: string,
    props: { hiddenUntilFound?: boolean },
    part: Part
  ) {
    ensureSurface(key)
    const cleanups: (() => void)[] = []
    const viewport = element("viewport")
    if (viewport?.contains(el)) {
      cleanups.push(bindInViewport(el, key))
    } else {
      // A viewport later in the page binds after its contents. Waiting a
      // microtask lets it, so a content never shows as its own popup first.
      let unbind: (() => void) | undefined
      let cancelled = false
      queueMicrotask(() => {
        if (cancelled || store.get().viewport) {
          return
        }
        resetPopoverStyles(el.ownerDocument, popupSelectors)
        const placed = placement(
          el,
          () => context.props<PlacementProps>("content", key) ?? {},
          key,
          part
        )
        unbind = surfaces
          .get(key)!
          .bind(el, { ...placed, initialFocus: () => undefined })
      })
      cleanups.push(() => {
        cancelled = true
        unbind?.()
      })
    }
    // Find in page follows `hiddenUntilFound` as it renders, and costs
    // nothing while it's off.
    const isFindable = () =>
      !!(context.props<NavigationMenuContentProps>("content", key) ?? props)
        .hiddenUntilFound
    let stopFinding: (() => void) | undefined
    const follow = () => {
      if (isFindable() === !!stopFinding) {
        return
      }
      if (stopFinding) {
        stopFinding()
        stopFinding = undefined
        return
      }
      const findable = bindFindable(el, {
        shown: () => isShown(store.get(), key),
        findable: isFindable,
        reveal: (event) => open(key, { reason: "find-in-page", event }),
      })
      const stops = [findable, store.subscribe(findable.check)]
      // Kept in place, its own width and padding would push the items beside it.
      if (!viewport?.contains(el)) {
        stops.push(
          collapseWhileHidden(el, () => isShown(store.get(), key), store)
        )
      }
      stopFinding = () => {
        findable.check()
        stops.forEach((stop) => stop())
      }
    }
    follow()
    cleanups.push(onProps(part, follow), () => stopFinding?.())
    keys.contentBound(key, el)
    return () => cleanups.forEach((cleanup) => cleanup())
  }

  // A content in the viewport animates in when its item opens, and out when
  // another item takes over, while the viewport stays.
  function bindInViewport(el: HTMLElement, key: string) {
    const stopObserving = viewportSize.observe(el)
    showViewport(el)
    let leaving = false
    let stopAnimation = animateIn(el)
    const unsubscribe = store.subscribe(() => {
      const state = store.get()
      const exiting = state.exiting.includes(key)
      if (exiting && !leaving) {
        leaving = true
        stopAnimation()
        // Content animating out is inert. Focus inside it goes back to its trigger.
        const trigger = triggerOf(key)
        if (el.contains(document.activeElement) && trigger) {
          restoreFocus(trigger)
        }
        // Ahead of the render, for exit keyframes keyed on the state.
        writeOpen(el, false)
        stopAnimation = animateOut(el, () =>
          store.set({
            exiting: store.get().exiting.filter((other) => other !== key),
          })
        )
      } else if (!exiting && leaving && state.value === key) {
        leaving = false
        stopAnimation()
        writeOpen(el, true)
        stopAnimation = animateIn(el)
      }
    })
    return () => {
      unsubscribe()
      stopAnimation()
      stopObserving()
    }
  }

  // The indicator covers the open item's trigger, or the top-level link for
  // the current page while nothing is open.
  function indicator(el: HTMLElement) {
    return bindIndicator(el, {
      target: () =>
        triggerOf(store.get().value) ??
        topLevel().find((item) =>
          item.matches(
            '[data-slot="navigation-menu-link"][aria-current="page"]'
          )
        ),
      watched: () => [element("list"), ...topLevel()],
      root: () => element("root"),
      onChange: api.internal.watch,
    })
  }

  const api = {
    /** The open item's value, or null when every panel is closed. */
    getValue: () => store.get().value,
    /** Opens an item's panel, or closes the open one with `null`. Returns false when canceled. */
    setValue(
      value: string | null,
      { reason = "imperative", event }: ChangeOptions<string> = {}
    ) {
      return value === null
        ? close({ reason, event })
        : open(value, { reason, event })
    },
    /** Whether a panel is open. */
    isOpen: () => store.get().value !== null,
    /** Closes the open panel. Returns false when canceled or already closed. */
    close: ({ reason = "imperative", event }: ChangeOptions<string> = {}) =>
      close({ reason, event }),
    /** Moves focus to an item's trigger: the open one, or the first one, without a value. */
    focus(value?: string) {
      const key = value ?? store.get().value
      ;(key === null
        ? elements(context, "trigger")[0]?.el
        : triggerOf(key)
      )?.focus()
    },
    internal: {
      options,
      // The viewport contents render into, once it's bound.
      viewportElement: () => element("viewport"),
      surface,
      ensureSurface,
      surfaces,
      hoverEnter,
      hoverMove(event: PointerEvent, key: string, disabled?: boolean) {
        if (aim.active() && store.get().value !== key) {
          hoverEnter(event, key, disabled)
        }
      },
      leaveTrigger,
      enterPanel,
      triggerPress,
      listKeydown: keys.listKeydown,
      panelKeydown: keys.panelKeydown,
      rootKeydown: keys.rootKeydown,
      linkPress,
      leavePanel,
      // Listens for the open item to change, like a nested menu watching its parent.
      watch(listener: (value: string | null) => void) {
        let value = store.get().value
        return store.subscribe(() => {
          if (store.get().value === value) {
            return
          }
          value = store.get().value
          listener(value)
        })
      },
      bindViewport,
      bindContent,
      bindLink,
      bindIndicator: indicator,
      // Whether an item's content renders inside the viewport: while its item
      // is open or animating out. Closed contents kept in the page stay with
      // their item, in the server's HTML too.
      inViewport(key: string) {
        const state = store.get()
        return state.viewport && state.mounted && isShownInViewport(state, key)
      },
    },
  }

  return api
}

const navigationMenuApi: (
  ...args: Parameters<typeof navigationMenuApiBody>
) => NavigationMenuApi = navigationMenuApiBody

// Whether a content shows in the viewport: open, the last open while the
// viewport animates out, or animating out after a switch.
function isShownInViewport(state: NavigationMenuStoreState, key: string) {
  return (
    key === state.value ||
    (state.value === null && key === state.active) ||
    state.exiting.includes(key)
  )
}

// Whether a content shows at all, in the viewport or as its own popup.
function isShown(state: NavigationMenuStoreState, key: string) {
  if (state.viewport) {
    return state.mounted && isShownInViewport(state, key)
  }
  return key === state.value || state.contents.includes(key)
}

// Closing unmounts the panel, and a browser flushes microtasks between
// listeners, so closing from the link's own listener would remove it before a
// handler delegated higher up, like React's, hears the click.
function afterDispatch(el: HTMLElement, event: Event, run: () => void) {
  const view = el.ownerDocument.defaultView
  // A click on a detached element never reaches the window.
  if (!view || !el.isConnected) {
    run()
    return () => {}
  }
  const cancel = () => {
    view.removeEventListener(event.type, finish)
    view.clearTimeout(timer)
  }
  const finish = () => {
    cancel()
    run()
  }
  const timer = view.setTimeout(finish)
  view.addEventListener(event.type, finish, { once: true })
  return cancel
}

export {
  isShown,
  type NavigationMenuApi,
  navigationMenuApi,
  type NavigationMenuInternalOptions,
  type NavigationMenuStoreState,
}
