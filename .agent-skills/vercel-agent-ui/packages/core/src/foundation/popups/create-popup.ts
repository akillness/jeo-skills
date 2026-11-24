// Popups an agent can put together: `createPopup` in a primitive's `api`,
// its parts from `popupSlots` and its state from `popupState`. The preset is
// a value, like `hoverCardPreset`, that carries the behavior its WAI-ARIA
// pattern needs and the code for it: placement, hover and focus opening, the
// sheet. This file imports none of that, so a popup bundles only what its
// preset names.
import { deriveFromOptions } from "../kernel/derive"
import { createChange } from "../kernel/input-source"
import { elements } from "../kernel/elements"
import type { ChangeDetails } from "../kernel/details"
import type {
  Part,
  PrimitiveContext,
  ReasonFor,
} from "../kernel/primitive-types"
import type { Store } from "../kernel/store"
import type { Layer } from "../platform/layers"
import type { DismissRules } from "./dismissal"
import type { PopupBehavior } from "./popup-behavior"
import {
  createPopupLayer,
  modalTriple,
  type Modal,
  type PopupClose,
  type PopupCloseReason,
  type PopupController,
  type PopupModal,
  type PopupOpener,
  type ReturnMode,
} from "./popup"
import { createOpenSteps } from "./popup-steps"
import type { PopupPreset } from "./popup-presets"
import type { PopupContentProps } from "./popup-slots"
import type { PresentationSetting, SheetConfig } from "./presentation"

/** The options `createPopup` reads from the primitive's, when it has them. */
type PopupOptions = {
  open?: boolean
  defaultOpen?: boolean
  // A method, which TypeScript checks loosely, so a primitive whose details
  // carry more, like a trigger menu's `trigger`, still fits.
  onOpenChange?(open: boolean, details: ChangeDetails<any>): void
  onOpenChangeComplete?: (open: boolean) => void
  onPayloadChange?: (payload: unknown, details: ChangeDetails<any>) => void
  modal?: Modal
  presentation?: PresentationSetting<string>
  openOnHover?: boolean
  delay?: number
  closeDelay?: number
  disabled?: boolean
  dismissible?: boolean
  onDismissAttempt?: (details: never) => void
}

/**
 * The state a popup keeps. `popupState` makes it.
 * @experimental
 */
type PopupState = {
  /** Whether it's open. False as soon as it starts closing, while `mounted` stays true through the exit animation. */
  open: boolean
  /** True while it's in the page, including while it animates out. */
  mounted: boolean
  /** The trigger that opened it last, by key. Null until a trigger binds. */
  trigger: string | null
  /** The payload of the last open. */
  payload: unknown
  /**
   * Whether a title is rendered, which names it. `null` until the parts bind,
   * while a title may still render, as on the server.
   */
  titled: boolean | null
  /** Whether a description is rendered, which describes it. */
  described: boolean
  /** The `modal` in effect, from the option, the preset and the presentation. */
  modal: Modal
  /** How it presents while open, decided as it opens. */
  presentation: "popover" | "dialog" | "sheet"
}

/**
 * What a preset's features reach: the popup's state, options and parts, the
 * popup layer, its control and its trigger. The api's `internal` is this
 * object, with the features and what the parts call added.
 */
type PopupCore = {
  label: string
  role: PopupPreset["role"]
  store: Store<PopupState>
  options: () => PopupOptions
  onOptions: (listener: () => void) => void
  onDestroy: (cleanup: () => void) => void
  element: (slot: string, key?: string) => HTMLElement | undefined
  parts: () => Iterable<Part>
  preset: PopupPreset
  popup: ReturnType<typeof createPopupLayer<PopupState, string>>
  control: ReturnType<typeof createOpenSteps<string>>
  triggerElement: () => HTMLElement | undefined
  triggerSlot: string
  triggerDisabled: (key: string) => boolean
  contentProps: (key?: string) => PopupContentProps
  rules?: PopupRules
}

/**
 * What only one popup does, beside its preset's behavior, for a component
 * whose rules no preset has, like a dialog that waits for an action. Each is
 * optional and replaces or extends what `createPopup` does at that step. Our
 * components' escape hatch, typed but not documented.
 * @internal
 */
