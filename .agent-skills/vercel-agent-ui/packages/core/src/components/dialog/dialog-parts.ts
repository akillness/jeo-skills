// The parts Dialog, Alert Dialog and Drawer share. Each primitive spreads
// them into its own `slots`, and overrides the ones that differ.
import { dev, warn } from "#dev"
import { trackKeyboard } from "../../foundation/platform/keyboard"
import { ariaKeyshortcuts } from "../../foundation/platform/platform"
import { popupContentAttrs } from "../../foundation/popups/popup"
import {
  ownsEvent,
  registerPopupElement,
} from "../../foundation/popups/popup-elements"
import {
  bindPopupContent,
  popupDescription,
  popupTitle,
  popupTrigger,
} from "../../foundation/popups/popup-slots"
import { settleFlag } from "../../foundation/kernel/bound-keys"
import { openAttrs } from "../../foundation/kernel/attrs"
import type { SlotFactory } from "../../foundation/kernel/primitive-types"
import {
  adoptPlatform,
  bindPartShortcut,
  shortcutSlot,
} from "../../foundation/shortcuts/shortcut-slot"
import { ownContent, type DialogApi, type DialogState } from "./dialog-api"
import type {
  DialogBackdropState,
  DialogCloseProps,
  DialogCloseState,
  DialogContentProps,
  DialogContentState,
  DialogTriggerProps,
  DialogTriggerState,
} from "./dialog"
import { onProps } from "../../foundation/kernel/part"

type TriggerProps = Omit<DialogTriggerProps, "controller">
type ContentProps = DialogContentProps
type CloseProps = DialogCloseProps

function dialogSlots(
  slot: SlotFactory<DialogState, DialogApi>,
  { name }: { name: string }
) {
  const trigger = popupTrigger(slot)
  return {
    // A popup trigger whose `shortcut` presses it. A modal dialog's trigger
    // is inert while it's open, and "collapsed" once it closes says nothing
    // useful, so it leaves `aria-expanded` out. A non-modal one keeps it, and
    // so does one that only traps focus, since the page still takes presses.
    trigger: slot<TriggerProps, DialogTriggerState>({
      props: {
        id: "id",
        disabled: "boolean",
        focusableWhenDisabled: "boolean",
        payload: "value",
        shortcut: "string",
      },
      state: trigger.state,
      attrs: (state, part) => ({
        ...trigger.attrs!(state, part),
        ...(state.modal === true && { "aria-expanded": undefined }),
        "aria-keyshortcuts": part.props.shortcut
          ? ariaKeyshortcuts(part.props.shortcut, state.apple)
          : undefined,
      }),
      on: trigger.on,
      press: trigger.press,
      bind(el, part) {
        const { key, store, api } = part
        const unbind = trigger.bind!(el, part)
        adoptPlatform(store)
        // The trigger's own layer scopes it: on the page, a modal dialog pauses it.
        const offShortcut = bindPartShortcut(
          () => part.props.shortcut,
          (event) => api.internal.shortcutPress(key, event),
          { layer: el },
          (listener) => onProps(part, listener)
        )
        return () => {
          offShortcut()
          unbind?.()
        }
      },
    }),

    backdrop: slot<{}, DialogBackdropState>({
      state: (state) => ({
        open: state.open,
        nested: state.nested,
        nestedOpen: state.stack > 0,
      }),
      // Kept mounted with the content, so both show together.
      present: (state, { api }) =>
        state.mounted || !!api.internal.contentProps().keepMounted,
      role: "presentation",
      attrs: (state) => ({
        hidden: state.mounted ? undefined : "",
        ...openAttrs(state.open),
        "data-nested": state.nested ? "" : undefined,
        "data-nested-open": state.stack > 0 ? "" : undefined,
      }),
      bind(el, { api }) {
        api.internal.preset.resetStyles?.bind(el)
        return api.internal.popup.backdrop(el)
      },
    }),

    content: slot<ContentProps, DialogContentState>({
      props: {
        container: "value",
        initialFocus: "string",
        finalFocus: "string",
        keepMounted: "boolean",
        inline: "boolean",
      },
      connect: registerPopupElement,
      role: (state, { api }) => api.internal.role,
      roles: ["dialog", "alertdialog"],
      state: (state) => ({
        open: state.open,
        modal: state.modal,
        nested: state.nested,
        nestedOpen: state.stack > 0,
        stack: state.stack,
        payload: state.payload,
        pending: state.pending !== null,
        presentation: state.presentation,
      }),
      present: (state, { props }) => state.mounted || !!props.keepMounted,
      attrs: (state, { id, api }) => ({
        ...popupContentAttrs(state, id),
        ...api.internal.triggerName?.contentAttrs(state, id),
        "aria-describedby": state.described ? `${id}-description` : undefined,
        "data-nested": state.nested ? "" : undefined,
        "data-nested-open": state.stack > 0 ? "" : undefined,
        // Only a dialog presents, so only a dialog says how.
        "data-presentation": api.internal.presentation && state.presentation,
      }),
      on: {
        keydown(event, { api, el }) {
          // Keys from a dialog or drawer nested inside bubble through this one. Only the owner handles them.
          if (ownsEvent(el!, event, ownContent)) {
            api.internal.popup.keydown(event)
          }
        },
      },
      bind(el, { api, store, id, key }) {
        // How many dialogs are open above this one, for stacked styles.
        const stack = () =>
          el.style.setProperty("--dialog-stack", String(store.get().stack))
        stack()
        const offStack = store.subscribe(stack)
        if (dev && el.parentElement?.closest("form")) {
          warn(
            "The content renders inside a form, which nests forms. Pass `container` to render it elsewhere.",
            { component: name, id }
          )
        }
        const unbind = bindPopupContent(el, api.internal, key)
        settleFlag(store, "titled")
        // How much the on-screen keyboard covers, so the dialog can move above it. A sheet follows it itself.
        const offKeyboard =
          store.get().presentation === "sheet" ? undefined : trackKeyboard(el)
        return () => {
          offStack()
          offKeyboard?.()
          unbind()
          el.style.removeProperty("--dialog-stack")
        }
      },
    }),

    title: popupTitle(slot),
    description: popupDescription(slot),

    close: slot<CloseProps, DialogCloseState>({
      props: { id: "id", value: "string", action: "action" },
      state: (state, { key }) => ({
        pending: state.pending === key,
        error: state.errors[key],
      }),
      attrs: (state, { key }) => {
        const blocked = state.pending !== null && state.pending !== key
        return {
          type: "button",
          "data-pending": state.pending === key ? "" : undefined,
          "aria-busy": state.pending === key ? "true" : undefined,
          // Presses on every Close part do nothing while one is pending. Not the
          // native attribute, which would drop focus.
          "aria-disabled": state.pending !== null ? "true" : undefined,
          "data-disabled": blocked ? "" : undefined,
        }
      },
      press: ({ api, key, props }, event) =>
        api.internal.closePress(key, props, event),
    }),

    // Without keys of its own, it shows the shortcut of the trigger it sits in.
    shortcut: shortcutSlot(
      slot,
      (_state, api, el) => el && api.internal.shortcutOf(el)
    ),
  }
}

export { dialogSlots }
