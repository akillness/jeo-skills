// What a preset adds to `createPopup`, each in its own function or object so
// a bundler keeps only the ones a popup's preset names: placement beside the
// trigger, opening on a press, on hover and on keyboard focus, tooltips'
// warm group, a dialog named after its trigger, and undoing the browser's
// popover styles.
import { elements } from "../kernel/elements"
import { whenKept } from "../kernel/keep"
import { isFocusFromKeyboard } from "../kernel/modality"
import { openAttrs } from "../kernel/attrs"
import { isBrowser } from "../platform/env"
import {
  position,
  preparePosition,
  type Anchor,
  type PositionProps,
} from "../platform/position"
import { type Side } from "../platform/sides"
import { composedTabbables } from "../focus/tabbable"
import { accessibleName } from "../text/accessible-name"
import type { PopupCore, PopupState } from "./create-popup"
import { createHoverIntent } from "./hover"
import {
  disabledTriggerAttrs,
  openerOf,
  popupTriggerAttrs,
  prepareReset,
  resetPopoverStyles,
} from "./popup"
import type { PopupContentProps, PopupTriggerProps } from "./popup-slots"

// What a popup is placed against: its content's `anchor` setting, else
// `fallback`. A selector is looked up in the content's own root first, like
// the shadow root it renders in, then in the document.
function contentAnchor(
  el: HTMLElement,
  setting: Anchor | string | null | undefined,
  fallback: () => Anchor | null | undefined
) {
  if (typeof setting !== "string") {
    return setting ?? fallback()
  }
  const root = el.getRootNode() as ParentNode
  const own =
    root === el.ownerDocument ? null : root.querySelector<HTMLElement>(setting)
  return own ?? el.ownerDocument.querySelector<HTMLElement>(setting)
}

// What `position` reads on every check, from the content's newest props and
// the component's defaults. Each component names its own `align`.
function placementOptions(
  props: PositionProps,
  defaults: {
    side?: Side
    align: NonNullable<PositionProps["align"]>
    sideOffset?: number
    alignOffset?: number
  },
  arrow?: HTMLElement
) {
  return {
    side: props.side ?? defaults.side ?? "bottom",
    align: props.align ?? defaults.align,
    sideOffset: props.sideOffset ?? defaults.sideOffset ?? 4,
    alignOffset: props.alignOffset ?? defaults.alignOffset ?? 0,
    collisionPadding: props.collisionPadding,
    arrow,
    arrowPadding: props.arrowPadding,
  }
}

// Placed beside its anchor, which flips and stays on screen. `prepare` runs
// once an instance is kept, ahead of the first open.
const placement = {
  position,
  prepare: () => whenKept(preparePosition),
  anchor: contentAnchor,
  options: placementOptions,
}

