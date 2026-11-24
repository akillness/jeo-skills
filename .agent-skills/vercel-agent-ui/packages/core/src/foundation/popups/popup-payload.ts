// The payload a popup's triggers hand its content. Several triggers can share
// one popup, each with a payload: one that opens the popup writes its key and
// payload, and so does one that takes the open popup over. A controller's
// `open({ payload })` on the open popup replaces it the same way.
// `onPayloadChange` hears all three. A handover opens nothing, so that
// callback is how content outside a framework, like a web component's, hears
// about it.
import type { Store } from "../kernel/store"

function createPopupPayload<Reason extends string>(
  store: Store<{ trigger: string | null; payload: unknown }>,
  // Fires `onPayloadChange` and writes the payload, unless canceled.
  change: (
    payload: unknown,
    details: { reason: Reason; event?: Event }
  ) => boolean
) {
  type Details = { reason: Reason; event?: Event }

  return {
    // Call before an open fires `onOpenChange`, so it reads the new payload.
    // Returns what puts the trigger and payload back, for an open that was canceled.
    opening(trigger: string | undefined, payload: unknown, details: Details) {
      const previous = {
        trigger: store.get().trigger,
        payload: store.get().payload,
      }
      if (trigger !== undefined) {
        store.set({ trigger })
      }
      change(payload, details)
      return () => store.set(previous)
    },
    // Another trigger takes the open popup over, with its own payload.
    handOver(trigger: string, payload: unknown, details: Details) {
      store.set({ trigger })
      change(payload, details)
    },
    // A controller opens the popup while it's open. A payload it passes
    // replaces the current one, like a handover, and the trigger key stays, as
    // when a controller opens it closed. Without a payload nothing changes.
    // Returns whether the payload changed, so the caller can move its anchor too.
    reopening(openOptions: { payload?: unknown }, details: Details) {
      return "payload" in openOptions && change(openOptions.payload, details)
    },
  }
}

export { createPopupPayload }
