import { isDisabled, watchFormDisabled } from "../../foundation/forms/form"
import {
  announcePending,
  runAction,
  type ActionDetails,
} from "../../foundation/kernel/action"
import {
  buttonElement,
  buttonElementAttrs,
  buttonKeydown,
  buttonKeyup,
  buttonRole,
  type ButtonElement,
} from "../../foundation/platform/button"
import { definePrimitive } from "../../foundation/kernel/primitive"
import type {
  Named,
  PrimitiveContext,
  PrimitiveOptions,
} from "../../foundation/kernel/primitive-types"
import { log } from "../../foundation/kernel/change"
import type { ChangeSource } from "../../foundation/kernel/details"
import { inputSource } from "../../foundation/kernel/input-source"
import { sameValue } from "../../foundation/kernel/store"

/**
 * The options `button` takes. A component takes them as props on its root.
 * @stable
 */
type ButtonOptions = {
  /**
   * Stops presses. The button is natively disabled, so it leaves the tab order
   * and its form doesn't submit through it, unless `focusableWhenDisabled` is set.
   * @defaultValue false
   */
  disabled?: boolean
  /**
   * Keeps a disabled button in the tab order with `aria-disabled` instead of
   * the native attribute, so it can hold focus while it becomes disabled and
   * host a tooltip that says why. Presses still do nothing.
   * @defaultValue false
   */
  focusableWhenDisabled?: boolean
  /**
   * What a native button does in a form: `"submit"` submits it and `"reset"`
   * resets it. Ignored when the button renders as something else.
   * @defaultValue "button"
   */
  type?: "button" | "submit" | "reset"
  /**
   * What screen readers hear once the button has been pending for a second, so a slow action
   * doesn't pass in silence. Set it in the page's language. An empty string says nothing.
   * @defaultValue "Loading"
   */
  pendingAnnouncement?: string
} & PrimitiveOptions

/**
 * What a Button's action receives after the event: how the button was pressed.
 * @experimental
 */
type ButtonActionDetails = ActionDetails

/**
 * What adapters pass on top: the action a press runs, for adapters whose
 * handler isn't the element's own click listener, like web components.
 */
type ButtonInternalOptions = ButtonOptions & {
  action?: (event: Event | undefined, details: ButtonActionDetails) => unknown
}

/**
 * What `render` functions and state-based class names receive.
 * @stable
 */
type ButtonState = {
  /** Whether it's disabled, by the `disabled` option or a disabled fieldset around it. A running press shows in `pending` instead. */
  disabled: boolean
  /** Whether the Promise the last press returned is still running. Presses do nothing meanwhile. */
  pending: boolean
  /** Why the last press failed: what its handler threw, or its Promise rejected with. Cleared by the next press. */
  error: unknown
}

type State = {
  disabled: boolean
  formDisabled: boolean
  focusableWhenDisabled: boolean
  type: "button" | "submit" | "reset"
  // What the part rendered as, known once it binds.
  element: ButtonElement
  pending: boolean
  error: unknown
}

function buttonApiBody(
  context: PrimitiveContext<ButtonInternalOptions, State, string>
) {
  const { store, options } = context
  // Tracks input from the start, so the first press already knows what made it.
  const changeSource = inputSource()
  // Through `log`, so `debug` and the devtools see the action's state.
  const write = <Key extends "pending" | "error">(
    key: Key,
    value: State[Key],
    source: ChangeSource
  ) => {
    if (sameValue(store.get()[key], value)) {
      return
    }
    store.set({ [key]: value } as Partial<State>)
    log(context, key, value, { reason: "action", source })
  }
  announcePending(context, () => store.get().pending)
  return {
    internal: {
      // A press runs the action, unless the button is disabled or still pending,
      // when the press is refused: preventing the click stops a second submit
      // and a disabled link from navigating. A returned Promise makes the
      // button pending until it settles. Adapters whose framework hands the
      // handler its own event, like React, pass `action` themselves.
      press(
        event?: Event,
        action: (details: ButtonActionDetails) => unknown = (details) =>
          options().action?.(event, details)
      ) {
        const state = store.get()
        if (isDisabled(state) || state.pending) {
          return event?.preventDefault()
        }
        const source = changeSource("action", event)
        write("error", undefined, source)
        runAction(action, source, {
          pending: (pending) => write("pending", pending, source),
          done: () => {},
          failed: (error) => write("error", error, source),
        })
      },
    },
  }
}

const buttonApi: (...args: Parameters<typeof buttonApiBody>) => ButtonApi =
  buttonApiBody

/**
 * `button`'s api, which its slots and controller call. Adapters
 * expose it as `api`.
 * @stable
 */
interface ButtonApi extends ReturnType<typeof buttonApiBody> {}

const buttonPrimitive = /* @__PURE__ */ definePrimitive({
  name: "button",
  options: {
    disabled: "boolean",
    focusableWhenDisabled: "boolean",
    type: "string",
    pendingAnnouncement: "string",
    // Internal: passed by renderers.
    action: "action",
  },
  state: (options: ButtonInternalOptions): State => ({
    disabled: !!options.disabled,
    formDisabled: false,
    focusableWhenDisabled: !!options.focusableWhenDisabled,
    type: options.type ?? "button",
    element: "unknown",
    pending: false,
    error: undefined,
  }),
  sync: (options) => ({
    disabled: !!options.disabled,
    focusableWhenDisabled: !!options.focusableWhenDisabled,
    type: options.type ?? "button",
  }),
  api: (context) => buttonApi(context),
  slots: (slot) => ({
    root: slot<{}, ButtonState>({
      ...buttonRole((state: State) => state.element),
      focus: "tab-stop",
      state: (state) => ({
        disabled: isDisabled(state),
        pending: state.pending,
        error: state.error,
      }),
      attrs: (state) => ({
        ...buttonElementAttrs(state.element, {
          type: state.type,
          disabled: isDisabled(state),
          focusable: state.focusableWhenDisabled,
        }),
        // Presses do nothing while it's pending, so screen readers hear it's
        // unavailable. Not the native attribute, which would drop focus.
        ...(state.pending && !isDisabled(state) && { "aria-disabled": "true" }),
        "aria-busy": state.pending ? "true" : undefined,
        "data-disabled": isDisabled(state) ? "" : undefined,
        "data-pending": state.pending ? "" : undefined,
      }),
      press: ({ api }, event) => api.internal.press(event),
      on: {
        keydown: (event, { el }) => buttonKeydown(event, el!),
        keyup: (event, { el }) => buttonKeyup(event, el!),
      },
      bind(el, { store }) {
        store.set({ element: buttonElement(el) })
        return watchFormDisabled(el, store)
      },
    }),
  }),
})

/**
 * The type of `button`.
 * @stable
 */
interface ButtonPrimitive extends Named<typeof buttonPrimitive> {}

/**
 * The button primitive, with the slots `root`.
 * Render it with an adapter's `usePrimitive`, or compose it inside your own
 * primitive.
 * @stable
 */
const button: ButtonPrimitive = buttonPrimitive

export {
  button,
  type ButtonActionDetails,
  type ButtonApi,
  type ButtonOptions,
  type ButtonPrimitive,
  type ButtonState,
}