type PopupRules = DismissRules & {
  /** Asks to close for a dismissal the popup layer saw, like Escape or an outside press. Closes by default. */
  dismiss?: (
    reason: PopupCloseReason,
    details: { event?: Event; focus: ReturnMode; returnValue?: string }
  ) => void
  /** The element it opens from, for placement, nesting and focus return, when that isn't its trigger slot's, like a combobox's input. */
  trigger?: () => HTMLElement | undefined
  /** Whether a close returns focus when its request doesn't say, like after an item is chosen. True by default; false for a list whose focus stays in an input. */
  returnFocus?: boolean
  /** Whether a press on something outside the popup counts as inside. Its triggers do by default. */
  contains?: (target: Node, event?: Event) => boolean
  /** Elements that stay usable while the popup makes the page inert. Presses on them never dismiss it. */
  persistent?: () => Element[]
  /** Escape while it's the topmost layer. Closes by default. */
  onEscape?: (event: KeyboardEvent) => void
  /** Runs as it shows, with its layer. Returns a cleanup for when it hides. */
  onShow?: (layer: Layer) => (() => void) | void
  /** More of what `onOpenChange` hears, like which character opened a trigger menu. */
  details?: () => object
  /** Runs as it starts opening or closing, with why it closed. */
  onOpenChange?: (open: boolean, closed?: PopupClose) => void
  /** Runs once opening or closing has finished, after any animation. */
  onOpenChangeComplete?: (open: boolean, closed?: PopupClose) => void
  /**
   * Decides an open: call `open` to go on, with how it opens when the rules
   * decide that, or return without calling it to refuse. The request has what
   * the controller's `open()` was passed.
   */
  open?: (
    request: {
      trigger?: string
      event?: Event
      by?: PopupOpener
      [option: string]: unknown
    },
    open: (by?: PopupOpener) => boolean
  ) => void
  /** Decides a close: call `close` to go on, or return without calling it to stay open. */
  close?: (
    request: { reason: string; event?: Event },
    close: () => boolean
  ) => void
  /** What the content's `initialFocus` of `"auto"` prefers to its first focusable element, like an autofocused one. */
  preferredFocus?: () => HTMLElement | undefined
  /** More of what its content binds with, like a sheet's snap points. */
  bind?: () => Partial<SheetConfig>
  /** The layer it nests under, like a submenu's under its parent menu. By default, the open popup around its trigger. */
  parent?: () => Layer | undefined
  /** What being modal does while it shows, when the `modal` in its state doesn't say it all, like a submenu that never locks the page. */
  modal?: () => PopupModal
  /** How it asks to present, when that isn't its `presentation` option, like a context menu that's always a popover. */
  presentation?: () => PresentationSetting<string> | undefined
  /** An open popup asked to open again. Another trigger takes it over by default. */
  reopen?: (request: {
    trigger?: string
    event?: Event
    [option: string]: unknown
  }) => void
}

// What a preset's feature makes: there when the preset names it, which a
// preset written with `satisfies PopupPreset` shows.
type Feature<Preset extends PopupPreset, Key extends keyof PopupPreset> =
  NonNullable<PopupPreset[Key]> extends (...args: never[]) => infer Made
    ? Preset extends Required<Pick<PopupPreset, Key>>
      ? Made
      : Made | undefined
    : never

// The controller methods `createPopup` returns, typed by the primitive's
// `controller` option when it has one, else by its reasons.
type PopupMethod =
  "isOpen" | "setOpen" | "open" | "close" | "toggle" | "getPayload" | "focus"
type ControllerOf<Options> = Options extends { controller?: infer Controller }
  ? NonNullable<Controller>
  : never
type PopupApiOf<Options> = [ControllerOf<Options>] extends [never]
  ? PopupController<
      unknown,
      ReasonFor<Options, "open">,
      {},
      string,
      // Without `onPayloadChange`, an open names the reasons `onOpenChange` lists.
      string extends ReasonFor<Options, "payload">
        ? ReasonFor<Options, "open">
        : Extract<ReasonFor<Options, "payload">, ReasonFor<Options, "open">>
    >
  : Pick<
      ControllerOf<Options>,
      Extract<keyof ControllerOf<Options>, PopupMethod>
    >