// A popup a press opens: a press on the trigger opens and closes it, another
// trigger takes the open popup over, and a press on one the pointer opened
// keeps it open. The trigger is a button that says what it opens, and the
// popup takes focus and is named by its title or trigger.
function pressOpening(core: PopupCore) {
  const { store, preset } = core

  function press(key: string, props: PopupTriggerProps, event?: Event) {
    if (props.disabled) {
      return
    }
    const by = openerOf(event)
    if (!store.get().open) {
      return core.control.show({
        event,
        by,
        reason: "trigger-press",
        trigger: key,
        payload: props.payload,
      })
    }
    const active = store.get().trigger
    if (active !== null && active !== key) {
      return core.control.takeOver({
        trigger: key,
        payload: props.payload,
        reason: "trigger-press",
        event,
      })
    }
    if (core.popup.opener() === "hover") {
      return core.control.show({ event, by })
    }
    core.control.hide({ reason: "trigger-press", event })
  }

  return {
    press,
    // Elements other than buttons need Enter and Space wired up. Says whether it took the key.
    keydown(
      event: KeyboardEvent,
      el: HTMLElement,
      key: string,
      props: PopupTriggerProps
    ) {
      if (
        el.tagName === "BUTTON" ||
        (event.key !== "Enter" && event.key !== " ")
      ) {
        return false
      }
      event.preventDefault()
      press(key, props, event)
      return true
    },
    // A press on another trigger takes the popup over instead of closing and
    // reopening it. Focus moving there still leaves it.
    contains: (target: Node, event?: Event) =>
      !!event &&
      elements<PopupTriggerProps>(core, core.triggerSlot).some(
        ({ el, props }) => el.contains(target) && !props.disabled
      ),
    // Where focus goes on open: the content's `initialFocus`. `"auto"` picks
    // what the popup prefers, like a dialog's autofocused element, else the
    // first focusable element, else the content itself.
    initialFocus(
      content: HTMLElement,
      setting: PopupContentProps["initialFocus"] = "auto",
      preferred?: () => HTMLElement | undefined
    ) {
      if (setting === "none") {
        return
      }
      if (setting === "content") {
        return content
      }
      if (setting === "auto") {
        return preferred?.() ?? composedTabbables(content)[0] ?? content
      }
      if (typeof setting === "function") {
        return setting() ?? content
      }
      if (typeof setting === "string") {
        return content.querySelector<HTMLElement>(setting) ?? content
      }
      return isBrowser && setting instanceof HTMLElement ? setting : content
    },
    // Named by its title, else its trigger, and described by its description.
    // Until the content binds, as on the server, the trigger names it: a title
    // may not render, and a missing one would leave it with no name at all.
    // Only a popup that can present as a sheet says how it presents.
    contentAttrs: (
      state: PopupState,
      id: string,
      role: string | undefined
    ) => ({
      "aria-labelledby": role
        ? state.titled
          ? `${id}-title`
          : `${id}-trigger`
        : undefined,
      "aria-describedby": state.described ? `${id}-description` : undefined,
      "aria-modal":
        (role === "dialog" || role === "alertdialog") && state.modal === true
          ? "true"
          : undefined,
      "data-presentation": preset.presentation && state.presentation,
    }),
    // A button that says what kind of popup it opens, and whether it's open.
    // Content without a role, like a navigation menu's panel, is no popup to name.
    triggerAttrs(
      state: PopupState,
      id: string,
      key: string,
      props: PopupTriggerProps,
      role?: string
    ) {
      const haspopup =
        role === "menu" || role === "listbox" ? role : role && "dialog"
      return {
        ...popupTriggerAttrs(state, id, haspopup ?? "", key),
        "aria-haspopup": haspopup,
        type: "button",
        ...disabledTriggerAttrs(props),
      }
    },
  }
}

// Popovers and hover cards the pointer opened. Another one opening by hover
// closes them, unless its trigger is inside them, so they don't pile up when
// a trigger sits in the area between one's trigger and popup.
const hoverOpened = new Set<PopupCore>()

function closeOtherHovered(
  core: PopupCore,
  trigger: Node | undefined,
  event: PointerEvent
) {
  for (const other of hoverOpened) {
    const popup = other.popup.element()
    if (!other.store.get().open || other.popup.opener() !== "hover") {
      hoverOpened.delete(other)
    } else if (
      other !== core &&
      !popup?.contains(trigger ?? null) &&
      !popup?.contains(document.activeElement)
    ) {
      other.control.hide({ reason: "trigger-hover", event, focus: false })
    }
  }
}

