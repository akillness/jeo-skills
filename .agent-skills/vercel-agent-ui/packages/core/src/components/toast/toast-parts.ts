// A toast region's parts and the attributes they carry.
import { ariaKeyshortcuts } from "../../foundation/platform/platform"
import { idPart } from "../../foundation/kernel/attrs"
import type { SlotFactory } from "../../foundation/kernel/primitive-types"
import type {
  ToastActionProps,
  ToastButtonState,
  ToastCloseProps,
  ToastRegionState,
  ToastState,
} from "./toast"
import {
  findItem,
  hasToasts,
  isExpanded,
  type ToastRegionApi,
  type ToastRegionStoreState,
} from "./toast-api"

// Renderers fill `toast` from the toast around the part, so it's set by now.
type ToastPart = { toast?: string }

const toastSlots = (
  slot: SlotFactory<ToastRegionStoreState, ToastRegionApi>
) => ({
  region: slot<{}, ToastRegionState>({
    // A landmark only while there's something in it.
    role: (state) => (hasToasts(state.items) ? "region" : undefined),
    roles: ["region"],
    attrs: (state) => {
      const open = hasToasts(state.items)
      return {
        "aria-label": open ? (state.label ?? "Notifications") : undefined,
        "aria-keyshortcuts":
          open && state.shortcut ? ariaKeyshortcuts(state.shortcut) : undefined,
        "data-side": state.side,
        "data-align": state.align,
        "data-expanded": isExpanded(state) ? "" : undefined,
      }
    },
    state: (state) => ({
      side: state.side,
      align: state.align,
      expanded: isExpanded(state),
      toasts: state.items,
    }),
    on: {
      keydown: (event, { el, api }) =>
        el && api.internal.regionKeydown(event, el),
    },
    bind: (el, { api }) => api.internal.bindRegion(el),
  }),
  list: slot({}),
  root: slot<{}, ToastState>({
    present: (state, { key }) => !!findItem(state.items, key),
    attrs: (state, { key }) => {
      const item = findItem(state.items, key)
      if (!item) {
        return {}
      }
      return {
        tabindex: "0",
        "data-type": item.toast.type,
        // A closing toast keeps it, so it leaves from where it was.
        "data-front": item.index === 0 ? "" : undefined,
        "data-expanded": isExpanded(state) ? "" : undefined,
        // Swipes are the toast's, not the page's.
        style:
          item.toast.dismissible === false ? undefined : "touch-action:none",
      }
    },
    state: (state, { key }) => {
      const item = findItem(state.items, key)
      return {
        type: item?.toast.type ?? "default",
        index: item?.index ?? 0,
        front: !!item && item.index === 0,
        expanded: isExpanded(state),
        // A part can render once more after its toast left the region.
        leaving: !item || item.leaving,
      }
    },
    on: {
      keydown: (event, { key, api }) => {
        if (event.key !== "Escape") {
          return
        }
        const toast = api.internal
          .toaster()
          .toasts()
          .find((item) => item.id === key)
        if (!toast || toast.dismissible === false) {
          return
        }
        // Handled here, so a modal dialog beneath stays open.
        event.preventDefault()
        api.internal.close(key, "escape-key", event)
      },
    },
    bind: (el, { key, api }) => api.internal.bindToast(el, key),
  }),
  title: slot({
    props: { id: { kind: "string", from: "root" } },
    attrs: (_, { id, key }) => ({ id: `${id}-${idPart(key)}-title` }),
    bind: (_, { key, api }) => {
      api.internal.label(key)
      return () => queueMicrotask(() => api.internal.label(key))
    },
  }),
  description: slot({
    props: { id: { kind: "string", from: "root" } },
    attrs: (_, { id, key }) => ({ id: `${id}-${idPart(key)}-description` }),
    bind: (_, { key, api }) => {
      api.internal.label(key)
      return () => queueMicrotask(() => api.internal.label(key))
    },
  }),
  action: slot<ToastPart & ToastActionProps, ToastButtonState>({
    props: {
      id: "id",
      toast: { kind: "string", from: "root.id" },
      onAction: "action",
      dismiss: "boolean",
    },
    attrs: (state, { key }) => buttonAttrs(state.buttons[key]),
    state: (state, { key }) => ({
      pending: !!state.buttons[key]?.pending,
      error: state.buttons[key]?.error,
    }),
    press: ({ key, props, api }, event) => {
      const action = api.internal
        .toaster()
        .toasts()
        .find((toast) => toast.id === props.toast)?.action
      api.internal.press(
        key,
        props.toast!,
        props.onAction ?? action?.onAction,
        props.dismiss ?? action?.dismiss ?? true,
        "action",
        event
      )
    },
  }),
  close: slot<ToastPart & ToastCloseProps, ToastButtonState>({
    props: {
      id: "id",
      toast: { kind: "string", from: "root.id" },
      action: "action",
    },
    attrs: (state, { key }) => buttonAttrs(state.buttons[key]),
    state: (state, { key }) => ({
      pending: !!state.buttons[key]?.pending,
      error: state.buttons[key]?.error,
    }),
    press: ({ key, props, api }, event) =>
      api.internal.press(
        key,
        props.toast!,
        props.action,
        true,
        "close-press",
        event
      ),
  }),
})

function buttonAttrs(state: ToastButtonState | undefined) {
  return {
    "data-pending": state?.pending ? "" : undefined,
    "aria-busy": state?.pending ? "true" : undefined,
    // Presses do nothing while it's pending. Not the native attribute, which would drop focus.
    "aria-disabled": state?.pending ? "true" : undefined,
  }
}

export { toastSlots }