/**
 * Makes a primitive a popup. Call it in `api`, spread `popupSlots(slot)`
 * into `slots` and `popupState(options)` into `state`. It brings the top
 * layer, presence, Escape, outside presses, focus moving in and back,
 * modality, nesting under other popups, several triggers that each hand the
 * content a `payload`, and server rendering.
 *
 * `preset` is the behavior: `popoverPreset` from `@ui-sdk/core/popover`,
 * `dialogPreset` from `@ui-sdk/core/dialog`, `tooltipPreset` from
 * `@ui-sdk/core/tooltip` or `hoverCardPreset` from `@ui-sdk/core/hover-card`.
 * Each follows its WAI-ARIA
 * pattern: how Tab, Escape, outside presses and the window losing focus
 * behave, whether it's placed beside its trigger, whether a press, resting
 * the pointer or keyboard focus opens it, the content's role and the `modal`
 * it has unless the primitive's option says. It carries the code for that
 * too, so a popup bundles only its own preset's.
 *
 * It reads `open`, `modal`, `presentation`, `openOnHover`, `delay`,
 * `closeDelay`, `disabled`, `dismissible` and `onDismissAttempt` from the
 * primitive's options when it has them, and changes `open` and `payload`
 * through `createChange`, so `onOpenChange` and `onPayloadChange` hear every
 * reason: `trigger-press`, `trigger-hover`, `trigger-focus`, `escape-key`,
 * `outside-press`, `focus-out`, `window-blur`, `close-press` and `imperative`.
 *
 * Returns the api a popup controller drives, `{ isOpen, setOpen, open, close,
 * toggle, getPayload, focus }`, plus `internal`, which the parts call. Spread
 * it to add methods.
 *
 * @example
 * api: (context) => createPopup(context, { preset: hoverCardPreset }),
 * @example
 * api: (context) => ({ ...createPopup(context, { preset: popoverPreset }), pick }),
 *
 * @experimental
 */
function createPopup<
  Options extends PopupOptions,
  State extends PopupState,
  Preset extends PopupPreset,