// Resting the pointer on a trigger opens it after `delay`, always for a hover
// preset and with `openOnHover` for the others. The pointer may cross the gap
// between the trigger and the popup; leaving the area that spans both closes
// it after `closeDelay`. Another trigger takes the open popup over at once.
function hoverOpening(core: PopupCore, group?: ReturnType<typeof warmGroup>) {
  const { store, options, preset } = core
  core.onDestroy(() => hoverOpened.delete(core))
  const intent = createHoverIntent({
    trigger: core.triggerElement,
    popup: () => core.popup.element(),
    closesOnLeave: () => store.get().open && core.popup.opener() === "hover",
    closeDelay: () => options().closeDelay ?? preset.closeDelay ?? 0,
    close(event) {
      // Someone working inside the popup keeps it open.
      if (core.popup.element()?.contains(document.activeElement)) {
        return
      }
      core.control.hide({ reason: "trigger-hover", event, focus: false })
    },
  })
  // A pending open or close never fires once the popup is gone.
  core.onDestroy(intent.clear)
  const opens = () =>
    (!preset.press || !!options().openOnHover) && !options().disabled
  const leave = (event: PointerEvent) => opens() && intent.leave(event)

  return {
    clear: intent.clear,
    // The pointer entered a trigger, with its key, or the content, without one.
    enter(event: PointerEvent, key?: string, payload?: unknown) {
      if (!opens()) {
        return
      }
      if (key === undefined) {
        return intent.enter(event)
      }
      // Disabled while the delay ran, it stays closed.
      const open = () => {
        if (!opens() || core.triggerDisabled(key)) {
          return
        }
        if (!group) {
          closeOtherHovered(core, core.element(core.triggerSlot, key), event)
          hoverOpened.add(core)
        }
        core.control.show({
          by: "hover",
          event,
          reason: "trigger-hover",
          trigger: key,
          payload,
        })
      }
      if (store.get().open) {
        intent.enter(event)
        if (store.get().trigger !== key) {
          open()
        }
        return
      }
      const delay = options().delay ?? preset.delay ?? 300
      intent.enter(event, open, group ? group.delay(delay) : delay)
    },
    leave,
    // The pointer left the content, unless onto the trigger.
    leaveContent(event: PointerEvent) {
      const target = event.relatedTarget as Node | null
      if (!target || !core.triggerElement()?.contains(target)) {
        leave(event)
      }
    },
  }
}

// Keyboard focus resting on a trigger opens it after `focusDelay`, else
// `delay`, and focus leaving the trigger closes what focus opened, unless it
// moved into the popup. Focus a popup moved in or back, or that came back
// with the window, isn't keyboard use. Such a trigger, often a link, keeps its
// own role, and a tooltip describes it.
function focusOpening(core: PopupCore) {
  const { store, options, preset } = core
  let timer: ReturnType<typeof setTimeout> | undefined
  const clear = () => clearTimeout(timer)
  core.onDestroy(clear)

  return {
    clear,
    enter(key: string, payload: unknown, event: FocusEvent) {
      if (options().disabled || !isFocusFromKeyboard()) {
        return
      }
      const open = () => {
        // Focus may have moved on, or the trigger been disabled, while waiting.
        if (
          !options().disabled &&
          !core.triggerDisabled(key) &&
          core.element(core.triggerSlot, key)?.contains(document.activeElement)
        ) {
          core.control.show({
            by: "keyboard",
            event,
            reason: "trigger-focus",
            trigger: key,
            payload,
          })
        }
      }
      const wait = preset.focusDelay ?? options().delay ?? preset.delay ?? 0
      clear()
      // An open popup moves to this trigger at once, as it does for the pointer,
      // and one the pointer opened becomes the keyboard's, so it stays open.
      if (store.get().open) {
        open()
        return
      }
      if (wait > 0) {
        timer = setTimeout(open, wait)
      } else {
        open()
      }
    },
    leave(event: FocusEvent) {
      clear()
      if (!store.get().open || core.popup.opener() === "hover") {
        return
      }
      const next = event.relatedTarget as Node | null
      if (
        next &&
        (core.popup.element()?.contains(next) ||
          [...core.parts()].some(
            (part) =>
              part.slot === core.triggerSlot &&
              part.el?.contains(next) &&
              !core.triggerDisabled(part.key)
          ))
      ) {
        return
      }
      core.control.hide({ reason: "focus-out", event, focus: false })
    },
    // Tab from the trigger moves into open content only when it has something
    // to focus. Says whether it leaves Tab to the browser.
    keydown(event: KeyboardEvent) {
      const content = core.popup.element()
      return (
        event.key === "Tab" && !(content && composedTabbables(content).length)
      )
    },
    triggerAttrs(
      state: PopupState,
      id: string,
      key: string,
      props: PopupTriggerProps,
      role?: string
    ) {
      const active = state.trigger === null || state.trigger === key
      return {
        ...openAttrs(state.open && active),
        "aria-describedby":
          role === "tooltip" && active ? `${id}-content` : undefined,
        "data-disabled": props.disabled ? "" : undefined,
      }
    },
  }
}

const nameOf = (el: HTMLElement | undefined) =>
  (el && accessibleName(el)) || undefined

// Named by its title, else by the name of the trigger it opened from, or its
// first trigger, read with its attributes: a modal dialog makes the rest of
// the page inert, its trigger included, so the trigger can't name it by
// reference. Read, not kept in state, so opening it through its `open` option
// writes nothing while a framework hands the option over. Until the parts
// bind, as on the server, its title names it.
function triggerName(core: PopupCore) {
  return {
    // Only a dialog that makes the page inert is modal to assistive
    // technology. One that only traps focus leaves the page usable.
    contentAttrs: (state: PopupState, id: string) => ({
      "aria-labelledby": state.titled !== false ? `${id}-title` : undefined,
      "aria-label":
        state.titled === false ? nameOf(core.triggerElement()) : undefined,
      "aria-modal": state.modal === true ? "true" : undefined,
    }),
  }
}

// Tooltips open at once while another one is open or closed a moment ago, so
// moving along a toolbar shows each without waiting, and only one is open at
// a time. Module state, so there's no provider and nothing re-renders.
const warmFor = 400
const warm = {
  close: undefined as ((event?: Event) => void) | undefined,
  closedAt: -Infinity,
}
const isWarm = () => !!warm.close || performance.now() - warm.closedAt < warmFor

// Why the open tooltip closes when another one opens, from the event that
// opened the other: focus or the pointer moved on, or a press landed elsewhere.
function takeoverReason(event?: Event) {
  if (!event) {
    return "imperative"
  }
  if (event.type.startsWith("focus")) {
    return "focus-out"
  }
  if (event.type.startsWith("pointer")) {
    return "trigger-hover"
  }
  return "outside-press"
}

function warmGroup(core: PopupCore) {
  const closeForOther = (event?: Event) =>
    core.control.hide({ reason: takeoverReason(event), event })
  function closeOthers(event?: Event) {
    if (warm.close !== closeForOther) {
      warm.close?.(event)
    }
  }
  let instant = false
  core.onDestroy(() => {
    if (warm.close === closeForOther) {
      warm.close = undefined
    }
  })

  return {
    delay: (delay: number) => (isWarm() ? 0 : delay),
    // The one taking over closes the open one, the way the pointer or focus left it.
    opening: closeOthers,
    change(open: boolean) {
      if (open) {
        instant = isWarm()
        closeOthers()
        warm.close = closeForOther
        return
      }
      if (warm.close !== closeForOther) {
        return
      }
      warm.close = undefined
      warm.closedAt = performance.now()
    },
    // Whether the last open skipped its delay, because another was warm.
    instant: () => instant,
    // One open from the start is the open one too, once its content is in the
    // page. Not in `api`, which may run for an instance a framework discards.
    join() {
      if (core.store.get().open && !warm.close) {
        warm.close = closeForOther
      }
    },
  }
}

// The content's and backdrop's selectors, one list per component, so it's
// prepared once however many instances there are.
const resetSelectors = new Map<string, string[]>()

// Undoes the browser's own popover styles, including `overflow: auto`, which
// turns content with an arrow sticking out into a scroller Tab stops on.
const styleReset = {
  // Written ahead of the first open, once the instance is kept, so never on
  // a server, from the names the parts' `data-slot` has unless the primitive
  // has a `label`. Binding writes each part's own anyway.
  prepare(name: string, contentSlot: string) {
    const key = `${name}-${contentSlot}`
    const known = resetSelectors.get(key) ?? [
      `[data-slot="${key}"]`,
      `[data-slot="${name}-backdrop"]`,
    ]
    resetSelectors.set(key, known)
    whenKept(() => prepareReset(known))
  },
  bind(el: HTMLElement) {
    resetPopoverStyles(el.ownerDocument, [
      `[data-slot="${el.getAttribute("data-slot")}"]`,
    ])
  },
}

export {
  contentAnchor,
  focusOpening,
  hoverOpening,
  placement,
  placementOptions,
  pressOpening,
  styleReset,
  triggerName,
  warmGroup,
}