>(
  primitiveContext: PrimitiveContext<Options, State, string>,
  config: {
    /** The behavior, like `popoverPreset` or `hoverCardPreset`. */
    preset: Preset
    /**
     * The slot that is the popup.
     * @defaultValue "content"
     */
    slot?: string
    /**
     * The slot that opens it.
     * @defaultValue "trigger"
     */
    trigger?: string
    /**
     * The content's role, like `"alertdialog"`.
     * @defaultValue the preset's
     */
    role?: PopupPreset["role"]
    /**
     * What only this popup does, from its core, beside the preset's behavior.
     * @internal
     */
    rules?: (core: PopupCore) => PopupRules
    /**
     * Its behavior where it differs from its preset's, like a submenu that stays open when the window loses focus.
     * @internal
     */
    behavior?: Partial<PopupBehavior>
  }
) {
  // The popup reads only the keys above, so it works on those. The
  // primitive's own options and state have more.
  const context = primitiveContext as unknown as PrimitiveContext<
    PopupOptions,
    PopupState,
    string
  >
  const { store, element, options } = context
  const { preset } = config
  const contentSlot = config.slot ?? "content"
  const triggerSlot = config.trigger ?? "trigger"
  const change = createChange(context)

  // The content part's latest props. Custom elements key parts by a generated
  // id, so without the bound key the content is looked up by element.
  // Positioning passes the key, since it reads every frame.
  const contentProps = (key?: string) =>
    ((key !== undefined && context.props(contentSlot, key)) ||
      elements(context, contentSlot)[0]?.props ||
      context.props(contentSlot) ||
      {}) as PopupContentProps

  // The trigger that opened the popup last, or the first one.
  const triggerElement = () => {
    if (rules?.trigger) {
      return rules.trigger()
    }
    const key = store.get().trigger
    return (key !== null && element(triggerSlot, key)) || element(triggerSlot)
  }
  // Only the trigger that opened it, so focus never returns to another one once that one is gone.
  // An open after that trigger was already gone, from code or the `open` option, falls back like
  // `triggerElement`, and so does a popup's only trigger, like the same button rendered again.
  let goneAtOpen: string | null = null
  // A popup that mounts open has no triggers yet when it opens, so it counts them as it closes.
  let onlyTrigger: boolean | undefined
  const openedFrom = () => {
    const key = store.get().trigger
    if (rules?.trigger || key === null || key === goneAtOpen) {
      return triggerElement()
    }
    const only = onlyTrigger ?? elements(context, triggerSlot).length <= 1
    return (
      element(triggerSlot, key) ?? (only ? element(triggerSlot) : undefined)
    )
  }
  // Before the layer's own listener, which reads `openedFrom` as the popup shows.
  let wasOpen = store.get().open
  store.subscribe(() => {
    const { open, trigger } = store.get()
    if (open === wasOpen) {
      return
    }
    wasOpen = open
    if (!open) {
      return
    }
    goneAtOpen =
      trigger !== null && !element(triggerSlot, trigger) ? trigger : null
    onlyTrigger = elements(context, triggerSlot).length <= 1
  })

  const core: PopupCore = {
    label: context.label,
    role: config.role ?? preset.role,
    store,
    options,
    onOptions: context.onOptions,
    onDestroy: context.onDestroy,
    element,
    parts: context.parts,
    preset,
    // The layer and the steps are made last, since they call the features,
    // which reach them through these once something happens.
    get popup() {
      return popup
    },
    get control() {
      return control
    },
    triggerElement,
    triggerSlot,
    triggerDisabled: (key) =>
      !!context.props<{ disabled?: boolean }>(triggerSlot, key)?.disabled,
    contentProps,
  }
  const rules = (core.rules = config.rules?.(core))
  const dismissal = preset.dismissal?.(options, rules)
  const presentation = preset.presentation?.(core, dismissal)
  const press = preset.press?.(core)
  const group = preset.group?.(core)
  const hover = preset.hover?.(core, group)
  const focus = preset.focus?.(core)
  const triggerName = preset.triggerName?.(core)
  preset.resetStyles?.prepare(context.label, contentSlot)
  preset.placement?.prepare()

  // The app's `modal`, else modal while it presents as a sheet, like iOS's
  // sheets, else the preset's. A preset without one leaves `modal` to the
  // primitive, like Dialog's, or is never modal, like hover content, which
  // WCAG 1.4.13 needs dismissible without trapping anyone.
  function modalOf(arriving: PopupOptions, state: PopupState) {
    if (preset.modal === undefined) {
      return
    }
    return {
      modal:
        arriving.modal ??
        (state.presentation === "sheet" ? true : preset.modal),
    }
  }
  function updateModal() {
    const patch = modalOf(options(), store.get())
    if (patch) {
      store.set(patch)
    }
  }
  // A dismissal the popup layer saw, like Escape or an outside press.
  function dismiss(
    reason: PopupCloseReason,
    details: { event?: Event; focus: ReturnMode; returnValue?: string }
  ) {
    if (rules?.dismiss) {
      rules.dismiss(reason, details)
    } else {
      control.hide({ reason, ...details })
    }
  }

  const popup = createPopupLayer<PopupState, string>({
    ...config.behavior,
    preset: preset.behavior,
    position: preset.placement?.position,
    owner: { component: context.label, id: context.id },
    store,
    trigger: triggerElement,
    returnTrigger: openedFrom,
    contains: (target, event) =>
      rules?.contains
        ? rules.contains(target, event)
        : !!triggerElement()?.contains(target) ||
          !!press?.contains(target, event),
    close: dismiss,
    modal: () => rules?.modal?.() ?? modalTriple(store.get().modal),
    parent: () => rules?.parent?.(),
    persistent: () => rules?.persistent?.() ?? [],
    finalFocus: () => contentProps().finalFocus,
    onEscape: (event) =>
      rules?.onEscape
        ? rules.onEscape(event)
        : dismiss("escape-key", { event, focus: true }),
    onShow: (layer) => rules?.onShow?.(layer),
    onOpenChange(open, closed) {
      rules?.onOpenChange?.(open, closed)
      group?.change(open)
      if (open) {
        presentation?.open()
        updateModal()
        return
      }
      hover?.clear()
      focus?.clear()
    },
    onOpenChangeComplete(open, closed) {
      rules?.onOpenChangeComplete?.(open, closed)
      options().onOpenChangeComplete?.(open)
    },
  })
  const control = createOpenSteps<string>({
    dismissal,
    popup,
    store,
    payload: preset.payload?.(store, (payload, details) =>
      change("payload", payload, details)
    ),
    change: (open, details) =>
      change("open", open, { ...details, ...rules?.details?.() }),
    onDestroy: context.onDestroy,
    // Read on every close, once the rules exist.
    get returnFocus() {
      return rules?.returnFocus
    },
    rules: {
      // A pending hover open or close never fires once something else opens it.
      open(request, open) {
        hover?.clear()
        group?.opening(request.event)
        if (rules?.open) {
          rules.open(request, open)
        } else {
          open()
        }
      },
      // Another trigger that shares the open popup takes it over, with its payload.
      reopen(request) {
        hover?.clear()
        if (rules?.reopen) {
          return rules.reopen(request)
        }
        const { trigger, payload, payloadReason, event } = request
        if (trigger !== undefined && trigger !== store.get().trigger) {
          control.takeOver({ trigger, payload, reason: payloadReason, event })
        }
      },
      close: (request, close) =>
        rules?.close ? rules.close(request, close) : close(),
    },
  })

  updateModal()
  deriveFromOptions(context, ["modal"], (synced, state, arriving) =>
    modalOf(arriving as PopupOptions, { ...state, ...synced })
  )
  // Whatever changes `modal` while the popup shows, its option, a sheet's
  // snap point or the primitive's own state, applies to the page at once.
  let modalShown = store.get().modal
  store.subscribe(() => {
    const { modal } = store.get()
    if (modal === modalShown) {
      return
    }
    modalShown = modal
    popup.updateModal()
  })

  // Typed as there when the preset names it, which TypeScript can't tell from the calls.
  const features = {
    dismissal,
    presentation,
    press,
    group,
    hover,
    focus,
    triggerName,
    rules,
  } as {
    dismissal: Feature<Preset, "dismissal">
    presentation: Feature<Preset, "presentation">
    press: Feature<Preset, "press">
    group: Feature<Preset, "group">
    hover: Feature<Preset, "hover">
    focus: Feature<Preset, "focus">
    triggerName: Feature<Preset, "triggerName">
    rules: typeof rules
  }

  // The control runs on plain strings. Callers see the methods the
  // primitive's own controller types, or the reasons its `onOpenChange` and
  // `onPayloadChange` list.
  const controller = {
    ...control.api,
    getPayload: () => store.get().payload,
    focus: () => triggerElement()?.focus(),
  } as unknown as PopupApiOf<Options>

  return {
    ...controller,
    // Internal. Used by parts and adapters: the core the features share, with
    // them and what the parts call.
    internal: Object.assign(core, features),
  }
}

/**
 * The state a popup's `api` and parts read, from the primitive's first
 * options: `open` from `open` or `defaultOpen`, `mounted`, the `trigger` that
 * opened it last, its `payload`, whether a title and a description render
 * (`titled`, `described`), the `modal` in effect and its `presentation`.
 * Spread it into `state`, with the primitive's own keys beside it.
 *
 * @example
 * state: (options: LinkPreviewOptions) => ({ ...popupState(options), href: options.href }),
 *
 * @experimental
 */
function popupState(options: { open?: boolean; defaultOpen?: boolean }) {
  const open = options.open ?? options.defaultOpen ?? false
  const state: PopupState = {
    open,
    mounted: open,
    trigger: null,
    payload: undefined,
    titled: null,
    described: false,
    modal: false,
    presentation: "popover",
  }
  return state
}

export {
  createPopup,
  type PopupCore,
  type PopupOptions,
  type PopupRules,
  type PopupState,
  popupState,
}
